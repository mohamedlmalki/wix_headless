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
    const errorText = await response.text();
    try {
        return JSON.stringify(JSON.parse(errorText));
    } catch (e) {
        return errorText || "No additional error details were provided by the API.";
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const { siteId, membersToDelete } = await request.json();
    const jobKey = `delete_job_${siteId}`;

    try {
        // ★★★ THE TYPO WAS HERE - Corrected to WIX_HEADLESS_CONFIG ★★★
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });

        const doMemberDeletion = async () => {
            let currentState = {};
            try {
                const memberIds = membersToDelete.map(m => m.memberId);
                const memberIdChunks = chunkArray(memberIds, 100);
                
                const totalSteps = memberIdChunks.length;
                let stepsCompleted = 0;

                // --- STEP 1: Bulk Delete All Member Chunks ---
                for (let i = 0; i < memberIdChunks.length; i++) {
                    stepsCompleted++;
                    currentState = { status: 'running', processed: stepsCompleted, total: totalSteps, step: `Deleting member batch ${i + 1} of ${memberIdChunks.length}` };
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));
                    
                    const memberDeleteRes = await fetch('https://www.wixapis.com/members/v1/members/bulk/delete', {
                        method: 'POST',
                        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ "memberIds": memberIdChunks[i] })
                    });
                    
                    if (!memberDeleteRes.ok) {
                        const errorDetails = await getErrorDetails(memberDeleteRes);
                        throw new Error(`Failed on member batch ${i + 1}. API responded with status ${memberDeleteRes.status}: ${errorDetails}`);
                    }
                }

                // --- FINAL STEP: Mark job as complete ---
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'complete', processed: totalSteps, total: totalSteps, step: 'Member deletion complete!' }));

            } catch (error) {
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ ...currentState, status: 'stuck', error: error.message }));
            }
        };
        
        context.waitUntil(doMemberDeletion());

        return new Response(JSON.stringify({ success: true, message: "Bulk member deletion job started." }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ message: 'An error occurred starting the job.', error: e.message }), { status: 500 });
    }
}