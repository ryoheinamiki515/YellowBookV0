#!/usr/bin/env bash
# Local iOS-simulator test stack: Postgres + API (dev auth) + Metro + a dedicated simulator.
# Usage: scripts/sim/sim.sh <command> [args]   (see `help`)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE_DIR="$ROOT/.sim"
SHOTS_DIR="$STATE_DIR/shots"
FLOWS_DIR="$ROOT/mobile/.maestro"

API_PORT=3100
METRO_PORT=8091
SIM_NAME="YB Agent"
SIM_DEVICE_TYPE="com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro"
BUNDLE_ID="dev.yellowbook.mobile"
APP_SCHEME="yellowbook"
DEFAULT_DEV_USER="alice"

API_URL="http://localhost:$API_PORT"
METRO_URL="http://localhost:$METRO_PORT"

mkdir -p "$STATE_DIR" "$SHOTS_DIR"

log() { printf '\033[1;33m[sim]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[sim] %s\033[0m\n' "$*" >&2; exit 1; }

wait_for() { # <description> <seconds> <command...>
    local what="$1" seconds="$2"; shift 2
    for ((i = 0; i < seconds; i++)); do
        if "$@" >/dev/null 2>&1; then return 0; fi
        sleep 1
    done
    die "Timed out after ${seconds}s waiting for $what"
}

pid_alive() { [[ -f "$1" ]] && kill -0 "$(cat "$1")" 2>/dev/null; }

stop_pid() {
    local pidfile="$1"
    if pid_alive "$pidfile"; then
        local pid; pid="$(cat "$pidfile")"
        pkill -TERM -P "$pid" 2>/dev/null || true
        kill -TERM "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
}

# --- Stack --------------------------------------------------------------------

start_db() {
    docker info >/dev/null 2>&1 || { log "Starting Docker"; open -a Docker; wait_for "Docker" 120 docker info; }
    (cd "$ROOT" && docker compose up -d db >/dev/null 2>&1)
    wait_for "Postgres" 60 docker compose -f "$ROOT/docker-compose.yml" exec -T db pg_isready -U app
    (cd "$ROOT/api" && npx prisma migrate deploy >"$STATE_DIR/migrate.log" 2>&1) || die "Migrations failed; see .sim/migrate.log"
}

start_api() {
    if curl -sf "$API_URL/v1/health" >/dev/null; then return; fi
    log "Starting API on :$API_PORT (DEV_AUTH=1)"
    # Redirect the whole subshell (not just the server) so no caller's pipe stays open behind it.
    (cd "$ROOT/api" && DEV_AUTH=1 PORT=$API_PORT exec nohup npx tsx src/server.ts) \
        >"$STATE_DIR/api.log" 2>&1 </dev/null &
    echo $! >"$STATE_DIR/api.pid"
    wait_for "API (see .sim/api.log)" 60 curl -sf "$API_URL/v1/health"
}

start_metro() {
    if curl -sf "$METRO_URL/status" | grep -q running; then return; fi
    log "Starting Metro on :$METRO_PORT"
    # A dedicated variable: in development Expo lets mobile/.env (which points at production)
    # override EXPO_PUBLIC_API_BASE_URL. See mobile/src/auth/devStack.ts.
    (cd "$ROOT/mobile" && EXPO_PUBLIC_DEV_STACK_API_URL="$API_URL" \
        exec nohup npx expo start --dev-client --clear --port $METRO_PORT) \
        >"$STATE_DIR/metro.log" 2>&1 </dev/null &
    echo $! >"$STATE_DIR/metro.pid"
    wait_for "Metro (see .sim/metro.log)" 90 sh -c "curl -sf $METRO_URL/status | grep -q running"
}

cmd_up() {
    start_db
    start_api
    start_metro
    sim_udid >/dev/null
    log "Stack up: API $API_URL, Metro $METRO_URL, simulator '$SIM_NAME'"
}

cmd_down() {
    stop_pid "$STATE_DIR/metro.pid"
    stop_pid "$STATE_DIR/api.pid"
    local udid; udid="$(find_sim_udid)"
    [[ -n "$udid" ]] && xcrun simctl shutdown "$udid" 2>/dev/null || true
    log "Stopped API, Metro and simulator (Postgres left running: docker compose stop db)"
}

