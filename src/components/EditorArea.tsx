import type { EditorMode } from "../types";
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
}

/**
 * 본문 편집 영역.
 * - Render 모드: Milkdown(WYSIWYG) (편집 → markdown 직렬화).
 * - Source 모드: CodeMirror 6 raw markdown 에디터(문법 하이라이트, 선택적 Vim).
 * 두 모드는 content(doc.content)를 단일 진실원본으로 공유한다.
 */
export default function EditorArea({
  mode,
  content,
  loadId,
  onChange,
  vimEnabled,
  onSave,
  docDir,
}: EditorAreaProps) {
  return (
    <main className="editorpane">
      {mode === "render" ? (
        <div className="editor__render">
          <MilkdownEditor key={loadId} content={content} onChange={onChange} docDir={docDir} />
        </div>
      ) : (
        <SourceEditor
          content={content}
          onChange={onChange}
          vimEnabled={vimEnabled}
          onSave={onSave}
        />
      )}
    </main>
  );
}
