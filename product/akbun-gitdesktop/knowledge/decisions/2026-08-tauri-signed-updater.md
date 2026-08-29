---
type: Decision
title: Tauri updater로 서명 검증과 다중 플랫폼 업데이트 통합
description: 수동 dmg 교체를 제거하고 Tauri updater와 제품 전용 키로 업데이트를 검증한다.
tags: [tauri, updater, release, security]
timestamp: 2026-08-29T00:00:00Z
---

# Tauri updater로 서명 검증과 다중 플랫폼 업데이트 통합

## 결정

Tauri 공식 updater가 서명을 확인한 뒤 macOS, Windows, Linux 업데이트를 설치한다.

- 공개키만 tauri.conf.json에 저장
- 개인키는 저장소 밖 백업과 GitHub Actions secret에만 저장
- 제품별 latest.json은 고정 updater release에서 제공

## 이유

수동 dmg 교체는 macOS에서만 동작하고 다운로드 출처를 암호학적으로 검증하지 못한다. Tauri updater는 설치 전에 제품 전용 키의 서명을 검증하고 플랫폼별 설치 흐름을 같은 API로 제공한다.

저장소에는 공개키만 있어도 검증할 수 있다. 개인키는 release workflow에서만 읽으므로 공개 저장소를 복제해도 임의 업데이트를 서명할 수 없다.
