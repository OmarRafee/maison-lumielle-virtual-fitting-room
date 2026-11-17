# Maison Lumielle — AI Virtual Fitting Room

A static Next.js storefront hosted on GitHub Pages, with secure AI generation handled by a Supabase Edge Function.

## What is implemented

- Hoodie and jeans product categories; each category accepts the real Maison Lumielle product photo.
- Shopper photo upload with local preview and browser-side JPEG compression.
- Face-only selfie mode for hoodies using FASHN Face-to-Model, followed by virtual try-on.
- Upper-body photo mode for hoodies.
- Full-body photo mode for hoodies or jeans (jeans require the legs to be visible).
- Explicit consent before sending photos to the AI provider.
- FASHN prediction polling, generated-image preview and download.
- Supabase anonymous sessions, JWT-protected Edge Function and a database-backed limit of 5 generation requests per anonymous user per hour.
- Provider API key is read only inside the Edge Function; it is never included in the browser bundle.

## AI provider and model

The integration uses **FASHN Virtual Try-On v1.6** (tryon-v1.6) for the garment transfer. It is documented as Stable, accepts a person image and a garment image as URL or data URI, and supports tops and bottoms categories. One successful output costs 1 credit.

For a face-only selfie, the function first uses FASHN **Face to Model** (face-to-model) to create an upper-body avatar, then applies the hoodie with Try-On v1.6. Face to Model is marked Experimental by FASHN and adds a separate generation charge. A face-only selfie is not suitable for jeans; use a full-body image instead.

Official references:
- [Try-On v1.6 API](https://docs.fashn.ai/api-reference/tryon-v1-6)
- [Face to Model API](https://docs.fashn.ai/api-reference/face-to-model)
- [API authentication and status polling](https://docs.fashn.ai/api-overview/api-fundamentals)
- [FASHN pricing](https://help.fashn.ai/plans-and-pricing/api-pricing)
- [FASHN data retention and privacy](https://docs.fashn.ai/api-overview/data-retention-privacy)
- [FASHN Terms of Service](https://fashn.ai/legal/terms-of-service)

FASHN's current on-demand rate is $0.075 per credit, with a $7.50 minimum purchase (100 credits). A normal v1.6 try-on is 1 credit (about $0.075 at on-demand pricing). A face-only hoodie flow uses Face to Model plus Try-On v1.6, so budget about 2 credits (about $0.15) at the documented fast/1K setting. Failed predictions are not charged. Prices and credit rules can change; check the official pricing page before launch.

FASHN permits commercial use under its applicable API plan and terms. You must have rights and consent for every identifiable person's photo and rights to the product images. FASHN says it does not use customer content to train models unless the customer separately opts in. This app requests base64 input/output to reduce image retention: input processing copies are deleted after processing (with a one-day cleanup backstop), and base64 outputs are available for 60 minutes. FASHN request metadata is retained and there is currently no self-service request-record deletion endpoint. Review its current terms and data-processing agreement before using real customer data.

## Supabase setup

The repository includes the Edge Function, JWT configuration and SQL rate-limit migration. The existing Supabase project visible to this workspace is currently inactive, so the function has **not** been deployed. Do not use the separate Gym Supplements project for this website.

1. Create or reactivate a dedicated Supabase project for Maison Lumielle.
2. In Supabase Dashboard → Authentication → Providers, enable **Anonymous sign-ins**. The site uses anonymous sessions so shoppers do not need to create accounts.
3. In the project settings, copy the Project URL and publishable key (or legacy anon key).
4. From this repository, link the Supabase CLI and apply the migration:

   ~~~bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ~~~

5. Add the FASHN API key as a server-side Edge Function secret. Never add it to .env.local, GitHub source files or a NEXT_PUBLIC_* variable:

   ~~~bash
   supabase secrets set FASHN_API_KEY=YOUR_FASHN_API_KEY --project-ref YOUR_PROJECT_REF
   supabase secrets set ALLOWED_ORIGINS=https://omarrafee.github.io,http://localhost:3000 --project-ref YOUR_PROJECT_REF
   ~~~

6. Deploy the function:

   ~~~bash
   supabase functions deploy virtual-tryon --project-ref YOUR_PROJECT_REF
   ~~~

7. For local frontend development, copy .env.example to .env.local and fill in:

   ~~~bash
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_LEGACY_ANON_KEY
   ~~~

8. Run the website:

   ~~~bash
   npm install
   npm run dev
   ~~~

   Open http://localhost:3000. The local frontend calls the deployed Supabase Edge Function.

9. For GitHub Pages, add these repository Actions secrets under Settings → Secrets and variables → Actions:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY

   Push to main or manually run the Pages workflow to rebuild the static frontend with those values.

## Photo guidance

- Hoodie: a clear upper-body photo is best. A face-only selfie can use the experimental Face-to-Model step.
- Jeans: use a full-body photo showing the face, waist and legs.
- Product: upload a clear, well-lit front view of the actual garment, ideally flat-lay or ghost mannequin, with the full garment visible.
- Use only photos you own or have permission to process.

No shopper photo or actual hoodie/jeans product image was present in the repository or the searchable conversation/library files when this integration was prepared. The UI therefore asks the owner to upload the real Maison Lumielle garment photo; it does not invent catalogue images or generated try-on results.

## Important limitations

- This is a visual try-on, not a body-measurement or size-recommendation system. Height and weight do not change the FASHN v1.6 output.
- Try one garment per generation. A hoodie and jeans are separate product selections.
- AI can alter small logos, text, seams, colours or fabric details. Review outputs before publishing.
- The app does not persist shopper photos or results in its own database. The provider receives the compressed images for generation.
- The public anonymous endpoint is limited to 5 generation requests per anonymous user per hour. Add stronger abuse prevention, monitoring and authenticated customer accounts before a high-traffic production launch.

## Deployment

The frontend remains a static export for GitHub Pages. Supabase hosts the backend separately; the FASHN API key is stored only in Supabase Edge Function secrets.
