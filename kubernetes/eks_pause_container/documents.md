1. EKS 버전 1.29를 사용해야 합니다. 이 문제는 EKS 1.29에서 처음 발견되었습니다.
2. AMI 선택:
- Amazon Linux 2 (AL2) 기반 EKS-optimized AMI를 사용해야 합니다.
- 문제가 발생한 시점의 AMI를 사용해야 하므로, 2024년 1월 또는 2월 초에 릴리스된 AMI 버전을 선택하는 것이 좋습니다.
3. containerd 설정:
- 문제의 핵심은 pause container가 pinned로 표시되지 않아 가비지 컬렉션(GC)에 의해 삭제되는 것이었습니다.
containerd 설정에서 pause container를 pinned로 표시하는 패치가 적용되기 전의 설정을 사용해야 합니다.
노드 설정:
4. 노드의 디스크 사용량이 높아지도록 설정하여 GC가 트리거되도록 해야 합니다.
5. 워크로드 실행:
- 노드에 여러 파드를 배포하여 pause container가 사용되도록 합니다.
- 시간이 지남에 따라 GC가 실행되어 pause container 이미지가 삭제되도록 기다립니다.
6. 모니터링:
- kubelet 로그를 모니터링하여 GC 활동과 pause container 삭제를 확인합니다