cmd_status() {
    curl -sf "$API_URL/v1/health" >/dev/null && echo "api:    up ($API_URL)" || echo "api:    down"
    curl -sf "$METRO_URL/status" | grep -q running && echo "metro:  up ($METRO_URL)" || echo "metro:  down"
    local udid; udid="$(find_sim_udid)"
    if [[ -n "$udid" ]]; then
        echo "sim:    $(xcrun simctl list devices | grep "$udid" | sed 's/^ *//')"
        xcrun simctl get_app_container "$udid" "$BUNDLE_ID" >/dev/null 2>&1 \
            && echo "app:    installed ($(cat "$STATE_DIR/build.fingerprint" 2>/dev/null || echo 'unknown build'))" \
            || echo "app:    not installed"
    else
        echo "sim:    not created"
    fi
}

cmd_seed() {
    (cd "$ROOT/api" && API_BASE_URL="$API_URL" npx tsx scripts/seed-dev-data.ts)
}

# --- Simulator & app ----------------------------------------------------------

find_sim_udid() {
    xcrun simctl list devices -j | python3 -c "
import json, sys
devices = json.load(sys.stdin)['devices']
for runtime, entries in devices.items():
    for d in entries:
        if d['name'] == '$SIM_NAME' and d.get('isAvailable', True):
            print(d['udid']); sys.exit()"
}

latest_ios_runtime() {
    xcrun simctl list runtimes -j | python3 -c "
import json, sys
rts = [r for r in json.load(sys.stdin)['runtimes'] if r['platform'] == 'iOS' and r['isAvailable']]
print(max(rts, key=lambda r: [int(p) for p in r['version'].split('.')])['identifier'])"
}

# Prints the UDID of the dedicated simulator, creating and booting it as needed.
sim_udid() {
    local udid; udid="$(find_sim_udid)"
    if [[ -z "$udid" ]]; then
        log "Creating simulator '$SIM_NAME'"
        udid="$(xcrun simctl create "$SIM_NAME" "$SIM_DEVICE_TYPE" "$(latest_ios_runtime)")"
    fi
    if ! xcrun simctl list devices | grep "$udid" | grep -q Booted; then
        log "Booting simulator '$SIM_NAME'"
        xcrun simctl boot "$udid" 2>/dev/null || true
        xcrun simctl bootstatus "$udid" -b >/dev/null
    fi
    open -g -a Simulator --args -CurrentDeviceUDID "$udid"
    echo "$udid"
}

native_fingerprint() {
    (cd "$ROOT/mobile" && node node_modules/@expo/fingerprint/bin/cli.js fingerprint:generate . 2>/dev/null) \
        | python3 -c "import json, sys; print(json.load(sys.stdin)['hash'])"
}

# Rebuilds the dev client only when native code or config changed since the last build.
ensure_app() {
    local udid="$1" fingerprint; fingerprint="$(native_fingerprint)"
    if xcrun simctl get_app_container "$udid" "$BUNDLE_ID" >/dev/null 2>&1 \
        && [[ "$(cat "$STATE_DIR/build.fingerprint" 2>/dev/null)" == "$fingerprint" ]]; then
        return
    fi
    log "Building the iOS dev client (native fingerprint changed or app missing; ~5-10 min)"
    local derived="$STATE_DIR/DerivedData"
    {
        (cd "$ROOT/mobile" && CI=1 npx expo prebuild --platform ios </dev/null) &&
        xcodebuild -workspace "$ROOT/mobile/ios/YellowBook.xcworkspace" -scheme YellowBook \
            -configuration Debug -sdk iphonesimulator -destination "id=$udid" \
            -derivedDataPath "$derived" build
    } >"$STATE_DIR/build.log" 2>&1 || die "Build failed; see .sim/build.log"
    xcrun simctl install "$udid" "$derived/Build/Products/Debug-iphonesimulator/YellowBook.app"
    echo "$fingerprint" >"$STATE_DIR/build.fingerprint"
}

# Full-resolution simulator PNGs are >1MB; 900px tall keeps text legible and files small.
shrink_png() { sips -Z 900 "$1" >/dev/null 2>&1; }

MAESTRO_TIMEOUT_SECONDS=240

