"""
Sample Python file for Akbun Theme syntax highlighting test.
Covers: classes, functions, decorators, f-strings, self, type hints, etc.
"""

from dataclasses import dataclass, field
from typing import Optional, List
import os

# Constants
MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30.0
API_URL = "https://api.example.com/v1"


@dataclass
class ServerConfig:
    """Server configuration with sensible defaults."""

    host: str = "0.0.0.0"
    port: int = 8080
    debug: bool = False
    workers: int = 4
    tags: List[str] = field(default_factory=list)


class ConnectionPool:
    """Manages a pool of database connections."""

    _instance: Optional["ConnectionPool"] = None

    def __init__(self, max_size: int = 10):
        self._pool: List = []
        self._max_size = max_size
        self._active = 0

    @classmethod
    def get_instance(cls) -> "ConnectionPool":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def acquire(self) -> object:
        """Acquire a connection from the pool."""
        if self._pool:
            self._active += 1
            return self._pool.pop()
        elif self._active < self._max_size:
            self._active += 1
            return self._create_connection()
        else:
            raise RuntimeError(f"Pool exhausted: {self._active}/{self._max_size}")

    def release(self, conn: object) -> None:
        """Return a connection to the pool."""
        self._active -= 1
        self._pool.append(conn)

    def _create_connection(self) -> object:
        return object()

    def __repr__(self) -> str:
        return f"ConnectionPool(active={self._active}, pooled={len(self._pool)})"

    def __len__(self) -> int:
        return len(self._pool)


def retry(max_attempts: int = MAX_RETRIES):
    """Decorator that retries a function on failure."""

    def decorator(func):
        def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    print(f"Attempt {attempt}/{max_attempts} failed: {e}")
            raise last_error

        return wrapper

    return decorator


@retry(max_attempts=3)
def fetch_data(url: str, timeout: float = DEFAULT_TIMEOUT) -> dict:
    """Fetch data from an API endpoint."""
    # Simulated response
    response = {"status": 200, "data": [1, 2, 3], "url": url}
    is_valid = response["status"] == 200 and len(response["data"]) > 0

    if not is_valid:
        raise ValueError(f"Invalid response from {url}")

    return response


def process_items(items: List[dict]) -> List[str]:
    """Process items using list comprehension and lambda."""
    transform = lambda x: x.get("name", "unknown").upper()
    filtered = [transform(item) for item in items if item.get("active", False)]
    return sorted(filtered)


if __name__ == "__main__":
    config = ServerConfig(port=9090, debug=True, tags=["api", "prod"])
    pool = ConnectionPool.get_instance()

    print(f"Config: {config}")
    print(f"Pool: {pool}")

    data = fetch_data(API_URL)
    env_value = os.environ.get("APP_ENV", "development")
    print(f"Environment: {env_value}, Data: {data}")
