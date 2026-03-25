# Web Time Tracker — Maturity & Productionization Guide

An analysis of [JayDosunmu/web-time-tracker](https://github.com/JayDosunmu/web-time-tracker) with concrete recommendations for maturing the codebase and building a production pipeline that targets both Manifest V2 and V3.

---

## 1. Current State Assessment

The repo is a Firefox-only TypeScript extension built with Vite + `vite-plugin-web-extension`, using Jest for testing and `web-ext` for development. It has a well-documented architecture (component diagrams, data-flow docs, sequence diagrams), a clean layered design (Content → Background → Repository → Storage), and 37 commits across 2 contributors. There are **no releases, no CI/CD, no cross-browser support**, and the manifest is V2-only (Firefox).

---

## 2. Maturity Improvements

### 2.1 Testing & Quality

**Expand test coverage significantly.** The `tests/` directory exists but for a project with this many moving parts (background service, data model manager, time tracker, repositories, content script, message router), you need:

- **Unit tests** for every repository class (`HistoryRepository`, `TabRepository`, `SettingsRepository`) and core logic (`DataModelManager`, `TimeTracker`), mocking `browser.storage.local`.
- **Integration tests** that verify the message flow between content and background layers using `jest-webextension-mock` or `sinon-chrome`.
- **E2E tests** with Playwright or Puppeteer driving a real Firefox (and eventually Chrome) instance — validating the timer pill appears, drag-persist works, popup shows correct aggregated data, and day-boundary rollover behaves correctly.
- **Coverage gates**: Enforce a minimum threshold (e.g., 80%) in CI. Use `jest --coverage` and fail the build if it drops.

**Add linting and formatting enforcement:**
- The repo has `eslint.config.js` but no evidence of Prettier or a pre-commit hook. Add `prettier`, `lint-staged`, and `husky` so formatting and lint rules are enforced automatically on every commit.

### 2.2 Versioning & Release Management

**Adopt semantic versioning and automated changelogs:**
- Use [Changesets](https://github.com/changesets/changesets) or [standard-version](https://github.com/conventional-changelog/standard-version) to manage version bumps tied to commit messages.
- Create GitHub Releases with auto-generated changelogs for each version.
- Tag every release so users (and store reviewers) can always map a build artifact back to a specific commit.

**Use `npm version` or Changesets in CI** to bump `manifest.json` version and `package.json` version in lockstep.

### 2.3 Documentation & Contribution

The existing architectural docs are a strong foundation. To mature further:

- Add a **CONTRIBUTING.md** with branching strategy (e.g., `main` is always releasable, feature branches off `main`, PRs require review).
- Add a **CODE_OF_CONDUCT.md**.
- Add **issue and PR templates** (`.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`).
- Expand the README with badges (CI status, coverage, latest version, license).
- Document the data schema and storage keys more formally — useful for migration logic later.

### 2.4 Error Handling & Observability

- Add structured error handling throughout the background service. Currently, if `browser.storage.local.get` fails or a message is malformed, it's unclear how the system degrades.
- Consider a lightweight in-extension error log (stored in `browser.storage.local` with a rolling cap) so users can export debug info for bug reports.
- Add `console.debug` logging gated behind a `DEBUG` build flag that gets stripped in production builds.

### 2.5 Security & Privacy

- Add a **privacy policy page** (required by both Chrome Web Store and Firefox Add-ons).
- Declare the minimal permissions necessary. Audit whether `<all_urls>` or broad host permissions are actually needed, or whether `activeTab` suffices for certain operations.
- If you ever add data export/import, validate and sanitize imported JSON to prevent storage injection.

### 2.6 Performance & Robustness

- **Service worker readiness (MV3):** The current background script likely assumes persistence. MV3 service workers terminate after ~5 minutes of inactivity. You'll need to persist state to storage more aggressively and re-hydrate on wake-up. This is the single biggest architectural change for MV3 compatibility.
- **Alarm-based interval tracking:** Replace `setInterval` (which dies with the service worker) with `browser.alarms` for periodic tasks like hour/day boundary detection.
- **Storage migrations:** Add a `schemaVersion` key to storage and write forward-migration logic so updates don't corrupt user data.

---

## 3. Cross-Browser & Dual Manifest Pipeline

This is the core of productionizing the extension for real-world distribution. The goal: **one codebase → two manifest versions → multiple browser targets**.

### 3.1 Strategy Overview

| Target | Manifest | Store |
|--------|----------|-------|
| Chrome / Edge / Opera | V3 (required since June 2025) | Chrome Web Store |
| Firefox | V3 (supported) or V2 (legacy, still functional) | Firefox Add-ons (AMO) |
| Safari | V3 | App Store (via Xcode conversion) |

Chrome Web Store now **requires** Manifest V3 for all new submissions and updates. Firefox fully supports V3 but also still accepts V2. The pragmatic approach is to target V3 as the primary manifest and only produce a V2 artifact if you need to support very old Firefox versions.

### 3.2 Option A — Migrate to WXT (Recommended)

[WXT](https://wxt.dev/) is the leading framework for cross-browser extension development. It sits on top of Vite, auto-generates manifests from your project structure, and handles the V2/V3 differences transparently. This is the cleanest migration path:

**Why WXT:**
- Builds for Chrome (MV3) and Firefox (MV2 or MV3) from a single codebase with `wxt build` and `wxt build --browser firefox`.
- Auto-generates `manifest.json` from file conventions (e.g., `entrypoints/background.ts`, `entrypoints/popup.html`, `entrypoints/content.ts`).
- Provides `browser.*` API polyfill so you write one set of API calls regardless of browser.
- Built-in zip, upload, and publish commands for store submission.
- HMR for content scripts and popup UI during development.
- Framework-agnostic (works with vanilla TS, React, Vue, Svelte).

**Migration steps:**
1. Scaffold a WXT project: `pnpm dlx wxt@latest init web-time-tracker-wxt --template vanilla --pm npm`
2. Move source from `src/` into WXT's `entrypoints/` directory, mapping:
   - `src/background/` → `entrypoints/background.ts`
   - `src/content/` → `entrypoints/content.ts` (with `defineContentScript()` wrapper)
   - `src/popup/` → `entrypoints/popup/` (HTML + TS)
3. Move repository/storage layer into a shared `lib/` or `utils/` directory.
4. Configure `wxt.config.ts` with permissions, icons, and any manifest overrides.
5. Replace `browser.*` calls with WXT's auto-imported `browser` global (which polyfills across Chrome/Firefox).
6. Build commands become:
   - `wxt build` → Chrome MV3 artifact in `.output/chrome-mv3`
   - `wxt build --browser firefox` → Firefox MV2 artifact in `.output/firefox-mv2`
   - `wxt build --browser firefox --mv3` → Firefox MV3 artifact

### 3.3 Option B — Dual Manifest with Vite (Stay with Current Stack)

If migrating to WXT is too disruptive, you can keep your current Vite + `vite-plugin-web-extension` setup and produce dual artifacts yourself:

**Directory structure:**
```
manifests/
  manifest.v2.json    # Firefox MV2 (background.scripts, browser_action)
  manifest.v3.json    # Chrome MV3 (background.service_worker, action)
vite.config.chrome.ts # Imports manifest.v3.json, outputs to dist/chrome
vite.config.firefox.ts # Imports manifest.v2.json, outputs to dist/firefox
```

**Key manifest differences to handle:**

```jsonc
// MV2 (Firefox)
{
  "manifest_version": 2,
  "background": { "scripts": ["src/background/index.ts"] },
  "browser_action": { "default_popup": "src/popup/index.html" },
  "permissions": ["tabs", "storage", "webNavigation", "<all_urls>"]
}

// MV3 (Chrome)
{
  "manifest_version": 3,
  "background": { "service_worker": "src/background/index.ts", "type": "module" },
  "action": { "default_popup": "src/popup/index.html" },
  "permissions": ["tabs", "storage", "webNavigation"],
  "host_permissions": ["<all_urls>"]
}
```

**Abstraction layer for API differences:**
```typescript
// src/lib/compat.ts
export const action = globalThis.chrome?.action ?? globalThis.browser?.browserAction;
export const isServiceWorker = 'ServiceWorkerGlobalScope' in globalThis;
```

**Build scripts in `package.json`:**
```json
{
  "scripts": {
    "build:chrome": "vite build --config vite.config.chrome.ts",
    "build:firefox": "vite build --config vite.config.firefox.ts",
    "build:all": "npm run build:chrome && npm run build:firefox",
    "zip:chrome": "cd dist/chrome && zip -r ../../releases/chrome.zip .",
    "zip:firefox": "cd dist/firefox && zip -r ../../releases/firefox.zip ."
  }
}
```

### 3.4 CI/CD Pipeline (GitHub Actions)

Regardless of whether you choose WXT or stay with Vite, here's the pipeline structure:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck    # tsc --noEmit
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v4  # Optional: upload coverage

  build:
    needs: lint-and-test
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target: [chrome, firefox]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build:${{ matrix.target }}
      - uses: actions/upload-artifact@v4
        with:
          name: extension-${{ matrix.target }}
          path: dist/${{ matrix.target }}/

  e2e:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium firefox
      - uses: actions/download-artifact@v4
      - run: npm run test:e2e
```

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build:all
      - run: npm run zip:chrome && npm run zip:firefox

      # Create GitHub Release with both zips
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            releases/chrome.zip
            releases/firefox.zip

      # Optional: auto-submit to stores
      # Chrome Web Store: use "browser-actions/release-chrome-extension"
      # Firefox AMO: use "yayuyokitano/firefox-addon" or web-ext sign
```

### 3.5 Store Submission Automation

**Chrome Web Store:**
- Use the [Chrome Web Store Publish API](https://developer.chrome.com/docs/webstore/using_webstore_api/) or the `chrome-webstore-upload-cli` package.
- Store your `EXTENSION_ID`, `CLIENT_ID`, `CLIENT_SECRET`, and `REFRESH_TOKEN` as GitHub Secrets.
- Add a step to the release workflow: `npx chrome-webstore-upload-cli upload --source releases/chrome.zip --auto-publish`

**Firefox Add-ons (AMO):**
- Use `web-ext sign` with your API credentials (`WEB_EXT_API_KEY`, `WEB_EXT_API_SECRET` as secrets).
- Or use the [AMO Submit API](https://addons-server.readthedocs.io/) directly.

---

## 4. Summary: Recommended Roadmap

| Phase | Actions | Priority |
|-------|---------|----------|
| **Phase 1: Foundation** | Add CI (lint + test + build), Husky/lint-staged, CONTRIBUTING.md, issue templates | 🔴 High |
| **Phase 2: Quality** | Expand test coverage to 80%+, add integration tests, add E2E with Playwright | 🔴 High |
| **Phase 3: MV3 Readiness** | Refactor background to handle service worker lifecycle (alarms, state rehydration), add storage migration logic | 🔴 High |
| **Phase 4: Cross-Browser** | Migrate to WXT **or** set up dual Vite configs, produce Chrome + Firefox artifacts | 🟠 Medium |
| **Phase 5: Release Pipeline** | Semantic versioning, GitHub Releases with zipped artifacts, automated changelogs | 🟠 Medium |
| **Phase 6: Store Publishing** | Privacy policy, store assets (screenshots, descriptions), automated submission in CI | 🟡 Lower |
| **Phase 7: Observability** | Debug logging with build flags, in-extension error log, user-facing "export debug info" | 🟡 Lower |

The single highest-impact recommendation is **adopting WXT**. It eliminates the entire class of problems around manifest version differences, cross-browser API polyfilling, and build configuration duplication — letting you focus on the product rather than the plumbing.
