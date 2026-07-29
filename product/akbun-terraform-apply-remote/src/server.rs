use crate::config::Config;
use crate::handler::{self, AppState};
use crate::{events, signature};
use std::io::Read;
use std::sync::Arc;
use tiny_http::{Method, Request, Response, Server};

/// Webhook bodies larger than this are rejected outright.
const MAX_BODY_BYTES: usize = 5 * 1024 * 1024;

/// Runs the webhook server forever. Each valid delivery is acknowledged
/// immediately and processed on a background thread so GitHub's 10-second
/// webhook timeout never hits a long terraform run.
pub fn run(cfg: Config) {
  let server = Server::http(("0.0.0.0", cfg.port)).expect("failed to bind server port");
  let state = Arc::new(AppState::new(cfg));

  for request in server.incoming_requests() {
    match (request.method(), request.url()) {
      (Method::Get, "/healthz") => respond(request, 200, "ok"),
      (Method::Post, "/events") => handle_delivery(state.clone(), request),
      _ => respond(request, 404, "not found"),
    }
  }
}

fn handle_delivery(state: Arc<AppState>, mut request: Request) {
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
      std::thread::spawn(move || handler::handle_event(&state, event));
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
