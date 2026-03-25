# Web Time Tracker → WXT Migration Plan

A step-by-step plan for migrating [JayDosunmu/web-time-tracker](https://github.com/JayDosunmu/web-time-tracker) from its current Vite + `vite-plugin-web-extension` setup to the [WXT framework](https://wxt.dev/), enabling cross-browser builds and dual Manifest V2/V3 output from a single codebase.

---

## Current Architecture Recap

Based on the README's architecture diagrams, the extension has four layers:

```
src/
  content/          → ContentScriptManager, TimeDisplayPill (Shadow DOM), MessageRouter
  background/       → BackgroundService, DataModelManager, TimeTracker
  popup/            → Popup UI (HTML + TS)
  repositories/     → HistoryRepository, TabRepository, SettingsRepository
  (shared types, utils, etc.)
types/              → TypeScript type definitions
icons/              → Extension icons
manifest.json       → MV2 Firefox manifest (top-level)
vite.config.ts      → Vite build config using vite-plugin-web-extension
```

Key characteristics:
- Uses `browser.storage.local` throughout (Firefox API)
- Content script renders a **Shadow DOM** timer pill (style isolation)
- Background is a **persistent script** (MV2 model)
- Communication via typed `browser.runtime.sendMessage()`
- No framework (vanilla TypeScript + CSS)

---

## Phase 0: Pre-Migration Prep

**Goal:** Reduce risk by making the current codebase more portable before touching the build system.

### 0.1 — Snapshot current behavior
- Run the existing test suite (`npm test`) and note the pass count.
- Manually test: install in Firefox, visit a few sites, verify timer pill appears, drag it, check popup stats, let it cross a midnight boundary if possible.
- Screenshot the popup and pill for visual regression comparison later.

### 0.2 — Decouple from build tooling
- Audit every import in the source for anything specific to `vite-plugin-web-extension` (e.g., `?script` imports for content scripts, special `manifest` references). These will need rewriting.
- Confirm all business logic lives in `src/` and `types/` with no implicit dependency on the top-level `manifest.json` path.

### 0.3 — Create a migration branch
```bash
git checkout -b feat/wxt-migration
```

---

## Phase 1: Scaffold the WXT Project

### 1.1 — Initialize WXT alongside the existing code

```bash
# From the repo root
npx wxt@latest init wxt-temp --template vanilla --pm npm
```

This generates:
```
wxt-temp/
  entrypoints/
    background.ts
    content.ts
    popup/
      index.html
      main.ts
      style.css
  public/
    icon/
      16.png, 32.png, 48.png, 96.png, 128.png
  assets/
  wxt.config.ts
  tsconfig.json
  package.json
```

### 1.2 — Merge the WXT scaffold into the repo root

Rather than working inside `wxt-temp/`, bring WXT's structure into the existing project:

1. Copy `wxt-temp/wxt.config.ts` → repo root
2. Create `src/entrypoints/` directory (we'll use WXT's `srcDir` option)
3. Copy `wxt-temp/tsconfig.json` and merge with the existing `tsconfig.json`
4. Merge WXT dependencies into the existing `package.json`:
   ```bash
   npm install wxt --save-dev
   ```
5. Delete `wxt-temp/`

### 1.3 — Configure `wxt.config.ts`

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',

  manifest: {
    name: 'Web Time Tracker',
    description: 'Track time spent on different websites.',
    permissions: ['tabs', 'storage', 'webNavigation'],
    // WXT auto-adds host_permissions for MV3, permissions for MV2
    host_permissions: ['<all_urls>'],
  },

  // Use Chrome-style API names; WXT polyfills for Firefox
  extensionApi: 'chrome',
});
```

### 1.4 — Move icons

WXT expects icons at `public/icon/{size}.png`:

```bash
mkdir -p src/public/icon
# Copy existing icons from icons/ to the WXT-expected paths:
cp icons/icon-16.png  src/public/icon/16.png
cp icons/icon-32.png  src/public/icon/32.png
cp icons/icon-48.png  src/public/icon/48.png
cp icons/icon-96.png  src/public/icon/96.png
cp icons/icon-128.png src/public/icon/128.png
```

WXT auto-discovers these and writes them to the manifest.

---

## Phase 2: Migrate Entrypoints

This is the core of the migration. Each extension entrypoint must be placed in `src/entrypoints/` following WXT's naming conventions.

### 2.1 — Background Script

**Current:** `src/background/` → contains `BackgroundService`, `DataModelManager`, `TimeTracker`

**WXT target:** `src/entrypoints/background/index.ts`

```
src/entrypoints/
  background/
    index.ts            ← WXT entrypoint (defineBackground wrapper)
    BackgroundService.ts
    DataModelManager.ts
    TimeTracker.ts
