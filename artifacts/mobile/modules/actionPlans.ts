export const PLAN_ACTIONS = ["flashlight", "set_brightness", "open_app", "set_timer", "set_alarm",
  "set_reminder", "media_control", "vibrate", "check_battery", "check_weather", "web_search"] as const;
type Step = { action: string; [key: string]: unknown };
/** Avoid executing just the first half of a combined request locally. */
export function isMultiActionRequest(text: string): boolean {
  if (!/\b(and then|then|and|also|after that)\b/i.test(text)) return false;
  const categories = [/\b(flashlight|torch)\b/i, /\b(brightness|dim)\b/i, /\b(timer|alarm|remind)\b/i,
    /\b(open|launch)\b/i, /\b(volume|media|music|pause|play)\b/i, /\b(battery|weather|search)\b/i,
    /\b(call|text|message)\b/i, /\b(wifi|bluetooth)\b/i].filter(pattern => pattern.test(text)).length;
  const verbs = text.match(/\b(turn|set|open|launch|start|stop|pause|play|increase|decrease|dim|remind|check|search|call|send|make)\b/gi) || [];
  return categories >= 2 || verbs.length >= 2;
}
export function validateActionPlan(input: unknown): Step[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 5) throw new Error("A plan needs 1–5 actions.");
  return input.map(step => {
    if (!step || typeof step !== "object" || Array.isArray(step) || !PLAN_ACTIONS.includes(step.action)) {
      throw new Error("This plan contains an unsupported or consequential action. Ask for it separately.");
    }
    for (const value of Object.values(step)) {
      if (!(typeof value === "string" && value.length <= 2000) && typeof value !== "boolean" &&
          !(typeof value === "number" && Number.isFinite(value))) throw new Error("Invalid action parameters.");
    }
    return step;
  });
}
export async function executeActionPlan(input: unknown,
  execute: (action: string, params: Record<string, unknown>, signal?: AbortSignal) => Promise<string | undefined>,
  signal?: AbortSignal): Promise<string> {
  const steps = validateActionPlan(input);
  const outcomes: string[] = [];
  for (let index = 0; index < steps.length; index++) {
    if (signal?.aborted) break;
    const { action, ...params } = steps[index];
    try {
      const outcome = await execute(action, params, signal);
      if (signal?.aborted) break;
      if (!outcome) throw new Error("No completion result was returned.");
      outcomes.push(`${index + 1}. ${outcome}`);
    } catch (error) {
      outcomes.push(`${index + 1}. Stopped: ${error instanceof Error ? error.message : "Android rejected this action."}`);
      outcomes.push("The remaining actions were not attempted. Earlier completed actions were not undone.");
      break;
    }
  }
  return outcomes.join("\n") || "The action plan was cancelled before a result was confirmed.";
}
export function validPhone(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\+?[\d\s()-]{5,25}$/.test(value)) return undefined;
  return value.replace(/[\s()-]/g, "");
}
export function contactChoices(contacts: Array<{ name?: string; phoneNumbers?: Array<{ number?: string }> }>, name: string) {
  const normalize = (value: string) => value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
  const exact = contacts.filter(contact => normalize(contact.name || "") === normalize(name));
  const candidates = exact.length ? exact : contacts;
  const seen = new Set<string>();
  return candidates.flatMap(contact => (contact.phoneNumbers || []).flatMap(phone => {
    const number = validPhone(phone.number);
    if (!number || seen.has(number)) return [];
    seen.add(number); return [{ label: contact.name || name, number }];
  }));
}
