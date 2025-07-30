/**
 * Jest test setup with browser API mocks
 */

import chrome from 'sinon-chrome';

// Set up global browser API mock
(global as any).browser = chrome;
(global as any).chrome = chrome;

// Set up common browser API defaults
beforeEach(() => {
  // Silence console logs
  const consoleLogSpy = jest.spyOn(console, 'log')
  consoleLogSpy.mockImplementation(() => { return })

  const consoleWarnSpy = jest.spyOn(console, 'warn')
  consoleWarnSpy.mockImplementation(() => { return })

  const consoleErrorSpy = jest.spyOn(console, 'error')
  consoleErrorSpy.mockImplementation(() => { return })

  // Reset all mocks before each test
  chrome.flush();
  
  // Create stateful storage mock
  const storage = new Map<string, any>();
  
  chrome.storage.local.get.callsFake(async (keys) => {
    if (!keys) return Object.fromEntries(storage.entries());
    const keyArray = Array.isArray(keys) ? keys : [keys];
    const result: any = {};
    keyArray.forEach(key => {
      if (storage.has(key)) result[key] = storage.get(key);
    });
    return result;
  });
  
  chrome.storage.local.set.callsFake(async (items) => {
    Object.entries(items).forEach(([key, value]) => {
      storage.set(key, value);
    });
  });
  
  chrome.storage.local.remove.callsFake(async (keys) => {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    keyArray.forEach(key => storage.delete(key));
  });
  
  chrome.storage.local.clear.callsFake(async () => {
    storage.clear();
  });

  // Set up browser API methods
  chrome.tabs.get.resolves({
    id: 1,
    url: 'https://example.com',
    active: true,
    windowId: 1
  });

  // Set up browser constants
  (chrome.windows as any).WINDOW_ID_NONE = -1;

  // Set up browser event listeners as Jest mock functions
  (chrome.tabs.onActivated as any).addListener = jest.fn();
  (chrome.tabs.onUpdated as any).addListener = jest.fn();
  (chrome.windows.onFocusChanged as any).addListener = jest.fn();
  (chrome.webNavigation.onCompleted as any).addListener = jest.fn();
});

afterEach(() => {
  // Restore all mocks after each test
  jest.restoreAllMocks();
});

// Global test timeout
jest.setTimeout(10000);