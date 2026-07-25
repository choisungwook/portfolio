---
type: Decision
title: Electron 릴리스 빌드는 macOS만 수행
description: 이 저장소의 Electron 제품 릴리스 workflow는 Windows/Linux 빌드 없이 macOS 빌드만 수행한다.
tags: [github-actions, electron, release]
timestamp: 2026-07-25T00:00:00Z
---

## 결정

product 아래 Electron 앱의 GitHub Actions 릴리스 workflow는 macOS 빌드만 수행하고 dmg만 GitHub Release에 업로드한다. Windows/Linux 빌드 matrix를 만들지 않는다.

## 이유

- 저장소에 물음표가 들어간 파일(aws/site-to-site-vpn/docs/?failover.md)이 있어 Windows 러너에서는 git checkout 자체가 exit 128로 실패한다. 물음표는 Windows 파일명 금지 문자다.
- 주 사용 플랫폼이 macOS라서 Windows/Linux 산출물의 실사용 수요가 없다.
- hprof-oom-analyzer도 같은 이유로 macOS 빌드만 유지하도록 정리했다(PR #527, #529). akbun-gitdesktop도 동일 정책을 따른다.
- 릴리스가 asset 없이 먼저 생성된 채 빌드가 실패할 수 있으므로, 태그 존재 여부가 아니라 릴리스에 dmg asset이 있는지로 빌드 스킵을 판단한다.
