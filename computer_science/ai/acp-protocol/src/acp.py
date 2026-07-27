"""ACP transport: newline-delimited JSON-RPC 2.0 over stdio.

ACP v1 stabilizes exactly one transport. The client launches the agent as a
subprocess and they talk over the agent's stdin/stdout. Both sides can send
requests, so this module is shared by the client and the agent.
"""

import json
import os
import sys
from typing import Any, Callable, Optional, TextIO

Handler = Callable[[str, dict], Any]
TRACE = os.environ.get("ACP_TRACE") == "1"


class AcpError(Exception):
  """A JSON-RPC error returned by the other side."""

  def __init__(self, error: dict) -> None:
    super().__init__(f"{error.get('code')}: {error.get('message')}")
    self.error = error


class Peer:
  """One end of an ACP connection.

  Args:
    reader: text stream carrying messages from the other side.
    writer: text stream carrying messages to the other side.
    handler: called as handler(method, params) for every incoming request and
      notification. Its return value becomes the result of a request.
  """

  def __init__(self, reader: TextIO, writer: TextIO, handler: Handler,
               name: str = "peer") -> None:
    self.reader = reader
    self.writer = writer
    self.handler = handler
    self.name = name
    self._next_id = 0

  def _trace(self, direction: str, line: str) -> None:
    """Dump a raw wire line to stderr when ACP_TRACE=1."""
    if TRACE:
      print(f"[{self.name} {direction}] {line}", file=sys.stderr, flush=True)

  def notify(self, method: str, params: dict) -> None:
    """Send a notification. There is no response, so nothing is returned."""
    self._write({"jsonrpc": "2.0", "method": method, "params": params})

  def request(self, method: str, params: dict) -> Any:
    """Send a request and pump incoming messages until its response arrives.

    Messages that arrive while waiting are dispatched to the handler. That is
    what makes ACP bidirectional: the agent can ask the client to read a file
    in the middle of the client's own session/prompt request.
    """
    self._next_id += 1
    request_id = self._next_id
    self._write({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})

    while True:
      message = self._read()
      if message is None:
        raise ConnectionError(f"peer closed the stream while {method} was pending")
      if message.get("id") == request_id and "method" not in message:
        if "error" in message:
          raise AcpError(message["error"])
        return message.get("result")
      self._dispatch(message)

  def serve(self) -> None:
    """Read and dispatch messages until the other side closes the stream."""
    while True:
      message = self._read()
      if message is None:
        return
      self._dispatch(message)

  def _read(self) -> Optional[dict]:
    line = self.reader.readline()
    if not line:
      return None
    self._trace("recv", line.rstrip())
    return json.loads(line)

  def _write(self, message: dict) -> None:
    # A message must fit on one line: the spec forbids embedded newlines.
    line = json.dumps(message)
    self._trace("send", line)
    self.writer.write(line + "\n")
    self.writer.flush()

  def _dispatch(self, message: dict) -> None:
    method = message.get("method")
    if method is None:
      return  # A response we are no longer waiting for.

    try:
      result = self.handler(method, message.get("params") or {})
    except Exception as exc:  # noqa: BLE001 - the peer needs an answer, not a traceback
      if "id" in message:
        self._write({
          "jsonrpc": "2.0",
          "id": message["id"],
          "error": {"code": -32603, "message": str(exc)},
        })
      return

    if "id" in message:
      self._write({"jsonrpc": "2.0", "id": message["id"], "result": result})


def text_block(text: str) -> dict:
  """Build a text ContentBlock. ACP reuses MCP's ContentBlock shape verbatim."""
  return {"type": "text", "text": text}
