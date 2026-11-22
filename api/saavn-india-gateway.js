module.exports = async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawUrl = req.query.url;
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const targetUrl = new URL(rawUrl);
    // Security check: restrict to JioSaavn domains only
    if (!targetUrl.hostname.endsWith('jiosaavn.com') && !targetUrl.hostname.endsWith('saavn.com')) {
      return res.status(403).json({ error: 'Target host not allowed' });
    }

    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Cookie': 'geo=IN',
      },
      signal: AbortSignal.timeout(8000),
    });

    const text = await upstream.text();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    return res.status(upstream.status).send(text);
  } catch (err) {
    return res.status(502).json({ error: 'India Gateway error', message: err.message });
  }
};
