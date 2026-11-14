/**
 * Pure helpers for the Messages inbox. No React Native imports so they can be
 * unit-tested in plain Node. Uses a structural notification type.
 */
export interface InboxNotification {
  key: string;
  app: string;
  packageName: string;
  sender: string;
  text: string;
  timestamp: number;
  hasReply: boolean;
}

export type InboxKind = "personal" | "activity";

export interface AppMeta {
  name: string;
  color: string;
  icon: string;
  messaging: boolean;
}

const KNOWN: Record<string, Omit<AppMeta, "messaging"> & { messaging?: boolean }> = {
  "android": { name: "Android System", color: "#64748B", icon: "phone-portrait-outline", messaging: false },
  "com.whatsapp": { name: "WhatsApp", color: "#25D366", icon: "logo-whatsapp" },
  "com.whatsapp.w4b": { name: "WhatsApp Business", color: "#25D366", icon: "logo-whatsapp" },
  "com.google.android.apps.messaging": { name: "Messages", color: "#4285F4", icon: "chatbubble-ellipses" },
  "com.android.mms": { name: "SMS", color: "#4285F4", icon: "chatbubble-ellipses" },
  "com.samsung.android.messaging": { name: "Messages", color: "#1428A0", icon: "chatbubble-ellipses" },
  "org.telegram.messenger": { name: "Telegram", color: "#2AABEE", icon: "paper-plane" },
  "org.thoughtcrime.securesms": { name: "Signal", color: "#3A76F0", icon: "chatbubble" },
  "com.instagram.android": { name: "Instagram", color: "#E1306C", icon: "logo-instagram" },
  "com.facebook.orca": { name: "Messenger", color: "#0084FF", icon: "chatbubbles" },
  "com.google.android.gm": { name: "Gmail", color: "#EA4335", icon: "mail" },
  "com.snapchat.android": { name: "Snapchat", color: "#E6C700", icon: "camera" },
  "com.twitter.android": { name: "X", color: "#1DA1F2", icon: "logo-twitter" },
  "com.discord": { name: "Discord", color: "#5865F2", icon: "chatbubbles" },
  "com.slack": { name: "Slack", color: "#4A154B", icon: "chatbubbles" },
  "com.microsoft.teams": { name: "Teams", color: "#5B5FC7", icon: "people" },
  "com.google.android.dialer": { name: "Phone", color: "#1A73E8", icon: "call", messaging: true },
  "com.samsung.android.dialer": { name: "Phone", color: "#1A73E8", icon: "call", messaging: true },
  "com.android.systemui": { name: "System", color: "#64748B", icon: "phone-portrait-outline", messaging: false },
  "com.android.providers.downloads": { name: "Downloads", color: "#64748B", icon: "download-outline", messaging: false },
  "com.google.android.gms": { name: "Google Play services", color: "#64748B", icon: "logo-google", messaging: false },
  "com.android.vending": { name: "Play Store", color: "#64748B", icon: "logo-google-playstore", messaging: false },
  "com.google.android.apps.photos": { name: "Photos", color: "#64748B", icon: "images-outline", messaging: false },
  "com.android.chrome": { name: "Chrome", color: "#64748B", icon: "globe-outline", messaging: false },
};

const MESSAGING_DEFAULT = new Set(
  Object.keys(KNOWN).filter((k) => KNOWN[k].messaging !== false),
);

/** Packages / prefixes treated as device noise. */
const SYSTEM_PREFIXES = [
  "android",
  "com.android.",
  "com.google.android.gms",
  "com.google.android.apps.photos",
  "com.samsung.android.",
  "com.sec.android.",
  "com.miui.",
  "com.xiaomi.",
  "com.oneplus.",
  "com.coloros.",
  "com.huawei.",
];

const MESSAGING_KEYWORDS = /(messag|messenger|chat|sms|mms|whatsapp|telegram|signal|viber|line\.android|wechat|kakao|threema|wire|element)/i;

function looksLikePackage(s: string): boolean {
  return /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(s.trim());
}

function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const GENERIC_SEGMENTS = new Set(["android", "app", "apps", "mobile", "client", "main", "release", "prod"]);

/** Human-readable app name; never returns a raw package id. */
export function humanAppName(packageName: string, appLabel?: string): string {
  const known = KNOWN[packageName];
  if (known) return known.name;
  const label = (appLabel ?? "").trim();
  if (label && !looksLikePackage(label)) return label;
  const parts = (packageName || label).split(".").filter((p) => p && !GENERIC_SEGMENTS.has(p.toLowerCase()));
  const pick = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return pick ? titleCase(pick) : "Unknown app";
}

