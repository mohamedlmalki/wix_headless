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
        if (parsed.message) {
            return `Wix API Error: ${parsed.message}`;
        }
        return `API Error: ${JSON.stringify(parsed)}`;
    } catch (e) {
        const textResponse = await response.text();
        return `An unknown error occurred. Status: ${response.status}. Response: ${textResponse}`;
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const { siteId, membersToDelete } = await request.json();

    try {
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) {
            return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });
        }
        
        // This takes just the member IDs needed for the bulk delete endpoint
        const memberIdsToDelete = membersToDelete.map(m => m.memberId).filter(Boolean);
        const memberChunks = chunkArray(memberIdsToDelete, 100); // Wix API limit is 100 per bulk request
        let membersDeletedCount = 0;

        for (let i = 0; i < memberChunks.length; i++) {
            const chunk = memberChunks[i];
            const currentChunkNumber = i + 1;

            if (chunk.length > 0) {
                const response = await fetch('https://www.wixapis.com/members/v1/members/bulk/delete', {
                    method: 'POST',
                    headers: { 
                        'Authorization': project.apiKey, 
                        'wix-site-id': project.siteId, 
                        'Content-Type': 'application/json' 
                    },
                    body: JSON.stringify({ "memberIds": chunk })
                });

                if (!response.ok) {
                    const errorDetails = await getErrorDetails(response);
                    throw new Error(`Job failed on batch ${currentChunkNumber}. **Please check your API Key has 'Manage Members (Full Permissions)'**. Details: ${errorDetails}`);
                }
                
                membersDeletedCount += chunk.length;
            }
            
            // Wait 1 second before the next chunk to avoid rate limiting
            if(memberChunks.length > 1 && i < memberChunks.length -1) {
              await delay(1000); 
            }
        }

        return new Response(JSON.stringify({ 
            success: true, 
            message: `Successfully deleted ${membersDeletedCount} members.` 
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ 
            success: false, 
            message: 'A critical error occurred during the deletion process.', 
            error: e.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}