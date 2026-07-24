/**
 * /api/memory  — Persistent user memory (facts the AI learns about you)
 *
 * GET    /memory?deviceId=xxx          → list all facts for a device
 * POST   /memory                       → save a fact { deviceId, fact, category? }
 * DELETE /memory/:id                   → delete a fact by id
 * POST   /memory/extract               → LLM extracts facts from a conversation turn,
 *                                        saves them, and returns the new facts
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, memoryFactsTable } from "@workspace/db";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";
const OR_CHAT_MODEL = "meta-llama/llama-3.3-70b-instruct";

const router: IRouter = Router();

// ─── GET /memory ─────────────────────────────────────────────────────────────

router.get("/memory", async (req, res) => {
  const { deviceId } = req.query as { deviceId?: string };
  if (!deviceId) {
    res.status(400).json({ error: "deviceId is required" });
    return;
  }
  try {
    const facts = await db
      .select()
      .from(memoryFactsTable)
      .where(eq(memoryFactsTable.deviceId, deviceId))
      .orderBy(memoryFactsTable.createdAt);
    res.json({ facts });
  } catch (err) {
    req.log.error({ err }, "memory GET error");
    res.status(500).json({ error: "Failed to load memory" });
  }
});

// ─── POST /memory ─────────────────────────────────────────────────────────────

router.post("/memory", async (req, res) => {
  const { deviceId, fact, category = "general" } = req.body as {
    deviceId?: string;
    fact?: string;
    category?: string;
  };
  if (!deviceId || !fact) {
    res.status(400).json({ error: "deviceId and fact are required" });
    return;
  }
  try {
    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

// ─── DELETE /memory/:id ───────────────────────────────────────────────────────

router.delete("/memory/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.delete(memoryFactsTable).where(eq(memoryFactsTable.id, id));
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
  const { deviceId, userMessage, assistantMessage } = req.body as {
    deviceId?: string;
    userMessage?: string;
    assistantMessage?: string;
  };
  if (!deviceId || !userMessage || !assistantMessage) {
    res.status(400).json({ error: "deviceId, userMessage, and assistantMessage are required" });
    return;
  }

  const groqKey = process.env.GROQ_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!groqKey && !orKey) {
    res.json({ facts: [] }); // gracefully skip — no AI key
    return;
  }

  const extractPrompt = [
    {
      role: "system",
      content:
        "You are a memory extraction assistant. Given a user's message and an AI response, " +
        "extract 0–3 durable personal facts about the user that are worth remembering long-term. " +
        "Focus on: name, age, location, job, preferences, routines, important people (family/friends), goals. " +
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
    if (groqKey) facts = await extract(GROQ_BASE, groqKey, GROQ_CHAT_MODEL);
    if (!facts && orKey) facts = await extract(OPENROUTER_BASE, orKey, OR_CHAT_MODEL);

    if (!facts || facts.length === 0) {
      res.json({ facts: [] });
      return;
    }

    // Save new facts to DB
    const saved = await Promise.all(
      facts.map(async (fact) => {
        const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
