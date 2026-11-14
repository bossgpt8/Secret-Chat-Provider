import React, { useMemo } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Token } from "markdown-it";
import type { useColors } from "@/hooks/useColors";
import { parseMarkdownReply, safeReplyLink, type MarkdownBlock } from "@/modules/markdownReply";

type Colors = ReturnType<typeof useColors>;

function matchingClose(tokens: Token[], start: number): number {
  const type = tokens[start]?.type.replace("_open", "_close");
  let depth = 0;
  for (let index = start; index < tokens.length; index++) {
    if (tokens[index].type === tokens[start].type) depth++;
    if (tokens[index].type === type && --depth === 0) return index;
  }
  return tokens.length;
}

function inlineNodes(tokens: Token[], colors: Colors): React.ReactNode[] {
  const output: React.ReactNode[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.nesting === 1) {
      const close = matchingClose(tokens, i);
      const children = inlineNodes(tokens.slice(i + 1, close), colors);
      const styles = token.type === "strong_open" ? replyStyles.bold
        : token.type === "em_open" ? replyStyles.italic
        : token.type === "s_open" ? replyStyles.strike
        : undefined;
      const href = token.type === "link_open" ? safeReplyLink(token.attrGet("href") ?? "") : null;
      output.push(
        <Text
          key={`${token.type}-${i}`}
          style={[styles, href ? { color: colors.primary, textDecorationLine: "underline" as const } : undefined]}
          accessibilityRole={href ? "link" : undefined}
          onPress={href ? () => { void Linking.openURL(href).catch(() => {}); } : undefined}
        >
          {children}
        </Text>,
      );
      i = close;
      continue;
    }
    if (token.type === "code_inline") {
      output.push(<Text key={`code-${i}`} style={[replyStyles.inlineCode, { color: colors.secondaryForeground, backgroundColor: colors.secondary }]}>{token.content}</Text>);
    } else if (token.type === "softbreak" || token.type === "hardbreak") {
      output.push("\n");
    } else if (token.type === "image") {
      // Do not fetch image URLs embedded in assistant text without consent.
      output.push(token.content ? `[Image: ${token.content}]` : "[Image]");
    } else if (token.type === "text" || token.type === "text_special" || token.type === "html_inline") {
      output.push(token.content);
    }
  }
  return output;
}

function inlineContent(block: MarkdownBlock, colors: Colors) {
  const inline = block.children.find(child => child.token.type === "inline")?.token.children ?? [];
  return inlineNodes(inline, colors);
}

function descendants(block: MarkdownBlock, type: string): MarkdownBlock[] {
  const found: MarkdownBlock[] = [];
  for (const child of block.children) {
    if (child.token.type === type) found.push(child);
    found.push(...descendants(child, type));
  }
  return found;
}

function table(block: MarkdownBlock, colors: Colors, key: string) {
  const headers = descendants(block, "th_open");
  const headerRow = headers.length ? headers.map(cell => inlineContent(cell, colors)) : [];
  const rows = descendants(block, "tr_open").map((row, rowIndex) => {
    const cells = [...row.children.filter(c => c.token.type === "th_open"), ...row.children.filter(c => c.token.type === "td_open")];
    if (cells.length === 0) return null;
    const isHeader = row.children.some(c => c.token.type === "th_open");
    return (
      <View key={`${key}-row-${rowIndex}`} style={replyStyles.tableRow}>
        {cells.map((cell, cellIndex) => (
          <View key={`${key}-${rowIndex}-${cellIndex}`} style={[
            replyStyles.tableCell,
            { borderColor: colors.border, backgroundColor: isHeader ? colors.secondary : colors.assistantBubble },
          ]}>
            <Text style={[replyStyles.body, isHeader && replyStyles.bold, { color: colors.assistantBubbleText }]}>
              {inlineContent(cell, colors)}
            </Text>
          </View>
        ))}
      </View>
    );
  }).filter(Boolean);

  return (
    <ScrollView key={key} horizontal showsHorizontalScrollIndicator nestedScrollEnabled style={replyStyles.tableScroll}>
      <View>
        {headerRow.length > 0 && rows.length === 0 && (
          <View style={replyStyles.tableRow}>{headerRow.map((cell, i) => (
            <Text key={i} style={[replyStyles.tableCell, { color: colors.assistantBubbleText, borderColor: colors.border, backgroundColor: colors.secondary }]}>{cell}</Text>
          ))}</View>
        )}
        {rows}
      </View>
    </ScrollView>
  );
}

