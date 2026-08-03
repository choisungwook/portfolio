# Learned knowledge is plain files, not a graph database

## Decision

The knowledge store is a directory: one `graph.json` (services + edges) and
one markdown doc per service. No Neo4j, no embedded graph database (Kuzu), no
server process. The store sits behind `KnowledgeStore`, so a database can
replace it later without touching the commands.

## Reason

At the scale this tool targets (tens of services, hundreds of edges), every
graph query the debug flow needs is a linear scan that fits in one prompt —
the LLM consumes the rendered text of the whole graph anyway, so Cypher-style
traversal buys nothing. Plain files add capabilities a database would cost
extra to get: the knowledge is reviewable and diffable in git, a wrong edge is
fixable with an editor, and the agent reads the per-service docs directly with
its file tools. Neo4j would add a running container, connection config, and a
setup guide for a user who just wants to point the tool at code. If a system
with hundreds of services shows up, the interface boundary is where a real
graph database goes.
