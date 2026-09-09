"""HTTP API for wiki readers and the admin who triggers a sync.

Every route except /health needs a Bearer API key issued by the CLI.
Keys with role admin may also run a sync and build.
"""
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .builder import Runner, build_wiki, default_runner
from .config import Config
from .errors import WikiError
from .index_store import ApiKey, IndexStore
from .reader_client import ReaderClient
from .sync import sync_reader

NO_STORE = {"cache-control": "no-store"}


def create_app(config: Config, run: Runner = default_runner, client: ReaderClient | None = None) -> FastAPI:
  """Build the FastAPI app bound to one data directory."""
  app = FastAPI(title="akbun-wiki", docs_url=None, redoc_url=None, openapi_url=None)
  app.state.config = config
  app.state.run = run
  app.state.client = client
  register_routes(app)
  return app


def open_store(request: Request) -> IndexStore:
  """One store per request; SQLite connections are cheap and not thread-safe."""
  store = IndexStore(request.app.state.config.database)
  try:
    yield store
  finally:
    store.close()


def current_key(request: Request, store: IndexStore = Depends(open_store)) -> ApiKey:
  """Resolve the Bearer key or answer 401."""
  header = request.headers.get("authorization", "")
  if not header.startswith("Bearer ") or len(header) != 7 + 64:
    raise HTTPException(401, "API 키가 필요합니다.")
  key = store.authenticate(header[7:])
  if key is None:
    raise HTTPException(401, "API 키가 유효하지 않습니다.")
  return key


def require_admin(key: ApiKey = Depends(current_key)) -> ApiKey:
  """Only admin keys may change state."""
  if key.role != "admin":
    raise HTTPException(403, "관리자 키가 필요합니다.")
  return key


def register_routes(app: FastAPI) -> None:
  """Attach every route to the app."""

  @app.exception_handler(HTTPException)
  async def http_error(_: Request, error: HTTPException) -> JSONResponse:
    return JSONResponse({"error": error.detail}, status_code=error.status_code, headers=NO_STORE)

  @app.exception_handler(RequestValidationError)
  async def validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
    first = error.errors()[0] if error.errors() else {}
    where = ".".join(str(part) for part in first.get("loc", ()))
    return JSONResponse({"error": f"잘못된 요청입니다: {where or 'input'}"}, status_code=400, headers=NO_STORE)

  @app.get("/health")
  def health() -> dict[str, bool]:
    return {"ok": True}

  @app.get("/api/status")
  def status(store: IndexStore = Depends(open_store), _: ApiKey = Depends(current_key)) -> JSONResponse:
    return JSONResponse(status_payload(store), headers=NO_STORE)

  @app.get("/api/articles")
  def list_articles(store: IndexStore = Depends(open_store), _: ApiKey = Depends(current_key)) -> JSONResponse:
    articles = [{"slug": a.slug, "title": a.title, "updated_at": a.updated_at} for a in store.list_articles()]
    return JSONResponse({"articles": articles}, headers=NO_STORE)

  @app.get("/api/articles/{slug}")
  def get_article(slug: str, store: IndexStore = Depends(open_store), _: ApiKey = Depends(current_key)) -> JSONResponse:
    article = store.get_article(slug)
    if article is None:
      raise HTTPException(404, "문서를 찾을 수 없습니다.")
    return JSONResponse(article.__dict__, headers=NO_STORE)

  @app.get("/api/search")
  def search(q: str = Query(min_length=1, max_length=200), store: IndexStore = Depends(open_store), _: ApiKey = Depends(current_key)) -> JSONResponse:
    results = [{"slug": slug, "title": title, "snippet": snippet} for slug, title, snippet in store.search(q)]
    return JSONResponse({"results": results}, headers=NO_STORE)

  @app.post("/api/sync")
  def sync(request: Request, store: IndexStore = Depends(open_store), _: ApiKey = Depends(require_admin)) -> JSONResponse:
    try:
      return JSONResponse(run_sync_and_build(request.app, store), headers=NO_STORE)
    except WikiError as error:
      raise HTTPException(502, str(error)) from error


def status_payload(store: IndexStore) -> dict[str, Any]:
  """Sync and build state for the status route."""
  return {
    "reader_seq": int(store.get_state("reader_seq", "0")),
    "synced_at": store.get_state("synced_at") or None,
    "built_at": store.get_state("built_at") or None,
    "article_count": int(store.get_state("article_count", "0")),
  }


def run_sync_and_build(app: FastAPI, store: IndexStore) -> dict[str, Any]:
  """Sync the raw mirror and rebuild when anything changed."""
  config: Config = app.state.config
  client = app.state.client or ReaderClient(config)
  result = sync_reader(config, store, client)
  built = 0
  if result.changed_files or not Path(config.wiki_dir).is_dir():
    built = build_wiki(config, store, app.state.run)
  return {"applied": result.applied, "changed_files": result.changed_files, "reader_seq": result.last_seq, "articles": built}
