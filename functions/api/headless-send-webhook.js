// functions/api/headless-send-webhook.js

export async function onRequestPost({ request }) {
  try {
    // *** UPDATED: Get the webhook URL dynamically from the request body ***
    const { webhookUrl, email_field, subject_field, content_field } = await request.json();

    if (!webhookUrl) {
      return new Response(JSON.stringify({ message: 'Webhook URL is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = {
      string_field: subject_field,
      uuid_field: crypto.randomUUID(),
      number_field: 42,
      dateTime_field: new Date().toISOString(),
      date_field: new Date().toISOString().split('T')[0],
      time_field: new Date().toTimeString().split(' ')[0],
      uri_field: "https://www.example.com",
      boolean_field: true,
      email_field: email_field,
      object_field: {
        string_field: content_field,
        number_field: 100
      },
      array_field: [
        "item_1",
        "item_2"
      ]
    };

    const wixResponse = await fetch(webhookUrl, { // *** UPDATED: Use the dynamic URL ***
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    const responseText = await wixResponse.text();

    return new Response(responseText || 'Webhook received successfully by Wix.', {
      status: wixResponse.status,
      headers: { 'Content-Type': 'text/plain' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
