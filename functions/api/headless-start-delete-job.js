// functions/api/headless-start-delete-job.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function getErrorDetails(response) {
    try {
        const parsed = await response.json();
        // Wix permission errors often have a 'message' field
        if (parsed.message) {
            return `Wix API Error: ${parsed.message}`;
        }
        return `A non-JSON error occurred: ${response.statusText}`;
    } catch (e) {
        return `Could not parse error response. Status: ${response.statusText}`;
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
            
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({
                status: 'running', processed: 0, total: totalSteps, step: `Initializing deletion job...`
            }));
            await delay(500);

            for (let i = 0; i < memberChunks.length; i++) {
                const chunk = memberChunks[i];
                const currentChunkNumber = i + 1;
                const stepsCompleted = i + 1;

                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({
                    status: 'running', processed: stepsCompleted, total: totalSteps, step: `Step ${stepsCompleted}/${totalSteps}: Deleting member batch ${currentChunkNumber}...`
                }));

                const memberIdsInChunk = chunk.map(m => m.memberId).filter(Boolean);

                if (memberIdsInChunk.length > 0) {
                    try {
                        const response = await fetch('https://www.wixapis.com/members/v1/members/bulk/delete', {
                            method: 'POST',
                            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ "memberIds": memberIdsInChunk })
                        });

                        if (!response.ok) {
                            // This is the critical check. If the API returns an error, we stop.
                            const errorDetails = await getErrorDetails(response);
                            throw new Error(`Permission Denied or API Error on batch ${currentChunkNumber}. Please check your API Key permissions. Details: ${errorDetails}`);
                        }

                    } catch (e) {
                        const errorState = {
                            status: 'error',
                            processed: stepsCompleted,
                            total: totalSteps,
                            step: e.message
                        };
                        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(errorState));
                        console.error("Halting job due to error:", e.message);
                        return; // Stop the entire background process
                    }
                }
                
                await delay(1000); // Wait 1 second before the next chunk
            }

            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({
                status: 'complete', processed: totalSteps, total: totalSteps, step: 'All members successfully deleted!'
            }));
        };
        
        context.waitUntil(doBulkDeletion());

        return new Response(JSON.stringify({ success: true, message: "Bulk member deletion job started." }), {
            status: 202, headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ message: 'An error occurred during job initialization.', error: e.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
        });
    }
}