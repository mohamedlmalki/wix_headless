// functions/api/headless-start-webhook-job.js
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function onRequestPost(context) {
    const { request, env } = context;
    const { siteId, webhookUrl, emails, subject, content } = await request.json();
    const jobKey = `webhook_job_${siteId}`;

    // Start the background job
    context.waitUntil((async () => {
        // Initialize the job state in the KV store
        let jobState = { status: 'running', processed: 0, total: emails.length, results: [] };
        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));

        for (let i = 0; i < emails.length; i++) {
            // *** FIX: Always read the most current job state from the server ***
            let currentJobState = JSON.parse(await env.WIX_HEADLESS_CONFIG.get(jobKey));

            // Check for control signals (pause or cancel)
            if (currentJobState.status === 'canceled') {
                break; // Exit the loop if the job is canceled
            }
            if (currentJobState.status === 'paused') {
                await delay(2500); // Wait for a moment
                i--; // Decrement 'i' to re-process the current email when resumed
                continue; // Skip to the next loop iteration to re-check the status
            }

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
                    currentJobState.results.push({ email, status: 'Success', reason: 'Sent successfully' });
                } else {
                    const errorText = await wixResponse.text();
                    currentJobState.results.push({ email, status: 'Failed', reason: errorText || `Status ${wixResponse.status}` });
                }
            } catch (error) {
                currentJobState.results.push({ email, status: 'Failed', reason: error.message });
            }
            
            // Update progress and write the modified state back to the server
            currentJobState.processed = i + 1;
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentJobState));
            await delay(1000); // Delay between each webhook
        }

        // Final update to mark the job as complete
        let finalJobState = JSON.parse(await env.WIX_HEADLESS_CONFIG.get(jobKey));
        if (finalJobState.status !== 'canceled') {
            finalJobState.status = 'complete';
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(finalJobState));
        }
    })());

    return new Response(JSON.stringify({ success: true, message: "Webhook job started." }), { status: 202 });
}
