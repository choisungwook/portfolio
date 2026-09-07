use anyhow::{Context, Result, ensure};
use reqwest::{Method, blocking::Client, redirect::Policy};
use serde_json::Value;
use std::{io::Read, time::Duration};
use url::Url;

pub struct Api {
  pub base: Url,
  token: String,
  client: Client,
}

pub fn base_url(value: &str) -> Result<Url> {
  let url = Url::parse(value)?;
  ensure!(
    url.scheme() == "https" || (url.scheme() == "http" && url.host_str() == Some("127.0.0.1")),
    "HTTPS 서비스 주소가 필요합니다."
  );
  ensure!(
    url.username().is_empty()
      && url.password().is_none()
      && url.path() == "/"
      && url.query().is_none()
      && url.fragment().is_none(),
    "경로·사용자 정보 없는 서비스 주소가 필요합니다."
  );
  Ok(url)
}

impl Api {
  pub fn new(base: Url, token: String) -> Result<Self> {
    ensure!(
      token.len() == 64
        && token
          .bytes()
          .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)),
      "올바른 API 토큰이 필요합니다."
    );
    Ok(Self {
      base,
      token,
      client: Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(30))
        .build()?,
    })
  }
  pub fn call(&self, method: Method, path: &str, body: Option<&Value>) -> Result<Value> {
    let mut request = self
      .client
      .request(method, self.base.join(&format!("automation/{path}"))?)
      .bearer_auth(&self.token);
    if let Some(value) = body {
      request = request.json(value);
    }
    let response = request.send().context("API 연결 실패")?;
    let status = response.status();
    ensure!(
      status.as_u16() != 401 && status.as_u16() != 403,
      "인증이 필요합니다. reader auth login 실행 후 재시도하세요."
    );
    let mut bytes = Vec::new();
    response.take(8_000_001).read_to_end(&mut bytes)?;
    ensure!(bytes.len() <= 8_000_000, "응답 크기 상한 초과");
    let data: Value = serde_json::from_slice(&bytes)
      .context("JSON 응답이 아닙니다. Access 자동화 경로 설정을 확인하세요.")?;
    ensure!(
      status.is_success(),
      "API {}: {}",
      status,
      data
        .get("error")
        .and_then(Value::as_str)
        .unwrap_or("요청 실패")
    );
    Ok(data)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn rejects_redirects_and_untrusted_base_urls() {
    for url in [
      "http://example.com",
      "https://user:pass@example.com",
      "https://example.com/path",
    ] {
      assert!(base_url(url).is_err());
    }
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
    let base = base_url(&format!("http://{}", server.server_addr())).unwrap();
    let thread = std::thread::spawn(move || {
      let request = server.recv().unwrap();
      assert_eq!(request.url(), "/automation/me");
      assert!(
        request
          .headers()
          .iter()
          .any(|h| h.field.equiv("Authorization")
            && h.value.as_str() == format!("Bearer {}", "a".repeat(64)))
      );
      request
        .respond(tiny_http::Response::empty(302).with_header(
          tiny_http::Header::from_bytes("Location", "http://127.0.0.1:1/leak").unwrap(),
        ))
        .unwrap();
    });
    assert!(
      Api::new(base, "a".repeat(64))
        .unwrap()
        .call(Method::GET, "me", None)
        .is_err()
    );
    thread.join().unwrap();
  }
}
