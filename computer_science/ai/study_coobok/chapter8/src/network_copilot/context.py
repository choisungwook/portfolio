from dataclasses import dataclass
from typing import Any

from .data import NetworkKnowledge

CONFIG_TYPES = ("ospf", "vlan", "trunk", "access", "bgp")


@dataclass
class ContextBundle:
  device: str | None
  device_summary: str
  topology_summary: str
  template_hint: str
  impact_summary: str
  example_hint: str

  def to_prompt(self) -> str:
    sections = [s for s in (
      self.device_summary,
      self.topology_summary,
      self.template_hint,
      self.impact_summary,
      self.example_hint,
    ) if s]
    return "\n".join(sections) if sections else "Standard network — no specific device matched."


def build_context(message: str, intent: str, kb: NetworkKnowledge) -> ContextBundle:
  device_id = _match_device(message, kb.devices)
  return ContextBundle(
    device=device_id,
    device_summary=_device_summary(device_id, kb.devices),
    topology_summary=_topology_summary(device_id, kb.topology),
    template_hint=_template_hint(message, intent, device_id, kb.devices, kb.templates),
    impact_summary=_impact_summary(device_id, kb.topology),
    example_hint=_example_hint(message, intent, kb.examples),
  )


def _match_device(message: str, devices: dict[str, Any]) -> str | None:
  msg = message.lower()
  for name in devices:
    if name.lower() in msg:
      return name
  return None


def _device_summary(device_id: str | None, devices: dict[str, Any]) -> str:
  if not device_id:
    return ""
  d = devices[device_id]
  parts = [
    f"Device: {device_id}",
    f"Type: {d['type']} ({d.get('model', 'unknown')})",
    f"Location: {d.get('location', 'n/a')}",
    f"Protocols: {', '.join(d.get('protocols', []))}",
  ]
  return "[Device] " + " | ".join(parts)


def _topology_summary(device_id: str | None, topology: dict[str, Any]) -> str:
  if not device_id:
    return ""
  connections = topology.get("connections", {}).get(device_id)
  if not connections:
    return ""
  links = [f"{local} -> {info['connects_to']} ({info['interface']})"
           for local, info in connections.items()]
  return "[Topology] " + " ; ".join(links)


def _template_hint(message: str, intent: str, device_id: str | None,
                   devices: dict[str, Any], templates: dict[str, Any]) -> str:
  if intent != "configuration" or not device_id:
    return ""
  device_type = devices[device_id]["type"]
  msg = message.lower()
  configs = templates.get("configurations", {})
  for cfg_type in CONFIG_TYPES:
    if cfg_type not in msg:
      continue
    for tpl_name, tpl in configs.items():
      if cfg_type in tpl_name and device_type in tpl.get("device_types", []):
        return (f"[Template] {tpl_name}: {tpl['template']} "
                f"(vars: {', '.join(tpl['variables'])})")
  return ""


def _impact_summary(device_id: str | None, topology: dict[str, Any]) -> str:
  if not device_id:
    return ""
  affected: set[str] = set()
  for local_iface, info in topology.get("connections", {}).get(device_id, {}).items():
    affected.add(info["connects_to"])
  for service, devices in topology.get("dependencies", {}).items():
    if device_id in devices:
      affected.update(devices)
  affected.discard(device_id)
  return f"[Impact] changes may affect: {', '.join(sorted(affected))}" if affected else ""


def _example_hint(message: str, intent: str, examples: dict[str, Any]) -> str:
  msg = message.lower()
  bucket = examples.get(f"{intent}_examples")
  if not bucket:
    return ""
  for topic in ("ospf", "bgp", "vlan"):
    if topic not in msg:
      continue
    for key, body in bucket.items():
      if topic in key:
        return f"[Example] {body.splitlines()[0]}"
  return ""
