// 첫 실행 시 보여줄 샘플 문서. markdown 렌더링(헤딩/리스트/표/코드/인용/체크리스트)을 한눈에 확인.
// "새 파일"을 누르면 비워진다.
export const WELCOME_MD = `# mdview에 오신 것을 환영합니다

**mdview**는 마크다운을 *보이는 그대로* 편집하는 노트패드입니다.

## 주요 기능

- Render 모드 — 지금 보고 있는 이 화면(보이는 그대로 편집)
- Source 모드 — 오른쪽 위 토글로 원본 markdown 보기
- 파일 열기 / 저장 — \`Ctrl/Cmd + O\` / \`S\`

## markdown 예시

> 인용문은 이렇게 표시됩니다.

인라인 코드: \`const greeting = "hello";\`

\`\`\`js
function hello() {
  console.log("Hello, mdview!");
}
\`\`\`

| 항목 | 상태 |
| --- | --- |
| 렌더링 | 완료 |
| 편집 | 다음 단계 |

- [x] 마크다운 읽고 렌더링
- [ ] Render 모드에서 직접 편집

자세히: [Tauri 문서](https://tauri.app)
`;
