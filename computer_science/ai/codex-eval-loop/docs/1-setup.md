# Codex 평가 루프 환경 준비

이 실습은 API 애플리케이션을 만들지 않아요. 로그인된 Codex CLI를 `codex exec`로 호출하고, Python 표준 라이브러리로 평가 게이트를 실행해요.

## 필요한 도구

- Python 3.11 이상
- `uv`
- Codex CLI
- Codex CLI 로그인

설치 여부와 로그인 상태는 다음 명령으로 확인해요.

```bash
python3 --version
uv --version
codex --version
codex login status
```

## Up

workspace로 이동한 뒤 환경을 준비해요. 외부 Python 패키지는 설치하지 않아요.

```bash
cd computer_science/ai/codex-eval-loop && make up
```

## Down

실습으로 바뀐 후보 코드를 처음 상태로 되돌려요. 가상환경은 남겨 두므로 다시 시작할 때 다운로드가 발생하지 않아요.

```bash
make down
```
