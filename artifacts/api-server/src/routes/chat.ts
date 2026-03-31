import { Router, type IRouter } from "express";
import multer from "multer";
import FormData from "form-data";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const GROQ_BASE = "https://api.groq.com/openai/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";
const GROQ_WHISPER_MODEL = "whisper-large-v3";
const OR_CHAT_MODEL = "meta-llama/llama-3.3-70b-instruct";
const OR_WHISPER_MODEL = "openai/whisper-large-v3";

// ─── /chat  (streaming) ───────────────────────────────────────────────────────

router.post("/chat", async (req, res) => {
  const { messages, systemPrompt } = req.body;
  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const groqKey = process.env.GROQ_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!groqKey && !orKey) {
    res.status(500).json({ error: "No AI API key configured" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const systemMessages = [
    {
      role: "system",
      content: systemPrompt ||
        "You are Zeno, a helpful, intelligent, and friendly voice assistant — like Siri but smarter. Keep responses concise, natural, and conversational. Perfect for voice output — no markdown, no bullet lists unless truly needed. Get straight to the point.",
    },
  ];

  const body = (model: string) =>
    JSON.stringify({
      model,
      messages: [...systemMessages, ...messages],
      stream: true,
      max_tokens: 512,
      temperature: 0.7,
    });

  async function streamFrom(url: string, key: string, model: string): Promise<boolean> {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      };
      if (url.includes("openrouter")) {
        headers["HTTP-Referer"] = "https://replit.com";
        headers["X-Title"] = "Zeno Voice Assistant";
      }

      const response = await fetch(`${url}/chat/completions`, {
        method: "POST",
        headers,
        body: body(model),
      });

      if (!response.ok) return false;

      const reader = response.body?.getReader();
      if (!reader) return false;

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") { res.write("data: [DONE]\n\n"); continue; }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
          } catch { /* skip */ }
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  try {
    let ok = false;
    if (groqKey) ok = await streamFrom(GROQ_BASE, groqKey, GROQ_CHAT_MODEL);
    if (!ok && orKey) ok = await streamFrom(OPENROUTER_BASE, orKey, OR_CHAT_MODEL);
    if (!ok) res.write(`data: ${JSON.stringify({ error: "All AI providers failed" })}\n\n`);
  } catch (err) {
    req.log.error({ err }, "Chat streaming error");
    res.write(`data: ${JSON.stringify({ error: "Internal server error" })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
});

// ─── /search  (Tavily → Groq summary) ────────────────────────────────────────

router.post("/search", async (req, res) => {
  const { query, assistantName } = req.body;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;

  try {
    let searchContext = "";

    if (tavilyKey) {
      const tavilyRes = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          search_depth: "basic",
          max_results: 5,
          include_answer: true,
        }),
      });

      if (tavilyRes.ok) {
        const tavilyData = await tavilyRes.json() as {
          answer?: string;
          results?: { title: string; content: string; url: string }[];
        };

        if (tavilyData.answer) {
          searchContext = tavilyData.answer;
        } else if (tavilyData.results?.length) {
          searchContext = tavilyData.results
            .slice(0, 3)
            .map((r) => `${r.title}: ${r.content}`)
            .join("\n\n");
        }
      }
    }

    const summaryMessages = searchContext
      ? [
          {
            role: "system",
            content: `You are ${assistantName || "Zeno"}, a voice assistant. Summarize the following search results in 2-3 concise sentences. No markdown.`,
          },
          {
            role: "user",
            content: `Search results for "${query}":\n\n${searchContext}\n\nSummarize this naturally for voice output.`,
          },
        ]
      : [
          {
            role: "system",
            content: `You are ${assistantName || "Zeno"}, a voice assistant. Answer the user's question concisely in 2-3 sentences. No markdown.`,
          },
          { role: "user", content: query },
        ];

    async function fetchSummary(baseUrl: string, key: string, model: string): Promise<string | null> {
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        };
        if (baseUrl.includes("openrouter")) {
          headers["HTTP-Referer"] = "https://replit.com";
          headers["X-Title"] = "Zeno Voice Assistant";
        }
        const r = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({ model, messages: summaryMessages, max_tokens: 256, temperature: 0.4 }),
        });
        if (!r.ok) return null;
        const d = await r.json() as { choices?: { message?: { content?: string } }[] };
        return d.choices?.[0]?.message?.content ?? null;
      } catch {
        return null;
      }
    }

    let result: string | null = null;
    if (groqKey) result = await fetchSummary(GROQ_BASE, groqKey, GROQ_CHAT_MODEL);
    if (!result && orKey) result = await fetchSummary(OPENROUTER_BASE, orKey, OR_CHAT_MODEL);

    res.json({ result: result ?? (searchContext || "Sorry, I couldn't find an answer to that.") });
  } catch (err) {
    req.log.error({ err }, "Search error");
    res.status(500).json({ error: "Search failed" });
  }
});

// ─── /transcribe  (Groq Whisper → OpenRouter fallback) ───────────────────────

router.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "audio file is required" });
    return;
  }

  const groqKey = process.env.GROQ_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!groqKey && !orKey) {
    res.status(500).json({ error: "No transcription API key configured" });
    return;
  }

  async function transcribeWith(baseUrl: string, key: string, model: string): Promise<string | null> {
    try {
      const form = new FormData();
      form.append("file", req.file!.buffer, {
        filename: req.file!.originalname || "audio.m4a",
        contentType: req.file!.mimetype || "audio/m4a",
      });
      form.append("model", model);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${key}`,
        ...form.getHeaders(),
      };
      if (baseUrl.includes("openrouter")) {
        headers["HTTP-Referer"] = "https://replit.com";
        headers["X-Title"] = "Zeno Voice Assistant";
      }

      const r = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers,
        body: form.getBuffer(),
      });
      if (!r.ok) return null;
      const d = await r.json() as { text?: string };
      return d.text ?? null;
    } catch {
      return null;
    }
  }

  try {
    let text: string | null = null;
    if (groqKey) text = await transcribeWith(GROQ_BASE, groqKey, GROQ_WHISPER_MODEL);
    if (text === null && orKey) text = await transcribeWith(OPENROUTER_BASE, orKey, OR_WHISPER_MODEL);
    if (text === null) {
      res.status(500).json({ error: "Transcription failed" });
      return;
    }
    res.json({ text });
  } catch (err) {
    req.log.error({ err }, "Transcription error");
    res.status(500).json({ error: "Transcription failed" });
  }
});

export default router;
