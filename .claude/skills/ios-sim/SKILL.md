---
name: ios-sim
description: Run the YellowBook mobile app on a local iOS simulator against a local API with seeded test data, sign in without Auth0, drive it with Maestro and take screenshots. Use to verify a mobile change in the real native app (not the web build), to reproduce a UI bug, or whenever asked to "try it on the simulator/emulator".
---

# iOS simulator testing

Everything goes through `scripts/sim/sim.sh`. It runs a local stack that's separate from production and from the user's own simulators:

| Piece | Where | Notes |
|---|---|---|
| Postgres | docker compose `db` (:5432) | shared with normal local dev; the seed only touches `dev\|*` users |
| API | :3100, `DEV_AUTH=1` | accepts `Bearer dev:<name>` instead of Auth0 JWTs; refuses to start in production |
| Metro | :8091 | started with `EXPO_PUBLIC_DEV_STACK_API_URL=http://localhost:3100`, which in dev bundles replaces the API URL and enables the `yellowbook://login?devUser=<name>` sign-in link (`mobile/src/auth/devStack.ts`) |
| Simulator | dedicated "YB Agent" (iPhone 17 Pro, latest iOS) | created on first use |
| State | `.sim/` (gitignored) | logs, pids, build fingerprint, `shots/` |

Seed users: **alice** (main user: 10 plans of every time kind around today, one done, one shared to her by bob), **bob**, **casey**. All plans are relative to today, so the current month always has data.

## Verifying a change

1. `scripts/sim/sim.sh up` starts whatever isn't running. It's idempotent.
2. `scripts/sim/sim.sh seed` resets the dev users to the known state. Run it before every check so results don't depend on earlier runs.
3. `scripts/sim/sim.sh launch [user]` cold-starts the app signed out, connects it to Metro, and signs in through the dev link (default alice). It fails unless the Plans tab appears, which can only happen against the local API. It rebuilds the native dev client only when `@expo/fingerprint` says native code or config changed (5–10 min; check `.sim/build.log`); otherwise a launch takes about a minute. Metro serves the current checkout's JS, so a branch switch needs no rebuild unless native deps differ.
4. Drive the app with a Maestro flow: `scripts/sim/sim.sh flow <file>`. `takeScreenshot` images land in `.sim/shots/<flow>/`, and the command prints their paths. Use `scripts/sim/sim.sh open /some/route` to deep-link, and `scripts/sim/sim.sh shot <name>` for a one-off screenshot (it prints the PNG path). Screenshots are downscaled so they fit under the 500KB read limit.
5. **Look at the screenshots** with the Read tool. A passing flow only proves the elements exist, not that the screen looks right.
6. Report what you checked, on which seed data, and what you didn't cover.

Leave the stack running between checks; `down` stops the API, Metro and the simulator.

## Writing flows

- Flows live in `mobile/.maestro/`. A feature's flow is worth committing with its PR (e.g. `plans-calendar.yaml`), so later changes get the same check. Flows starting with `_` are internal to `sim.sh`.
- Start a flow from an already-launched app (`sim.sh launch` handles launch and sign-in), with `appId: dev.yellowbook.mobile`.
- Select elements by visible text or accessibility label, which the app already sets on most controls. The accessibility label wins over the visible text: the header's "Back" is `tapOn: "Go back"`. Add an accessibility label to the app instead of tapping by coordinates. When a selector misses, `maestro --device <udid> hierarchy | grep -i <word>` shows what's on screen.
- Maestro's `back` is Android-only; on iOS, tap the app's back button.
- `mobile/.maestro/plans-smoke.yaml` is the reference example.
- Before asserting, wait with `extendedWaitUntil` rather than `waitForAnimationToEnd`.
- Use `takeScreenshot: <name>` at each state you want to inspect.
- Maestro reference: https://docs.maestro.dev. `maestro studio` (run by the user) helps find selectors.

## When things go wrong

`sim.sh` already handles the known flaky spots, so if a step still fails, look before retrying:
- **Cold JS bundle:** `launch` pre-builds the bundle so the app doesn't load it while Maestro is querying the screen.
- **Hung Maestro iOS driver** (`viewHierarchy failed, code: 500`): Maestro runs under a watchdog (240s) and retries once with a fresh driver. A failure in `.sim/launch.log` or `.sim/shots/<flow>/maestro.log` after that is real.
- **Early taps:** a tap right after launch can land before the screen is interactive. In flows, `waitForAnimationToEnd` before the first tap, and wrap tap-then-assert in `retry` when the tap navigates.
- On failure, Maestro saves a screenshot of the failing step under `.sim/shots/<flow>/maestro/**/screenshots/`. Shrink it with `sips -Z 900 <png> --out .sim/shots/fail.png`, then read it.

- `scripts/sim/sim.sh status` shows what's up. `scripts/sim/sim.sh logs api|metro|build|launch` tails the logs.
- Red screen or stale JS: check `logs metro`, then run `launch` again.
- Stuck on the login screen after `launch`: the bundle isn't using the local API. Check `logs api` for requests. In development, `mobile/.env` overrides `EXPO_PUBLIC_API_BASE_URL`, which is why the stack uses `EXPO_PUBLIC_DEV_STACK_API_URL`. Restart Metro after changing its environment (kill :8091, then `up`).
- 401s after signing in: run `seed` again, since the dev user may have been deleted.
- Port taken by something the script didn't start: tell the user rather than killing it.
- A tool is missing (Maestro, Docker, Xcode) or a command is blocked by permissions: **stop and give the user the exact command to run.** Don't work around it.

## Rules

- Never point this at production or use real accounts. Dev tokens only work on an API started with `DEV_AUTH=1`.
- Don't commit `.sim/` or screenshots.
- Seed data changes go in `api/scripts/seed-dev-data.ts`, written through the API so it follows real server rules.
