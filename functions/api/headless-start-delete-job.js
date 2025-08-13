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

// Function to delete a single member and their contact
async function deleteSingleMember(member, project) {
    // Step 1: Delete the Member
    const memberDeleteRes = await fetch(`https://www.wixapis.com/members/v1/members/${member.memberId}`, {
        method: 'DELETE',
        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
    });

    if (!memberDeleteRes.ok && memberDeleteRes.status !== 404) {
        const errorDetails = await getErrorDetails(memberDeleteRes);
        console.error(`Failed to delete member ${member.memberId}. Status: ${memberDeleteRes.status}. Details: ${errorDetails}`);
        // We throw here to signal failure for this specific member
        throw new Error(`Member deletion failed for ${member.memberId}`);
    }

    // A small delay between member and contact deletion
    await delay(200);

    // Step 2: Delete the associated Contact
    const contactDeleteRes = await fetch(`https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`, {
        method: 'DELETE',
        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
    });

    if (!contactDeleteRes.ok && contactDeleteRes.status !== 404) {
        const errorDetails = await getErrorDetails(contactDeleteRes);
         // This is a non-critical failure, as the member is deleted. We can just log it.
        console.error(`Failed to delete contact ${member.contactId}. Details: ${errorDetails}`);
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

        const doParallelDeletion = async () => {
            const totalMembers = membersToDelete.length;
            let processedCount = 0;

            // Process in parallel batches of 100 to maximize speed
            const batchSize = 100;

            for (let i = 0; i < totalMembers; i += batchSize) {
                const batch = membersToDelete.slice(i, i + batchSize);
                
                // Create a promise for each deletion in the batch
                const deletePromises = batch.map(member => 
                    deleteSingleMember(member, project).catch(e => console.error(e.message))
                );

                // Wait for the current batch to complete
                await Promise.all(deletePromises);

                processedCount += batch.length;
                
                // Update the progress in KV storage
                const currentState = { 
                    status: 'running', 
                    processed: processedCount, 
                    total: totalMembers, 
                    step: `Processing batch... (${processedCount}/${totalMembers})`
                };
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));
            }
            
            // Finalize the job
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'complete', processed: totalMembers, total: totalMembers, step: 'Done!' }));
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