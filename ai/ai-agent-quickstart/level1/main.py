import json
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

MODEL = "gpt-4o-mini"

tools = [
  {
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "Get current weather for a given city",
      "parameters": {
        "type": "object",
        "properties": {
          "city": {
            "type": "string",
            "description": "City name, e.g. Seoul, Tokyo"
          }
        },
        "required": ["city"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "get_exchange_rate",
      "description": "Get exchange rate between two currencies",
      "parameters": {
        "type": "object",
        "properties": {
          "from_currency": {
            "type": "string",
            "description": "Source currency code, e.g. USD"
          },
          "to_currency": {
            "type": "string",
            "description": "Target currency code, e.g. KRW"
          }
        },
        "required": ["from_currency", "to_currency"]
      }
    }
  }
]

FAKE_WEATHER = {
  "Seoul": {"temp": 3, "condition": "cloudy"},
  "Tokyo": {"temp": 8, "condition": "sunny"},
  "New York": {"temp": -2, "condition": "snowy"},
}

FAKE_EXCHANGE_RATES = {
  ("USD", "KRW"): 1350.50,
  ("USD", "JPY"): 149.80,
  ("KRW", "USD"): 0.00074,
}


def get_weather(city: str) -> str:
  data = FAKE_WEATHER.get(city, {"temp": 20, "condition": "unknown"})
  return json.dumps({
    "city": city,
    "temperature": data["temp"],
    "condition": data["condition"],
    "unit": "celsius"
  })


def get_exchange_rate(from_currency: str, to_currency: str) -> str:
  rate = FAKE_EXCHANGE_RATES.get(
    (from_currency, to_currency), 1.0
  )
  return json.dumps({
    "from": from_currency,
    "to": to_currency,
    "rate": rate
  })


TOOL_MAP = {
  "get_weather": get_weather,
  "get_exchange_rate": get_exchange_rate,
}


def execute_tool(name: str, arguments: dict) -> str:
  fn = TOOL_MAP.get(name)
  if not fn:
    return json.dumps({"error": f"Unknown tool: {name}"})
  return fn(**arguments)


def run_agent(user_message: str):
  print(f"\n{'='*50}")
  print(f"[User] {user_message}")
  print(f"{'='*50}")

  messages = [
    {
      "role": "system",
      "content": (
        "You are a helpful assistant. "
        "Use the provided tools to answer user questions. "
        "Answer in Korean."
      )
    },
    {"role": "user", "content": user_message}
  ]

  while True:
    print("\n[Agent] LLM에 요청 중...")
    response = client.chat.completions.create(
      model=MODEL,
      messages=messages,
      tools=tools,
    )

    message = response.choices[0].message
    messages.append(message)

    if message.tool_calls:
      print(f"[Agent] tool 호출 {len(message.tool_calls)}개 감지")

      for tool_call in message.tool_calls:
        name = tool_call.function.name
        args = json.loads(tool_call.function.arguments)
        print(f"  -> {name}({args})")

        result = execute_tool(name, args)
        print(f"  <- {result}")

        messages.append({
          "role": "tool",
          "tool_call_id": tool_call.id,
          "content": result,
        })

      continue

    print(f"\n[Agent Response]\n{message.content}")
    return message.content


if __name__ == "__main__":
  run_agent("서울 날씨 어때?")
  run_agent("USD를 KRW로 바꾸면 환율이 얼마야?")
  run_agent("도쿄 날씨랑 USD-JPY 환율 둘 다 알려줘")
