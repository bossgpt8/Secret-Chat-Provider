/**
 * /api/memory  — Persistent user memory (facts the AI learns about you)
 *
 * Every route requires a device-scoped paired credential.
 * GET    /memory                       → list owned facts
 * POST   /memory                       → save { fact, category? }
 * PATCH  /memory/:id                   → correct an owned fact
 * DELETE /memory/:id                   → delete an owned fact
 * POST   /memory/extract               → LLM extracts facts from a conversation turn,
 *                                        saves them, and returns the new facts
 */

import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, memoryFactsTable } from "@workspace/db";
import { SavePrivateMemoryBody, UpdatePrivateMemoryBody, ExtractPrivateMemoryBody } from "@workspace/api-zod";
import { randomUUID } from "node:crypto";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";
const OR_CHAT_MODEL = "meta-llama/llama-3.3-70b-instruct";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-3.8-flash";
const unsafeFact = (fact: string) => /\b(password|api[_ -]?key|access token|secret key)\b\s*(is\b|[:=])|sk-[a-zA-Z0-9]{12,}|AIza[0-9A-Za-z_-]{20,}|-----BEGIN.*PRIVATE KEY|\b(?:bank|financial) account(?: number)?\s*(?:is|:|=)?\s*\d/i.test(fact);

const router: IRouter = Router();

// ─── GET /memory ─────────────────────────────────────────────────────────────

router.get("/memory", async (req, res) => {
  const deviceId = res.locals.deviceId as string;
  if (!deviceId) {
    res.status(400).json({ error: "deviceId is required" });
    return;
  }
  try {
    const facts = await db
      .select()
      .from(memoryFactsTable)
      .where(eq(memoryFactsTable.deviceId, deviceId))
      .orderBy(memoryFactsTable.createdAt).limit(100);
    res.json({ facts });
  } catch (err) {
    req.log.error({ err }, "memory GET error");
    res.status(500).json({ error: "Failed to load memory" });
  }
});

// ─── POST /memory ─────────────────────────────────────────────────────────────

router.post("/memory", async (req, res) => {
  const input = SavePrivateMemoryBody.safeParse(req.body);
  if (!input.success || !input.data.fact.trim()) {
    res.status(400).json({ error: "Enter a memory of 1–500 characters." });
    return;
  }
  const { fact, category = "general" } = input.data;
  if (unsafeFact(fact)) { res.status(400).json({ error: "Do not store passwords, API keys, tokens or financial account numbers." }); return; }
  const deviceId = res.locals.deviceId as string;
  try {
    const existing = await db.select().from(memoryFactsTable).where(eq(memoryFactsTable.deviceId, deviceId));
    const duplicate = existing.find(row => row.fact.trim().toLowerCase() === fact.trim().toLowerCase());
    if (duplicate) { res.json({ fact: duplicate }); return; }
    if (existing.length >= 100) { res.status(409).json({ error: "Memory is full. Remove a memory before adding another." }); return; }
    const id = `mem-${randomUUID()}`;
    const [saved] = await db
      .insert(memoryFactsTable)
      .values({ id, deviceId, fact: fact.trim(), category })
      .returning();
    res.json({ fact: saved });
  } catch (err) {
    req.log.error({ err }, "memory POST error");
    res.status(500).json({ error: "Failed to save memory" });
  }
});

router.patch("/memory/:id", async (req, res) => {
  const input = UpdatePrivateMemoryBody.safeParse(req.body);
  if (!input.success || !input.data.fact.trim()) {
    res.status(400).json({ error: "Enter a memory of 1–500 characters." }); return;
  }
  if (unsafeFact(input.data.fact)) { res.status(400).json({ error: "Do not store passwords, API keys, tokens or financial account numbers." }); return; }
  try {
    const [fact] = await db.update(memoryFactsTable)
      .set({ fact: input.data.fact.trim(), ...(input.data.category ? { category: input.data.category } : {}) })
      .where(and(eq(memoryFactsTable.id, String(req.params.id)), eq(memoryFactsTable.deviceId, res.locals.deviceId)))
      .returning();
    if (!fact) { res.status(404).json({ error: "Memory not found." }); return; }
    res.json({ fact });
  } catch (error) {
    req.log.error({ err: error }, "Memory update failed");
    res.status(500).json({ error: "Could not update memory." });
  }
});

// ─── DELETE /memory/:id ───────────────────────────────────────────────────────

