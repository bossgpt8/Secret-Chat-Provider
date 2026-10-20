import colors from "@/constants/colors";
import { useAppColorScheme } from "@/hooks/useAppColorScheme";

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * Respects the user's theme override (dark / light / system) stored in
 * AssistantContext. When the override is "system" it falls back to the
 * device's appearance setting.
 */
export function useColors() {
  const scheme = useAppColorScheme();
  const palette =
    scheme === "dark" && "dark" in colors
      ? (colors as unknown as Record<string, typeof colors.light>).dark
      : colors.light;
  return { ...palette, radius: colors.radius };
}
