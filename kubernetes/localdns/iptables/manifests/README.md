# manifests

nodelocaldns 본체(SA, ConfigMap, Service, DaemonSet)는 [공식 upstream YAML](https://github.com/kubernetes/kubernetes/raw/master/cluster/addons/dns/nodelocaldns/nodelocaldns.yaml)을 받아 `__PILLAR__*__` placeholder를 sed로 치환해서 사용한다. 자세한 절차는 상위 디렉터리의 `README.md` 핸즈온 섹션 참고.

| 파일 | 설명 |
|---|---|
| `test-pod.yaml` | dig, tcpdump가 포함된 netshoot 테스트 pod |
