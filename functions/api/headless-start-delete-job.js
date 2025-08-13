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
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });

        // This function will run in the background
        const doBulkDeletion = async () => {
            // Each chunk is now just one step
            const memberChunks = chunkArray(membersToDelete, 100); 
            const totalSteps = memberChunks.length;
            let stepsCompleted = 0;

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
                    try {
                        await fetch('https://www.wixapis.com/members/v1/members/bulk/delete', {
                            method: 'POST',
                            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ "memberIds": memberIdsInChunk })
                        });
                    } catch (e) {
                        // Log the error but continue the process
                        console.error(`Member bulk delete for chunk ${currentChunkNumber} failed:`, e.message);
                    }
                }
                
                // Wait 1 second before processing the next chunk
                await delay(1000); 
            }

            // Mark the job as complete
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'complete', processed: totalSteps, total: totalSteps, step: 'Member deletion complete!' }));
        };
        
        context.waitUntil(doBulkDeletion());

        return new Response(JSON.stringify({ success: true, message: "Bulk member deletion job started." }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ message: 'An error occurred during job initialization.', error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}