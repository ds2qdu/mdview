import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import Toolbar from "./components/Toolbar";
import EditorArea from "./components/EditorArea";
import StatusBar from "./components/StatusBar";
import { useTheme } from "./hooks/useTheme";
import { useDocument } from "./hooks/useDocument";
import { useRecentFiles } from "./hooks/useRecentFiles";
import { isTauri } from "./lib/tauri";
import type { EditorMode } from "./types";
import "./App.css";

function baseName(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function App() {
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<EditorMode>("render");
  const doc = useDocument();
  const recent = useRecentFiles();

  // 전역 리스너가 항상 최신 doc 액션/상태를 보도록 ref로 유지.
  const docRef = useRef(doc);
  docRef.current = doc;

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
        setMode((m) => (m === "render" ? "source" : "render"));
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
        onModeChange={setMode}
        theme={theme}
        onToggleTheme={toggleTheme}
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
      />
      <StatusBar
        mode={mode}
        fileName={baseName(doc.filePath)}
        dirty={doc.dirty}
        charCount={doc.content.length}
      />
    </div>
  );
}

export default App;
