"""v2: 장비 종류에 따라 system prompt를 다르게 조립한다.

원본(ch07/main_v2.py)에서 device_type 분기를 가져온다.
같은 질문이라도 cisco / juniper / arista / palo alto에 따라 답이 달라진다는 걸 보여주는 것이 목적이다.
"""
import os

import streamlit as st
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-nano")

DEVICE_HINTS = {
  "generic": "Provide vendor-neutral network guidance.",
  "cisco": "Focus on Cisco IOS/IOS-XE commands. Provide specific 'show' and 'configure' commands.",
  "juniper": "Focus on Junos commands. Use 'show' and 'set' command formats.",
  "arista": "Focus on Arista EOS commands. Use EOS-specific features and commands.",
  "palo alto": "Focus on Palo Alto firewall commands and web interface guidance.",
}


def build_system_prompt(device_type: str) -> str:
  base = "You are a network engineer assistant. "
  hint = DEVICE_HINTS.get(device_type, DEVICE_HINTS["generic"])
  return base + hint + " Give concise, practical answers with specific commands when relevant."


st.set_page_config(page_title="Network AI v2", page_icon="🌐")
st.title("🌐 Network AI Assistant — v2 device-aware")
st.caption(f"model: `{MODEL}` · device-aware system prompt")

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
  st.error("OPENAI_API_KEY 환경변수가 비어 있습니다.")
  st.stop()

client = OpenAI(api_key=api_key)

device_type = st.selectbox("Device type", list(DEVICE_HINTS.keys()))
question = st.text_area("네트워크 질문", placeholder="e.g., Show me how to configure an OSPF area.")

if st.button("Get AI Answer", type="primary") and question:
  system_prompt = build_system_prompt(device_type)
  with st.expander("실제로 모델에 보낸 system prompt 보기"):
    st.code(system_prompt)

  with st.spinner("..."):
    response = client.chat.completions.create(
      model=MODEL,
      messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": question},
      ],
      max_tokens=250,
    )
  st.markdown(f"### Answer ({device_type})")
  st.write(response.choices[0].message.content)
