import { useState } from 'react';
import { Button } from '@/components/ui/button';

const TestPage = () => {
  const [response, setResponse] = useState('');

  const handleTestClick = async () => {
    try {
      // This calls our new, simple API endpoint
      const res = await fetch('/_functions/ping');
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setResponse(`Error: ${error.message}`);
    }
  };

  return (
    <div style={{ padding: '50px', textAlign: 'center' }}>
      <h1>API Connection Test</h1>
      <p>Click the button to test the connection to the Wix backend.</p>
      <Button onClick={handleTestClick}>Test API</Button>
      <pre style={{ marginTop: '20px', background: '#f0f0f0', padding: '10px', borderRadius: '5px' }}>
        {response || 'No response yet...'}
      </pre>
    </div>
  );
};

export default TestPage;