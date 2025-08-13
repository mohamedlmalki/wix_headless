// functions/api/headless-start-webhook-job.js

export async function onRequestPost({ request, env }) {
    try {
        const { siteId, webhookUrl, emails, subject, content } = await request.json();
        const jobKey = `webhook_job_${siteId}`;

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

        return new Response(JSON.stringify({ success: true, message: "Webhook job started." }), { status: 202 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}