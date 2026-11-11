import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { PairPrivateDeviceBody } from "@workspace/api-zod";
import { consumePairingCode } from "../lib/pairing-codes";
import { issueDeviceCredential } from "../lib/private-access";

const router = Router();
router.post("/devices/pair", rateLimit({ windowMs: 60000, limit: 5, standardHeaders: true, legacyHeaders: false }),
  (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const input = PairPrivateDeviceBody.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: "Enter the VM pairing code and a valid device identifier." }); return; }
    const secret = process.env.SESSION_SECRET || process.env.GEMINI_API_KEY;
    if (!secret) { res.status(503).json({ error: "Configure SESSION_SECRET on the VM before pairing." }); return; }
    try {
      if (!consumePairingCode(input.data.code, secret)) {
        res.status(401).json({ error: "Pairing code expired or used. Generate a fresh code on the VM." }); return;
      }
      res.json(issueDeviceCredential(input.data.deviceId, secret));
    } catch (error) {
      req.log.error({ err: error }, "Private device pairing failed");
      res.status(503).json({ error: "The VM could not save pairing state. Check VOX_STATE_DIR permissions." });
    }
  });
export default router;
