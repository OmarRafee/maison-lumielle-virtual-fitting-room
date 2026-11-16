# Maison Lumielle — Virtual Fitting Room Prototype

A responsive Next.js prototype for testing the customer journey for a fashion virtual try-on.

## Features
- Customer photo upload with preview (JPG, PNG, WebP; max 15 MB)
- Product gallery with sample Maison Lumielle item and custom garment uploads
- Optional height, weight and general-build context
- Background selection
- Explicit face-photo consent and separate optional marketing consent
- Review panel with customer and garment previews
- Prompt preparation for manual image generation
- Upload and download of the generated result
- Clear local photo previews

## Image generation
This version deliberately has **no image-generation API and no backend**. The "Prepare try-on prompt" action copies a detailed prompt. Use it with the two reference photos in your chosen image-generation tool, then upload the generated image to the result area.

A production service needs a secure backend and image-generation provider. Never put provider API keys in browser code.

## Privacy
Selected images are previewed using temporary browser object URLs. Photos are not sent to this project's server or an AI provider. Refreshing or closing the tab clears the in-page state.

## Run locally
Requires Node.js 20.9+.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy
Import this repository into Vercel. Framework preset: Next.js. No environment variables are required for this prototype.

## Product image
`public/products/charcoal-pleated-maxi.png` is the supplied sample product image. Other products are illustrative placeholders.
