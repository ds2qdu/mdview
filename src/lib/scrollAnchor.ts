// Render(Milkdown)↔Source(CodeMirror) 모드 전환 시 "보던 위치"를 유지하기 위한 스크롤 앵커.
//
// 같은 doc.content라도 두 엔진은 높이 분포가 크게 달라(비례식만으론 긴 문서에서 어긋남) 제목을
// 기준으로 맞춘다. 두 모드 모두 같은 문서에서 파생되므로 N번째 제목 = N번째 제목(순서 매칭).
// 제목이 없거나 첫 제목 위를 보고 있으면 문서 전체 비례식으로 폴백한다.
//
// 앵커는 "어느 엔진"인지 모르는 중립 표현(headingIndex/offsetFraction/docFraction)이라, 떠나는
// 에디터가 캡처하고 들어오는 에디터가 그대로 적용한다.

export interface ScrollAnchor {
  /** 뷰포트 top 이하의 마지막 제목 index(문서 순서). -1이면 첫 제목보다 위 → 비례식 사용. */
  headingIndex: number;
  /** 앵커 제목 구간 내 위치 비율 [0,1] (엔진 간 px 차이에 무관하도록 비율로 저장). */
  offsetFraction: number;
  /** 문서 전체 스크롤 비율 [0,1] — 제목 앵커가 안 맞을 때의 폴백. */
  docFraction: number;
  /** 캡처 시점의 제목 개수 — 들어오는 에디터와 다르면(개수 불일치) 비례식 폴백. */
  headingCount: number;
  /** 캡처 시점의 doc.loadId — 복원 직전 현재 값과 같을 때만 적용(파일 열기 race 방지). */
  loadId: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 현재 보이는 에디터에서 중립 스크롤 앵커를 캡처한다.
 * `tops` = 각 제목의 콘텐츠 좌표 y(px), scrollTop과 같은 좌표계로(문서 순서).
 */
export function captureFromTops(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  tops: number[],
  loadId: number,
): ScrollAnchor {
  const denom = Math.max(1, scrollHeight - clientHeight);
  const docFraction = scrollTop <= 0 ? 0 : clamp(scrollTop / denom, 0, 1);

  // 뷰포트 top(=scrollTop) 이하의 마지막 제목.
  let headingIndex = -1;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= scrollTop + 1) headingIndex = i;
    else break;
  }

  let offsetFraction = 0;
  if (headingIndex >= 0) {
    const next = headingIndex + 1 < tops.length ? tops[headingIndex + 1] : scrollHeight;
    const span = Math.max(1, next - tops[headingIndex]);
    offsetFraction = clamp((scrollTop - tops[headingIndex]) / span, 0, 1);
  }
  return { headingIndex, offsetFraction, docFraction, headingCount: tops.length, loadId };
}

/**
 * 들어오는 에디터의 제목 콘텐츠 좌표 `tops`로부터 목표 scrollTop을 계산한다.
 * 제목이 없거나/개수 불일치/범위 밖이면 문서 전체 비례식으로 폴백한다.
 * (div.scrollTop이 getBoundingClientRect 기반 tops와 정확히 일치하는 Render 측에서 사용.)
 */
export function applyToTops(
  a: ScrollAnchor,
  tops: number[],
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  const useHeading =
    a.headingIndex >= 0 && a.headingIndex < tops.length && tops.length === a.headingCount;
  let target: number;
  if (!useHeading) {
    target = a.docFraction * max;
  } else {
    const i = a.headingIndex;
    const next = i + 1 < tops.length ? tops[i + 1] : scrollHeight;
    const span = Math.max(1, next - tops[i]);
    target = tops[i] + a.offsetFraction * span;
  }
  if (!Number.isFinite(target)) return 0;
  return clamp(target, 0, max);
}

/** 앵커가 들어오는 에디터의 제목들로 '제목 앵커'를 쓸 수 있는지(아니면 비례식 폴백). */
export function anchorUsesHeading(a: ScrollAnchor, headingCount: number): boolean {
  return a.headingIndex >= 0 && a.headingIndex < headingCount && headingCount === a.headingCount;
}
