/**
 * Content script entry point for Web Time Tracker extension
 */

import { ContentScriptManager } from "./ContentScriptManager";

// Global manager instance
let contentManager: ContentScriptManager | null = null;

/**
 * Initialize content script
 */
async function initializeContentScript(): Promise<void> {
  try {
    // Skip initialization on excluded protocols or special pages
    if (!shouldInitialize()) {
      return;
    }

    console.log("Initializing Web Time Tracker content script...");

    // Get manager instance
    contentManager = ContentScriptManager.getInstance();

    // Initialize manager
    await contentManager.initialize();

    // Set up URL change detection for single-page applications
    setupUrlChangeDetection();

    // Set up page visibility change detection
    setupVisibilityChangeDetection();

    console.log("Web Time Tracker content script initialized successfully");
  } catch (error) {
    console.error("Content script initialization failed:", error);
  }
}

/**
 * Check if content script should initialize
 */
function shouldInitialize(): boolean {
  // Skip on chrome:// and moz-extension:// pages
  if (
    window.location.protocol === "chrome:" ||
    window.location.protocol === "moz-extension:" ||
    window.location.protocol === "chrome-extension:"
  ) {
    return false;
  }

  // Skip on local file URLs
  if (window.location.protocol === "file:") {
    return false;
  }

  // Only initialize on http/https pages
  return (
    window.location.protocol === "http:" ||
    window.location.protocol === "https:"
  );
}

/**
 * Set up URL change detection for single-page applications
 */
function setupUrlChangeDetection(): void {
  if (!contentManager) return;

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
  window.addEventListener("popstate", handleUrlChange);

  // Listen for hashchange events
  window.addEventListener("hashchange", handleUrlChange);

  function handleUrlChange(): void {
    const newUrl = window.location.href;
    if (newUrl !== currentUrl) {
      currentUrl = newUrl;
      if (contentManager) {
        contentManager.handleUrlChange(newUrl);
      }
    }
  }
}

/**
 * Set up page visibility change detection
 * TODO: This can likely be removed
 */
function setupVisibilityChangeDetection(): void {
  if (!contentManager) return;

  document.addEventListener("visibilitychange", () => {
    if (contentManager) {
      // Note: Page visibility changes are handled by the background service
      // through window focus events, but we could add additional logic here
      // if needed for content script specific behavior
      console.log(`Page visibility changed: ${document.visibilityState}`);
    }
  });
}

/**
 * Cleanup on page unload
 */
function cleanup(): void {
  if (contentManager) {
    try {
      contentManager.destroy();
      contentManager = null;
    } catch (error) {
      console.error("Content script cleanup error:", error);
    }
  }
}

// Initialize when script loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeContentScript);
} else {
  initializeContentScript();
}

// Cleanup on page unload
window.addEventListener("beforeunload", cleanup);

// Also cleanup if the script is somehow reloaded
window.addEventListener("unload", cleanup);

// Export for testing (browser environment)
(window as any).WebTimeTrackerContentScript = {
  initializeContentScript,
  shouldInitialize,
  setupUrlChangeDetection,
  setupVisibilityChangeDetection,
  cleanup,
};
