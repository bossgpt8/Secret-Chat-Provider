import { useColorScheme } from "react-native";
import { useAssistant } from "@/context/AssistantContext";

/**
 * Returns the effective color scheme, respecting the user's theme override
 * stored in AssistantContext. Falls back to the device system preference when
 * the override is "system".
 */
export function useAppColorScheme(): "dark" | "light" {
  const { themeOverride } = useAssistant();
  const systemScheme = useColorScheme() ?? "light";
  if (themeOverride === "dark") return "dark";
  if (themeOverride === "light") return "light";
  return systemScheme;
}
