// functions/api/headless-start-delete-job.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to break a large array into smaller chunks
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const { siteId, membersToDelete } = await request.json();
    const jobKey = `delete_job_${siteId}`;

    try {
        // --- 1. Project Configuration ---
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) {
            return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });
        }

        // --- 2. Background Job Logic ---
        // This function will run in the background after the initial response is sent
        const doBulkDeletion = async () => {
            const memberChunks = chunkArray(membersToDelete, 100); // Batches of 100
            const totalSteps = memberChunks.length * 2; // Each chunk has two steps: delete members, delete contacts
            let stepsCompleted = 0;

            // Loop through each chunk of 100 members
            for (let i = 0; i < memberChunks.length; i++) {
                const chunk = memberChunks[i];
                const currentChunkNumber = i + 1;

                // --- STEP 1: Bulk Delete Members in the current chunk ---
                stepsCompleted++;
                let currentState = { 
                    status: 'running', 
                    processed: stepsCompleted, 
                    total: totalSteps, 
                    step: `Step ${stepsCompleted}/${totalSteps}: Deleting member batch ${currentChunkNumber} of ${memberChunks.length}...` 
                };
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));

                const memberIdsInChunk = chunk.map(m => m.memberId).filter(Boolean);
                if (memberIdsInChunk.length > 0) {
                    await fetch('https://www.wixapis.com/members/v1/members/bulk/delete', {
                        method: 'POST',
                        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ "memberIds": memberIdsInChunk })
                    });
                }
                
                // --- Wait for 1 second as requested ---
                await delay(1000);

                // --- STEP 2: Delete Contacts for the same chunk ---
                stepsCompleted++;
                currentState = { 
                    status: 'running', 
                    processed: stepsCompleted, 
                    total: totalSteps, 
                    step: `Step ${stepsCompleted}/${totalSteps}: Deleting contact batch ${currentChunkNumber} of ${memberChunks.length}...` 
                };
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));
                
                const contactIdsInChunk = chunk.map(m => m.contactId).filter(Boolean);
                if (contactIdsInChunk.length > 0) {
                    // Create all delete promises for the current chunk's contacts
                    const contactDeletePromises = contactIdsInChunk.map(contactId => {
                         const contactApiUrl = `https://www.wixapis.com/contacts/v4/contacts/${contactId}`;
                         return fetch(contactApiUrl, {
                             method: 'DELETE',
                             headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                         });
                    });
                    // Wait for all contact deletions in this chunk to complete before the next big step
                    await Promise.allSettled(contactDeletePromises);
                }
            }

            // --- Final Step: Mark the job as complete ---
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'complete', processed: totalSteps, total: totalSteps, step: 'Done!' }));
        };
        
        // Tell the Cloudflare Worker to run the deletion process in the background
        context.waitUntil(doBulkDeletion());

        // --- 3. Immediate Response ---
        // Immediately tell the frontend that the job has started
        return new Response(JSON.stringify({ success: true, message: "Bulk deletion job started." }), {
            status: 202, // 202 Accepted: The request has been accepted for processing, but the processing has not been completed.
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ message: 'An error occurred during job initialization.', error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}