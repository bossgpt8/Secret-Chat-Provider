import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

// ─── GET /conversations ───────────────────────────────────────────────────────
// Returns all conversations for a device, newest first.
// Requires X-Device-Id header.

router.get("/conversations", async (req, res) => {
  const deviceId = req.headers["x-device-id"] as string | undefined;
  if (!deviceId) {
    res.status(400).json({ error: "X-Device-Id header is required" });
    return;
  }

  try {
    const rows = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.deviceId, deviceId))
      .orderBy(desc(conversationsTable.updatedAt));
    res.json({ conversations: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

// ─── POST /conversations ──────────────────────────────────────────────────────

router.post("/conversations", async (req, res) => {
  const deviceId = req.headers["x-device-id"] as string | undefined;
  if (!deviceId) {
    res.status(400).json({ error: "X-Device-Id header is required" });
    return;
  }

  const { id, title } = req.body as { id?: string; title?: string };
  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  try {
    const now = new Date();
    const [row] = await db
      .insert(conversationsTable)
      .values({ id, deviceId, title: title ?? "New Chat", createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .returning();
    res.status(201).json({ conversation: row ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to create conversation");
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// ─── PATCH /conversations/:id ─────────────────────────────────────────────────

router.patch("/conversations/:id", async (req, res) => {
  const deviceId = req.headers["x-device-id"] as string | undefined;
  if (!deviceId) {
    res.status(400).json({ error: "X-Device-Id header is required" });
    return;
  }

  const { id } = req.params;
  const { title } = req.body as { title?: string };

  if (!title || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  try {
    const [row] = await db
      .update(conversationsTable)
      .set({ title: title.trim(), updatedAt: new Date() })
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.deviceId, deviceId)))
      .returning();

    if (!row) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json({ conversation: row });
  } catch (err) {
    req.log.error({ err }, "Failed to update conversation");
    res.status(500).json({ error: "Failed to update conversation" });
  }
});

// ─── DELETE /conversations/:id ────────────────────────────────────────────────

router.delete("/conversations/:id", async (req, res) => {
  const deviceId = req.headers["x-device-id"] as string | undefined;
  if (!deviceId) {
    res.status(400).json({ error: "X-Device-Id header is required" });
    return;
  }

  const { id } = req.params;

  try {
    const deleted = await db
      .delete(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.deviceId, deviceId)))
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

// ─── GET /conversations/:id/messages ─────────────────────────────────────────

router.get("/conversations/:id/messages", async (req, res) => {
  const deviceId = req.headers["x-device-id"] as string | undefined;
  if (!deviceId) {
    res.status(400).json({ error: "X-Device-Id header is required" });
    return;
  }

  const { id } = req.params;

  try {
    const [conv] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.deviceId, deviceId)));

    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const rows = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(messagesTable.createdAt);
    res.json({ messages: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to list messages");
    res.status(500).json({ error: "Failed to list messages" });
  }
});

// ─── POST /conversations/:id/messages ────────────────────────────────────────

router.post("/conversations/:id/messages", async (req, res) => {
  const deviceId = req.headers["x-device-id"] as string | undefined;
  if (!deviceId) {
    res.status(400).json({ error: "X-Device-Id header is required" });
    return;
  }

  const { id } = req.params;
  const { messageId, role, content } = req.body as {
    messageId?: string;
    role?: string;
    content?: string;
  };

  if (!messageId || !role || !content) {
    res.status(400).json({ error: "messageId, role, and content are required" });
    return;
  }

  if (role !== "user" && role !== "assistant") {
    res.status(400).json({ error: "role must be 'user' or 'assistant'" });
    return;
  }

  try {
    const [conv] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.deviceId, deviceId)));

    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const [row] = await db
      .insert(messagesTable)
      .values({
        id: messageId,
        conversationId: id,
        role: role as "user" | "assistant",
        content,
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    // bump conversation updatedAt
    await db
      .update(conversationsTable)
      .set({ updatedAt: new Date() })
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.deviceId, deviceId)));

    res.status(201).json({ message: row ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to create message");
    res.status(500).json({ error: "Failed to create message" });
  }
});

export default router;
