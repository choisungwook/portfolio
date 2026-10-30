// Prevents an extra console window on Windows in release. Do not remove.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // The app binary doubles as the CLI, so the copy inside the .app bundle is
    // all an agent needs: `.../akbun-makephoto.app/Contents/MacOS/akbun-makephoto list`.
    let first = std::env::args().nth(1);
    if makephoto_cli::is_cli_invocation(first.as_deref()) {
        std::process::exit(makephoto_cli::run(std::env::args_os()));
    }
    akbun_makephoto_lib::run()
}
