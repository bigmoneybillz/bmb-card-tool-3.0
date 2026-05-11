exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
      body: ''
    };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const POKETRACE_KEY  = 'pc_f49d23ff406e8b7b5cbae5117ece13870267d92970d43a8d';
  const POKEWALLET_KEY = process.env.POKEWALLET_API_KEY;
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const { search, set, num, company, grade } = JSON.parse(event.body);
    if (!search) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing search term' }) };

    // Build search query — include card number for precision
    const searchStr = [search, set, num].filter(Boolean).join(' ');
    const query = encodeURIComponent(searchStr);

    // PokeTrace search
    const ptRes = await fetch(
      `https://api.poketrace.com/v1/cards?search=${query}&market=US&limit=5&product_type=single`,
      { headers: { 'X-API-Key': POKETRACE_KEY } }
    );
    const searchData = await ptRes.json();
    const results = searchData.data || [];
    if (results.length === 0) return { statusCode: 404, headers, body: JSON.stringify({ error: 'No cards found for: ' + search }) };

    const card = results[0];
    const tcgplayerId = card.refs?.tcgplayerId || null;
    const cardName = card.name || search;
    const setName = card.set?.name || set || '';

    // Search PokeWallet with card name + set for better matching
    // Also include TCGPlayer product ID in query for exact match
    const pwQueryStr = tcgplayerId
      ? `${cardName} ${setName}`.trim()
      : `${search} ${setName}`.trim();

    const [detailRes, pwRes] = await Promise.all([
      fetch(`https://api.poketrace.com/v1/cards/${card.id}`, { headers: { 'X-API-Key': POKETRACE_KEY } }),
      fetch(`https://api.pokewallet.io/search?q=${encodeURIComponent(pwQueryStr)}&limit=10`, { headers: { 'X-API-Key': POKEWALLET_KEY } })
    ]);

    const detailData = await detailRes.json();
    const d = detailData.data || card;
    const prices = d.prices || {};

    // Find best PokeWallet match — prefer English cards with TCGPlayer data
    let pokewallet_id = null;
    try {
      const pwData = await pwRes.json();
      const pwResults = pwData.results || [];

      // First try: match by TCGPlayer product ID in URL
      let matched = null;
      if (tcgplayerId) {
        matched = pwResults.find(function(r) {
          return r.tcgplayer?.url && r.tcgplayer.url.includes('/' + tcgplayerId);
        });
      }

      // Second try: find English card with TCGPlayer data (not Japanese sets)
      if (!matched) {
        matched = pwResults.find(function(r) {
          var setCode = r.card_info?.set_code || '';
          // Skip Japanese sets (start with S, SV, etc with Japanese naming)
          var isJapanese = /^S\d+[a-z]*$/.test(setCode) || setCode.startsWith('SCF') || setCode.startsWith('SMP');
          return r.tcgplayer && !isJapanese;
        });
      }

      // Third try: first result with TCGPlayer data
      if (!matched) {
        matched = pwResults.find(function(r) { return r.tcgplayer; });
      }

      // Last resort: first result
      if (!matched) matched = pwResults[0];

      if (matched?.id) pokewallet_id = matched.id;
    } catch(e) {}

    const ebayNM   = prices.ebay?.NEAR_MINT || {};
    const tcgNM    = prices.tcgplayer?.NEAR_MINT || {};
    const ebayLP   = prices.ebay?.LIGHTLY_PLAYED || {};
    const ebayMP   = prices.ebay?.MODERATELY_PLACED || {};
    const ebayHP   = prices.ebay?.HEAVILY_PLAYED || {};
    const ebayDMG  = prices.ebay?.DAMAGED || {};
    const ebayPSA10 = prices.ebay?.PSA_10  || {};
    const ebayPSA9  = prices.ebay?.PSA_9   || {};
    const ebayPSA8  = prices.ebay?.PSA_8   || {};
    const ebayBGS95 = prices.ebay?.BGS_9_5 || {};
    const ebayBGS9  = prices.ebay?.BGS_9   || {};
    const ebayCGC10 = prices.ebay?.CGC_10  || {};
    const ebayCGC95 = prices.ebay?.CGC_9_5 || {};

    const nmAvg = ebayNM.avg || tcgNM.avg || 0;
    const avg30 = ebayNM.avg30d || tcgNM.avg30d || nmAvg;
    const avg7  = ebayNM.avg7d  || tcgNM.avg7d  || nmAvg;
    let trend = 'stable', trendPct = 0;
    if (avg30 > 0) { trendPct = ((avg7 - avg30) / avg30 * 100); if (trendPct > 3) trend = 'up'; if (trendPct < -3) trend = 'down'; }

    // Build specific slab grade key if company+grade provided
    let specificSlabPrice = null;
    if (company && grade) {
      const gradeNum = grade.split(' ')[0]; // handle "9.5 Gem Mint" -> "9.5"
      let key = null;
      if (company === 'PSA') key = 'PSA_' + gradeNum.replace('.', '_');
      else if (company === 'BGS') key = 'BGS_' + gradeNum.replace('.', '_');
      else if (company === 'CGC') key = 'CGC_' + gradeNum.replace('.', '_');
      if (key && prices.ebay?.[key]) specificSlabPrice = { grade: company + ' ' + gradeNum, data: prices.ebay[key] };
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        card_name: d.name + (d.cardNumber ? ' #' + d.cardNumber : ''),
        set: d.set?.name || null, variant: d.variant || null, rarity: d.rarity || null,
        last_updated: d.lastUpdated || null, has_graded: d.hasGraded || false,
        pokewallet_id: pokewallet_id,
        raw: { near_mint: { ebay: ebayNM, tcgplayer: tcgNM }, lightly_played: { ebay: ebayLP }, moderately_played: { ebay: ebayMP }, heavily_played: { ebay: ebayHP }, damaged: { ebay: ebayDMG } },
        graded: { psa_10: ebayPSA10, psa_9: ebayPSA9, psa_8: ebayPSA8, bgs_9_5: ebayBGS95, bgs_9: ebayBGS9, cgc_10: ebayCGC10, cgc_9_5: ebayCGC95 },
        market_avg: nmAvg, tcgplayer_recent: tcgNM.avg || null, ebay_recent: ebayNM.avg || null,
        low: Math.min(ebayNM.low||9999, tcgNM.low||9999) === 9999 ? 0 : Math.min(ebayNM.low||9999, tcgNM.low||9999),
        high: Math.max(ebayNM.high||0, tcgNM.high||0),
        num_sales: (ebayNM.saleCount||0) + (tcgNM.saleCount||0),
        trend: trend, trend_pct: Math.round(trendPct * 10) / 10,
        all_results: results.slice(0, 5).map(r => ({ id: r.id, name: r.name, set: r.set?.name, number: r.cardNumber }))
      })
    };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
