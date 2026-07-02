import { useCallback, useRef, useState } from "react";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { WELCOME_MD } from "../lib/welcome";

const MD_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
  { name: "All Files", extensions: ["*"] },
];

/** Rust `read_file` 반환 — 본문 + 수정 시각(epoch ms, 미지원이면 null). */
interface FileData {
  content: string;
  mtime: number | null;
}

export interface UseDocument {
  /** 현재 파일의 절대 경로. 저장된 적 없으면 null. */
  filePath: string | null;
  /** 본문(markdown 문자열). 단일 진실원본. */
  content: string;
  /** 마지막 저장 이후 변경 여부. */
  dirty: boolean;
  /** 외부 로드(열기/새로) 때마다 증가 — Render(WYSIWYG) 에디터 리마운트 키. */
  loadId: number;
  /** 사용자 편집으로 본문 갱신(= dirty). */
  setContent: (next: string) => void;
  newFile: () => Promise<void>;
  openFile: () => Promise<void>;
  /** 주어진 경로의 파일을 연다(최근 파일/드롭 등). */
  openPath: (path: string) => Promise<void>;
  saveFile: () => Promise<boolean>;
  saveFileAs: () => Promise<boolean>;
  /** 창 포커스 시 호출 — 외부 변경을 감지해 리로드(clean)하거나 확인(dirty)한다. */
  checkExternalChange: () => Promise<void>;
}

export function useDocument(): UseDocument {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContentState] = useState(WELCOME_MD);
  const [dirty, setDirty] = useState(false);
  const [loadId, setLoadId] = useState(0);

  // 디스크와 "동기화된" 것으로 간주하는 mtime(epoch ms). 외부 변경 감지·덮어쓰기 가드의 기준값.
  const loadedMtimeRef = useRef<number | null>(null);
  // 외부 변경 확인(다이얼로그 포함)의 재진입 방지 — 포커스 이벤트가 몰릴 때 중복 프롬프트 방지.
  const checkingRef = useRef(false);

  const setContent = useCallback((next: string) => {
    setContentState(next);
    setDirty(true);
  }, []);

  // 파일 열기/새로 만들기처럼 프로그램이 본문을 교체할 때(= not dirty). mtime 기준값도 함께 갱신.
  const load = useCallback((next: string, path: string | null, mtime: number | null) => {
    setContentState(next);
    setFilePath(path);
    setDirty(false);
    setLoadId((n) => n + 1);
    loadedMtimeRef.current = mtime;
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
        const data = await invoke<FileData>("read_file", { path });
        load(data.content, path, data.mtime);
      } catch (e) {
        await message(`파일을 열 수 없습니다:\n${e}`, { title: "열기 실패", kind: "error" });
      }
    },
    [load],
  );

  const newFile = useCallback(async () => {
    if (await confirmDiscard()) load("", null, null);
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
        // 현재 파일을 저장하는데 열었을 때보다 디스크가 바뀌었으면 덮어쓰기 확인.
        // (Save As의 새 경로는 네이티브 저장 다이얼로그가 덮어쓰기를 이미 확인하므로 제외.)
        if (path === filePath && loadedMtimeRef.current != null) {
          const disk = await invoke<number | null>("file_mtime", { path });
          if (disk != null && disk !== loadedMtimeRef.current) {
            const overwrite = await ask(
              "저장하려는 파일이 외부에서 변경되었습니다.\n지금 저장하면 그 변경 사항을 덮어씁니다. 계속할까요?",
              { title: "덮어쓰기 확인", kind: "warning" },
            );
            if (!overwrite) return false;
          }
        }
        const mtime = await invoke<number | null>("write_file", { path, contents: content });
        setFilePath(path);
        setDirty(false);
        loadedMtimeRef.current = mtime;
        return true;
      } catch (e) {
        await message(`파일을 저장할 수 없습니다:\n${e}`, { title: "저장 실패", kind: "error" });
        return false;
      }
    },
    [content, filePath],
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

  // 창 포커스 시 외부 변경 감지. clean이면 조용히 리로드, dirty면 확인 후 결정.
  const checkExternalChange = useCallback(async () => {
    if (checkingRef.current) return; // 중복 확인/프롬프트 방지
    if (!filePath || loadedMtimeRef.current == null) return; // 새 문서/기준값 없음 → 스킵
    checkingRef.current = true;
    try {
      let disk: number | null;
      try {
        disk = await invoke<number | null>("file_mtime", { path: filePath });
      } catch {
        return; // 확인 실패 → 조용히 스킵
      }
      if (disk == null || disk === loadedMtimeRef.current) return; // 삭제/접근불가/변경없음
      if (!dirty) {
        await loadFromPath(filePath); // 편집분 없음 → 자동 리로드(조용히)
      } else {
        const reload = await ask(
          "파일이 외부에서 변경되었습니다.\n디스크의 내용으로 다시 불러올까요? (현재 편집 중인 변경 사항은 사라집니다)",
          { title: "외부 변경 감지", kind: "warning" },
        );
        if (reload) await loadFromPath(filePath);
        else loadedMtimeRef.current = disk; // 내 것 유지 → 이 버전은 확인함(재프롬프트 방지)
      }
    } finally {
      checkingRef.current = false;
    }
  }, [filePath, dirty, loadFromPath]);

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
    checkExternalChange,
  };
}
