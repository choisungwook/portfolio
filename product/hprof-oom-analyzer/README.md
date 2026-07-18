# hprof-oom-analyzer

JVM heap dump(hprof) 파일에서 OOM 원인을 찾는 데스크톱 도구다. Eclipse MAT 같은 범용 분석기 대신, OOM 원인 추적에 실제로 쓰는 기능 4개만 담았다. mac, linux, windows에서 동작하고 Tkinter GUI와 텍스트 리포트 모드를 제공한다.

## 기능

| 기능 | 설명 |
|---|---|
| 클래스별 히스토그램 | 클래스별 객체 수, shallow size, retained size(근사) top-N. 어떤 클래스가 메모리를 제일 먹는지 본다. |
| GC root 경로 | 객체를 GC가 못 치우게 붙잡고 있는 참조 사슬. 사실상 OOM 원인이 여기서 보인다. |
| 큰 단일 객체 탐지 | 1MB 이상 단일 객체 목록. 거대 배열, 캐시 맵을 찾는다. |
| 스레드 스택 | 덤프 시점(OOM 순간)에 각 스레드가 무엇을 실행 중이었는지 본다. |

## retained size 근사 방식

정확한 retained size는 dominator tree가 필요해서 계산이 무겁다. 이 도구는 "그 클래스의 인스턴스를 전부 제거하면 GC root에서 도달 가능한 바이트가 얼마나 줄어드는가"를 BFS로 계산해 근사한다. OOM 원인을 좁히는 용도로는 충분한 정밀도다.

## 실행

uv로 소스에서 바로 실행한다. 인자 없이 실행하면 빈 GUI가 뜨고, 파일 경로를 주면 바로 분석을 시작한다.

```bash
cd product/hprof-oom-analyzer
uv run hprof-oom-analyzer dump.hprof
```

GUI 없이 터미널에서 텍스트 리포트만 보려면 --report를 붙인다.

```bash
uv run hprof-oom-analyzer dump.hprof --report
```

GUI 사용법: 히스토그램 탭이나 1MB 이상 객체 탭에서 행을 더블클릭하면 해당 객체의 GC root 경로 탭으로 이동한다.

## 테스트

tests/synthetic.py가 작은 자바 힙(스레드 → 캐시 홀더 → 2MB byte 배열)을 흉내 낸 hprof 파일을 만들고, 이를 파싱해 4가지 기능을 검증한다.

```bash
uv run pytest
```

## 빌드와 아티팩트

GitHub Actions 워크플로우 build-hprof-oom-analyzer가 ubuntu, macos, windows 3개 러너에서 PyInstaller 단일 실행 파일을 빌드하고 아티팩트(hprof-oom-analyzer-Linux, -macOS, -Windows)로 업로드한다. 로컬 빌드는 다음 명령을 쓴다.

```bash
uv run pyinstaller --onefile --name hprof-oom-analyzer --paths src --collect-submodules hprof_oom_analyzer app.py
```

## 한계

- 파일 전체를 메모리에 올려 파싱하므로 수 GB 덤프는 메모리와 시간이 많이 든다.
- shallow size의 객체/배열 헤더는 근사값(16/20바이트)이다. JVM 설정에 따라 실제와 다를 수 있다.
- HotSpot JVM의 HPROF 1.0.2 형식만 지원한다. Android(ART) hprof는 지원하지 않는다.
