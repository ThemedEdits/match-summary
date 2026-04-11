// Vercel Serverless Function — /api/analyze.js
// Uses OpenRouter.ai — FREE vision AI, no credit card needed.
//
// SETUP:
//   1. Get free key at: https://openrouter.ai/keys
//   2. Vercel → Project → Settings → Environment Variables
//      Add: OPENROUTER_API_KEY = sk-or-v1-...your-key...
//   3. Redeploy once.

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({
    error: 'OPENROUTER_API_KEY not set in Vercel Environment Variables. Get a free key at https://openrouter.ai/keys'
  });

  const { imageBase64, mimeType, prompt } = req.body;
  if (!imageBase64 || !prompt) return res.status(400).json({ error: 'Missing imageBase64 or prompt.' });

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://cricsnap.vercel.app',
        'X-Title': 'CricSnap'
      },
      body: JSON.stringify({
        model: 'openrouter/auto',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType || 'image/png'};base64,${imageBase64}` } },
            { type: 'text', text: prompt }
          ]
        }],
        temperature: 0.1,
        max_tokens: 2048
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'OpenRouter API error' });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}