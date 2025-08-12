// Simple delay function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Handles POST requests to /api/headless-delete
export async function onRequestPost({ request, env }) {
  try {
    const { siteId, membersToDelete } = await request.json();

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

    if (!membersToDelete || !Array.isArray(membersToDelete)) {
      return new Response(JSON.stringify({ message: "Request must include a 'membersToDelete' array." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const results = [];
    for (const member of membersToDelete) {
      const { memberId, contactId } = member;

      if (!memberId || !contactId) {
        results.push({ memberId, status: 'failed', error: 'Missing memberId or contactId.' });
        continue;
      }

      try {
        // Step 1: Delete the Member
        const memberApiUrl = `https://www.wixapis.com/members/v1/members/${memberId}`;
        const memberRes = await fetch(memberApiUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': project.apiKey,
            'wix-site-id': project.siteId,
          }
        });
        if (!memberRes.ok) throw new Error('Failed to delete member from Wix.');

        await sleep(500);

        // Step 2: Delete the Contact
        const contactApiUrl = `https://www.wixapis.com/contacts/v4/contacts/${contactId}`;
        const contactRes = await fetch(contactApiUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': project.apiKey,
            'wix-site-id': project.siteId,
          }
        });
        if (!contactRes.ok) throw new Error('Failed to delete contact from Wix.');

        results.push({ memberId, status: 'success' });

      } catch (error) {
        results.push({ memberId, status: 'failed', error: error.message });
      }
    }

    return new Response(JSON.stringify(results), {
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