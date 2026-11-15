//! A terminal client for the akbun-terminal daemon.
//!
//! The shells live in the daemon, so quitting this program leaves them
//! running and starting it again shows them again.

mod app;
mod keys;
mod layout;
mod render;
mod state;

use std::io::{self, IsTerminal};

use ratatui::backend::CrosstermBackend;
use ratatui::crossterm::cursor::Show;
use ratatui::crossterm::event::{
    DisableBracketedPaste, DisableMouseCapture, EnableBracketedPaste, EnableMouseCapture,
};
use ratatui::crossterm::execute;
use ratatui::crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use ratatui::Terminal;

use app::{App, Exit};

const USAGE: &str = "akbun-terminal-tui: the workspace of akbun-terminal inside this terminal

Usage: akbun-terminal-tui [--help | --version]

Starts the daemon if it is not running. Quitting (Ctrl+G, then q) leaves
every shell running. Ctrl+G, then ? lists the keys.";

fn main() {
    match std::env::args().nth(1).as_deref() {
        Some("--help" | "-h") => return println!("{USAGE}"),
        Some("--version" | "-V") => {
            return println!("akbun-terminal-tui {}", env!("CARGO_PKG_VERSION"))
        }
        Some(other) => {
            eprintln!("akbun-terminal-tui: unknown argument {other}\n\n{USAGE}");
            std::process::exit(2);
        }
        None => {}
    }
    if !io::stdout().is_terminal() || !io::stdin().is_terminal() {
        eprintln!("akbun-terminal-tui: needs a terminal on stdin and stdout");
        std::process::exit(1);
    }
    let cwd = std::env::current_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_default();
    let size = ratatui::crossterm::terminal::size().unwrap_or((80, 24));
    // Connecting first, before the screen is taken over, so a failure is an
    // ordinary message on an ordinary terminal.
    let mut app = match App::connect(&cwd, (size.0, size.1)) {
        Ok(app) => app,
        Err(error) => {
            eprintln!("akbun-terminal-tui: {error}");
            std::process::exit(1);
        }
    };

    install_panic_hook();
    let outcome = enter()
        .map_err(|error| error.to_string())
        .and_then(|mut terminal| {
            let outcome = app.run(&mut terminal);
            restore();
            outcome
        });
    restore();
    match outcome {
        Ok(Exit::Quit) => {}
        Ok(Exit::Lost) => {
            eprintln!("akbun-terminal-tui: lost the connection to the daemon");
            std::process::exit(1);
        }
        Err(error) => {
            eprintln!("akbun-terminal-tui: {error}");
            std::process::exit(1);
        }
    }
}

fn enter() -> io::Result<Terminal<CrosstermBackend<io::Stdout>>> {
    enable_raw_mode()?;
    execute!(
        io::stdout(),
        EnterAlternateScreen,
        EnableMouseCapture,
        EnableBracketedPaste
    )?;
    Terminal::new(CrosstermBackend::new(io::stdout()))
}

/// Gives the terminal back as it was found. Safe to call more than once and
/// when nothing was taken, which is what lets the panic hook call it blindly.
fn restore() {
    let _ = execute!(
        io::stdout(),
        DisableBracketedPaste,
        DisableMouseCapture,
        LeaveAlternateScreen,
        Show
    );
    let _ = disable_raw_mode();
}

/// A panic must not leave the shell in raw mode on the alternate screen, with
/// the message printed somewhere nobody can read it.
fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        restore();
        previous(info);
    }));
}
