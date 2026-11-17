# Maison Lumielle — AI Virtual Fitting Room

A static GitHub Pages prototype for trying a real product photo on a person photo. It has no active backend or database.

## Test it

1. Open the GitHub Pages site.
2. Choose **Maison Lumielle Hoodie** or **Maison Lumielle Jeans** and upload that item's product photo.
3. Upload your photo. Use a full-body image for jeans.
4. Enter a FASHN API key in the page and confirm you have permission to use the photo.
5. Generate. The preview can be downloaded.

The prompt currently describes a 190 cm, 80 kg man with a lightly muscular build. AI can only treat this as a visual guide; it cannot guarantee exact proportions or fit.

## API and test-only warning

Generation calls FASHN Agent Images directly from the browser. The endpoint is experimental. You need a FASHN API key and credits; each fast 1k generated image costs 1 credit according to FASHN's current docs. See [Agent Images API](https://docs.fashn.ai/api-reference/agent-images), [API setup](https://docs.fashn.ai/getting-started/api-setup), and [data retention](https://docs.fashn.ai/api-overview/data-retention-privacy).

This is suitable only for a private test. A key typed into a static webpage is visible to anyone using browser developer tools, and direct browser requests may be blocked by provider CORS settings. Do not use a real customer key or real customer photos on a public site. A production version needs a server-side proxy to protect the key.

The website does not store uploads. It sends compressed photo copies directly to FASHN for generation; review FASHN's data handling before uploading sensitive images.

## Local development

```bash
npm install
npm run dev
```

## Deployment

Pushing to `main` builds and deploys the static export to GitHub Pages. No server secrets or environment variables are required for the site build.