```

**`src/entrypoints/background/index.ts`:**
```typescript
export default defineBackground(() => {
  // Import and initialize the BackgroundService
  // This is the main entry — WXT auto-imports defineBackground
  const service = new BackgroundService();
  service.initialize();
});
```

> **Critical MV3 change:** The `defineBackground` callback **cannot be async**. Any async initialization must happen inside the synchronous callback body (e.g., call an async function without awaiting at the top level, or use `.then()`). Also, all event listeners (`browser.tabs.onActivated`, `browser.windows.onFocusChanged`, etc.) **must be registered synchronously** in the top-level scope — not inside an async callback — or they'll be lost when the MV3 service worker restarts.

#### Service worker lifecycle adaptation

This is the biggest refactoring task in the entire migration:

| MV2 (current) | MV3 (needed) |
|---|---|
| Background page persists forever | Service worker terminates after ~5 min idle |
| In-memory state lives for the session | State must be persisted to `storage.local` and rehydrated on wake |
| `setInterval` for boundary checks | `browser.alarms.create()` for periodic checks |
| Single initialization path | Must handle re-initialization on every wake-up |

**Action items:**
1. Replace any `setInterval`/`setTimeout` with `browser.alarms`:
   ```typescript
   // Before (MV2):
   setInterval(() => checkBoundaries(), 60_000);

   // After (MV3-safe):
   browser.alarms.create('boundary-check', { periodInMinutes: 1 });
   browser.alarms.onAlarm.addListener((alarm) => {
     if (alarm.name === 'boundary-check') checkBoundaries();
   });
   ```
2. Move `TimeTracker`'s session state (current domain, start timestamp) into `browser.storage.session` (MV3) or `browser.storage.local` so it survives worker restarts.
3. On service worker startup, rehydrate state from storage before registering listeners.
4. Add the `alarms` permission to `wxt.config.ts`:
   ```typescript
   manifest: {
     permissions: ['tabs', 'storage', 'webNavigation', 'alarms'],
   }
   ```

### 2.2 — Content Script

**Current:** `src/content/` → contains `ContentScriptManager`, `TimeDisplayPill` (Shadow DOM), `MessageRouter`

**WXT target:** `src/entrypoints/timer-pill.content/index.ts`

```
src/entrypoints/
  timer-pill.content/
    index.ts              ← WXT entrypoint (defineContentScript wrapper)
    TimeDisplayPill.ts
    MessageRouter.ts
    pill.css
```

**`src/entrypoints/timer-pill.content/index.ts`:**
```typescript
import './pill.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',      // Tells WXT this script manages its own CSS via Shadow DOM

  async main(ctx) {
    // ctx is a ContentScriptContext — use it for lifecycle management
    const pill = new TimeDisplayPill(ctx);
    const router = new MessageRouter(pill);

    pill.mount();
    router.start();
  },
});
```

#### Shadow DOM with WXT

The existing extension already uses Shadow DOM for the timer pill, which is great. WXT provides `createShadowRootUi()` as a helper, but since you already have a working Shadow DOM implementation, you have two options:

**Option A — Keep your existing Shadow DOM code.** Just wrap it in `defineContentScript` and it works as-is. The `cssInjectionMode: 'ui'` setting tells WXT not to inject CSS into the page directly.

**Option B — Adopt WXT's `createShadowRootUi`.** This gives you automatic cleanup, HMR support in dev mode, and lifecycle hooks:
```typescript
import { createShadowRootUi } from '#imports';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'time-tracker-pill',
      position: 'overlay',
      onMount: (container, shadow) => {
        // Render your TimeDisplayPill into container
        const pill = new TimeDisplayPill(container, shadow);
        pill.render();
        return pill;
      },
      onRemove: (pill) => {
        pill?.destroy();
      },
    });

    ui.mount();
  },
});
```

**Recommendation:** Option B is cleaner long-term, but Option A is lower risk for the initial migration. Start with A, refactor to B later.

### 2.3 — Popup

**Current:** `src/popup/` → HTML + TypeScript popup UI

**WXT target:** `src/entrypoints/popup/`

```
src/entrypoints/
  popup/
    index.html          ← WXT auto-maps to action.default_popup
    main.ts
    style.css
