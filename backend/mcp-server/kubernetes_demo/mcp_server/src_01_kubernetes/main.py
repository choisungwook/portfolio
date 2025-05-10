from k8s_manager import KubernetesManager
import os

if __name__ == "__main__":
  k8s_manager = KubernetesManager(os.getenv("PROFILE", "local"))
  namespaces = k8s_manager.list_namespaces()
  print(namespaces)
