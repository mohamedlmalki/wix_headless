// functions/api/headless-start-webhook-job.js
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function onRequestPost(context) {
    const { request, env } = context;
    const { siteId, webhookUrl, emails, subject, content } = await request.json();
    
    const jobKey = `webhook_job_${siteId}`;
    
    context.waitUntil((async () => {
        let jobState = { status: 'running', processed: 0, total: emails.length, results: [], webhookUrl, emails, subject, content };
        
        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));

        try {
            while (jobState.processed < jobState.total) {
                // Get the latest job state
                const currentJobStateString = await env.WIX_HEADLESS_CONFIG.get(jobKey);
                jobState = JSON.parse(currentJobStateString);

                if (jobState.status === 'paused') {
                    await delay(2500); // Wait while paused
                    continue;
                }
                
                if (jobState.status === 'canceled') {
                    break; // Exit the loop
                }

                const email = emails[jobState.processed];
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
                
                jobState.processed++;
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
                await delay(1000);
            }

            const finalJobState = JSON.parse(await env.WIX_HEADLESS_CONFIG.get(jobKey));
            if (finalJobState.status !== 'canceled') {
                finalJobState.status = 'complete';
                await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(finalJobState));
            }

        } catch (error) {
            const errorState = { status: 'stuck', error: error.message };
            await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(errorState));
        }
    })());

    return new Response(JSON.stringify({ success: true, message: "Webhook job started." }), { status: 202 });
}