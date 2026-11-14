import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { rateLimit } from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
const standaloneClerk = process.env.CLERK_AUTH_MODE === "standalone";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;

if (standaloneClerk && (!clerkSecretKey || !clerkPublishableKey)) {
  throw new Error(
    "CLERK_AUTH_MODE=standalone requires CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY.",
  );
}

// Accept forwarding headers only from local/private reverse-proxy hops.
// Keep the API port private behind Caddy/the development proxy.
app.set("trust proxy", ["loopback", "linklocal", "uniquelocal"]);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
if (!standaloneClerk) {
  app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
}
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: true }));
if (clerkSecretKey && clerkPublishableKey) {
  app.use(
    "/api/account",
    standaloneClerk
      ? clerkMiddleware()
      : clerkMiddleware((req) => ({
          publishableKey: publishableKeyFromHost(
            getClerkProxyHost(req) ?? "",
            clerkPublishableKey,
          ),
        })),
  );
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Protect AI endpoints from runaway clients draining API quota.

const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI rate limit reached. Please wait a moment before sending another message." },
});

const transcribeLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Transcription rate limit reached. Please wait before sending more audio." },
});

app.use("/api", generalLimiter);
app.use("/api/chat", aiLimiter);
app.use("/api/transcribe", transcribeLimiter);
app.use("/api/tts", transcribeLimiter);

app.use("/api", router);

// ─── Global error handler ─────────────────────────────────────────────────────
// Catches any unhandled errors in async route handlers (Express 5 auto-forwards them).
// Without this, Express returns an HTML error page instead of JSON.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, url: req.url, method: req.method }, "Unhandled route error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

export default app;
