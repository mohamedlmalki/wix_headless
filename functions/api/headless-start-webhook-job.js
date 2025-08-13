// functions/api/headless-start-webhook-job.js

export async function onRequestPost(context) {
    const { request, env } = context;
    const { siteId, webhookUrl, emails, subject, content } = await request.json();

    const jobKey = `webhook_job_${siteId}`;
    const controlKey = `webhook_control_${siteId}`;

    const jobState = {
        status: 'running',
        processed: 0,
        total: emails.length,
        results: [],
        webhookUrl,
        emails,
        subject,
        content
    };

    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));
    await env.WIX_HEADLESS_CONFIG.delete(controlKey);

    // Trigger the first processing step
    context.waitUntil(
        fetch(new URL('/api/headless-webhook-job-processor', request.url), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteId })
        })
    );
    
    return new Response(JSON.stringify({ success: true, message: "Webhook job started." }), { status: 202 });
}