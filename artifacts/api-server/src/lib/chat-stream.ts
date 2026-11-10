export interface ToolRequest {
  name: string;
  params: Record<string, unknown>;
}

/** SSE decoder shared by providers; handles CRLF, split frames and trailing data. */
export async function* readProviderEvents(
  body: ReadableStream<Uint8Array>, idleTimeoutMs = 15000, signal?: AbortSignal,
): AsyncGenerator<Record<string, any>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: Awaited<ReturnType<typeof reader.read>>;
      try {
        result = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("AI stream timed out")), idleTimeoutMs);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      buffer += result.done ? decoder.decode() : decoder.decode(result.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = result.done ? "" : lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let event: Record<string, any>;
        try { event = JSON.parse(data); } catch { continue; }
        if (event.error) throw new Error("AI provider returned a stream error");
        yield event;
      }
      if (result.done) break;
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export class ToolAccumulator {
  private calls = new Map<number, { name: string; args: string }>();
  add(chunks: Array<{ index?: number; function?: { name?: string; arguments?: string } }>) {
    for (const chunk of chunks) {
      const index = chunk.index ?? 0;
      if (!Number.isInteger(index) || index < 0 || index > 7) throw new Error("Too many device actions in one response");
      const current = this.calls.get(index) ?? { name: "", args: "" };
      if (chunk.function?.name) current.name = chunk.function.name;
      if (chunk.function?.arguments) current.args += chunk.function.arguments;
      this.calls.set(index, current);
    }
  }
  finish(allowedNames: Set<string>): ToolRequest[] {
    const result: ToolRequest[] = [];
    for (const call of this.calls.values()) {
      if (!allowedNames.has(call.name)) throw new Error("Unsupported device tool");
      const params = JSON.parse(call.args || "{}");
      if (!params || typeof params !== "object" || Array.isArray(params)) {
        throw new Error("Invalid device tool parameters");
      }
      result.push({ name: call.name, params });
    }
    this.calls.clear();
    return result;
  }
}
