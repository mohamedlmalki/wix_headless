// functions/api/headless-webhook-job-control.js

export async function onRequestPost({ request, env }) {
    try {
        const { siteId, action } = await request.json();
        const jobKey = `webhook_job_${siteId}`;

        if (action === 'cancel') {
            await env.WIX_HEADLESS_CONFIG.delete(jobKey);
            return new Response(JSON.stringify({ success: true, message: "Job canceled and state cleared." }), { status: 200 });
        }

        const jobStateString = await env.WIX_HEADLESS_CONFIG.get(jobKey);
        if (!jobStateString) {
            return new Response(JSON.stringify({ message: "Job not found." }), { status: 404 });
        }

        let jobState = JSON.parse(jobStateString);

        if (action === 'pause') {
            jobState.status = 'paused';
        } else if (action === 'resume') {
            jobState.status = 'running';
        }

        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));

        return new Response(JSON.stringify({ success: true, message: `Command '${action}' sent.` }), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}