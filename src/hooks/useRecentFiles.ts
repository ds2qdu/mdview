import { useCallback, useState } from "react";

const STORAGE_KEY = "mdview-recent";
const MAX_RECENT = 8;

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

function persist(files: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch {
    // ignore quota/serialization errors
  }
}

/**
 * 최근 연/저장한 파일 경로 목록(localStorage 영속, 최대 8개).
 */
export function useRecentFiles() {
  const [files, setFiles] = useState<string[]>(read);

  const add = useCallback((path: string) => {
    setFiles((prev) => {
      const next = [path, ...prev.filter((p) => p !== path)].slice(0, MAX_RECENT);
      persist(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setFiles([]);
    persist([]);
  }, []);

  return { files, add, clear };
}
