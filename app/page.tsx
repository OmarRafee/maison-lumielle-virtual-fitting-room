"use client";

import { useEffect, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ProductId = "hoodie" | "jeans";
type PhotoType = "face" | "upper-body" | "full-body";

const products: Array<{
  id: ProductId;
  name: string;
  category: "tops" | "bottoms";
  description: string;
  tone: string;
}> = [
  {
    id: "hoodie",
    name: "Maison Lumielle Hoodie",
    category: "tops",
    description: "Upload the exact hoodie from your collection.",
    tone: "hoodie",
  },
  {
    id: "jeans",
    name: "Maison Lumielle Jeans",
    category: "bottoms",
    description: "Upload the exact jeans from your collection.",
    tone: "jeans",
  },
];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("The try-on backend is not configured yet. Add the Supabase URL and publishable/anon key, then rebuild the site.");
  }
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

function fileToDataUri(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the image."));
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(blob);
  });
}

async function compressImage(file: File) {
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Your browser could not prepare this image.");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Image compression failed.")),
        "image/jpeg",
        0.82 - attempt * 0.06,
      );
    });

    if (jpeg.size <= 1_900_000) {
      bitmap.close();
      return fileToDataUri(jpeg);
    }
    scale *= 0.82;
  }

  bitmap.close();
  throw new Error("This image is too large to send safely. Please choose a smaller photo.");
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function Home() {
  const [person, setPerson] = useState<File | null>(null);
  const [garments, setGarments] = useState<Record<ProductId, File | null>>({
    hoodie: null,
    jeans: null,
  });
  const [personPreview, setPersonPreview] = useState("");
  const [garmentPreview, setGarmentPreview] = useState("");
  const [resultImage, setResultImage] = useState("");
  const [selected, setSelected] = useState<ProductId>("hoodie");
  const [photoType, setPhotoType] = useState<PhotoType>("upper-body");
  const [consent, setConsent] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState("Upload your photo and a Maison Lumielle product image to begin.");

  const product = products.find((item) => item.id === selected)!;
  const garment = garments[selected];
  const backendConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

  useEffect(() => {
    if (!person) {
      setPersonPreview("");
      return;
    }
    const url = URL.createObjectURL(person);
    setPersonPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [person]);

  useEffect(() => {
    if (!garment) {
      setGarmentPreview("");
      return;
    }
    const url = URL.createObjectURL(garment);
    setGarmentPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [garment]);

  function validImage(file: File) {
    return ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 15 * 1024 * 1024;
  }

  function pickPerson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!validImage(file)) {
      setStatus("Choose a JPG, PNG or WebP image smaller than 15 MB.");
      event.target.value = "";
      return;
    }
    setPerson(file);
    setResultImage("");
    setStatus("Your photo is ready.");
  }

  function pickGarment(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!validImage(file)) {
      setStatus("Choose a JPG, PNG or WebP product photo smaller than 15 MB.");
      event.target.value = "";
      return;
    }
    setGarments((current) => ({ ...current, [selected]: file }));
    setResultImage("");
    setStatus("Your product photo is ready.");
  }

  function chooseProduct(id: ProductId) {
    setSelected(id);
    setResultImage("");
    if (id === "jeans" && photoType !== "full-body") {
      setPhotoType("full-body");
      setStatus("Jeans require a full-body photo showing your face and legs.");
    } else {
      setStatus("Product selected. Add its product photo if you have not already.");
    }
  }

  async function generateTryOn() {
    if (!person) {
      setStatus("Upload your photo first.");
      return;
    }
    if (!garment) {
      setStatus("Upload the selected Maison Lumielle product photo first.");
      return;
    }
    if (!consent) {
      setStatus("Please confirm that you have permission to process the person photo.");
      return;
    }
    if (selected === "jeans" && photoType !== "full-body") {
      setStatus("For jeans, upload a full-body photo showing your face and legs.");
      return;
    }
    if (photoType === "face" && selected !== "hoodie") {
      setStatus("A face-only selfie can currently be used for hoodies only. Use a full-body photo for jeans.");
      return;
    }

    setIsGenerating(true);
    setResultImage("");
    try {
      const client = getSupabaseClient();
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) {
        const { error: signInError } = await client.auth.signInAnonymously();
        if (signInError) {
          throw new Error("Supabase anonymous sign-in is not enabled yet. Enable it in Authentication → Providers → Anonymous.");
        }
      }

      setStatus(photoType === "face"
        ? "Preparing your selfie, then fitting the hoodie. This can take up to a minute."
        : "Sending your photos securely to the try-on service…");

      const [modelImage, garmentImage] = await Promise.all([
        compressImage(person),
        compressImage(garment),
      ]);

      const { data, error } = await client.functions.invoke("virtual-tryon", {
        body: {
          action: "generate",
          modelImage,
          garmentImage,
          category: product.category,
          photoType,
        },
      });
      if (error) throw new Error(error.message || "Could not start the try-on.");
      if (!data?.predictionId) throw new Error(data?.error || "The try-on service did not return a prediction ID.");

      const predictionId = String(data.predictionId);
      setStatus("The AI is creating your look…");
      for (let attempt = 0; attempt < 45; attempt += 1) {
        await sleep(1500);
        const { data: progress, error: progressError } = await client.functions.invoke("virtual-tryon", {
          body: { action: "status", predictionId },
        });
        if (progressError) throw new Error(progressError.message || "Could not check generation status.");
        if (progress?.status === "completed" && typeof progress.image === "string") {
          setResultImage(progress.image);
          setStatus("Your AI try-on is ready. Review it, then download your image.");
          return;
        }
        if (progress?.status === "failed") {
          throw new Error(progress.error || "The AI could not complete this try-on. Try clearer photos.");
        }
        setStatus("The AI is fitting your garment…");
      }
      throw new Error("This generation is taking longer than expected. Please try again in a moment.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong while generating your try-on.");
    } finally {
      setIsGenerating(false);
    }
  }

  function clearPhotos() {
    setPerson(null);
    setGarments({ hoodie: null, jeans: null });
    setResultImage("");
    setConsent(false);
    setStatus("Your selected photos have been cleared.");
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#"><span>MAISON</span><b>LUMIELLE</b></a>
        <span className="topnote">A MORE PERSONAL WAY TO DISCOVER</span>
        <a className="navlink" href="#fitting">VIRTUAL FITTING ROOM ↗</a>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">MAISON LUMIELLE · VIRTUAL STYLING</p>
          <h1>Imagine it<br /><i>on you.</i></h1>
          <p className="lead">Choose a hoodie or jeans from the collection, add your photo, and let AI create a personal styling preview.</p>
          <a className="cta" href="#fitting">EXPLORE YOUR LOOK ↓</a>
          <p className="fine">A visual styling preview, not a size or fit guarantee.</p>
        </div>
        <div className="heroart">
          <small>THE ART OF THE SILHOUETTE <span>01 / 02</span></small>
          <div className="hero-outfit"><div className="hero-hoodie" /><div className="hero-jeans" /></div>
          <label>FORM, FEELING & EVERYDAY STYLE</label>
        </div>
      </section>

      <section className="intro" id="fitting">
        <p className="eyebrow">YOUR PRIVATE FITTING</p>
        <h2>A fitting room, <i>reimagined.</i></h2>
        <p>Use a clear photo where your face is visible. For jeans, choose a full-body photo. Upload a clean product photo so the AI can reference the real garment.</p>
      </section>

      <section className="workspace">
        <aside>
          <div className="sectionhead">
            <span>01</span>
            <div><h3>Your photo</h3><p>JPG, PNG or WebP · up to 15 MB</p></div>
          </div>
          <label className="field">PHOTO TYPE
            <select value={photoType} onChange={(event) => setPhotoType(event.target.value as PhotoType)}>
              <option value="face">Face-only selfie · hoodie only</option>
              <option value="upper-body">Upper-body photo · hoodie</option>
              <option value="full-body">Full-body photo · hoodie or jeans</option>
            </select>
          </label>
          <p className="upload-hint">
            {photoType === "face"
              ? "A face-only selfie is expanded into an upper-body avatar first. This uses FASHN's experimental Face-to-Model step."
              : photoType === "upper-body"
                ? "Keep your face, shoulders and torso visible. Use this option for hoodies."
                : "Show your face, waist and legs clearly. This is required for jeans."}
          </p>
          <label className="upload">
            {person ? <img src={personPreview} alt="Your uploaded photo" /> : <><strong>＋</strong><b>Upload your photo</b><small>Choose a clear, well-lit image</small><em>BROWSE FILES</em></>}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPerson} />
          </label>

          <div className="consent">
            <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> I am the person in this photo or have permission to use it. I consent to sending it and the selected product image to FASHN AI for this try-on.</label>
            <p>Your images are processed for this request, not saved in this website. FASHN's API records request metadata; read its <a href="https://docs.fashn.ai/api-overview/data-retention-privacy" target="_blank" rel="noreferrer">data-retention details</a>.</p>
          </div>
          <button className="clear" onClick={clearPhotos}>× DELETE ALL UPLOADED PHOTOS</button>
        </aside>

        <section>
          <div className="sectionhead">
            <span>02</span>
            <div><h3>Choose your piece</h3><p>Select a product category, then upload its real product photo.</p></div>
          </div>

          <div className="products">
            {products.map((item) => (
              <article className={selected === item.id ? "active" : ""} key={item.id}>
                <button className="piece" onClick={() => chooseProduct(item.id)} type="button">
                  <div className={"garment " + item.tone}><div /><small>{item.id === "hoodie" ? "ML-HOODIE" : "ML-JEANS"}</small></div>
                  <h4>{item.name}</h4>
                  <p>{item.description}</p>
                  <b>{garments[item.id] ? "PRODUCT PHOTO ADDED" : "ADD PRODUCT PHOTO"}</b>
                </button>
              </article>
            ))}
          </div>

          <div className="selected">
            <div>
              <small>YOUR SELECTED PRODUCT</small>
              <h3>{product.name}</h3>
              <p>{garment ? "Product photo ready for generation." : "Upload a clear front view of the actual garment."}</p>
            </div>
            <label className="uploadproduct">{garment ? "CHANGE PRODUCT PHOTO" : "UPLOAD PRODUCT PHOTO"}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickGarment} />
            </label>
          </div>

          <div className="review">
            <div className="sectionhead">
              <span>03</span>
              <div><h3>Review your request</h3><p>Check your photo and product before generating.</p></div>
            </div>
            <div className="previews">
              <div>{person ? <img src={personPreview} alt="Customer preview" /> : "YOUR PHOTO"}</div>
              <div>{garment ? <img src={garmentPreview} alt="Selected garment preview" /> : "PRODUCT PHOTO"}</div>
            </div>
            <p className="meta">SELECTED PRODUCT <b>{product.name}</b></p>
            <p className="meta">TRY-ON TYPE <b>{photoType === "face" ? "Selfie → upper-body avatar → hoodie" : photoType === "upper-body" ? "Upper-body → hoodie" : "Full-body → " + (selected === "jeans" ? "jeans" : "hoodie")}</b></p>
            <button className="prepare" onClick={generateTryOn} disabled={isGenerating || !person || !garment || !consent}>
              {isGenerating ? "GENERATING YOUR LOOK…" : "GENERATE MY AI TRY-ON ↗"}
            </button>
            {!backendConfigured && <p className="note warning"><b>Backend setup required:</b> add the Supabase environment variables and deploy the Edge Function before generation can run.</p>}
            <p className="note">The AI preview is not a measurement or size recommendation. Height and weight are not used by this image model; always check the brand's size guide.</p>
          </div>

          <div className="result">
            <div className="sectionhead">
              <span>04</span>
              <div><h3>Your virtual look</h3><p>Your real generated result will appear here.</p></div>
            </div>
            <div className="resultframe">
              {resultImage
                ? <img src={resultImage} alt="AI-generated Maison Lumielle virtual try-on" />
                : <div><strong>✳</strong><b>Your look will appear here</b><small>Choose your photos and click Generate.</small></div>}
            </div>
            <div className="actions">
              <button disabled={!resultImage} onClick={() => {
                if (!resultImage) return;
                const link = document.createElement("a");
                link.href = resultImage;
                link.download = "maison-lumielle-virtual-try-on.jpg";
                document.body.appendChild(link);
                link.click();
                link.remove();
              }}>DOWNLOAD IMAGE ↓</button>
            </div>
            <p className="note">Review the generated image before publishing or relying on it. AI may alter small garment details and cannot guarantee real-world fit, sizing, fabric feel or colour accuracy.</p>
          </div>
          <p className="status" role="status" aria-live="polite">{status}</p>
        </section>
      </section>

      <section className="privacy">
        <div><p className="eyebrow">YOUR IMAGE. YOUR CHOICE.</p><h2>Privacy, <i>by design.</i></h2></div>
        <p>The website sends compressed copies of the selected images to your Supabase Edge Function, which forwards them to FASHN for the requested generation. The FASHN key stays on the server. This app does not save customer photos or generated images to its own database.</p>
      </section>

      <footer>
        <a className="brand" href="#"><span>MAISON</span><b>LUMIELLE</b></a>
        <p>WEAR YOUR LIGHT.</p>
        <small>© 2026 MAISON LUMIELLE · VIRTUAL FITTING ROOM</small>
      </footer>
    </main>
  );
}
