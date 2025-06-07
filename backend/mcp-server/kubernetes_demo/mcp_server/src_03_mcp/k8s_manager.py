import os
from dotenv import load_dotenv
from typing import List
from kubernetes import client, config
from kubernetes.client.rest import ApiException

class KubernetesManager:
  def __init__(self, environment: str = "local"):
    self.environment = environment
    self._load_kube_context()
    self.core_v1_api = client.CoreV1Api()
    print("Info KubernetesManager initialized")

  def _load_kube_context(self):
    """
    환경 변수를 기반으로 Kubernetes 접속 설정을 로드합니다.
    .env.{environment} 파일에서 KUBE_CONFIG_SETUP 값을 읽어옵니다.
    - "local": 로컬 kubeconfig 파일 (~/.kube/config)을 사용합니다.
               KUBE_CONFIG_PATH 환경 변수로 경로를 지정할 수도 있습니다.
    - "dev": 파드 내 서비스 계정 토큰을 사용합니다.
    """
    env_file_path = f".env.{self.environment}"
    if not os.path.exists(env_file_path):
      print(f"Error code 3 {env_file_path} not found")
      raise FileNotFoundError(f"Environment file {env_file_path} not found")

    load_dotenv(dotenv_path=env_file_path, override=True)

    try:
      if self.environment == "local":
        kube_config_path = os.getenv("KUBE_CONFIG_PATH")
        config.load_kube_config(os.path.expanduser(kube_config_path))
      elif self.environment == "dev":
        config.load_incluster_config()
    except config.ConfigException as e:
      print(f"Error code 1 loading kube config: {e}")
      raise e
    except Exception as e:
      print(f"Error code 2 loading kube config: {e}")
      raise e

  async def list_namespaces(self) -> List[str]:
    """
    모든 네임스페이스를 조회합니다.
    Returns:
      list[str]: 네임스페이스 이름의 목록입니다. 네임스페이스가 없으면 빈 목록을 반환합니다.
    Raises:
      ApiException: Kubernetes API 호출 중 오류가 발생한 경우.
    """
    if not self.core_v1_api:
      raise ConnectionError("Error code 4 Kubernetes API is not initialized")

    namespace_names = []

    try:
      namespaces = self.core_v1_api.list_namespace(timeout_seconds=30)
      for ns in namespaces.items:
        namespace_names.append(ns.metadata.name)
      return namespace_names
    except ApiException as e:
      print(f"Error code 5 listing namespaces: {e}")
      raise e
    except Exception as e:
      print(f"Error code 6 listing namespaces: {e}")
      raise e
