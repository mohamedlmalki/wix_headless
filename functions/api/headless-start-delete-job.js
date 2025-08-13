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
        return parsed.message || JSON.stringify(parsed);
    } catch (e) {
        return await response.text();
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
            const memberChunks = chunkArray(membersToDelete, 100); // Main batches of 100
            const totalSteps = memberChunks.length * 2;
            let stepsCompleted = 0;

            for (let i = 0; i < memberChunks.length; i++) {
                const chunk = memberChunks[i];
                const currentChunkNumber = i + 1;

                // --- STEP 1: Bulk Delete Members ---
                stepsCompleted++;
                let currentState = { status: 'running', processed: stepsCompleted, total: totalSteps, step: `Step ${stepsCompleted}/${totalSteps}: Deleting member batch ${currentChunkNumber} of ${memberChunks.length}...` };
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));

                const memberIdsInChunk = chunk.map(m => m.memberId).filter(Boolean);

                if (memberIdsInChunk.length > 0) {
                    await fetch('https://www.wixapis.com/members/v1/members/bulk/delete', {
                        method: 'POST',
                        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ "memberIds": memberIdsInChunk })
                    }).catch(e => console.error('Member bulk delete failed:', e.message));
                }
                
                await delay(1000); // Wait 1 second as per requirement

                // --- STEP 2: Delete Contacts in smaller parallel sub-batches ---
                stepsCompleted++;
                currentState = { status: 'running', processed: stepsCompleted, total: totalSteps, step: `Step ${stepsCompleted}/${totalSteps}: Deleting contact batch ${currentChunkNumber} of ${memberChunks.length}...` };
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));
                
                const contactIdsInChunk = chunk.map(m => m.contactId).filter(Boolean);
                
                // Process contacts in smaller parallel chunks (e.g., 10 at a time) to avoid server limits
                const smallerContactChunks = chunkArray(contactIdsInChunk, 10); 
                for (const contactChunk of smallerContactChunks) {
                     if (contactChunk.length > 0) {
                        const contactDeletePromises = contactChunk.map(contactId => {
                             const contactApiUrl = `https://www.wixapis.com/contacts/v4/contacts/${contactId}`;
                             return fetch(contactApiUrl, {
                                 method: 'DELETE',
                                 headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                             });
                        });
                        await Promise.allSettled(contactDeletePromises);
                     }
                }
            }

            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'complete', processed: totalSteps, total: totalSteps, step: 'Done!' }));
        };
        
        context.waitUntil(doBulkDeletion());

        return new Response(JSON.stringify({ success: true, message: "Bulk deletion job started." }), {
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