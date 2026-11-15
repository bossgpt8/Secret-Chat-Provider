import { Router } from "express";
import { describeImage, VisionError } from "../lib/vision";

const router = Router();
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;

router.post("/screen-vision", async (req, res) => {
  const { screenshot, query } = req.body as {
    screenshot?: string;
    query?: string;
  };

  if (typeof screenshot !== "string" || !screenshot.length) {
    res.status(400).json({ error: "A screen image is required. Turn screen sharing off and on, then try again." });
    return;
  }
  if (screenshot.length > Math.ceil(MAX_SCREENSHOT_BYTES * 4 / 3) + 4) {
    res.status(413).json({ error: "The screen image is too large. Please try again." });
    return;
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(screenshot)) {
    res.status(400).json({ error: "The screen image could not be read. Turn screen sharing off and on, then try again." });
    return;
  }

  const image = Buffer.from(screenshot, "base64");
  if (image.length < 4 || image.length > MAX_SCREENSHOT_BYTES) {
    res.status(image.length > MAX_SCREENSHOT_BYTES ? 413 : 400).json({
      error: image.length > MAX_SCREENSHOT_BYTES
        ? "The screen image is too large. Please try again."
        : "The screen image is empty. Turn screen sharing off and on, then try again.",
    });
    return;
  }
  if (image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) {
    res.status(415).json({ error: "Vox expected a JPEG screen image. Turn screen sharing off and on, then try again." });
    return;
  }

  const question = typeof query === "string" ? query.trim().slice(0, 2000) : "";
  const prompt = [
    "You are Vox, a helpful voice assistant that can see the user's shared phone screen.",
    "Answer the user's question directly using the visible screen. Describe relevant text or controls when useful.",
    "Do not assume this is a game. Do not claim to tap or control anything.",
    "Be natural and concise enough to speak aloud.",
    `User's question: ${question || "What is on my screen?"}`,
  ].join(" ");

  try {
    const description = await describeImage({
      image,
      mimeType: "image/jpeg",
      prompt,
      groqKey: process.env.GROQ_API_KEY,
      openRouterKey: process.env.OPENROUTER_API_KEY,
      groqModel: process.env.GROQ_VISION_MODEL,
      openRouterModel: process.env.OPENROUTER_VISION_MODEL,
      onFailure: (details) => req.log.warn(details, "Screen vision provider failed"),
    });
    res.json({ description });
  } catch (error) {
    if (error instanceof VisionError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Screen vision failed");
    res.status(500).json({ error: "Vox couldn't analyze the screen. Please try again." });
  }
});

export default router;
