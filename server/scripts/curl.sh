#!/usr/bin/env bash
# Walkthrough of the API in dev-header auth mode. Run against a freshly seeded server:
#   npm run seed -w server && AUTH_MODE=dev npm run dev -w server
#   bash server/scripts/curl.sh
# Each step prints the request, then the response. Watch how the same route answers differently
# depending on who is asking.
set -u
BASE="${SECRETS_SERVER_URL:-http://localhost:4000}"

step() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
as() {  # as <login> <method> <path> [json-body]
  local user="$1" method="$2" path="$3" body="${4:-}"
  printf '\033[2m%s %s %s  (as %s)\033[0m\n' "$method" "$path" "${body}" "$user"
  if [ -n "$body" ]; then
    curl -s -X "$method" "$BASE$path" -H "X-Dev-User: $user" -H 'Content-Type: application/json' -d "$body"
  else
    curl -s -X "$method" "$BASE$path" -H "X-Dev-User: $user"
  fi | jq -c .
}
id_of_secret() { curl -s "$BASE/secrets" -H "X-Dev-User: $1" | jq ".secrets[] | select(.key==\"$2\") | .id"; }
id_of_user()   { curl -s "$BASE/users"   -H "X-Dev-User: $1" | jq ".users[] | select(.githubLogin==\"$2\") | .id"; }
id_of_team()   { curl -s "$BASE/teams"   -H "X-Dev-User: $1" | jq ".teams[] | select(.name==\"$2\") | .id"; }

step "health, no auth"
curl -s "$BASE/health" | jq -c .

step "no header → 401"
curl -s "$BASE/me" | jq -c .

step "unknown login → 401"
as nobody GET /me

step "who am I (alice)"
as alice GET /me

step "visibility: alice / carol / dave / dannyrose30 (admin) / erin (other org)"
for u in alice carol dave dannyrose30 erin; do
  printf '  %-12s ' "$u"; curl -s "$BASE/secrets" -H "X-Dev-User: $u" \
    | jq -c '[.secrets[] | {key, value, r:.access.canRead, w:.access.canWrite, o:.access.isOwner}]'
done

DEPLOY=$(id_of_secret bob DEPLOY_KEY)
NOTE=$(id_of_secret dave PERSONAL_NOTE)
PLATFORM=$(id_of_team alice platform)
FIRMWARE=$(id_of_team alice firmware)
DAVE=$(id_of_user alice dave)
BOB=$(id_of_user alice bob)

step "dave has write-only on DEPLOY_KEY: GET shows value=null and grants=null"
as dave GET /secrets/$DEPLOY

step "dave can still overwrite it (writer)"
as dave PUT /secrets/$DEPLOY '{"value":"ssh-ed25519 ROTATED"}'

step "carol (reader) cannot write → 403"
as carol PUT /secrets/$DEPLOY '{"value":"nope"}'

step "carol (reader) cannot change sharing → 403 (owner only)"
as carol PUT /secrets/$DEPLOY/grants '{"grants":[]}'

step "alice cannot see PERSONAL_NOTE → 404 (not 403: existence is not leaked)"
as alice GET /secrets/$NOTE
as alice PUT /secrets/$NOTE '{"value":"x"}'

step "alice creates a secret shared with team firmware (r) and dave (rw)"
as alice POST /secrets "{\"key\":\"GRAFANA_TOKEN\",\"value\":\"g-123\",\"grants\":[{\"principal\":{\"type\":\"team\",\"id\":$FIRMWARE},\"canRead\":true,\"canWrite\":false},{\"principal\":{\"type\":\"user\",\"id\":$DAVE},\"canRead\":true,\"canWrite\":true}]}"
GRAFANA=$(id_of_secret alice GRAFANA_TOKEN)

step "bob (firmware) now reads it; dave writes it"
as bob GET /secrets/$GRAFANA
as dave PUT /secrets/$GRAFANA '{"value":"g-456"}'

step "duplicate key in org → 409"
as bob POST /secrets '{"key":"GRAFANA_TOKEN","value":"dup","grants":[]}'

step "bad body → 400 with zod issues"
as alice POST /secrets '{"key":"has space","value":"v","grants":[]}'

step "cross-org principal → 400 (erin's acme-core team id from the other org)"
ACME_CORE=$(id_of_team erin acme-core)
as alice POST /secrets "{\"key\":\"LEAK\",\"value\":\"v\",\"grants\":[{\"principal\":{\"type\":\"team\",\"id\":$ACME_CORE},\"canRead\":true,\"canWrite\":true}]}"

step "owner replaces the grant list (org-wide read) then deletes"
CHIP=$(curl -s "$BASE/me" -H 'X-Dev-User: alice' | jq .org.id)
as alice PUT /secrets/$GRAFANA/grants "{\"grants\":[{\"principal\":{\"type\":\"org\",\"id\":$CHIP},\"canRead\":true,\"canWrite\":false}]}"
as alice DELETE /secrets/$GRAFANA
as alice GET /secrets/$GRAFANA

step "non-admin hits /admin → 403"
as alice POST /admin/users '{"githubLogin":"mallory"}'

step "admin creates a user, a team, assigns, promotes"
as dannyrose30 POST /admin/users '{"githubLogin":"grace"}'
GRACE=$(id_of_user alice grace)
as dannyrose30 POST /admin/teams '{"name":"security"}'
SEC=$(id_of_team alice security)
as dannyrose30 PUT /admin/users/$GRACE/teams "{\"teamIds\":[$SEC,$PLATFORM]}"
as dannyrose30 POST /admin/users/$GRACE/promote
as dannyrose30 POST /admin/users '{"githubLogin":"grace"}'   # duplicate → 409

step "admin cannot delete self → 403; cannot touch other org's user → 404"
DANNY=$(id_of_user alice dannyrose30)
as dannyrose30 DELETE /admin/users/$DANNY
ERIN=$(curl -s "$BASE/users" -H 'X-Dev-User: erin' | jq '.users[] | select(.githubLogin=="erin") | .id')
as dannyrose30 DELETE /admin/users/$ERIN

step "delete bob: his DEPLOY_KEY transfers to dannyrose30; grants TO bob are dropped"
as dannyrose30 DELETE /admin/users/$BOB
as dannyrose30 GET /secrets/$DEPLOY

step "delete team firmware: DATABASE_URL loses its firmware grant (carol keeps platform rw)"
as dannyrose30 DELETE /admin/teams/$FIRMWARE
DBURL=$(id_of_secret alice DATABASE_URL)
as alice GET /secrets/$DBURL

step "sqlite integrity: no orphan grants"
printf '  (run) sqlite3 server/data/secrets.db "select count(*) from grants g where (principal_type=%s and principal_id not in (select id from users)) or (principal_type=%s and principal_id not in (select id from teams))"\n' "'user'" "'team'"
