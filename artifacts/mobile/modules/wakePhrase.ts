/** Keep aligned with VoxWakeTokenizer's explicit English-model input contract. */
export function wakePhraseForName(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 1 || clean.length > 40 || !/^[A-Za-z][A-Za-z .'-]*$/.test(clean)) {
    throw new Error("Wake listening currently supports names using 1–40 English letters, spaces, apostrophes or hyphens.");
  }
  return `Hey ${clean}`;
}
