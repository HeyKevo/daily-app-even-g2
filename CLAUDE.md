# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An EvenHub app for Even Realities G2 smart glasses. The repo root is a thin wrapper (EvenHub CLI + dev launcher); the actual app lives in `daily-app/` (Vite + TypeScript, no framework).

`AGENTS.md` at the root is the canonical agent/skill registry, and `.codex/skills/*/SKILL.md` holds three deep domain skills (`architecture`, `even_agent`, `ui_agent`). Read the matching SKILL.md before implementation work — they carry SDK-version detail, container limits, and event-enum values that are not repeated here. Order when several apply: `ui_agent` -> `even_agent` -> `architecture`.

## Commands

All app commands run from the repo root via `--prefix`:

```bash
npm --prefix daily-app install        # required first: node_modules is not checked in
npm --prefix daily-app run test       # vitest run (all tests under daily-app/tests)
npm --prefix daily-app run test:watch
npm --prefix daily-app run build      # vite build; also the typecheck, since tsconfig has noEmit
npm --prefix daily-app run dev        # vite --host on :5173
npm --prefix daily-app run pack       # build + evenhub pack -> evenhub-daily-app.ehpk
```

Single test file / single test:

```bash
npm --prefix daily-app run test -- tests/navigation/router.test.ts
npm --prefix daily-app run test -- -t "<test name substring>"
npm --prefix daily-app run test:dashboard   # preconfigured dashboard routing run
```

There is no lint step and no separate `typecheck` script — `run build` is the type gate.

Simulator / headless:

```bash
npm run start:even                    # root: vite dev + QR + simulator (bash; macOS/Linux oriented)
npm --prefix daily-app run simulate   # simulator against :5173 with --automation-port 9898
npm --prefix daily-app run test:simulator  # smoke-checks the automation API (ping/screenshot/console)
```

The simulator automation API (`http://127.0.0.1:9898`) exposes `GET /api/ping`, `GET /api/screenshot/glasses` (576x288 PNG; assert lit pixels via `alpha > 0`), `GET /api/screenshot/webview`, `GET /api/console`, and `POST /api/input`. Use a LAN URL, not `localhost`, when a real device must reach the dev server.

## Architecture

### Two separate UIs in one app

- **Glasses canvas** — driven by `AppController.start()`. This is the real product surface: SDK containers rendered through the bridge.
- **WebView companion** — `src/main.ts` builds a plain-DOM config page (RSS feeds, shopping todos) that runs in the phone's WebView. It shares services with the glasses side but renders nothing on the glasses. Don't conflate the two.

`src/main.ts` is the single entry point for both: it paints the companion DOM *and* kicks off `AppController.start()`.

### Layering (enforced, not just convention)

```
app/         AppController wires everything; initBridge
bridge/      ONLY place allowed to import @evenrealities/even_hub_sdk
input/       raw SDK event -> normalized InputEvent; dispatcher
navigation/  Screen interface, ScreenStack, router
screens/     per-screen state + input handling; return ViewModels
ui/          components (ViewModel builders), layout, render pipeline
services/    data + storage + speech, consume bridge interfaces
state/, utils/
```

`tests/architecture/sdkImportBoundary.test.ts` fails the suite if `@evenrealities/even_hub_sdk` is imported anywhere under `src/` outside `src/bridge/`. Every new SDK capability (audio, IMU, storage, device status, `callEvenApp` fallbacks) gets a bridge wrapper first, then an interface that other layers depend on.

Screens never touch the bridge or SDK — they take `DataService`, `Router`, `Logger` and return a `ViewModel`.

### Render flow

`Screen.getViewModel()` -> `ViewModel` (`ui/render/renderPipeline.ts`) -> `buildLayout()` (`ui/layout/layoutBuilder.ts`) -> bridge `createStartup` / `rebuild` / `updateText` / `updateImage`.

`ViewModel.layoutMode` (`stacked` | `two-column` | `list-footer` | `text-pager` | `dashboard-menu`) selects a geometry preset in `layoutBuilder`; container coordinates live there and nowhere else.

`RenderPipeline` keeps a first-render/delta distinction: if the container *structure* is unchanged (same container keys and same non-content signature), it pushes text-only deltas via `textContainerUpgrade`; otherwise it falls back to a full `rebuildPageContainer`. When editing layout code, remember that changing geometry invalidates the delta path.

### Input flow

SDK `onEvenHubEvent` -> `mapEvenHubEvent()` -> `InputEvent` (`Up | Down | Click | DoubleClick | SelectionChange | SystemExit`) -> `createInputDispatcher` -> `stack.current().onInput(event)` -> `stack.render()`.

All event-shape normalization belongs in `input/evenHubEventMapper.ts`. This file is defensive on purpose: host payloads arrive as protobuf objects, plain records, JSON strings, or `toJson()`-bearing wrappers, with snake_case / camelCase / PascalCase key variants, and protobuf omits zero-valued `CLICK_EVENT` so a `sysEvent` with no type must be inferred as a Click. Do not "simplify" these branches without a regression fixture — add new device/simulator payloads to `tests/screens/dashboard/__fixtures__/dashboardInputEvents.ts` instead (see `doc/routing-test-workbench.md`).

Navigation only changes through `navigation/router.ts` + `ScreenStack`. `DoubleClick` maps to Back everywhere; Back at the root calls `bridge.shutDownPageContainer(1)` via the `onRootBack` callback.

## Hard platform constraints

- Canvas is 576 x 288 px per eye, 4-bit greyscale green; origin top-left, X right, Y down.
- `containerTotalNum` 1-12, max 8 `textObject`, max 4 `imageObject` (older app/SDK versions behave like a 4-total system — verify the target before expanding a layout).
- **Exactly one** container must have `isEventCapture: 1`. `layoutBuilder` assigns it to the first requester; a screen returning zero or two capture containers is a bug.
- Image pushes (`updateImageRawData`) must be serialized, never concurrent.
- Persist user state through the bridge's local-storage wrappers (`services/storage/`), not browser `localStorage`/IndexedDB — the EvenHub WebView does not retain those reliably.

## Networking

Outbound hosts must be declared in `daily-app/app.json` under `permissions[].whitelist` (currently `https://www.tagesschau.de`). That is packaging-level and separate from browser CORS: during dev, `vite.config.ts` runs an `/rss-proxy?url=...` middleware that fetches feed XML server-side. Adding a feed source means updating both.

`app.json` also declares `g2-microphone` for the voice-todo flow. Packaging metadata belongs in `app.json`, never in runtime screen/service code.

## Conventions

- UI copy is German, written with ASCII transliterations rather than umlauts (`fuer`, `Loeschen`, `gueltiger`). Match this in new strings.
- TypeScript is strict with `noUnusedLocals`/`noUnusedParameters`; unused imports break the build.
- Tests are vitest in a `node` environment (no jsdom) — `src/main.ts` DOM code is not directly testable; keep logic in services/components.
- `AGENTS.md` mandates test coverage for every changed method and feature flow: happy path + edge/error + a regression case for the changed behavior. If something can only be verified on hardware, say so explicitly rather than leaving it silently uncovered.
- `doc/evenhub-current-sdk-notes.md` is a dated snapshot of SDK/CLI/simulator versions and APIs. Before making version-sensitive claims, read `daily-app/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts` — installed types win over the snapshot.
