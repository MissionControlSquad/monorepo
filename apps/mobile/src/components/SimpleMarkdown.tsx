import { View, Text, StyleSheet, Platform } from "react-native";

/**
 * Lightweight markdown renderer for React Native.
 * Handles headings, bullets, code blocks, bold, italic, and horizontal rules.
 * No native dependencies required.
 */
export function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeLang = "";

  function flushCode(key: string) {
    if (codeLines.length > 0) {
      elements.push(
        <View key={key} style={styles.codeBlock}>
          {codeLang ? (
            <Text style={styles.codeLang}>{codeLang}</Text>
          ) : null}
          <Text style={styles.codeText} selectable>
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
      if (inCodeBlock) {
        flushCode(key);
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      return;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      return;
    }

    if (line.startsWith("### ")) {
      elements.push(<Text key={key} style={styles.h3}>{renderInline(line.slice(4))}</Text>);
    } else if (line.startsWith("## ")) {
      elements.push(<Text key={key} style={styles.h2}>{renderInline(line.slice(3))}</Text>);
    } else if (line.startsWith("# ")) {
      elements.push(<Text key={key} style={styles.h1}>{renderInline(line.slice(2))}</Text>);
    } else if (line.match(/^(\*{3}|-{3}|_{3})$/)) {
      elements.push(<View key={key} style={styles.hr} />);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <View key={key} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{renderInline(line.slice(2))}</Text>
        </View>
      );
    } else if (line.match(/^\d+\. /)) {
      const dotIdx = line.indexOf(". ");
      const num = line.slice(0, dotIdx);
      elements.push(
        <View key={key} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>{num}.</Text>
          <Text style={styles.bulletText}>{renderInline(line.slice(dotIdx + 2))}</Text>
        </View>
      );
    } else if (line.trim() === "") {
      elements.push(<View key={key} style={styles.spacer} />);
    } else {
      elements.push(<Text key={key} style={styles.body} selectable>{renderInline(line)}</Text>);
    }
  });

  if (inCodeBlock && codeLines.length > 0) {
    flushCode("final");
  }

  return <View style={styles.container}>{elements}</View>;
}

/**
 * Renders inline markdown: **bold**, *italic*, `code`, mixed.
 * Returns a React element with nested Text spans.
 */
function renderInline(text: string): React.ReactNode {
  // Split on bold (**text**), italic (*text*), and inline code (`text`)
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <Text key={i} style={styles.bold}>{part.slice(2, -2)}</Text>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <Text key={i} style={styles.italic}>{part.slice(1, -1)}</Text>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <Text key={i} style={styles.inlineCode}>{part.slice(1, -1)}</Text>;
        }
        return part || null;
      })}
    </>
  );
}

const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

const styles = StyleSheet.create({
  container: { gap: 2 },
  h1: { fontSize: 20, fontWeight: "800", color: "#111827", marginTop: 10, marginBottom: 4, lineHeight: 28 },
  h2: { fontSize: 17, fontWeight: "700", color: "#111827", marginTop: 8, marginBottom: 3, lineHeight: 24 },
  h3: { fontSize: 15, fontWeight: "700", color: "#374151", marginTop: 6, marginBottom: 2, lineHeight: 22 },
  body: { fontSize: 15, color: "#374151", lineHeight: 24 },
  bold: { fontWeight: "700", color: "#111827" },
  italic: { fontStyle: "italic" },
  inlineCode: {
    fontFamily: MONO,
    fontSize: 13,
    color: "#7c3aed",
    backgroundColor: "#f5f3ff",
    borderRadius: 3,
    paddingHorizontal: 3,
  },
  bulletRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  bulletDot: { fontSize: 15, color: "#6b7280", lineHeight: 24, width: 14 },
  bulletText: { fontSize: 15, color: "#374151", lineHeight: 24, flex: 1 },
  spacer: { height: 8 },
  hr: { height: 1, backgroundColor: "#e5e7eb", marginVertical: 8 },
  codeBlock: {
    backgroundColor: "#1e1e2e",
    borderRadius: 8,
    padding: 12,
    marginVertical: 4,
    gap: 6,
  },
  codeLang: {
    fontFamily: MONO,
    fontSize: 10,
    color: "#7c7f93",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  codeText: {
    fontFamily: MONO,
    fontSize: 13,
    color: "#cdd6f4",
    lineHeight: 20,
  },
});
