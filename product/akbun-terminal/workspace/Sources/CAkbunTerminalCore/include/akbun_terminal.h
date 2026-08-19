// The C surface of the Rust core. Mirrors core/crates/ffi/src/lib.rs.
//
// Kept by hand rather than generated: five declarations are easier to review
// than a build step, and the round trip test in AkbunTerminalCoreTests fails if
// the two sides drift apart.
//
// Ownership: every char * returned here was allocated by Rust and must be given
// back to akbun_core_string_free. Nothing is freed by the caller directly.

#ifndef AKBUN_TERMINAL_H
#define AKBUN_TERMINAL_H

typedef struct AkbunCore AkbunCore;

AkbunCore *akbun_core_new(void);
void akbun_core_free(AkbunCore *core);

// JSON protocol envelope in, JSON response out. Never null for a non-null core.
char *akbun_core_dispatch(AkbunCore *core, const char *request);

// The next queued event as JSON, or NULL when nothing is waiting.
char *akbun_core_poll_event(AkbunCore *core);

void akbun_core_string_free(char *text);

#endif
