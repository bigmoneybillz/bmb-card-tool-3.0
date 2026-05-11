exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const { email, firstName } = JSON.parse(event.body);
    if (!email || !email.includes('@')) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid email' }) };
    }

    // POST to Shopify contact/newsletter signup — no token needed, built into every store
    const formData = new URLSearchParams();
    formData.append('contact[email]', email);
    formData.append('contact[first_name]', firstName || '');
    formData.append('contact[tags]', 'bmb-card-tool');
    formData.append('form_type', 'customer');
    formData.append('utf8', '✓');

    const res = await fetch('https://bmb-collective.myshopify.com/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: formData.toString()
    });

    console.log('Shopify contact response status:', res.status);
    const text = await res.text();
    console.log('Shopify response:', text.slice(0, 200));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };

  } catch (e) {
    console.log('Subscribe error:', e.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };
  }
};
