export interface AssistantEvent {
  content?: string;
  error?: string;
  modelFirstTokenMs?: number;
  tool_call?: { name: string; params: Record<string, unknown> };
}

/** Best-effort playback-echo guard, not a replacement for hardware echo cancellation. */
export function isPlaybackEcho(recognized: string, spoken: string): boolean {
  const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const heard = normalize(recognized);
  const playback = normalize(spoken);
  if (!heard || !playback) return false;
  if (playback.includes(heard)) return true;
  const words = heard.split(" ");
  const playbackWords = new Set(playback.split(" "));
  return words.length >= 3 && words.filter(word => playbackWords.has(word)).length / words.length >= 0.85;
}

/** Consume complete SSE lines only; the caller retains any unfinished line. */
export function parseAssistantEvents(lines: string): AssistantEvent[] {
  const events: AssistantEvent[] = [];
  for (const line of lines.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data) as AssistantEvent;
      if (!event || typeof event !== "object" || Array.isArray(event)) continue;
      if (event.tool_call && (typeof event.tool_call.name !== "string" ||
          !event.tool_call.params || typeof event.tool_call.params !== "object" ||
          Array.isArray(event.tool_call.params))) {
        events.push({ error: "The server returned an invalid device action." });
        continue;
      }
      events.push({
        ...(typeof event.content === "string" && { content: event.content }),
        ...(typeof event.error === "string" && { error: event.error }),
        ...(event.tool_call && { tool_call: event.tool_call }),
        ...(typeof event.modelFirstTokenMs === "number" && { modelFirstTokenMs: event.modelFirstTokenMs }),
      });
    } catch {
      // An invalid event must not discard other valid events in the frame.
    }
  }
  return events;
}

/** Release useful spoken clauses without waiting for a whole long paragraph. */
export function splitSpokenChunks(text: string, eager: boolean, settle = false) {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const settledEnd = settle && i === text.length - 1;
    if (!settledEnd && !/\s/.test(text[i + 1] || "")) continue;
    const fragment = text.slice(start, i + 1);
    // Do not split decimals or common titles/abbreviations.
    const abbreviation = /\b(?:Mr|Mrs|Ms|Dr|Prof|e\.g|i\.e|vs)\.$/i.test(fragment);
    const pendingDecimal = settledEnd && /\d\.$/.test(fragment);
    const sentenceEnd = /[.!?]/.test(text[i]) && !abbreviation && !pendingDecimal;
    const clauseEnd = eager && /[,;:]/.test(text[i]) && fragment.length >= 48;
    const boundedChunk = eager && fragment.length >= 100;
    if (sentenceEnd || clauseEnd || boundedChunk) {
      const chunk = fragment.trim();
      if (chunk) sentences.push(chunk);
      start = Math.min(text.length, i + 2);
    }
  }
  return { sentences, remainder: text.slice(start) };
}

export async function withinBudget<T>(
  work: Promise<T>, milliseconds: number, fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.catch(() => fallback),
      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), milliseconds); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
