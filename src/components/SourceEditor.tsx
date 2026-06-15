import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

interface SourceEditorProps {
  content: string;
  onChange: (next: string) => void;
}

// 에디터 외형(배경/커서/선택/스크롤러) — CSS 변수를 써서 라이트/다크 자동 적응.
const baseTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--text)",
    backgroundColor: "transparent",
    fontSize: "14px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.7",
    padding: "32px max(24px, calc((100% - 760px) / 2)) 96px",
  },
  ".cm-content": { caretColor: "var(--accent)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    {
      backgroundColor: "var(--active)",
    },
  ".cm-gutters": { display: "none" },
});

// markdown 문법 하이라이트 — 강조색은 우리 토큰 사용.
const mdHighlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--accent)", fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: [t.link, t.url], color: "var(--accent)" },
  { tag: t.monospace, color: "var(--text)" },
  { tag: t.quote, color: "var(--text-muted)" },
  { tag: [t.meta, t.processingInstruction, t.labelName], color: "var(--text-muted)" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--text-muted)" },
  { tag: t.list, color: "var(--accent)" },
]);

const extensions = [
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  EditorView.lineWrapping,
  baseTheme,
  syntaxHighlighting(mdHighlight),
];

/**
 * Source 모드: raw markdown을 CodeMirror 6로 편집(문법 하이라이트).
 * value는 doc.content로 제어 → 다른 모드/파일 열기와 자동 동기화.
 */
export default function SourceEditor({ content, onChange }: SourceEditorProps) {
  return (
    <CodeMirror
      className="editor__source"
      value={content}
      onChange={onChange}
      extensions={extensions}
      height="100%"
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        highlightSelectionMatches: false,
      }}
    />
  );
}
