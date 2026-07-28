use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use serde::Deserialize;
use tauri::window::Color;
use tauri::{Manager, Theme};

const BOOT_FILE: &str = "appearance-boot.json";
const LIGHT_BG: Color = Color(0xFF, 0xFF, 0xFF, 0xFF);
const DARK_BG: Color = Color(0x05, 0x05, 0x05, 0xFF);
/// Safety net if the frontend never calls show() after hydrate.
const SHOW_FALLBACK_MS: u64 = 3000;

#[derive(Debug, Deserialize)]
struct BootAppearance {
    /// Last resolved paint: true = dark chrome.
    dark: bool,
    /// User preference when last written: light | dark | system.
    /// Missing/`system` → cold start prefers live OS theme over stale `dark`.
    #[serde(default = "default_system")]
    appearance: String,
}

fn default_system() -> String {
    "system".into()
}

fn boot_file_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join(BOOT_FILE))
}

fn read_boot(app: &tauri::AppHandle) -> Option<BootAppearance> {
    let path = boot_file_path(app)?;
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn system_is_dark(window: &tauri::WebviewWindow) -> bool {
    matches!(window.theme().ok(), Some(Theme::Dark))
}

/// Decide cold-start chrome:
/// - forced light/dark → trust persisted `dark`
/// - system / unknown / missing file → live OS theme (avoids stale boot after OS flip overnight)
fn resolve_boot_dark(app: &tauri::AppHandle, window: &tauri::WebviewWindow) -> bool {
    match read_boot(app) {
        Some(boot) if boot.appearance == "light" || boot.appearance == "dark" => boot.dark,
        Some(_) | None => system_is_dark(window),
    }
}

fn apply_window_theme(window: &tauri::WebviewWindow, appearance: &str) {
    let theme = match appearance {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None,
    };
    let _ = window.set_theme(theme);
}

fn apply_window_background(window: &tauri::WebviewWindow, dark: bool) {
    let color = if dark { DARK_BG } else { LIGHT_BG };
    let _ = window.set_background_color(Some(color));
}

/// Persist preference + last resolved theme for the next cold start.
#[tauri::command]
fn persist_boot_appearance(
    app: tauri::AppHandle,
    dark: bool,
    appearance: String,
) -> Result<(), String> {
    let appearance = match appearance.as_str() {
        "light" | "dark" | "system" => appearance,
        _ => "system".into(),
    };
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(BOOT_FILE);
    let body = format!(
        "{{\"dark\":{},\"appearance\":\"{}\"}}",
        if dark { "true" } else { "false" },
        appearance
    );
    fs::write(path, body).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![persist_boot_appearance])
        .setup(|app| {
            let Some(window) = app.get_webview_window("main") else {
                // Misconfigured label — nothing to paint; avoid silently hanging invisible.
                return Ok(());
            };
            let boot = read_boot(app.handle());
            let appearance = boot
                .as_ref()
                .map(|b| b.appearance.as_str())
                .unwrap_or("system");
            let dark = resolve_boot_dark(app.handle(), &window);
            eprintln!(
                "[LexiconBoot] setup appearance={} dark={} boot={:?}",
                appearance,
                dark,
                boot.as_ref().map(|b| format!("{},{}", b.appearance, b.dark))
            );
            // Theme before background so WebView2 / DWM don't briefly follow OS dark.
            apply_window_theme(&window, appearance);
            apply_window_background(&window, dark);
            // Do not show yet — frontend calls show() after hydrate + syncNativeWindowTheme.
            let fallback = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(SHOW_FALLBACK_MS));
                let _ = fallback.show();
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
