use crate::api::Api;
use anyhow::{Context, Result, bail, ensure};
use reqwest::Method;
use std::time::{Duration, Instant};
use tiny_http::{Header, Response, Server};
use url::Url;

pub fn entry(base: &Url) -> Result<keyring::Entry> {
  keyring::Entry::new("akbun-reader", base.as_str()).context("OS keychain을 열지 못했습니다.")
}

pub fn token(base: &Url) -> Result<String> {
  entry(base)?
    .get_password()
    .context("로그인이 필요합니다. reader auth login을 실행하세요.")
}

pub fn login(base: Url) -> Result<()> {
  let server = Server::http("127.0.0.1:0")
    .map_err(|_| anyhow::anyhow!("로그인 콜백 포트를 열지 못했습니다."))?;
  let address = server.server_addr().to_ip().context("loopback 주소 없음")?;
  let state = format!(
    "{}{}",
    uuid::Uuid::new_v4().simple(),
    uuid::Uuid::new_v4().simple()
  );
  let mut login = base.join("cli-login.html")?;
  login
    .query_pairs_mut()
    .append_pair("port", &address.port().to_string())
    .append_pair("state", &state);
  eprintln!("브라우저에서 CLI 토큰 발급을 완료하세요: {login}");
  webbrowser::open(login.as_str()).context("브라우저 열기 실패; 표시된 주소로 접속하세요.")?;
  let deadline = Instant::now() + Duration::from_secs(180);
  while Instant::now() < deadline {
    let Some(mut request) = server.recv_timeout(Duration::from_secs(1))? else {
      continue;
    };
    let origin = request
      .headers()
      .iter()
      .find(|h| h.field.equiv("Origin"))
      .map(|h| h.value.as_str());
    let host = request
      .headers()
      .iter()
      .find(|h| h.field.equiv("Host"))
      .map(|h| h.value.as_str());
    if request.method().as_str() == "OPTIONS"
      && request.url() == "/callback"
      && origin == Some(base.origin().ascii_serialization().as_str())
      && host == Some(address.to_string().as_str())
    {
      request.respond(
        Response::empty(204)
          .with_header(
            Header::from_bytes(
              "Access-Control-Allow-Origin",
              base.origin().ascii_serialization(),
            )
            .unwrap(),
          )
          .with_header(Header::from_bytes("Access-Control-Allow-Methods", "POST").unwrap())
          .with_header(Header::from_bytes("Access-Control-Allow-Headers", "Content-Type").unwrap())
          .with_header(Header::from_bytes("Access-Control-Allow-Private-Network", "true").unwrap()),
      )?;
      continue;
    }
    let content_type = request
      .headers()
      .iter()
      .find(|h| h.field.equiv("Content-Type"))
      .map(|h| h.value.as_str())
      .unwrap_or("");
    let valid = request.method().as_str() == "POST"
      && request.url() == "/callback"
      && origin == Some(base.origin().ascii_serialization().as_str())
      && host == Some(address.to_string().as_str())
      && content_type.starts_with("application/x-www-form-urlencoded")
      && request.body_length().is_some_and(|n| n <= 4096);
    if !valid {
      request.respond(Response::empty(403))?;
      continue;
    }
    let mut body = String::new();
    request.as_reader().read_to_string(&mut body)?;
    let received = parse_callback(&body, &state);
    let Ok(secret) = received else {
      request.respond(Response::empty(403))?;
      continue;
    };
    let api = Api::new(base.clone(), secret.clone())?;
    if api.call(Method::GET, "me", None).is_err() {
      request.respond(Response::empty(401))?;
      bail!("토큰 확인 실패");
    }
    entry(&base)?.set_password(&secret)?;
    request.respond(
      Response::from_string("CLI login complete. You may close this tab.")
        .with_header(
          Header::from_bytes(
            "Access-Control-Allow-Origin",
            base.origin().ascii_serialization(),
          )
          .unwrap(),
        )
        .with_header(Header::from_bytes("Cache-Control", "no-store").unwrap()),
    )?;
    return Ok(());
  }
  bail!("로그인 대기 시간이 만료되었습니다. 다시 실행하세요.")
}

pub fn parse_callback(body: &str, state: &str) -> Result<String> {
  let fields: Vec<_> = url::form_urlencoded::parse(body.as_bytes()).collect();
  ensure!(fields.len() == 2, "잘못된 콜백");
  ensure!(
    fields
      .iter()
      .filter(|(k, v)| k == "state" && v == state)
      .count()
      == 1,
    "state 불일치"
  );
  let tokens: Vec<_> = fields.iter().filter(|(k, _)| k == "token").collect();
  ensure!(tokens.len() == 1, "토큰 누락");
  let token = tokens[0].1.to_string();
  ensure!(
    token.len() == 64
      && token
        .bytes()
        .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)),
    "토큰 형식 오류"
  );
  Ok(token)
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn callback_rejects_forgery_and_duplicates() {
    let body = format!("state=expected&token={}", "a".repeat(64));
    assert!(parse_callback(&body, "expected").is_ok());
    assert!(parse_callback(&body, "other").is_err());
    assert!(parse_callback(&(body + "&state=expected"), "expected").is_err());
  }
}
