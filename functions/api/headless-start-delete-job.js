import headlessProjects from '../../src/headless/config/headless-config.json';

// This helper function will fetch all members, handling pagination automatically.
async function fetchAllMembers(project) {
  let allMembers = [];
  let offset = 0;
  const limit = 1000; // Wix API limit per request
  let hasMore = true;

  while (hasMore) {
    const wixApiUrl = `https://www.wixapis.com/members/v1/members?paging.limit=${limit}&paging.offset=${offset}&fieldsets=FULL`;

    const response = await fetch(wixApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': project.apiKey,
        'wix-site-id': project.siteId,
      }
    });

    if (!response.ok) {
      throw new Error(`Wix API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.members && data.members.length > 0) {
      allMembers = allMembers.concat(data.members);
      offset += data.members.length;
    } else {
      hasMore = false;
    }

    // Check if we've fetched all members
    if (!data.metadata || allMembers.length >= data.metadata.total) {
      hasMore = false;
    }
  }
  return allMembers;
}

// *** ADDED: Helper function to get the site owner's ID ***
async function getSiteOwnerId(project) {
    // This is a common endpoint to get site details, which often includes the owner's info.
    // The exact endpoint might vary, but this is a good starting point.
    const siteDetailsUrl = `https://www.wixapis.com/sites/v1/sites/${project.siteId}`;
    try {
        const response = await fetch(siteDetailsUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': project.apiKey,
                'wix-site-id': project.siteId,
            }
        });
        if (!response.ok) {
            console.warn("Could not fetch site details to identify owner. Proceeding without filtering the owner.");
            return null;
        }
        const data = await response.json();
        // The path to the owner ID might be different, you may need to inspect the response
        // from the Wix API to find the correct path. A common path is `site.ownerInfo.id`.
        return data?.site?.ownerInfo?.id; 
    } catch (error) {
        console.error("Error fetching site owner:", error);
        return null; // Don't block the main functionality if this fails
    }
}


// Handles POST requests to /api/headless-list-all
export async function onRequestPost({ request, env }) {
  try {
    const { siteId } = await request.json();

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

    const [allMembers, ownerId] = await Promise.all([
        fetchAllMembers(project),
        getSiteOwnerId(project)
    ]);

    const filteredMembers = ownerId 
        ? allMembers.filter(member => member.id !== ownerId) 
        : allMembers;

    return new Response(JSON.stringify({ members: filteredMembers }), {
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