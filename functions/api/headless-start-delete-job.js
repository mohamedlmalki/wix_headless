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

// This function will check the status of a bulk job initiated on Wix's side.
async function pollWixJobStatus(jobId, project) {
  const wixApiUrl = `https://www.wixapis.com/jobs/v1/jobs/${jobId}`;
  let jobStatus = 'IN_PROGRESS';

  while (jobStatus === 'IN_PROGRESS' || jobStatus === 'ACCEPTED') {
    await delay(2000); // Wait 2 seconds before checking status
    const response = await fetch(wixApiUrl, {
      method: 'GET',
      headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
    });
    if (!response.ok) {
        const errorDetails = await response.json();
        throw new Error(`Failed to get Wix job status. Wix API responded with: ${JSON.stringify(errorDetails)}`);
    }
    const data = await response.json();
    jobStatus = data.status;
  }
  return jobStatus;
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

        // This is the background task that will run.
        const doBulkDeletion = async () => {
            try {
                const memberIds = membersToDelete.map(m => m.memberId);
                const contactEmails = membersToDelete.map(m => m.emailAddress).filter(Boolean);

                // ★ FIX: Chunk the arrays into batches of 100
                const memberIdChunks = chunkArray(memberIds, 100);
                const contactEmailChunks = chunkArray(contactEmails, 100);
                
                const totalSteps = memberIdChunks.length + contactEmailChunks.length;
                let stepsCompleted = 0;

                // STEP 1: Bulk Delete Members in chunks
                for (const chunk of memberIdChunks) {
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'running', processed: stepsCompleted, total: totalSteps, step: `Deleting member batch ${stepsCompleted + 1} of ${totalSteps}...` }));
                    
                    const memberDeleteRes = await fetch('https://www.wixapis.com/members/v1/members/bulk/delete', {
                        method: 'POST',
                        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ memberIds: chunk })
                    });
                    
                    if (!memberDeleteRes.ok) {
                        const errorDetails = await memberDeleteRes.json();
                        throw new Error(`Failed to bulk delete members. Wix API responded with: ${JSON.stringify(errorDetails)}`);
                    }
                    stepsCompleted++;
                }

                // STEP 2: Bulk Delete Contacts in chunks
                for (const chunk of contactEmailChunks) {
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'running', processed: stepsCompleted, total: totalSteps, step: `Deleting contact batch ${stepsCompleted + 1} of ${totalSteps}...` }));

                    const contactDeleteRes = await fetch('https://www.wixapis.com/contacts/v4/bulk/contacts/delete', {
                        method: 'POST',
                        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filter: { "info.emails.email": { "$in": chunk } } })
                    });
                    
                    if (!contactDeleteRes.ok) {
                        const errorDetails = await contactDeleteRes.json();
                        throw new Error(`Failed to start bulk contact deletion job. Wix API responded with: ${JSON.stringify(errorDetails)}`);
                    }
                    
                    const { jobId } = await contactDeleteRes.json();
                    const finalStatus = await pollWixJobStatus(jobId, project);
                    if (finalStatus !== 'COMPLETED') throw new Error(`Contact deletion job finished with status: ${finalStatus}`);
                    stepsCompleted++;
                }

                // FINAL STEP: Mark job as complete
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'complete', processed: stepsCompleted, total: totalSteps, step: 'Done!' }));

            } catch (error) {
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'stuck', error: error.message }));
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