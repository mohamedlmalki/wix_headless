// functions/api/headless-start-delete-job.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

        // This function runs in the background
        const doIndividualDeletion = async () => {
            let currentState = {};
            const totalMembers = membersToDelete.length;
            
            try {
                for (let i = 0; i < totalMembers; i++) {
                    const member = membersToDelete[i];
                    currentState = { 
                        status: 'running', 
                        processed: i + 1, 
                        total: totalMembers, 
                        step: `Deleting ${member.emailAddress || member.memberId}` 
                    };
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));

                    // Step 1: Delete the Member using the single-delete endpoint
                    const memberDeleteRes = await fetch(`https://www.wixapis.com/members/v1/members/${member.memberId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                    });

                    // A 404 error means the member is already gone, which is okay.
                    if (!memberDeleteRes.ok && memberDeleteRes.status !== 404) {
                        const errorDetails = await getErrorDetails(memberDeleteRes);
                        console.error(`Skipping member ${member.memberId} due to error: ${errorDetails}`);
                        continue; // Skip to the next member
                    }
                    
                    // A smaller delay to speed up the process while staying safe.
                    await delay(250);

                    // Step 2: Delete the associated Contact
                    const contactDeleteRes = await fetch(`https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                    });

                    if (!contactDeleteRes.ok && contactDeleteRes.status !== 404) {
                        const errorDetails = await getErrorDetails(contactDeleteRes);
                         // Log the error but continue the job
                        console.error(`Failed to delete contact ${member.contactId}. Details: ${errorDetails}`);
                    }
                }

                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'complete', processed: totalMembers, total: totalMembers, step: 'Done!' }));

            } catch (error) {
                // This will catch critical errors in the loop itself
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ ...currentState, status: 'stuck', error: error.message }));
            }
        };
        
        // This tells Cloudflare to run the function even after the response is sent
        context.waitUntil(doIndividualDeletion());

        // Immediately respond to the frontend that the job has started
        return new Response(JSON.stringify({ success: true, message: "Deletion job started successfully." }), {
            status: 202, // 202 Accepted
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ message: 'Failed to initialize deletion job.', error: e.message }), { status: 500 });
    }
}