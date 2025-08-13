// functions/api/headless-start-webhook-job.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function onRequestPost(context) {
    const { request, env } = context;
    const { siteId, webhookUrl, emails, subject, content } = await request.json();

    const jobKey = `webhook_job_${siteId}`;
    const controlKey = `webhook_control_${siteId}`;

    context.waitUntil((async () => {
        let jobState = { status: 'running', processed: 0, total: emails.length, results: [] };

        // Initialize the job state and clear any lingering commands from previous runs.
        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
        await env.WIX_HEADLESS_CONFIG.delete(controlKey);

        try {
            for (let i = 0; i < emails.length; i++) {
                // --- STATE MACHINE LOGIC ---
                while (true) {
                    const command = await env.WIX_HEADLESS_CONFIG.get(controlKey);

                    if (command === 'pause') {
                        jobState.status = 'paused';
                        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
                        await env.WIX_HEADLESS_CONFIG.delete(controlKey); // Consume the 'pause' command
                    } else if (command === 'resume') {
                        jobState.status = 'running';
                        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
                        await env.WIX_HEADLESS_CONFIG.delete(controlKey);
                        break; // Exit the pause loop
                    } else if (command === 'cancel') {
                        jobState.status = 'canceled';
                        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
                        await env.WIX_HEADLESS_CONFIG.delete(controlKey);
                        return; // Exit the job entirely
                    }

                    if (jobState.status === 'paused') {
                        await delay(2500); // Wait while paused
                    } else {
                        break; // Not paused, so continue processing
                    }
                }
                // --- END OF STATE MACHINE ---

                const email = emails[i];
                const payload = {
                    string_field: subject, uuid_field: crypto.randomUUID(), number_field: 42,
                    dateTime_field: new Date().toISOString(), date_field: new Date().toISOString().split('T')[0],
                    time_field: new Date().toTimeString().split(' ')[0], uri_field: "https://www.example.com",
                    boolean_field: true, email_field: email, object_field: { string_field: content, number_field: 100 },
                    array_field: ["item_1", "item_2"]
                };

                // Perform the actual webhook request within its own error handler
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

                // Update progress and save state
                jobState.processed = i + 1;
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
                await delay(1000); // The delay between each webhook send
            }

            // After the loop, do a final status update
            const finalJobState = JSON.parse(await env.WIX_HEADLESS_CONFIG.get(jobKey));
            if (finalJobState.status !== 'canceled') {
                finalJobState.status = 'complete';
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(finalJobState));
            }

        } catch (error) {
            // If the whole process fails for an unexpected reason, mark the job as 'stuck'
            const errorState = { ...jobState, status: 'stuck', error: error.message };
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(errorState));
        }
    })());

    return new Response(JSON.stringify({ success: true, message: "Webhook job started." }), { status: 202 });
}