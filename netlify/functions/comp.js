exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
      body: ''
    };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const KEY = 'pc_f49d23ff406e8b7b5cbae5117ece13870267d92970d43a8d';
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const { search, set } = JSON.parse(event.body);
    if (!search) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing search term' }) };

    // Search
    const q = encodeURIComponent(search + (set ? ' ' + set : ''));
    const sRes = await fetch(`https://api.poketrace.com/v1/cards?search=${q}&market=US&limit=5&product_type=single`, {
      headers: { 'X-API-Key': KEY }
    });
    const sData = await sRes.json();
    const results = sData.data || [];
    if (!results.length) return { statusCode: 404, headers, body: JSON.stringify({ error: 'No cards found for: ' + search }) };

    const card = results[0];

    // Detail
    const dRes = await fetch(`https://api.poketrace.com/v1/cards/${card.id}`, {
      headers: { 'X-API-Key': KEY }
    });
    const dData = await dRes.json();
    const d = dData.data || card;
    const prices = d.prices || {};
    const ebay = prices.ebay || {};

    // Raw conditions
    const raw = {
      near_mint:         { ebay: ebay.NEAR_MINT || {},        tcgplayer: (prices.tcgplayer || {}).NEAR_MINT || {} },
      lightly_played:    { ebay: ebay.LIGHTLY_PLAYED || {} },
      moderately_played: { ebay: ebay.MODERATELY_PLAYED || {} },
      heavily_played:    { ebay: ebay.HEAVILY_PLAYED || {} },
      damaged:           { ebay: ebay.DAMAGED || {} }
    };

    // Use gradedOptions from API — these are exactly what exists for this card
    const gradedOptions = d.gradedOptions || [];
    const graded = {};
    gradedOptions.forEach(function(tier) {
      if (ebay[tier]) graded[tier] = ebay[tier];
    });

    // Trend
    const nm = ebay.NEAR_MINT || {};
    const nmAvg = nm.avg || (prices.tcgplayer || {}).NEAR_MINT?.avg || 0;
    const avg30 = nm.avg30d || nmAvg;
    const avg7  = nm.avg7d  || nmAvg;
    let trend = 'stable', trendPct = 0;
    if (avg30 > 0) {
      trendPct = ((avg7 - avg30) / avg30 * 100);
      if (trendPct >  3) trend = 'up';
      if (trendPct < -3) trend = 'down';
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        card_name:    d.name + (d.cardNumber ? ' #' + d.cardNumber : ''),
        set:          d.set?.name || null,
        variant:      d.variant   || null,
        rarity:       d.rarity    || null,
        last_updated: d.lastUpdated || null,
        has_graded:   d.hasGraded || false,
        graded_options: gradedOptions,
        raw,
        graded,
        market_avg:       nmAvg,
        tcgplayer_recent: (prices.tcgplayer || {}).NEAR_MINT?.avg || null,
        ebay_recent:      nm.avg || null,
        low:  Math.min(nm.low||9999, (prices.tcgplayer||{}).NEAR_MINT?.low||9999) === 9999 ? 0 : Math.min(nm.low||9999, (prices.tcgplayer||{}).NEAR_MINT?.low||9999),
        high: Math.max(nm.high||0, (prices.tcgplayer||{}).NEAR_MINT?.high||0),
        num_sales: (nm.saleCount||0) + ((prices.tcgplayer||{}).NEAR_MINT?.saleCount||0),
        trend, trend_pct: Math.round(trendPct * 10) / 10,
        all_results: results.slice(0,5).map(r => ({ id: r.id, name: r.name, set: r.set?.name, number: r.cardNumber }))
      })
    };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
