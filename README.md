# Maison Lumielle — AI Virtual Fitting Room Test

A small Next.js test app. Select a look, upload your photo and a product photo, then generate a try-on preview.

## Run the test locally

Requires Node.js 20.9+ and an OpenAI API key with image generation access.

1. Copy .env.example to .env.local.
2. Replace the placeholder with your OpenAI API key. Keep .env.local private and do not commit it.
3. Run:

```bash
npm install
npm run dev
```

Open http://localhost:3000, choose a product, upload a photo of yourself and the clothing, accept the photo processing consent, and select **Generate my try-on**.

Each generation uses OpenAI API credits and may incur charges. The app sends both photos to OpenAI only after you choose Generate. This test app does not save them to a database.

The generator uses the OpenAI Images API with GPT Image 2.5 Flare in low quality to keep the test simple. It returns a generated JPEG directly to the page for preview and download.

## Deployment

This test branch requires a server-side Next.js host because the image API key must remain on the server. The current GitHub Pages site stays unchanged. Do not publish the API key in browser code or commit it to Git.
