export async function onRequestPost({ request, env }) {
  try {
    const { siteId, campaignId, activity } = await request.json();

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

    if (!campaignId || !activity) {
      return new Response(JSON.stringify({ message: "Request must include 'campaignId' and 'activity'." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // This is the only line that has been changed
    const wixApiUrl = `https://www.wixapis.com/email-marketing/v1/campaigns/${campaignId}/statistics/recipients?activity=${activity}&paging.limit=1000`;

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