import ast
import operator
import os
from datetime import datetime
from typing import Annotated

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing_extensions import TypedDict

SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
}


def safe_eval(expr: str) -> float:
    tree = ast.parse(expr, mode="eval")
    return _eval_node(tree.body)


def _eval_node(node: ast.expr) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp):
        left = _eval_node(node.left)
        right = _eval_node(node.right)
        op_func = SAFE_OPERATORS.get(type(node.op))
        if op_func is None:
            raise ValueError(f"지원하지 않는 연산자: {type(node.op).__name__}")
        return op_func(left, right)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -_eval_node(node.operand)
    raise ValueError(f"지원하지 않는 표현식: {type(node).__name__}")


@tool
def calculator(expression: str) -> str:
    """간단한 수학 계산을 수행합니다. expression: 계산할 수식 (예: '2 + 3 * 4')"""
    try:
        result = safe_eval(expression)
        return str(result)
    except Exception as e:
        return f"계산 오류: {e}"


@tool
def get_current_time() -> str:
    """현재 시간을 반환합니다"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@tool
def search_knowledge(query: str) -> str:
    """내부 지식베이스에서 정보를 검색합니다. query: 검색할 키워드"""
    knowledge_base = {
        "kubernetes": "Kubernetes는 컨테이너 오케스트레이션 플랫폼입니다. Pod, Service, Deployment 등의 리소스를 관리합니다.",
        "docker": "Docker는 컨테이너 런타임입니다. 애플리케이션을 컨테이너로 패키징하고 실행합니다.",
        "terraform": "Terraform은 IaC(Infrastructure as Code) 도구입니다. HCL로 인프라를 선언적으로 관리합니다.",
        "aws": "AWS(Amazon Web Services)는 클라우드 컴퓨팅 플랫폼입니다.",
    }
    for key, value in knowledge_base.items():
        if key in query.lower():
            return value
    return f"'{query}'에 대한 정보를 찾을 수 없습니다."


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]


def build_graph():
    tools_list = [calculator, get_current_time, search_knowledge]
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        api_key=os.getenv("OPENAI_API_KEY"),
    ).bind_tools(tools_list)

    def agent_node(state: AgentState):
        response = llm.invoke(state["messages"])
        return {"messages": [response]}

    def should_continue(state: AgentState):
        last_message = state["messages"][-1]
        if last_message.tool_calls:
            return "tools"
        return END

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", ToolNode(tools_list))

    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")

    return graph.compile()


def run_agent(app, user_message: str) -> str:
    print(f"\n사용자: {user_message}")
    print("-" * 50)

    result = app.invoke(
        {
            "messages": [
                SystemMessage(content="당신은 도움을 주는 AI 어시스턴트입니다."),
                HumanMessage(content=user_message),
            ]
        }
    )

    for msg in result["messages"]:
        msg_type = msg.__class__.__name__
        if msg_type == "AIMessage" and msg.content:
            print(f"에이전트: {msg.content}")
        elif msg_type == "AIMessage" and msg.tool_calls:
            for tc in msg.tool_calls:
                print(f"  [도구 호출] {tc['name']}({tc['args']})")
        elif msg_type == "ToolMessage":
            print(f"  [도구 결과] {msg.content}")

    return result["messages"][-1].content


if __name__ == "__main__":
    app = build_graph()

    run_agent(app, "지금 몇 시야?")
    run_agent(app, "123 * 456 + 789를 계산해줘")
    run_agent(app, "kubernetes가 뭔지 알려주고, 현재 시간도 알려줘")
