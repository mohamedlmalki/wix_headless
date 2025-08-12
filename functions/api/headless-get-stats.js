// functions/api/headless-get-stats.js

export async function onRequestPost({ request, env }) {
  try {
    const { siteId, campaignIds } = await request.json();

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

    if (!campaignIds || !Array.isArray(campaignIds) || campaignIds.length === 0) {
      return new Response(JSON.stringify({ message: "Request must include a 'campaignIds' array." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Construct the URL with query parameters
    const params = new URLSearchParams();
    campaignIds.forEach(id => params.append('campaignIds', id));
    const wixApiUrl = `https://www.wixapis.com/email-marketing/v1/campaigns/statistics?${params.toString()}`;

    const wixResponse = await fetch(wixApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': project.apiKey,
        'wix-site-id': project.siteId,
      }
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