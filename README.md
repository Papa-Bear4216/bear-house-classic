<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/5a6aeb79-f287-4f57-8c65-c96c8b467352

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` or `NEXT_PUBLIC_GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key. Use `NEXT_PUBLIC_GEMINI_API_KEY` if you want browser-side features like receipt scanning to work.
3. Run the app:
   `npm run dev`
