// functions/api/headless-webhook-job-control.js
export async function onRequestPost({ request, env }) {
    try {
        const { siteId, action } = await request.json(); // action can be 'pause', 'resume', or 'cancel'
        const controlKey = `webhook_control_${siteId}`;

        // This function's only job is to set the command.
        await env.WIX_HEADLESS_CONFIG.put(controlKey, action);

        return new Response(JSON.stringify({ success: true, message: `Command '${action}' sent.` }), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}