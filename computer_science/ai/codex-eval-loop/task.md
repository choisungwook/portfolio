# 저장소 상대 경로 검증기 구현

`candidate/path_policy.py`의 `is_safe_repo_path()`를 구현해요.

## 계약

- 입력은 비어 있지 않은 POSIX 상대 경로예요.
- 각 경로 조각은 ASCII 영문자, 숫자, `.`, `_`, `-`만 허용해요.
- `.`과 `..` 조각은 허용하지 않아요.
- 빈 조각, 절대 경로, 역슬래시는 허용하지 않아요.
- `.env`, `.github`, `notes..md`처럼 점이 이름에 포함된 조각은 허용해요.

## 변경 범위

- `candidate/path_policy.py`만 수정해요.
- `cases/`, `scripts/`, `tests/`, `task.md`는 수정하지 않아요.
- `cases/holdout.json`은 읽지 않아요.
