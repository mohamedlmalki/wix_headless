// functions/api/headless-bulk-operations.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to make a generic, authenticated request to the Wix API
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
    const responseData = await response.json();
    if (!response.ok) {
        throw new Error(responseData.message || `Wix API error with status: ${response.status}`);
    }
    return responseData;
};

// ★★★ ROBUST HELPER FUNCTION WITH FALLBACK ★★★
const getOwnerInfo = async (project, allMembers) => {
    let ownerMemberId = null;

    // 1. Primary Method: Try the official contributors API first.
    try {
        const contributorsUrl = 'https://www.wixapis.com/roles-management/v2/contributors/query';
        const body = { query: { filter: { policyIds: ["wix.platform.roles.owner"] } } };
        const data = await makeWixApiRequest(contributorsUrl, project, 'POST', body);
        if (data.contributors && data.contributors.length > 0) {
            ownerMemberId = data.contributors[0].accountId;
        }
    } catch (error) {
        console.warn(`Could not fetch owner via contributors API (likely missing permissions). Falling back to ownerEmail. Error: ${error.message}`);
        ownerMemberId = null; // Ensure it's null if the API fails
    }

    // 2. Find the owner's contactId using their memberId or fallback to ownerEmail
    let ownerContactId = null;
    if (ownerMemberId) {
        const owner = allMembers.find(m => m.id === ownerMemberId);
        if (owner) {
            ownerContactId = owner.contactId;
        }
    } 
    // 3. Fallback Method: If the primary method failed, use the reliable ownerEmail from config.
    else if (project.ownerEmail) {
        const owner = allMembers.find(m => m.loginEmail.toLowerCase() === project.ownerEmail.toLowerCase());
        if (owner) {
            ownerContactId = owner.contactId;
            console.log(`Successfully identified owner via fallback email: ${project.ownerEmail}`);
        } else {
             console.warn(`Owner email "${project.ownerEmail}" from config was not found in the member list.`);
        }
    } else {
        console.warn("No owner could be identified. Protection is limited.");
    }

    return { ownerContactId };
};

// Main Handler
export async function onRequestPost({ request, env }) {
    const { siteId, action, membersToDelete } = await request.json();

    try {
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });

        // --- ACTION: LIST MEMBERS ---
        if (action === 'list') {
            const allMembersUrl = 'https://www.wixapis.com/members/v1/members?fieldsets=FULL&paging.limit=1000';
            const allMembersData = await makeWixApiRequest(allMembersUrl, project, 'GET');
            const allMembers = allMembersData.members || [];
            
            const { ownerContactId } = await getOwnerInfo(project, allMembers);
            
            const filteredMembers = ownerContactId 
                ? allMembers.filter(m => m.contactId !== ownerContactId)
                : allMembers;
            
            return new Response(JSON.stringify({ members: filteredMembers, ownerContactId }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: DELETE MEMBERS ---
        if (action === 'delete') {
            const logs = [];
            
            const allMembersUrl = 'https://www.wixapis.com/members/v1/members?fieldsets=FULL&paging.limit=1000';
            const allMembersData = await makeWixApiRequest(allMembersUrl, project, 'GET');
            const allMembers = allMembersData.members || [];

            const { ownerContactId } = await getOwnerInfo(project, allMembers);

            const safeMembersToDelete = membersToDelete.filter(member => {
                if (ownerContactId && member.contactId === ownerContactId) {
                    logs.push({ type: 'Protection', batch: 0, status: 'SKIPPED', details: `Site owner was in the request but was skipped for protection.` });
                    return false;
                }
                return true;
            });

            if (safeMembersToDelete.length === 0) {
                return new Response(JSON.stringify({ success: true, message: 'No members to delete after filtering.', logs }), {
                    status: 200, headers: { 'Content-Type': 'application/json' }
                });
            }

            const memberIdsToDelete = safeMembersToDelete.map(m => m.id);
            await makeWixApiRequest('https://www.wixapis.com/members/v1/members/bulk/delete', project, 'POST', { member_ids: memberIdsToDelete });
            logs.push({ type: 'Member Profile Deletion', batch: 1, status: 'SUCCESS', details: `Successfully deleted ${memberIdsToDelete.length} member profiles.` });

            await delay(1000);

            const contactResults = [];
            for (const member of safeMembersToDelete) {
                const contactUrl = `https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`;
                try {
                    await makeWixApiRequest(contactUrl, project, 'DELETE');
                    contactResults.push({ email: member.loginEmail, status: 'SUCCESS' });
                } catch (error) {
                    contactResults.push({ email: member.loginEmail, status: 'ERROR', error: error.message });
                }
            }
            logs.push({ type: 'Contact Deletion', batch: 1, status: 'COMPLETED', details: 'Contact deletion process finished.', contactResults });
            
            return new Response(JSON.stringify({ success: true, message: 'Bulk delete operation completed.', logs }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ message: "Invalid action specified." }), { status: 400 });

    } catch (e) {
        return new Response(JSON.stringify({ success: false, message: 'A critical error occurred.', error: e.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}