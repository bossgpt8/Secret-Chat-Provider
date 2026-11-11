export interface LiveSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  bufferedAmount?: number;
  send(data: string): void;
  close(): void;
}
export interface LiveAudio {
  start(): Promise<void>;
  stop(): Promise<void>;
  interrupt(): Promise<void>;
  playChunk(data: string): Promise<void>;
  setMuted(value: boolean): Promise<void>;
  onInput(fn: (event: { data: string; level: number }) => void): () => void;
  onPlayback(fn: (event: { playing: boolean }) => void): () => void;
  onError(fn: (event: { message: string }) => void): () => void;
}
export type LivePhase = "connecting" | "listening" | "speaking" | "ended" | "error";
export interface LiveTurn { input: string; output: string; interrupted: boolean }
interface Options {
  audio: LiveAudio;
  socket: (url: string) => LiveSocket;
  onPhase: (phase: LivePhase, detail?: string) => void;
  onTranscript: (input: string, output: string) => void;
  onTurn: (turn: LiveTurn) => void;
  executeTool: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<string | undefined>;
}
interface ToolParameters {
  required?: string[];
  properties?: Record<string, { type?: string; enum?: unknown[]; minimum?: number; maximum?: number }>;
}
function validateArgs(schema: ToolParameters | undefined, value: unknown): Record<string, unknown> {
  const args = value === undefined ? {} : value;
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Invalid action parameters.");
  const object = args as Record<string, unknown>;
  if (schema?.required?.some(key => object[key] === undefined || object[key] === null)) {
    throw new Error("Required action parameters are missing. Ask the user rather than guessing.");
  }
  for (const [name, rule] of Object.entries(schema?.properties || {})) {
    const item = object[name];
    if (item === undefined) continue;
    const type = rule.type?.toLowerCase();
    if ((["string", "boolean", "number"].includes(type || "") && typeof item !== type) ||
      (type === "integer" && !Number.isInteger(item)) ||
      (rule.enum && !rule.enum.includes(item)) ||
      (typeof item === "number" && (!Number.isFinite(item) ||
        (rule.minimum !== undefined && item < rule.minimum) || (rule.maximum !== undefined && item > rule.maximum)))) {
      throw new Error(`Invalid ${name} parameter. Do not execute the action.`);
    }
  }
  return object;
}

export function appendTranscript(previous: string, delta: string): string {
  if (!delta) return previous;
  if (delta.startsWith(previous) && previous) return delta;
  return (previous + (previous && !/\s$/.test(previous) && !/^[\s.,!?;:]/.test(delta) ? " " : "") + delta).slice(-12000);
}

/** Transport/controller only. Android supplies actual capture and playback. */
export class LiveSession {
  private options: Options;
  private ws: LiveSocket | null = null;
  private closed = true;
  private started = false;
  private ready = false;
  private input = "";
  private output = "";
  private interrupted = false;
  private cleanup: Array<() => void> = [];
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private tools = new Map<string, AbortController>();
  private completed = new Map<string, unknown>();
  private cancelled = new Set<string>();
  private allowed = new Set<string>();
  private schemas = new Map<string, ToolParameters | undefined>();
  private chain = Promise.resolve();

  constructor(options: Options) { this.options = options; }

