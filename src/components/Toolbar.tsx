import type { EditorMode } from "../types";
import type { Theme } from "../hooks/useTheme";
import RecentMenu from "./RecentMenu";

interface ToolbarProps {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  theme: Theme;
  onToggleTheme: () => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  recentFiles: string[];
  onOpenRecent: (path: string) => void;
  onClearRecent: () => void;
}

const sunIcon = (
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
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const moonIcon = (
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
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export default function Toolbar({
  mode,
  onModeChange,
  theme,
  onToggleTheme,
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
            className={`seg__btn${mode === "wysiwyg" ? " seg__btn--active" : ""}`}
            onClick={() => onModeChange("wysiwyg")}
          >
            WYSIWYG
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
          onClick={onToggleTheme}
          title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
          aria-label="테마 전환"
        >
          {theme === "dark" ? sunIcon : moonIcon}
        </button>
      </div>
    </header>
  );
}
