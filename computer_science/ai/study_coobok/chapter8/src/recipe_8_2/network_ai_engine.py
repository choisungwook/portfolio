"""책의 Recipe 8.2 — Network AI engine v1.

device + network_context + ai_examples 를 prompt에 붙여서
"우리 환경"에 한정된 답을 받게 만든 첫 번째 co-pilot.
모델 기본값만 책의 gpt-4o-mini 에서 gpt-4.1-nano 로 바꾼다.
mock_data는 chapter 루트에 공유로 두고 경로만 그쪽을 가리킨다.
"""
import json
import os
from pathlib import Path

import openai
from dotenv import load_dotenv

load_dotenv()

MOCK_DIR = Path(__file__).resolve().parents[2] / "mock_data"


class NetworkCopilot:
  def __init__(self, model_name=None):
    self.conversation = []
    self.current_device = None
    self.model_name = model_name or os.environ.get("OPENAI_MODEL", "gpt-4.1-nano")
    self.load_data()

  def load_data(self):
    with open(MOCK_DIR / "devices.json") as f:
      self.devices = json.load(f)
    with open(MOCK_DIR / "network_context.json") as f:
      self.network_context = json.load(f)
    with open(MOCK_DIR / "ai_examples.json") as f:
      self.ai_examples = json.load(f)

  def get_intent(self, message):
    msg = message.lower()
    if "configure" in msg or "create" in msg or "setup" in msg:
      return "configuration"
    if "problem" in msg or "troubleshoot" in msg or "down" in msg or "not working" in msg:
      return "troubleshooting"
    if "explain" in msg or "what is" in msg or "how does" in msg:
      return "explanation"
    return "general"

  def get_device_context(self, message):
    msg = message.lower()
    parts = []
    for device_name, device_info in self.devices.items():
      if device_name.lower() in msg:
        self.current_device = device_name
        parts.append(f"Device: {device_name}")
        parts.append(f"Type: {device_info['type']} ({device_info['model']})")
        parts.append(f"Location: {device_info['location']}")
        parts.append(f"IP: {device_info['ip']}")
        parts.append(f"Protocols: {', '.join(device_info['protocols'])}")
        if "vlans" in device_info:
          parts.append(f"VLANs: {', '.join(device_info['vlans'])}")
        if "neighbors" in device_info:
          parts.append(f"Connected to: {', '.join(device_info['neighbors'])}")
        break
    return " | ".join(parts) if parts else "Standard network"

  def get_network_context(self, message):
    msg = message.lower()
    parts = [f"Network: {self.network_context['network_info']['topology']}"]
    if "ospf" in msg:
      parts.append(f"OSPF: {self.network_context['network_info']['routing_protocol']}")
    elif "bgp" in msg:
      parts.append(f"BGP: {self.network_context['network_info']['routing_protocol']}")
    elif "vlan" in msg:
      vlan_info = self.network_context["network_info"]["vlans"]
      parts.append(
        "VLANs configured: "
        + ", ".join(f"{k}={v}" for k, v in vlan_info.items())
      )
    return " | ".join(parts)

  def get_ai_examples(self, message, intent):
    msg = message.lower()
    bucket = self.ai_examples.get(f"{intent}_examples")
    if not bucket:
      return ""
    for topic in ("ospf", "bgp", "vlan"):
      if topic in msg:
        for key, body in bucket.items():
          if topic in key:
            return f"Example approach: {body}"
        break
    return ""

  def call_openai(self, message, intent, device_context, network_context):
    client = openai.OpenAI()
    example_context = self.get_ai_examples(message, intent)
    system_prompt = (
      "You are an expert network engineering assistant with deep knowledge of "
      "Cisco networking equipment and protocols. Provide clear, accurate technical "
      "guidance for network configuration, troubleshooting, and best practices. "
      "Use the provided network context and examples to give specific, actionable advice."
    )
    user_prompt = (
      f"Network Context: {network_context}\n\n"
      f"Device Context: {device_context}\n\n"
      f"{example_context}\n\n"
      f"User Intent: {intent}\n"
      f"User Message: {message}\n\n"
      "Provide specific networking guidance based on the context above. Include "
      "commands, explanations, and best practices as appropriate."
    )
    response = client.chat.completions.create(
      model=self.model_name,
      messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
      ],
      max_tokens=400,
      temperature=0.1,
    )
    return response.choices[0].message.content

  def chat(self, message):
    intent = self.get_intent(message)
    device_context = self.get_device_context(message)
    network_context = self.get_network_context(message)
    response = self.call_openai(message, intent, device_context, network_context)
    self.conversation.append({
      "user": message,
      "response": response,
      "device": self.current_device,
      "intent": intent,
    })
    return response


if __name__ == "__main__":
  print("Network Co-Pilot (OpenAI-powered with Rich Context)")
  print("Type 'quit' to exit")
  print("=" * 50)

  try:
    copilot = NetworkCopilot()
    print("\nAvailable devices:", ", ".join(copilot.devices.keys()))
    print("Try: 'Configure OSPF on R1' or 'Troubleshoot VLAN issues on SW1'\n")
    while True:
      user_input = input("You: ").strip()
      if user_input.lower() == "quit":
        break
      if not user_input:
        continue
      try:
        response = copilot.chat(user_input)
        print(f"\nCo-Pilot: {response}")
        if copilot.current_device:
          info = copilot.devices[copilot.current_device]
          print(f"\n[Working on: {copilot.current_device} - {info['type']} at {info['location']}]")
        print()
      except Exception as e:
        print(f"Error: {e}")
    print(f"\nSession ended. Total conversations: {len(copilot.conversation)}")
  except FileNotFoundError as e:
    print(f"Error: {e}")
    print("mock_data 가 chapter 루트에 있는지 확인하세요.")
  except Exception as e:
    print(f"Setup error: {e}")
    print("Make sure to set OPENAI_API_KEY in .env")
