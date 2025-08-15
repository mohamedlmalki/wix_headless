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

async function getContributorMemberIds(project) {
    const contributorMemberIds = new Set();
    try {
        const contributorsUrl = `https://www.wixapis.com/sites/v1/sites/${project.siteId}/contributors`;
        const contributorsResponse = await fetch(contributorsUrl, {
            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
        });

        if (!contributorsResponse.ok) {
            console.warn("Could not fetch site contributors. Proceeding without this filter.");
            return [];
        }
        
        const { contributors } = await contributorsResponse.json();
        if (contributors) {
            for (const contributor of contributors) {
                // Find the member ID associated with the contributor's email
                const memberQueryUrl = 'https://www.wixapis.com/members/v1/members/query';
                const memberQueryBody = JSON.stringify({ query: { filter: { loginEmail: contributor.email } } });
                const memberResponse = await fetch(memberQueryUrl, {
                    method: 'POST',
                    headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                    body: memberQueryBody,
                });

                if (memberResponse.ok) {
                    const { members } = await memberResponse.json();
                    if (members && members.length > 0) {
                        contributorMemberIds.add(members[0].id);
                    }
                }
            }
        }
    } catch (error) {
        console.error("Failed to get contributor member IDs, proceeding without this filter.", error);
    }
    return Array.from(contributorMemberIds);
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

    const [allMembers, contributorIds] = await Promise.all([
        fetchAllMembers(project),
        getContributorMemberIds(project)
    ]);

    // Filter out any member who is also a site contributor
    const filteredMembers = allMembers.filter(member => !contributorIds.includes(member.id));

    return new Response(JSON.stringify({ members: filteredMembers }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), { status: 500 });
  }
}