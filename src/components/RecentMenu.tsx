import { useEffect, useRef, useState } from "react";

interface RecentMenuProps {
  files: string[];
  onOpen: (path: string) => void;
  onClear: () => void;
}

function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

/**
 * 최근 파일 드롭다운. 바깥 클릭 시 닫힘.
 */
export default function RecentMenu({ files, onOpen, onClear }: RecentMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="recent" ref={ref}>
      <button
        className="btn"
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={files.length === 0}
        title="최근 파일"
      >
        최근 ▾
      </button>
      {open && files.length > 0 && (
        <div className="recent__menu" role="menu">
          {files.map((p) => (
            <button
              key={p}
              className="recent__item"
              type="button"
              role="menuitem"
              title={p}
              onClick={() => {
                setOpen(false);
                onOpen(p);
              }}
            >
              {baseName(p)}
            </button>
          ))}
          <div className="recent__sep" />
          <button
            className="recent__item recent__clear"
            type="button"
            onClick={() => {
              setOpen(false);
              onClear();
            }}
          >
            목록 지우기
          </button>
        </div>
      )}
    </div>
  );
}
