#!/bin/bash
# Collect outgoing text and screen it locally before it reaches a model.
set -o pipefail

MAX_BYTES=1500000

block() {
  echo "Publication blocked: $1" >&2
  shift
  for line in "$@"; do echo "$line" >&2; done
  exit 2
}

command -v jq >/dev/null 2>&1 || block "jq is not installed, so the command cannot be inspected."

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input | (.command // .cmd // .input // empty)') ||
  block "cannot read the hook input."
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
WORKDIR=$(echo "$INPUT" | jq -r '.tool_input.workdir // empty')
[ -z "$COMMAND" ] && exit 0

# Join backslash-newline continuations so a split `git \<newline> push` still matches.
FLAT=${COMMAND//$'\\\n'/ }
FLAT=$(printf '%s' "$FLAT" | tr '\n\t' '  ')

B='(^|[^[:alnum:]_-])'
S='[[:space:]]+'
E='([[:space:];&|]|$)'
QUOTED="(\"[^\"]*\"|'[^']*'|[^[:space:]]+)"
GIT_PUSH="${B}git(${S}-[^[:space:]]+(${S}${QUOTED})?)*${S}push${E}"
GIT_ALIAS="${B}git${S}.*alias\."
GH_PR_CREATE="${B}gh${S}pr${S}create${E}"
GH_REPO_PUSH="${B}gh${S}repo${S}create${S}.*--push${E}"
GH_TEXT="${B}gh${S}(pr|issue|release|gist|repo|discussion|label|variable|secret)${S}(create|edit|comment|review|merge|close|reopen|upload|rename|set)${E}"
GH_API="${B}gh${S}api${E}"
GH_API_FIELD="${S}(-f|-F|--field|--raw-field|--input|-X|--method)([[:space:]=]|[A-Za-z])"
GH_API_GET="(-X|--method)[[:space:]=]*GET${E}"

COMMITS=0; TEXT=0
[[ "$FLAT" =~ $GIT_PUSH || "$FLAT" =~ $GIT_ALIAS || "$FLAT" =~ $GH_PR_CREATE || "$FLAT" =~ $GH_REPO_PUSH ]] && COMMITS=1
[[ "$FLAT" =~ $GH_TEXT ]] && TEXT=1
if [[ "$FLAT" =~ $GH_API ]]; then
  if [[ "$FLAT" =~ graphql ]]; then
    [[ "$FLAT" =~ mutation ]] && TEXT=1
  elif [[ "$FLAT" =~ $GH_API_FIELD ]] && ! [[ "$FLAT" =~ $GH_API_GET ]]; then
    TEXT=1
  fi
fi
[ $COMMITS -eq 0 ] && [ $TEXT -eq 0 ] && exit 0

[ -z "$CWD" ] || cd "$CWD" 2>/dev/null || block "cannot access the command's working directory."
[ -z "$WORKDIR" ] || cd "$WORKDIR" 2>/dev/null || block "cannot access the command's working directory."

WORDS=()
while IFS= read -r -d '' word; do
  WORDS+=("$word")
done < <(printf '%s' "$FLAT" | perl -MText::ParseWords=parse_line -ne 'print "$_\0" for grep { defined } parse_line(q{[\s;&|]+}, 0, $_)')
[ "${#WORDS[@]}" -gt 0 ] || block "cannot inspect the publication command."

expand() {
  local p="$1"
  p="${p/#\~/$HOME}"
  p="${p//\$HOME/$HOME}"
  p="${p//\$\{HOME\}/$HOME}"
  p="${p//\$PWD/$PWD}"
  p="${p//\$\{PWD\}/$PWD}"
  printf '%s' "$p"
}

DIRS=(".")
PR_BASE=master
prev=""
for word in "${WORDS[@]}"; do
  case "$prev" in
    -C|cd|--source) DIRS+=("$(expand "$word")") ;;
    --base|-B) PR_BASE=$word ;;
  esac
  case "$word" in
    --base=*) PR_BASE=${word#*=} ;;
    --source=*) DIRS+=("$(expand "${word#*=}")") ;;
  esac
  prev=$word
done

MATERIAL="=== COMMAND ==="$'\n'"$COMMAND"$'\n'

if [ $COMMITS -eq 1 ]; then
  SEEN=""
  for dir in "${DIRS[@]}"; do
    TOP=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || continue
    case "$SEEN" in *"|$TOP|"*) continue ;; esac
    SEEN="$SEEN|$TOP|"
    REFS=(HEAD)
    for word in "${WORDS[@]}"; do
      case "$word" in
        --all|--branches) REFS+=(--branches); continue ;;
        --mirror) REFS+=(--branches --tags); continue ;;
        --tags|--follow-tags) REFS+=(--tags); continue ;;
        :|+:) REFS+=(--branches); continue ;;
        *\*:*\**) REFS+=(--branches --tags); continue ;;
        --head=*) ref=${word#*=} ;;
        -*) continue ;;
        *) ref=$word ;;
      esac
      if [[ "$FLAT" =~ $GH_PR_CREATE ]]; then
        ref=${ref##*:}
        oid=$(git -C "$TOP" rev-parse --verify --quiet --end-of-options "refs/remotes/origin/$ref^{commit}" 2>/dev/null) && REFS+=("$oid")
      else
        ref=${ref%%:*}
        ref=${ref#+}
      fi
      oid=$(git -C "$TOP" rev-parse --verify --quiet --end-of-options "$ref^{commit}" 2>/dev/null) && REFS+=("$oid")
    done

    EXCLUDE=()
    if [[ "$FLAT" =~ $GH_PR_CREATE ]]; then
      oid=$(git -C "$TOP" rev-parse --verify --quiet --end-of-options "refs/remotes/origin/$PR_BASE^{commit}" 2>/dev/null) &&
        EXCLUDE=("$oid")
    elif [[ ! "$FLAT" =~ $GH_REPO_PUSH ]]; then
      branch=$(git -C "$TOP" branch --show-current)
      REMOTE=$(git -C "$TOP" config --get "branch.$branch.pushRemote" ||
        git -C "$TOP" config --get remote.pushDefault ||
        git -C "$TOP" config --get "branch.$branch.remote" || printf origin)
      after_push=0
      skip_arg=0
      for word in "${WORDS[@]}"; do
        if [ "$after_push" -eq 0 ]; then
          [ "$word" != push ] || after_push=1
          continue
        fi
        if [ "$skip_arg" -eq 1 ]; then
          skip_arg=0
          continue
        fi
        case "$word" in
          --repo=*) REMOTE=${word#*=}; break ;;
          --repo) continue ;;
          -o|--push-option|--receive-pack|--exec) skip_arg=1 ;;
          -*) ;;
          *) REMOTE=$word; break ;;
        esac
      done
      EXCLUDE=("--remotes=$REMOTE")
    fi

    # Keep each commit's additions and message so a later deletion cannot hide an earlier disclosure.
    LOG=$(git -C "$TOP" log -m -p --text --no-textconv --no-ext-diff --no-color --unified=0 \
      --format='=== COMMIT %h%nauthor: %an <%ae>%ncommitter: %cn <%ce>%nrefs: %D%nmessage:%n%w(0,4,4)%B' \
      "${REFS[@]}" --not "${EXCLUDE[@]}" -- 2>/dev/null \
      | perl -ne 'print if !/[\x00-\x08\x0e-\x1f]/ && /^(=== COMMIT |author: |committer: |refs: |message:|    |\+)/') ||
      block "cannot read the outgoing Git history."
    MATERIAL+="=== COMMITS ==="$'\n'"$LOG"$'\n'
  done
  [ -n "$SEEN" ] || block "cannot locate the Git repository to review."
