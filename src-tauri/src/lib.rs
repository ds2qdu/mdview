use std::fs;
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::Emitter;

/// 지정한 경로의 텍스트 파일을 읽어 문자열로 반환한다.
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 문자열을 지정한 경로에 저장한다.
#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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
        .invoke_handler(tauri::generate_handler![read_file, write_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
