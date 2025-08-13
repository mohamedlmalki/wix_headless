// functions/api/headless-webhook-job-control.js
export async function onRequestPost({ request, env }) {
    try {
        const { siteId, action } = await request.json(); // action can be 'pause', 'resume', or 'cancel'
        const jobKey = `webhook_job_${siteId}`;
        const currentJobJson = await env.WIX_HEADLESS_CONFIG.get(jobKey);

        if (!currentJobJson) {
            return new Response(JSON.stringify({ message: "No job found to control." }), { status: 404 });
        }

        const jobState = JSON.parse(currentJobJson);

        let newStatus = jobState.status;
        if (action === 'pause') {
            newStatus = 'paused';
        } else if (action === 'resume') {
            newStatus = 'running';
        } else if (action === 'cancel') {
            newStatus = 'canceled';
        }

        // Create a new state object instead of mutating the old one
        const newJobState = { ...jobState, status: newStatus };

        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(newJobState));

        return new Response(JSON.stringify({ success: true, message: `Job action '${action}' applied.` }), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}