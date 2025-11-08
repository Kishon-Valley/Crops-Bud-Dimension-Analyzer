const axios = require('axios');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini({ prompt, image, apiKey, maxRetries = 3 }) {
  if (!prompt || !image) {
    throw new Error('Missing prompt or image data.');
  }

  if (!apiKey) {
    throw new Error('Gemini API key not configured.');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/png',
              data: image,
            },
          },
        ],
      },
    ],
  };

  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.post(apiUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return text;
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.error?.message || error.message || 'Gemini API error';
      lastError = new Error(message);

      if (status === 429 && attempt < maxRetries - 1) {
        await wait(Math.pow(2, attempt) * 1000);
        continue;
      }

      break;
    }
  }

  throw lastError || new Error('Failed to contact Gemini API.');
}

module.exports = { callGemini };


