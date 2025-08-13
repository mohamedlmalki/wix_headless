// functions/api/headless-start-delete-job.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Helper to get detailed error messages from a failed API response
async function getErrorDetails(response) {
    try {
        const parsed = await response.json();
        // Look for a nested message which is common in Wix API errors
        return parsed.message || JSON.stringify(parsed);
    } catch (e) {
        // If the response is not JSON, return the raw text
        return response.text();
    }
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
            const memberChunks = chunkArray(membersToDelete, 100);
            const totalSteps = memberChunks.length;
            
            // Set the initial state
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({
                status: 'running',
                processed: 0,
                total: totalSteps,
                step: `Initializing deletion job...`
            }));
            await delay(1000); // Give frontend a moment to catch up

            for (let i = 0; i < memberChunks.length; i++) {
                const chunk = memberChunks[i];
                const currentChunkNumber = i + 1;
                const stepsCompleted = i + 1;

                // Update status before processing the chunk
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
                        const response = await fetch('https://www.wixapis.com/members/v1/members/bulk/delete', {
                            method: 'POST',
                            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ "memberIds": memberIdsInChunk })
                        });

                        // **CRITICAL FIX**: Check if the API call was successful
                        if (!response.ok) {
                            const errorDetails = await getErrorDetails(response);
                            throw new Error(`API Error on batch ${currentChunkNumber}: ${errorDetails}`);
                        }

                    } catch (e) {
                        // If any chunk fails, stop the job and report the error
                        const errorState = {
                            status: 'error',
                            processed: stepsCompleted,
                            total: totalSteps,
                            step: `Job failed on batch ${currentChunkNumber}. Reason: ${e.message}`
                        };
                        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(errorState));
                        console.error("Halting job due to error:", e.message);
                        return; // Stop the entire background process
                    }
                }
                
                await delay(1000); // Wait 1 second before the next chunk
            }

            // If all chunks succeed, mark as complete
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({
                status: 'complete',
                processed: totalSteps,
                total: totalSteps,
                step: 'All members successfully deleted!'
            }));
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