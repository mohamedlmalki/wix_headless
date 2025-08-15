// functions/api/headless-bulk-operations.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to make a generic, authenticated request to the Wix API
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

// Helper function to get the Owner's Member ID using the documented API
const getOwnerMemberId = async (project) => {
    const contributorsUrl = 'https://www.wixapis.com/roles-management/v2/contributors/query';
    const body = {
        query: {
            // This filter specifically asks for the site owner role
            filter: { policyIds: ["wix.platform.roles.owner"] }
        }
    };
    const data = await makeWixApiRequest(contributorsUrl, project, 'POST', body);
    
    if (data.contributors && data.contributors.length > 0) {
        // As you discovered, the accountId from this response is the memberId
        return data.contributors[0].accountId;
    }
    console.warn(`Could not find an owner for siteId: ${project.siteId}`);
    return null;
};


// Main Handler
export async function onRequestPost({ request, env }) {
    const { siteId, action, membersToDelete } = await request.json();

    try {
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });

        // --- ACTION: LIST MEMBERS (Now the primary and safe way to get members) ---
        if (action === 'list') {
            const ownerMemberId = await getOwnerMemberId(project);
            
            const membersUrl = 'https://www.wixapis.com/members/v1/members?fieldsets=FULL&paging.limit=1000';
            const allMembersData = await makeWixApiRequest(membersUrl, project, 'GET');
            const allMembers = allMembersData.members || [];
            
            const owner = ownerMemberId ? allMembers.find(m => m.id === ownerMemberId) : null;
            const ownerContactId = owner ? owner.contactId : null;

            // Securely filter out the owner before sending the list to the frontend
            const filteredMembers = ownerContactId 
                ? allMembers.filter(m => m.contactId !== ownerContactId)
                : allMembers;
            
            return new Response(JSON.stringify({ members: filteredMembers, ownerContactId }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: DELETE MEMBERS (With final server-side protection) ---
        if (action === 'delete') {
            const logs = [];

            // Final safety check: re-fetch the owner ID to ensure nothing has changed
            const ownerMemberId = await getOwnerMemberId(project);
            
            const safeMembersToDelete = membersToDelete.filter(member => {
                if (ownerMemberId && member.id === ownerMemberId) {
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

            // Step 1: Bulk delete member profiles
            const memberIdsToDelete = safeMembersToDelete.map(m => m.id);
            await makeWixApiRequest('https://www.wixapis.com/members/v1/members/bulk/delete', project, 'POST', { member_ids: memberIdsToDelete });
            logs.push({ type: 'Member Profile Deletion', batch: 1, status: 'SUCCESS', details: `Successfully deleted ${memberIdsToDelete.length} member profiles.` });

            await delay(1000); // Small delay for Wix to process

            // Step 2: Delete associated contacts and log each result
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