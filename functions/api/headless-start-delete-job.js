import headlessProjects from '../../src/headless/config/headless-config.json';

// Handles POST requests to /api/headless-start-delete-job
export async function onRequestPost({ request, env }) {
  try {
    const { siteId, membersToDelete } = await request.json();

    // Fetch the configuration from the KV store
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

    if (!membersToDelete || !Array.isArray(membersToDelete) || membersToDelete.length === 0) {
      return new Response(JSON.stringify({ message: 'Request must include a non-empty "membersToDelete" array.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // NOTE: Cloudflare Functions currently run for a maximum of 30 seconds. 
    // For very large deletion jobs, a more robust solution using Queues would be needed.
    // This implementation will process deletions sequentially within the time limit.

    // We are not awaiting this call, which allows the function to respond immediately
    // while the deletion process continues in the background.
    startDeletionProcess(project, membersToDelete);

    return new Response(JSON.stringify({ message: `Deletion job for ${membersToDelete.length} members has been queued.` }), {
      status: 202, // 202 Accepted: The request has been accepted for processing, but the processing has not been completed.
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// This function runs the actual deletions.
async function startDeletionProcess(project, membersToDelete) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  for (const member of membersToDelete) {
    try {
      // Step 1: Delete Member
      const memberApiUrl = `https://www.wixapis.com/members/v1/members/${member.memberId}`;
      await fetch(memberApiUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': project.apiKey,
          'wix-site-id': project.siteId,
        }
      });

      await sleep(500); // Wait between calls

      // Step 2: Delete Contact
      const contactApiUrl = `https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`;
      await fetch(contactApiUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': project.apiKey,
          'wix-site-id': project.siteId,
        }
      });
    } catch (error) {
      console.error(`Failed to delete member ${member.memberId}:`, error);
    }
  }
}