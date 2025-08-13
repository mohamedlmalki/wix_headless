// A simple delay function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function onRequestPost({ request, env }) {
  try {
    const { siteId, memberId, contactId } = await request.json();

    const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
    if (!projectsJson) {
      throw new Error("Could not retrieve project configurations.");
    }

    const project = projectsJson.find(p => p.siteId === siteId);

    if (!project) {
      return new Response(JSON.stringify({ message: `Project configuration not found for siteId: ${siteId}` }), { status: 404 });
    }

    if (!memberId || !contactId) {
        return new Response(JSON.stringify({ message: 'Request must include memberId and contactId.' }), { status: 400 });
    }

    // Step 1: Delete the Member
    const memberApiUrl = `https://www.wixapis.com/members/v1/members/${memberId}`;
    const memberRes = await fetch(memberApiUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': project.apiKey,
        'wix-site-id': project.siteId,
      }
    });
    // A 404 is acceptable, it means the member was already deleted.
    if (!memberRes.ok && memberRes.status !== 404) {
      const errorText = await memberRes.text();
      throw new Error(`Failed to delete member from Wix: ${errorText}`);
    }

    // ★★★ IMPORTANT: Wait 1 second as requested by the user ★★★
    await sleep(1000);

    // Step 2: Delete the Contact
    const contactApiUrl = `https://www.wixapis.com/contacts/v4/contacts/${contactId}`;
    const contactRes = await fetch(contactApiUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': project.apiKey,
        'wix-site-id': project.siteId,
      }
    });

    if (!contactRes.ok && contactRes.status !== 404) {
      const errorText = await contactRes.text();
      throw new Error(`Failed to delete contact from Wix: ${errorText}`);
    }

    return new Response(JSON.stringify({ memberId, status: 'success' }), {
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