import type { EditorMode } from "../types";

interface StatusBarProps {
  mode: EditorMode;
  fileName: string | null;
  dirty: boolean;
  charCount: number;
}

/**
 * 하단 상태바. 파일명/수정됨(*)/글자수/모드 표시.
 */
export default function StatusBar({ mode, fileName, dirty, charCount }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span className="statusbar__item statusbar__file">
        {fileName ?? "제목 없음"}
        {dirty ? " *" : ""}
      </span>
      <span className="statusbar__spacer" />
      <span className="statusbar__item">{charCount}자</span>
      <span className="statusbar__divider" />
      <span className="statusbar__item">{mode === "render" ? "Render" : "Source"}</span>
    </footer>
  );
}
