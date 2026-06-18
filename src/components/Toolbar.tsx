import type { EditorMode } from "../types";
import RecentMenu from "./RecentMenu";

interface ToolbarProps {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  onOpenSettings: () => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  recentFiles: string[];
  onOpenRecent: (path: string) => void;
  onClearRecent: () => void;
}

const gearIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export default function Toolbar({
  mode,
  onModeChange,
  onOpenSettings,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  recentFiles,
  onOpenRecent,
  onClearRecent,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <span className="toolbar__brand">mdview</span>

      <div className="toolbar__group">
        <button className="btn" type="button" onClick={onNew} title="새 파일 (Ctrl/Cmd+N)">
          새로
        </button>
        <button className="btn" type="button" onClick={onOpen} title="열기 (Ctrl/Cmd+O)">
          열기
        </button>
        <RecentMenu files={recentFiles} onOpen={onOpenRecent} onClear={onClearRecent} />
        <button className="btn" type="button" onClick={onSave} title="저장 (Ctrl/Cmd+S)">
          저장
        </button>
        <button
          className="btn"
          type="button"
          onClick={onSaveAs}
          title="다른 이름으로 저장 (Ctrl/Cmd+Shift+S)"
        >
          다른 이름
        </button>
      </div>

      <div className="toolbar__group toolbar__group--right">
        <div className="seg" role="group" aria-label="편집 모드" title="모드 전환 (Ctrl/Cmd+E)">
          <button
            type="button"
            className={`seg__btn${mode === "render" ? " seg__btn--active" : ""}`}
            onClick={() => onModeChange("render")}
          >
            Render
          </button>
          <button
            type="button"
            className={`seg__btn${mode === "source" ? " seg__btn--active" : ""}`}
            onClick={() => onModeChange("source")}
          >
            Source
          </button>
        </div>

        <button
          type="button"
          className="btn btn--icon"
          onClick={onOpenSettings}
          title="설정 (Ctrl/Cmd+,)"
          aria-label="설정"
        >
          {gearIcon}
        </button>
      </div>
    </header>
  );
}
