import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/chat", async (req, res) => {
  const { messages, systemPrompt } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "OPENROUTER_API_KEY is not configured" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const systemMessages = systemPrompt
    ? [{ role: "system", content: systemPrompt }]
    : [
        {
          role: "system",
          content:
            "You are a helpful, intelligent, and friendly voice assistant. Keep your responses concise and natural — suitable for voice output. Be helpful, accurate, and conversational.",
        },
      ];

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://replit.com",
        "X-Title": "Voice Assistant",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct",
        messages: [...systemMessages, ...messages],
        stream: true,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.write(`data: ${JSON.stringify({ error: `OpenRouter error: ${errText}` })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      res.write(`data: ${JSON.stringify({ error: "No response stream" })}\n\n`);
      res.end();
      return;
    }

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
        if (data === "[DONE]") {
          res.write("data: [DONE]\n\n");
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  } catch (err) {
    req.log.error({ err }, "Chat streaming error");
    res.write(`data: ${JSON.stringify({ error: "Internal server error" })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
});

router.post("/search", async (req, res) => {
  const { query, assistantName } = req.body;

  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "OPENROUTER_API_KEY is not configured" });
    return;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://replit.com",
        "X-Title": "Voice Assistant",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:online",
        messages: [
          {
            role: "system",
            content: `You are ${assistantName || "an AI assistant"}. The user wants to search the web. Provide a helpful, accurate, and concise answer based on current information. Summarize key findings clearly.`,
          },
          {
            role: "user",
            content: query,
          },
        ],
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(500).json({ error: `OpenRouter error: ${errText}` });
      return;
    }

    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "No results found.";
    res.json({ result: content });
  } catch (err) {
    req.log.error({ err }, "Search error");
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
