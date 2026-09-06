from client.config import lab_config
from client.credentials import certificate_session, helper_command
from client.memory import memory_client, round_trip


def main() -> None:
  """Authenticate with a certificate and verify one Memory write/read/delete cycle."""
  lab = lab_config()
  with certificate_session(helper_command(lab)) as session, memory_client(session) as memory:
    round_trip(memory, lab["memory_id"])
  print("PASS Roles Anywhere -> AgentCore Memory", flush=True)


if __name__ == "__main__":
  main()
