"""v3: SQLite로 질문/답을 영구 저장한다.

원본(ch07/main_v3.py)이 SQLAlchemy + SQLite로 추가했던 history를 가져온다.
컨테이너를 재시작해도 과거 대화가 보존된다는 점이 v2와의 차이다.
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


def build_system_prompt(device_type: str) -> str:
  base = "You are a network engineer assistant. "
  hint = DEVICE_HINTS.get(device_type, DEVICE_HINTS["generic"])
  return base + hint + " Give concise, practical answers with specific commands."


st.set_page_config(page_title="Network AI v3", page_icon="🌐")
st.title("🌐 Network AI Assistant — v3 + history (SQLite)")
st.caption(f"model: `{MODEL}` · DB: `{DB_PATH}`")

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
  st.error("OPENAI_API_KEY 환경변수가 비어 있습니다.")
  st.stop()

client = OpenAI(api_key=api_key)
conn = init_db()

device_type = st.selectbox("Device type", list(DEVICE_HINTS.keys()))
question = st.text_area("네트워크 질문")

if st.button("Get AI Answer", type="primary") and question:
  with st.spinner("..."):
    response = client.chat.completions.create(
      model=MODEL,
      messages=[
        {"role": "system", "content": build_system_prompt(device_type)},
        {"role": "user", "content": question},
      ],
      max_tokens=250,
    )
  answer = response.choices[0].message.content
  conn.execute(
    "INSERT INTO questions(question, answer, device_type, ts) VALUES (?, ?, ?, ?)",
    (question, answer, device_type, datetime.utcnow().isoformat(timespec="seconds")),
  )
  conn.commit()

  st.markdown(f"### Answer ({device_type})")
  st.write(answer)

st.divider()
st.subheader("최근 대화 (latest 10)")
rows = conn.execute(
  "SELECT ts, device_type, question, answer FROM questions ORDER BY id DESC LIMIT 10"
).fetchall()
if not rows:
  st.info("아직 저장된 질문이 없습니다.")
for ts, dev, q, a in rows:
  with st.expander(f"[{ts}] ({dev}) {q[:60]}"):
    st.markdown("**Q:** " + q)
    st.markdown("**A:** " + a)
