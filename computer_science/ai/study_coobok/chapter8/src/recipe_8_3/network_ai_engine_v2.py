"""책의 Recipe 8.3 — Enhanced Network AI engine v2.

8.2 위에 topology(연결관계) + templates(설정 템플릿) + impact(영향 분석) 컨텍스트를
얹는다. 책의 코드를 거의 그대로 두되 모델 기본값만 gpt-4.1-nano 로,
mock_data 경로는 chapter 루트의 공유 폴더로 바꾼다.
"""
import json
import os
from pathlib import Path

import openai
from dotenv import load_dotenv

load_dotenv()

MOCK_DIR = Path(__file__).resolve().parents[2] / "mock_data"


class EnhancedNetworkCopilot:
  def __init__(self, model_name=None):
    self.conversation = []
    self.current_device = None
    self.model_name = model_name or os.environ.get("OPENAI_MODEL", "gpt-4.1-nano")
    self.load_all_data()

  def load_all_data(self):
    with open(MOCK_DIR / "devices.json") as f:
      self.devices = json.load(f)
    with open(MOCK_DIR / "network_context.json") as f:
      self.network_context = json.load(f)
    with open(MOCK_DIR / "topology.json") as f:
      self.topology = json.load(f)
    with open(MOCK_DIR / "templates.json") as f:
      self.templates = json.load(f)

  def get_device_relationships(self, device_name):
    if device_name not in self.topology["connections"]:
      return {}
    relationships = {}
    for local_iface, conn in self.topology["connections"][device_name].items():
      relationships[conn["connects_to"]] = {
        "local_interface": local_iface,
        "remote_interface": conn["interface"],
        "connection_type": conn.get("vlan", conn.get("subnet", "unknown")),
      }
    return relationships

  def find_affected_devices(self, device_name):
    affected = set()
    affected.update(self.get_device_relationships(device_name).keys())
    for service, devices in self.topology["dependencies"].items():
      if device_name in devices:
        affected.update(devices)
    affected.discard(device_name)
    return list(affected)

  def get_configuration_template(self, config_type, device_type):
    for template_name, template_info in self.templates["configurations"].items():
      if config_type in template_name and device_type in template_info.get("device_types", []):
        return template_info
    return None

  def analyze_network_impact(self, device_name, proposed_change):
    analysis = {
      "affected_devices": self.find_affected_devices(device_name),
      "services_impacted": [],
      "recommendations": [],
    }
    for service, devices in self.topology["dependencies"].items():
      if device_name in devices:
        analysis["services_impacted"].append(service)
    if analysis["affected_devices"]:
      analysis["recommendations"].append(
        f"Changes to {device_name} may affect: {', '.join(analysis['affected_devices'])}"
      )
    if analysis["services_impacted"]:
      analysis["recommendations"].append(
        f"Services that may be impacted: {', '.join(analysis['services_impacted'])}"
      )
    return analysis

  def build_enhanced_context(self, message, intent):
    parts = []
    device_context = self.get_device_context(message)
    if device_context != "Standard network":
      parts.append(device_context)
    if self.current_device:
      relationships = self.get_device_relationships(self.current_device)
      if relationships:
        connections = [
          f"{remote} via {info['local_interface']}"
          for remote, info in relationships.items()
        ]
        parts.append(f"Connected to: {', '.join(connections)}")
    if intent == "configuration" and self.current_device:
      device_type = self.devices[self.current_device]["type"]
      msg_lower = message.lower()
      for config_type in ("ospf", "vlan", "trunk", "access", "bgp"):
        if config_type in msg_lower:
          template = self.get_configuration_template(config_type, device_type)
          if template:
            parts.append(f"Template available: {template['template']}")
            parts.append(f"Required variables: {', '.join(template['variables'])}")
          break
    standards = self.templates.get("standards", {})
    if "security" in message.lower():
      security_features = standards.get("security", {}).get("required_features", [])
      if security_features:
        parts.append(f"Security requirements: {', '.join(security_features)}")
    return " | ".join(parts) if parts else "Standard network"

  def get_device_context(self, message):
    msg = message.lower()
    parts = []
    for device_name, device_info in self.devices.items():
      if device_name.lower() in msg:
        self.current_device = device_name
        parts.append(f"Device: {device_name}")
        parts.append(f"Type: {device_info['type']} ({device_info['model']})")
        parts.append(f"Location: {device_info['location']}")
        parts.append(f"Protocols: {', '.join(device_info['protocols'])}")
        break
    return " | ".join(parts) if parts else "Standard network"

  def get_intent(self, message):
    msg = message.lower()
    if "configure" in msg or "create" in msg or "setup" in msg:
      return "configuration"
    if "problem" in msg or "troubleshoot" in msg or "down" in msg or "not working" in msg:
      return "troubleshooting"
    if "explain" in msg or "what is" in msg or "how does" in msg:
      return "explanation"
    return "general"

  def call_openai_with_knowledge(self, message, intent, enhanced_context):
    client = openai.OpenAI()
    impact_analysis = {}
    if self.current_device and intent == "configuration":
      impact_analysis = self.analyze_network_impact(self.current_device, message)

    system_prompt = (
      "You are an expert network engineering assistant with deep knowledge of "
      "network topologies, device relationships, and configuration standards. "
      "Always consider the impact of changes on connected devices and dependent "
      "services. Use provided templates and follow security best practices. "
      "Provide specific, actionable guidance."
    )
    user_prompt = (
      f"Enhanced Network Context: {enhanced_context}\n\n"
      f"User Intent: {intent}\n"
      f"User Message: {message}"
    )
    if impact_analysis and impact_analysis["affected_devices"]:
      user_prompt += (
        "\n\nImpact Analysis:\n"
        f"- Affected devices: {', '.join(impact_analysis['affected_devices'])}\n"
        f"- Services impacted: {', '.join(impact_analysis['services_impacted'])}\n"
        f"- Recommendations: {'; '.join(impact_analysis['recommendations'])}"
      )
    user_prompt += (
      "\n\nProvide specific networking guidance considering device relationships, "
      "templates, and potential impacts."
    )

    response = client.chat.completions.create(
      model=self.model_name,
      messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
      ],
      max_tokens=500,
      temperature=0.1,
    )
    return response.choices[0].message.content

  def chat(self, message):
    intent = self.get_intent(message)
    enhanced_context = self.build_enhanced_context(message, intent)
    response = self.call_openai_with_knowledge(message, intent, enhanced_context)
    self.conversation.append({
      "user": message,
      "response": response,
      "device": self.current_device,
      "intent": intent,
      "relationships": self.get_device_relationships(self.current_device) if self.current_device else {},
    })
    return response


if __name__ == "__main__":
  print("Enhanced Network Co-Pilot with Knowledge Integration")
  print("Type 'quit' to exit, 'topology' to see connections")
  print("=" * 55)

  try:
    copilot = EnhancedNetworkCopilot()
    print("\nAvailable devices:", ", ".join(copilot.devices.keys()))
    print("Try: 'Configure OSPF on R1' or 'What happens if SW1 goes down?'\n")
    while True:
      user_input = input("You: ").strip()
      if user_input.lower() == "quit":
        break
      if user_input.lower() == "topology":
        print("\nNetwork Connections:")
        for device, connections in copilot.topology["connections"].items():
          print(f"  {device}:")
          for interface, conn in connections.items():
            print(f"    {interface} -> {conn['connects_to']} ({conn['interface']})")
        print()
        continue
      if not user_input:
        continue
      try:
        response = copilot.chat(user_input)
        print(f"\nCo-Pilot: {response}")
        if copilot.current_device:
          relationships = copilot.get_device_relationships(copilot.current_device)
          if relationships:
            print(f"\n[{copilot.current_device} is connected to: {', '.join(relationships.keys())}]")
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
