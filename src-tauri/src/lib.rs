#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Linux/WebKitGTK：新 Mesa（如 Fedora 44 的 26.x）下 WebKitWebProcess 退出时，
  // GBM/DRM 设备析构会触发堆 double-free（表现为关闭应用时崩溃）。
  // 禁用 dmabuf 渲染器可避开该路径（本应用无零拷贝视频渲染需求）；
  // 该变量仅 WebKitGTK 读取，Windows/macOS/Android 不受影响。
  if cfg!(target_os = "linux") {
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
  }

  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
