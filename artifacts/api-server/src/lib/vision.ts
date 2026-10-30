export class VisionError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

interface VisionInput {
  image: Buffer;
  mimeType: string;
  prompt: string;
  groqKey?: string;
  openRouterKey?: string;
  groqModel?: string;
  openRouterModel?: string;
  fetcher?: typeof fetch;
  onFailure?: (details: { model: string; status?: number; reason: string }) => void;
}

/** Both providers accept OpenAI-compatible image_url messages. */
export async function describeImage(input: VisionInput): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(input.mimeType)) {
    throw new VisionError("Use a JPEG, PNG or WebP photo.", 415);
  }
  // Leave room for base64 expansion within Groq's 20 MB request limit.
  if (input.image.length > 10 * 1024 * 1024) {
    throw new VisionError("That photo is too large. Please take a smaller photo.", 413);
  }
  const providers: Array<{ url: string; key: string; model: string; groq: boolean }> = [];
  if (input.groqKey) providers.push({
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: input.groqKey,
    model: input.groqModel || "qwen/qwen3.8-27b",
    groq: true,
  });
  if (input.openRouterKey) providers.push({
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: input.openRouterKey,
    model: input.openRouterModel || "google/gemini-2.5-flash",
    groq: false,
  });
  if (!providers.length) {
    throw new VisionError("Camera AI is not configured. Add GROQ_API_KEY to the API server.", 503);
  }

  let failure = "The camera AI could not process the photo. Please try again.";
  for (const provider of providers) {
    try {
      const response = await (input.fetcher ?? fetch)(provider.url, {
        method: "POST",
        signal: AbortSignal.timeout(18000),
        headers: {
          Authorization: `Bearer ${provider.key}`,
          "Content-Type": "application/json",
          ...(!provider.groq && { "HTTP-Referer": "https://replit.com", "X-Title": "Vox Voice Assistant" }),
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: input.prompt },
              { type: "image_url", image_url: { url: `data:${input.mimeType};base64,${input.image.toString("base64")}` } },
            ],
          }],
          ...(provider.groq ? { max_completion_tokens: 512 } : { max_tokens: 512 }),
          ...(provider.groq && provider.model.startsWith("qwen/qwen3.8") && { reasoning_effort: "none" }),
          temperature: 0.4,
        }),
      });
      if (!response.ok) {
        // Never pass provider bodies (which may contain private request data)
        // into user-facing errors or logs.
        input.onFailure?.({ model: provider.model, status: response.status, reason: "provider_rejected" });
        await response.body?.cancel();
        failure = response.status === 429
          ? "The camera AI has reached its provider limit. Please try again shortly."
          : response.status === 401 || response.status === 403
            ? "The camera AI provider rejected its API key. Check the key on the API server."
            : "The camera AI model is unavailable. Check the server's vision model setting.";
        continue;
      }
      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const description = data.choices?.[0]?.message?.content;
      if (typeof description === "string" && description.trim()) return description.trim();
      input.onFailure?.({ model: provider.model, reason: "empty_answer" });
    } catch (error) {
      const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      input.onFailure?.({ model: provider.model, reason: timeout ? "timeout" : "request_failed" });
      failure = timeout
        ? "The camera AI timed out. Please try again."
        : "The API server could not reach the camera AI provider. Please try again.";
    }
  }
  throw new VisionError(failure);
}
