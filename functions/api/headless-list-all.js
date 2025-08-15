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
      const errorText = await response.text();
      throw new Error(`Wix API error while fetching members: ${errorText}`);
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

// **UPDATED FUNCTION USING YOUR PROVIDED API ENDPOINT**
async function getContributorInfo(project) {
    const contributorMemberIds = new Set();
    let ownerMemberId = null; 
    try {
        // Using the correct endpoint you provided
        const contributorsUrl = `https://www.wixapis.com/roles-management/v2/contributors/query`;
        const contributorsResponse = await fetch(contributorsUrl, {
            method: 'POST', // This endpoint uses POST for querying
            headers: { 
                'Authorization': project.apiKey, 
                'wix-site-id': project.siteId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({}) // Empty filter to get all contributors
        });

        if (!contributorsResponse.ok) {
            console.warn("Could not fetch site contributors. Proceeding without this filter.");
            return { contributorMemberIds: [], ownerMemberId: null };
        }
        
        const { contributors } = await contributorsResponse.json();
        if (contributors) {
            contributors.forEach(c => {
                if(c.memberId) {
                    contributorMemberIds.add(c.memberId);
                    // Assuming the owner is among the contributors returned
                    // A more robust solution might check a specific role if available
                }
            });
            // Heuristic: Often the first contributor is the owner, but this is not guaranteed.
            // A better approach would be to have a separate call to identify the owner if this fails.
            if(contributors[0] && contributors[0].memberId) {
                 ownerMemberId = contributors[0].memberId;
            }
        }
    } catch (error) {
        console.error("Failed to get contributor member IDs.", error);
    }
    return { contributorMemberIds: Array.from(contributorMemberIds), ownerMemberId };
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

    const [allMembers, { contributorMemberIds, ownerMemberId }] = await Promise.all([
        fetchAllMembers(project),
        getContributorInfo(project)
    ]);

    // Filter out any member whose ID matches a known contributor's ID
    const filteredMembers = allMembers.filter(member => !contributorMemberIds.includes(member.id));

    // Return the safe list AND the specific ID of the owner
    return new Response(JSON.stringify({ members: filteredMembers, ownerContactId: ownerMemberId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ message: 'An error occurred during member listing.', error: e.message }), { status: 500 });
  }
}