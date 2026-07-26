"""A minimal ACP client: what an editor does when it drives an agent.

Usage:
  uv run python src/client.py "summarize the readme"
  uv run python src/client.py "summarize the readme" --deny
  uv run python src/client.py "summarize the readme" --no-fs
"""

import os
import subprocess
import sys
from typing import Any

from acp import Peer, text_block

PROTOCOL_VERSION = 1
AGENT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent.py")


class DemoClient:
  """Spawns the agent, answers its requests, and renders its stream.

  Args:
    cwd: working directory the session is bound to.
    allow_writes: what to answer when the agent asks permission to write.
    fs_capability: whether to advertise fs.readTextFile and fs.writeTextFile.
  """

  def __init__(self, cwd: str, allow_writes: bool = True, fs_capability: bool = True) -> None:
    self.cwd = cwd
    self.allow_writes = allow_writes
    self.fs_capability = fs_capability
    self.seen_updates: list[str] = []
    self.permission_asked = False
    self.process = subprocess.Popen(
      [sys.executable, AGENT],
      stdin=subprocess.PIPE,
      stdout=subprocess.PIPE,
      text=True,
      bufsize=1,
    )
    self.peer = Peer(self.process.stdout, self.process.stdin, self.handle, name="client")

  def handle(self, method: str, params: dict) -> Any:
    """Route a request coming from the agent."""
    routes = {
      "session/update": self.on_update,
      "fs/read_text_file": self.read_text_file,
      "fs/write_text_file": self.write_text_file,
      "session/request_permission": self.request_permission,
    }
    if method not in routes:
      raise ValueError(f"unsupported method: {method}")
    return routes[method](params)

  def on_update(self, params: dict) -> None:
    """Render one streamed update. An editor would paint UI here instead."""
    update = params["update"]
    kind = update["sessionUpdate"]
    self.seen_updates.append(kind)

    if kind == "agent_thought_chunk":
      print(f"  (thinking) {update['content']['text']}")
    elif kind == "agent_message_chunk":
      print(update["content"]["text"], end="", flush=True)
    elif kind == "plan":
      print("  (plan)")
      for entry in update["entries"]:
        print(f"    - {entry['content']}")
    elif kind == "tool_call":
      print(f"  (tool {update['status']}) {update['title']}")
    elif kind == "tool_call_update":
      print(f"  (tool {update['status']}) {update['toolCallId']}")

  def read_text_file(self, params: dict) -> dict:
    """Serve a file to the agent. The path check belongs here, not in the agent."""
    path = self._resolve(params["path"])
    with open(path, encoding="utf-8") as handle:
      return {"content": handle.read()}

  def write_text_file(self, params: dict) -> None:
    path = self._resolve(params["path"])
    with open(path, "w", encoding="utf-8") as handle:
      handle.write(params["content"])

  def request_permission(self, params: dict) -> dict:
    """Decide whether a tool call may proceed. The agent cannot override this."""
    self.permission_asked = True
    option = "allow" if self.allow_writes else "reject"
    print(f"  (permission) {params['toolCall']['toolCallId']} -> {option}")
    return {"outcome": {"outcome": "selected", "optionId": option}}

  def _resolve(self, path: str) -> str:
    """Keep the agent inside cwd. ACP requires absolute paths but enforces nothing."""
    resolved = os.path.realpath(path)
    if os.path.commonpath([resolved, os.path.realpath(self.cwd)]) != os.path.realpath(self.cwd):
      raise PermissionError(f"path escapes the session directory: {path}")
    return resolved

  def run(self, prompt: str) -> dict:
    """Drive a full turn: initialize, session/new, session/prompt."""
    capabilities: dict = {}
    if self.fs_capability:
      capabilities["fs"] = {"readTextFile": True, "writeTextFile": True}

    handshake = self.peer.request("initialize", {
      "protocolVersion": PROTOCOL_VERSION,
      "clientCapabilities": capabilities,
      "clientInfo": {"name": "demo-acp-client", "version": "0.1.0"},
    })
    print(f"agent: {handshake['agentInfo']['name']} (protocol v{handshake['protocolVersion']})")

    session = self.peer.request("session/new", {"cwd": self.cwd, "mcpServers": []})
    print(f"session: {session['sessionId']}\n")

    result = self.peer.request("session/prompt", {
      "sessionId": session["sessionId"],
      "prompt": [text_block(prompt)],
    })
    print(f"\n\nstopReason: {result['stopReason']}")
    return {
      "stopReason": result["stopReason"],
      "updates": self.seen_updates,
      "permissionAsked": self.permission_asked,
    }

  def close(self) -> None:
    """Closing stdin ends the agent's serve loop."""
    self.process.stdin.close()
    self.process.wait(timeout=5)


def main() -> None:
  args = sys.argv[1:]
  prompt = next((a for a in args if not a.startswith("--")), "summarize the readme")
  client = DemoClient(
    cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    allow_writes="--deny" not in args,
    fs_capability="--no-fs" not in args,
  )
  try:
    client.run(prompt)
  finally:
    client.close()


if __name__ == "__main__":
  main()
