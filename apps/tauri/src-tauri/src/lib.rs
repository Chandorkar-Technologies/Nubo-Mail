use tauri::{WebviewUrl, WebviewWindowBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Create main window pointing to nubo.email inbox (the launcher)
            // Desktop/mobile apps should open the main mail interface, not login page
            let url = WebviewUrl::External("https://nubo.email/mail/inbox".parse().unwrap());

            let window = WebviewWindowBuilder::new(app, "main", url)
                .title("Nubo")
                .inner_size(1400.0, 900.0)
                .min_inner_size(800.0, 600.0)
                .resizable(true)
                .fullscreen(false)
                .decorations(true)
                .visible(true)
                .build()?;

            // macOS: Use overlay title bar for cleaner look
            #[cfg(target_os = "macos")]
            {
                use tauri::TitleBarStyle;
                let _ = window.set_title_bar_style(TitleBarStyle::Overlay);
            }

            #[cfg(not(target_os = "macos"))]
            let _ = window;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
