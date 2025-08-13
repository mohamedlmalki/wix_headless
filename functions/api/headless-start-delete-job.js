// This is a temporary version for debugging the 403 error.
// It performs the action directly instead of in the background.

export async function onRequestPost({ request, env }) {
    try {
        const { siteId, membersToDelete } = await request.json();

        // 1. Get Project Config
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) {
            return new Response(JSON.stringify({ message: "Could not retrieve project configurations." }), { status: 500 });
        }
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) {
            return new Response(JSON.stringify({ message: "Project not found" }), { status: 404 });
        }

        // 2. Prepare Member Deletion
        const memberIds = membersToDelete.map(m => m.memberId);
        if (memberIds.length > 100) {
             return new Response(JSON.stringify({ message: "For this test, please select 100 or fewer members." }), { status: 400 });
        }

        // 3. Call Wix API directly and await the response
        const wixResponse = await fetch('https://www.wixapis.com/members/v1/members/bulk/delete', {
            method: 'POST',
            headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId, 'Content-Type': 'application/json' },
            body: JSON.stringify({ "memberIds": memberIds })
        });
        
        // 4. Forward the exact response (or error) from Wix back to the frontend
        const responseBody = await wixResponse.text();
        const responseHeaders = new Headers(wixResponse.headers);
        responseHeaders.set('Content-Type', 'application/json');

        return new Response(responseBody, {
            status: wixResponse.status,
            statusText: wixResponse.statusText,
            headers: responseHeaders
        });

    } catch (e) {
        return new Response(JSON.stringify({ message: 'An error occurred in the Cloudflare function.', error: e.message }), { status: 500 });
    }
}