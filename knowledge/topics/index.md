# Topics

핸즈온을 반복하며 얻은 도메인 통찰을 기록한다. 개별 핸즈온 문서가 "이번 실습에서 한 일"이라면 topic은 "여러 실습을 관통하는 이해"를 담는다.

## 목록

* [Karpenter over-provisioning은 음수 우선순위 placeholder로 노드를 미리 잡아 둔다](karpenter-overprovisioning.md) - 빈 파드를 미리 띄워 노드 대기 시간을 줄이는 패턴의 동작 원리와 비용 대가.
* [Electron 메뉴바 앱은 창 정리와 메뉴바 공간에서 조용히 실패한다](electron-menubar-silent-failures.md) - 앱이 살아 있는데 아무것도 안 보일 때 원인을 코드와 환경으로 갈라내는 방법.
* [macOS 메뉴바 status item은 넓은 자리 차지로만 가릴 수 있고, 노치 뒤에서는 좌표가 있어도 그려지지 않는다](macos-menubar-status-items.md) - 다른 앱의 메뉴바 아이콘을 다루는 세 제약과 실측으로 검증한 우회 방법.
* [hidden 속성으로 감추는 패널은 자기 display 규칙에 조용히 진다](hidden-attribute-loses-to-display.md) - el.hidden이 true인데 패널이 그대로 보일 때의 판정 방법과 시트 한 줄 해결.
* [move 클로저가 필드 이름을 대면 Send는 wrapper에 남고 클로저는 필드만 가져간다](move-closure-captures-the-field-not-the-wrapper.md) - unsafe impl Send를 붙였는데도 스레드 경계를 못 넘을 때 캡처 단위를 올려 고치는 방법.
* [업데이트 서명 불일치는 서명과 pubkey의 key ID를 뽑아 갈라낸다](tauri-updater-key-id-mismatch.md) - 읽을 수 없는 secret을 두고 서명한 키와 신뢰하는 키가 같은지 판정하는 방법.
* [crate마다 step을 나눈 verify job은 첫 실패에서 멈추므로 파손 범위를 보여주지 않는다](verify-job-stops-at-the-first-failing-step.md) - CI가 보고한 에러 개수를 파손 전부로 믿지 않고 로컬에서 남은 step을 마저 돌려 범위를 확정하는 방법.
* [NSSplitView의 pane 너비는 divider 위치로 정하고 제약으로 정하지 않는다](nssplitview-width-constraint-fights-the-divider.md) - 드래그가 안 먹는 split view의 원인을 hit 영역과 제약 우선순위로 갈라내고 실측 표로 확정하는 방법.
