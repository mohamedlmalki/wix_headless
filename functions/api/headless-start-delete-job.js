// functions/api/headless-start-delete-job.js

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

// Function to delete a single member and then their contact
async function deleteSingleMemberAndContact(member, project) {
    try {
        // Step 1: Delete the Member
        const memberDeleteRes = await fetch(`https://www.wixapis.com/members/v1/members/${member.memberId}`, {
            method: 'DELETE',
            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
        });

        // A 404 error means it's already deleted, which is a success in this context
        if (!memberDeleteRes.ok && memberDeleteRes.status !== 404) {
            const errorDetails = await getErrorDetails(memberDeleteRes);
            throw new Error(`Failed to delete member ${member.memberId}: ${errorDetails}`);
        }

        // Step 2: Delete the associated Contact
        const contactDeleteRes = await fetch(`https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`, {
            method: 'DELETE',
            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
        });

        if (!contactDeleteRes.ok && contactDeleteRes.status !== 404) {
            // Log this error but don't stop the whole job, as the member is deleted.
            console.error(`Post-member deletion warning: Could not delete contact ${member.contactId}.`);
        }
    } catch (error) {
        console.error(`Error processing member ${member.memberId}:`, error);
        // Re-throw the error so Promise.allSettled can catch it as 'rejected'
        throw error;
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const { siteId, membersToDelete } = await request.json();
    const jobKey = `delete_job_${siteId}`;

    try {
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projects.find(p => p.siteId === siteId);
        if (!project) return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });

        const doParallelDeletion = async () => {
            const totalMembers = membersToDelete.length;
            let processedCount = 0;
            let failureCount = 0;

            // Process in parallel batches of 100 to maximize speed
            const batchSize = 100;

            for (let i = 0; i < totalMembers; i += batchSize) {
                const batch = membersToDelete.slice(i, i + batchSize);
                
                const deletePromises = batch.map(member => deleteSingleMemberAndContact(member, project));

                // Promise.allSettled will wait for all promises to finish, regardless of success or failure
                const results = await Promise.allSettled(deletePromises);
                
                // Count failures in this batch for logging
                failureCount += results.filter(r => r.status === 'rejected').length;
                processedCount += batch.length;
                
                // Update the progress in KV storage
                const currentState = { 
                    status: 'running', 
                    processed: processedCount, 
                    total: totalMembers, 
                    step: `Processing... (${processedCount}/${totalMembers})`
                };
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));
            }
            
            // Finalize the job
            const finalMessage = failureCount > 0 
                ? `Done, with ${failureCount} errors. Check function logs for details.` 
                : 'Done!';
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'complete', processed: totalMembers, total: totalMembers, step: finalMessage }));
        };
        
        context.waitUntil(doParallelDeletion());

        return new Response(JSON.stringify({ success: true, message: "Parallel deletion job started." }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), { status: 500 });
    }
}