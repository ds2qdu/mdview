import { Suspense, lazy } from "react";
import type { EditorMode } from "../types";

// 무거운 에디터는 코드 분할로 지연 로드해 초기 번들/첫 페인트를 가볍게 한다.
// - Milkdown(ProseMirror 풀스택)은 기본 render 모드에서만 로드.
// - CodeMirror(+ 전체 언어 하이라이트 데이터)는 Source 모드로 전환할 때 비로소 로드.
const MilkdownEditor = lazy(() => import("./MilkdownEditor"));
const SourceEditor = lazy(() => import("./SourceEditor"));

interface EditorAreaProps {
  mode: EditorMode;
  content: string;
  loadId: number;
  onChange: (next: string) => void;
  /** render 에디터가 초기 문서를 렌더링한 직후 호출(시작 시 창 표시 신호). */
  onReady?: () => void;
}

/**
 * 본문 편집 영역.
 * - Render 모드: Milkdown(WYSIWYG) (편집 → markdown 직렬화).
 * - Source 모드: CodeMirror 6 raw markdown 에디터(문법 하이라이트).
 * 두 모드는 content(doc.content)를 단일 진실원본으로 공유한다.
 * 두 에디터는 lazy 청크라 셸(툴바/상태바)이 먼저 그려진 뒤 스트리밍된다.
 */
export default function EditorArea({
  mode,
  content,
  loadId,
  onChange,
  onReady,
}: EditorAreaProps) {
  return (
    <main className="editorpane">
      <Suspense fallback={null}>
        {mode === "render" ? (
          <div className="editor__render">
            <MilkdownEditor
              key={loadId}
              content={content}
              onChange={onChange}
              onReady={onReady}
            />
          </div>
        ) : (
          <SourceEditor content={content} onChange={onChange} />
        )}
      </Suspense>
    </main>
  );
}
