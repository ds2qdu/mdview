import { useCallback, useState } from "react";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { WELCOME_MD } from "../lib/welcome";

const MD_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
  { name: "All Files", extensions: ["*"] },
];

export interface UseDocument {
  /** 현재 파일의 절대 경로. 저장된 적 없으면 null. */
  filePath: string | null;
  /** 본문(markdown 문자열). 단일 진실원본. */
  content: string;
  /** 마지막 저장 이후 변경 여부. */
  dirty: boolean;
  /** 외부 로드(열기/새로) 때마다 증가 — WYSIWYG 에디터 리마운트 키. */
  loadId: number;
  /** 사용자 편집으로 본문 갱신(= dirty). */
  setContent: (next: string) => void;
  newFile: () => Promise<void>;
  openFile: () => Promise<void>;
  /** 주어진 경로의 파일을 연다(최근 파일/드롭 등). */
  openPath: (path: string) => Promise<void>;
  saveFile: () => Promise<boolean>;
  saveFileAs: () => Promise<boolean>;
}

export function useDocument(): UseDocument {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContentState] = useState(WELCOME_MD);
  const [dirty, setDirty] = useState(false);
  const [loadId, setLoadId] = useState(0);

  const setContent = useCallback((next: string) => {
    setContentState(next);
    setDirty(true);
  }, []);

  // 파일 열기/새로 만들기처럼 프로그램이 본문을 교체할 때(= not dirty).
  const load = useCallback((next: string, path: string | null) => {
    setContentState(next);
    setFilePath(path);
    setDirty(false);
    setLoadId((n) => n + 1);
  }, []);

  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    return ask("저장하지 않은 변경 사항이 있습니다. 계속하시겠습니까?", {
      title: "변경 사항 폐기",
      kind: "warning",
    });
  }, [dirty]);

  // 경로에서 읽어 본문으로 적재(확인 절차 없음 — 호출자가 confirmDiscard 처리).
  const loadFromPath = useCallback(
    async (path: string) => {
      try {
        const text = await invoke<string>("read_file", { path });
        load(text, path);
      } catch (e) {
        await message(`파일을 열 수 없습니다:\n${e}`, { title: "열기 실패", kind: "error" });
      }
    },
    [load],
  );

  const newFile = useCallback(async () => {
    if (await confirmDiscard()) load("", null);
  }, [confirmDiscard, load]);

  const openFile = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    const selected = await open({ multiple: false, directory: false, filters: MD_FILTERS });
    if (typeof selected !== "string") return; // 취소
    await loadFromPath(selected);
  }, [confirmDiscard, loadFromPath]);

  const openPath = useCallback(
    async (path: string) => {
      if (!(await confirmDiscard())) return;
      await loadFromPath(path);
    },
    [confirmDiscard, loadFromPath],
  );

  const writeTo = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        await invoke("write_file", { path, contents: content });
        setFilePath(path);
        setDirty(false);
        return true;
      } catch (e) {
        await message(`파일을 저장할 수 없습니다:\n${e}`, { title: "저장 실패", kind: "error" });
        return false;
      }
    },
    [content],
  );

  const saveFileAs = useCallback(async (): Promise<boolean> => {
    const path = await save({ filters: MD_FILTERS, defaultPath: filePath ?? "untitled.md" });
    if (typeof path !== "string") return false; // 취소
    return writeTo(path);
  }, [filePath, writeTo]);

  const saveFile = useCallback(async (): Promise<boolean> => {
    if (filePath) return writeTo(filePath);
    return saveFileAs();
  }, [filePath, writeTo, saveFileAs]);

  return {
    filePath,
    content,
    dirty,
    loadId,
    setContent,
    newFile,
    openFile,
    openPath,
    saveFile,
    saveFileAs,
  };
}
