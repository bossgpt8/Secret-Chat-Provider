// Run on YOUR VM with the same environment as the API service.
// This prints a short-lived pairing code, never the underlying API key.
import { pairingCode } from "../artifacts/api-server/src/lib/live-access.ts";
const secret = process.env.SESSION_SECRET || process.env.GEMINI_API_KEY;
if (!secret) throw new Error("Run with the API service environment containing SESSION_SECRET or GEMINI_API_KEY.");
console.log(`Vox one-use pairing code: ${pairingCode(secret).match(/.{1,4}/g).join("-")}`);
console.log("Enter it in Settings → Assistant quality for private data, OR in the Live panel. Generate a fresh code for the other. Do not post codes in chat or commit them.");