function renderBlock(block: MarkdownBlock, colors: Colors, key: string): React.ReactNode {
  const type = block.token.type;
  if (type === "inline") return null;
  if (type === "paragraph_open") {
    const inline = block.children.find(child => child.token.type === "inline");
    if (!inline) return null;
    return (
      <Text key={key} style={[replyStyles.body, { color: colors.assistantBubbleText }, block.token.hidden && replyStyles.tightParagraph]}>
        {inlineNodes(inline.token.children ?? [], colors)}
      </Text>
    );
  }
  if (type === "heading_open") {
    const inline = block.children.find(child => child.token.type === "inline");
    const size = Number(type === "heading_open" ? block.token.tag.slice(1) : 4);
    return (
      <Text key={key} style={[replyStyles.heading, { fontSize: [0, 23, 20, 17, 16, 15, 14][size] ?? 16, color: colors.assistantBubbleText }]}>
        {inline ? inlineNodes(inline.token.children ?? [], colors) : null}
      </Text>
    );
  }
  if (type === "bullet_list_open" || type === "ordered_list_open") {
    const ordered = type === "ordered_list_open";
    const start = Math.max(1, Number(block.token.attrGet("start") || 1));
    const items = block.children.filter(child => child.token.type === "list_item_open");
    return (
      <View key={key} style={replyStyles.list}>
        {items.map((item, index) => (
          <View key={`${key}-${index}`} style={replyStyles.listItem}>
            <Text style={[replyStyles.listMarker, { color: colors.primary }]}>{ordered ? `${start + index}.` : "•"}</Text>
            <View style={replyStyles.listContent}>
              {item.children.map((child, childIndex) => renderBlock(child, colors, `${key}-${index}-${childIndex}`))}
            </View>
          </View>
        ))}
      </View>
    );
  }
  if (type === "blockquote_open") {
    return (
      <View key={key} style={[replyStyles.quote, { borderLeftColor: colors.primary }]}>
        <View style={replyStyles.quoteContent}>
          {block.children.map((child, index) => renderBlock(child, colors, `${key}-quote-${index}`))}
        </View>
      </View>
    );
  }
  if (type === "fence" || type === "code_block") {
    return (
      <View key={key} style={[replyStyles.codeBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        {block.token.info.trim() !== "" && (
          <Text style={[replyStyles.language, { color: colors.mutedForeground }]}>{block.token.info.trim()}</Text>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
          <Text selectable style={[replyStyles.code, { color: colors.assistantBubbleText }]}>{block.token.content.replace(/\n$/, "")}</Text>
        </ScrollView>
      </View>
    );
  }
  if (type === "table_open") return table(block, colors, key);
  if (type === "hr") return <View key={key} style={[replyStyles.rule, { backgroundColor: colors.border }]} />;
  if (type === "thead_open" || type === "tbody_open" || type === "tr_open" || type === "th_open" || type === "td_open" ||
      type === "list_item_open" || type === "blockquote_close" || type === "bullet_list_close" || type === "ordered_list_close" ||
      type === "paragraph_close" || type === "heading_close" || type === "table_close" || type.endsWith("_close")) return null;
  return block.children.length > 0
    ? <View key={key} style={replyStyles.nested}>{block.children.map((child, index) => renderBlock(child, colors, `${key}-${index}`))}</View>
    : null;
}

export function AssistantReply({ content, colors }: { content: string; colors: Colors }) {
  const blocks = useMemo(() => parseMarkdownReply(content), [content]);
  return (
    <View style={replyStyles.root}>
      {blocks.map((block, index) => renderBlock(block, colors, `reply-${index}`))}
    </View>
  );
}

const replyStyles = StyleSheet.create({
  root: { gap: 5 },
  nested: { gap: 5 },
  body: { fontSize: 15.5, fontFamily: "Inter_400Regular", lineHeight: 24 },
  tightParagraph: { marginBottom: 0 },
  heading: { fontFamily: "Inter_700Bold", lineHeight: 28, marginTop: 7, marginBottom: 2 },
  bold: { fontFamily: "Inter_700Bold" },
  italic: { fontFamily: "Inter_400Regular", fontStyle: "italic" },
  strike: { textDecorationLine: "line-through" },
  inlineCode: { fontFamily: "monospace", fontSize: 13, paddingHorizontal: 3, borderRadius: 4 },
  list: { gap: 4 },
  listItem: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  listMarker: { minWidth: 19, fontSize: 15, lineHeight: 24, fontFamily: "Inter_600SemiBold" },
  listContent: { flex: 1, gap: 2 },
  quote: { borderLeftWidth: 3, paddingLeft: 10, marginVertical: 3 },
  quoteContent: { flex: 1, gap: 3 },
  codeBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 10, overflow: "hidden" },
  language: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", marginBottom: 6 },
  code: { fontFamily: "monospace", fontSize: 12.5, lineHeight: 19 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  tableScroll: { maxWidth: "100%", marginVertical: 4 },
  tableRow: { flexDirection: "row" },
  tableCell: { width: 142, borderWidth: StyleSheet.hairlineWidth, padding: 7 },
});
