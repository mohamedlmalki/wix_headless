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
        return response.text();
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { siteId, membersToDelete } = await request.json();
        const jobKey = `delete_job_${siteId}`;

        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });

        const doBulkDeletion = async () => {
            let currentState = {};
            const totalMembers = membersToDelete.length;
            
            const memberChunks = chunkArray(membersToDelete, 100);
            const totalSteps = memberChunks.length * 2;
            let stepsCompleted = 0;

            for (let i = 0; i < memberChunks.length; i++) {
                const chunk = memberChunks[i];
                const currentChunkNumber = i + 1;

                // --- STEP 1: Delete Members ---
                stepsCompleted++;
                currentState = { status: 'running', processed: stepsCompleted, total: totalSteps, step: `Deleting members: Batch ${currentChunkNumber} of ${memberChunks.length}...` };
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));

                const validMembers = chunk.filter(m => m && m.memberId);
                const memberDeletePromises = validMembers.map(member => {
                    const memberApiUrl = `https://www.wixapis.com/members/v1/members/${member.memberId}`;
                    return fetch(memberApiUrl, {
                        method: 'DELETE',
                        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                    });
                });
                if (memberDeletePromises.length > 0) await Promise.allSettled(memberDeletePromises);
                
                // --- Wait for 1 second ---
                await delay(1000);

                // --- STEP 2: Delete Contacts ---
                stepsCompleted++;
                currentState = { status: 'running', processed: stepsCompleted, total: totalSteps, step: `Deleting contacts: Batch ${currentChunkNumber} of ${memberChunks.length}...` };
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));
                
                const validContacts = chunk.filter(m => m && m.contactId);
                const contactDeletePromises = validContacts.map(member => {
                     const contactApiUrl = `https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`;
                     return fetch(contactApiUrl, {
                         method: 'DELETE',
                         headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                     });
                });
                if (contactDeletePromises.length > 0) await Promise.allSettled(contactDeletePromises);
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