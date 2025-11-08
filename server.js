const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const { callGemini } = require('./utils/geminiClient');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY is not set. The AI analysis endpoint will return an error until a key is configured.');
}

// CORS configuration
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Body parser with size limit
app.use(express.json({ limit: '10mb' }));

// Simple rate limiting (in-memory, resets on server restart)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 10; // 10 requests per minute

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }
  
  const timestamps = requestCounts.get(ip).filter(t => now - t < RATE_LIMIT_WINDOW);
  
  if (timestamps.length >= MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  
  timestamps.push(now);
  requestCounts.set(ip, timestamps);
  next();
}

// Serve static assets (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

app.post('/api/analyze', rateLimiter, async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key not configured on the server.' });
  }

  const { prompt, image } = req.body || {};

  // Validate required fields
  if (!prompt || !image) {
    return res.status(400).json({ error: 'Missing prompt or image data.' });
  }

  // Validate data types and sizes
  if (typeof prompt !== 'string' || prompt.length === 0 || prompt.length > 10000) {
    return res.status(400).json({ error: 'Prompt must be a string between 1 and 10000 characters.' });
  }

  if (typeof image !== 'string' || image.length === 0) {
    return res.status(400).json({ error: 'Image must be a valid base64 string.' });
  }

  try {
    const text = await callGemini({ prompt, image, apiKey: GEMINI_API_KEY });
    return res.json({ text });
  } catch (error) {
    console.error('Gemini API proxy error:', error);
    return res.status(502).json({ error: error.message || 'Failed to contact Gemini API.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

