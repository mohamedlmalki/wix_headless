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

// Fetches all contributors (admins, owners, etc.) for a site
async function getContributorInfo(project) {
    const contactIds = new Set();
    let ownerContactId = null;
    try {
        const contributorsUrl = `https://www.wixapis.com/sites/v1/sites/${project.siteId}/contributors`;
        const contributorsResponse = await fetch(contributorsUrl, {
            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
        });

        if (!contributorsResponse.ok) {
            console.warn("Could not fetch site contributors. Proceeding without this filter.");
            return { contributorContactIds: [], ownerContactId: null };
        }
        
        const { contributors } = await contributorsResponse.json();
        if (contributors) {
            contributors.forEach(c => {
                if(c.contactId) contactIds.add(c.contactId);
                if(c.role === 'OWNER') {
                    ownerContactId = c.contactId;
                }
            });
        }
    } catch (error) {
        console.error("Failed to get contributor contact IDs, proceeding without this filter.", error);
    }
    return { contributorContactIds: Array.from(contactIds), ownerContactId };
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

    const [allMembers, { contributorContactIds, ownerContactId }] = await Promise.all([
        fetchAllMembers(project),
        getContributorInfo(project)
    ]);

    // Filter out any member whose contactId matches a known contributor's contactId
    const filteredMembers = allMembers.filter(member => !contributorContactIds.includes(member.contactId));

    // Return the filtered list AND the owner's contact ID
    return new Response(JSON.stringify({ members: filteredMembers, ownerContactId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ message: 'An error occurred during member listing.', error: e.message }), { status: 500 });
  }
}