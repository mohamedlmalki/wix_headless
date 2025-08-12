// This function handles GETTING the sender details
// The frontend sends a POST request, so we use onRequestPost
export async function onRequestPost({ request, env }) {
  try {
    const { siteId } = await request.json();

    const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
    if (!projectsJson) throw new Error("Could not retrieve project configurations.");
    
    const project = projectsJson.find(p => p.siteId === siteId);
    if (!project) {
      return new Response(JSON.stringify({ message: `Project configuration not found for siteId: ${siteId}` }), { status: 404 });
    }

    const wixApiUrl = 'https://www.wixapis.com/email-marketing/v1/sender-details';
    const wixResponse = await fetch(wixApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': project.apiKey,
        'wix-site-id': project.siteId,
      }
    });
    
    const data = await wixResponse.json();
    return new Response(JSON.stringify(data), { status: wixResponse.status, headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), { status: 500 });
  }
}

// This function handles UPDATING the sender details
export async function onRequestPatch({ request, env }) {
  try {
    const { siteId, senderDetails } = await request.json();

    const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
    if (!projectsJson) throw new Error("Could not retrieve project configurations.");
    
    const project = projectsJson.find(p => p.siteId === siteId);
    if (!project) {
      return new Response(JSON.stringify({ message: `Project configuration not found for siteId: ${siteId}` }), { status: 404 });
    }

    const wixApiUrl = 'https://www.wixapis.com/email-marketing/v1/sender-details';
    const requestBody = JSON.stringify({ senderDetails });

    const wixResponse = await fetch(wixApiUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': project.apiKey,
        'wix-site-id': project.siteId,
      },
      body: requestBody
    });
    
    const data = await wixResponse.json();
    return new Response(JSON.stringify(data), { status: wixResponse.status, headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), { status: 500 });
  }
}