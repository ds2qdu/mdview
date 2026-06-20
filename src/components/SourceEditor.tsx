import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { vim, Vim } from "@replit/codemirror-vim";
import { captureFromTops } from "../lib/scrollAnchor";
import type { ScrollAnchor } from "../lib/scrollAnchor";

interface SourceEditorProps {
  content: string;
  onChange: (next: string) => void;
  /** Vim 키바인딩 사용 여부. */
  vimEnabled: boolean;
  /** Vim `:w`/`:write` Ex 명령 → 실제 파일 저장. */
  onSave?: () => void;
  /** 파일 식별자 — 변경(파일 열기/새로) 시 Source는 key 리마운트가 안 되므로 스크롤을 맨 위로 리셋. */
  loadId: number;
  /** 모드 전환 스크롤 동기화: 들어올 때 1회 소비할 앵커. */
  pendingAnchorRef: MutableRefObject<ScrollAnchor | null>;
  /** 모드 전환 스크롤 동기화: 떠날 때 동기 호출될 캡처 함수를 등록. */
  captureCurrentRef: MutableRefObject<(() => ScrollAnchor | null) | null>;
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

const baseExtensions = [
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  EditorView.lineWrapping,
  baseTheme,
  syntaxHighlighting(mdHighlight),
];

// ----- 스크롤 동기화: 제목 라인 스캔 + 캡처/복원 (lib/scrollAnchor.ts와 같은 좌표계 규약) -----

/** 제목 라인들의 doc 위치(line.from). ATX `#` + setext, 펜스/들여쓰기 코드블록은 스킵(렌더와 개수 일치). */
function sourceHeadingPositions(view: EditorView): number[] {
  const doc = view.state.doc;
  const positions: number[] = [];
  let inFence = false;
  let fenceChar = "";
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const text = line.text;
    const fence = /^[ \t]*(`{3,}|~{3,})/.exec(text);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceChar = fence[1][0];
      } else if (text.trimStart().startsWith(fenceChar.repeat(3))) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;
    if (/^( {4}|\t)/.test(text)) continue; // 들여쓰기 코드블록
    if (/^ {0,3}#{1,6}(\s|$)/.test(text)) {
      positions.push(line.from);
      continue;
    }
    // setext: 비어있지 않은 텍스트 줄 + 다음 줄이 ===/--- 밑줄
    if (text.trim() !== "" && !/^ {0,3}#{1,6}/.test(text) && n < doc.lines) {
      if (/^ {0,3}(=+|-+)[ \t]*$/.test(doc.line(n + 1).text)) positions.push(line.from);
    }
  }
  return positions;
}

/** 스크롤러 패딩-top(px) — block.top(.cm-content 기준)을 scrollTop 좌표계로 옮길 때 더한다. */
function padTop(view: EditorView): number {
  return parseFloat(getComputedStyle(view.scrollDOM).paddingTop) || 0;
}

function captureSourceAnchor(view: EditorView, loadId: number): ScrollAnchor {
  const sc = view.scrollDOM;
  const pad = padTop(view);
  const tops = sourceHeadingPositions(view).map((p) => view.lineBlockAt(p).top + pad);
  return captureFromTops(sc.scrollTop, sc.scrollHeight, sc.clientHeight, tops, loadId);
}

function restoreSourceAnchor(view: EditorView, a: ScrollAnchor): void {
  const sc = view.scrollDOM;
  const positions = sourceHeadingPositions(view);
  const useHeading =
    a.headingIndex >= 0 && a.headingIndex < positions.length && positions.length === a.headingCount;

  if (!useHeading) {
    // 비례식 폴백: CM의 추정 scrollHeight를 피해 라인 기준으로 스크롤.
    const lines = view.state.doc.lines;
    const targetLine = Math.max(1, Math.min(lines, Math.round(a.docFraction * lines) || 1));
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(targetLine).from, { y: "start" }) });
    return;
  }

  const pos = positions[a.headingIndex];
  // 1) 제목을 뷰포트 top에 정렬(패딩 등 좌표는 CM이 정확히 처리).
  view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "start" }) });
  // 2) 구간 내 offset만큼 추가로 내림(블록 top 델타라 패딩 무관). 측정 사이클 안에서 수행 후 1회 재적용.
  const adjust = () =>
    view.requestMeasure({
      read: () => {
        const here = view.lineBlockAt(pos).top;
        const next =
          a.headingIndex + 1 < positions.length
            ? view.lineBlockAt(positions[a.headingIndex + 1]).top
            : sc.scrollHeight;
        const span = Math.max(1, next - here);
        const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
        const target = sc.scrollTop + a.offsetFraction * span;
        return Number.isFinite(target) ? Math.max(0, Math.min(max, target)) : sc.scrollTop;
      },
      write: (target) => {
        if (Math.abs(sc.scrollTop - target) > 1) sc.scrollTop = target;
      },
    });
  adjust();
  requestAnimationFrame(adjust); // lazy 측정 높이 보정용 1회 재적용
}

/**
 * Source 모드: raw markdown을 CodeMirror 6로 편집(문법 하이라이트).
 * value는 doc.content로 제어 → 다른 모드/파일 열기와 자동 동기화.
 * 모드 전환 시 제목 앵커로 스크롤 위치를 맞춘다(EditorArea/App과 ref로 협력).
 */
export default function SourceEditor({
  content,
  onChange,
  vimEnabled,
  onSave,
  loadId,
  pendingAnchorRef,
  captureCurrentRef,
}: SourceEditorProps) {
  // `:w`/`:write` Ex 명령을 최신 onSave로 연결(전역 등록은 1회).
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  useEffect(() => {
    Vim.defineEx("write", "w", () => onSaveRef.current?.());
  }, []);

  const viewRef = useRef<EditorView | null>(null);
  const loadIdRef = useRef(loadId);
  loadIdRef.current = loadId;

  // "떠날 때" 호출될 캡처 함수 등록(identity cleanup).
  useEffect(() => {
    const fn = (): ScrollAnchor | null =>
      viewRef.current ? captureSourceAnchor(viewRef.current, loadIdRef.current) : null;
    captureCurrentRef.current = fn;
    return () => {
      if (captureCurrentRef.current === fn) captureCurrentRef.current = null;
    };
  }, [captureCurrentRef]);

  // 파일 열기/새로(loadId 변경): Source는 key 리마운트가 안 되므로 명시적으로 맨 위로.
  // 마운트 첫 실행은 건너뛴다(모드 전환 마운트는 onCreateEditor의 앵커 복원이 처리).
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const view = viewRef.current;
    if (!view) return;
    view.requestMeasure({ read: () => 0, write: () => (view.scrollDOM.scrollTop = 0) });
  }, [loadId]);

  // CodeMirror view 캡처 + (전환으로 들어온 경우) 앵커 1회 복원.
  const handleCreate = useCallback(
    (view: EditorView) => {
      viewRef.current = view;
      const a = pendingAnchorRef.current;
      if (a && a.loadId === loadIdRef.current) {
        pendingAnchorRef.current = null; // 1회 소비
        restoreSourceAnchor(view, a);
      }
    },
    [pendingAnchorRef],
  );

  const extensions = useMemo(
    () => (vimEnabled ? [vim({ status: true }), ...baseExtensions] : baseExtensions),
    [vimEnabled],
  );

  return (
    <CodeMirror
      className="editor__source"
      theme="none"
      value={content}
      onChange={onChange}
      onCreateEditor={handleCreate}
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
