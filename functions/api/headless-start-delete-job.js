// functions/api/headless-start-delete-job.js (Temporary Debugging Version)

// Helper to safely get the full error details from a response
async function getErrorDetails(response) {
    const errorText = await response.text();
    try {
        // Try to parse it as JSON for a clean look
        const parsed = JSON.parse(errorText);
        return JSON.stringify(parsed, null, 2);
    } catch (e) {
        // If it's not JSON, return the raw text
        return errorText || "No additional error details were provided by the API.";
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const { siteId, membersToDelete } = await request.json();

    try {
        // 1. Get Project Configuration
        const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
        if (!projectsJson) {
            return new Response(JSON.stringify({ message: "Could not retrieve project configurations." }), { status: 500, headers: { 'Content-Type': 'application/json' }});
        }
        
        const project = projectsJson.find(p => p.siteId === siteId);
        if (!project) {
            return new Response(JSON.stringify({ message: "Project not found in configuration." }), { status: 404, headers: { 'Content-Type': 'application/json' }});
        }

        // 2. Prepare Member IDs for Deletion
        const memberIds = membersToDelete.map(m => m.memberId);
        if (!memberIds || memberIds.length === 0) {
            return new Response(JSON.stringify({ message: "No member IDs were provided for deletion." }), { status: 400, headers: { 'Content-Type': 'application/json' }});
        }

        // 3. Call the Wix API directly
        const wixResponse = await fetch('https://www.wixapis.com/members/v1/members/bulk/delete', {
            method: 'POST',
            headers: {
                // Using the exact headers from the documentation
                'Authorization': project.apiKey,
                'wix-site-id': project.siteId,
                'Content-Type': 'application/json;charset=UTF-8'
            },
            body: JSON.stringify({ "memberIds": memberIds })
        });
        
        // 4. Check the response from Wix
        if (!wixResponse.ok) {
            // If the response is not OK, get the detailed error and send it back
            const errorDetails = await getErrorDetails(wixResponse);
            const errorMessage = `Wix API responded with status ${wixResponse.status} (${wixResponse.statusText}): ${errorDetails}`;
            
            // This detailed error will now appear in the red toast on the frontend
            return new Response(JSON.stringify({ message: errorMessage }), { status: 400, headers: { 'Content-Type': 'application/json' }});
        }

        // 5. If successful, send back the success response from Wix
        const successData = await wixResponse.json();
        return new Response(JSON.stringify(successData), { status: 200, headers: { 'Content-Type': 'application/json' }});

    } catch (e) {
        return new Response(JSON.stringify({ message: 'A critical error occurred in the Cloudflare function.', error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' }});
    }
}