```

This is the simplest migration — just move the files. WXT discovers `popup/index.html` and maps it to `action.default_popup` in MV3 or `browser_action.default_popup` in MV2 automatically.

Ensure `index.html` references `main.ts` via a `<script>` tag:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

---

## Phase 3: Migrate Shared Code

### 3.1 — Repository & storage layer

**Current:** `src/repositories/` (or wherever `HistoryRepository`, `TabRepository`, `SettingsRepository` live)

**WXT target:** `src/lib/` or `src/utils/`

```
src/
  lib/
    repositories/
      HistoryRepository.ts
      TabRepository.ts
      SettingsRepository.ts
    storage/
      schema.ts         ← Storage key constants, schema version
      migrations.ts     ← Forward migration logic
  utils/
    time.ts             ← Time formatting, boundary detection helpers
    messages.ts         ← Typed message definitions
```

WXT auto-imports from a few directories, but shared code in `lib/` or `utils/` is standard. These files don't need any WXT-specific wrappers.

### 3.2 — Replace `browser.*` with WXT's polyfilled `browser`

WXT provides a global `browser` variable (auto-imported) that works across Chrome and Firefox. The key changes:

| Current (Firefox-only) | WXT (cross-browser) |
|---|---|
| `browser.storage.local` | `browser.storage.local` (same API, polyfilled for Chrome) |
| `browser.runtime.sendMessage()` | `browser.runtime.sendMessage()` (same) |
| `browser.tabs.onActivated` | `browser.tabs.onActivated` (same) |
| `browser.browserAction.*` | Use `browser.action.*` — WXT maps to `browserAction` for MV2 |

Most of the existing code will work unchanged because Firefox's `browser.*` API naming is what WXT uses. The main thing to update:
- Any `browser.browserAction.*` calls → `browser.action.*`
- Remove any manual `webextension-polyfill` imports (WXT handles this)

### 3.3 — Types

Move `types/` into `src/types/` so it's inside the WXT `srcDir`. Update `tsconfig.json` paths accordingly.

---

## Phase 4: Update Configuration & Tooling

### 4.1 — `tsconfig.json`

WXT generates its own `.wxt/tsconfig.json` with correct types. Your root `tsconfig.json` should extend it:

```jsonc
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    // Keep your existing strict settings
  }
}
```

### 4.2 — ESLint

Keep your existing `eslint.config.js`. WXT doesn't impose linting. You may want to add:
```javascript
// Ignore WXT output directories
export default [
  { ignores: ['.wxt/', '.output/'] },
  // ... existing config
];
```

### 4.3 — `package.json` scripts

Replace the old Vite scripts with WXT commands:

```jsonc
{
  "scripts": {
    // Development
    "dev": "wxt",                          // Chrome, MV3, with HMR
    "dev:firefox": "wxt --browser firefox", // Firefox, MV2, with HMR

    // Production builds
    "build": "wxt build",                          // Chrome MV3
    "build:firefox": "wxt build --browser firefox", // Firefox MV2
    "build:all": "npm run build && npm run build:firefox",

    // Packaging
    "zip": "wxt zip",                          // Chrome zip for Web Store
    "zip:firefox": "wxt zip --browser firefox", // Firefox zip for AMO

    // Quality
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:e2e": "playwright test"
  }
}
```

### 4.4 — Remove old build dependencies

```bash
npm uninstall vite-plugin-web-extension web-ext
# web-ext is bundled inside WXT, so you don't need it separately
```

Delete the old files:
- `manifest.json` (top-level — WXT generates this)
- `vite.config.ts` (WXT has its own Vite config via `wxt.config.ts`)

---

## Phase 5: Verify & Test

### 5.1 — Smoke test both targets

```bash
# Chrome
npm run dev
# → Opens Chrome with extension loaded
# → Verify: pill appears, timer ticks, popup shows data, drag works

