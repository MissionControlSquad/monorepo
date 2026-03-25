import { View, Text, Platform } from "react-native";

const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

// Colour tokens for normal vs inverted (white-on-dark bubble) rendering
const C = {
  heading1:  { normal: "#111827", inverted: "#ffffff" },
  heading2:  { normal: "#1f2937", inverted: "#ffffff" },
  heading3:  { normal: "#374151", inverted: "rgba(255,255,255,0.9)" },
  body:      { normal: "#374151", inverted: "#ffffff" },       // dark:text-slate-300 equiv
  muted:     { normal: "#6b7280", inverted: "rgba(255,255,255,0.65)" },
  bold:      { normal: "#111827", inverted: "#ffffff" },
  rule:      { normal: "#e5e7eb", inverted: "rgba(255,255,255,0.25)" },
  codeBg:    { normal: "#0f172a", inverted: "rgba(0,0,0,0.3)" },
  codeText:  { normal: "#cbd5e1", inverted: "rgba(255,255,255,0.9)" },
  codeLang:  { normal: "#94a3b8", inverted: "rgba(255,255,255,0.5)" },
  inlineCode:{ normal: "#6d28d9", inverted: "rgba(255,255,255,0.9)" },
  inlineBg:  { normal: "rgba(109,40,217,0.08)", inverted: "rgba(255,255,255,0.15)" },
};

type Variant = "normal" | "inverted";
function tok(key: keyof typeof C, v: Variant) { return C[key][v]; }

/**
 * Lightweight markdown renderer for React Native.
 * Handles headings, bullets, numbered lists, code blocks, bold, italic, inline code, and HR.
 *
 * Pass `inverted` when rendering on a dark/coloured background (e.g. "my" chat bubbles).
 */
export function SimpleMarkdown({ content, inverted = false }: { content: string; inverted?: boolean }) {
  const v: Variant = inverted ? "inverted" : "normal";
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeLang = "";

  function flushCode(key: string) {
    if (codeLines.length > 0) {
      elements.push(
        <View key={key} style={{ backgroundColor: tok("codeBg", v), borderRadius: 8, padding: 10, marginVertical: 4, gap: 4 }}>
          {codeLang ? (
            <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 0.5, color: tok("codeLang", v), textTransform: "uppercase" }}>
              {codeLang}
            </Text>
          ) : null}
          <Text style={{ fontFamily: MONO, fontSize: 13, lineHeight: 20, color: tok("codeText", v) }} selectable>
            {codeLines.join("\n")}
          </Text>
        </View>
      );
    }
    codeLines = [];
    codeLang = "";
  }

  lines.forEach((line, i) => {
    const key = String(i);

    if (line.startsWith("```")) {
      if (inCodeBlock) { flushCode(key); inCodeBlock = false; }
      else { inCodeBlock = true; codeLang = line.slice(3).trim(); }
      return;
    }
    if (inCodeBlock) { codeLines.push(line); return; }

    if (line.startsWith("### ")) {
      elements.push(
        <Text key={key} style={{ fontSize: 15, fontWeight: "700", color: tok("heading3", v), marginTop: 6, marginBottom: 2, lineHeight: 22 }}>
          {renderInline(line.slice(4), v)}
        </Text>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <Text key={key} style={{ fontSize: 17, fontWeight: "700", color: tok("heading2", v), marginTop: 8, marginBottom: 3, lineHeight: 24 }}>
          {renderInline(line.slice(3), v)}
        </Text>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <Text key={key} style={{ fontSize: 20, fontWeight: "800", color: tok("heading1", v), marginTop: 10, marginBottom: 4, lineHeight: 28 }}>
          {renderInline(line.slice(2), v)}
        </Text>
      );
    } else if (line.match(/^(\*{3}|-{3}|_{3})$/)) {
      elements.push(<View key={key} style={{ height: 1, backgroundColor: tok("rule", v), marginVertical: 8 }} />);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <View key={key} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
          <Text style={{ fontSize: 15, color: tok("muted", v), lineHeight: 23, width: 14 }}>•</Text>
          <Text style={{ fontSize: 15, color: tok("body", v), lineHeight: 23, flex: 1 }}>
            {renderInline(line.slice(2), v)}
          </Text>
        </View>
      );
    } else if (line.match(/^\d+\. /)) {
      const dotIdx = line.indexOf(". ");
      const num = line.slice(0, dotIdx);
      elements.push(
        <View key={key} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
          <Text style={{ fontSize: 15, color: tok("muted", v), lineHeight: 23, width: 18 }}>{num}.</Text>
          <Text style={{ fontSize: 15, color: tok("body", v), lineHeight: 23, flex: 1 }}>
            {renderInline(line.slice(dotIdx + 2), v)}
          </Text>
        </View>
      );
    } else if (line.trim() === "") {
      elements.push(<View key={key} style={{ height: 6 }} />);
    } else {
      elements.push(
        <Text key={key} style={{ fontSize: 15, color: tok("body", v), lineHeight: 23 }} selectable>
          {renderInline(line, v)}
        </Text>
      );
    }
  });

  if (inCodeBlock && codeLines.length > 0) flushCode("final");

  return <View style={{ gap: 2 }}>{elements}</View>;
}

/**
 * Renders inline markdown: **bold**, *italic*, `code`.
 */
function renderInline(text: string, v: Variant): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <Text key={i} style={{ fontWeight: "700", color: tok("bold", v) }}>{part.slice(2, -2)}</Text>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <Text key={i} style={{ fontStyle: "italic" }}>{part.slice(1, -1)}</Text>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <Text
              key={i}
              style={{ fontFamily: MONO, fontSize: 13, color: tok("inlineCode", v), backgroundColor: tok("inlineBg", v), borderRadius: 3 }}
            >
              {part.slice(1, -1)}
            </Text>
          );
        }
        return part || null;
      })}
    </>
  );
}
