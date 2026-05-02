from typing import Annotated, TypedDict
from langchain.chat_models import init_chat_model
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from dotenv import load_dotenv
from src.tracing import print_turn, print_turn_header, print_turn_footer, print_graph
import subprocess
import os

load_dotenv()

def _run(cmd: list[str]) -> str:
  try:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
  except subprocess.TimeoutExpired as e:
    return f"ERROR: timeout after {e.timeout}s — {' '.join(cmd)}"
  except FileNotFoundError:
    return f"ERROR: command not found — {cmd[0]} (kind/kubectl 설치 확인)"
  return result.stdout if result.returncode == 0 else f"ERROR: {result.stderr}"

@tool
def kubectl_get_pods() -> str:
  """default namespace의 모든 Pod 목록과 상태를 반환한다."""
  return _run(["kubectl", "get", "pods", "-o", "wide"])

@tool
def kubectl_describe_pod(name: str) -> str:
  """특정 Pod의 상세 정보(이벤트 포함)를 반환한다."""
  return _run(["kubectl", "describe", "pod", name])

@tool
def kubectl_get_events() -> str:
  """default namespace의 최근 이벤트를 시간순으로 반환한다."""
  return _run(["kubectl", "get", "events", "--sort-by=.lastTimestamp"])

class State(TypedDict):
  messages: Annotated[list[BaseMessage], add_messages]

tools = [kubectl_get_pods, kubectl_describe_pod, kubectl_get_events]
llm = init_chat_model(os.getenv("LLM_MODEL", "openai:gpt-4o-mini")).bind_tools(tools)

system_prompt = (
  "당신은 Kubernetes 디버깅 어시스턴트다. "
  "사용자의 표현(예: ErrImagePull)이 실제 상태와 다를 수 있으므로, "
  "도구로 클러스터 상태를 직접 확인한 뒤 답변하라. "
  "근거가 되는 이벤트나 상태를 답변에 함께 인용한다."
)

def call_model(state: State):
  messages = [SystemMessage(content=system_prompt)] + list(state["messages"])
  response = llm.invoke(messages)
  return {"messages": [response]}

def should_continue(state: State) -> str:
  last = state["messages"][-1]
  return "tools" if last.tool_calls else END

graph = (
  StateGraph(State)
  .add_node("call_model", call_model)
  .add_node("tools", ToolNode(tools))
  .add_edge(START, "call_model")
  .add_conditional_edges("call_model", should_continue, {"tools": "tools", END: END})
  .add_edge("tools", "call_model")
  .compile()
)

def main():
  question = "내 nginx 파드가 안 떠요. ErrImagePull인 것 같은데 디버깅 좀 해줘."
  print_graph(graph)
  print_turn_header(question)
  initial = {"messages": [HumanMessage(content=question)]}
  final_state = None
  for step, (mode, payload) in enumerate(graph.stream(
    initial,
    stream_mode=["updates", "values"],
  )):
    if mode == "values":
      final_state = payload
      continue
    print_turn(step, payload, accumulated=final_state)
  print_turn_footer(final_state or initial)

if __name__ == "__main__":
  main()
