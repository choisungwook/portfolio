mod command;
mod config;
mod events;
mod format;
mod github;
mod handler;
mod locks;
mod project;
mod server;
mod signature;
mod terraform;
mod workspace;

fn main() {
  let cfg = match config::Config::from_env() {
    Ok(cfg) => cfg,
    Err(e) => {
      eprintln!("config error: {e}");
      std::process::exit(1);
    }
  };
  println!(
    "akbun-terraform-apply-remote listening on 0.0.0.0:{} (trigger word: {})",
    cfg.port, cfg.trigger
  );
  server::run(cfg);
}
