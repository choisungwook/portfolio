"""A scripted ACP agent. No model, no API key — the protocol is the subject.

The agent runs one hardcoded turn so every message on the wire is predictable:
it thinks, publishes a plan, reads a file through the client, asks permission,
writes a file through the client, and answers.

Nothing but ACP messages may ever reach stdout. Logs go to stderr.
"""

import os
import sys
import uuid
from typing import Any

from acp import Peer, text_block

PROTOCOL_VERSION = 1


def log(message: str) -> None:
  """Write a trace line to stderr. A print() to stdout would corrupt the stream."""
  print(f"[agent] {message}", file=sys.stderr, flush=True)


class ScriptedAgent:
  """Handles the four baseline client-to-agent methods of ACP v1."""

  def __init__(self) -> None:
    self.peer = Peer(sys.stdin, sys.stdout, self.handle, name="agent")
    self.client_capabilities: dict = {}
    self.sessions: dict[str, str] = {}

  def run(self) -> None:
    """Serve until the client closes stdin."""
    self.peer.serve()

  def handle(self, method: str, params: dict) -> Any:
    """Route an incoming client request to its handler."""
    routes = {
      "initialize": self.initialize,
      "session/new": self.new_session,
      "session/prompt": self.prompt,
      "session/cancel": self.cancel,
    }
    if method not in routes:
      raise ValueError(f"unsupported method: {method}")
    log(f"<- {method}")
    return routes[method](params)

  def initialize(self, params: dict) -> dict:
    """Negotiate the protocol version and exchange capabilities.

    An omitted capability means unsupported, so the agent must remember what
    the client offered instead of assuming.
    """
    self.client_capabilities = params.get("clientCapabilities") or {}
    return {
      "protocolVersion": min(PROTOCOL_VERSION, params.get("protocolVersion", PROTOCOL_VERSION)),
      "agentCapabilities": {
        "loadSession": False,
        "promptCapabilities": {"image": False, "audio": False, "embeddedContext": False},
      },
      "agentInfo": {"name": "scripted-acp-agent", "version": "0.1.0"},
      "authMethods": [],
    }

  def new_session(self, params: dict) -> dict:
    """Create a session bound to the working directory the client chose."""
    session_id = f"sess_{uuid.uuid4().hex[:12]}"
    self.sessions[session_id] = params["cwd"]
    return {"sessionId": session_id}

  def cancel(self, params: dict) -> None:
    """session/cancel is a notification, so there is nothing to return."""
    log(f"cancel requested for {params.get('sessionId')}")

  def prompt(self, params: dict) -> dict:
    """Run one turn and report why it ended."""
    session_id = params["sessionId"]
    cwd = self.sessions[session_id]
    asked = " ".join(b["text"] for b in params["prompt"] if b["type"] == "text")

    self._think(session_id, f"The user asked: {asked}")
    self._publish_plan(session_id)

    source = os.path.join(cwd, "README.md")
    content = self._read_file(session_id, source)
    if content is None:
      self._say(session_id, "I cannot read files: the client granted no fs capability.")
      return {"stopReason": "end_turn"}

    summary = f"{source} has {len(content.splitlines())} lines and {len(content)} characters.\n"
    if not self._write_file(session_id, os.path.join(cwd, "acp-out.txt"), summary):
      self._say(session_id, "You rejected the write, so I stopped without changing anything.")
      return {"stopReason": "end_turn"}

    self._say(session_id, f"Done. {summary.strip()}")
    return {"stopReason": "end_turn"}

  def _update(self, session_id: str, update: dict) -> None:
    """Send one session/update notification. This is the whole streaming API."""
    self.peer.notify("session/update", {"sessionId": session_id, "update": update})

  def _think(self, session_id: str, text: str) -> None:
    self._update(session_id, {
      "sessionUpdate": "agent_thought_chunk",
      "content": text_block(text),
    })

  def _say(self, session_id: str, text: str) -> None:
    """Stream an answer word by word, the way a real agent streams tokens."""
    for word in text.split(" "):
      self._update(session_id, {
        "sessionUpdate": "agent_message_chunk",
        "messageId": "msg_final",
        "content": text_block(word + " "),
      })

  def _publish_plan(self, session_id: str) -> None:
    steps = ["Read README.md", "Count its lines", "Write acp-out.txt"]
    self._update(session_id, {
      "sessionUpdate": "plan",
      "entries": [
        {"content": step, "priority": "medium", "status": "pending"} for step in steps
      ],
    })

  def _read_file(self, session_id: str, path: str) -> str | None:
    """Read a file through the client, which is where enforcement lives.

    Returns None when the client did not advertise fs.readTextFile.
    """
    if not (self.client_capabilities.get("fs") or {}).get("readTextFile"):
      return None

    tool_call_id = f"call_{uuid.uuid4().hex[:8]}"
    self._update(session_id, {
      "sessionUpdate": "tool_call",
      "toolCallId": tool_call_id,
      "title": f"Read {os.path.basename(path)}",
      "kind": "read",
      "status": "in_progress",
      "locations": [{"path": path}],
    })
    result = self.peer.request("fs/read_text_file", {"sessionId": session_id, "path": path})
    content = result["content"]
    self._update(session_id, {
      "sessionUpdate": "tool_call_update",
      "toolCallId": tool_call_id,
      "status": "completed",
      "content": [{"type": "content", "content": text_block(f"{len(content)} characters")}],
    })
    return content

  def _write_file(self, session_id: str, path: str, content: str) -> bool:
    """Ask permission, then write through the client. Returns False if rejected.

    Asking is the agent's choice: nothing in ACP forces this request, which is
    why the client must sandbox rather than trust it.
    """
    if not (self.client_capabilities.get("fs") or {}).get("writeTextFile"):
      return False

    tool_call_id = f"call_{uuid.uuid4().hex[:8]}"
    self._update(session_id, {
      "sessionUpdate": "tool_call",
      "toolCallId": tool_call_id,
      "title": f"Write {os.path.basename(path)}",
      "kind": "edit",
      "status": "pending",
      "content": [{"type": "diff", "path": path, "oldText": None, "newText": content}],
    })

    decision = self.peer.request("session/request_permission", {
      "sessionId": session_id,
      "toolCall": {"toolCallId": tool_call_id},
      "options": [
        {"optionId": "allow", "name": "Allow", "kind": "allow_once"},
        {"optionId": "reject", "name": "Reject", "kind": "reject_once"},
      ],
    })
    outcome = decision["outcome"]
    allowed = outcome["outcome"] == "selected" and outcome["optionId"] == "allow"
    if not allowed:
      self._update(session_id, {
        "sessionUpdate": "tool_call_update",
        "toolCallId": tool_call_id,
        "status": "failed",
      })
      return False

    self.peer.request("fs/write_text_file", {
      "sessionId": session_id,
      "path": path,
      "content": content,
    })
    self._update(session_id, {
      "sessionUpdate": "tool_call_update",
      "toolCallId": tool_call_id,
      "status": "completed",
    })
    return True


if __name__ == "__main__":
  ScriptedAgent().run()
