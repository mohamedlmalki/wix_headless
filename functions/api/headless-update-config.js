// Handles POST requests to /api/headless-update-config
export async function onRequestPost({ request, env }) {
  try {
    const { config: newConfigData } = await request.json();

    if (!newConfigData) {
      return new Response(JSON.stringify({ message: "Request must include a 'config' property." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Save the updated configuration to the KV namespace under the key 'projects'
    await env.WIX_HEADLESS_CONFIG.put('projects', JSON.stringify(newConfigData, null, 2));

    return new Response(JSON.stringify({ message: 'Configuration updated successfully.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ message: 'An error occurred while updating the configuration.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}