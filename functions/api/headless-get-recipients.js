// functions/api/headless-get-recipients.js

export async function onRequestPost(context) {
  try {
    const {
      WIX_ACCOUNT_ID,
      WIX_API_KEY
    } = context.env;
    const body = await context.request.json();
    const {
      campaignId,
      activity
    } = body;

    if (!campaignId || !activity) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing campaignId or activity"
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    // Set the limit to the maximum allowed value
    const limit = 1000;

    const wixApiUrl = `https://www.wixapis.com/email-marketing/v1/campaigns/${campaignId}/statistics/recipients?activity=${activity}&paging.limit=${limit}`;

    const response = await fetch(wixApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': WIX_API_KEY,
        'wix-account-id': WIX_ACCOUNT_ID,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({
        success: false,
        error: `Wix API Error: ${errorText}`
      }), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}