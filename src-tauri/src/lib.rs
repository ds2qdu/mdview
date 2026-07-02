use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::Emitter;

/// markdown으로 취급할 확장자.
const MD_EXTS: [&str; 4] = ["md", "markdown", "mdown", "mkd"];

/// 파일 메타데이터의 수정 시각을 epoch 기준 밀리초(f64)로. 미지원/오류면 None.
/// (JS 수 범위 내 정수 ms라 프론트에서 정확히 비교 가능.)
fn mtime_millis(meta: &fs::Metadata) -> Option<f64> {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
}

/// 파일 읽기 결과 — 본문과 함께 수정 시각(mtime)을 돌려준다.
/// 프론트가 mtime을 보관해 두었다가 외부 변경 감지·덮어쓰기 가드의 기준값으로 쓴다.
#[derive(serde::Serialize)]
struct FileData {
    content: String,
    mtime: Option<f64>,
}

/// 지정한 경로의 텍스트 파일을 읽어 본문+mtime으로 반환한다. 정규 파일만 허용한다
/// (디렉터리·장치 노드 등 거부 → `CON` 같은 경로에서 블로킹 방지).
/// mtime은 read 직전 stat 기준 — read 사이에 쓰기가 끼면 다음 감지에서 한 번 더 리로드될 뿐 놓치지 않는다.
#[tauri::command]
fn read_file(path: String) -> Result<FileData, String> {
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("정규 파일이 아닙니다.".to_string());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(FileData {
        content,
        mtime: mtime_millis(&meta),
    })
}

/// 문자열을 지정한 경로에 저장한다. 기존 대상이 정규 파일이 아니면 거부한다
/// (장치/디렉터리 덮어쓰기 방지). 새 파일 생성은 허용.
/// 저장 후의 mtime을 돌려줘 프론트가 기준값을 갱신한다(자기 저장을 외부 변경으로 오인하지 않도록).
#[tauri::command]
fn write_file(path: String, contents: String) -> Result<Option<f64>, String> {
    if let Ok(meta) = fs::metadata(&path) {
        if !meta.is_file() {
            return Err("정규 파일이 아닙니다.".to_string());
        }
    }
    fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(fs::metadata(&path).ok().and_then(|m| mtime_millis(&m)))
}

/// 경로의 현재 mtime(epoch ms)을 반환한다. 파일이 없거나(삭제 등) 정규 파일이 아니면 Ok(None).
/// 창 포커스 시 외부 변경 감지에 쓴다 — 본문을 읽지 않고 stat만 하므로 가볍다.
#[tauri::command]
fn file_mtime(path: String) -> Result<Option<f64>, String> {
    match fs::metadata(&path) {
        Ok(meta) if meta.is_file() => Ok(mtime_millis(&meta)),
        Ok(_) => Ok(None),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Windows 예약 장치명(CON/PRN/AUX/NUL/COM1-9/LPT1-9)인지 — 확장자는 무시하고 stem만 본다.
/// `CON.md` 같은 인자가 read_file을 멈추게 하는 것을 막는다.
#[cfg(windows)]
fn is_reserved_device_name(path: &Path) -> bool {
    let stem = match path.file_name().and_then(|n| n.to_str()) {
        Some(name) => name.split('.').next().unwrap_or("").to_ascii_uppercase(),
        None => return false,
    };
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}
#[cfg(not(windows))]
fn is_reserved_device_name(_path: &Path) -> bool {
    false
}

/// Windows에서 파일명 컴포넌트에 ':'가 있으면 NTFS 대체 데이터 스트림(ADS) 구문이다
/// (예: `secret.config:hidden.md`). 확장자 검사를 우회하므로 거부한다.
#[cfg(windows)]
fn has_ads_stream(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.contains(':'))
        .unwrap_or(false)
}
#[cfg(not(windows))]
fn has_ads_stream(_path: &Path) -> bool {
    false
}

/// 위치 인자(플래그 제외) 중 첫 경로를 고른다. `--` 다음 토큰은 무조건 경로로 취급한다
/// (`-leading.md` 처럼 하이픈으로 시작하는 파일명 지원).
fn first_path_arg(args: &[String]) -> Option<&String> {
    let mut it = args.iter().skip(1);
    while let Some(a) = it.next() {
        if a.as_str() == "--" {
            return it.next();
        }
        if !a.starts_with('-') {
            return Some(a);
        }
    }
    None
}

/// 첫 위치 인자를 markdown 확장자면 절대 경로 문자열로 돌려준다.
/// 인자 없음·비markdown·Windows 예약 장치명·ADS 경로면 None.
fn resolve_arg_path(args: &[String], cwd: &Path) -> Option<String> {
    let arg = first_path_arg(args)?;
    let path = PathBuf::from(arg);
    let is_md = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| MD_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false);
    if !is_md {
        return None;
    }
    if is_reserved_device_name(&path) || has_ads_stream(&path) {
        return None;
    }
    let abs = if path.is_absolute() {
        path
    } else {
        cwd.join(path)
    };
    Some(abs.to_string_lossy().into_owned())
}

