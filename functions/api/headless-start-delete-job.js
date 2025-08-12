import headlessProjects from '../../src/headless/config/headless-config.json';

// This function runs in the background to delete members and track progress
async function startDeletionProcess(project, membersToDelete, jobsKV) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const total = membersToDelete.length;
  const jobId = `delete-${project.siteId}`;

  for (let i = 0; i < total; i++) {
    const member = membersToDelete[i];
    const progress = {
      jobId: jobId,
      status: 'running',
      processed: i + 1,
      total: total,
      timestamp: Date.now()
    };
    
    // Update the progress in the KV store
    await jobsKV.put(jobId, JSON.stringify(progress));

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

      await sleep(500);

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

  // Mark the job as complete
  const finalStatus = { jobId: jobId, status: 'complete', processed: total, total: total, timestamp: Date.now() };
  await jobsKV.put(jobId, JSON.stringify(finalStatus));
}

// This is the main function that responds to the frontend
export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const { siteId, membersToDelete } = await request.json();

    const projectsJson = await env.WIX_HEADLESS_CONFIG.get('projects', { type: 'json' });
    if (!projectsJson) throw new Error("Could not retrieve project configurations.");
    
    const project = projectsJson.find(p => p.siteId === siteId);
    if (!project) return new Response(JSON.stringify({ message: `Project not found` }), { status: 404 });

    if (!membersToDelete || !Array.isArray(membersToDelete) || membersToDelete.length === 0) {
        return new Response(JSON.stringify({ message: 'Request must include a non-empty "membersToDelete" array.'}), { status: 400 });
    }
    
    // Pass the jobs KV namespace to the background process
    waitUntil(startDeletionProcess(project, membersToDelete, env.WIX_HEADLESS_JOBS));

    return new Response(JSON.stringify({ message: `Deletion job for ${membersToDelete.length} members has been queued.` }), {
      status: 202,
    });

  } catch (e) {
    return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), { status: 500 });
  }
}