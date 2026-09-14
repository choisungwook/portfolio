# 썸네일 프롬프트

akbun-thumbnail-review skill의 시안 브레인스토밍 절차로 만든 썸네일 방향과, 이미지 생성 AI에 넘길 프롬프트다. 영상(글) 주제는 "ECS 네이티브 blue/green을 CodePipeline + CodeBuild(AWS CLI)로 구동하는 배포 파이프라인"이다.

## 시안 브레인스토밍

- 질문
  - 새 버전이 사용자한테 닿기 전에 잡을 수 있나?
  - CodeDeploy 없이 blue/green이 된다고?
  - 롤백하면 도대체 뭐가 되돌아가는 거지?
- 감정
  - 불안: 배포 버튼을 누르는 순간의 "이거 터지면 어쩌지"
  - 안도: 한 번 걸러주는 문이 있다는 신뢰
- 문제 한 구절: "production에 닿기 전에 hook이 한 번 막는다"
- 요소
  - 문제 장치: 파랑(blue)과 초록(green) 두 갈래 길, 초록 길 앞에 서 있는 차단봉 하나. 차단봉이 문제의 주인공
  - 대비 장치: 초록 길 위의 컨테이너 상자에 빨간 X 라벨 (health 503), 파랑 길에는 사용자 아이콘 다수
  - 문구 라벨: 짧게 한 줄. 상단 1/3
  - 서체 톤: 굵은 산세리프, 흰 글자에 검정 외곽선
  - 색: 어두운 남색 배경, 파랑·초록 길, 차단봉과 X만 주황/빨강으로 유일한 난색
  - 조연 인물: 없음. 로고(AWS, ECS) 없음. 얼굴이 문제보다 먼저 읽히면 안 됨
- 방향 A (차단봉): 두 갈래 길 + 초록 길을 막은 차단봉 → "왜 막혔지?" 질문, 안도 / 위쪽 절반: 문구 라벨 + 차단봉 머리
- 방향 B (스위치): 큰 토글 스위치가 blue에서 green으로 반쯤 넘어가다 멈춘 장면, 스위치 위에 물음표 → "넘어가도 되나?" 질문, 불안 / 위쪽 절반: 문구 + 스위치 손잡이
- 방향 C (두 문): 나란한 두 문. 파랑 문은 열려 사용자가 들어가고, 초록 문 앞엔 작은 검문소 → "검문은 뭘 보나?" 질문, 신뢰 / 위쪽 절반: 문구 + 두 문의 윗부분
- 50% 테스트: 세 방향 모두 문구를 상단 1/3에 두고 문제 장치(차단봉, 스위치 손잡이, 검문소 지붕)를 화면 세로 중앙보다 위에 배치한다. 사용자 아이콘과 컨테이너 상자는 아래 절반에 둔다.

방향 A를 기본으로 추천한다. 차단봉 하나가 문제(막힘)를 가장 빨리 읽히게 하고, 컬러 대비(파랑·초록 vs 주황 차단봉)가 요소 수를 늘리지 않는다.

## 문구 후보

| 문구 | 노리는 질문·감정 |
|---|---|
| 배포 전에 한 번 막는다 | 무엇이 막는지 궁금함, 안도 |
| green이 막혔다 | 왜 막혔는지 질문 |
| CodeDeploy 없이 blue/green | 그게 된다고? 놀라움 |
| 사용자는 아직 blue | 안 넘어간 이유에 대한 호기심 |
| 롤백 3초 | 빠름에 대한 신뢰, 진짜인지 의심 |
| 잘못된 배포, 손님은 못 봤다 | 안도, 어떻게 했는지 질문 |

이미지 생성 AI는 한글 렌더링이 불안정하므로 프롬프트에는 문구 자리만 비워 두고, 문구는 생성 뒤 편집 도구로 올린다.

## 이미지 생성 프롬프트

방향 A. 16:9, 1280x720 기준.

```text
YouTube thumbnail, 16:9, flat vector illustration, bold and clean, high contrast, dark navy background.
A road splits into two lanes seen from a low three-quarter angle. Left lane is bright blue, right lane is bright green.
A single large orange-and-white striped barrier gate blocks the green lane, placed slightly above the vertical center of the frame; the barrier is the focal point and the only warm-colored object.
On the green lane behind the barrier, one shipping-container box with a small red X badge.
On the blue lane, a stream of tiny white user icons walking forward, kept in the lower half of the frame.
Top third of the frame is an empty dark area reserved for a text label, no text rendered.
No people, no faces, no logos, no cloud icons, no extra signs. Minimal elements, thick outlines, soft rim light on the barrier.
```

방향 B. 대안.

```text
YouTube thumbnail, 16:9, flat vector illustration, dark navy background, high contrast.
One giant physical toggle switch in the center-upper area, its lever caught halfway between a blue side labeled with a blue dot and a green side labeled with a green dot.
A single large orange question mark floats just above the lever, the only warm color in the image.
Below the switch, in the lower half, a row of small white user icons standing on the blue side.
Top third left empty for a text label, no text rendered.
No faces, no logos, minimal elements, thick outlines, subtle glow on the lever.
```

방향 C. 대안.

```text
YouTube thumbnail, 16:9, flat vector illustration, dark navy background, high contrast.
Two tall doors side by side, upper halves visible above the frame center. Left door is blue and open with light spilling out; right door is green and closed.
In front of the green door, one small orange checkpoint booth with a lowered bar, the only warm-colored object.
Small white user icons queue toward the blue door in the lower half of the frame.
Top third left empty for a text label, no text rendered.
No faces, no logos, minimal elements, thick outlines.
```

## 다음 행동

1. 방향 A 프롬프트로 3~4장 생성하고, 아래 절반을 가린 상태에서 차단봉과 문구 자리가 남는 장을 고른다.
2. 문구 후보 중 2개를 골라 A/B로 올린다. 1순위 "배포 전에 한 번 막는다", 2순위 "green이 막혔다".
3. 생성 결과에 로고나 얼굴이 섞이면 지운다. 실제 아키텍처가 그렇다는 건 남길 이유가 아니다.
