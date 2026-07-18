/**
 * POST /api/game-assist
 *
 * Accepts a base64 JPEG screenshot + user query, sends both to
 * Gemini 2.0 Flash (vision), and returns:
 *   - A human-readable message to speak back to the user
 *   - An array of word solutions, each with normalized tap coordinates
 *     that the client converts to pixel gestures via the Accessibility Service
 *
 * Requires GEMINI_API_KEY environment variable.
 */

import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const SYSTEM_PROMPT = `You are an AI game assistant embedded in a voice-controlled Android app.
The user has shared their screen with you. Analyse the screenshot carefully.

TASK
----
If the user asks you to play, solve, or help with a game visible on screen:
1. Identify the game and its current puzzle state.
2. For WORD PUZZLE games (Word Cookies, Wordscapes, Wordle, Scrabble, etc.):
   - Find ALL valid words that can be formed from the available letters.
   - For each word, provide the NORMALIZED tap/swipe coordinates (0.0 to 1.0)
     for each letter in the word, in order.
     - x=0.0 is the left edge of the screen, x=1.0 is the right edge.
     - y=0.0 is the top  edge of the screen, y=1.0 is the bottom edge.
   - Be precise — estimate the centre pixel of each letter tile and divide
     by the screen dimensions to get the normalized value.
3. For OTHER games, describe the optimal next move(s) without tap coordinates.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
{
  "gameType": "word_puzzle | strategy | puzzle | other",
  "description": "One sentence describing what you see on screen",
  "solutions": [
    {
      "word": "CAKE",
      "taps": [
        {"x": 0.48, "y": 0.74},
        {"x": 0.52, "y": 0.68},
        {"x": 0.44, "y": 0.76},
        {"x": 0.56, "y": 0.70}
      ]
    }
  ],
  "message": "Found 14 words. I'll start playing now — beginning with CAKE, then LAKE…"
}

If this is NOT a game, or you cannot determine tap positions, still respond with the JSON
structure but set solutions to [] and put your answer in the message field.`;

router.post("/game-assist", async (req, res) => {
  const { screenshot, query, screenWidth, screenHeight } = req.body as {
    screenshot?: string;
    query?: string;
    screenWidth?: number;
    screenHeight?: number;
  };

  if (!screenshot) {
    res.status(400).json({ error: "screenshot (base64 JPEG) is required" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "GEMINI_API_KEY is not configured on the server",
    });
    return;
  }

  const userText =
    (query?.trim() || "Help me with this game") +
    (screenWidth && screenHeight
      ? ` (screen resolution: ${screenWidth}×${screenHeight})`
      : "");

  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: screenshot,
                },
              },
              {
                text: `${SYSTEM_PROMPT}\n\nUser request: ${userText}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      logger.error({ status: geminiRes.status, detail }, "Gemini API error");
      res.status(502).json({ error: "Gemini API error", detail });
      return;
    }

    const raw = (await geminiRes.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) {
      res.status(502).json({ error: "Empty response from Gemini" });
      return;
    }

    let parsed: {
      gameType: string;
      description: string;
      solutions: Array<{ word: string; taps: Array<{ x: number; y: number }> }>;
      message: string;
    };

    try {
      parsed = JSON.parse(text);
    } catch {
      // If Gemini didn't return valid JSON (e.g., it added markdown), wrap it
      parsed = {
        gameType: "other",
        description: "Screen analysed",
        solutions: [],
        message: text,
      };
    }

    res.json(parsed);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ err: msg }, "game-assist route error");
    res.status(500).json({ error: msg });
  }
});

export default router;