router.delete("/memory/:id", async (req, res) => {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!id) {
    res.status(400).json({ error: "memory id is required" });
    return;
  }
  try {
    const deleted = await db.delete(memoryFactsTable)
      .where(and(eq(memoryFactsTable.id, id), eq(memoryFactsTable.deviceId, res.locals.deviceId))).returning();
    if (!deleted.length) { res.status(404).json({ error: "Memory not found." }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "memory DELETE error");
    res.status(500).json({ error: "Failed to delete memory" });
  }
});

// ─── POST /memory/extract ─────────────────────────────────────────────────────
// Given a single user+assistant exchange, extracts 0-3 durable personal facts
// (name, preferences, routines, important people) and saves them to the DB.
// Returns the newly saved facts so the client can refresh its local cache.

router.post("/memory/extract", async (req, res) => {
  const input = ExtractPrivateMemoryBody.safeParse(req.body);
  if (!input.success || !input.data.automaticMemory) {
    res.status(400).json({ error: "Automatic memory must be explicitly enabled." });
    return;
  }
  const { userMessage, assistantMessage } = input.data;
  const deviceId = res.locals.deviceId as string;

  const groqKey = process.env.GROQ_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!groqKey && !orKey && !geminiKey) {
    res.status(503).json({ error: "Automatic memory requires a configured AI provider." });
    return;
  }

  const extractPrompt = [
    {
      role: "system",
      content:
        "You are a memory extraction assistant. Given a user's message and an AI response, " +
        "extract 0–3 durable personal facts about the user that are worth remembering long-term. " +
        "Focus on explicitly stated preferences, routines and goals. Never infer sensitive personal attributes. " +
        "Never save passwords, API keys, tokens, financial account numbers or sensitive health/religious/political/sexual information. " +
        "IGNORE: transient questions, facts about the world, things the assistant said. " +
        "Return ONLY a JSON array of short fact strings, e.g. [\"User's name is Alice\", \"Prefers morning workouts\"]. " +
        "If nothing memorable, return []. No markdown, no explanation.",
    },
    {
      role: "user",
      content: `User said: "${userMessage}"\n\nAssistant replied: "${assistantMessage}"`,
    },
  ];

  async function extract(baseUrl: string, key: string, model: string): Promise<string[] | null> {
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
        body: JSON.stringify({ model, messages: extractPrompt, max_tokens: 200, temperature: 0.1, stream: false }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return null;
      const d = await r.json() as { choices?: { message?: { content?: string } }[] };
      const raw = d.choices?.[0]?.message?.content?.trim() ?? "";
      // Strip markdown fences if present
      const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) return null;
      return parsed.filter((f): f is string => typeof f === "string" && f.trim().length > 0);
    } catch {
      return null;
    }
  }

  try {
    let facts: string[] | null = null;
    if (geminiKey) facts = await extract(GEMINI_BASE, geminiKey, GEMINI_CHAT_MODEL);
    if (!facts && groqKey) facts = await extract(GROQ_BASE, groqKey, GROQ_CHAT_MODEL);
    if (!facts && orKey) facts = await extract(OPENROUTER_BASE, orKey, OR_CHAT_MODEL);

    if (!facts) { res.status(502).json({ error: "The AI provider could not extract memory. No facts were saved." }); return; }
    if (facts.length === 0) {
      res.json({ facts: [] });
      return;
    }

    const existing = await db.select().from(memoryFactsTable).where(eq(memoryFactsTable.deviceId, deviceId));
    const known = new Set(existing.map(row => row.fact.trim().toLowerCase()));
    facts = facts.filter(fact => {
      const key = fact.trim().toLowerCase();
      if (key.length > 500 || known.has(key) || unsafeFact(fact) || /(?:password|api.?key|bearer\s|sk-[a-z0-9]|private.key|access.token|bank account|credit card)/i.test(key)) return false;
      known.add(key); return true;
    }).slice(0, Math.max(0, Math.min(3, 100 - existing.length)));
    // Save only bounded, deduplicated new facts.
    const saved = await Promise.all(
      facts.map(async (fact) => {
        const id = `mem-${randomUUID()}`;
        const [row] = await db
          .insert(memoryFactsTable)
          .values({ id, deviceId, fact: fact.trim(), category: "extracted" })
          .returning();
        return row;
      })
    );

    res.json({ facts: saved });
  } catch (err) {
    req.log.error({ err }, "memory extract error");
    res.status(500).json({ error: "Memory extraction failed" });
  }
});

export default router;
