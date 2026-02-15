/**
 * WXT Content script entrypoint
 * Manages the timer pill UI overlay on web pages
 */

import '../../content/styles/content.css';
import { ContentScriptManager } from '../../content/ContentScriptManager';

// Generate unique instance ID for this content script load
const CONTENT_SCRIPT_INSTANCE_ID = `cs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  allFrames: false,
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Skip initialization on excluded protocols
    if (!shouldInitialize()) {
      return;
    }

    console.log(`[${CONTENT_SCRIPT_INSTANCE_ID}] 🚀 Content script STARTING - URL: ${window.location.href}`);

    // Get manager instance and pass context for createShadowRootUi
    const contentManager = ContentScriptManager.getInstance();
    console.log(`[${CONTENT_SCRIPT_INSTANCE_ID}] 📦 ContentScriptManager instance obtained`);

    // Set the WXT context for Shadow DOM UI creation
    contentManager.setContext(ctx);
    console.log(`[${CONTENT_SCRIPT_INSTANCE_ID}] 🔗 WXT context set on manager`);

    // Initialize manager
    await contentManager.initialize();
    console.log(`[${CONTENT_SCRIPT_INSTANCE_ID}] ✅ ContentScriptManager initialized`);

    // Set up URL change detection for single-page applications
    setupUrlChangeDetection(contentManager);

    // WXT provides ctx.onInvalidated for cleanup
    ctx.onInvalidated(() => {
      console.log(`[${CONTENT_SCRIPT_INSTANCE_ID}] ⚠️ ctx.onInvalidated CALLED - cleaning up...`);
      contentManager.destroy();
      console.log(`[${CONTENT_SCRIPT_INSTANCE_ID}] 🧹 ContentScriptManager.destroy() completed`);
    });

    console.log(`[${CONTENT_SCRIPT_INSTANCE_ID}] 🎉 Content script FULLY INITIALIZED`);
  },
});

/**
 * Check if content script should initialize
 */
function shouldInitialize(): boolean {
  const protocol = window.location.protocol;

  // Skip on chrome:// and moz-extension:// pages
  if (
    protocol === 'chrome:' ||
    protocol === 'moz-extension:' ||
    protocol === 'chrome-extension:'
  ) {
    return false;
  }

  // Skip on local file URLs
  if (protocol === 'file:') {
    return false;
  }

  // Only initialize on http/https pages
  return protocol === 'http:' || protocol === 'https:';
}

/**
 * Set up URL change detection for single-page applications
 */
function setupUrlChangeDetection(contentManager: ContentScriptManager): void {
  let currentUrl = window.location.href;

  // Override history methods to detect programmatic navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args): void {
    originalPushState.apply(history, args);
    handleUrlChange();
  };

  history.replaceState = function (...args): void {
    originalReplaceState.apply(history, args);
    handleUrlChange();
  };

  // Listen for popstate events (back/forward navigation)
  window.addEventListener('popstate', handleUrlChange);

  // Listen for hashchange events
  window.addEventListener('hashchange', handleUrlChange);

  function handleUrlChange(): void {
    const newUrl = window.location.href;
    if (newUrl !== currentUrl) {
      currentUrl = newUrl;
      contentManager.handleUrlChange(newUrl);
    }
  }
}
