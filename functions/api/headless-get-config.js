// Handles GET requests to /api/headless-get-config
export async function onRequestGet({ env }) {
  try {
    // Get the project data from the KV namespace
    // 'WIX_HEADLESS_CONFIG' is the binding name you created in the dashboard
    // 'projects' is the key you just saved
    const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects');

    if (!projectsJson) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Send the data back to the frontend
    return new Response(projectsJson, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ message: 'Failed to read configuration from KV store.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}