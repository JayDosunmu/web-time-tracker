# CI/CD Setup Checklist

This document outlines the steps required to enable automated publishing to Firefox Add-ons (AMO) and Chrome Web Store.

## Prerequisites

- [ ] GitHub repository with Actions enabled
- [ ] Firefox account at [addons.mozilla.org](https://addons.mozilla.org)
- [ ] Google account for Chrome Web Store

---

## 1. Mozilla Add-ons (Firefox)

### Get API Credentials

1. Go to [addons.mozilla.org/developers](https://addons.mozilla.org/developers/)
2. Sign in with your Firefox account
3. Navigate to **Tools** → **Manage API Keys**
4. Click **Generate new credentials**
5. Save the JWT issuer and JWT secret

### Add GitHub Secrets

| Secret | Value |
|--------|-------|
| `MOZILLA_API_KEY` | Your JWT issuer |
| `MOZILLA_API_SECRET` | Your JWT secret |

### First-Time Submission

For the first release, you may need to manually submit the extension through the AMO web interface to establish the listing. Subsequent releases can be automated.

---

## 2. Chrome Web Store

### Register as a Developer

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay the one-time $5 registration fee
3. Complete account verification

### Create Extension Listing

1. In the Developer Dashboard, click **New Item**
2. Upload a zip of your extension (can use output from `npm run build`)
3. Fill in required metadata (name, description, icons, screenshots)
4. Save as draft (don't publish yet)
5. Note your **Extension ID** from the dashboard URL

### Set Up Google Cloud OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the **Chrome Web Store API**:
   - Go to **APIs & Services** → **Library**
   - Search for "Chrome Web Store API"
   - Click **Enable**
4. Create OAuth credentials:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Select **Desktop app** as application type
   - Name it (e.g., "GitHub Actions CI")
   - Click **Create**
5. Download or copy the **Client ID** and **Client Secret**

### Get Refresh Token

Install the CLI tool and authorize:

```bash
npx chrome-webstore-upload-cli init
```

When prompted:
1. Enter your Client ID
2. Enter your Client Secret
3. A browser window opens - sign in and authorize
4. Copy the **refresh token** from the output

### Add GitHub Secrets

| Secret | Value |
|--------|-------|
| `CHROME_EXTENSION_ID` | Extension ID from Developer Dashboard |
| `CHROME_CLIENT_ID` | OAuth client ID from Google Cloud |
| `CHROME_CLIENT_SECRET` | OAuth client secret from Google Cloud |
| `CHROME_REFRESH_TOKEN` | Token from chrome-webstore-upload-cli |

---

## 3. Add Secrets to GitHub

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret from the tables above (6 total)

### Required Secrets Summary

| Secret | Platform | Required |
|--------|----------|----------|
| `MOZILLA_API_KEY` | Firefox AMO | Yes |
| `MOZILLA_API_SECRET` | Firefox AMO | Yes |
| `CHROME_EXTENSION_ID` | Chrome Web Store | Yes |
| `CHROME_CLIENT_ID` | Chrome Web Store | Yes |
| `CHROME_CLIENT_SECRET` | Chrome Web Store | Yes |
| `CHROME_REFRESH_TOKEN` | Chrome Web Store | Yes |

---

## 4. Test the Pipeline

### Pre-release Test

Push a pre-release tag to test the build without publishing to stores:

```bash
git tag v0.0.2-beta.1
git push origin v0.0.2-beta.1
```

This will:
- Run quality gates
- Build both browser extensions
- Create a GitHub Release (marked as pre-release)
- Skip store publishing

### Stable Release

Once verified, push a stable tag:

```bash
git tag v0.0.2
git push origin v0.0.2
```

This will:
- Run quality gates
- Build both browser extensions
- Submit to Firefox Add-ons (enters review queue)
- Publish to Chrome Web Store
- Create a GitHub Release

---

## Troubleshooting

### Mozilla API Errors

- **Invalid credentials**: Regenerate API keys at AMO
- **Version already exists**: Bump the version number
- **Add-on not found**: First submission must be done manually via AMO web UI

### Chrome Web Store Errors

- **Invalid refresh token**: Re-run `chrome-webstore-upload-cli init`
- **Extension not found**: Verify the extension ID matches your dashboard
- **API not enabled**: Ensure Chrome Web Store API is enabled in Google Cloud

### General Issues

- Check the Actions tab in GitHub for detailed error logs
- Verify all 6 secrets are correctly named and have valid values
- Ensure the extension builds locally with `npm run build:all`
