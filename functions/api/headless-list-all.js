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

// Fetches all members who are admins or contributors
async function getAdminMemberIds(project) {
    const adminMemberIds = new Set();
    
    // First, get all available roles for the site
    const rolesUrl = 'https://www.wixapis.com/roles/v1/roles';
    const rolesResponse = await fetch(rolesUrl, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': project.apiKey,
            'wix-site-id': project.siteId,
        }
    });

    if (!rolesResponse.ok) {
        console.warn("Could not fetch site roles. Proceeding without filtering admins.");
        return [];
    }
    
    const { roles } = await rolesResponse.json();
    
    // Find the IDs of roles that are for site contributors (admins)
    const adminRoleIds = roles
        .filter(role => role.systemType === 'SITE_CONTRIBUTOR' || role.name === 'Admin')
        .map(role => role.id);

    if (adminRoleIds.length === 0) {
        return [];
    }

    // For each admin role, get the members assigned to it
    for (const roleId of adminRoleIds) {
        const membersInRoleUrl = `https://www.wixapis.com/roles/v1/roles/${roleId}/members`;
        const membersResponse = await fetch(membersInRoleUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': project.apiKey,
                'wix-site-id': project.siteId,
            }
        });

        if (membersResponse.ok) {
            const { members } = await membersResponse.json();
            if (members) {
                members.forEach(member => adminMemberIds.add(member.id));
            }
        }
    }

    return Array.from(adminMemberIds);
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

    // Fetch both lists in parallel
    const [allMembers, adminIds] = await Promise.all([
        fetchAllMembers(project),
        getAdminMemberIds(project)
    ]);

    // Filter out admins from the role-based check AND filter out the site owner directly
    const filteredMembers = allMembers.filter(member => {
        const isOwner = member.mainRole === 'OWNER';
        const isAdmin = adminIds.includes(member.id);
        return !isOwner && !isAdmin;
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