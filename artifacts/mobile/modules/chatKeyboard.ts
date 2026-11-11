/** Keep tab-bar clearance only while the keyboard is closed. */
export function chatComposerBottomPadding(bottomInset: number, progress: number): number {
  "worklet";
  const visible = Math.max(0, Math.min(1, progress));
  return (Math.max(0, bottomInset) + 57) * (1 - visible) + 8 * visible;
}
