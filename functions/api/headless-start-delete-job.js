// A helper function to add a delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { siteId, membersToDelete } = await request.json();
        const jobKey = `delete_job_${siteId}`;

        // First, check if a job is already running to prevent conflicts
        const existingJobJson = await env.WIX_HEADLESS_CONFIG.get(jobKey);
        if (existingJobJson) {
            const existingJob = JSON.parse(existingJobJson);
            if (existingJob.status === 'running') {
                return new Response(JSON.stringify({ message: "A deletion job is already in progress for this site." }), { status: 409 });
            }
        }

        // Get the project config to find the API key
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) {
            return new Response(JSON.stringify({ message: `Project configuration not found for siteId: ${siteId}` }), { status: 404 });
        }
        
        // ★★★ THE CRUCIAL FIX ★★★
        // Create the initial job state object that we will both save and return.
        const initialJobState = {
            status: 'running',
            processed: 0,
            total: membersToDelete.length,
            error: null
        };

        // Immediately write this initial "zeroed-out" state to the database.
        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(initialJobState));

        // Define the background task
        const doDeletion = async () => {
            let processedCount = 0;
            for (const member of membersToDelete) {
                // ... (deletion logic remains the same)
                const deleteMemberResponse = await fetch(`https://www.wixapis.com/members/v1/members/${member.memberId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                });

                if (deleteMemberResponse.status === 429) {
                     const errorDetails = await deleteMemberResponse.json();
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ ...initialJobState, status: 'stuck', processed: processedCount, error: `Rate limit hit: ${errorDetails.message || 'Too Many Requests'}` }));
                    return;
                }
                
                if (member.contactId) {
                    await fetch(`https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`, {
                        method: 'DELETE', headers: { 'Authorization': project.apiKey }
                    });
                }
                
                processedCount++;
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ ...initialJobState, processed: processedCount }));
                await delay(250); // A small delay to be polite to the Wix API
            }
            
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ ...initialJobState, status: 'complete', processed: processedCount }));
        };

        context.waitUntil(doDeletion());

        // Return the initial state immediately to the frontend.
        return new Response(JSON.stringify({ success: true, message: "Deletion job started.", initialState: initialJobState }), {
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