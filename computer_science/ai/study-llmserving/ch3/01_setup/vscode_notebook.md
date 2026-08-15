# VS Code Notebook 환경 준비

## 대상

- VS Code의 Python 확장과 Jupyter 확장 사용
- JupyterLab 서버 실행 불필요
- `ipykernel`이 설치된 프로젝트 `.venv` 사용
- Python 3.13 사용

## 프로젝트 열기

저장소 루트에서 `ch3` 디렉터리를 VS Code로 연다.

```bash
code computer_science/ai/study-llmserving/ch3
```

Ubuntu는 VS Code Remote SSH로 접속한 뒤 원격 `ch3` 디렉터리를 연다.

- Python 확장과 Jupyter 확장을 `SSH: <host>`에 설치
- 왼쪽 아래에서 `SSH: <host>` 연결 상태 확인
- macOS의 `.venv`가 아닌 Ubuntu의 `.venv` 사용

## Python interpreter 선택

1. `Command Palette` 열기
2. `Python: Select Interpreter` 선택
3. `Python 3.13 (.venv)` 선택
4. 목록에 없으면 `Enter interpreter path` 선택
5. 프로젝트의 `.venv/bin/python` 직접 선택

## Notebook 커널 선택

1. `.ipynb` 파일 열기
2. 오른쪽 위 `Select Kernel` 선택
3. `Select Another Kernel...` 선택
4. `Python Environments` 선택
5. `.venv/bin/python` 또는 `Python 3.13 (.venv)` 선택

## 커널 확인

Notebook 셀에서 Python 환경을 확인한다.

```python
import sys
from pathlib import Path

print(sys.executable)
assert Path(sys.prefix).name == ".venv"
assert sys.version_info[:2] == (3, 13)
```

Ubuntu RTX 환경은 CUDA 접근도 확인한다.

```python
import torch

print(torch.cuda.get_device_name())
assert torch.cuda.is_available()
```

## `.venv` 탐색 문제 해결

macOS 환경의 개발 의존성을 다시 동기화한다.

```bash
uv sync --dev
```

Ubuntu RTX 환경은 GPU 의존성을 포함해 다시 동기화한다.

```bash
uv sync --dev --extra gpu
```

프로젝트 환경에 `ipykernel`이 설치되었는지 확인한다.

```bash
.venv/bin/python -c "import ipykernel; print(ipykernel.__version__)"
```

VS Code의 환경 목록을 갱신한다.

1. `Python Environments: Refresh All Environment Managers` 실행
2. `Developer: Reload Window` 실행
3. Notebook에서 `Select Another Kernel...`로 다시 선택
4. 그래도 없으면 `.venv/bin/python` 경로 직접 선택

자동 탐색이 계속 실패할 때만 커널을 명시적으로 등록한다.

```bash
uv run python -m ipykernel install \
  --user \
  --name study-llmserving-ch3 \
  --display-name "Python 3.13 (study-llmserving-ch3)"
```

등록 후 Notebook의 `Select Kernel`에서 `Python 3.13 (study-llmserving-ch3)`를 선택한다.

## 참고

- [uv의 VS Code Jupyter 연결](https://docs.astral.sh/uv/guides/integration/jupyter/)
- [VS Code의 Jupyter kernel 선택](https://code.visualstudio.com/docs/datascience/jupyter-kernel-management)
- [VS Code의 Python 환경 선택](https://code.visualstudio.com/docs/python/environments)
