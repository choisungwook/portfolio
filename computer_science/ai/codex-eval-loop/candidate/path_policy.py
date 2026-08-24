def is_safe_repo_path(path: str) -> bool:
  return bool(path) and not path.startswith("/") and ".." not in path
