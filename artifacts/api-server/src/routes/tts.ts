import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

// Popular high-quality ElevenLabs voices
const ELEVENLABS_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Calm, American female" },
  { id: "29vD33N1CtxCmqQRPOHJ", name: "Drew", description: "Well-rounded, American male" },
  { id: "2EiwWnXFnvU5JabPnv8n", name: "Clyde", description: "War veteran, American male" },
  { id: "5Q0t7uMcjvnagumLfvZi", name: "Paul", description: "Groundlevel, American male" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", description: "Strong, American female" },
  { id: "CYw3kZ02Hs0563khs1Fj", name: "Dave", description: "Conversational, British male" },
  { id: "D38z5RcWu1voky8WS1ja", name: "Fin", description: "Sailor, Irish male" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", description: "Soft, American female" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Well-rounded, American male" },
  { id: "GBv7mTt0atIp3Br8iCZE", name: "Thomas", description: "Calm, American male" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", description: "Casual, Australian male" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", description: "Warm, British male" },
  { id: "LcfcDJNUP1GQjkzn1xUU", name: "Emily", description: "Calm, American female" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", description: "Emotional, American female" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", description: "Hoarse, Transatlantic male" },
  { id: "ODq5zmih8GrVes37Dizd", name: "Patrick", description: "Shouty, American male" },
  { id: "SOYHLrjzK2X1ezoPC6cr", name: "Harry", description: "Anxious, American male" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", description: "Articulate, American male" },
  { id: "ThT5KcBeYPX3keUQqHPh", name: "Dorothy", description: "Pleasant, British female" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", description: "Deep, American male" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", description: "Crisp, American male" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", description: "Seductive, Swedish female" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", description: "Confident, British female" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", description: "Warm, American female" },
  { id: "ZQe5CZNOzWyzPSCn5a3c", name: "James", description: "Calm, Australian male" },
  { id: "bVMeCyTHy58xNoL34h3p", name: "Jeremy", description: "Excited, American male" },
  { id: "flq6f7yk4E4fJM5XTYuZ", name: "Michael", description: "Orotund, American male" },
  { id: "g5CIjZEefAph4nQFvHAz", name: "Ethan", description: "Soft, American male" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", description: "Deep, American male" },
  { id: "oWAxZDx7w5VEj9dCyTzz", name: "Grace", description: "Southern, American female" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", description: "Deep, British male" },
  { id: "piTKgcLEGmPE4e6mEKli", name: "Nicole", description: "Whispery, American female" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", description: "Trustworthy, American male" },
  { id: "t0jbNlBVZ17f02VDIeMI", name: "Jessie", description: "Raspy, American male" },
  { id: "zcAOhNBS3c14rBihAFp1", name: "Giovanni", description: "Foreigner, Italian male" },
  { id: "zrHiDhphv9ZnVXBqCLjz", name: "Glinda", description: "Witch, American female" },
];

// GET /tts/voices — list available ElevenLabs voices
router.get("/tts/voices", async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.json({ voices: ELEVENLABS_VOICES, source: "static" });
    return;
  }

  try {
    const r = await fetch(`${ELEVENLABS_BASE}/voices`, {
      headers: { "xi-api-key": apiKey },
    });

    if (!r.ok) {
      res.json({ voices: ELEVENLABS_VOICES, source: "static" });
      return;
    }

    const data = await r.json() as { voices?: { voice_id: string; name: string; labels?: Record<string, string> }[] };
    const voices = (data.voices ?? []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      description: [v.labels?.accent, v.labels?.gender, v.labels?.description].filter(Boolean).join(", ") || "",
    }));

    res.json({ voices: voices.length > 0 ? voices : ELEVENLABS_VOICES, source: voices.length > 0 ? "api" : "static" });
  } catch {
    res.json({ voices: ELEVENLABS_VOICES, source: "static" });
  }
});

// POST /tts — synthesize speech, stream back mp3
router.post("/tts", async (req, res) => {
  const { text, voiceId, stability, similarityBoost } = req.body as {
    text?: string;
    voiceId?: string;
    stability?: number;
    similarityBoost?: number;
  };

  if (!text || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "ElevenLabs not configured" });
    return;
  }

  const voice = voiceId || "21m00Tcm4TlvDq8ikWAM"; // Rachel default
  const truncated = text.slice(0, 1000);

  try {
    const r = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voice}/stream`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: truncated,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: stability ?? 0.5,
          similarity_boost: similarityBoost ?? 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      res.status(r.status).json({ error: `ElevenLabs error: ${errText}` });
      return;
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Transfer-Encoding", "chunked");

    const reader = r.body?.getReader();
    if (!reader) {
      res.status(500).json({ error: "No audio stream" });
      return;
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }

    res.end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `TTS failed: ${msg}` });
  }
});

export default router;
