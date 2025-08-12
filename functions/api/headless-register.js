import headlessProjects from '../../src/headless/config/headless-config.json';

// This is the Cloudflare Function format for handling requests
export async function onRequestPost({ request }) {
  try {
    // Get the siteId and email from the request body
    const { siteId, email } = await request.json();

    // Find the correct project configuration
    const project = headlessProjects.find(p => p.siteId === siteId);

    if (!project) {
      return new Response(JSON.stringify({ message: `Project configuration not found for siteId: ${siteId}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const wixApiUrl = 'https://www.wixapis.com/_api/iam/authentication/v2/register';
    const requestBody = JSON.stringify({
      loginId: { email },
      password: "Password123!", // Note: Using a static password for this example
      captcha_tokens: []
    });

    // Call the Wix API
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

    // Return the response from the Wix API to the frontend
    return new Response(JSON.stringify(data), {
      status: wixResponse.status,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    // Handle any errors that occur
    return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}