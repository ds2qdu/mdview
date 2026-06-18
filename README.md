# mdview

크로스플랫폼(Windows · macOS) **마크다운 노트패드**.
`.md` 파일을 구조에 맞게 렌더링(Render 모드)하고, 편집하면 자동으로 markdown으로 저장합니다. Render ↔ Source(raw markdown) 모드 전환을 지원하며, Source 모드에서는 선택적으로 Vim 키바인딩을 켤 수 있습니다.

## 기술 스택

- **Tauri v2** — 데스크톱 셸
- **React 19 + TypeScript + Vite** — 프론트엔드
- **Milkdown** — Render 모드(WYSIWYG) 마크다운 에디터
- **CodeMirror 6** — raw 소스 모드 (문법 하이라이트)
- **@replit/codemirror-vim** — Source 모드 Vim 키바인딩(`:w`/`:write`로 저장)

## 이미지 (Render 모드)

- **URL 이미지** — 표준 마크다운 `![설명](https://example.com/img.png)`을 그대로 렌더링합니다.
- **첨부 이미지** — Obsidian식 `![[image.png]]`는 **현재 문서와 같은 폴더의 `attachments/` 폴더**에서 읽어 표시합니다(`<문서폴더>/attachments/image.png`). 파일을 저장한 뒤에 동작하며, 원본 `![[image.png]]` 표기는 저장 시 그대로 보존됩니다.

> 원격 URL 이미지를 허용하기 위해 보안 정책(CSP)에서 원격 이미지 로드를 켜 둔 상태입니다. 노트를 열 때 원격 이미지가 자동으로 요청될 수 있다는 점에 유의하세요.

## 설정 & 환경설정 저장

툴바의 **⚙️ 설정** 버튼(또는 `Ctrl/Cmd+,`)으로 설정 창을 열어 **테마(밝게/어둡게)** 와 **Source 모드 Vim 사용 여부**를 고릅니다. 변경하면 곧바로 적용되고 **실행 파일과 같은 폴더의 `mdview.config.json`**(JSON)에 저장되어 다음 실행 때 복원됩니다. 보호된 설치 경로 등으로 파일 쓰기가 불가능하면 브라우저 `localStorage`로 자동 폴백합니다.

---

## 사전 준비 (Prerequisites)

| 도구 | 버전/비고 |
|---|---|
| [Node.js](https://nodejs.org) | 20 LTS 이상 (Vite 7 요구) |
| [Rust](https://rustup.rs) | stable (rustup 설치 권장) |
| **macOS** | Xcode Command Line Tools (`xcode-select --install`) |
| **Windows** | [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) + [WebView2 런타임](https://developer.microsoft.com/microsoft-edge/webview2/) (Win10/11 기본 포함) |

> Tauri 환경이 올바른지 확인: `npm run tauri info`

## 설치

```bash
npm install
```

## 개발 모드 (Dev)

앱 창을 띄우고 변경 사항을 실시간 반영(HMR)합니다.

```bash
npm run tauri dev
```

프론트엔드만 따로 띄우려면(브라우저, 데스크톱 셸 없이):

```bash
npm run dev          # http://localhost:1420
```

## 빌드 (Build)

### 1) 프론트엔드 타입체크 + 번들 (빠른 검증)

```bash
npm run build        # tsc + vite build → dist/
```

### 2) 프로덕션 데스크톱 빌드 (설치 파일 생성)

```bash
npm run tauri build
```

빌드 산출물 위치:

**macOS**
```
src-tauri/target/release/bundle/macos/mdview.app
src-tauri/target/release/bundle/dmg/mdview_<version>_<arch>.dmg
```

**Windows**
```
src-tauri/target/release/bundle/msi/mdview_<version>_<arch>_<lang>.msi
src-tauri/target/release/bundle/nsis/mdview_<version>_<arch>-setup.exe
```

> 코드 서명/공증(notarization)을 설정하지 않으면 서명되지 않은 산출물이 생성됩니다(로컬 테스트용으로는 정상).

## 플랫폼별 빌드 전략

| 대상 | 방법 |
|---|---|
| **macOS** | 로컬 Mac에서 `npm run tauri build` |
| **Windows** | Windows 머신에서 빌드하거나 **GitHub Actions CI**로 빌드 (macOS에서 Windows 설치 파일 크로스컴파일은 비현실적) |

## 프로젝트 구조

```
mdview/
├── index.html              # Vite 진입점
├── src/                    # React 프론트엔드
│   ├── App.tsx
│   ├── components/         # Toolbar · EditorArea · StatusBar · SourceEditor · MilkdownEditor
│   ├── hooks/              # useSettings(테마·Vim) · useDocument · useRecentFiles
│   └── types.ts
├── src-tauri/              # Rust 백엔드 (Tauri)
│   ├── Cargo.toml
│   ├── tauri.conf.json     # 윈도우/번들 설정
│   ├── capabilities/       # 권한 설정
│   └── src/
└── dist/                   # 프론트엔드 빌드 출력 (git 무시)
```