# Maestro's iOS driver occasionally dies (e.g. "viewHierarchy failed, code: 500") and then
# hangs instead of exiting. Kill it after a timeout and retry once with a fresh driver.
run_maestro() { # <log file> <maestro args...>
    local logfile="$1"; shift
    local attempt
    for attempt in 1 2; do
        local extra=()
        [[ $attempt -eq 2 ]] && extra=(--reinstall-driver) && log "Maestro failed; retrying with a fresh driver"
        maestro "$@" ${extra[@]+"${extra[@]}"} >"$logfile" 2>&1 &
        local pid=$! elapsed=0
        while kill -0 "$pid" 2>/dev/null && ((elapsed < MAESTRO_TIMEOUT_SECONDS)); do sleep 1; ((elapsed++)); done
        if kill -0 "$pid" 2>/dev/null; then
            pkill -TERM -P "$pid" 2>/dev/null || true
            kill -TERM "$pid" 2>/dev/null || true
            echo "[sim] Maestro timed out after ${MAESTRO_TIMEOUT_SECONDS}s" >>"$logfile"
        elif wait "$pid"; then
            return 0
        elif ! grep -q "UnknownFailure\|viewHierarchy failed\|timed out" "$logfile"; then
            return 1 # a real flow failure; retrying won't help
        fi
    done
    return 1
}

urlencode() { python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=''))" "$1"; }

# Fresh launch connected to Metro and signed in as a dev user.
cmd_launch() {
    local user="${1:-$DEFAULT_DEV_USER}"
    start_metro
    local udid; udid="$(sim_udid)"
    ensure_app "$udid"
    # Build the JS bundle before the app asks for it: while a cold bundle loads, Maestro's
    # view-hierarchy requests can stall for minutes.
    curl -sf "$METRO_URL/index.bundle?platform=ios&dev=true" -o /dev/null || die "Metro failed to bundle; see .sim/metro.log"
    xcrun simctl terminate "$udid" "$BUNDLE_ID" 2>/dev/null || true
    # Skip expo-dev-menu's first-run sheet, which covers the app.
    xcrun simctl spawn "$udid" defaults write "$BUNDLE_ID" EXDevMenuIsOnboardingFinished -bool YES
    run_maestro "$STATE_DIR/launch.log" --device "$udid" test "$FLOWS_DIR/_launch.yaml" \
        -e METRO_URL="$(urlencode "$METRO_URL")" -e DEV_USER="$user" \
        || die "Launch flow failed; see .sim/launch.log"
    log "App running, signed in as $user"
}

cmd_open() { # <path>, e.g. /plans or /plan/<id>
    local udid; udid="$(sim_udid)"
    xcrun simctl openurl "$udid" "$APP_SCHEME://${1#/}"
}

cmd_shot() {
    local name="${1:-shot-$(date +%H%M%S)}" udid; udid="$(sim_udid)"
    local out="$SHOTS_DIR/$name.png"
    xcrun simctl io "$udid" screenshot "$out" >/dev/null 2>&1
    shrink_png "$out"
    echo "$out"
}

cmd_flow() { # <flow.yaml> [maestro args...]
    local flow="$1"; shift
    [[ -f "$flow" ]] || flow="$FLOWS_DIR/$flow"
    local udid; udid="$(sim_udid)"
    local out="$SHOTS_DIR/$(basename "$flow" .yaml)"
    rm -rf "$out" && mkdir -p "$out"
    local status=0
    # Maestro nests output under <dir>/<timestamp>/<flow>/; lift takeScreenshot images to the top.
    run_maestro "$out/maestro.log" --device "$udid" test "$flow" --test-output-dir "$out/maestro" "$@" || status=$?
    grep -E "COMPLETED|FAILED|WARNED|Assertion|Exception" "$out/maestro.log" >&2 || true
    find "$out/maestro" -path '*/takeScreenshot/*.png' -exec mv {} "$out/" \; 2>/dev/null || true
    for png in "$out"/*.png; do [[ -f "$png" ]] && shrink_png "$png"; done
    log "Screenshots: $(ls "$out"/*.png 2>/dev/null | tr '\n' ' ')"
    return $status
}

cmd_logs() { tail -n "${2:-60}" "$STATE_DIR/${1:-metro}.log"; }

cmd_help() {
    cat <<EOF
scripts/sim/sim.sh <command>
  up               Start Postgres, the API (:$API_PORT, dev auth), Metro (:$METRO_PORT) and the '$SIM_NAME' simulator
  seed             Reset and seed the dev users (alice, bob, casey) through the API
  launch [user]    Build the dev client if native code changed, relaunch it, sign in (default: $DEFAULT_DEV_USER)
  open <path>      Open an app route by deep link, e.g. /plans
  flow <file>      Run a Maestro flow (path or name under mobile/.maestro); screenshots land in .sim/shots
  shot [name]      Screenshot the simulator; prints the PNG path
  logs [api|metro|build|launch] [n]   Tail a log
  status | down
EOF
}

command="${1:-help}"; shift || true
case "$command" in
    up | down | status | seed | launch | open | shot | flow | logs | help) "cmd_$command" "$@" ;;
    *) cmd_help; exit 1 ;;
esac
