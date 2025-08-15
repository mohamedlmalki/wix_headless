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

async function getContributorInfo(project) {
    const contributorContactIds = new Set();
    let ownerContactId = null;
    try {
        // This endpoint correctly fetches site contributors and their roles.
        const contributorsUrl = `https://www.wixapis.com/sites/v1/sites/${project.siteId}/contributors`;
        const contributorsResponse = await fetch(contributorsUrl, {
            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
        });

        if (!contributorsResponse.ok) {
            console.warn("Could not fetch site contributors. Owner protection will be disabled for this operation.");
            return { contributorContactIds: [], ownerContactId: null };
        }
        
        const { contributors } = await contributorsResponse.json();
        if (contributors) {
            contributors.forEach(c => {
                if (c.contactId) contributorContactIds.add(c.contactId);
                if (c.role === 'OWNER') {
                    ownerContactId = c.contactId;
                }
            });
        }
    } catch (error) {
        console.error("Failed to get contributor info:", error);
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
            const [allMembers, { contributorContactIds, ownerContactId }] = await Promise.all([
                fetchAllMembers(project),
                getContributorInfo(project)
            ]);
            
            // Filter out ALL contributors from the list to protect them
            const filteredMembers = allMembers.filter(member => !contributorContactIds.includes(member.contactId));
            
            return new Response(JSON.stringify({ members: filteredMembers, ownerContactId }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: DELETE MEMBERS ---
        if (action === 'delete') {
            const logs = [];

            // ★★★ FIX STARTS HERE ★★★
            // 1. Fetch the owner's contact ID to ensure they are not deleted.
            const { ownerContactId } = await getContributorInfo(project);

            // 2. Filter the incoming list to remove the owner if they were included by mistake.
            const safeMembersToDelete = membersToDelete.filter(member => {
                if (ownerContactId && member.contactId === ownerContactId) {
                    logs.push({ type: 'Protection', batch: 0, status: 'SKIPPED', details: `Skipped deletion of site owner: ${member.loginEmail}` });
                    return false; // Exclude owner from deletion
                }
                return true; // Keep this member in the deletion list
            });

            if (safeMembersToDelete.length === 0) {
                 return new Response(JSON.stringify({ success: true, message: 'Deletion process completed. No members were deleted as only the owner was selected.', logs }), {
                    status: 200, headers: { 'Content-Type': 'application/json' }
                });
            }
            // ★★★ FIX ENDS HERE ★★★

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