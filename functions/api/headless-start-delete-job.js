// functions/api/headless-start-delete-job.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to break an array into smaller chunks
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Helper to safely get error details from a response
async function getErrorDetails(response) {
    const errorText = await response.text();
    try {
        return JSON.stringify(JSON.parse(errorText));
    } catch (e) {
        return errorText || "No additional error details were provided by the API.";
    }
}

// This function will check the status of a bulk job from Wix
async function pollWixJobStatus(jobId, project) {
  const wixApiUrl = `https://www.wixapis.com/jobs/v1/jobs/${jobId}`;
  let job, jobStatus = 'IN_PROGRESS';

  while (jobStatus === 'IN_PROGRESS' || jobStatus === 'ACCEPTED') {
    await delay(3000);
    
    const response = await fetch(wixApiUrl, {
      method: 'GET',
      headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
    });
    
    if (response.status === 404) {
        console.log(`Job ${jobId} finished and was not found (404), assuming completion.`);
        return { status: 'COMPLETED' };
    }
    
    if (!response.ok) {
        const errorDetails = await getErrorDetails(response);
        throw new Error(`Polling failed for job ${jobId}. API responded with status ${response.status}: ${errorDetails}`);
    }
    
    const data = await response.json();
    job = data.job;
    jobStatus = job.status;
  }
  return job;
}


export async function onRequestPost(context) {
    const { request, env } = context;
    const { siteId, membersToDelete } = await request.json();
    const jobKey = `delete_job_${siteId}`;

    try {
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });

        const doBulkDeletion = async () => {
            let currentState = {};
            try {
                const memberIds = membersToDelete.map(m => m.memberId);
                const contactEmails = membersToDelete.map(m => m.emailAddress).filter(Boolean);
                
                const memberIdChunks = chunkArray(memberIds, 100);
                const contactEmailChunks = chunkArray(contactEmails, 100);
                
                const totalSteps = memberIdChunks.length + contactEmailChunks.length;
                let stepsCompleted = 0;

                // --- STEP 1: Bulk Delete All Member Chunks using the FILTER method ---
                for (let i = 0; i < memberIdChunks.length; i++) {
                    stepsCompleted++;
                    currentState = { status: 'running', processed: stepsCompleted, total: totalSteps, step: `Deleting member batch ${i + 1} of ${memberIdChunks.length}` };
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));
                    
                    const chunk = memberIdChunks[i];
                    const memberDeleteRes = await fetch('https://www.wixapis.com/members/v1/members/bulk/delete-by-filter', {
                        method: 'POST',
                        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filter: { "_id": { "$in": chunk } } })
                    });
                    
                    if (!memberDeleteRes.ok) {
                        const errorDetails = await getErrorDetails(memberDeleteRes);
                        throw new Error(`Failed on member batch ${i + 1}. API responded with status ${memberDeleteRes.status}: ${errorDetails}`);
                    }
                }

                // ★ FIX: Increased delay to 3 seconds as requested
                currentState = { ...currentState, step: `Finalizing member deletion... (waiting 3s)` };
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));
                await delay(3000);

                // --- STEP 2: Bulk Delete All Contact Chunks ---
                for (let i = 0; i < contactEmailChunks.length; i++) {
                    stepsCompleted++;
                    currentState = { status: 'running', processed: stepsCompleted, total: totalSteps, step: `Deleting contact batch ${i + 1} of ${contactEmailChunks.length}` };
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));

                    const contactDeleteRes = await fetch('https://www.wixapis.com/contacts/v4/bulk/contacts/delete', {
                        method: 'POST',
                        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filter: { "info.emails.email": { "$in": contactEmailChunks[i] } } })
                    });
                    
                    if (!contactDeleteRes.ok) {
                        const errorDetails = await getErrorDetails(contactDeleteRes);
                        throw new Error(`Failed to start contact job for batch ${i + 1}. API responded with status ${contactDeleteRes.status}: ${errorDetails}`);
                    }
                    
                    const { jobId } = await contactDeleteRes.json();
                    const finalJob = await pollWixJobStatus(jobId, project);

                    if (finalJob.status !== 'COMPLETED') {
                        const resultDetails = finalJob.result ? JSON.stringify(finalJob.result) : "No details available."
                        throw new Error(`Contact deletion job for batch ${i + 1} finished with status: ${finalJob.status}. Details: ${resultDetails}`);
                    }
                }

                // --- FINAL STEP: Mark job as complete ---
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'complete', processed: totalSteps, total: totalSteps, step: 'Done!' }));

            } catch (error) {
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ ...currentState, status: 'stuck', error: error.message }));
            }
        };
        
        context.waitUntil(doBulkDeletion());

        return new Response(JSON.stringify({ success: true, message: "Bulk deletion job started." }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), { status: 500 });
    }
}