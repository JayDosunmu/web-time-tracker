# Release Process

This document describes the CI/CD pipeline and release process for the Take5 Time Tracker browser extension.

## Overview

The project uses GitHub Actions for continuous integration and automated releases. Changes are published automatically when a version tag is pushed.

## Workflows

### CI Workflow

**File:** `.github/workflows/ci.yml`

Runs on every push to `main`/`staging` and on pull requests. Performs:

1. **Lint** - ESLint code quality checks
2. **Type Check** - TypeScript compilation verification
3. **Test** - Jest unit tests with coverage reporting
4. **Build** - Verification builds for Chrome and Firefox

### Release Workflow

**File:** `.github/workflows/release.yml`

Triggered by pushing a version tag. Performs:

1. **Quality Gates** - Runs lint, type-check, and tests
2. **Build** - Creates production builds for Chrome (MV3) and Firefox (MV2)
3. **GitHub Release** - Creates a release with changelog and downloadable artifacts
4. **Firefox Add-ons** - Submits stable releases to Mozilla AMO for review
5. **Chrome Web Store** - Publishes stable releases to the Chrome Web Store

## How to Release

### 1. Prepare the Release

Ensure all changes are merged to `main` and the CI workflow passes.

### 2. Create a Version Tag

```bash
# For stable releases
git tag v0.1.0
git push origin v0.1.0

# For pre-releases (beta, alpha, rc)
git tag v0.1.0-beta.1
git push origin v0.1.0-beta.1
```

### 3. Monitor the Release

1. Go to the [Actions tab](https://github.com/JayDosunmu/take5-time-tracker/actions)
2. Watch the "Release" workflow progress
3. Once complete, verify the [Releases page](https://github.com/JayDosunmu/take5-time-tracker/releases)

### 4. Verify Deployment

- **Firefox**: Check submission status in the [AMO Developer Hub](https://addons.mozilla.org/developers/)
- **Chrome**: Verify the extension in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)

## Version Management

Version is managed in a single location:

- **Source of truth:** `package.json` → `version` field
- **Auto-synced:** `wxt.config.ts` imports version from `package.json`

When a tag is pushed, the release workflow extracts the version from the tag and updates `package.json` before building.

## Distribution Channels

### Firefox Add-ons (AMO)

- Submitted via `web-ext sign --channel listed`
- Goes through Mozilla's review process
- Once approved, publicly listed on [addons.mozilla.org](https://addons.mozilla.org)
- Users receive auto-updates through AMO

### Chrome Web Store

- Published automatically for stable releases
- Pre-releases (beta, alpha, rc) are skipped
- Users install from the Chrome Web Store and receive auto-updates

### GitHub Releases

- All releases (stable and pre-release) create GitHub releases
- Contains downloadable artifacts for manual installation
- Includes auto-generated changelog based on merged PRs

## Pre-release vs Stable

| Release Type | Tag Format | Store Publishing | GitHub Release |
|--------------|------------|------------------|----------------|
| Stable | `v1.0.0` | AMO + Chrome Web Store | Created |
| Pre-release | `v1.0.0-beta.1` | Skipped | Created (marked pre-release) |

## Required Secrets

The following secrets must be configured in GitHub repository settings:

### Mozilla (Firefox AMO)

| Secret | Description |
|--------|-------------|
| `MOZILLA_API_KEY` | AMO API key from [addons.mozilla.org](https://addons.mozilla.org/developers/addon/api/key/) |
| `MOZILLA_API_SECRET` | AMO API secret |

### Chrome Web Store

| Secret | Description |
|--------|-------------|
| `CHROME_EXTENSION_ID` | Extension ID from Chrome Web Store Developer Dashboard |
| `CHROME_CLIENT_ID` | OAuth 2.0 client ID from Google Cloud Console |
| `CHROME_CLIENT_SECRET` | OAuth 2.0 client secret |
| `CHROME_REFRESH_TOKEN` | OAuth refresh token for API access |

## Setting Up Secrets

### Mozilla AMO API

1. Go to [AMO Developer Hub](https://addons.mozilla.org/developers/)
2. Navigate to **Tools** → **Manage API Keys**
3. Generate a new API key
4. Add `MOZILLA_API_KEY` and `MOZILLA_API_SECRET` to GitHub secrets

### Chrome Web Store

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials (Desktop app type)
3. Enable the Chrome Web Store API
4. Use the [chrome-webstore-upload](https://github.com/nicholasf/chrome-webstore-upload) tool to get a refresh token
5. Add all four Chrome secrets to GitHub

## Troubleshooting

### Build Failures

- Check the CI workflow logs for specific errors
- Run `npm run lint`, `npm run type-check`, and `npm test` locally

### Firefox AMO Submission Failures

- Verify Mozilla API credentials are valid
- Check that the extension ID matches `time-tracker@heytakefive.com`
- Ensure the version hasn't been previously submitted
- Review AMO's [add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)

### Chrome Web Store Failures

- Verify OAuth credentials are valid
- Check that the refresh token hasn't expired
- Ensure the extension ID is correct
- Review Chrome's [extension policies](https://developer.chrome.com/docs/webstore/program-policies/)

### Review Rejections

Both AMO and Chrome Web Store have review processes. If rejected:

1. Read the rejection reason carefully
2. Make necessary changes
3. Create a new version tag to resubmit
