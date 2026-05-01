from typing import Annotated, TypedDict
from langchain.chat_models import init_chat_model
from langchain_core.messages import BaseMessage, HumanMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from dotenv import load_dotenv
from src.tracing import print_turn, print_turn_header, print_turn_footer, print_graph
import httpx
import os

load_dotenv()

@tool
def get_seoul_weather() -> dict | str:
  """서울의 현재 날씨를 반환한다. 기온(섭씨), 풍속, 날씨 코드를 포함."""
  url = "https://api.open-meteo.com/v1/forecast"
  params = {"latitude": 37.5665, "longitude": 126.9780, "current_weather": "true"}
  try:
    r = httpx.get(url, params=params, timeout=10)
    r.raise_for_status()
    return r.json()["current_weather"]
  except (httpx.HTTPError, KeyError, ValueError) as e:
    return f"ERROR: open-meteo 호출 실패 — {type(e).__name__}: {e}"

class State(TypedDict):
  messages: Annotated[list[BaseMessage], add_messages]

tools = [get_seoul_weather]
llm = init_chat_model(os.getenv("LLM_MODEL", "openai:gpt-4o-mini")).bind_tools(tools)

def call_model(state: State):
  response = llm.invoke(state["messages"])
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
  question = "오늘 서울 날씨 어때?"
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
