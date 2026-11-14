import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdownReply, safeReplyLink } from "../artifacts/mobile/modules/markdownReply.ts";

function tokens(blocks) {
  const out = [];
  for (const block of blocks) {
    out.push(block.token.type, ...(block.token.children ?? []).map(token => token.type), ...tokens(block.children));
  }
  return out;
}

test("assistant replies parse headings, emphasis, lists, and links as rich content", () => {
  const parsed = tokens(parseMarkdownReply(
    "## Quick answer\n\nUse **bold** and *emphasis*.\n\n- One\n- Two\n\n[Read more](https://example.com)",
  ));
  assert.ok(parsed.includes("heading_open"));
  assert.ok(parsed.includes("strong_open"));
  assert.ok(parsed.includes("em_open"));
  assert.ok(parsed.includes("bullet_list_open"));
  assert.ok(parsed.includes("link_open"));
});

test("code, quote, ordered list, and table blocks are preserved", () => {
  const parsed = tokens(parseMarkdownReply(
    "> Important\n\n1. First\n2. Second\n\n```ts\nconst ok = true;\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
  ));
  assert.ok(parsed.includes("blockquote_open"));
  assert.ok(parsed.includes("ordered_list_open"));
  assert.ok(parsed.includes("fence"));
  assert.ok(parsed.includes("table_open"));
  assert.ok(parsed.includes("th_open"));
  assert.ok(parsed.includes("td_open"));
});

test("plain replies and streaming partial markdown remain readable", () => {
  assert.equal(tokens(parseMarkdownReply("Hello there.")).includes("paragraph_open"), true);
  const partial = parseMarkdownReply("A reply is still **arriving");
  assert.equal(partial[0].children[0].token.children?.[0]?.content, "A reply is still **arriving");
});

test("HTML is never emitted as executable markup", () => {
  const parsed = parseMarkdownReply("<script>alert(1)</script>");
  assert.ok(!tokens(parsed).includes("html_inline"));
  assert.ok(!tokens(parsed).includes("html_block"));
});

test("reply links reject unsafe protocols", () => {
  assert.equal(safeReplyLink("https://example.com"), "https://example.com/");
  assert.equal(safeReplyLink("mailto:hello@example.com"), "mailto:hello@example.com");
  assert.equal(safeReplyLink("javascript:alert(1)"), null);
  assert.equal(safeReplyLink("file:///private.txt"), null);
});

test("bare web addresses are parsed as links as well", () => {
  const parsed = tokens(parseMarkdownReply("Read https://example.com for details."));
  assert.ok(parsed.includes("link_open"));
});
