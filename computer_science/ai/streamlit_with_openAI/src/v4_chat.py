"""v4: 대화형 chat UI + 멀티턴 컨텍스트.

원본(ch07/main_v4.py)은 v3에 HTML 폼 UI를 더했다.
Streamlit은 UI가 기본이라 대신 v4의 차별점을 "멀티턴 대화 + 이전 대화를 prompt에 누적"으로 잡는다.
즉 v3까지는 매 질문이 독립이었지만, v4부터는 모델이 직전 대화를 보고 이어서 답한다.
"""
import os
import sqlite3
from datetime import datetime
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-nano")
DB_PATH = Path(os.getenv("DB_PATH", "/data/questions.db"))

DEVICE_HINTS = {
  "generic": "Provide vendor-neutral network guidance.",
  "cisco": "Focus on Cisco IOS/IOS-XE commands.",
  "juniper": "Focus on Junos commands.",
  "arista": "Focus on Arista EOS commands.",
  "palo alto": "Focus on Palo Alto firewall commands.",
}


def init_db() -> sqlite3.Connection:
  DB_PATH.parent.mkdir(parents=True, exist_ok=True)
  conn = sqlite3.connect(DB_PATH, check_same_thread=False)
  conn.execute(
    """
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT,
      answer TEXT,
      device_type TEXT,
      ts TEXT
    )
    """
  )
  conn.commit()
  return conn


def system_prompt(device_type: str) -> str:
  base = "You are a network engineer assistant. "
  hint = DEVICE_HINTS.get(device_type, DEVICE_HINTS["generic"])
  return base + hint + " Give concise, practical answers with specific commands."


st.set_page_config(page_title="Network AI v4", page_icon="🌐")
st.title("🌐 Network AI Assistant — v4 chat")
st.caption(f"model: `{MODEL}` · multi-turn chat · history persisted to `{DB_PATH}`")

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
  st.error("OPENAI_API_KEY 환경변수가 비어 있습니다.")
  st.stop()

client = OpenAI(api_key=api_key)
conn = init_db()

with st.sidebar:
  st.header("Settings")
  device_type = st.selectbox("Device type", list(DEVICE_HINTS.keys()))
  if st.button("Reset chat"):
    st.session_state.pop("messages", None)
    st.rerun()
  st.divider()
  st.subheader("DB history (latest 10)")
  rows = conn.execute(
    "SELECT ts, device_type, question FROM questions ORDER BY id DESC LIMIT 10"
  ).fetchall()
  for ts, dev, q in rows:
    st.caption(f"[{ts}] ({dev}) {q[:50]}")

if "messages" not in st.session_state:
  st.session_state.messages = []

for msg in st.session_state.messages:
  with st.chat_message(msg["role"]):
    st.markdown(msg["content"])

if prompt := st.chat_input("Ask a network question..."):
  st.session_state.messages.append({"role": "user", "content": prompt})
  with st.chat_message("user"):
    st.markdown(prompt)

  api_messages = [{"role": "system", "content": system_prompt(device_type)}]
  api_messages.extend(st.session_state.messages)

  with st.chat_message("assistant"):
    with st.spinner("..."):
      response = client.chat.completions.create(
        model=MODEL,
        messages=api_messages,
        max_tokens=400,
      )
    answer = response.choices[0].message.content
    st.markdown(answer)

  st.session_state.messages.append({"role": "assistant", "content": answer})
  conn.execute(
    "INSERT INTO questions(question, answer, device_type, ts) VALUES (?, ?, ?, ?)",
    (prompt, answer, device_type, datetime.utcnow().isoformat(timespec="seconds")),
  )
  conn.commit()
