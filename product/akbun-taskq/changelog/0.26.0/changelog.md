# akbun-taskq 0.26.0

## Removed

- 설정의 사용량 제한 메뉴와 기능을 없앴다. 전체·bot별 시간당 turn 상한과 그것이 걸면 bot 전체를 멈추던 루프 감지가 사라졌다. bot 설정의 시간당 turn 칸, `POST /api/settings/limits`, `taskq api settings_limits`, 설정 파일의 `bots.hourlyTurnsPerAgent`도 없앴다. bot끼리 주고받는 루프는 사이드바의 전체 멈추기로 멈춘다.
- 동시에 일하는 bot 수와 turn당 모델 턴의 기본값은 `taskq.config.json`의 `bots.maxConcurrentTurns`, `bots.turnMaxTurns`로만 정한다. 새 세션으로 넘기는 대화 크기는 100,000 토큰으로 고정했다.

## Changed

- 메인 영역 오른쪽에 여백을 두어 공용 폴더, task 상태보드, 워크플로 등 화면의 내용이 창 오른쪽 가장자리에 붙지 않는다.

## SDK

변경 없음.
