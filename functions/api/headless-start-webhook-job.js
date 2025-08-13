// functions/api/headless-start-webhook-job.js
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function onRequestPost(context) {
    const { request, env } = context;
    const { siteId, webhookUrl, emails, subject, content } = await request.json();
    
    const jobKey = `webhook_job_${siteId}`;
    const controlKey = `webhook_control_${siteId}`; // The new key for commands

    context.waitUntil((async () => {
        let jobState = { status: 'running', processed: 0, total: emails.length, results: [] };
        
        // Initialize the main job status and clear any lingering commands
        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
        await env.WIX_HEADLESS_CONFIG.delete(controlKey);

        try {
            for (let i = 0; i < emails.length; i++) {
                // --- The New Control Logic ---
                const command = await env.WIX_HEADLESS_CONFIG.get(controlKey);

                if (command === 'cancel') {
                    jobState.status = 'canceled';
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
                    await env.WIX_HEADLESS_CONFIG.delete(controlKey); // Clean up
                    break; 
                }

                if (command === 'pause') {
                    jobState.status = 'paused';
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
                    
                    // Enter a waiting loop, checking for a 'resume' or 'cancel' command
                    while (true) {
                        await delay(2500);
                        const newCommand = await env.WIX_HEADLESS_CONFIG.get(controlKey);
                        if (newCommand === 'resume' || newCommand === 'cancel') {
                            break; // Exit the waiting loop
                        }
                    }
                    // Re-check after the loop in case it was a 'cancel'
                    const finalCommand = await env.WIX_HEADLESS_CONFIG.get(controlKey);
                    if (finalCommand === 'cancel') {
                        jobState.status = 'canceled';
                        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
                        await env.WIX_HEADLESS_CONFIG.delete(controlKey);
                        break;
                    }
                }
                
                // If we're here, we're running. Ensure the state reflects that.
                if (jobState.status !== 'running') {
                    jobState.status = 'running';
                    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
                    await env.WIX_HEADLESS_CONFIG.delete(controlKey); // Clean up the 'resume' command
                }
                // --- End of Control Logic ---

                const email = emails[i];
                const payload = {
                    string_field: subject, uuid_field: crypto.randomUUID(), number_field: 42,
                    dateTime_field: new Date().toISOString(), date_field: new Date().toISOString().split('T')[0],
                    time_field: new Date().toTimeString().split(' ')[0], uri_field: "https://www.example.com",
                    boolean_field: true, email_field: email, object_field: { string_field: content, number_field: 100 },
                    array_field: ["item_1", "item_2"]
                };

                try {
                    const wixResponse = await fetch(webhookUrl, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
                    });
                    if (wixResponse.ok) {
                        jobState.results.push({ email, status: 'Success', reason: 'Sent successfully' });
                    } else {
                        const errorText = await wixResponse.text();
                        jobState.results.push({ email, status: 'Failed', reason: errorText || `Status ${wixResponse.status}` });
                    }
                } catch (error) {
                    jobState.results.push({ email, status: 'Failed', reason: error.message });
                }
                
                jobState.processed = i + 1;
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
                await delay(1000);
            }

            // Final job state update
            if (jobState.status !== 'canceled') {
                jobState.status = 'complete';
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
            }

        } catch (error) {
            // Catch any unexpected errors during the job execution
            const errorState = { ...jobState, status: 'stuck', error: error.message };
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(errorState));
        }
    })());

    return new Response(JSON.stringify({ success: true, message: "Webhook job started." }), { status: 202 });
}