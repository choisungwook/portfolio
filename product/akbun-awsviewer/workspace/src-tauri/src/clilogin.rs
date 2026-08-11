// Runs `aws sso login` and relays its browser step into an app window.
//
// The app used to run the device authorization flow itself against SSO OIDC,
// registering its own OIDC client on every login. That path did not work in
// practice and left nothing to act on but an AWS error string. The AWS CLI
// runs the same flow, is already trusted by the same Identity Center
// instance, and already writes the token cache this app reads — so the CLI
// runs the flow now and this module only relays it.
//
// Everything here is blocking on purpose: `std::process` plus reader threads,
// called from spawn_blocking. The text handling it depends on lives in
// awsviewer_core::awscli, which has no process and is unit tested there.

use awsviewer_core::awscli::{self, Verification};
use awsviewer_core::CoreError;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// How long to wait for the whole flow. The CLI gives up on its own device
/// code well before this; this is only a backstop so a wedged child process
/// cannot hold the login button disabled forever.
const OVERALL_TIMEOUT: Duration = Duration::from_secs(15 * 60);

/// How long to wait for the CLI to print its verification URL. Failures that
/// happen before that (bad profile, unreachable endpoint) end the child
/// instead, so this only guards a CLI that starts and says nothing.
const URL_TIMEOUT: Duration = Duration::from_secs(60);

const POLL: Duration = Duration::from_millis(200);

/// Where `aws` is, or a message naming the places that were checked. PATH is
/// tried last: a bundled macOS app inherits a PATH that has neither install
/// location in it, so relying on PATH alone finds nothing in a release build
/// even though the same command works in the user's terminal.
pub fn resolve_cli() -> Result<String, CoreError> {
    for candidate in awscli::CLI_CANDIDATES {
        if std::path::Path::new(candidate).is_file() {
            return Ok(candidate.to_string());
        }
    }
    if which_in_path("aws").is_some() {
        return Ok("aws".to_string());
    }
    Err(CoreError::Io {
        message: format!(
            "the AWS CLI was not found in {} or on PATH; install AWS CLI v2 and try again",
            awscli::CLI_CANDIDATES.join(", ")
        ),
    })
}

fn which_in_path(name: &str) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
}

/// Drives one login attempt to completion.
///
/// `on_verification` is called once, as soon as the CLI prints its URL — the
/// app opens the relay window and tells the page there. `keep_waiting` is
/// checked on every poll after that; returning false kills the CLI, which is
/// how closing the window cancels the flow.
pub fn run_login(
    profile: &str,
    mut on_verification: impl FnMut(Verification),
    keep_waiting: impl Fn() -> bool,
) -> Result<(), CoreError> {
    let binary = resolve_cli()?;
    let mut child = spawn(&binary, profile)?;
    let output = collect_output(&mut child);

    let started = Instant::now();
    let mut relayed = false;
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| io(format!("cannot wait for {binary}: {error}")))?
        {
            let text = output.lock().unwrap().clone();
            if status.success() {
                return Ok(());
            }
            return Err(exit_error(&text, status.code()));
        }

        if !relayed {
            if let Some(found) = awscli::parse_verification(&output.lock().unwrap()) {
                relayed = true;
                on_verification(found);
            } else if started.elapsed() > URL_TIMEOUT {
                let text = output.lock().unwrap().clone();
                kill(&mut child);
                return Err(CoreError::Aws {
                    message: format_no_url(&text),
                });
            }
        } else if !keep_waiting() {
            kill(&mut child);
            return Err(CoreError::Cancelled {
                message: "the sign-in window was closed before approval".to_string(),
            });
        }

        if started.elapsed() > OVERALL_TIMEOUT {
            kill(&mut child);
            return Err(CoreError::Aws {
                message: "aws sso login did not finish in 15 minutes".to_string(),
            });
        }
        std::thread::sleep(POLL);
    }
}

fn spawn(binary: &str, profile: &str) -> Result<Child, CoreError> {
    Command::new(binary)
        .args(awscli::login_args(profile))
        // The CLI reads nothing from stdin with --no-browser, and a null
        // stdin means a version that would prompt fails fast instead of
        // waiting on input no one can type.
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| io(format!("cannot run {binary}: {error}")))
}

/// Reader threads, one per pipe, appending into one buffer.
///
/// A full pipe blocks the child, and which stream the URL lands on has moved
/// between CLI versions, so both are drained and both feed the same parse.
fn collect_output(child: &mut Child) -> Arc<Mutex<String>> {
    let buffer = Arc::new(Mutex::new(String::new()));
    for stream in [
        child.stdout.take().map(StreamKind::Out),
        child.stderr.take().map(StreamKind::Err),
    ]
    .into_iter()
    .flatten()
    {
        let sink = Arc::clone(&buffer);
        std::thread::spawn(move || {
            let reader: Box<dyn std::io::Read + Send> = match stream {
                StreamKind::Out(out) => Box::new(out),
                StreamKind::Err(err) => Box::new(err),
            };
            for line in BufReader::new(reader).lines().map_while(Result::ok) {
                let mut text = sink.lock().unwrap();
                text.push_str(&line);
                text.push('\n');
            }
        });
    }
    buffer
}

enum StreamKind {
    Out(std::process::ChildStdout),
    Err(std::process::ChildStderr),
}

fn kill(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn exit_error(output: &str, code: Option<i32>) -> CoreError {
    let tail = awscli::error_tail(output, 6);
    let detail = if tail.is_empty() {
        format!("aws sso login exited with {}", describe(code))
    } else {
        format!("aws sso login failed ({}):\n{tail}", describe(code))
    };
    CoreError::Aws { message: detail }
}

fn format_no_url(output: &str) -> String {
    let tail = awscli::error_tail(output, 6);
    if tail.is_empty() {
        "aws sso login printed no sign-in URL".to_string()
    } else {
        format!("aws sso login printed no sign-in URL:\n{tail}")
    }
}

fn describe(code: Option<i32>) -> String {
    match code {
        Some(code) => format!("exit code {code}"),
        None => "a signal".to_string(),
    }
}

fn io(message: String) -> CoreError {
    CoreError::Io { message }
}
