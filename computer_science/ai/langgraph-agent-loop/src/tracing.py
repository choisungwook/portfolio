from rich.console import Console
from rich.panel import Panel
from rich.rule import Rule
from langchain_core.messages import AIMessage, ToolMessage, BaseMessage
import json

console = Console()

def print_graph(graph):
  console.print(Rule("graph structure (mermaid)"))
  print(graph.get_graph().draw_mermaid())


def print_turn_header(question: str):
  console.print(Rule("[bold]turn start[/bold]"))
  console.print(Panel(question, title="[USER] HumanMessage", border_style="white"))


def print_turn(step: int, chunk: dict, accumulated: dict | None = None):
  """한 step(노드 한 번 실행) 결과를 색깔 패널로 출력한다.

  accumulated가 주어지면 누적 메시지 수와 loop iteration 번호를 함께 표시한다.
  """
  for node_name, update in chunk.items():
    messages = update.get("messages", [])
    for msg in messages:
      meta = _meta_line(step, node_name, accumulated)
      if isinstance(msg, AIMessage):
        if msg.tool_calls:
          calls = "\n".join(
            f"  -> {tc['name']}({json.dumps(tc['args'], ensure_ascii=False)})"
            for tc in msg.tool_calls
          )
          body = (
            f"[label] LOOP CONTINUE (reasoning + tool call request)\n\n"
            f"[reasoning]\n{msg.content or '(no text, tool call only)'}\n\n"
            f"[tool_calls]\n{calls}"
          )
          console.print(Panel(body, title=f"AIMessage  {meta}", border_style="cyan"))
        else:
          body = (
            f"[label] TURN END (assistant message — tool_calls 없음 → loop 종료)\n\n"
            f"{msg.content}"
          )
          console.print(Panel(body, title=f"AIMessage (final) {meta}", border_style="green"))
      elif isinstance(msg, ToolMessage):
        body = msg.content
        if len(body) > 1500:
          body = body[:1500] + "\n... (truncated)"
        console.print(Panel(
          f"[label] TOOL RESULT (function_call_output, prompt에 누적됨)\n\n{body}",
          title=f"ToolMessage(name={msg.name}) {meta}",
          border_style="yellow",
        ))


def print_turn_footer(final_state: dict):
  """턴 종료 후 누적 prompt 상태를 요약한다."""
  messages: list[BaseMessage] = final_state.get("messages", [])
  counts = _count_by_type(messages)
  ai_with_tool_calls = sum(
    1 for m in messages if isinstance(m, AIMessage) and m.tool_calls
  )
  ai_final = sum(
    1 for m in messages if isinstance(m, AIMessage) and not m.tool_calls
  )
  loop_iters = ai_with_tool_calls + ai_final
  summary = (
    f"누적 메시지 수: {len(messages)}  ("
    f"Human={counts.get('HumanMessage', 0)}, "
    f"AI(tool_calls)={ai_with_tool_calls}, "
    f"Tool={counts.get('ToolMessage', 0)}, "
    f"AI(final)={ai_final})\n"
    f"loop iteration (= LLM inference 호출 횟수): {loop_iters}\n"
    f"종료 조건: 마지막 AIMessage의 tool_calls가 비어있음 → assistant message로 턴 종료"
  )
  console.print(Panel(summary, title="turn summary", border_style="magenta"))
  console.print(Rule("[bold]turn end[/bold]"))


def _meta_line(step: int, node_name: str, accumulated: dict | None) -> str:
  base = f"step={step} node={node_name}"
  if accumulated is None:
    return base
  msgs = accumulated.get("messages", [])
  return f"{base} accumulated_messages={len(msgs)}"


def _count_by_type(messages: list[BaseMessage]) -> dict[str, int]:
  out: dict[str, int] = {}
  for m in messages:
    name = type(m).__name__
    out[name] = out.get(name, 0) + 1
  return out