# Firefox
npm run dev:firefox
# → Opens Firefox with extension loaded
# → Same verification
```

### 5.2 — Inspect generated manifests

After building, check the output:

```bash
npm run build
cat .output/chrome-mv3/manifest.json
# Should show: manifest_version: 3, background.service_worker, action, host_permissions

npm run build:firefox
cat .output/firefox-mv2/manifest.json
# Should show: manifest_version: 2, background.scripts, browser_action, permissions includes hosts
```

### 5.3 — Run existing tests

```bash
npm test
```

Tests that mock `browser.*` APIs should still pass since the API surface is the same. Tests that import from moved file paths will need path updates.

### 5.4 — Test service worker resilience (Chrome only)

1. Install the built Chrome extension
2. Visit a site, confirm tracking starts
3. Open `chrome://serviceworker-internals/` and find the extension's worker
4. Click **Stop** to simulate idle termination
5. Switch tabs — the service worker should restart and resume tracking
6. Check popup — historical data should be intact

This validates that the MV3 state rehydration works correctly.

---

## Phase 6: CI/CD Integration

### 6.1 — GitHub Actions build matrix

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chrome, firefox]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: wxt build --browser ${{ matrix.browser }}
      - uses: actions/upload-artifact@v4
        with:
          name: extension-${{ matrix.browser }}
          path: .output/${{ matrix.browser }}-*/
```

### 6.2 — Automated store submission (release workflow)

```yaml
  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: wxt zip                          # Chrome zip
      - run: wxt zip --browser firefox        # Firefox zip
      # Upload to Chrome Web Store
      # Upload to Firefox AMO
```

---

## Migration File Mapping Summary

| Current Path | WXT Path | Notes |
|---|---|---|
| `manifest.json` | *(deleted — auto-generated)* | Manifest config lives in `wxt.config.ts` |
| `vite.config.ts` | *(deleted — replaced by `wxt.config.ts`)* | |
| `src/background/*` | `src/entrypoints/background/index.ts` + siblings | Wrap init in `defineBackground()` |
| `src/content/*` | `src/entrypoints/timer-pill.content/index.ts` + siblings | Wrap in `defineContentScript()` |
| `src/popup/*` | `src/entrypoints/popup/index.html` + siblings | Direct move, almost no changes |
| `src/repositories/*` | `src/lib/repositories/*` | No WXT-specific changes needed |
| `types/*` | `src/types/*` | Move inside `srcDir` |
| `icons/*` | `src/public/icon/{16,32,48,96,128}.png` | Rename to size-only filenames |
| `tests/*` | `tests/*` | Update import paths |
| `docs/*` | `docs/*` | No change |

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Service worker state loss on Chrome | Tracking gaps, lost session data | Phase 2.1 — persist all state to storage, rehydrate on wake |
| Shadow DOM behavior differs across browsers | Pill rendering/style issues | Test on both Chrome and Firefox early and often during dev |
| WXT version churn | Breaking changes in minor versions | Pin WXT version in `package.json`, upgrade deliberately |
| `browser.*` API gaps between Chrome and Firefox | Runtime errors on one browser | Use `browser` global from WXT, check API availability for edge cases |
| Test suite breakage from path changes | False negatives, lost coverage | Update imports in Phase 5.3, run full suite before merging |
| Alarm precision (Chrome alarms have 1-min minimum) | Late boundary detection | Accept 1-min granularity or use `chrome.storage.session` timestamps for precise tracking |

---

## Estimated Effort

| Phase | Effort | Description |
|---|---|---|
| Phase 0 — Prep | ~2 hours | Audit, snapshot, branch |
| Phase 1 — Scaffold | ~1 hour | Init WXT, merge structure |
| Phase 2 — Entrypoints | ~8–12 hours | **The bulk of the work.** Background service worker refactoring is the most complex task. |
| Phase 3 — Shared code | ~2–3 hours | Move files, update imports, API polyfill adjustments |
| Phase 4 — Config & tooling | ~1–2 hours | tsconfig, eslint, package.json scripts |
| Phase 5 — Verify & test | ~3–4 hours | Manual testing both browsers, fix test paths, service worker resilience |
| Phase 6 — CI/CD | ~2–3 hours | GitHub Actions workflows |
| **Total** | **~20–27 hours** | Roughly 3–4 focused working days |

The service worker lifecycle refactoring (Phase 2.1) is the hardest and most important part. Everything else is largely mechanical file moves and configuration.
