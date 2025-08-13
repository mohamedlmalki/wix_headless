const doBulkDeletion = async () => {
    let currentState = {};
    const totalMembers = membersToDelete.length;
    
    // Chunk all members into batches of 100
    const memberChunks = chunkArray(membersToDelete, 100);
    const totalSteps = memberChunks.length * 2; // Each chunk has two steps
    let stepsCompleted = 0;

    for (const chunk of memberChunks) {
        // --- STEP 1: Delete a batch of up to 100 Members in parallel ---
        stepsCompleted++;
        currentState = { status: 'running', processed: stepsCompleted, total: totalSteps, step: `Deleting member batch ${Math.ceil(stepsCompleted / 2)} of ${memberChunks.length}...` };
        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));

        const memberDeletePromises = chunk.map(member => {
            const memberApiUrl = `https://www.wixapis.com/members/v1/members/${member.memberId}`;
            return fetch(memberApiUrl, {
                method: 'DELETE',
                headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
            });
        });

        await Promise.allSettled(memberDeletePromises);
        
        // --- Wait for 1 second as requested ---
        await delay(1000);

        // --- STEP 2: Delete the corresponding Contacts for that batch in parallel ---
        stepsCompleted++;
        currentState = { status: 'running', processed: stepsCompleted, total: totalSteps, step: `Deleting contact batch ${Math.ceil(stepsCompleted / 2)} of ${memberChunks.length}...` };
        await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify(currentState));
        
        const contactDeletePromises = chunk.map(member => {
             const contactApiUrl = `https://www.wixapis.com/contacts/v4/contacts/${member.contactId}`;
             return fetch(contactApiUrl, {
                 method: 'DELETE',
                 headers: { 'Authorization': project.apiKey, 'wix-site-id': project.siteId }
             });
        });
        
        await Promise.allSettled(contactDeletePromises);
    }

    await env.WIX_HEADLESS_CONFIG.put(jobKey, JSON.stringify({ status: 'complete', processed: totalSteps, total: totalSteps, step: 'Done!' }));
};