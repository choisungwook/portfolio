use crate::handler::{self, AppState};
use crate::jobs::JobTracker;
use crate::{events, signature};
use signal_hook::consts::{SIGINT, SIGTERM};
use signal_hook::iterator::Signals;
use std::io::Read;
use std::sync::Arc;
use std::time::Duration;
use tiny_http::{Method, Request, Response, Server};

/// Webhook bodies larger than this are rejected outright.
const MAX_BODY_BYTES: usize = 5 * 1024 * 1024;

/// How long shutdown waits for in-flight terraform runs before giving up.
/// Long on purpose: killing an apply halfway is worse than a slow deploy.
const DRAIN_TIMEOUT: Duration = Duration::from_secs(30 * 60);

/// Runs the webhook server until SIGTERM/SIGINT. Each valid delivery is
/// acknowledged immediately and processed on a background thread so
/// GitHub's 10-second webhook timeout never hits a long terraform run.
///
/// On SIGTERM the accept loop stops (a load balancer health check on
/// /healthz starts failing because the port closes) and the server drains:
/// it waits for running plan/apply jobs to finish before exiting. State is
/// persisted after every event, so the next instance takes over from disk.
pub fn run(state: AppState) {
  let server =
    Arc::new(Server::http(("0.0.0.0", state.cfg.port)).expect("failed to bind server port"));
  let state = Arc::new(state);
  let jobs = Arc::new(JobTracker::new());

  spawn_signal_listener(server.clone());

  for request in server.incoming_requests() {
    match (request.method(), request.url()) {
      (Method::Get, "/healthz") => respond(request, 200, "ok"),
      (Method::Post, "/events") => handle_delivery(state.clone(), &jobs, request),
      _ => respond(request, 404, "not found"),
    }
  }

  let active = jobs.active();
  if active > 0 {
    println!("shutdown requested: draining {active} in-flight job(s)");
  }
  if !jobs.wait_idle(DRAIN_TIMEOUT) {
    eprintln!("drain timeout after {}s; exiting with jobs still running", DRAIN_TIMEOUT.as_secs());
  }
  println!("shutdown complete");
}

/// Unblocks the accept loop when SIGTERM/SIGINT arrives, which ends
/// incoming_requests() and lets run() drain and exit.
fn spawn_signal_listener(server: Arc<Server>) {
  let mut signals = Signals::new([SIGTERM, SIGINT]).expect("failed to register signal handler");
  std::thread::spawn(move || {
    if signals.forever().next().is_some() {
      println!("received shutdown signal");
      server.unblock();
    }
  });
}

fn handle_delivery(state: Arc<AppState>, jobs: &Arc<JobTracker>, mut request: Request) {
  let event_name = header(&request, "X-GitHub-Event").unwrap_or_default();
  let signature_header = header(&request, "X-Hub-Signature-256").unwrap_or_default();

  let mut body = Vec::new();
  if request.as_reader().take(MAX_BODY_BYTES as u64 + 1).read_to_end(&mut body).is_err()
    || body.len() > MAX_BODY_BYTES
  {
    return respond(request, 400, "body too large or unreadable");
  }
  if !signature::verify(&state.cfg.webhook_secret, &body, &signature_header) {
    return respond(request, 401, "signature mismatch");
  }
  let payload: serde_json::Value = match serde_json::from_slice(&body) {
    Ok(payload) => payload,
    Err(_) => return respond(request, 400, "invalid JSON"),
  };

  match events::interpret(&event_name, &payload) {
    Ok(event) => {
      let guard = JobTracker::begin(jobs);
      std::thread::spawn(move || {
        handler::handle_event(&state, event);
        drop(guard);
      });
      respond(request, 200, "accepted");
    }
    Err(reason) => respond(request, 200, &format!("ignored: {reason}")),
  }
}

fn header(request: &Request, name: &str) -> Option<String> {
  request
    .headers()
    .iter()
    .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
    .map(|h| h.value.as_str().to_string())
}

fn respond(request: Request, status: u16, message: &str) {
  let _ = request.respond(Response::from_string(message).with_status_code(status));
}
