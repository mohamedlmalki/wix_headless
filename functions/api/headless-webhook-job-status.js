// functions/api/headless-webhook-job-status.js
export async function onRequestPost({ request, env }) {
  try {
    const { siteId } = await request.json();
    const jobKey = `webhook_job_${siteId}`;
    const statusJson = await env.WIX_HEADLESS_CONFIG.get(jobKey);

    if (!statusJson) {
      return new Response(JSON.stringify({ status: 'idle' }), { status: 200 });
    }
    return new Response(statusJson, { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