/// 확장자로 이미지 MIME 추정. 지원 안 하면 None.
fn image_mime(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        _ => return None,
    })
}

/// 이미지 data URL 최대 크기(원본 바이트 기준). 과도한 base64 문자열/메모리 방지.
const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;

/// 주어진 경로의 이미지를 읽어 `data:<mime>;base64,...` 문자열로 반환한다.
/// Render 모드에서 `![[name]]`(attachments)의 표시 src로 사용한다(웹뷰가 임의 로컬 경로를
/// 직접 못 읽으므로 data URL로 인라인). 정규 파일/지원 형식/크기 가드.
#[tauri::command]
fn read_image_data_url(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let meta = fs::metadata(p).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("정규 파일이 아닙니다.".to_string());
    }
    let mime = image_mime(p).ok_or_else(|| "지원하지 않는 이미지 형식입니다.".to_string())?;
    if meta.len() > MAX_IMAGE_BYTES {
        return Err("이미지가 너무 큽니다.".to_string());
    }
    let bytes = fs::read(p).map_err(|e| e.to_string())?;
    Ok(format!("data:{};base64,{}", mime, STANDARD.encode(bytes)))
}

/// MIME → 파일 확장자. 붙여넣기 이미지 저장 시 확장자 결정에 쓴다. 지원 안 하면 None.
fn ext_for_mime(mime: &str) -> Option<&'static str> {
    Some(match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        "image/svg+xml" => "svg",
        "image/avif" => "avif",
        _ => return None,
    })
}

/// `data:<mime>;base64,<data>` 형태를 (mime, base64) 로 분해. base64가 아니거나 형식이 다르면 None.
fn parse_data_url(s: &str) -> Option<(&str, &str)> {
    let rest = s.strip_prefix("data:")?;
    let comma = rest.find(',')?;
    let meta = &rest[..comma]; // 예: "image/png;base64"
    if !meta.contains("base64") {
        return None;
    }
    let mime = meta.split(';').next()?; // "image/png"
    Some((mime, &rest[comma + 1..]))
}

/// `<dir>/<stem>.<ext>`가 이미 있으면 `<stem> 1.<ext>`, `<stem> 2.<ext>`… 로 충돌을 피한 경로를 만든다.
fn unique_image_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let mut candidate = dir.join(format!("{stem}.{ext}"));
    let mut i = 1;
    while candidate.exists() {
        candidate = dir.join(format!("{stem} {i}.{ext}"));
        i += 1;
    }
    candidate
}

