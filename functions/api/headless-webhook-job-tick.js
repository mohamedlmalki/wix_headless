// functions/api/headless-webhook-job-tick.js

export async function onRequestPost(context) {
    const { request, env } = context;
    const { siteId } = await request.json();
    const jobKey = `webhook_job_${siteId}`;

    // Get the latest job state
    const jobStateString = await env.WIX_HEADLESS_CONFIG.get(jobKey);
    if (!jobStateString) {
        return new Response(JSON.stringify({ message: "Job not found." }), { status: 404 });
    }
    let jobState = JSON.parse(jobStateString);

    // Only process if the job is in the 'running' state and not complete
    if (jobState.status !== 'running' || jobState.processed >= jobState.total) {
        return new Response(JSON.stringify({ message: "Job is not in a running state or is complete." }), { status: 200 });
    }

    const { webhookUrl, emails, subject, content } = jobState;
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

    if (jobState.processed >= jobState.total) {
        jobState.status = 'complete';
    }

    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
    
    return new Response(JSON.stringify({ message: "Processed one item." }), { status: 200 });
}