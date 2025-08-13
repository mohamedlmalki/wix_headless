// functions/api/headless-send-bulk-webhook.js

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function onRequestPost({ request }) {
  try {
    const { webhookUrl, emails, subject, content } = await request.json();

    if (!webhookUrl || !emails || !Array.isArray(emails) || emails.length === 0) {
      return new Response(JSON.stringify({ message: 'Webhook URL and a non-empty array of emails are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Loop through each email and send a webhook
    for (const email of emails) {
      const payload = {
        string_field: subject,
        uuid_field: crypto.randomUUID(),
        number_field: Math.floor(Math.random() * 100),
        dateTime_field: new Date().toISOString(),
        date_field: new Date().toISOString().split('T')[0],
        time_field: new Date().toTimeString().split(' ')[0],
        uri_field: "https://www.example.com",
        boolean_field: true,
        email_field: email,
        object_field: {
          string_field: content,
          number_field: 100
        },
        array_field: ["item_1", "item_2"]
      };

      try {
        const wixResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (wixResponse.ok) {
          successCount++;
          results.push({ email, status: 'Success' });
        } else {
          failureCount++;
          const errorText = await wixResponse.text();
          results.push({ email, status: 'Failed', reason: errorText || 'Unknown error' });
        }
      } catch (error) {
        failureCount++;
        results.push({ email, status: 'Failed', reason: error.message });
      }
      
      // Add a small delay to avoid overwhelming the webhook endpoint
      await delay(500); 
    }

    return new Response(JSON.stringify({
      message: 'Batch processing complete.',
      successCount,
      failureCount,
      results
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
