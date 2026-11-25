# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-11-25

* **Update**: 번들의 OKF 0.2 스펙 사본을 지우고 저장소 루트의 `templates/okf-spec-0.3.md`를 참조하도록 바꾸고, 번들 index의 okf_version을 0.3으로 변경. 0.1 형식 concept 2개의 `timestamp`와 `## Citations`를 `generated`와 `sources`로 변환. 작성자를 알 수 없어 `generated.by`는 `claude-code/unknown`으로 둠.

## 2026-11-08

* **Update**: OKF v0.2 스펙 사본(삭제됨) 0.1 사본을 0.2 원문으로 교체. 0.2부터 timestamp와 Citations 대신 generated와 sources를 씀.

## 2026-09-09

* **Creation**: [graphify 빌더를 reader 밖의 별도 서비스로 분리](decisions/2026-09-graphify-separate-service.md) 결정 기록. Worker 실행 불가와 자격증명 분리 근거.
* **Creation**: [graphify CLI의 입력과 출력 형태](topics/2026-09-graphify-cli-shape.md) 정리. 스크립트 호출에 필요한 명령 순서와 출력 경로.
