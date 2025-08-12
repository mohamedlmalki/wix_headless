// functions/api/headless-start-delete-job.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    if (!response.ok) throw new Error('Failed to get Wix job status.');
    
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
                // STEP 1: Bulk Delete Members
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'running', processed: 0, total: 2, step: 'Deleting Members...' }));

                const memberIds = membersToDelete.map(m => m.memberId);
                const memberDeleteRes = await fetch('https://www.wixapis.com/members/v1/members/bulk/delete', {
                    method: 'POST',
                    headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ memberIds })
                });

                if (!memberDeleteRes.ok) throw new Error('Failed to bulk delete members.');

                // STEP 2: Start Bulk Contact Deletion Job
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'running', processed: 1, total: 2, step: 'Deleting Contacts...' }));
                
                const contactEmails = membersToDelete.map(m => m.emailAddress).filter(Boolean);
                if (contactEmails.length > 0) {
                    const contactDeleteRes = await fetch('https://www.wixapis.com/contacts/v4/bulk/contacts/delete', {
                        method: 'POST',
                        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filter: { "info.emails.email": { "$in": contactEmails } } })
                    });
                    
                    if (!contactDeleteRes.ok) throw new Error('Failed to start bulk contact deletion job.');
                    
                    const { jobId } = await contactDeleteRes.json();
                    
                    // STEP 3: Monitor the Contact Deletion Job
                    const finalStatus = await pollWixJobStatus(jobId, project);
                    if (finalStatus !== 'COMPLETED') throw new Error(`Contact deletion job finished with status: ${finalStatus}`);
                }

                // FINAL STEP: Mark job as complete
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'complete', processed: 2, total: 2, step: 'Done!' }));

            } catch (error) {
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'stuck', error: error.message }));
            }
        };
        
        // Start the background task without waiting for it to finish
        context.waitUntil(doBulkDeletion());

        // Immediately respond to the frontend that the job has started
        return new Response(JSON.stringify({ success: true, message: "Bulk deletion job started." }), {
            status: 202, // Accepted
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), { status: 500 });
    }
}