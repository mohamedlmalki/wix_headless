// functions/api/headless-bulk-operations.js

const makeWixApiRequest = async (url, project, method = 'GET', body = null) => {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': project.apiKey,
            'wix-site-id': project.siteId,
        }
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Wix API Error: Status ${response.status} - ${errorText}`);
    }
    if (response.status === 204 || response.headers.get('content-length') === '0') {
        return {};
    }
    return response.json();
};

const getOwnerInfo = async (project, allMembers) => {
    // This robust function remains the same to protect the owner.
    let ownerContactId = null;
    try {
        const contributorsUrl = 'https://www.wixapis.com/roles-management/v2/contributors/query';
        const body = { query: { filter: { policyIds: ["wix.platform.roles.owner"] } } };
        const data = await makeWixApiRequest(contributorsUrl, project, 'POST', body);
        if (data.contributors && data.contributors.length > 0) {
            const ownerMemberId = data.contributors[0].accountId;
            const owner = allMembers.find(m => m.id === ownerMemberId);
            if (owner) ownerContactId = owner.contactId;
        }
    } catch (error) {
        if (project.ownerEmail) {
            const owner = allMembers.find(m => m.loginEmail.toLowerCase() === project.ownerEmail.toLowerCase());
            if (owner) ownerContactId = owner.contactId;
        }
    }
    return { ownerContactId };
};

export async function onRequestPost({ request, env }) {
    const { siteId, action, member } = await request.json(); // Now expects a single 'member' for deletion

    try {
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });

        if (action === 'list') {
            const allMembersData = await makeWixApiRequest(`https://www.wixapis.com/members/v1/members?fieldsets=FULL&paging.limit=1000`, project, 'GET');
            const allMembers = allMembersData.members || [];
            const { ownerContactId } = await getOwnerInfo(project, allMembers);
            const filteredMembers = ownerContactId ? allMembers.filter(m => m.contactId !== ownerContactId) : allMembers;
            return new Response(JSON.stringify({ members: filteredMembers }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        // ★★★ NEW: Simplified 'delete' action for a single member ★★★
        if (action === 'delete') {
            if (!member || !member.id || !member.contactId) {
                 return new Response(JSON.stringify({ success: false, message: "A valid member object with id and contactId is required." }), { status: 400 });
            }
            // Step 1: Delete member profile
            await makeWixApiRequest(`https://www.wixapis.com/members/v1/members/${member.id}`, project, 'DELETE');
            
            // Step 2: Delete associated contact
            await makeWixApiRequest(`https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`, project, 'DELETE');
            
            return new Response(JSON.stringify({ success: true, message: `Successfully deleted ${member.loginEmail}` }), { status: 200 });
        }

        return new Response(JSON.stringify({ message: "Invalid action specified." }), { status: 400 });

    } catch (e) {
        return new Response(JSON.stringify({ success: false, message: 'A critical error occurred.', error: e.message }), { status: 500 });
    }
}