import { useEffect, useState, useSyncExternalStore } from "react";
import { clearImeLog, getImeLog, subscribeImeLog, type ImeLogEntry } from "../lib/imeDebug";

// 한글 IME 이중입력 진단 오버레이(콘솔 없는 exe용). Source Vim Normal 모드에서 IME 키를 누를 때만
// 이벤트가 쌓여 자동으로 나타난다. 이 화면을 캡처해 공유하면 정확한 원인 파악 가능. (진단 끝나면 제거.)
function fmt(e: ImeLogEntry): string {
  const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
  let line = `${pad(e.type, 16)} key=${JSON.stringify(e.key ?? "")} code=${e.code ?? "-"} comp=${e.comp ? "T" : "F"} kc=${e.kc ?? "-"} mode=${e.mode ?? "-"} unti=${e.unti ? "T" : "F"}`;
  if (e.inputType) line += ` it=${e.inputType}`;
  if (e.data != null) line += ` data=${JSON.stringify(e.data)}`;
  return line;
}

export default function ImeDebugOverlay({ enabled }: { enabled: boolean }) {
  const entries = useSyncExternalStore(subscribeImeLog, getImeLog);
  const [hidden, setHidden] = useState(false);
  // 디버그 모드를 다시 켜면(설정) 닫아뒀던 오버레이도 다시 표시.
  useEffect(() => {
    if (enabled) setHidden(false);
  }, [enabled]);
  if (!enabled || hidden || entries.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: "45vh",
        overflowY: "auto",
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.9)",
        color: "#7CFC7C",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        lineHeight: 1.55,
        padding: "6px 10px 10px",
        borderTop: "1px solid #444",
        whiteSpace: "pre",
      }}
    >
      <div style={{ color: "#fff", marginBottom: 6, display: "flex", gap: 10, alignItems: "center" }}>
        <strong>IME 진단</strong>
        <span style={{ color: "#ffd479" }}>← 이 화면을 캡처해서 보내주세요</span>
        <button onClick={clearImeLog} style={btn}>
          지우기
        </button>
        <button onClick={() => setHidden(true)} style={btn}>
          닫기
        </button>
      </div>
      {entries.map((e, i) => (
        <div key={i}>{fmt(e)}</div>
      ))}
    </div>
  );
}

const btn: React.CSSProperties = {
  font: "inherit",
  color: "#fff",
  background: "#333",
  border: "1px solid #555",
  borderRadius: 4,
  padding: "1px 8px",
  cursor: "pointer",
};
