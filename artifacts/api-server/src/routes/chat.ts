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
const OLLAMA_BASE = process.env.OLLAMA_URL ? `${process.env.OLLAMA_URL}/v1` : "";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

// ─── Observability ────────────────────────────────────────────────────────────

interface RequestMetrics {
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  success: boolean;
  toolCall?: string;
}

function logMetrics(req: { log: { info: (obj: object, msg: string) => void } }, metrics: RequestMetrics) {
  req.log.info(
    {
      provider: metrics.provider,
      model: metrics.model,
      latencyMs: metrics.latencyMs,
      success: metrics.success,
      ...(metrics.toolCall && { toolCall: metrics.toolCall }),
    },
    `[obs] chat ${metrics.success ? "ok" : "failed"} in ${metrics.latencyMs}ms via ${metrics.provider}`
  );
}

// ─── Context window trimming ──────────────────────────────────────────────────

const MAX_HISTORY_MESSAGES = 40;

function trimMessages(messages: { role: string; content: string }[]) {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  const head = messages[0];
  const tail = messages.slice(-MAX_HISTORY_MESSAGES + 1);
  return [head, ...tail];
}

// ─── Device tool definitions ─────────────────────────────────────────────────
// These allow the LLM to return structured device commands instead of the
// client relying on brittle regex. When the model calls one of these tools,
// the server emits a { tool_call: { name, params } } SSE event so the mobile
// client can execute the native action.

