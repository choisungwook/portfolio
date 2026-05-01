from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
import os

load_dotenv()

def main():
  llm = init_chat_model(os.getenv("LLM_MODEL", "openai:gpt-4o-mini"))
  question = "오늘 서울 날씨 어때?"
  print(f"[USER] {question}")
  response = llm.invoke(question)
  print(f"[ASSISTANT] {response.content}")

if __name__ == "__main__":
  main()
