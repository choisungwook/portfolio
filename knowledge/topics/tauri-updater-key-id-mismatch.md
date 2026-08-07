---
type: Topic
title: 업데이트 서명 불일치는 서명과 pubkey의 key ID를 뽑아 갈라낸다
description: Tauri 업데이터가 서명을 거부할 때 secret의 private key와 conf의 pubkey가 딴 키인지 확인하는 방법과, 확인된 뒤 남는 선택지.
tags: [tauri, release, github-actions]
timestamp: 2026-08-07T00:00:00Z
---

## 왜 갈라내야 하는가

업데이터가 서명을 거부하면 원인 후보가 둘이다. 서명 파일이 깨졌거나, 서명한 키와 앱이 신뢰하는 키가 애초에 다른 키다. 둘의 처방이 정반대라 짐작으로 재배포하면 같은 실패를 반복한다.

private key는 GitHub secret에 들어가면 다시 읽을 수 없으므로 키를 꺼내서 비교하는 길은 없다. 대신 minisign 형식이 양쪽에 key ID를 박아 둔다.

## 비교 방법

두 값 모두 base64 안에 minisign 텍스트가 들어 있고, 그 두 번째 줄을 다시 base64 디코딩하면 앞 2바이트가 알고리즘, 이어지는 8바이트가 리틀엔디언 key ID다.

- 서명: 릴리스의 latest.json에서 platforms 아래 signature
- pubkey: tauri.conf.json의 plugins.updater.pubkey

```python
import base64, binascii
raw = base64.b64decode(base64.b64decode(value).decode().splitlines()[1])
print(binascii.hexlify(raw[2:10][::-1]).decode().upper())
```

두 ID가 다르면 secret의 키와 conf의 pubkey가 딴 키다. 알고리즘 자리가 서명은 ED, pubkey는 Ed로 갈리는 것은 정상이다. 서명이 prehashed라서 그렇지 불일치가 아니다.

## 갈렸다면

conf의 pubkey에 맞는 private key가 손에 없다면 되돌릴 방법이 없다. 새 키쌍을 만들어 secret과 conf를 함께 갱신하는 것이 유일한 진행 방향이고, 이미 설치된 사용자는 옛 pubkey를 들고 있으므로 어느 쪽으로도 자동 업데이트가 닿지 않는다. 그들에게는 설치본을 다시 받는 안내가 필요하다.

secret 갱신과 conf 갱신은 반드시 같이 간다. 한쪽만 바꾸면 릴리스는 초록불로 끝나고 불일치만 새 키로 옮겨 간다. 그래서 private key 파일은 secret 말고 다른 곳에도 남겨 둔다. secret은 백업이 아니다.
