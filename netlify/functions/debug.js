exports.handler = async function(event) {
  const key = process.env.ANTHROPIC_API_KEY || 'NOT SET';
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      key_set: !!process.env.ANTHROPIC_API_KEY,
      key_length: key.length,
      key_preview: key.slice(0, 15) + '...',
      key_starts_with: key.startsWith('sk-ant-')
    })
  };
};
