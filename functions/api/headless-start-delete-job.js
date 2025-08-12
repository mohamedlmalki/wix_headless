// functions/api/headless-start-delete-job.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { siteId, membersToDelete } = await request.json();
        const jobKey = `delete_job_${siteId}`;

        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) {
            return new Response(JSON.stringify({ message: `Project not found for siteId: ${siteId}` }), { status: 404 });
        }

        await env.WIX_HEADLESS_CONFIG.delete(jobKey);

        const initialJobState = {
            status: 'running',
            processed: 0,
            total: membersToDelete.length,
            error: null,
            skipped: [], // Add a field to track skipped members
        };
        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(initialJobState));

        const doDeletion = async () => {
            let currentState = { ...initialJobState };

            for (const member of membersToDelete) {
                try {
                    const memberRes = await fetch(`https://www.wixapis.com/members/v1/members/${member.memberId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                    });

                    if (!memberRes.ok) {
                        const errorData = await memberRes.json();
                        const errorCode = errorData?.details?.applicationError?.code;

                        // ★ FIX: Check for the specific "forbidden" error
                        if (errorCode === 'OWNER_OR_CONTRIBUTOR_MEMBER_DELETE_FORBIDDEN') {
                            console.warn(`Skipping deletion for owner/contributor: ${member.memberId}.`);
                            currentState.skipped.push({ memberId: member.memberId, reason: 'Owner or Contributor' });
                        } else {
                            // It's a different, more serious error, so stop the job.
                            throw new Error(`Failed to delete member ${member.memberId}. Response: ${JSON.stringify(errorData)}`);
                        }
                    } else {
                        // If member deletion was successful, also delete the contact
                        if (member.contactId) {
                            await fetch(`https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                            });
                        }
                    }

                    // Whether skipped or deleted, we increment the processed count
                    currentState.processed++;
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));

                } catch (error) {
                    currentState.status = 'stuck';
                    currentState.error = error.message;
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));
                    return; // Stop the job
                }
                
                await delay(250);
            }

            // Mark the job as complete
            currentState.status = 'complete';
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));
        };

        context.waitUntil(doDeletion());

        return new Response(JSON.stringify({ success: true, message: "Deletion job started." }), {
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