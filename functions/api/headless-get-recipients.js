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

// This is the main function that responds to the frontend
export async function onRequestPost({ request, env }) {
  try {
    const { siteId, campaignId, activity } = await request.json();

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

    if (!campaignId || !activity) {
      return new Response(JSON.stringify({ message: "Request must include 'campaignId' and 'activity'." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- NEW LOGIC: Fetch both lists in parallel for speed ---
    const [allMembers, recipientData] = await Promise.all([
      fetchAllMembers(project),
      fetch(`https://www.wixapis.com/email-marketing/v1/campaigns/${campaignId}/statistics/recipients?activity=${activity}&paging.limit=1000`, {
        method: 'GET',
        headers: {
          'Authorization': project.apiKey,
          'wix-site-id': project.siteId,
        }
      }).then(res => {
        if (!res.ok) throw new Error('Failed to fetch campaign recipients.');
        return res.json();
      })
    ]);

    // --- NEW LOGIC: Create a fast lookup Set of current member emails ---
    const currentMemberEmails = new Set(allMembers.map(member => member.loginEmail));

    // --- NEW LOGIC: Filter the recipients to only include current members ---
    const activeRecipients = (recipientData.recipients || []).filter(recipient => 
      currentMemberEmails.has(recipient.emailAddress)
    );

    // Replace the original recipients list with our filtered list
    const finalData = { ...recipientData, recipients: activeRecipients };

    return new Response(JSON.stringify(finalData), {
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