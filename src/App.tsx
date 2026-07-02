import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import Toolbar from "./components/Toolbar";
import EditorArea from "./components/EditorArea";
import StatusBar from "./components/StatusBar";
import SettingsDialog from "./components/SettingsDialog";
import ImeDebugOverlay from "./components/ImeDebugOverlay";
import { useSettings } from "./hooks/useSettings";
import { useDocument } from "./hooks/useDocument";
import { useRecentFiles } from "./hooks/useRecentFiles";
import { isTauri } from "./lib/tauri";
import { setImeDebugEnabled } from "./lib/imeDebug";
import type { ScrollAnchor } from "./lib/scrollAnchor";
import type { EditorMode } from "./types";
import "./App.css";

function baseName(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** 파일 경로에서 폴더 부분만. 경로 없으면 null(=`![[name]]` 해석 불가). */
function dirName(path: string | null): string | null {
  if (!path) return null;
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i > 0 ? path.slice(0, i) : null;
}

/** markdown으로 취급할 확장자(Rust `MD_EXTS` · 열기 다이얼로그 필터와 일치). */
const MD_EXTS = ["md", "markdown", "mdown", "mkd"];
function isMarkdownPath(path: string): boolean {
  const dot = path.lastIndexOf(".");
  return dot >= 0 && MD_EXTS.includes(path.slice(dot + 1).toLowerCase());
}

function App() {
  const { theme, vim, debug, setTheme, setVim, setDebug } = useSettings();
  const [mode, setMode] = useState<EditorMode>("render");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const doc = useDocument();
  const recent = useRecentFiles();

  // 전역 리스너가 항상 최신 doc 액션/상태를 보도록 ref로 유지.
  const docRef = useRef(doc);
  docRef.current = doc;

  // 모드 전환 시 스크롤 위치 유지(제목 앵커). 전환 시점에 "떠나는" 에디터가 captureCurrentRef로 앵커를
  // 동기 캡처 → setMode → "들어오는" 에디터가 pendingAnchorRef를 1회 소비해 복원한다.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const pendingAnchorRef = useRef<ScrollAnchor | null>(null);
  const captureCurrentRef = useRef<(() => ScrollAnchor | null) | null>(null);

  const switchMode = useCallback((next: EditorMode) => {
    pendingAnchorRef.current = captureCurrentRef.current?.() ?? null;
    setMode(next);
  }, []);

  // 파일 열기/새로(loadId 변경) 시엔 stale 앵커를 버린다(새 문서는 맨 위에서 시작).
  useEffect(() => {
    pendingAnchorRef.current = null;
  }, [doc.loadId]);

  // 디버그 모드(IME 진단 오버레이) 설정을 진단 모듈에 반영.
  useEffect(() => {
    setImeDebugEnabled(debug);
  }, [debug]);

  // CLI 인자로 전달된 파일(`mdview <file.md>`)을 시작 시 한 번 열어 바로 편집한다.
  const startupDone = useRef(false);
  useEffect(() => {
    if (!isTauri() || startupDone.current) return;
    startupDone.current = true;
    void (async () => {
      try {
        const path = await invoke<string | null>("startup_file");
        if (path) await docRef.current.openPath(path);
      } catch {
        // 인자 없음/열기 실패 → 환영 문서 유지.
      }
    })();
  }, []);

  // 파일을 열거나 저장(경로 확정)하면 최근 목록에 추가.
  // recent.add는 stable(useCallback)이므로 filePath 변화에만 반응한다.
  const addRecent = recent.add;
  useEffect(() => {
    if (doc.filePath) addRecent(doc.filePath);
  }, [doc.filePath, addRecent]);

  // 윈도우/문서 제목: "• 파일명 — mdview" (• = 미저장).
  useEffect(() => {
    const name = baseName(doc.filePath) ?? "제목 없음";
    const title = `${doc.dirty ? "• " : ""}${name} — mdview`;
    document.title = title;
    if (isTauri()) void getCurrentWindow().setTitle(title).catch(() => {});
  }, [doc.filePath, doc.dirty]);

  // 키보드 단축키. E(모드 전환)는 항상 프론트 처리.
  // N/O/S는 Tauri에서는 네이티브 메뉴 가속키가 담당(중복 방지) → 브라우저에서만 처리.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "e") {
        e.preventDefault();
        switchMode(modeRef.current === "render" ? "source" : "render");
        return;
      }
      if (key === ",") {
        e.preventDefault();
        setSettingsOpen((o) => !o);
        return;
      }
      if (isTauri()) return;
      const d = docRef.current;
      if (key === "n") {
        e.preventDefault();
        void d.newFile();
      } else if (key === "o") {
        e.preventDefault();
        void d.openFile();
      } else if (key === "s") {
        e.preventDefault();
        if (e.shiftKey) void d.saveFileAs();
        else void d.saveFile();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 네이티브 "파일" 메뉴 이벤트 → 문서 액션 (Tauri 런타임에서만).
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    listen<string>("menu", (event) => {
      const d = docRef.current;
      if (event.payload === "new") void d.newFile();
      else if (event.payload === "open") void d.openFile();
      else if (event.payload === "save") void d.saveFile();
      else if (event.payload === "save_as") void d.saveFileAs();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // 파일 드래그&드롭으로 열기 (Tauri 네이티브 drag-drop — 웹뷰 HTML5 drop은 파일 경로를 주지 않음).
  // markdown 파일을 드롭하면 openPath로 연다(미저장 변경 확인은 openPath가 처리). 여러 개면 첫 markdown만.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === "enter") {
          setDragOver(p.paths.some(isMarkdownPath)); // markdown이 하나라도 있을 때만 하이라이트
        } else if (p.type === "leave") {
          setDragOver(false);
        } else if (p.type === "drop") {
          setDragOver(false);
          const md = p.paths.find(isMarkdownPath);
          if (md) void docRef.current.openPath(md);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, []);

  // 창이 다시 활성화되면 외부 변경을 확인한다(다른 프로그램/동기화로 파일이 바뀐 경우).
  // clean이면 자동 리로드, dirty면 확인. (Tauri 런타임에서만.)
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) void docRef.current.checkExternalChange();
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, []);

  // 창 닫기 시 저장되지 않은 변경 확인 (Tauri 런타임에서만).
  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    const unlistenPromise = win.onCloseRequested(async (event) => {
      event.preventDefault();
      if (docRef.current.dirty) {
        const proceed = await ask("저장하지 않은 변경 사항이 있습니다. 종료하시겠습니까?", {
          title: "mdview 종료",
          kind: "warning",
        });
        if (!proceed) return;
      }
      await win.destroy();
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <div className="app">
      <Toolbar
        mode={mode}
        onModeChange={switchMode}
        onOpenSettings={() => setSettingsOpen(true)}
        onNew={() => void doc.newFile()}
        onOpen={() => void doc.openFile()}
        onSave={() => void doc.saveFile()}
        onSaveAs={() => void doc.saveFileAs()}
        recentFiles={recent.files}
        onOpenRecent={(p) => void doc.openPath(p)}
        onClearRecent={recent.clear}
      />
      <EditorArea
        mode={mode}
        content={doc.content}
        loadId={doc.loadId}
        onChange={doc.setContent}
        vimEnabled={vim}
        onSave={() => void doc.saveFile()}
        docDir={dirName(doc.filePath)}
        pendingAnchorRef={pendingAnchorRef}
        captureCurrentRef={captureCurrentRef}
      />
      <StatusBar
        mode={mode}
        fileName={baseName(doc.filePath)}
        dirty={doc.dirty}
        charCount={doc.content.length}
        vim={vim}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        vim={vim}
        debug={debug}
        onThemeChange={setTheme}
        onVimChange={setVim}
        onDebugChange={setDebug}
      />
      <ImeDebugOverlay enabled={debug} />
      {dragOver && (
        <div className="dropzone" aria-hidden="true">
          <div className="dropzone__box">
            <div className="dropzone__icon">📄</div>
            <div className="dropzone__text">여기에 놓아 markdown 파일 열기</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
