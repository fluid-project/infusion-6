#!/usr/bin/env bash
# Probes which OAuth scopes GitHub asks of each step of creating a wend soft fork from a template repository - see
# infusion-6's a-scratch/reports/site-inheritance.md, section 6.
#
# Usage, with GH_TEST_TOKEN a classic token holding only public_repo:
#   bash probe-template-scopes.sh [template-name] [fork-name]
# defaulting to wend-template-test and wend-fork-test, both beneath the token's own account.
#
# It CHANGES STATE ON GITHUB: it creates the public repository <fork-name> from the template, commits one file to it,
# tries to commit a workflow file (expected to be refused), tries to set its workflow token permissions to write, and
# tries to enable Pages from docs/ on main. It deletes nothing - delete <fork-name> by hand afterwards.
#
# Each response's headers and body are written to ./scope-probe-results/, and a summary table is printed at the end.

set -u

TEMPLATE="${1:-wend-template-test}"
FORK="${2:-wend-fork-test}"
API="https://api.github.com"
OUT="scope-probe-results"

if [ -z "${GH_TEST_TOKEN:-}" ]; then
    echo "GH_TEST_TOKEN is not set" >&2
    exit 1
fi

mkdir -p "$OUT"
SUMMARY=""

# call <test id> <method> <path> [json body] - sets STATUS, SCOPES and ACCEPTED, and saves headers and body
call() {
    local id="$1" method="$2" path="$3" data="${4:-}"
    local args=(-sS -X "$method" -D "$OUT/$id.headers" -o "$OUT/$id.body" -w "%{http_code}"
        -H "Authorization: Bearer $GH_TEST_TOKEN"
        -H "Accept: application/vnd.github+json"
        -H "X-GitHub-Api-Version: 2022-11-28")
    if [ -n "$data" ]; then
        args+=(--data "$data")
    fi
    STATUS=$(curl "${args[@]}" "$API$path")
    SCOPES=$(grep -i '^x-oauth-scopes:' "$OUT/$id.headers" | cut -d: -f2- | tr -d '\r' | sed 's/^ *//')
    ACCEPTED=$(grep -i '^x-accepted-oauth-scopes:' "$OUT/$id.headers" | cut -d: -f2- | tr -d '\r' | sed 's/^ *//')
}

# record <test id> <expected> <description>
record() {
    local line
    line=$(printf "%-3s %-6s expect %-8s accepted=[%s]  %s" "$1" "$STATUS" "$2" "$ACCEPTED" "$3")
    echo "$line"
    SUMMARY="$SUMMARY$line"$'\n'
}

b64() {
    printf "%s" "$1" | base64 -w0
}

echo "== 0: the token"
call 0 GET /user
LOGIN=$(sed -n 's/.*"login": *"\([^"]*\)".*/\1/p' "$OUT/0.body" | head -1)
record 0 200 "GET /user as '$LOGIN', token scopes=[$SCOPES]"
if [ "$STATUS" != "200" ]; then
    echo "Token rejected - stopping" >&2
    exit 1
fi
if [ "$SCOPES" != "public_repo" ]; then
    echo "Token's scopes are [$SCOPES], not exactly public_repo - stopping, since the results would mean nothing" >&2
    exit 1
fi

echo "== 1: generate $LOGIN/$FORK from $LOGIN/$TEMPLATE"
call 1 POST "/repos/$LOGIN/$TEMPLATE/generate" \
    "{\"owner\":\"$LOGIN\",\"name\":\"$FORK\",\"private\":false,\"include_all_branches\":false}"
record 1 201 "generate from template"
if [ "$STATUS" != "201" ]; then
    echo "Generation failed - see $OUT/1.body. Stopping." >&2
    exit 1
fi
REPO="/repos/$LOGIN/$FORK"

echo "== 2: wait for main"
START=$(date +%s)
TRIES=0
STATUS=""
while [ "$STATUS" != "200" ] && [ "$TRIES" -lt 30 ]; do
    call 2 GET "$REPO/branches/main"
    if [ "$STATUS" != "200" ]; then
        sleep 2
    fi
    TRIES=$((TRIES + 1))
done
record 2 200 "main exists after $(( $(date +%s) - START ))s"

echo "== 3: was the workflow copied?"
call 3 GET "$REPO/contents/.github/workflows/probe.yml"
record 3 200 "template's workflow present in generated repo"

echo "== 4: control - commit a workflow file directly"
WORKFLOW=$'name: other\non: workflow_dispatch\njobs:\n  noop:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo other\n'
call 4 PUT "$REPO/contents/.github/workflows/other.yml" \
    "{\"message\":\"Probe: workflow file\",\"content\":\"$(b64 "$WORKFLOW")\"}"
record 4 "4xx" "direct workflow commit (should be refused for want of workflow scope)"

echo "== 5: per-fork commit"
SITE='{"bases": ["owner/site"], "editing": "wend/editing.json"}'
call 5 PUT "$REPO/contents/wend.site.json" \
    "{\"message\":\"Probe: wend.site.json\",\"content\":\"$(b64 "$SITE")\"}"
record 5 201 "commit wend.site.json"

echo "== 6: did the workflow run? (waiting 20s)"
sleep 20
call 6 GET "$REPO/actions/runs"
RUNS=$(sed -n 's/.*"total_count": *\([0-9]*\).*/\1/p' "$OUT/6.body" | head -1)
record 6 200 "workflow runs: ${RUNS:-?}"

echo "== 7: workflow token permissions"
call 7a GET "$REPO/actions/permissions/workflow"
DEFAULT=$(sed -n 's/.*"default_workflow_permissions": *"\([^"]*\)".*/\1/p' "$OUT/7a.body" | head -1)
record 7a 200 "default workflow permissions: ${DEFAULT:-?}"
call 7b PUT "$REPO/actions/permissions/workflow" "{\"default_workflow_permissions\":\"write\"}"
record 7b 204 "set workflow permissions to write"

echo "== 8: enable Pages"
call 8a POST "$REPO/pages" "{\"source\":{\"branch\":\"main\",\"path\":\"/docs\"}}"
record 8a 201 "enable Pages from main /docs"
call 8b GET "$REPO/pages"
PAGES_URL=$(sed -n 's/.*"html_url": *"\([^"]*\)".*/\1/p' "$OUT/8b.body" | head -1)
record 8b 200 "Pages: ${PAGES_URL:-none}"

echo
echo "================ Summary ================"
printf "%s" "$SUMMARY"
echo
echo "Bodies and headers are in ./$OUT/"
echo "Afterwards: open the Pages URL in a few minutes to check docs/index.html is served, look at any run's"
echo "'Set up job' log for its token's permissions, then delete $LOGIN/$FORK by hand and revoke the token."
