// functions/api/headless-webhook-job-control.js

export async function onRequestPost({ request, env }) {
    try {
        const { siteId, action } = await request.json();
        const jobKey = `webhook_job_${siteId}`;

        // Get the current job state
        const jobStateString = await env.WIX_HEADLESS_CONFIG.get(jobKey);
        if (!jobStateString) {
            return new Response(JSON.stringify({ message: "Job not found." }), { status: 404 });
        }

        let jobState = JSON.parse(jobStateString);

        // Update the job status based on the action
        if (action === 'pause') {
            jobState.status = 'paused';
        } else if (action === 'resume') {
            jobState.status = 'running';
        } else if (action === 'cancel') {
            jobState.status = 'canceled';
        }

        // Save the updated job state
        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(jobState));

        return new Response(JSON.stringify({ success: true, message: `Command '${action}' sent.` }), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}