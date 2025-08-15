// functions/api/headless-bulk-operations.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPER FUNCTIONS ---

async function fetchAllMembers(project) {
  let allMembers = [];
  let offset = 0;
  const limit = 1000;
  let hasMore = true;
  while (hasMore) {
    const wixApiUrl = `https://www.wixapis.com/members/v1/members?paging.limit=${limit}&paging.offset=${offset}&fieldsets=FULL`;
    const response = await fetch(wixApiUrl, {
      method: 'GET',
      headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
    });
    if (!response.ok) throw new Error(`Wix API error fetching members: ${await response.text()}`);
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

// ★★★ CORRECTED HELPER FUNCTION ★★★
// This now accurately finds the owner's contactId using the configured ownerEmail.
async function getContributorInfo(project, allMembers) {
    let ownerContactId = null;
    const contributorContactIds = new Set();

    // 1. Identify owner by the email in the project config
    if (project.ownerEmail) {
        const ownerMember = allMembers.find(member => member.loginEmail.toLowerCase() === project.ownerEmail.toLowerCase());
        if (ownerMember) {
            ownerContactId = ownerMember.contactId;
            contributorContactIds.add(ownerContactId); // Add owner to the protected list
        } else {
            console.warn(`Owner email "${project.ownerEmail}" from config not found in member list.`);
        }
    } else {
        console.warn("No 'ownerEmail' is defined in the project configuration. Owner protection is disabled.");
    }
    
    // 2. Also fetch and add any other site contributors to the protected list
    try {
        const contributorsUrl = `https://www.wixapis.com/sites/v1/sites/${project.siteId}/contributors`;
        const contributorsResponse = await fetch(contributorsUrl, {
            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
        });

        if (contributorsResponse.ok) {
            const { contributors } = await contributorsResponse.json();
            contributors?.forEach(c => {
                if (c.contactId) contributorContactIds.add(c.contactId);
            });
        }
    } catch (error) {
        console.error("Could not fetch additional site contributors:", error);
    }

    return { contributorContactIds: Array.from(contributorContactIds), ownerContactId };
}


// --- MAIN HANDLER ---

export async function onRequestPost({ request, env }) {
    const { siteId, action, membersToDelete } = await request.json();

    try {
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });

        // --- ACTION: LIST MEMBERS ---
        if (action === 'list') {
            const allMembers = await fetchAllMembers(project);
            const { contributorContactIds, ownerContactId } = await getContributorInfo(project, allMembers);
            
            // The list sent to the frontend is now pre-filtered to exclude all contributors
            const filteredMembers = allMembers.filter(member => !contributorContactIds.includes(member.contactId));
            
            return new Response(JSON.stringify({ members: filteredMembers, ownerContactId }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: DELETE MEMBERS ---
        if (action === 'delete') {
            const logs = [];
            
            // For maximum safety, re-fetch the owner's ID on the backend before every delete operation.
            const allMembers = await fetchAllMembers(project);
            const { ownerContactId } = await getContributorInfo(project, allMembers);

            const safeMembersToDelete = membersToDelete.filter(member => {
                if (ownerContactId && member.contactId === ownerContactId) {
                    logs.push({ type: 'Protection', batch: 0, status: 'SKIPPED', details: `Site owner was in the request but was skipped for protection.` });
                    return false;
                }
                return true;
            });
            
            if (safeMembersToDelete.length === 0) {
                 return new Response(JSON.stringify({ success: true, message: 'Deletion process completed. No members were deleted.', logs }), {
                    status: 200, headers: { 'Content-Type': 'application/json' }
                });
            }

            const memberChunks = [];
            for (let i = 0; i < safeMembersToDelete.length; i += 100) {
                memberChunks.push(safeMembersToDelete.slice(i, i + 100));
            }

            for (let i = 0; i < memberChunks.length; i++) {
                const chunk = memberChunks[i];
                const batchNum = i + 1;
                const memberIdsInChunk = chunk.map(m => m.id);

                try {
                    const response = await fetch('https://www.wixapis.com/members/v1/members/bulk/delete', {
                        method: 'POST',
                        headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ member_ids: memberIdsInChunk })
                    });
                     if (!response.ok) throw new Error(`Batch ${batchNum} failed: ${await response.text()}`);
                    logs.push({ type: 'Member Deletion', batch: batchNum, status: 'SUCCESS', details: `Bulk deleted ${memberIdsInChunk.length} member profiles.` });
                } catch (error) {
                    logs.push({ type: 'Member Deletion', batch: batchNum, status: 'ERROR', details: error.message });
                    throw error;
                }

                await delay(1000);

                for (const member of chunk) {
                    try {
                        await fetch(`https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
                        });
                    } catch (error) {
                        logs.push({ type: 'Contact Deletion', batch: batchNum, status: 'WARNING', details: `Failed to delete contact for ${member.loginEmail}: ${error.message}` });
                    }
                }
                logs.push({ type: 'Contact Deletion', batch: batchNum, status: 'SUCCESS', details: `Processed contacts for batch ${batchNum}.` });
            }
            return new Response(JSON.stringify({ success: true, message: 'Deletion process completed.', logs }), {
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