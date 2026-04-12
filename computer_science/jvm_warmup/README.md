# JVM Warm-up Lab

JVM warm-up 효과를 직접 관찰하는 핸즈온 실습이다.

## QuickStart

1. [이론 - docs/theory.md](docs/theory.md)
2. [핸즈온 - docs/hands-on.md](docs/hands-on.md)
3. [앱 아키텍처 - docs/app.md](docs/app.md)
4. [로그 디버깅 - docs/debug-classloading.md](docs/debug-classloading.md)

## 웜업 이론: JVM Class Lazy Loading

- JVM은 시작 후 모든 class를 로드하지 않고, 실행될 때 관련된 class를 로드한다. 이 개념을 Class Lazy Loading이라고 한다.
- 로직이 많을 수록 class개수가 많을 수록 Lazy Loading의 시간이 길어지고, 그만큼 JVM 부팅 이후 첫 요청의 latency가 증가한다.
