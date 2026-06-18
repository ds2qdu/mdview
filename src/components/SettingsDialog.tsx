import { useEffect } from "react";
import type { Theme } from "../hooks/useSettings";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  vim: boolean;
  onThemeChange: (theme: Theme) => void;
  onVimChange: (vim: boolean) => void;
}

/**
 * 설정(옵션) 모달. 테마(밝게/어둡게)와 Source 모드 Vim 사용 여부를 고른다.
 * 변경은 즉시 상위 useSettings로 반영 → 설정 파일(`mdview.config.json`)에 자동 저장된다.
 * 닫기: 배경 클릭 · 닫기 버튼 · ESC.
 */
export default function SettingsDialog({
  open,
  onClose,
  theme,
  vim,
  onThemeChange,
  onVimChange,
}: SettingsDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal" role="presentation" onMouseDown={onClose}>
      <div
        className="modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label="설정"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 className="modal__title">설정</h2>
          <button className="btn btn--icon" type="button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="modal__body">
          <div className="field">
            <span className="field__label">테마</span>
            <div className="seg" role="group" aria-label="테마">
              <button
                type="button"
                className={`seg__btn${theme === "light" ? " seg__btn--active" : ""}`}
                onClick={() => onThemeChange("light")}
                aria-pressed={theme === "light"}
              >
                밝게
              </button>
              <button
                type="button"
                className={`seg__btn${theme === "dark" ? " seg__btn--active" : ""}`}
                onClick={() => onThemeChange("dark")}
                aria-pressed={theme === "dark"}
              >
                어둡게
              </button>
            </div>
          </div>

          <div className="field">
            <span className="field__label">
              Vim 키 사용
              <span className="field__hint">Source 모드에 적용됩니다.</span>
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={vim}
                onChange={(e) => onVimChange(e.target.checked)}
              />
              <span className="switch__track" aria-hidden="true">
                <span className="switch__thumb" />
              </span>
            </label>
          </div>

          <div className="field field--info">
            <span className="field__label">버전</span>
            <span className="field__value">v{__APP_VERSION__}</span>
          </div>

          <div className="field field--info">
            <span className="field__label">이메일</span>
            <a className="field__value field__value--link" href="mailto:ds2qdu@gmail.com">
              ds2qdu@gmail.com
            </a>
          </div>
        </div>

        <footer className="modal__footer">
          <span className="modal__hint">변경 사항은 자동으로 저장됩니다.</span>
          <button className="btn" type="button" onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>
  );
}