/// 붙여넣기(clipboard)한 이미지를 `<doc_dir>/attachments/`에 저장한다.
/// `data_url`=`data:<mime>;base64,…`, `name_stem`=확장자 없는 파일명(예: "Pasted image 20260209110129").
/// attachments 폴더가 없으면 만들고, 같은 이름이 있으면 " 1"…을 붙여 충돌을 피한다.
/// 저장한 파일명(확장자 포함, 폴더 제외)을 반환 → 프론트가 `![[name]]`로 삽입한다.
#[tauri::command]
fn save_pasted_image(doc_dir: String, name_stem: String, data_url: String) -> Result<String, String> {
    // 파일명 가드: 경로 구분자·상위참조·ADS(:) 금지(attachments 폴더 밖 접근/트래버설 차단).
    if name_stem.is_empty()
        || name_stem.contains("..")
        || name_stem.contains('/')
        || name_stem.contains('\\')
        || name_stem.contains(':')
    {
        return Err("잘못된 파일명입니다.".to_string());
    }
    // 문서 폴더는 존재하는 디렉터리여야 한다.
    let dir_meta = fs::metadata(&doc_dir).map_err(|e| e.to_string())?;
    if !dir_meta.is_dir() {
        return Err("문서 폴더가 아닙니다.".to_string());
    }
    let (mime, b64) =
        parse_data_url(&data_url).ok_or_else(|| "이미지 데이터 형식이 잘못되었습니다.".to_string())?;
    let ext = ext_for_mime(mime).ok_or_else(|| "지원하지 않는 이미지 형식입니다.".to_string())?;
    let bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err("이미지가 너무 큽니다.".to_string());
    }
    let attach = Path::new(&doc_dir).join("attachments");
    fs::create_dir_all(&attach).map_err(|e| e.to_string())?;
    let path = unique_image_path(&attach, &name_stem, ext);
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "파일명 생성에 실패했습니다.".to_string())?
        .to_string();
    fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(file_name)
}

/// 설정 파일 이름 — 실행 파일과 같은 폴더에 두는 포터블 설정.
const SETTINGS_FILE: &str = "mdview.config.json";

/// 실행 파일이 위치한 디렉터리의 설정 파일 경로.
/// 경로는 실행 파일 기준으로만 만든다(사용자 입력 경로 아님 → 트래버설 없음).
fn settings_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    Some(exe.parent()?.join(SETTINGS_FILE))
}

/// 실행 파일 옆 설정 파일을 읽어 JSON 문자열로 반환. 없거나 못 읽으면 None
/// (프론트가 기본값/ localStorage 폴백 사용).
#[tauri::command]
fn load_settings() -> Option<String> {
    fs::read_to_string(settings_path()?).ok()
}

