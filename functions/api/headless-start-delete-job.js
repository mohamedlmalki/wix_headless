// functions/api/headless-start-delete-job.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to chunk an array into smaller arrays of a specific size
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Helper to get detailed error messages from the Wix API response
async function getErrorDetails(response) {
    const errorText = await response.text();
    try {
        const parsed = JSON.parse(errorText);
        return parsed.message || JSON.stringify(parsed);
    } catch (e) {
        return errorText || "No additional error details were provided by the API.";
    }
}

// Helper to poll the status of an asynchronous job from Wix
async function pollWixJobStatus(jobId, project) {
  const wixApiUrl = `https://www.wixapis.com/jobs/v1/jobs/${jobId}`;
  let job, jobStatus = 'IN_PROGRESS';

  while (jobStatus === 'IN_PROGRESS' || jobStatus === 'ACCEPTED') {
    await delay(3000); // Wait 3 seconds before checking status
    
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
                const contactIds = membersToDelete.map(m => m.contactId);
                
                const memberIdChunks = chunkArray(memberIds, 100);
                const totalSteps = memberIdChunks.length + 1;

                // --- STEP 1: Convert Members to Contacts in Batches of 100 ---
                for (let i = 0; i < memberIdChunks.length; i++) {
                    currentState = { status: 'running', processed: i + 1, total: totalSteps, step: `Converting member batch ${i + 1} of ${memberIdChunks.length}...` };
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));

                    const convertResponse = await fetch('https://www.wixapis.com/members/v1/members/bulk/convert', {
                        method: 'POST',
                        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ "memberIds": memberIdChunks[i] })
                    });

                    if (!convertResponse.ok) {
                        const errorDetails = await getErrorDetails(convertResponse);
                        throw new Error(`Failed to convert members in batch ${i + 1}. Status: ${convertResponse.status}: ${errorDetails}`);
                    }
                }
                
                // --- STEP 2: Start a SINGLE Bulk Job to Delete All Contacts ---
                currentState = { status: 'running', processed: totalSteps, total: totalSteps, step: `Starting bulk deletion of ${contactIds.length} contacts...` };
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));
                
                const contactDeleteRes = await fetch('https://www.wixapis.com/contacts/v4/bulk/contacts/delete', {
                    method: 'POST',
                    headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filter: { "_id": { "$in": contactIds } } })
                });
                
                if (!contactDeleteRes.ok) {
                    const errorDetails = await getErrorDetails(contactDeleteRes);
                    throw new Error(`Failed to start contact deletion job. Status: ${contactDeleteRes.status}: ${errorDetails}`);
                }
                
                const { jobId } = await contactDeleteRes.json();
                const finalJob = await pollWixJobStatus(jobId, project);

                if (finalJob.status !== 'COMPLETED') {
                    const resultDetails = finalJob.result ? JSON.stringify(finalJob.result) : "No details available."
                    throw new Error(`Contact deletion job finished with status: ${finalJob.status}. Details: ${resultDetails}`);
                }
                
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