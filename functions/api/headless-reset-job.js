// functions/api/headless-reset-job.js

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { siteId } = await request.json();
        if (!siteId) {
            return new Response(JSON.stringify({ message: "Site ID is required." }), { status: 400 });
        }

        const jobKey = `delete_job_${siteId}`;

        // Simply delete the old job status from KV storage
        await env.WIX_HEADLESS_CONFIG.delete(jobKey);

        return new Response(JSON.stringify({ success: true, message: "Job status reset successfully." }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ message: 'An error occurred during reset.', error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}