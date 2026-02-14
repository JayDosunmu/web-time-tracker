# ADR-0004: WXT Framework Migration

**Date:** 2026-02-14

**Status:** Accepted

## Context

The extension was built using Vite with `vite-plugin-web-extension`, targeting Firefox only with Manifest V2. This setup had several limitations:

1. **Single browser support**: Only Firefox builds were supported, limiting the extension's reach
2. **Manual manifest management**: A 52-line `manifest.json` required manual updates for paths, permissions, and icons
3. **Manual icon handling**: Required custom `onBundleReady` hooks to copy icon files
4. **No Manifest V3 support**: Chrome Web Store requires MV3 for new extensions, and Firefox is transitioning to MV3

The industry-wide shift to Manifest V3 created urgency:
- Chrome enforces MV3 for new extensions and is deprecating MV2
- MV3 introduces service workers (replacing persistent background pages), requiring architectural changes
- Service workers cannot use `setInterval`—they may be suspended at any time

We evaluated three approaches in [web-time-tracker-maturity-guide.md](../plans/web-time-tracker-maturity-guide.md):
1. Manual dual-manifest maintenance
2. Build-time manifest switching with Vite plugins
3. **WXT framework** (selected)

## Decision

Adopt **WXT framework** (v0.20.17) as the extension build system, replacing `vite-plugin-web-extension` entirely.

WXT is an opinionated, TypeScript-first framework specifically designed for cross-browser extension development with built-in support for both MV2 and MV3.

## Consequences

### Positive

- **Cross-browser support**: Single codebase builds for Chrome (MV3) and Firefox (MV2/MV3) via `--browser` flag
- **Automatic manifest generation**: Declarative config in `wxt.config.ts` (36 lines) replaces manual `manifest.json`
- **Built-in MV3 patterns**: `defineBackground()` wrapper handles service worker lifecycle correctly
- **Auto-discovery**: Entrypoints and icons discovered from directory structure
- **Simplified scripts**: `wxt build`, `wxt zip`, `wxt dev` handle all browser variants
- **Hot Module Replacement**: Dev mode supports HMR for faster iteration
- **TypeScript-first**: Auto-generated types for browser APIs and manifest

### Negative

- **WXT-specific wrappers**: Background and content scripts require `defineBackground()` and `defineContentScript()` wrappers
- **Reduced Vite control**: Vite configuration limited to `vite: () => ({})` callback in config
- **Framework dependency**: Tied to WXT's release cycle and stability (pinned at 0.20.17)
- **Learning curve**: Team must learn WXT conventions and entrypoint structure

### Neutral

- **Directory restructure**: Source reorganized into `src/entrypoints/` for WXT auto-discovery
- **Alarms API adoption**: `setInterval` replaced with `browser.alarms` for MV3 service worker compatibility
- **New permission**: `alarms` permission added to manifest

## Implementation

### Files Removed
- `vite.config.ts` — replaced by `wxt.config.ts`
- `manifest.json` — now auto-generated from config

### Files Added
- `wxt.config.ts` — declarative extension configuration
- `src/entrypoints/background/index.ts` — service worker entrypoint
- `src/entrypoints/timer-pill.content/index.ts` — content script entrypoint
- `src/entrypoints/popup/` — popup UI entrypoint

### Key Patterns

**Service Worker Registration** (MV3 requirement):
```typescript
// src/entrypoints/background/index.ts
export default defineBackground(() => {
  // Event listeners MUST be registered synchronously
  browser.runtime.onInstalled.addListener(handleInstall);
  browser.tabs.onActivated.addListener(handleTabActivated);

  // Async initialization deferred
  initAsync().then(() => { /* ready */ });
});
```

**Content Script with Shadow DOM**:
```typescript
// src/entrypoints/timer-pill.content/index.ts
export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, { /* ... */ });
    ui.mount();
  },
});
```

### Build Scripts
```json
{
  "dev": "wxt",
  "dev:firefox": "wxt --browser firefox",
  "build": "wxt build",
  "build:firefox": "wxt build --browser firefox",
  "zip": "wxt zip",
  "zip:firefox": "wxt zip --browser firefox"
}
```

## References

- [WXT Documentation](https://wxt.dev/)
- [docs/plans/wxt-migration-plan.md](../plans/wxt-migration-plan.md) — detailed migration guide
- [docs/plans/web-time-tracker-maturity-guide.md](../plans/web-time-tracker-maturity-guide.md) — option analysis
- Commit `e4564b5` — "Migrate to wxt"
