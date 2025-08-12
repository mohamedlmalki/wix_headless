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

        // Delete any old job status to ensure a fresh start.
        await env.WIX_HEADLESS_CONFIG.delete(jobKey);

        const initialJobState = {
            status: 'running',
            processed: 0,
            total: membersToDelete.length,
            error: null,
        };
        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(initialJobState));

        // Define the robust background task
        const doDeletion = async () => {
            let processedCount = 0;
            
            try {
                for (const member of membersToDelete) {
                    try {
                        // Step 1: Delete the Member
                        const memberRes = await fetch(`https://www.wixapis.com/members/v1/members/${member.memberId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                        });

                        if (!memberRes.ok) {
                           // If not OK, throw an error to be caught by the inner catch block
                           const errorText = await memberRes.text();
                           throw new Error(`Failed to delete member ${member.memberId}. Status: ${memberRes.status}. Response: ${errorText}`);
                        }

                        // Step 2: Delete the Contact (if contactId exists)
                        if (member.contactId) {
                            // ★ FIX: Added the 'wix-site-id' header
                            const contactRes = await fetch(`https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                            });
                            
                            if (!contactRes.ok) {
                               // Log this error but don't stop the whole job, as the member is already deleted.
                               console.error(`Failed to delete contact ${member.contactId}, but member was deleted.`);
                            }
                        }
                        
                        // Update progress after a successful deletion
                        processedCount++;
                        const progressState = { ...initialJobState, processed: processedCount };
                        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(progressState));

                    } catch (memberError) {
                        // If one member fails, log it and stop the job
                        console.error('Error deleting a member, stopping job:', memberError);
                        const errorState = {
                            ...initialJobState,
                            status: 'stuck',
                            processed: processedCount,
                            error: (memberError as Error).message,
                        };
                        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(errorState));
                        return; // Exit the background task
                    }
                    
                    await delay(250); // Delay to avoid rate-limiting
                }

                // If the loop completes without errors
                const finalState = { ...initialJobState, status: 'complete', processed: processedCount };
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(finalState));

            } catch (jobError) {
                // Catch any unexpected errors in the overall job
                console.error('A critical error occurred during the deletion job:', jobError);
                const criticalErrorState = {
                    ...initialJobState,
                    status: 'stuck',
                    processed: processedCount,
                    error: `A critical error stopped the job: ${(jobError as Error).message}`,
                };
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(criticalErrorState));
            }
        };

        context.waitUntil(doDeletion());

        return new Response(JSON.stringify({ success: true, message: "Deletion job started." }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ message: 'An error occurred.', error: (e as Error).message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}