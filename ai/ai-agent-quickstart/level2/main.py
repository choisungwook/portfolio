import json
import os
from agents import Agent, Runner, function_tool

os.environ.setdefault("OPENAI_API_KEY", "your-api-key")


@function_tool
def get_weather(city: str) -> str:
  """Get current weather for a given city"""
  fake_data = {
    "Seoul": {"temp": 3, "condition": "cloudy"},
    "Tokyo": {"temp": 8, "condition": "sunny"},
    "New York": {"temp": -2, "condition": "snowy"},
  }
  data = fake_data.get(city, {"temp": 20, "condition": "unknown"})
  return json.dumps({
    "city": city,
    "temperature": data["temp"],
    "condition": data["condition"],
    "unit": "celsius"
  })


@function_tool
def search_restaurant(city: str, cuisine: str) -> str:
  """Search restaurants in a city by cuisine type"""
  fake_data = {
    ("Seoul", "korean"): [
      {"name": "광화문 국밥", "rating": 4.5},
      {"name": "을지로 냉면", "rating": 4.3},
    ],
    ("Tokyo", "japanese"): [
      {"name": "Tsukiji Sushi", "rating": 4.8},
      {"name": "Ramen Ichiran", "rating": 4.6},
    ],
  }
  results = fake_data.get(
    (city, cuisine),
    [{"name": "No results", "rating": 0}]
  )
  return json.dumps(results)


@function_tool
def book_restaurant(restaurant_name: str, people: int, date: str) -> str:
  """Book a restaurant reservation"""
  return json.dumps({
    "status": "confirmed",
    "restaurant": restaurant_name,
    "people": people,
    "date": date,
    "confirmation_code": "RES-2024-001"
  })


weather_agent = Agent(
  name="Weather Agent",
  instructions=(
    "You are a weather specialist. "
    "Use the get_weather tool to answer weather questions. "
    "Provide helpful advice based on weather conditions. "
    "Answer in Korean."
  ),
  tools=[get_weather],
)

restaurant_agent = Agent(
  name="Restaurant Agent",
  instructions=(
    "You are a restaurant recommendation and booking specialist. "
    "Use search_restaurant to find restaurants, "
    "and book_restaurant to make reservations. "
    "Answer in Korean."
  ),
  tools=[search_restaurant, book_restaurant],
)

triage_agent = Agent(
  name="Triage Agent",
  instructions=(
    "You are a travel assistant coordinator. "
    "Determine what the user needs and hand off to the right agent:\n"
    "- Weather questions → Weather Agent\n"
    "- Restaurant search or booking → Restaurant Agent\n"
    "- If the request involves both, handle them sequentially.\n"
    "Answer in Korean."
  ),
  handoffs=[weather_agent, restaurant_agent],
)


async def run_example(query: str):
  print(f"\n{'='*50}")
  print(f"[User] {query}")
  print(f"{'='*50}")

  result = await Runner.run(triage_agent, query)

  print(f"\n[Final Agent] {result.last_agent.name}")
  print(f"[Response]\n{result.final_output}")


if __name__ == "__main__":
  import asyncio

  async def main():
    await run_example("서울 날씨가 어때?")
    await run_example("도쿄에서 일식 맛집 추천해줘")
    await run_example("광화문 국밥 2명 내일 예약해줘")

  asyncio.run(main())
