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

export async function onRequestPost(context) {
    const { request, env } = context;
    const { siteId, membersToDelete } = await request.json();
    const jobKey = `delete_job_${siteId}`;

    try {
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });

        // functions/api/headless-start-delete-job.js

const doBulkDeletion = async () => {
    let currentState = {};
    const totalMembers = membersToDelete.length;
    
    // Chunk all members into batches of 100
    const memberChunks = chunkArray(membersToDelete, 100);
    const totalSteps = memberChunks.length * 2; // Each chunk has two steps
    let stepsCompleted = 0;

    for (const chunk of memberChunks) {
        const contactIdsInChunk = chunk.map(m => m.contactId);

        // --- STEP 1: Delete a batch of up to 100 Members in parallel ---
        stepsCompleted++;
        currentState = { status: 'running', processed: stepsCompleted, total: totalSteps, step: `Deleting member batch...` };
        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));

        // Create an array of delete promises for each member in the chunk
        const memberDeletePromises = chunk.map(member => {
            const memberApiUrl = `https://www.wixapis.com/members/v1/members/${member.memberId}`;
            return fetch(memberApiUrl, {
                method: 'DELETE',
                headers: {
                    'Authorization': project.apiKey,
                    'wix-site-id': project.siteId,
                }
            });
        });

        // Execute all member deletions for the current chunk in parallel
        const results = await Promise.allSettled(memberDeletePromises);

        // Optional: Check for failures if you need more robust error handling
        const failedDeletions = results.filter(r => r.status === 'rejected');
        if (failedDeletions.length > 0) {
            console.error(`Failed to delete ${failedDeletions.length} members in a batch.`);
        }
        
        // --- Wait for 1 second as requested ---
        await delay(1000);

        // --- STEP 2: Bulk Delete the corresponding Contacts for that batch ---
        stepsCompleted++;
        currentState = { status: 'running', processed: stepsCompleted, total: totalSteps, step: `Deleting contact batch...` };
        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));
        
        const contactDeleteRes = await fetch('https://www.wixapis.com/contacts/v4/bulk/contacts/delete', {
            method: 'POST',
            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
            body: JSON.stringify({ filter: { "_id": { "$in": contactIdsInChunk } } })
        });

        if (!contactDeleteRes.ok) {
            const errorDetails = await getErrorDetails(contactDeleteRes);
            console.error(`Failed to start contact deletion job for batch: ${errorDetails}`);
        }
    }

    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'complete', processed: totalSteps, total: totalSteps, step: 'Done!' }));
};
        
		
		//--------------------------
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