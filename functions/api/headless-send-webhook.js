// functions/api/headless-send-webhook.js

export async function onRequestPost({ request }) {
  try {
    // The specific webhook URL provided by the user.
    const wixWebhookUrl = 'https://manage.wix.com/_api/webhook-trigger/report/f1cf47f9-8600-417d-b32f-8103b0bdcbbc/fe35eb93-d982-49b0-a093-f71d7cd74321';

    // Get the data from the frontend form.
    const { email_field, subject_field, content_field } = await request.json();

    // Construct the payload to send to Wix.
    // We'll use the fields from the form and add some static example data
    // to match the structure the user provided.
    const payload = {
      string_field: subject_field,
      uuid_field: crypto.randomUUID(), // Generate a random UUID
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

    // Send the data to the Wix webhook URL.
    const wixResponse = await fetch(wixWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    // Read the response from Wix. It might be empty on success.
    const responseText = await wixResponse.text();

    // Return a success response to the frontend.
    // We use wixResponse.status to pass through the status from Wix.
    return new Response(responseText || 'Webhook received successfully by Wix.', {
      status: wixResponse.status,
      headers: { 'Content-Type': 'text/plain' },
    });

  } catch (e) {
    // If an error occurs, send back an error response.
    return new Response(JSON.stringify({ message: 'An error occurred.', error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
