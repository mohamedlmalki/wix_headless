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
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Wix API Error: Status ${response.status} - ${errorText}`);
    }
    if (response.status === 204 || response.headers.get('content-length') === '0') {
        return {};
    }
    return response.json();
};

const getOwnerInfo = async (project, allMembers, logs) => {
    // This function remains the same, providing the robust owner check.
    let ownerContactId = null;
    logs.push({ type: 'Owner Check', status: 'IN_PROGRESS', details: 'Attempting to identify owner via Contributors API...' });
    try {
        const contributorsUrl = 'https://www.wixapis.com/roles-management/v2/contributors/query';
        const body = { query: { filter: { policyIds: ["wix.platform.roles.owner"] } } };
        const data = await makeWixApiRequest(contributorsUrl, project, 'POST', body);
        
        if (data.contributors && data.contributors.length > 0) {
            const ownerMemberId = data.contributors[0].accountId;
            const owner = allMembers.find(m => m.id === ownerMemberId);
            if (owner) {
                ownerContactId = owner.contactId;
                logs.push({ type: 'Owner Check', status: 'SUCCESS', details: `Owner identified via API: ${owner.loginEmail}` });
            } else {
                 logs.push({ type: 'Owner Check', status: 'WARNING', details: `Owner ID found, but not present in site's member list.` });
            }
        }
    } catch (error) {
        logs.push({ type: 'Owner Check', status: 'FAILED', details: `Primary method failed (likely missing permissions): ${error.message}` });
        logs.push({ type: 'Owner Check', status: 'IN_PROGRESS', details: 'Falling back to ownerEmail from project configuration...' });
        if (project.ownerEmail) {
            const owner = allMembers.find(m => m.loginEmail.toLowerCase() === project.ownerEmail.toLowerCase());
            if (owner) {
                ownerContactId = owner.contactId;
                logs.push({ type: 'Owner Check', status: 'SUCCESS', details: `Owner identified via fallback email: ${project.ownerEmail}` });
            } else {
                logs.push({ type: 'Owner Check', status: 'FAILED', details: `Fallback failed: Email "${project.ownerEmail}" not found in member list.` });
            }
        } else {
            logs.push({ type: 'Owner Check', status: 'FAILED', details: 'Fallback failed: No ownerEmail is configured for this project.' });
        }
    }
    return { ownerContactId };
};

export async function onRequestPost({ request, env }) {
    const { siteId, action, membersToDelete } = await request.json();
    const logs = [];

    try {
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) return new Response(JSON.stringify({ message: "Project not found", logs }), { status: 404 });

        if (action === 'list') {
            // ... The 'list' action remains the same ...
            logs.push({ type: 'Setup', status: 'IN_PROGRESS', details: 'Fetching all site members...' });
            const allMembersData = await makeWixApiRequest(`https://www.wixapis.com/members/v1/members?fieldsets=FULL&paging.limit=1000`, project, 'GET');
            const allMembers = allMembersData.members || [];
            logs.push({ type: 'Setup', status: 'SUCCESS', details: `Found ${allMembers.length} total members.` });
            
            const { ownerContactId } = await getOwnerInfo(project, allMembers, logs);
            
            const filteredMembers = ownerContactId ? allMembers.filter(m => m.contactId !== ownerContactId) : allMembers;
            
            return new Response(JSON.stringify({ members: filteredMembers, ownerContactId, logs }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        if (action === 'delete') {
            logs.push({ type: 'Job Start', status: 'IN_PROGRESS', details: `Starting deletion job for ${membersToDelete.length} members.` });
            
            const allMembersData = await makeWixApiRequest(`https://www.wixapis.com/members/v1/members?fieldsets=FULL&paging.limit=1000`, project, 'GET');
            const allMembers = allMembersData.members || [];
            const { ownerContactId } = await getOwnerInfo(project, allMembers, logs);

            const safeMembersToDelete = membersToDelete.filter(member => {
                if (ownerContactId && member.contactId === ownerContactId) {
                    logs.push({ type: 'Protection', status: 'SKIPPED', details: `Site owner (${member.loginEmail}) was excluded from deletion.` });
                    return false;
                }
                return true;
            });

            if (safeMembersToDelete.length === 0) {
                 logs.push({ type: 'Job End', status: 'SUCCESS', details: 'No members to delete after filtering.' });
                return new Response(JSON.stringify({ success: true, message: 'No members to delete.', logs }), { status: 200 });
            }
            
            // ★★★ BATCHING LOGIC UPDATE ★★★
            const memberChunks = [];
            for (let i = 0; i < safeMembersToDelete.length; i += 100) {
                memberChunks.push(safeMembersToDelete.slice(i, i + 100));
            }

            for (let i = 0; i < memberChunks.length; i++) {
                const chunk = memberChunks[i];
                const batchNum = i + 1;
                
                // Log for Member Deletion Batch
                try {
                    const memberIdsToDelete = chunk.map(m => m.id);
                    await makeWixApiRequest('https://www.wixapis.com/members/v1/members/bulk/delete', project, 'POST', { member_ids: memberIdsToDelete });
                    logs.push({ type: 'Member Profile Deletion', batch: batchNum, status: 'SUCCESS', details: `Deleted ${chunk.length} member profiles.`, members: chunk });
                } catch (error) {
                    logs.push({ type: 'Member Profile Deletion', batch: batchNum, status: 'FAILED', details: error.message, members: chunk });
                }

                await delay(500);

                // Log for Contact Deletion Batch
                const contactLog = { type: 'Contact Deletion', batch: batchNum, status: 'COMPLETED', details: `Processed ${chunk.length} contacts.`, members: chunk, contactResults: [] };
                for (const member of chunk) {
                    try {
                        await makeWixApiRequest(`https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`, project, 'DELETE');
                        contactLog.contactResults.push({ email: member.loginEmail, status: 'SUCCESS' });
                    } catch (error) {
                        contactLog.contactResults.push({ email: member.loginEmail, status: 'ERROR', error: error.message });
                    }
                }
                logs.push(contactLog);
            }

            logs.push({ type: 'Job End', status: 'SUCCESS', details: 'Bulk delete operation completed.' });
            
            return new Response(JSON.stringify({ success: true, message: 'Bulk delete operation completed.', logs }), { status: 200 });
        }

        return new Response(JSON.stringify({ message: "Invalid action specified." }), { status: 400 });

    } catch (e) {
        logs.push({ type: 'Critical Error', status: 'FAILED', details: e.message });
        return new Response(JSON.stringify({ success: false, message: 'A critical error occurred.', error: e.message, logs }), { status: 500 });
    }
}