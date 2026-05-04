import sys

from .copilot import NetworkCopilot

BANNER = """\
=============================================
 Network Co-Pilot (AI Networking Cookbook 8)
 type 'quit' to exit, 'topology' for graph
=============================================
"""


def chat() -> int:
  print(BANNER)
  try:
    copilot = NetworkCopilot.bootstrap()
  except Exception as e:
    print(f"[setup error] {e}", file=sys.stderr)
    return 1

  print("Devices:", ", ".join(copilot.knowledge.devices.keys()))
  print("Try: 'Configure OSPF on R1' or 'Troubleshoot VLAN issue on SW1'\n")

  while True:
    try:
      user_input = input("you> ").strip()
    except (EOFError, KeyboardInterrupt):
      print()
      break

    if not user_input:
      continue
    if user_input.lower() == "quit":
      break
    if user_input.lower() == "topology":
      _print_topology(copilot)
      continue

    try:
      record = copilot.ask(user_input)
    except Exception as e:
      print(f"[error] {e}")
      continue

    print(f"\n[intent={record.intent}, device={record.device or '-'}]")
    print(f"co-pilot> {record.response}\n")

  print(f"\nturns: {len(copilot.history)}")
  return 0


def _print_topology(copilot: NetworkCopilot) -> None:
  print("\nTopology connections:")
  for device, ports in copilot.knowledge.topology.get("connections", {}).items():
    print(f"  {device}:")
    for local_iface, info in ports.items():
      print(f"    {local_iface} -> {info['connects_to']} ({info['interface']})")
  print()


if __name__ == "__main__":
  raise SystemExit(chat())
