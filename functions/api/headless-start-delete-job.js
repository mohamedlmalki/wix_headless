// functions/api/headless-start-delete-job.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const makeApiRequest = async (url, options, body = null) => {
    const fetchOptions = { ...options };
    if (body) {
        fetchOptions.body = JSON.stringify(body);
    }
    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API call to ${url} failed with status ${response.status}: ${errorText}`);
    }
    try {
        return await response.json();
    } catch (e) {
        return {}; // Return empty object if no JSON body
    }
};

export async function onRequestPost({ request, env }) {
    const { siteId, membersToDelete } = await request.json();
    const logs = [];

    try {
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) throw new Error("Could not retrieve project configurations.");
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) {
            return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });
        }

        const defaultOptions = {
            headers: { 
                'Authorization': project.apiKey, 
                'wix-site-id': project.siteId, 
                'Content-Type': 'application/json' 
            }
        };

        // Step 1: Bulk delete members
        const memberIds = membersToDelete.map(m => m.memberId);
        const memberChunks = [];
        for (let i = 0; i < memberIds.length; i += 100) {
            memberChunks.push(memberIds.slice(i, i + 100));
        }

        for (let i = 0; i < memberChunks.length; i++) {
            try {
                await makeApiRequest(
                    'https://www.wixapis.com/members/v1/members/bulk/delete', 
                    { ...defaultOptions, method: 'POST' }, 
                    { memberIds: memberChunks[i] }
                );
                logs.push({ type: 'Member Deletion', batch: i + 1, status: 'SUCCESS', details: `Deleted ${memberChunks[i].length} members.` });
            } catch (error) {
                logs.push({ type: 'Member Deletion', batch: i + 1, status: 'ERROR', details: error.message });
                throw new Error('A critical error occurred during member deletion.');
            }
        }

        // Step 2: Delete contacts one by one with a delay
        for (let i = 0; i < membersToDelete.length; i++) {
            const member = membersToDelete[i];
            const contactResults = [];

            try {
                await makeApiRequest(
                    `https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`,
                    { ...defaultOptions, method: 'DELETE' }
                );
                contactResults.push({ email: member.loginEmail || `ContactID: ${member.contactId}`, status: 'SUCCESS' });
            } catch (error) {
                contactResults.push({ email: member.loginEmail || `ContactID: ${member.contactId}`, status: 'ERROR', error: error.message });
            }

            if (i % 10 === 0 || i === membersToDelete.length - 1) { // Log in batches of 10 for contacts
                 logs.push({ 
                    type: 'Contact Deletion', 
                    batch: Math.floor(i / 10) + 1, 
                    status: contactResults.some(r => r.status === 'ERROR') ? 'PARTIAL_SUCCESS' : 'SUCCESS', 
                    details: `Processed ${contactResults.length} contacts.`,
                    contactResults 
                });
            }
            await delay(200); // 200ms delay to avoid rate limits
        }
        
        return new Response(JSON.stringify({ success: true, message: 'Deletion process completed.', logs }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });

    } catch (e) {
        return new Response(JSON.stringify({ success: false, message: e.message, logs }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}