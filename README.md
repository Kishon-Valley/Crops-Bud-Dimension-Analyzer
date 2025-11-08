# Crops-Bud-Dimension-Analyzer

Interactive tool for annotating crop buds, comparing dimensions, and generating descriptive AI analysis. The frontend is static (HTML/CSS/JS), and AI requests are proxied through a Node.js handler so the Gemini API key stays server-side.

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2.  provide your Gemini key in the .env file:
   

3. Start the server (serves the frontend and proxies AI requests):
   ```bash
   npm run dev
   ```
4. Open your browser and visit <http://localhost:3000>



## File Structure Highlights

- `index.html`, `index.js`, `index.css` – frontend UI and logic.
- `server.js` – Express server for local development with rate limiting and CORS.
- `api/analyze.js` – Vercel serverless function for AI analysis endpoint.
- `utils/geminiClient.js` – shared Gemini API client with retry logic.
- `.env.example` – template for environment variables.
- `vercel.json` – Vercel deployment configuration.

## Deployment to Vercel

1. Install Vercel CLI (if not already installed):
   ```bash
   npm install -g vercel
   ```
2. Deploy to Vercel:
   ```bash
   vercel
   ```
3. Set environment variables in Vercel dashboard:
   - Go to your project settings
   - Add `GEMINI_API_KEY` with your API key value
4. Redeploy if needed:
   ```bash
   vercel --prod
   ```

## Environment Variables

- `GEMINI_API_KEY` (required) – Google Gemini API key. Get yours at [Google AI Studio](https://makersuite.google.com/app/apikey).
- `PORT` (optional, local only) – port number for the Express dev server (default: `3000`). 
