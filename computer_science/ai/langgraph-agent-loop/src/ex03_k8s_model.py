from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
import os

load_dotenv()

def main():
  llm = init_chat_model(os.getenv("LLM_MODEL", "openai:gpt-4o-mini"))
  question = "내 nginx 파드가 안 떠요. ErrImagePull인 것 같은데 디버깅 좀 해줘."
  print(f"[USER] {question}")
  response = llm.invoke(question)
  print(f"[ASSISTANT] {response.content}")

if __name__ == "__main__":
  main()
