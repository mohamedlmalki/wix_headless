import headlessProjects from '../../src/headless/config/headless-config.json';

// Handles GET requests to /api/headless-get-config
export async function onRequestGet() {
  try {
    // Simply return the content of the JSON file
    return new Response(JSON.stringify(headlessProjects), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ message: 'Failed to read configuration.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}