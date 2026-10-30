/** Keep local neural synthesis bounded without dropping the rest of a reply. */
export function splitPiperText(text: string, maxChars = 180): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (current && current.length + word.length + 1 > maxChars) {
      chunks.push(current);
      current = "";
    }
    let remaining = word;
    while (remaining.length > maxChars) {
      chunks.push(remaining.slice(0, maxChars));
      remaining = remaining.slice(maxChars);
    }
    current = current ? `${current} ${remaining}` : remaining;
  }
  if (current) chunks.push(current);
  return chunks;
}