/// 프론트가 직렬화한 설정 JSON을 실행 파일 옆에 저장한다. 보호된 설치 경로 등으로
/// 쓰기에 실패하면 Err 반환(프론트가 무시하고 localStorage로 폴백).
#[tauri::command]
fn save_settings(contents: String) -> Result<(), String> {
    let path = settings_path().ok_or_else(|| "설정 경로를 확인할 수 없습니다.".to_string())?;
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// CLI로 전달된 열 파일 경로. `mdview <file.md>` 형태. 없으면 None.
/// 프론트가 시작 시 호출해 해당 파일을 바로 연다(편집 모드).
#[tauri::command]
fn startup_file() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    let cwd = std::env::current_dir().ok()?;
    resolve_arg_path(&args, &cwd)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // "파일" 메뉴(New/Open/Save/Save As). 클릭/가속키 → on_menu_event → 프론트 emit.
            let handle = app.handle();
            let new_i = MenuItem::with_id(handle, "new", "새 파일", true, Some("CmdOrCtrl+N"))?;
            let open_i = MenuItem::with_id(handle, "open", "열기…", true, Some("CmdOrCtrl+O"))?;
            let save_i = MenuItem::with_id(handle, "save", "저장", true, Some("CmdOrCtrl+S"))?;
            let save_as_i = MenuItem::with_id(
                handle,
                "save_as",
                "다른 이름으로 저장…",
                true,
                Some("CmdOrCtrl+Shift+S"),
            )?;
            let file_menu = Submenu::with_items(
                handle,
                "파일",
                true,
                &[&new_i, &open_i, &save_i, &save_as_i],
            )?;

            // 기본 메뉴(앱/편집-Copy·Paste 등)를 유지한 채 "파일" 메뉴를 끼워 넣는다.
            let menu = Menu::default(handle)?;
            #[cfg(target_os = "macos")]
            menu.insert(&file_menu, 1)?;
            #[cfg(not(target_os = "macos"))]
            menu.append(&file_menu)?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            if matches!(id, "new" | "open" | "save" | "save_as") {
                let _ = app.emit("menu", id.to_string());
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            file_mtime,
            startup_file,
            load_settings,
            save_settings,
            read_image_data_url,
            save_pasted_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{ext_for_mime, parse_data_url, resolve_arg_path, MD_EXTS};
    use std::path::Path;

    fn args(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parses_valid_data_url() {
        let (mime, b64) = parse_data_url("data:image/png;base64,AAAB").unwrap();
        assert_eq!(mime, "image/png");
        assert_eq!(b64, "AAAB");
    }

    #[test]
    fn parses_data_url_with_extra_params() {
        // charset 등 부가 파라미터가 있어도 mime만 정확히 뽑는다.
        let (mime, b64) = parse_data_url("data:image/jpeg;charset=utf-8;base64,Zm9v").unwrap();
        assert_eq!(mime, "image/jpeg");
        assert_eq!(b64, "Zm9v");
    }

    #[test]
    fn rejects_non_base64_or_malformed_data_url() {
        assert!(parse_data_url("data:image/png,AAAB").is_none()); // base64 아님(URL 인코딩)
        assert!(parse_data_url("image/png;base64,AAAB").is_none()); // data: 접두어 없음
        assert!(parse_data_url("data:image/png;base64").is_none()); // 콤마 없음
    }

    #[test]
    fn maps_known_image_mimes_only() {
        assert_eq!(ext_for_mime("image/png"), Some("png"));
        assert_eq!(ext_for_mime("image/jpeg"), Some("jpg"));
        assert_eq!(ext_for_mime("image/svg+xml"), Some("svg"));
        assert_eq!(ext_for_mime("text/plain"), None);
        assert_eq!(ext_for_mime("application/octet-stream"), None);
    }

    #[test]
    fn none_without_arg() {
        assert_eq!(resolve_arg_path(&args(&["mdview"]), Path::new("/w")), None);
    }

    #[test]
    fn picks_md_and_resolves_relative() {
        let got = resolve_arg_path(&args(&["mdview", "notes.md"]), Path::new("/w")).unwrap();
        assert!(got.ends_with("notes.md"));
        assert!(got.contains('w')); // 상대경로는 cwd가 앞에 붙는다
    }

    #[test]
    fn skips_flags() {
        let got =
            resolve_arg_path(&args(&["mdview", "--debug", "a.markdown"]), Path::new("/w")).unwrap();
        assert!(got.ends_with("a.markdown"));
    }

    #[test]
    fn ignores_non_markdown() {
        assert_eq!(
            resolve_arg_path(&args(&["mdview", "photo.png"]), Path::new("/w")),
            None
        );
        assert_eq!(
            resolve_arg_path(&args(&["mdview", "noext"]), Path::new("/w")),
            None
        );
    }

    #[test]
    fn keeps_absolute_path() {
        let abs = if cfg!(windows) {
            r"C:\docs\a.md"
        } else {
            "/docs/a.md"
        };
        let got = resolve_arg_path(&args(&["mdview", abs]), Path::new("/w")).unwrap();
        assert!(got.ends_with("a.md"));
        assert!(!got.contains("/w")); // 절대경로면 cwd를 붙이지 않는다
    }

    #[test]
    fn ext_is_case_insensitive() {
        assert!(resolve_arg_path(&args(&["mdview", "README.MD"]), Path::new("/w")).is_some());
    }

    #[test]
    fn md_exts_cover_md() {
        assert!(MD_EXTS.contains(&"md"));
    }

    #[test]
    fn supports_double_dash_end_of_options() {
        let got =
            resolve_arg_path(&args(&["mdview", "--", "-leading.md"]), Path::new("/w")).unwrap();
        assert!(got.ends_with("-leading.md"));
    }

    #[cfg(windows)]
    #[test]
    fn rejects_windows_reserved_device_names() {
        for name in [
            "CON.md",
            "NUL.md",
            "COM1.md",
            "LPT9.markdown",
            "con.md",
            "aux.mdown",
        ] {
            assert_eq!(
                resolve_arg_path(&args(&["mdview", name]), Path::new("/w")),
                None,
                "{name} should be rejected"
            );
        }
        // COM0/LPT0 은 예약어가 아니므로 통과한다.
        assert!(resolve_arg_path(&args(&["mdview", "COM0.md"]), Path::new("/w")).is_some());
    }

    #[cfg(windows)]
    #[test]
    fn rejects_ntfs_ads_paths() {
        assert_eq!(
            resolve_arg_path(
                &args(&["mdview", r"C:\data\secret.config:hidden.md"]),
                Path::new("/w")
            ),
            None
        );
    }
}
