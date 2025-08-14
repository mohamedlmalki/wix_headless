// functions/api/headless-list-all.js

async function fetchAllMembers(project) {
  let allMembers = [];
  let offset = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const wixApiUrl = `https://www.wixapis.com/members/v1/members?paging.limit=${limit}&paging.offset=${offset}&fieldsets=FULL`;
    const response = await fetch(wixApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': project.apiKey,
        'wix-site-id': project.siteId,
      }
    });

    if (!response.ok) {
      throw new Error(`Wix API error while fetching members: ${response.statusText}`);
    }
    const data = await response.json();
    
    if (data.members && data.members.length > 0) {
      allMembers = allMembers.concat(data.members);
      offset += data.members.length;
    } else {
      hasMore = false;
    }
    if (!data.metadata || allMembers.length >= data.metadata.total) {
      hasMore = false;
    }
  }
  return allMembers;
}

async function getAdminAndOwnerMemberIds(project) {
    const adminMemberIds = new Set();
    try {
        const rolesUrl = 'https://www.wixapis.com/roles/v1/roles';
        const rolesResponse = await fetch(rolesUrl, {
            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
        });

        if (!rolesResponse.ok) {
            console.warn("Could not fetch site roles. Proceeding without admin filtering.");
            return [];
        }
        
        const { roles } = await rolesResponse.json();
        const adminRoleIds = roles
            .filter(role => role.systemType === 'SITE_CONTRIBUTOR' || role.name === 'Admin' || role.name === 'Owner')
            .map(role => role.id);

        if (adminRoleIds.length === 0) return [];

        for (const roleId of adminRoleIds) {
            const membersInRoleUrl = `https://www.wixapis.com/roles/v1/roles/${roleId}/members`;
            const membersResponse = await fetch(membersInRoleUrl, {
                headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
            });

            if (membersResponse.ok) {
                const { members } = await membersResponse.json();
                if (members) members.forEach(member => adminMemberIds.add(member.id));
            }
        }
    } catch (error) {
        console.error("Failed to get admin/owner roles, proceeding without this filter.", error);
    }
    return Array.from(adminMemberIds);
}

export async function onRequestPost({ request, env }) {
  try {
    const { siteId } = await request.json();
    const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
    if (!projectsJson) throw new Error("Could not retrieve project configurations.");
    
    const project = projectsJson.find(p => p.siteId === siteId);
    if (!project) {
      return new Response(JSON.stringify({ message: `Project not found for siteId: ${siteId}` }), { status: 404 });
    }

    const [allMembers, adminIds] = await Promise.all([
        fetchAllMembers(project),
        getAdminAndOwnerMemberIds(project)
    ]);

    // **CRITICAL FIX**: Filter out admins AND the project owner's email from the config
    const filteredMembers = allMembers.filter(member => {
        const isAdmin = adminIds.includes(member.id);
        const isOwner = project.ownerEmail && member.loginEmail.toLowerCase() === project.ownerEmail.toLowerCase();
        return !isAdmin && !isOwner; // Return only if they are NOT an admin AND NOT the owner
    });

    return new Response(JSON.stringify({ members: filteredMembers }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), { status: 500 });
  }
}