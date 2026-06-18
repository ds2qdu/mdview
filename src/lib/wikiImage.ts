/**
 * Obsidian식 이미지 임베드 `![[name.ext]]` 지원 헬퍼.
 *
 * 전략: Milkdown(commonmark)은 `![[ ]]`를 모르므로, **Milkdown 경계에서만** 표준 마크다운
 * 이미지 + 센티넬 URL로 바꿔 넣고(`![](mdview-wiki:name)`), 다시 받을 때 되돌린다.
 * 덕분에 `doc.content`(저장 파일 · Source 모드)에는 항상 원본 `![[name]]`가 남는다.
 * 이미지 노드의 실제 표시 src는 NodeView가 비동기로 attachments에서 읽어 data URL로 채운다
 * (노드 attrs.src는 센티넬 그대로 → 직렬화 시 `![[name]]`로 복원됨 → 라운드트립 무손실).
 */

/** 센티넬 URL 스킴. 일반 사용자 콘텐츠에는 등장하지 않는다. */
export const WIKI_SCHEME = "mdview-wiki:";

// `![[name]]` (한 줄 내, `]`/개행 미포함)
const WIKI_RE = /!\[\[([^\]\n]+)\]\]/g;
// `![alt](mdview-wiki:<encoded>)` — alt는 무시, 인코딩된 이름만 캡처
const SENTINEL_RE = /!\[[^\]]*\]\(mdview-wiki:([^)\s]+)\)/g;

/** 원본 마크다운(`![[name]]`) → Milkdown 입력용(표준 이미지 + 센티넬). */
export function wikiToSentinel(md: string): string {
  return md.replace(
    WIKI_RE,
    (_m, name: string) => `![](${WIKI_SCHEME}${encodeURIComponent(name.trim())})`,
  );
}

/** Milkdown 출력(센티넬) → 원본 마크다운(`![[name]]`)으로 복원. */
export function sentinelToWiki(md: string): string {
  return md.replace(SENTINEL_RE, (_m, enc: string) => {
    try {
      return `![[${decodeURIComponent(enc)}]]`;
    } catch {
      return `![[${enc}]]`;
    }
  });
}

/**
 * 센티넬 src에서 첨부 파일명만 안전하게 추출. 일반 URL이면 null.
 * 경로 구분자(`/`,`\`)·상위 참조(`..`)는 거부한다(경로 트래버설 방지 — attachments 폴더 밖 접근 차단).
 */
export function wikiNameFromSrc(src: string): string | null {
  if (!src.startsWith(WIKI_SCHEME)) return null;
  let name: string;
  try {
    name = decodeURIComponent(src.slice(WIKI_SCHEME.length));
  } catch {
    return null;
  }
  name = name.trim();
  if (!name || name.includes("..") || /[\\/]/.test(name)) return null;
  return name;
}
