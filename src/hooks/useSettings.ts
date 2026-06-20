import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";

export type Theme = "light" | "dark";

const THEME_KEY = "mdview-theme";
const VIM_KEY = "mdview-vim";
const DEBUG_KEY = "mdview-debug";

function initialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialVim(): boolean {
  return localStorage.getItem(VIM_KEY) === "1";
}

function initialDebug(): boolean {
  return localStorage.getItem(DEBUG_KEY) === "1";
}

export interface Settings {
  theme: Theme;
  vim: boolean;
  /** 디버그 모드(IME 진단 오버레이). 당분간 토글로 켜둘 수 있게 노출. */
  debug: boolean;
  setTheme: (theme: Theme) => void;
  setVim: (vim: boolean) => void;
  setDebug: (debug: boolean) => void;
}

/**
 * 앱 환경설정(테마 · Vim)을 관리·영속화한다.
 * - 즉시 반영: localStorage(깜빡임 방지 인라인 스크립트와 정합) + <html data-theme>.
 * - 영속 저장: Tauri에서는 실행 파일 옆 설정 파일(`mdview.config.json`)에도 기록한다.
 *   시작 시 그 파일을 읽어 복원하고, 하이드레이션 이후의 변경만 다시 파일로 저장한다
 *   (시작 시 localStorage 값으로 파일을 덮어쓰지 않도록 순서를 지킨다).
 * - 파일 쓰기 실패(예: 설치 경로 권한)·브라우저 환경에서는 localStorage가 폴백.
 */
export function useSettings(): Settings {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [vim, setVim] = useState<boolean>(initialVim);
  const [debug, setDebug] = useState<boolean>(initialDebug);
  const [hydrated, setHydrated] = useState(false);

  // data-theme/localStorage는 항상 즉시 반영(첫 페인트 깜빡임 방지 스크립트와 일관).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(VIM_KEY, vim ? "1" : "0");
  }, [vim]);

  useEffect(() => {
    localStorage.setItem(DEBUG_KEY, debug ? "1" : "0");
  }, [debug]);

  // 시작 시 실행 파일 옆 설정 파일을 읽어 복원(Tauri). 이후에만 파일 저장을 허용.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (isTauri()) {
        try {
          const raw = await invoke<string | null>("load_settings");
          if (!cancelled && raw) {
            const parsed = JSON.parse(raw) as Partial<{ theme: Theme; vim: boolean; debug: boolean }>;
            if (parsed.theme === "light" || parsed.theme === "dark") setTheme(parsed.theme);
            if (typeof parsed.vim === "boolean") setVim(parsed.vim);
            if (typeof parsed.debug === "boolean") setDebug(parsed.debug);
          }
        } catch {
          // 파일 없음/파싱 실패 → localStorage 값 유지.
        }
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 하이드레이션 이후 변경분을 실행 파일 옆 설정 파일에 기록(Tauri). 첫 실행이면 파일 생성.
  useEffect(() => {
    if (!hydrated || !isTauri()) return;
    const contents = JSON.stringify({ theme, vim, debug }, null, 2);
    void invoke("save_settings", { contents }).catch(() => {
      // 쓰기 실패(예: 보호된 설치 경로) → localStorage가 폴백.
    });
  }, [theme, vim, debug, hydrated]);

  // setTheme/setVim은 useState 디스패처(안정 참조)를 그대로 노출 — 변경 시 위 effect들이 영속화.
  return { theme, vim, debug, setTheme, setVim, setDebug };
}
