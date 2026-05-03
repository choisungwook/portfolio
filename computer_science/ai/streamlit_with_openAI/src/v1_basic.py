"""v1: 가장 단순한 네트워크 엔지니어 어시스턴트.

원본(ch07/main_v1.py)의 의도를 그대로 옮긴다:
질문을 받아 OpenAI에 한 번 보내고 답을 출력한다. 그 외엔 아무것도 하지 않는다.
"""
import os

import streamlit as st
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-nano")
SYSTEM_PROMPT = (
  "You are a network engineer assistant. Give concise, practical answers "
  "about network troubleshooting, configuration, and performance issues."
)

st.set_page_config(page_title="Network AI v1", page_icon="🌐")
st.title("🌐 Network AI Assistant — v1 basic")
st.caption(f"model: `{MODEL}` · single-turn · no memory")

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
  st.error("OPENAI_API_KEY 환경변수가 비어 있습니다. `.env`를 확인하세요.")
  st.stop()

client = OpenAI(api_key=api_key)
question = st.text_area("네트워크 질문", placeholder="e.g., How do I troubleshoot BGP neighbor down?")

if st.button("Get AI Answer", type="primary") and question:
  with st.spinner("..."):
    response = client.chat.completions.create(
      model=MODEL,
      messages=[
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": question},
      ],
      max_tokens=200,
    )
  st.markdown("### Answer")
  st.write(response.choices[0].message.content)
