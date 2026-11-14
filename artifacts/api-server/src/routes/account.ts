import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, accountCloudTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { SaveAccountCloudBody } from "@workspace/api-zod";
import { validCloudEntries } from "../lib/cloud-validation";

const router = Router();
const allowed = new Set([
  "@vox_assistant_name", "@vox_conversations", "@vox_phone_voice_id",
  "@vox_el_voice_id", "@vox_kokoro_voice_id", "@vox_speech_rate",
  "@vox_tts_provider", "@vox_theme", "@vox_personality",
  "@vox_quick_chips", "@vox_speech_language",
]);
router.use("/account", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.CLERK_SECRET_KEY) { res.status(503).json({ error: "Cloud accounts are not configured on this server." }); return; }
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Sign in to access cloud data." }); return; }
  if (req.get("X-Vox-Account") && req.get("X-Vox-Account") !== userId) {
    res.status(409).json({ error: "Account changed during the request. No data was changed." }); return;
  }
  next();
});
router.get("/account/cloud", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const [row] = await db.select().from(accountCloudTable).where(eq(accountCloudTable.userId, userId));
  res.json(row ? { revision: row.revision, entries: row.entries, updatedAt: row.updatedAt.toISOString() } :
    { revision: 0, entries: {}, updatedAt: null });
});
router.put("/account/cloud", async (req, res): Promise<void> => {
  const parsed = SaveAccountCloudBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid cloud snapshot." }); return; }
  const { revision, entries } = parsed.data;
  if (Object.keys(entries).some(key => !allowed.has(key)) || JSON.stringify(entries).length > 4_000_000 || !validCloudEntries(entries)) {
    res.status(400).json({ error: "Only chat history and supported preferences can be synced (maximum 4 MB)." }); return;
  }
  const userId = getAuth(req).userId!;
  // Atomic compare-and-swap: a stale phone cannot overwrite another phone.
  const rows = revision === 0
    ? await db.insert(accountCloudTable).values({ userId, revision: 1, entries })
      .onConflictDoNothing().returning()
    : await db.update(accountCloudTable).set({ entries, revision: revision + 1, updatedAt: new Date() })
      .where(and(eq(accountCloudTable.userId, userId), eq(accountCloudTable.revision, revision))).returning();
  if (!rows.length) { res.status(409).json({ error: "Cloud data changed on another device. Your local copy is safe. Restore the cloud copy or merge before retrying." }); return; }
  const row = rows[0];
  res.json({ revision: row.revision, entries: row.entries, updatedAt: row.updatedAt.toISOString() });
});
router.delete("/account/cloud", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  // Keep a revisioned empty tombstone so stale devices cannot recreate erased data.
  await db.insert(accountCloudTable).values({ userId, revision: 1, entries: {} })
    .onConflictDoUpdate({ target: accountCloudTable.userId,
      set: { entries: {}, revision: sql`${accountCloudTable.revision} + 1`, updatedAt: new Date() } });
  res.sendStatus(204);
});
export default router;