fi

if [ $TEXT -eq 1 ]; then
  prev=""
  for word in "${WORDS[@]}"; do
    required=0
    case "$prev:$word" in
      --body-file:*|--notes-file:*|--input:*|*:--body-file=*|*:--notes-file=*|*:--input=*) required=1 ;;
    esac
    prev=$word
    name="${word#*=}"
    name="${name#@}"
    file=$(expand "$name")
    found=0
    for dir in "${DIRS[@]}"; do
      candidate=$file
      [[ "$file" = /* ]] || candidate="$dir/$file"
      [ -f "$candidate" ] || continue
      found=1
      grep -Iq . "$candidate" 2>/dev/null || [ ! -s "$candidate" ] || block "a publication attachment is binary and cannot be reviewed."
      BODY=$(cat "$candidate" 2>/dev/null) || block "cannot read a publication attachment."
      MATERIAL+="=== FILE $name ==="$'\n'"$BODY"$'\n'
      [[ "$file" != /* ]] || break
    done
    [ "$required" -eq 0 ] || [ "$found" -eq 1 ] || block "cannot read an explicit publication file."
  done
fi

MATERIAL_BYTES=$(printf '%s' "$MATERIAL" | wc -c)
[ "$MATERIAL_BYTES" -le "$MAX_BYTES" ] || block "too much material to review in one go."

# --- 1. patterns -------------------------------------------------------------

PATTERNS=(
  'AWS access key id|(AKIA|ASIA)[0-9A-Z]{16}'
  'AWS secret access key|aws_secret_access_key[[:space:]]*[=:][[:space:]]*[A-Za-z0-9/+]{40}'
  'Anthropic key|sk-ant-[A-Za-z0-9_-]{20,}'
  'GitHub token|gh[pousr]_[A-Za-z0-9]{36,}'
  'GitHub fine-grained token|github_pat_[A-Za-z0-9_]{22,}'
  'Slack token|xox[baprs]-[A-Za-z0-9-]{10,}'
  'Google API key|AIza[0-9A-Za-z_-]{35}'
  'private key block|-----BEGIN [A-Z ]*PRIVATE KEY-----'
)
# Account ids in ARNs, except the placeholders AWS documentation uses.
ARN='arn:aws[a-z-]*:[a-z0-9-]*:[a-z0-9-]*:[0-9]{12}:'
ARN_OK='arn:aws[a-z-]*:[a-z0-9-]*:[a-z0-9-]*:(111122223333|123456789012|000000000000|999999999999):'

# Only the two sample credentials from the AWS documentation are exempt.
SCAN=$(echo "$MATERIAL" | LC_ALL=C sed -e 's/AKIAIOSFODNN7EXAMPLE//g' -e 's#wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY##g')
HITS=()
for entry in "${PATTERNS[@]}"; do
  name="${entry%%|*}"; pat="${entry#*|}"
  n=$(echo "$SCAN" | grep -acE -e "$pat")
  [ "$n" -gt 0 ] && HITS+=("- $name: $n line(s)")
done
n=$(echo "$SCAN" | grep -aE -e "$ARN" | grep -acvE -e "$ARN_OK")
[ "$n" -gt 0 ] && HITS+=("- real-looking AWS account id in an ARN: $n line(s)")

# The values are deliberately not printed; this output lands in a transcript.
[ ${#HITS[@]} -gt 0 ] && block "this would publish what looks like a secret." "${HITS[@]}" \
  "Find it with: git log -p HEAD --not --remotes" \
  "Remove it from the commits themselves (a follow-up commit still publishes the value)." \
  "In a test, build a fake value by concatenation so the source holds no key-shaped literal."

printf '%s\n' "$MATERIAL"
