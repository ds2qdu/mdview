import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { EditorMode } from "../types";
import { applyToTops, captureFromTops } from "../lib/scrollAnchor";
import type { ScrollAnchor } from "../lib/scrollAnchor";
import MilkdownEditor from "./MilkdownEditor";
import SourceEditor from "./SourceEditor";

interface EditorAreaProps {
  mode: EditorMode;
  content: string;
  loadId: number;
  onChange: (next: string) => void;
  /** Source(CodeMirror) 모드의 Vim 키바인딩 사용 여부. */
  vimEnabled: boolean;
  /** Vim `:w` 등에서 호출할 저장 액션. */
  onSave: () => void;
  /** 현재 문서 폴더 — Render 모드에서 `![[name]]`를 attachments에서 해석할 때 사용. */
  docDir: string | null;
  /** 모드 전환 스크롤 동기화: 들어오는 에디터가 1회 소비할 앵커. */
  pendingAnchorRef: MutableRefObject<ScrollAnchor | null>;
  /** 모드 전환 스크롤 동기화: 현재 보이는 에디터가 등록하는 캡처 함수(전환 시 동기 호출). */
  captureCurrentRef: MutableRefObject<(() => ScrollAnchor | null) | null>;
}

/** Render 스크롤 컨테이너(.editor__render) 안 제목들의 콘텐츠 좌표 top(px, scrollTop과 동일 좌표계). */
function renderHeadingTops(scroller: HTMLElement): number[] {
  const pm = scroller.querySelector<HTMLElement>(".ProseMirror");
  if (!pm) return [];
  const base = scroller.getBoundingClientRect().top;
  const st = scroller.scrollTop;
  return Array.from(pm.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")).map(
    (h) => h.getBoundingClientRect().top - base + st,
  );
}

/**
 * 본문 편집 영역.
 * - Render 모드: Milkdown(WYSIWYG). 스크롤 컨테이너는 이 컴포넌트가 소유하는 `.editor__render`.
 * - Source 모드: CodeMirror 6 raw markdown 에디터.
 * 두 모드는 content(doc.content)를 단일 진실원본으로 공유하고, 전환 시 제목 앵커로 스크롤 위치를 맞춘다.
 */
export default function EditorArea({
  mode,
  content,
  loadId,
  onChange,
  vimEnabled,
  onSave,
  docDir,
  pendingAnchorRef,
  captureCurrentRef,
}: EditorAreaProps) {
  const renderScrollRef = useRef<HTMLDivElement>(null);

  // Render가 보일 때, "떠날 때" 호출될 캡처 함수를 등록(전환 핸들러에서 동기 호출).
  // cleanup은 identity 체크 — 새로 마운트된 에디터의 등록을 옛 에디터의 지연 cleanup이 지우지 않게.
  useEffect(() => {
    if (mode !== "render") return;
    const fn = (): ScrollAnchor | null => {
      const el = renderScrollRef.current;
      if (!el) return null;
      return captureFromTops(el.scrollTop, el.scrollHeight, el.clientHeight, renderHeadingTops(el), loadId);
    };
    captureCurrentRef.current = fn;
    return () => {
      if (captureCurrentRef.current === fn) captureCurrentRef.current = null;
    };
  }, [mode, loadId, captureCurrentRef]);

  // Milkdown 마운트(l.mounted) 후 1회 복원. 이미지/표 비동기 리플로우는 ResizeObserver로 재적용(자기보정).
  const restoreRender = useCallback(() => {
    const el = renderScrollRef.current;
    if (!el) return;
    const a = pendingAnchorRef.current;
    if (!a || a.loadId !== loadId) return;
    pendingAnchorRef.current = null; // 1회 소비

    const apply = () => {
      const target = applyToTops(a, renderHeadingTops(el), el.scrollHeight, el.clientHeight);
      if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target; // idempotent
    };

    requestAnimationFrame(() => {
      apply();
      const pm = el.querySelector<HTMLElement>(".ProseMirror") ?? el;
      const ro = new ResizeObserver(() => apply());
      ro.observe(pm);
      const onLoad = () => apply();
      el.addEventListener("load", onLoad, true); // <img> load는 버블 안 함 → capture
      window.setTimeout(() => {
        ro.disconnect();
        el.removeEventListener("load", onLoad, true);
      }, 600);
    });
  }, [pendingAnchorRef, loadId]);

  return (
    <main className="editorpane">
      {mode === "render" ? (
        <div className="editor__render" ref={renderScrollRef}>
          <MilkdownEditor
            key={loadId}
            content={content}
            onChange={onChange}
            docDir={docDir}
            onReady={restoreRender}
          />
        </div>
      ) : (
        <SourceEditor
          content={content}
          onChange={onChange}
          vimEnabled={vimEnabled}
          onSave={onSave}
          loadId={loadId}
          pendingAnchorRef={pendingAnchorRef}
          captureCurrentRef={captureCurrentRef}
        />
      )}
    </main>
  );
}
