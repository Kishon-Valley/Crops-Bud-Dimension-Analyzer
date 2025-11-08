const { callGemini } = require('../utils/geminiClient');

/**
 * Vercel Serverless Function for Gemini API Analysis
 * Endpoint: /api/analyze
 */
module.exports = async (req, res) => {
  // Set CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key not configured on the server.' });
  }

  const { prompt, image } = req.body || {};

  if (!prompt || !image) {
    return res.status(400).json({ error: 'Missing prompt or image data.' });
  }

  // Validate image is base64 string
  if (typeof image !== 'string' || image.length === 0) {
    return res.status(400).json({ error: 'Invalid image data format.' });
  }

  // Validate prompt length
  if (typeof prompt !== 'string' || prompt.length > 10000) {
    return res.status(400).json({ error: 'Prompt must be a string with max 10000 characters.' });
  }

  try {
    const text = await callGemini({ prompt, image, apiKey: GEMINI_API_KEY });
    return res.status(200).json({ text });
  } catch (error) {
    console.error('Gemini API proxy error:', error);
    return res.status(502).json({ error: error.message || 'Failed to contact Gemini API.' });
  }
};
