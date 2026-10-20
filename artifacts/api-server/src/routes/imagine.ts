/**
 * POST /api/imagine  — AI image generation via fal.ai (FLUX Schnell)
 *
 * Body: { prompt: string }
 * Returns: { imageUrl: string, prompt: string }
 *
 * Requires FAL_KEY environment variable.
 * Falls back to a descriptive error so the chat still shows something useful.
 */

import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/imagine", async (req, res) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt?.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    res.status(503).json({
      error: "Image generation is not configured. Ask the admin to add FAL_KEY.",
    });
    return;
  }

  try {
    const response = await fetch("https://fal.run/fal-ai/flux/schnell", {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt.trim(),
        image_size: "landscape_4_3",
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      req.log.error({ status: response.status, errText }, "fal.ai error");
      res.status(502).json({ error: "Image generation failed. Please try again." });
      return;
    }

    const data = await response.json() as {
      images?: Array<{ url: string; width: number; height: number }>;
    };

    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) {
      res.status(502).json({ error: "No image returned from generator." });
      return;
    }

    res.json({ imageUrl, prompt: prompt.trim() });
  } catch (err) {
    req.log.error({ err }, "imagine error");
    res.status(500).json({ error: "Image generation failed." });
  }
});

export default router;
