// functions/api/headless-webhook-job-control.js
export async function onRequestPost({ request, env }) {
    try {
        const { siteId, action } = await request.json(); // action can be 'pause', 'resume', or 'cancel'
        const jobKey = `webhook_job_${siteId}`;
        const currentJobJson = await env.WIX_HEADLESS_CONFIG.get(jobKey);

        if (!currentJobJson) {
            return new Response(JSON.stringify({ message: "No job found to control." }), { status: 404 });
        }

        let jobState = JSON.parse(currentJobJson);

        if (action === 'pause') jobState.status = 'paused';
        if (action === 'resume') jobState.status = 'running';
        if (action === 'cancel') {
            jobState.status = 'canceled';
            // We can delete the key after a short delay to clean up
            // For now, we'll just mark it as canceled
        }

        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));

        return new Response(JSON.stringify({ success: true, message: `Job action '${action}' applied.` }), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
