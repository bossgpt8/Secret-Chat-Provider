import MarkdownIt, { type Token } from "markdown-it";

/** Markdown stays text-only: raw HTML and remote embedded images are disabled. */
const parser = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  breaks: false,
});

export interface MarkdownBlock {
  token: Token;
  children: MarkdownBlock[];
}

export function parseMarkdownReply(source: string): MarkdownBlock[] {
  const roots: MarkdownBlock[] = [];
  const parents: MarkdownBlock[][] = [roots];

  for (const token of parser.parse(source, {})) {
    if (token.nesting < 0) {
      if (parents.length > 1) parents.pop();
      continue;
    }
    const block: MarkdownBlock = { token, children: [] };
    parents[parents.length - 1].push(block);
    if (token.nesting > 0) parents.push(block.children);
  }
  return roots;
}

export function safeReplyLink(destination: string): string | null {
  try {
    const url = new URL(destination);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
