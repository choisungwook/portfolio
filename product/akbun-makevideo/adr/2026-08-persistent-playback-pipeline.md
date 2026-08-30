# Keep the playback pipeline through pause

> Runtime setting reconfiguration is superseded by [2026-08-live-playback-reconfiguration.md](./2026-08-live-playback-reconfiguration.md). Play and pause still follow this record.

## Decision

- Native monitor는 session 하나당 decoder, audio mixer, output device를 한 번만 생성
- Pause는 audio callback을 무음으로 바꾸고 scheduler clock만 멈춤
- 정지 상태 편집 반영만 pipeline 재구성

## Reason

- Play와 pause마다 ffmpeg process와 audio stream을 생성·종료하면 teardown 대기가 main thread까지 전파될 수 있음
- 무음 callback은 audio device를 열린 상태로 두면서 ring과 playhead를 모두 정지 가능

## Consequence

- Pause 뒤 다음 play는 새 decoder와 audio device 준비를 기다리지 않음
- 정지 상태 편집 반영은 새 project snapshot이 필요해 pipeline을 한 번 재구성
