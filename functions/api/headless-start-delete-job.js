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
        };
        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(initialJobState));

        const doDeletion = async () => {
            let processedCount = 0;
            
            try {
                for (const member of membersToDelete) {
                    try {
                        const memberRes = await fetch(`https://www.wixapis.com/members/v1/members/${member.memberId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                        });

                        if (!memberRes.ok) {
                           const errorText = await memberRes.text();
                           throw new Error(`Failed to delete member ${member.memberId}. Status: ${memberRes.status}. Response: ${errorText}`);
                        }

                        if (member.contactId) {
                            const contactRes = await fetch(`https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                            });
                            
                            if (!contactRes.ok) {
                               console.error(`Failed to delete contact ${member.contactId}, but member was deleted.`);
                            }
                        }
                        
                        processedCount++;
                        const progressState = { ...initialJobState, processed: processedCount };
                        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(progressState));

                    } catch (memberError) {
                        console.error('Error deleting a member, stopping job:', memberError);
                        const errorState = {
                            ...initialJobState,
                            status: 'stuck',
                            processed: processedCount,
                            // ★ FIX: Removed TypeScript "as Error" syntax
                            error: memberError.message,
                        };
                        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(errorState));
                        return;
                    }
                    
                    await delay(250);
                }

                const finalState = { ...initialJobState, status: 'complete', processed: processedCount };
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(finalState));

            } catch (jobError) {
                console.error('A critical error occurred during the deletion job:', jobError);
                const criticalErrorState = {
                    ...initialJobState,
                    status: 'stuck',
                    processed: processedCount,
                    // ★ FIX: Removed TypeScript "as Error" syntax
                    error: `A critical error stopped the job: ${jobError.message}`,
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
        return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}