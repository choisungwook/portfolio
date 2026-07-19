---
type: Decision
title: mac 배포는 서명 없이 xattr 안내로 대응
description: 코드 서명과 notarization 없이 GitHub Release로 배포하고, Gatekeeper의 damaged 오류는 release notes의 xattr 안내로 해결한다.
tags: [macos, electron-builder, release]
timestamp: 2026-07-19T00:00:00Z
---

## 결정

CI 빌드는 코드 서명 없이 배포한다. mac에서 나는 "damaged and can't be opened" 오류는 release notes와 README 트러블슈팅에 xattr -cr 안내를 넣어 대응한다.

## 이유

- 서명 없는 앱에 macOS quarantine 속성이 붙으면 Gatekeeper가 손상된 앱으로 표시한다. 앱 자체 문제가 아니라 xattr -cr로 quarantine을 지우면 실행된다.
- 근본 해결은 Developer ID 서명 + notarization인데 둘 다 Apple Developer Program(연 99달러) 가입이 전제다. 학습용 개인 도구에는 비용 대비 과하다.
- ad-hoc 서명(무료)은 인터넷에서 내려받은 앱의 quarantine 검사를 통과하지 못해 배포용 우회가 되지 않는다.
- 실제 배포 제품으로 키우면 그때 가입한다. electron-builder가 CSC_LINK, CSC_KEY_PASSWORD와 mac.notarize 설정으로 서명·notarization 자동화를 지원하므로 워크플로우 변경 부담은 작다.
