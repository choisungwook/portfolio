"""SearXNG의 /search?format=json 응답 형식만 흉내 내는 로컬 mock 검색 서버.

외부 인터넷을 쓰지 않는다. 질문을 그대로 넣은 결과 2개를 돌려준다.

사용법: uv run python scripts/mock_searxng.py [port]   (기본 8890)
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse


def search_results(query: str, port: int) -> dict:
  """SearXNG JSON 응답 모양의 dict를 만든다."""
  return {
    "query": query,
    "results": [
      {"title": f"{query} 개요", "url": f"http://mock-search.local:{port}/1", "content": f"mock({port}): {query}의 정의와 배경"},
      {"title": f"{query} 최신 소식", "url": f"http://mock-search.local:{port}/2", "content": f"mock({port}): {query}의 최근 변경 사항"},
    ],
  }


class MockSearxngHandler(BaseHTTPRequestHandler):
  """/search 경로만 처리한다."""

  def do_GET(self) -> None:
    url = urlparse(self.path)
    if url.path != "/search":
      self.send_error(404)
      return
    query = parse_qs(url.query).get("q", [""])[0]
    body = json.dumps(search_results(query, self.server.server_port), ensure_ascii=False).encode()
    self.send_response(200)
    self.send_header("Content-Type", "application/json")
    self.end_headers()
    self.wfile.write(body)


if __name__ == "__main__":
  port = int(sys.argv[1]) if len(sys.argv) > 1 else 8890
  print(f"mock searxng on http://localhost:{port}/search", flush=True)
  HTTPServer(("127.0.0.1", port), MockSearxngHandler).serve_forever()
