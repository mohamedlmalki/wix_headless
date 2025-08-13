// functions/api/headless-start-webhook-job.js
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function onRequestPost(context) {
    const { request, env } = context;
    const jobKey = `webhook_job_unknown`; // Default key in case request parsing fails

    try {
        const { siteId, webhookUrl, emails, subject, content } = await request.json();
        const currentJobKey = `webhook_job_${siteId}`;

        // Start the background job
        context.waitUntil((async () => {
            let jobState = { status: 'running', processed: 0, total: emails.length, results: [] };
            try {
                // Initialize the job state in the KV store
                await env.WIX_HEADLESS_CONFIG.put(currentJobKey, JSON.stringify(jobState));

                for (let i = 0; i < emails.length; i++) {
                    let currentJobState = JSON.parse(await env.WIX_HEADLESS_CONFIG.get(currentJobKey));

                    if (currentJobState.status === 'canceled') break;
                    
                    while (currentJobState.status === 'paused') {
                        await delay(2500);
                        currentJobState = JSON.parse(await env.WIX_HEADLESS_CONFIG.get(currentJobKey));
                        if (currentJobState.status === 'canceled') break;
                    }

                    if (currentJobState.status === 'canceled') break;

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
                    
                    currentJobState.processed = i + 1;
                    jobState = currentJobState; // Keep track of the latest state for the catch block
                    await env.WIX_HEADLESS_CONFIG.put(currentJobKey, JSON.stringify(currentJobState));
                    await delay(1000);
                }

                let finalJobState = JSON.parse(await env.WIX_HEADLESS_CONFIG.get(currentJobKey));
                if (finalJobState.status !== 'canceled') {
                    finalJobState.status = 'complete';
                    await env.WIX_HEADLESS_CONFIG.put(currentJobKey, JSON.stringify(finalJobState));
                }
            } catch (error) {
                // On any error, update the job status to 'stuck' and save the error message
                const errorState = {
                    ...jobState,
                    status: 'stuck',
                    error: error.message
                };
                await env.WIX_HEADLESS_CONFIG.put(currentJobKey, JSON.stringify(errorState));
            }
        })());

        return new Response(JSON.stringify({ success: true, message: "Webhook job started." }), { status: 202 });

    } catch (e) {
        // This catches errors from parsing the initial request
        return new Response(JSON.stringify({ error: `Invalid request: ${e.message}` }), { status: 400 });
    }
}