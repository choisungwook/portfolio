# 트러블슈팅

## 소켓 누수가 재현되지 않는 문제

이전 코드에서 `try-with-resources`를 사용하고 있었기 때문에, 예외가 발생해도 `conn.close()`가 자동 호출되어 소켓이 정상 종료되었다. CONJ-863 버그는 `conn.close()`가 누락되었을 때만 발생하므로, `try-with-resources`를 제거하고 catch 블록에서 `conn.close()`를 의도적으로 빠뜨리는 코드로 수정하여 재현에 성공했다.

## Grafana 대시보드에서 FD 메트릭이 nodata로 표시되는 문제

대시보드가 `process_files_open`으로 쿼리했지만, Spring Boot 2.7.x micrometer가 실제 노출하는 메트릭 이름은 `process_files_open_files`였다. `_files` 접미사가 하나 더 붙어서 매칭되지 않았다. Prometheus(`localhost:9090`)에서 `process`로 검색하여 실제 메트릭 이름을 확인한 뒤, 대시보드 쿼리를 `process_files_open_files` / `process_files_max_files`로 수정하여 해결했다.
