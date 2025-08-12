// Handles POST requests to /api/headless-search
export async function onRequestPost({ request, env }) {
  try {
    const { siteId, query } = await request.json();

    // Fetch the configuration from the KV store
    const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
    if (!projectsJson) {
      throw new Error("Could not retrieve project configurations.");
    }

    const project = projectsJson.find(p => p.siteId === siteId);

    if (!project) {
      return new Response(JSON.stringify({ message: `Project configuration not found for siteId: ${siteId}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const wixApiUrl = 'https://www.wixapis.com/members/v1/members/query';
    const requestBody = JSON.stringify({
      fieldsets: ["FULL"],
      query: {
        filter: { "loginEmail": query }
      }
    });

    const wixResponse = await fetch(wixApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': project.apiKey,
        'wix-site-id': project.siteId,
      },
      body: requestBody
    });

    const data = await wixResponse.json();

    return new Response(JSON.stringify(data), {
      status: wixResponse.status,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}