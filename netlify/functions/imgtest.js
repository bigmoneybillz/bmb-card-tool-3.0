exports.handler = async function(event) {
  const POKEWALLET_KEY = process.env.POKEWALLET_API_KEY;
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    // Search for Charizard
    const searchRes = await fetch(
      'https://api.pokewallet.io/search?q=charizard&limit=3',
      { headers: { 'X-API-Key': POKEWALLET_KEY } }
    );
    const searchData = await searchRes.json();
    const firstId = (searchData.results || [])[0]?.id || null;

    // Try to get image
    let imageStatus = null;
    if (firstId) {
      const imgRes = await fetch(
        `https://api.pokewallet.io/images/${firstId}?size=low`,
        { headers: { 'X-API-Key': POKEWALLET_KEY } }
      );
      imageStatus = imgRes.status;
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        key_set: !!POKEWALLET_KEY,
        search_status: searchRes.status,
        results_count: (searchData.results || []).length,
        first_id: firstId,
        image_status: imageStatus,
        raw_search: searchData
      })
    };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
