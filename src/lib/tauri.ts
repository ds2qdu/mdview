/**
 * Tauri 런타임 안에서 실행 중인지 여부.
 * Vite 브라우저 미리보기에서는 false → Tauri 전용 API 호출을 건너뛰는 데 사용.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
