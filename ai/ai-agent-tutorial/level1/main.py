import ast
import json
import operator
import os
from datetime import datetime

from openai import OpenAI

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


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "간단한 수학 계산을 수행합니다",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "계산할 수식 (예: '2 + 3 * 4')",
                    }
                },
                "required": ["expression"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_current_time",
            "description": "현재 시간을 반환합니다",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


def calculator(expression: str) -> str:
    try:
        result = safe_eval(expression)
        return str(result)
    except Exception as e:
        return f"계산 오류: {e}"


def get_current_time() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


TOOL_FUNCTIONS = {
    "calculator": calculator,
    "get_current_time": get_current_time,
}


def run_agent(user_message: str) -> str:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    print(f"\n사용자: {user_message}")
    print("-" * 50)

    messages = [
        {
            "role": "system",
            "content": "당신은 도움을 주는 AI 어시스턴트입니다. 필요하면 도구를 사용하세요.",
        },
        {"role": "user", "content": user_message},
    ]

    while True:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOLS,
        )

        message = response.choices[0].message
        messages.append(message)

        if not message.tool_calls:
            print(f"에이전트: {message.content}")
            return message.content

        for tool_call in message.tool_calls:
            name = tool_call.function.name
            args = json.loads(tool_call.function.arguments)

            print(f"  [도구 호출] {name}({args})")

            result = TOOL_FUNCTIONS[name](**args)
            print(f"  [도구 결과] {result}")

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result,
                }
            )


if __name__ == "__main__":
    run_agent("지금 몇 시야?")
    run_agent("123 * 456 + 789는 뭐야?")
    run_agent("현재 시간을 알려주고, 2 + 2도 계산해줘")
