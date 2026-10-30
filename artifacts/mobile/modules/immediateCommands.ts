export type ImmediateDeviceIntent =
  | { type: "flashlight_on" | "flashlight_off" | "flashlight_toggle" }
  | { type: "open_app"; app: string }
  | { type: "brightness_set"; value: number }
  | { type: "brightness_up" | "brightness_down" | "brightness_max" | "brightness_min" }
  | { type: "volume_up" | "volume_down" | "volume_mute" | "volume_unmute" }
  | { type: "battery_check" | "vibrate" | "lock_screen" }
  | { type: "media_play" | "media_pause" | "media_next" | "media_previous" | "media_stop" };

const APP_ALIASES: Record<string, string> = {
  whatsapp: "WhatsApp", "whats app": "WhatsApp", youtube: "YouTube",
  "you tube": "YouTube", "google maps": "Maps", maps: "Maps",
  spotify: "Spotify", instagram: "Instagram", twitter: "Twitter", x: "Twitter",
  facebook: "Facebook", netflix: "Netflix", tiktok: "TikTok", "tik tok": "TikTok",
  gmail: "Gmail", telegram: "Telegram", settings: "Settings", camera: "Camera",
  gallery: "Gallery", photos: "Gallery", calculator: "Calculator", calc: "Calculator",
  clock: "Clock", browser: "Browser", chrome: "Chrome", firefox: "Firefox",
  "play store": "Play Store", "google play store": "Play Store",
};

/** Only complete, explicit commands. Never execute speculative ASR partials. */
export function detectImmediateDeviceIntent(text: string, assistantName = "Vox"): ImmediateDeviceIntent | null {
  const name = assistantName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const t = text.toLowerCase().trim()
    .replace(/[.!?,]+$/g, "")
    .replace(new RegExp(`^(?:hey\\s+)?${name}[,\\s]+`, "i"), "")
    .replace(/^(?:(?:please|can you|could you|would you|will you)\s+)+/, "")
    .replace(/(?:\s+(?:please|right now|now|for me))+$/, "")
    .replace(/\s+/g, " ").trim();
  // Questions, negations, conditional/compound instructions go to normal chat.
  if (/\b(don't|dont|do not|not|never|without|unless|if|when|how|why|what|and|then|after|before)\b/.test(t)) return null;

  const torch = "(?:the |my )?(?:torch|flashlight|flash light)";
  let match = t.match(new RegExp(`^(?:(?:turn|switch|put) )?(on|off) ${torch}$`))
    ?? t.match(new RegExp(`^(?:(?:turn|switch) )?${torch} (on|off)$`));
  if (match) return { type: match[1] === "on" ? "flashlight_on" : "flashlight_off" };
  match = t.match(new RegExp(`^(enable|activate|disable|deactivate) ${torch}$`));
  if (match) return { type: /^(enable|activate)$/.test(match[1]) ? "flashlight_on" : "flashlight_off" };
  if (new RegExp(`^(?:toggle )?${torch}$`).test(t)) return { type: "flashlight_toggle" };

  match = t.match(/^(?:open|launch|start|go to|take me to) (.+)$/);
  if (match) {
    const raw = match[1].replace(/^(?:the |my )/, "").replace(/ (?:app|application)$/, "").trim();
    if (raw && raw.length <= 60 && /^[\p{L}\p{N} .+'’&-]+$/u.test(raw)) {
      return { type: "open_app", app: APP_ALIASES[raw] ?? raw };
    }
  }

  if (/^(?:turn |raise |increase )?(?:the )?volume up$|^(?:raise|increase|turn up) (?:the )?volume$/.test(t)) return { type: "volume_up" };
  if (/^(?:turn |lower |decrease )?(?:the )?volume down$|^(?:lower|decrease|turn down) (?:the )?volume$/.test(t)) return { type: "volume_down" };
  if (/^mute(?: (?:(?:the|my) )?(?:volume|sound|phone))?$/.test(t)) return { type: "volume_mute" };
  if (/^unmute(?: (?:(?:the|my) )?(?:volume|sound|phone))?$/.test(t)) return { type: "volume_unmute" };
  match = t.match(/^(?:set |change )?(?:the )?(?:screen )?brightness (?:to )?(\d{1,3})(?: ?%| percent)?$/);
  if (match && Number(match[1]) <= 100) return { type: "brightness_set", value: Number(match[1]) };
  if (/^(?:increase|raise|turn up) (?:the )?(?:screen )?brightness$|^brightness up$/.test(t)) return { type: "brightness_up" };
  if (/^(?:decrease|lower|turn down) (?:the )?(?:screen )?brightness$|^brightness down$/.test(t)) return { type: "brightness_down" };
  if (/^(?:set )?(?:the )?(?:screen )?brightness (?:to )?(?:max|maximum|full)$/.test(t)) return { type: "brightness_max" };
  if (/^(?:set )?(?:the )?(?:screen )?brightness (?:to )?(?:min|minimum|lowest)$/.test(t)) return { type: "brightness_min" };
  if (/^(?:check |show )?(?:my |the )?battery(?: level| status| percentage)?$/.test(t)) return { type: "battery_check" };
  if (/^vibrate(?: (?:my|the) phone)?$/.test(t)) return { type: "vibrate" };
  if (/^lock (?:my |the )?(?:phone|screen)$/.test(t)) return { type: "lock_screen" };
  if (/^(?:play|resume) (?:the )?music$/.test(t)) return { type: "media_play" };
  if (/^pause (?:the )?(?:music|playback)$/.test(t)) return { type: "media_pause" };
  if (/^(?:next|skip) (?:song|track)$/.test(t)) return { type: "media_next" };
  if (/^previous (?:song|track)$/.test(t)) return { type: "media_previous" };
  if (/^stop (?:the )?(?:music|playback)$/.test(t)) return { type: "media_stop" };
  return null;
}
