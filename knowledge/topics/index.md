# Topics

핸즈온을 반복하며 얻은 도메인 통찰을 기록한다. 개별 핸즈온 문서가 "이번 실습에서 한 일"이라면 topic은 "여러 실습을 관통하는 이해"를 담는다.

## 목록

* [Karpenter over-provisioning은 음수 우선순위 placeholder로 노드를 미리 잡아 둔다](karpenter-overprovisioning.md) - 빈 파드를 미리 띄워 노드 대기 시간을 줄이는 패턴의 동작 원리와 비용 대가.
* [Electron 메뉴바 앱은 창 정리와 메뉴바 공간에서 조용히 실패한다](electron-menubar-silent-failures.md) - 앱이 살아 있는데 아무것도 안 보일 때 원인을 코드와 환경으로 갈라내는 방법.
* [macOS 메뉴바 status item은 넓은 자리 차지로만 가릴 수 있고, 노치 뒤에서는 좌표가 있어도 그려지지 않는다](macos-menubar-status-items.md) - 다른 앱의 메뉴바 아이콘을 다루는 세 제약과 실측으로 검증한 우회 방법.
* [hidden 속성으로 감추는 패널은 자기 display 규칙에 조용히 진다](hidden-attribute-loses-to-display.md) - el.hidden이 true인데 패널이 그대로 보일 때의 판정 방법과 시트 한 줄 해결.
* [kgateway의 AI·추론 라우팅은 Envoy data plane을 떠나 agentgateway로 갔다](kgateway-ai-moved-to-agentgateway.md) - InferencePool이 조용히 무시될 때 chart와 ClusterRole로 판정하는 방법.