const DEVICE_TOOLS = [
  {
    type: "function",
    function: {
      name: "flashlight",
      description: "Control the phone flashlight or torch",
      parameters: {
        type: "object",
        properties: {
          on: { type: "boolean", description: "true = turn on, false = turn off" },
        },
        required: ["on"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_brightness",
      description: "Change screen brightness",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["up", "down", "max", "min"], description: "Relative direction" },
          percent: { type: "number", description: "Exact brightness 0-100 if user specified a number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_battery",
      description: "Check the current battery level and charging status",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "make_call",
      description: "Initiate a phone call to a contact or number",
      parameters: {
        type: "object",
        properties: {
          contact: { type: "string", description: "Contact name from phonebook" },
          phone: { type: "string", description: "Phone number if explicitly given" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_sms",
      description: "Send an SMS text message",
      parameters: {
        type: "object",
        properties: {
          contact: { type: "string", description: "Recipient name" },
          phone: { type: "string", description: "Recipient phone number if given" },
          message: { type: "string", description: "Message body" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_app",
      description: "Open an app on the phone",
      parameters: {
        type: "object",
        properties: {
          app: {
            type: "string",
            enum: ["YouTube", "WhatsApp", "Maps", "Spotify", "Instagram", "Twitter", "Facebook", "Netflix", "TikTok", "Gmail", "Telegram", "Settings", "Camera", "Gallery", "Browser", "Clock", "Calculator", "Play Store"],
            description: "App to open",
          },
        },
        required: ["app"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_timer",
      description: "Set a countdown timer",
      parameters: {
        type: "object",
        properties: {
          duration_seconds: { type: "number", description: "Duration in seconds" },
          label: { type: "string", description: "Human-readable label like '10 minutes'" },
        },
        required: ["duration_seconds", "label"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_alarm",
      description: "Set an alarm for a specific time",
      parameters: {
        type: "object",
        properties: {
          hour: { type: "number", description: "24-hour format hour (0-23)" },
          minute: { type: "number", description: "Minute (0-59)" },
          label: { type: "string", description: "Alarm label" },
        },
        required: ["hour", "minute"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_reminder",
      description: "Set a reminder for a future time",
      parameters: {
        type: "object",
        properties: {
          offset_ms: { type: "number", description: "Milliseconds from now, if relative ('in 30 minutes')" },
          hour: { type: "number", description: "24-hour format hour if absolute time given" },
          minute: { type: "number", description: "Minute if absolute time given" },
          label: { type: "string", description: "What to remind about" },
        },
        required: ["label"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_weather",
      description: "Get current weather at the user's location",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "media_control",
      description: "Control media playback",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["play", "pause", "next", "previous", "stop"], description: "Playback action" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lock_screen",
      description: "Lock the phone screen",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "vibrate",
      description: "Vibrate the phone",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_notification",
      description: "Read the most recent notification or message",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "reply_message",
      description: "Reply to a recent message or notification",
      parameters: {
        type: "object",
        properties: {
          contact: { type: "string", description: "Sender name to reply to" },
          message: { type: "string", description: "The reply text" },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "take_photo",
      description: "Take a photo and describe what the camera sees (vision AI)",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information, news, or facts",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },
  },
];

// ─── /chat  (streaming with LLM tool calling) ─────────────────────────────────

router.post("/chat", async (req, res) => {
  const startMs = Date.now();
  const { messages: rawMessages, systemPrompt } = req.body;
  if (!rawMessages || !Array.isArray(rawMessages)) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }
  const messages = trimMessages(rawMessages);

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
        "You are a helpful, intelligent, and friendly voice assistant — like Siri but smarter. " +
        "Keep responses concise, natural, and conversational (1–3 sentences). Perfect for voice output — no markdown, no bullet lists unless truly needed. Get straight to the point. " +
        "You can control the user's phone when asked. Use the provided tools for device actions like flashlight, brightness, battery, calls, SMS, timers, alarms, weather, media controls, lock screen, opening apps, and web search. " +
        "When you use a tool, also respond with a brief natural confirmation (e.g. 'Sure, turning on the flashlight.'). Do not mention tool names.",
    },
  ];

  const requestBody = (model: string, withTools: boolean) =>
    JSON.stringify({
      model,
      messages: [...systemMessages, ...messages],
      stream: true,
      max_tokens: 512,
      temperature: 0.7,
      ...(withTools && { tools: DEVICE_TOOLS, tool_choice: "auto" }),
    });

  async function streamFrom(url: string, key: string, model: string): Promise<boolean> {
    const t0 = Date.now();
    const providerName = url.includes("openrouter") ? "openrouter" : url.includes("groq") ? "groq" : "ollama";
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      };
      if (url.includes("openrouter")) {
        headers["HTTP-Referer"] = "https://replit.com";
        headers["X-Title"] = "Vox Voice Assistant";
      }

      // Only use tools with Groq (OpenRouter & Ollama may not support them reliably)
      const withTools = url.includes("groq");

      const response = await fetch(`${url}/chat/completions`, {
        method: "POST",
        headers,
        body: requestBody(model, withTools),
      });

      if (!response.ok) return false;

      const reader = response.body?.getReader();
      if (!reader) return false;

      const decoder = new TextDecoder();
      let buffer = "";

      // Tool call accumulator
      let toolCallName = "";
      let toolCallArgs = "";
      let toolCallId = "";
      let hasToolCall = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;
            const finishReason = choice.finish_reason;

            // Regular text content
            if (delta?.content) {
              res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
            }

            // Tool call chunks — accumulate
            if (delta?.tool_calls) {
              hasToolCall = true;
              for (const tc of delta.tool_calls) {
                if (tc.id) toolCallId = tc.id;
                if (tc.function?.name) toolCallName = tc.function.name;
                if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
              }
            }

            // Tool call complete
            if (finishReason === "tool_calls" && hasToolCall) {
              let params: Record<string, unknown> = {};
              try { params = JSON.parse(toolCallArgs); } catch { /* malformed args */ }

              // Emit structured tool call event for the client
              res.write(`data: ${JSON.stringify({ tool_call: { name: toolCallName, params } })}\n\n`);

              logMetrics(req, { provider: providerName, model, latencyMs: Date.now() - t0, success: true, toolCall: toolCallName });

              // Follow-up call: get a short natural-language confirmation
              try {
                const confirmHeaders = { ...headers, "Content-Type": "application/json" };
                const confirmResp = await fetch(`${url}/chat/completions`, {
                  method: "POST",
                  headers: confirmHeaders,
                  body: JSON.stringify({
                    model,
                    messages: [
                      ...systemMessages,
                      ...messages,
                      {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                          {
                            id: toolCallId || "call_0",
                            type: "function",
                            function: { name: toolCallName, arguments: toolCallArgs },
                          },
                        ],
                      },
                      { role: "tool", tool_call_id: toolCallId || "call_0", content: "executed" },
                    ],
                    max_tokens: 80,
                    temperature: 0.5,
                    stream: false,
                  }),
                });
                if (confirmResp.ok) {
                  const confirmData = await confirmResp.json() as { choices?: { message?: { content?: string } }[] };
                  const confirmation = confirmData.choices?.[0]?.message?.content?.trim();
                  if (confirmation) {
                    res.write(`data: ${JSON.stringify({ content: confirmation })}\n\n`);
                  }
                }
              } catch { /* confirmation failed — client still has the tool_call */ }
            }

          } catch { /* skip malformed lines */ }
        }
      }

      if (!hasToolCall) {
        logMetrics(req, { provider: providerName, model, latencyMs: Date.now() - t0, success: true });
      }
      return true;
    } catch (err) {
      logMetrics(req, { provider: providerName, model, latencyMs: Date.now() - t0, success: false });
      req.log.error({ err }, `${providerName} stream error`);
      return false;
    }
  }

  try {
    let ok = false;
    if (groqKey) ok = await streamFrom(GROQ_BASE, groqKey, GROQ_CHAT_MODEL);
    if (!ok && OLLAMA_BASE) ok = await streamFrom(OLLAMA_BASE, "ollama", OLLAMA_MODEL);
    if (!ok && orKey) ok = await streamFrom(OPENROUTER_BASE, orKey, OR_CHAT_MODEL);
    if (!ok) {
      req.log.error({ latencyMs: Date.now() - startMs }, "All AI providers failed");
      res.write(`data: ${JSON.stringify({ error: "All AI providers failed" })}\n\n`);
    }
  } catch (err) {
    req.log.error({ err }, "Chat streaming error");
    res.write(`data: ${JSON.stringify({ error: "Internal server error" })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
});

// ─── /summarize  (rolling conversation summary) ───────────────────────────────
// Compresses a batch of old messages into a concise summary paragraph so long
// conversations stay within the context window without silently dropping turns.

router.post("/summarize", async (req, res) => {
  const { messages: rawMessages } = req.body as { messages?: { role: string; content: string }[] };
  if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const groqKey = process.env.GROQ_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!groqKey && !orKey) {
    res.status(500).json({ error: "No AI API key configured" });
    return;
  }

  const transcript = rawMessages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const summaryRequest = [
    {
      role: "system",
      content:
        "You are a conversation summarizer. Produce a concise 2-4 sentence summary of the provided conversation transcript. " +
        "Focus on: topics discussed, important facts mentioned, decisions made, and user preferences expressed. " +
        "Write in third person. No markdown. This summary will be prepended as context for future messages.",
    },
    {
      role: "user",
      content: `Summarize this conversation:\n\n${transcript}`,
    },
  ];

  async function fetchSummary(baseUrl: string, key: string, model: string): Promise<string | null> {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      };
      if (baseUrl.includes("openrouter")) {
        headers["HTTP-Referer"] = "https://replit.com";
        headers["X-Title"] = "Vox Voice Assistant";
      }
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, messages: summaryRequest, max_tokens: 200, temperature: 0.3, stream: false }),
      });
      if (!r.ok) return null;
      const d = await r.json() as { choices?: { message?: { content?: string } }[] };
      return d.choices?.[0]?.message?.content?.trim() ?? null;
    } catch {
      return null;
    }
  }

  try {
    let summary: string | null = null;
    if (groqKey) summary = await fetchSummary(GROQ_BASE, groqKey, GROQ_CHAT_MODEL);
    if (!summary && orKey) summary = await fetchSummary(OPENROUTER_BASE, orKey, OR_CHAT_MODEL);
    if (!summary && OLLAMA_BASE) summary = await fetchSummary(OLLAMA_BASE, "ollama", OLLAMA_MODEL);

    if (!summary) {
      res.status(500).json({ error: "Summarization failed" });
      return;
    }
    res.json({ summary });
  } catch (err) {
    req.log.error({ err }, "Summarize error");
    res.status(500).json({ error: "Summarization failed" });
  }
});

// ─── /suggest-reply  (proactive AI reply for notifications) ──────────────────
// Given a notification (sender, app, text), returns a suggested short reply.

router.post("/suggest-reply", async (req, res) => {
  const { sender, app: appName, text } = req.body as { sender?: string; app?: string; text?: string };
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const groqKey = process.env.GROQ_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!groqKey && !orKey) {
    res.status(500).json({ error: "No AI API key configured" });
    return;
  }

  const replyRequest = [
    {
      role: "system",
      content:
        "You are a smart assistant helping draft brief, natural reply messages. " +
        "Write a single short reply (1-2 sentences max) that sounds like a real person texting. " +
        "No emoji unless very natural. No explanation, just the reply text itself.",
    },
    {
      role: "user",
      content: `${sender ? `${sender}` : "Someone"}${appName ? ` on ${appName}` : ""} sent: "${text}"\n\nSuggest a brief natural reply:`,
    },
  ];

  async function fetchReply(baseUrl: string, key: string, model: string): Promise<string | null> {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      };
      if (baseUrl.includes("openrouter")) {
        headers["HTTP-Referer"] = "https://replit.com";
        headers["X-Title"] = "Vox Voice Assistant";
      }
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, messages: replyRequest, max_tokens: 80, temperature: 0.7, stream: false }),
      });
      if (!r.ok) return null;
      const d = await r.json() as { choices?: { message?: { content?: string } }[] };
      return d.choices?.[0]?.message?.content?.trim() ?? null;
    } catch {
      return null;
    }
  }

  try {
    let reply: string | null = null;
    if (groqKey) reply = await fetchReply(GROQ_BASE, groqKey, GROQ_CHAT_MODEL);
    if (!reply && orKey) reply = await fetchReply(OPENROUTER_BASE, orKey, OR_CHAT_MODEL);
    if (!reply && OLLAMA_BASE) reply = await fetchReply(OLLAMA_BASE, "ollama", OLLAMA_MODEL);

    if (!reply) {
      res.status(500).json({ error: "Reply suggestion failed" });
      return;
    }
    res.json({ reply });
  } catch (err) {
    req.log.error({ err }, "Suggest-reply error");
    res.status(500).json({ error: "Reply suggestion failed" });
  }
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
            content: `You are ${assistantName || "Vox"}, a voice assistant. Summarize the following search results in 2-3 concise sentences. No markdown.`,
          },
          {
            role: "user",
            content: `Search results for "${query}":\n\n${searchContext}\n\nSummarize this naturally for voice output.`,
          },
        ]
      : [
          {
            role: "system",
            content: `You are ${assistantName || "Vox"}, a voice assistant. Answer the user's question concisely in 2-3 sentences. No markdown.`,
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
          headers["X-Title"] = "Vox Voice Assistant";
        }
        const r = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({ model, messages: summaryMessages, max_tokens: 256, temperature: 0.4, stream: false }),
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
    if (!result && OLLAMA_BASE) result = await fetchSummary(OLLAMA_BASE, "ollama", OLLAMA_MODEL);

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
        headers["X-Title"] = "Vox Voice Assistant";
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

// ─── /vision  (describe an image — OpenRouter vision model) ──────────────────

router.post("/vision", upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "image file is required" });
    return;
  }

  const orKey = process.env.OPENROUTER_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!orKey && !groqKey) {
    res.status(500).json({ error: "No vision API key configured" });
    return;
  }

  const { prompt = "Describe what you see in this image in 2-3 sentences, as if you are a voice assistant. Be concise and natural." } = req.body;

  try {
    const base64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";

    // Try Groq vision (llava) first, fall back to OpenRouter Gemini
    const visionProviders: Array<{ url: string; key: string; model: string }> = [];
    if (orKey) visionProviders.push({ url: OPENROUTER_BASE, key: orKey, model: "google/gemini-2.0-flash-001" });

    for (const { url, key, model } of visionProviders) {
      try {
        const r = await fetch(`${url}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            ...(url.includes("openrouter") && { "HTTP-Referer": "https://replit.com", "X-Title": "Vox Voice Assistant" }),
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
                ],
              },
            ],
            max_tokens: 256,
            temperature: 0.4,
          }),
        });

        if (!r.ok) continue;
        const d = await r.json() as { choices?: { message?: { content?: string } }[] };
        const description = d.choices?.[0]?.message?.content ?? "I couldn't describe the image.";
        res.json({ description });
        return;
      } catch { continue; }
    }

    res.status(500).json({ error: "Vision API failed" });
  } catch (err) {
    req.log.error({ err }, "Vision error");
    res.status(500).json({ error: "Vision failed" });
  }
});

export default router;