export function getAppMeta(packageName: string, appLabel?: string): AppMeta {
  const known = KNOWN[packageName];
  if (known) return { ...known, messaging: MESSAGING_DEFAULT.has(packageName) };
  return {
    name: humanAppName(packageName, appLabel),
    color: "#64748B",
    icon: "notifications-outline",
    messaging: MESSAGING_KEYWORDS.test(packageName),
  };
}

export function isSystemPackage(packageName: string): boolean {
  const p = packageName.toLowerCase();
  if (MESSAGING_DEFAULT.has(packageName)) return false;
  if (MESSAGING_KEYWORDS.test(p)) return false;
  return SYSTEM_PREFIXES.some((pre) => p === pre || p.startsWith(pre));
}

/** Personal = a message from a person; activity = device / app noise. */
export function classifyNotification(n: InboxNotification): InboxKind {
  const meta = getAppMeta(n.packageName, n.app);
  if (meta.messaging) return "personal";
  if (isSystemPackage(n.packageName)) return "activity";
  return n.hasReply ? "personal" : "activity";
}

export function dedupeKey(n: InboxNotification): string {
  return `${n.packageName}|${(n.sender ?? "").trim().toLowerCase()}|${(n.text ?? "").trim().toLowerCase()}`;
}

export function dedupeNotifications<T extends InboxNotification>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...items].sort((a, b) => b.timestamp - a.timestamp)) {
    const k = dedupeKey(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

export function hasContent(n: InboxNotification): boolean {
  return !!(n.sender?.trim() || n.text?.trim());
}

export function matchesQuery(n: InboxNotification, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (n.sender ?? "").toLowerCase().includes(q) ||
    (n.text ?? "").toLowerCase().includes(q) ||
    humanAppName(n.packageName, n.app).toLowerCase().includes(q)
  );
}

export interface InboxView<T extends InboxNotification> {
  personal: T[];
  activity: T[];
  visible: T[];
  apps: { packageName: string; name: string; color: string; count: number }[];
}

/** Split, filter and sort notifications for display. */
export function buildInbox<T extends InboxNotification>(
  items: T[],
  opts: { kind: InboxKind; query?: string; app?: string | null },
): InboxView<T> {
  const sorted = [...items].sort((a, b) => b.timestamp - a.timestamp);
  const personal = sorted.filter((n) => classifyNotification(n) === "personal");
  const activity = sorted.filter((n) => classifyNotification(n) === "activity");
  const pool = opts.kind === "personal" ? personal : activity;
  const appMap = new Map<string, { packageName: string; name: string; color: string; count: number }>();
  for (const n of pool) {
    const e = appMap.get(n.packageName);
    if (e) e.count += 1;
    else {
      const m = getAppMeta(n.packageName, n.app);
      appMap.set(n.packageName, { packageName: n.packageName, name: m.name, color: m.color, count: 1 });
    }
  }
  const visible = pool.filter(
    (n) => (!opts.app || n.packageName === opts.app) && matchesQuery(n, opts.query ?? ""),
  );
  return { personal, activity, visible, apps: [...appMap.values()].sort((a, b) => b.count - a.count) };
}

/** Display title: the person, or app name when sender is missing / equals a package. */
export function displayTitle(n: InboxNotification): string {
  const s = (n.sender ?? "").trim();
  if (s && s !== n.packageName && !looksLikePackage(s)) return s;
  return humanAppName(n.packageName, n.app);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p));
  if (parts.length === 0) return "?";
  const a = parts[0].match(/[\p{L}\p{N}]/u)?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1].match(/[\p{L}\p{N}]/u)?.[0] ?? "" : "";
  return (a + b).toUpperCase() || "?";
}

export function timeAgo(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

export function resolveReplyDeepUrl(packageName: string, appName: string, text: string): string | null {
  const pkg = packageName.toLowerCase();
  const app = appName.toLowerCase().trim();
  const encoded = encodeURIComponent(text);
  if (pkg.startsWith("org.telegram") || app === "telegram") return `tg://msg?text=${encoded}`;
  if (pkg.startsWith("com.whatsapp") || app === "whatsapp") return `whatsapp://send?text=${encoded}`;
  return null;
}
