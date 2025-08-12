import headlessProjects from '../../src/headless/config/headless-config.json';

// This function runs in the background to delete members and track progress
async function startDeletionProcess(project, membersToDelete, jobsKV) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const total = membersToDelete.length;
  const jobId = `delete-${project.siteId}`;

  for (let i = 0; i < total; i++) {
    const member = membersToDelete[i];
    const progress = {
      jobId: jobId,
      status: 'running',
      processed: i + 1,
      total: total,
      timestamp: Date.now()
    };
    
    // Update the progress in the KV store
    await jobsKV.put(jobId, JSON.stringify(progress));

    try {
      // Step 1: Delete Member
      const memberApiUrl = `https://www.wixapis.com/members/v1/members/${member.memberId}`;
      await fetch(memberApiUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': project.apiKey,
          'wix-site-id': project.siteId,
        }
      });

      await sleep(500);

      // Step 2: Delete Contact
      const contactApiUrl = `https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`;
      await fetch(contactApiUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': project.apiKey,
          'wix-site-id': project.siteId,
        }
      });
    } catch (error) {
      console.error(`Failed to delete member ${member.memberId}:`, error);
    }
  }

  // Mark the job as complete
  const finalStatus = { jobId: jobId, status: 'complete', processed: total, total: total, timestamp: Date.now() };
  await jobsKV.put(jobId, JSON.stringify(finalStatus));
}

// This is the main function that responds to the frontend
// The main function that handles the entire deletion process
export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { siteId, membersToDelete } = await request.json();

        // 1. Get the project config to find the API key
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) {
            return new Response(JSON.stringify({ message: `Project configuration not found for siteId: ${siteId}` }), { status: 404 });
        }
        
        const jobKey = `delete_job_${siteId}`;

        const doDeletion = async () => {
            // Initialize the job status, including an error field
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({
                status: 'running',
                processed: 0,
                total: membersToDelete.length,
                error: null 
            }));

            let processedCount = 0;
            for (const member of membersToDelete) {
                const deleteMemberResponse = await fetch(`https://www.wixapis.com/members/v1/members/${member.memberId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': project.apiKey,
                        'wix-site-id': project.siteId,
                    }
                });

                // Check specifically for the "Too Many Requests" error status
                if (deleteMemberResponse.status === 429) {
                    const errorDetails = await deleteMemberResponse.json();
                    // Update the job status in KV with a specific "stuck" status and error message
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({
                        status: 'stuck', 
                        processed: processedCount,
                        total: membersToDelete.length,
                        error: `Rate limit hit. Wix API says: ${errorDetails.message || 'Too Many Requests'}. Job stuck at ${processedCount} of ${membersToDelete.length}.`
                    }));
                    return; // Stop the deletion process
                }

                // Also delete the associated contact if a contactId is provided
                if (member.contactId) {
                    await fetch(`https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': project.apiKey }
                    });
                }
                
                processedCount++;
                // Update the progress in KV storage
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({
                    status: 'running',
                    processed: processedCount,
                    total: membersToDelete.length,
                    error: null
                }));
            }
            
            // If the loop completes without errors, mark the job as complete
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({
                status: 'complete',
                processed: processedCount,
                total: membersToDelete.length,
                error: null
            }));
        };

        // Run the deletion task in the background
        context.waitUntil(doDeletion());

        // Return an immediate success response to the user
        return new Response(JSON.stringify({ success: true, message: "Deletion job started successfully." }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}