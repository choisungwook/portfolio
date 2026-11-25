# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-11-25

* **Update**: 번들의 OKF 0.2 스펙 사본을 지우고 저장소 루트의 `templates/okf-spec-0.3.md`를 참조하도록 바꾸고, 번들 index의 okf_version을 0.3으로 변경.

## 2026-11-13

* **Update**: [platform_version 명시](decisions/2026-11-explicit-platform-version.md) 결정을 V2 runtime 하나만 만드는 것으로 바꿨다. V1 값은 참고 측정으로 남긴다.
* **Update**: [snapshot 상태 복제와 V1 warm pool](topics/snapshot-copies-state.md)에 warmup hook이 복원 뒤 재초기화에 쓰이지 않는다는 점을 더했다.
* **Creation**: [platform_version 명시](decisions/2026-11-explicit-platform-version.md) 결정 기록. 발표문과 달리 생략 시 V1이 되는 것을 실측해 남긴다.
* **Creation**: [snapshot 상태 복제와 V1 warm pool](topics/snapshot-copies-state.md) 통찰 기록. 문서에 없는 두 동작을 측정으로 확인해 남긴다.