  start(token: string, setup: Record<string, unknown>, expiresAt: string,
    history: Array<{ role: string; content: string }> = []) {
    if (this.started) throw new Error("Use a new Live session when reconnecting.");
    const remaining = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) throw new Error("Live token expired. Start a new session.");
    this.started = true;
    this.closed = false;
    const declarations = (setup.tools as Array<{ functionDeclarations?: Array<{ name: string; parameters?: ToolParameters }> }> | undefined) || [];
    this.allowed = new Set(declarations.flatMap(tool => tool.functionDeclarations || []).map(tool => tool.name));
    this.schemas = new Map(declarations.flatMap(tool => tool.functionDeclarations || []).map(tool => [tool.name, tool.parameters]));
    this.options.onPhase("connecting");
    const fail = (detail: string) => { void this.stop(detail, true); };
    const sendInput = (event: { data: string }) => {
      if (!this.ready || this.closed) return;
      if ((this.ws?.bufferedAmount || 0) > 128000) { fail("Network is too slow for Live audio. Try reconnecting."); return; }
      this.send({ realtimeInput: { audio: { data: event.data, mimeType: "audio/pcm;rate=16000" } } });
    };
    this.cleanup.push(
      this.options.audio.onInput(sendInput),
      this.options.audio.onPlayback(({ playing }) => {
        if (this.ready && !this.closed) this.options.onPhase(playing ? "speaking" : "listening");
      }),
      this.options.audio.onError(({ message }) => fail(message)),
    );
    let ws: LiveSocket;
    try {
      ws = this.options.socket(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`);
    } catch {
      void this.stop("Could not open the Live connection.", true);
      throw new Error("Could not open the Live connection.");
    }
    this.ws = ws;
    const connectionTimer = setTimeout(() => fail("Live connection timed out. Reconnect or use current voice mode."), 12000);
    this.timers.push(connectionTimer, setTimeout(() => { void this.stop("Live session limit reached. You can start another session."); }, Math.min(remaining, 120000)));
    ws.onopen = () => this.send({ setup });
    ws.onerror = () => fail("Live connection failed. Check your network and API access.");
    ws.onclose = () => { if (!this.closed) fail("Live connection closed. Tap Reconnect, or use current voice mode."); };
    ws.onmessage = ({ data }) => {
      this.chain = this.chain.then(async () => {
        if (this.closed) return;
        let text: string;
        if (typeof data === "string") text = data;
        else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(new Uint8Array(data));
        else if (ArrayBuffer.isView(data)) text = new TextDecoder().decode(data);
        else if (data && typeof (data as { text?: unknown }).text === "function") {
          text = await (data as { text(): Promise<string> }).text();
        } else throw new Error("Live returned an unsupported message.");
        if (this.closed) return;
        const event = JSON.parse(text);
        if (event.error) throw new Error("Gemini rejected this Live session. Check model access and quota.");
        if (event.setupComplete && !this.ready) {
          clearTimeout(connectionTimer);
          if (history.length) this.send({ clientContent: {
            turns: history.slice(-8).filter(message => message.content).map(message => ({
              role: message.role === "assistant" ? "model" : "user",
              parts: [{ text: message.content.slice(0, 2000) }],
            })), turnComplete: false,
          } });
          await this.options.audio.start();
          if (this.closed) { await this.options.audio.stop(); return; }
          this.ready = true;
          this.options.onPhase("listening");
        }
        const content = event.serverContent;
        if (content) {
          if (content.interrupted) {
            this.interrupted = true;
            await this.options.audio.interrupt();
          }
          this.input = appendTranscript(this.input, content.inputTranscription?.text || "");
          this.output = appendTranscript(this.output, content.outputTranscription?.text || "");
          this.options.onTranscript(this.input, this.output);
          if (!content.interrupted) {
            for (const part of content.modelTurn?.parts || []) {
              const audio = part.inlineData;
              if (audio?.data) {
                if (!/^audio\/pcm(?:;|$)/i.test(audio.mimeType || "")) throw new Error("Unsupported Live audio format.");
                await this.options.audio.playChunk(audio.data);
              }
            }
          }
          if (content.turnComplete) this.flushTurn();
        }
        for (const id of event.toolCallCancellation?.ids || []) {
          this.cancelled.add(id);
          this.tools.get(id)?.abort();
        }
        for (const call of event.toolCall?.functionCalls || []) void this.execute(call);
        if (event.goAway) await this.stop("Google is ending this connection. Tap Reconnect for a new session.");
      }).catch(error => fail(error instanceof Error ? error.message : "Live session failed."));
    };
  }

  private send(event: unknown) {
    if (this.closed || !this.ws) return;
    try { this.ws.send(JSON.stringify(event)); }
    catch { void this.stop("Live connection is unavailable. Reconnect to continue.", true); }
  }

  private async execute(call: { id?: string; name?: string; args?: unknown }) {
    if (!call.id || !call.name || this.closed || this.cancelled.has(call.id)) return;
    if (this.completed.has(call.id)) {
      this.send({ toolResponse: { functionResponses: [this.completed.get(call.id)] } }); return;
    }
    if (this.tools.has(call.id)) return;
    if (this.tools.size >= 4 || this.completed.size >= 32) {
      await this.stop("Live action limit reached. Start a new session if you need more actions.", true);
      return;
    }
    const controller = new AbortController();
    this.tools.set(call.id, controller);
    const timer = setTimeout(() => controller.abort(), 30000);
    let response: { result?: string; error?: string };
    try {
      if (!this.allowed.has(call.name)) throw new Error("This action is unavailable in Live mode.");
      const args = validateArgs(this.schemas.get(call.name), call.args);
      const result = await this.options.executeTool(call.name, args, controller.signal);
      if (controller.signal.aborted) return;
      response = { result: result || "No completion result was returned. Do not claim success." };
    } catch (error) {
      response = { error: error instanceof Error ? error.message : "Device action failed." };
    } finally {
      clearTimeout(timer);
      this.tools.delete(call.id);
    }
    if (controller.signal.aborted || this.closed) return;
    const result = { id: call.id, name: call.name, response };
    this.completed.set(call.id, result);
    this.send({ toolResponse: { functionResponses: [result] } });
  }

  private flushTurn() {
    if (this.input.trim() || this.output.trim()) {
      this.options.onTurn({ input: this.input.trim(), output: this.output.trim(), interrupted: this.interrupted });
    }
    this.input = ""; this.output = ""; this.interrupted = false;
  }

  async setMuted(value: boolean) {
    if (!this.ready || this.closed) return;
    await this.options.audio.setMuted(value);
    if (value) this.send({ realtimeInput: { audioStreamEnd: true } });
  }
  async interrupt() {
    if (!this.ready || this.closed) return;
    this.interrupted = true;
    await this.options.audio.interrupt();
    this.send({ clientContent: {
      turns: [{ role: "user", parts: [{ text: "Stop speaking and listen for my next request." }] }],
      turnComplete: false,
    } });
  }
  async stop(detail = "Live session ended.", failed = false) {
    if (this.closed) return;
    this.closed = true; this.ready = false;
    this.timers.forEach(clearTimeout);
    this.cleanup.forEach(unsubscribe => unsubscribe());
    for (const controller of this.tools.values()) controller.abort();
    this.tools.clear();
    const ws = this.ws; this.ws = null;
    try { ws?.close(); } catch { /* Already closed. */ }
    await this.options.audio.stop().catch(() => {});
    this.flushTurn();
    this.options.onPhase(failed ? "error" : "ended", detail);
  }
}
