// 한글 IME 이중입력 진단용 인메모리 이벤트 버퍼 + 구독.
// 패키지(exe) 앱은 DevTools 콘솔이 없으므로, 이벤트를 화면 오버레이(components/ImeDebugOverlay)로 보여
// 사용자가 캡처해 공유할 수 있게 한다. (원인 파악 후 제거 예정.)

export interface ImeLogEntry {
  type: string;
  key?: string;
  code?: string;
  comp?: boolean;
  kc?: number;
  data?: string | null;
  inputType?: string;
  mode?: string;
  unti?: boolean;
}

const MAX = 40;
let entries: ImeLogEntry[] = [];
let enabled = false;
const listeners = new Set<() => void>();

/** 설정의 디버그 모드 on/off. off로 바꾸면 쌓인 로그도 비운다. */
export function setImeDebugEnabled(v: boolean): void {
  if (enabled === v) return;
  enabled = v;
  if (!v) entries = [];
  listeners.forEach((fn) => fn());
}

export function isImeDebugEnabled(): boolean {
  return enabled;
}

export function pushImeLog(e: ImeLogEntry): void {
  if (!enabled) return;
  entries = [...entries, e].slice(-MAX);
  listeners.forEach((fn) => fn());
}

export function clearImeLog(): void {
  entries = [];
  listeners.forEach((fn) => fn());
}

export function getImeLog(): ImeLogEntry[] {
  return entries;
}

export function subscribeImeLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
