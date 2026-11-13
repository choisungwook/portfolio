# /// script
# requires-python = ">=3.12"
# dependencies = ["websockets==15.0.1"]
# ///
"""AI 브라우저 도구가 하는 일(이동, 읽기, 클릭, 화면 캡처)을 raw CDP 메시지로만 재현한다."""

import base64
import json
import sys
import urllib.request

from websockets.sync.client import ClientConnection, connect

CDP_HTTP = "http://127.0.0.1:9222"
PAGE_URL = "http://127.0.0.1:8000/index.html"
SCREENSHOT_PATH = "cdp-raw-screenshot.png"


class CdpSession:
  """page target 하나에 붙은 CDP WebSocket 세션."""

  def __init__(self, ws: ClientConnection) -> None:
    self.ws = ws
    self.next_id = 0
    self.seen_events: list[str] = []

  def send(self, method: str, params: dict | None = None) -> dict:
    """명령을 보내고 같은 id의 응답이 올 때까지 기다린다. 중간에 오는 event는 출력만 한다."""
    self.next_id += 1
    message = {"id": self.next_id, "method": method, "params": params or {}}
    print(f">> {json.dumps(message, ensure_ascii=False)[:120]}")
    self.ws.send(json.dumps(message))
    while True:
      reply = json.loads(self.ws.recv())
      if reply.get("id") == self.next_id:
        return reply.get("result", {})
      self.seen_events.append(reply.get("method"))
      print(f"<< event {reply.get('method')}")

  def wait_event(self, method: str) -> None:
    """지정한 event가 이미 왔거나 올 때까지 기다린다."""
    while method not in self.seen_events:
      self.seen_events.append(json.loads(self.ws.recv()).get("method"))
    print(f"<< event {method} (대기 완료)")


def find_page_ws_url() -> str:
  """HTTP 엔드포인트 /json/list에서 첫 page target의 WebSocket 주소를 얻는다."""
  with urllib.request.urlopen(f"{CDP_HTTP}/json/list") as response:
    targets = json.load(response)
  page = next(target for target in targets if target["type"] == "page")
  print(f"target: {page['id']} {page['url']}")
  return page["webSocketDebuggerUrl"]


def evaluate(session: CdpSession, expression: str) -> object:
  """페이지 안에서 JavaScript를 실행하고 값을 돌려받는다."""
  result = session.send("Runtime.evaluate", {"expression": expression, "returnByValue": True})
  return result["result"]["value"]


def click_at(session: CdpSession, x: float, y: float) -> None:
  """마우스 누름과 뗌을 좌표로 보낸다. DOM의 click()이 아니라 실제 입력 이벤트다."""
  for event_type in ("mousePressed", "mouseReleased"):
    session.send("Input.dispatchMouseEvent", {"type": event_type, "x": x, "y": y, "button": "left", "clickCount": 1})


def main() -> None:
  """이동 → 읽기 → 클릭 → 확인 → 접근성 트리 → 스크린샷 순서로 실행한다."""
  with connect(find_page_ws_url(), max_size=None) as ws:
    session = CdpSession(ws)
    session.send("Page.enable")
    session.send("Page.navigate", {"url": PAGE_URL})
    session.wait_event("Page.loadEventFired")

    rect = evaluate(session, "JSON.stringify(document.getElementById('add').getBoundingClientRect())")
    box = json.loads(rect)
    click_at(session, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    print(f"count after click: {evaluate(session, 'document.getElementById(\"count\").textContent')}")

    nodes = session.send("Accessibility.getFullAXTree")["nodes"]
    names = [node["name"]["value"] for node in nodes if node.get("name", {}).get("value")]
    print(f"ax nodes: {len(nodes)}, named: {names}")

    png = session.send("Page.captureScreenshot", {"format": "png"})["data"]
    with open(SCREENSHOT_PATH, "wb") as file:
      file.write(base64.b64decode(png))
    print(f"screenshot: {SCREENSHOT_PATH} ({len(png)} base64 chars)")
    print(f"total commands sent: {session.next_id}")


if __name__ == "__main__":
  sys.exit(main())
