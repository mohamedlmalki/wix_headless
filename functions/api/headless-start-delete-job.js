// A helper function to add a delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// The main function that handles the entire deletion process
export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { siteId, membersToDelete } = await request.json();

        // 1. Get the project config to find the API key
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) {
            return new Response(JSON.stringify({ message: `Project configuration not found for siteId: ${siteId}` }), { status: 404 });
        }
        
        const jobKey = `delete_job_${siteId}`;

        // ★★★ THIS IS THE CRUCIAL FIX ★★★
        // Before doing anything else, immediately and synchronously reset the job status in the database.
        // This guarantees that any polling from the frontend will see a fresh start.
        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({
            status: 'running',
            processed: 0,
            total: membersToDelete.length,
            error: null
        }));

        // Now, define the background task
        const doDeletion = async () => {
            let processedCount = 0;
            for (const member of membersToDelete) {
                const deleteMemberResponse = await fetch(`https://www.wixapis.com/members/v1/members/${member.memberId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                });

                if (deleteMemberResponse.status === 429) {
                    const errorDetails = await deleteMemberResponse.json();
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({
                        status: 'stuck',
                        processed: processedCount,
                        total: membersToDelete.length,
                        error: `Rate limit hit. Wix API says: ${errorDetails.message || 'Too Many Requests'}.`
                    }));
                    return; // Stop the job
                }

                if (member.contactId) {
                    await fetch(`https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': project.apiKey }
                    });
                }
                
                processedCount++;
                
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({
                    status: 'running',
                    processed: processedCount,
                    total: membersToDelete.length,
                    error: null
                }));

                // A small, polite delay to prevent future rate limit issues.
                await delay(250); 
            }
            
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({
                status: 'complete',
                processed: processedCount,
                total: membersToDelete.length,
                error: null
            }));
        };

        // Run the deletion task in the background
        context.waitUntil(doDeletion());

        // Return an immediate success response to the user
        return new Response(JSON.stringify({ success: true, message: "Deletion job started successfully." }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}