import { View, Text, Platform } from "react-native";

const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

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
        <View key={key} className="bg-slate-900 rounded-lg p-3 my-1 gap-1.5">
          {codeLang ? (
            <Text
              className="uppercase tracking-wide text-[10px] text-slate-400"
              style={{ fontFamily: MONO, letterSpacing: 0.5 }}
            >
              {codeLang}
            </Text>
          ) : null}
          <Text
            className="text-slate-300 text-[13px] leading-5"
            style={{ fontFamily: MONO }}
            selectable
          >
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
      elements.push(
        <Text key={key} className="text-[15px] font-bold text-gray-700 dark:text-slate-200 mt-1.5 mb-0.5 leading-[22px]">
          {renderInline(line.slice(4))}
        </Text>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <Text key={key} className="text-[17px] font-bold text-gray-900 dark:text-slate-100 mt-2 mb-1 leading-6">
          {renderInline(line.slice(3))}
        </Text>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <Text key={key} className="text-[20px] font-extrabold text-gray-900 dark:text-slate-100 mt-2.5 mb-1 leading-7">
          {renderInline(line.slice(2))}
        </Text>
      );
    } else if (line.match(/^(\*{3}|-{3}|_{3})$/)) {
      elements.push(<View key={key} className="h-px bg-gray-200 dark:bg-slate-700 my-2" />);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <View key={key} className="flex-row gap-2 items-start">
          <Text className="text-[15px] text-gray-500 dark:text-slate-400 leading-6 w-3.5">•</Text>
          <Text className="text-[15px] text-gray-700 dark:text-slate-300 leading-6 flex-1">
            {renderInline(line.slice(2))}
          </Text>
        </View>
      );
    } else if (line.match(/^\d+\. /)) {
      const dotIdx = line.indexOf(". ");
      const num = line.slice(0, dotIdx);
      elements.push(
        <View key={key} className="flex-row gap-2 items-start">
          <Text className="text-[15px] text-gray-500 dark:text-slate-400 leading-6 w-3.5">{num}.</Text>
          <Text className="text-[15px] text-gray-700 dark:text-slate-300 leading-6 flex-1">
            {renderInline(line.slice(dotIdx + 2))}
          </Text>
        </View>
      );
    } else if (line.trim() === "") {
      elements.push(<View key={key} className="h-2" />);
    } else {
      elements.push(
        <Text key={key} className="text-[15px] text-gray-700 dark:text-slate-300 leading-6" selectable>
          {renderInline(line)}
        </Text>
      );
    }
  });

  if (inCodeBlock && codeLines.length > 0) {
    flushCode("final");
  }

  return <View className="gap-0.5">{elements}</View>;
}

/**
 * Renders inline markdown: **bold**, *italic*, `code`, mixed.
 * Returns a React element with nested Text spans.
 */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <Text key={i} className="font-bold text-gray-900 dark:text-slate-100">
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return (
            <Text key={i} className="italic">
              {part.slice(1, -1)}
            </Text>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <Text
              key={i}
              className="text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/50 rounded text-[13px] px-[3px]"
              style={{ fontFamily: MONO }}
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
