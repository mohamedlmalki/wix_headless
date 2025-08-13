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

    const allMembers = await fetchAllMembers(project);

    // *** NEW: Filter out any member that has the "Admin" role ***
    const filteredMembers = allMembers.filter(member => {
        // Check if the member has a 'roles' array and if that array includes a role named "Admin"
        const isAdmin = member.roles && member.roles.some(role => role.name === 'Admin');
        return !isAdmin;
    });

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