# The relationship graph lives in SQLite, not JSON files or a docker database

## Decision

The learned graph is stored in a single SQLite file (`knowledge/knowledge.db`,
Python stdlib `sqlite3`, proper relational tables). The per-service markdown
docs stay plain files so the debug agent can read them with its file tools.
No database that needs docker (Neo4j, Postgres). This supersedes the first
cut, which kept the graph in one `graph.json`.

## Reason

The graph started as one JSON document, but a single blob gets unwieldy as
the number of services and edges grows — every update rewrites everything and
nothing is queryable without loading it all (raised by the product owner).
SQLite fixes that with zero operational cost: it is one local file, ships in
the Python standard library, writes transactionally so a crashed learn never
half-updates the store, and answers ad-hoc questions with plain SQL. A docker
database would solve the same problem but adds a running container, connection
configuration, and a setup guide for a tool whose install story is currently
"uv tool install" — and at tens of services none of its extra power (Cypher
traversal, concurrent writers) is used, because the debug flow feeds the whole
rendered graph to the LLM anyway. The store stays behind `KnowledgeStore`
speaking graph dicts, so moving to a server database later is one module.
