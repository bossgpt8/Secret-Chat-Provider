/** Keep a small, relevant set; never send every stored fact to every request. */
export function relevantMemories(facts: string[], question: string, limit = 5): string[] {
  const words = new Set(question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
  const unique = [...new Set(facts.map(f => f.trim()).filter(Boolean))];
  return unique.map((fact, index) => ({
    fact, index,
    score: (fact.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).reduce((n, word) => n + (words.has(word) ? 1 : 0), 0),
  })).filter(value => value.score > 0 || /(?:name is|prefers? |preferred |allergic)/i.test(value.fact))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map(value => value.fact.slice(0, 500));
}
