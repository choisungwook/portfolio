#!/bin/bash
set -e -o pipefail

HOOK_DIR=$(cd "$(dirname "$0")" && pwd) || exit 2
command -v perl >/dev/null 2>&1 || { echo "Commit privacy check requires Perl." >&2; exit 2; }

MATERIAL=$(cat)
printf '%s\n' "$MATERIAL" | bash "$HOOK_DIR/../.claude/hooks/scan-known-secrets.sh"

LOCAL_USER=$(id -un)
PRIVATE_VALUES=$(git config --local --get-all portfolio.privateValue || true)
LOCAL_IDENTIFIERS=$(
  hostname
  if command -v ifconfig >/dev/null 2>&1; then
    ifconfig -a 2>/dev/null | awk '$1 == "inet" || $1 == "inet6" { sub(/%.*/, "", $2); print $2 }' || true
  fi
  if command -v route >/dev/null 2>&1; then
    route -n get default 2>/dev/null | awk '$1 == "gateway:" { print $2 }' || true
  fi
  if command -v ip >/dev/null 2>&1; then
    ip -o addr show 2>/dev/null | awk '$3 == "inet" || $3 == "inet6" { split($4, a, "/"); print a[1] }' || true
    ip -4 route show default 2>/dev/null | awk '$2 == "via" { print $3 }' || true
  fi
)

printf '%s\n' "$MATERIAL" |
  LOCAL_IDENTIFIERS="$LOCAL_IDENTIFIERS" PRIVATE_VALUES="$PRIVATE_VALUES" LOCAL_USER="$LOCAL_USER" perl -e '
    my @values = grep {
      length && !/^(?:localhost(?:\.localdomain)?|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1)$/i
    } split /\n/, $ENV{LOCAL_IDENTIFIERS};
    my @private_values = grep { length } split /\n/, $ENV{PRIVATE_VALUES};
    my $user = $ENV{LOCAL_USER};
    my $identifiers = join "|", map { quotemeta } @values;
    while (<STDIN>) {
      my $line = $_;
      if ((grep { index(lc($line), lc($_)) >= 0 } @private_values)
          || (length($identifiers) && /(?<![\w.-])(?:$identifiers)(?![\w-]|\.[\w-])/i)
          || m{(?:/Users/|/home/|/Volumes/Macintosh HD/Users/)\Q$user\E(?=[/\s"\x27`]|$)}i) {
        print STDERR "Commit blocked: local address, hostname, personal path, or configured private value (value hidden).\n";
        exit 2;
      }
    }
  '
