// functions/api/headless-start-delete-job.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to make API calls and handle errors
const makeApiRequest = async (url, options, body = null) => {
    const fetchOptions = { ...options };
    if (body) {
        fetchOptions.body = JSON.stringify(body);
    }
    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API call to ${url} failed with status ${response.status}: ${errorText}`);
    }
    try {
        return await response.json();
    } catch (e) {
        return {}; // Return empty object if no JSON body, which is fine for DELETE requests
    }
};

// Main function to handle the POST request
export async function onRequestPost({ request, env }) {
    const { siteId, membersToDelete } = await request.json();
    const logs = [];

    try {
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) {
            return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });
        }

        const defaultOptions = {
            headers: { 
                'Authorization': project.apiKey, 
                'wix-site-id': project.siteId, 
                'Content-Type': 'application/json' 
            }
        };

        // Chunk members into batches of 100
        const memberChunks = [];
        for (let i = 0; i < membersToDelete.length; i += 100) {
            memberChunks.push(membersToDelete.slice(i, i + 100));
        }

        // Process each chunk
        for (let i = 0; i < memberChunks.length; i++) {
            const chunk = memberChunks[i];
            const batchNum = i + 1;
            
            // Step 1: Bulk delete member profiles
            const memberIdsInChunk = chunk.map(m => m.memberId);
            try {
                await makeApiRequest(
                    'https://www.wixapis.com/members/v1/members/bulk/delete', 
                    { ...defaultOptions, method: 'POST' }, 
                    { memberIds: memberIdsInChunk }
                );
                logs.push({ type: 'Member Deletion', batch: batchNum, status: 'SUCCESS', details: `Bulk deleted ${memberIdsInChunk.length} member profiles.` });
            } catch (error) {
                logs.push({ type: 'Member Deletion', batch: batchNum, status: 'ERROR', details: error.message });
                // We stop the entire job if a member deletion batch fails
                throw new Error(`A critical error occurred during member deletion in batch ${batchNum}.`);
            }

            // Step 2: Wait for 1 second
            await delay(1000);

            // Step 3: Delete associated contacts one-by-one
            const contactResults = [];
            for (const member of chunk) {
                try {
                    await makeApiRequest(
                        `https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`,
                        { ...defaultOptions, method: 'DELETE' }
                    );
                    contactResults.push({ email: member.loginEmail, status: 'SUCCESS' });
                } catch (error) {
                    contactResults.push({ email: member.loginEmail, status: 'ERROR', error: error.message });
                }
            }
            logs.push({ 
                type: 'Contact Deletion', 
                batch: batchNum, 
                status: contactResults.some(r => r.status === 'ERROR') ? 'PARTIAL_SUCCESS' : 'SUCCESS', 
                details: `Processed ${contactResults.length} contacts.`,
                contactResults 
            });
        }
        
        return new Response(JSON.stringify({ success: true, message: 'Deletion process completed.', logs }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });

    } catch (e) {
        return new Response(JSON.stringify({ success: false, message: e.message, logs }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}