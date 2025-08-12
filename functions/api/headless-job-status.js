// functions/api/headless-job-status.js

// Handles POST requests to /api/headless-job-status
export async function onRequestPost({ request, env }) {
  try {
    const { siteId } = await request.json();
    // ★ FIX: Use the correct key format "delete_job_"
    const jobKey = `delete_job_${siteId}`;

    // ★ FIX: Use the correct KV namespace "WIX_HEADLESS_CONFIG"
    const statusJson = await env.WIX_HEADLESS_CONFIG.get(jobKey);

    if (!statusJson) {
      // If no status is found, it means there's no active job
      return new Response(JSON.stringify({ status: 'idle' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Return the current job status to the frontend
    return new Response(statusJson, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}