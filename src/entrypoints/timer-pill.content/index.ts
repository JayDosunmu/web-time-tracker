/**
 * WXT Content script entrypoint
 * Manages the timer pill UI overlay on web pages
 */

import '../../content/styles/content.css';
import { ContentScriptManager } from '../../content/ContentScriptManager';

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

    console.log('Initializing Web Time Tracker content script...');

    // Get manager instance and pass context for createShadowRootUi
    const contentManager = ContentScriptManager.getInstance();

    // Set the WXT context for Shadow DOM UI creation
    contentManager.setContext(ctx);

    // Initialize manager
    await contentManager.initialize();

    // Set up URL change detection for single-page applications
    setupUrlChangeDetection(contentManager);

    // WXT provides ctx.onInvalidated for cleanup
    ctx.onInvalidated(() => {
      console.log('Content script invalidated, cleaning up...');
      contentManager.destroy();
    });

    console.log('Web Time Tracker content script initialized successfully');
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
