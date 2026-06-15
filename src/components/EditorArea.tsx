import type { EditorMode } from "../types";
import MilkdownEditor from "./MilkdownEditor";
import SourceEditor from "./SourceEditor";

interface EditorAreaProps {
  mode: EditorMode;
  content: string;
  loadId: number;
  onChange: (next: string) => void;
}

/**
 * 본문 편집 영역.
 * - WYSIWYG 모드: Milkdown (편집 → markdown 직렬화).
 * - Source 모드: CodeMirror 6 raw markdown 에디터(문법 하이라이트).
 * 두 모드는 content(doc.content)를 단일 진실원본으로 공유한다.
 */
export default function EditorArea({ mode, content, loadId, onChange }: EditorAreaProps) {
  return (
    <main className="editorpane">
      {mode === "wysiwyg" ? (
        <div className="editor__wysiwyg">
          <MilkdownEditor key={loadId} content={content} onChange={onChange} />
        </div>
      ) : (
        <SourceEditor content={content} onChange={onChange} />
      )}
    </main>
  );
}
