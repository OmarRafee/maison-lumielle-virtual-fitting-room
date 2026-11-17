import { NextResponse } from "next/server";

export const runtime = "nodejs";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedBuilds = new Set(["Not specified", "Petite", "Slender", "Average", "Athletic", "Curvy"]);
const allowedBackgrounds = new Set(["Warm studio", "Minimal ivory interior", "Soft outdoor garden", "Keep original background"]);

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Add OPENAI_API_KEY to .env.local and restart the app." }, { status: 503 });
  }

  try {
    const form = await request.formData();
    const person = form.get("person");
    const garment = form.get("garment");
    if (!(person instanceof File) || !(garment instanceof File)) {
      return NextResponse.json({ error: "Upload both your photo and the product photo." }, { status: 400 });
    }
    if (!allowedTypes.has(person.type) || !allowedTypes.has(garment.type)) {
      return NextResponse.json({ error: "Use a JPG, PNG, or WebP image." }, { status: 400 });
    }
    if (person.size > 15 * 1024 * 1024 || garment.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Each image must be under 15 MB." }, { status: 413 });
    }

    const heightRaw = String(form.get("height") ?? "");
    const weightRaw = String(form.get("weight") ?? "");
    const height = /^\d{2,3}$/.test(heightRaw) ? Number(heightRaw) : 190;
    const weight = /^\d{2,3}$/.test(weightRaw) ? Number(weightRaw) : 80;
    const buildRaw = String(form.get("build") ?? "Athletic");
    const backgroundRaw = String(form.get("background") ?? "Warm studio");
    const build = allowedBuilds.has(buildRaw) ? buildRaw : "Athletic";
    const background = allowedBackgrounds.has(backgroundRaw) ? backgroundRaw : "Warm studio";
    const product = String(form.get("product") ?? "selected clothing").slice(0, 100);

    const prompt = [
      "Create a photorealistic fashion try-on image.",
      "Image one is the customer identity reference: preserve their recognizable face, skin tone, hair, and natural features.",
      "Image two is the exact clothing product reference: reproduce its design, color, logos, cut, fabric, seams, and details faithfully.",
      `Show the customer wearing the selected product: ${product}.`,
      `Body reference: approximately ${height} cm tall, ${weight} kg, ${build} build; keep proportions believable, with subtle natural muscle definition only.`,
      `Setting: ${background}.`,
      "Use a natural full-body pose, realistic garment fit and fabric folds, coherent lighting and shadows, and a real fashion-photography look.",
      "Do not alter the person's identity, exaggerate muscles, distort anatomy, or invent product branding.",
      "This is a visual styling preview, not a guarantee of actual fit or measurements.",
    ].join(" ");

    const imagesForm = new FormData();
    imagesForm.append("model", "gpt-image-2.5-flare");
    imagesForm.append("prompt", prompt);
    imagesForm.append("quality", "low");
    imagesForm.append("size", "1024x1536");
    imagesForm.append("output_format", "jpeg");
    imagesForm.append("image[]", person, person.name || "customer.jpg");
    imagesForm.append("image[]", garment, garment.name || "product.jpg");

    const upstream = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: imagesForm,
      signal: AbortSignal.timeout(120_000),
    });
    const payload = await upstream.json();
    if (!upstream.ok) {
      console.error("OpenAI image edit failed", upstream.status, payload?.error?.message);
      const message = upstream.status === 401
        ? "The API key was rejected. Check OPENAI_API_KEY."
        : upstream.status === 429
          ? "The image API is busy or billing is not enabled. Try again later."
          : "Image generation failed. Check API access and try another photo.";
      return NextResponse.json({ error: message }, { status: upstream.status === 429 ? 429 : 502 });
    }

    const image = payload?.data?.[0]?.b64_json;
    if (!image) return NextResponse.json({ error: "The image service returned no result. Try again." }, { status: 502 });
    return NextResponse.json({ image, mime: "image/jpeg" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Try-on request failed", error);
    return NextResponse.json({ error: "Could not generate the image. Please try again." }, { status: 500 });
  }
}
