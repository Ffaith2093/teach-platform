#!/usr/bin/env bash
set -euo pipefail

env_file="${1:-deploy/.env.production}"
compose_file="docker-compose.prod.yml"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

read_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=.+" "$env_file" | tail -n 1 || true)"
  printf '%s' "${line#*=}" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

require_secret() {
  local key="$1"
  local min_length="$2"
  local value
  value="$(read_value "$key")"
  [[ -n "$value" ]] || fail "$key is missing from $env_file"
  [[ "$value" != *change-me* ]] || fail "$key still contains a placeholder"
  (( ${#value} >= min_length )) || fail "$key must be at least $min_length characters"
}

[[ -f "$env_file" ]] || fail "$env_file does not exist; copy deploy/env.production.example first"
[[ -f "$compose_file" ]] || fail "$compose_file does not exist"

require_secret POSTGRES_PASSWORD 32
require_secret REDIS_PASSWORD 32
require_secret AUTH_SECRET 32
require_secret CRON_SECRET 32

nextauth_url="$(read_value NEXTAUTH_URL)"
[[ "$nextauth_url" =~ ^https?:// ]] || fail "NEXTAUTH_URL must start with http:// or https://"
[[ "$nextauth_url" != *localhost* && "$nextauth_url" != *127.0.0.1* ]] || fail "NEXTAUTH_URL must use the ECS IP or production domain"

judge_tmp_dir="$(read_value JUDGE_TMP_DIR)"
[[ "$judge_tmp_dir" == /* && "$judge_tmp_dir" != "/" ]] || fail "JUDGE_TMP_DIR must be a specific absolute path"

docker_gid="$(read_value DOCKER_GID)"
[[ "$docker_gid" =~ ^[0-9]+$ ]] || fail "DOCKER_GID must be the numeric GID of the host Docker group"

if [[ -S /var/run/docker.sock ]]; then
  printf 'OK: Docker socket is available.\n'
else
  fail "Docker socket /var/run/docker.sock is unavailable"
fi

if [[ ! -d "$judge_tmp_dir" ]]; then
  printf 'WARNING: %s does not exist. Create it before starting the app.\n' "$judge_tmp_dir" >&2
elif [[ ! -w "$judge_tmp_dir" ]]; then
  printf 'WARNING: %s is not writable by the current user; verify ownership is 10001:10001.\n' "$judge_tmp_dir" >&2
fi

docker compose --env-file "$env_file" -f "$compose_file" config --quiet
printf 'OK: production environment and Compose configuration are valid.\n'
