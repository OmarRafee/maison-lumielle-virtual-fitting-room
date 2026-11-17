import { createClient } from "npm:@supabase/supabase-js@2";

const FASHN_RUN_URL = "https://api.fashn.ai/v1/run";
const FASHN_STATUS_URL = "https://api.fashn.ai/v1/status";
const MAX_DATA_URI_LENGTH = 2_600_000;
const ALLOWED_DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "https://omarrafee.github.io",
];

function corsFor(origin: string | null) {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = configured.length ? configured : ALLOWED_DEFAULT_ORIGINS;
  return {
    "Access-Control-Allow-Origin": origin && allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function isImageDataUri(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= MAX_DATA_URI_LENGTH
    && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(value);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(response: Response) {
  return await response.json().catch(() => ({}));
}

async function startFashnPrediction(apiKey: string, modelName: string, inputs: Record<string, unknown>) {
  const response = await fetch(FASHN_RUN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model_name: modelName, inputs }),
  });
  const data = await readJson(response);
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : "The image provider rejected the request.";
    throw new Error(`FASHN request failed (${response.status}): ${message}`);
  }
  if (data?.error) throw new Error(String(data.error.message ?? data.error));
  if (typeof data?.id !== "string") throw new Error("FASHN did not return a prediction ID.");
  return data.id as string;
}

async function waitForFashn(apiKey: string, predictionId: string) {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    await delay(1500);
    const response = await fetch(`${FASHN_STATUS_URL}/${encodeURIComponent(predictionId)}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(`Could not read FASHN generation status (${response.status}).`);
    }
    if (data?.status === "completed") return data;
    if (data?.status === "failed") {
      const message = data?.error?.message ?? data?.error?.name ?? "The AI could not process these images.";
      throw new Error(String(message));
    }
  }
  throw new Error("The image provider is taking too long. Please try again.");
}

function firstOutput(data: any): string | null {
  if (Array.isArray(data?.output) && typeof data.output[0] === "string") return data.output[0];
  if (Array.isArray(data?.output?.images) && typeof data.output.images[0] === "string") return data.output.images[0];
  return null;
}

async function toImageDataUri(value: string) {
  if (value.startsWith("data:image/")) return value;
  const url = new URL(value);
  if (!["cdn.fashn.ai", "media.fashn.ai"].includes(url.hostname)) {
    throw new Error("The image provider returned an unexpected output URL.");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not retrieve the generated image.");
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    throw new Error("The generated output was not a supported image.");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const headers = corsFor(origin);
  const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const allowedOrigins = configuredOrigins.length ? configuredOrigins : ALLOWED_DEFAULT_ORIGINS;

  if (origin && !allowedOrigins.includes(origin)) {
    return json({ error: "This website origin is not allowed." }, 403, headers);
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, headers);

  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Sign in anonymously before generating a try-on." }, 401, headers);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const fashnApiKey = Deno.env.get("FASHN_API_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: "Supabase function environment is incomplete." }, 500, headers);
    }
    if (!fashnApiKey) {
      return json({ error: "FASHN_API_KEY is not set in Supabase Edge Function secrets." }, 503, headers);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Your temporary session expired. Refresh the page and try again." }, 401, headers);
    }

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > 5_800_000) {
      return json({ error: "The request is too large. Choose smaller photos." }, 413, headers);
    }

    const body = await request.json();
    if (body?.action === "status") {
      const predictionId = body?.predictionId;
      if (typeof predictionId !== "string" || !/^[A-Za-z0-9-]{8,100}$/.test(predictionId)) {
        return json({ error: "Invalid prediction ID." }, 400, headers);
      }
      const response = await fetch(`${FASHN_STATUS_URL}/${encodeURIComponent(predictionId)}`, {
        headers: { "Authorization": `Bearer ${fashnApiKey}` },
      });
      const data = await readJson(response);
      if (!response.ok) return json({ error: "Could not check the generation status." }, 502, headers);
      if (data?.status === "failed") {
        return json({ status: "failed", error: String(data?.error?.message ?? "Generation failed.") }, 200, headers);
      }
      if (data?.status === "completed") {
        const output = firstOutput(data);
        if (!output) return json({ status: "failed", error: "The provider returned no image." }, 200, headers);
        const image = await toImageDataUri(output);
        return json({ status: "completed", image }, 200, headers);
      }
      return json({ status: String(data?.status ?? "processing") }, 200, headers);
    }

    if (body?.action !== "generate") {
      return json({ error: "Unsupported action." }, 400, headers);
    }

    const { modelImage, garmentImage, category, photoType } = body;
    if (!isImageDataUri(modelImage) || !isImageDataUri(garmentImage)) {
      return json({ error: "Both photos must be valid JPG, PNG or WebP images. Please choose smaller files if they are too large." }, 400, headers);
    }
    if (!["tops", "bottoms"].includes(category)) {
      return json({ error: "Choose either a hoodie or jeans product." }, 400, headers);
    }
    if (!["face", "upper-body", "full-body"].includes(photoType)) {
      return json({ error: "Choose the correct photo type." }, 400, headers);
    }
    if (category === "bottoms" && photoType !== "full-body") {
      return json({ error: "Jeans require a full-body photo that shows the face and legs." }, 400, headers);
    }
    if (photoType === "face" && category !== "tops") {
      return json({ error: "A face-only selfie can only be used for a hoodie preview." }, 400, headers);
    }

    const { data: quotaAllowed, error: quotaError } = await supabase.rpc("consume_tryon_quota");
    if (quotaError) {
      return json({ error: "The try-on rate-limit migration has not been applied. Run supabase db push, then try again." }, 503, headers);
    }
    if (!quotaAllowed) {
      return json({ error: "You have reached the limit of 5 try-on requests per hour. Please try again later." }, 429, headers);
    }

    let modelImage = modelImage as string;
    if (photoType === "face") {
      const facePrediction = await startFashnPrediction(fashnApiKey, "face-to-model", {
        face_image: modelImage,
        aspect_ratio: "2:3",
        resolution: "1k",
        generation_mode: "fast",
        num_images: 1,
        output_format: "jpeg",
        return_base64: true,
      });
      const faceResult = await waitForFashn(fashnApiKey, facePrediction);
      const avatar = firstOutput(faceResult);
      if (!avatar) throw new Error("The selfie could not be converted into a try-on model.");
      modelImage = await toImageDataUri(avatar);
    }

    const predictionId = await startFashnPrediction(fashnApiKey, "tryon-v1.6", {
      model_image: modelImage,
      garment_image: garmentImage,
      category,
      mode: "balanced",
      num_samples: 1,
      output_format: "jpeg",
      return_base64: true,
      moderation_level: "conservative",
      garment_photo_type: "flat-lay",
      segmentation_free: true,
    });

    return json({ predictionId }, 200, headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected virtual try-on error.";
    return json({ error: message }, 500, headers);
  }
});
