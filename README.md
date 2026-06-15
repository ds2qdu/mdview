# mdview

크로스플랫폼(Windows · macOS) **마크다운 노트패드**.
`.md` 파일을 구조에 맞게 WYSIWYG로 렌더링하고, 편집하면 자동으로 markdown으로 저장합니다. WYSIWYG ↔ raw markdown 모드 전환을 지원합니다.

## 기술 스택

- **Tauri v2** — 데스크톱 셸
- **React 19 + TypeScript + Vite** — 프론트엔드
- **Milkdown** — WYSIWYG 마크다운 에디터 (예정)
- **CodeMirror 6** — raw 소스 모드 (예정)

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
│   ├── components/         # Toolbar · EditorArea · StatusBar
│   ├── hooks/useTheme.ts
│   └── types.ts
├── src-tauri/              # Rust 백엔드 (Tauri)
│   ├── Cargo.toml
│   ├── tauri.conf.json     # 윈도우/번들 설정
│   ├── capabilities/       # 권한 설정
│   └── src/
└── dist/                   # 프론트엔드 빌드 출력 (git 무시)
```
