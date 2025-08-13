// functions/api/headless-webhook-job-control.js
export async function onRequestPost({ request, env }) {
    try {
        const { siteId, action } = await request.json(); // action can be 'pause', 'resume', or 'cancel'
        
        // *** CHANGE: This function now writes to a separate "control" key ***
        const controlKey = `webhook_control_${siteId}`;

        // Simply write the desired action to the control key.
        // The running job will pick this up on its next loop.
        await env.WIX_HEADLESS_CONFIG.put(controlKey, action);

        return new Response(JSON.stringify({ success: true, message: `Command '${action}' sent.` }), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}