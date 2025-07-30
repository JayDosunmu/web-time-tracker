/**
 * Jest test setup with browser API mocks
 */

import chrome from 'sinon-chrome';

// Set up global browser API mock
(global as any).browser = chrome;
(global as any).chrome = chrome;

// Mock webextension-polyfill
jest.mock('webextension-polyfill', () => chrome);

// Set up common browser API defaults
beforeEach(() => {
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
  
  // Set up tabs API
  chrome.tabs.query.resolves([]);
  chrome.tabs.get.resolves({
    id: 1,
    url: 'https://example.com',
    active: true,
    windowId: 1
  });
  chrome.tabs.sendMessage.resolves();
  
  // Set up runtime API
  chrome.runtime.sendMessage.resolves();
  // Event listeners don't need return value mocking
  
  // Set up windows API
  chrome.windows.getCurrent.resolves({
    id: 1,
    focused: true,
    type: 'normal'
  });
  
  // Set up webNavigation API
  // Event listeners don't need return value mocking
  
  // Mock performance.now for consistent timing
  jest.spyOn(performance, 'now').mockReturnValue(1000);
  
  // Mock Date.now for consistent timestamps
  jest.spyOn(Date, 'now').mockReturnValue(1640995200000); // 2022-01-01 00:00:00 UTC
});

afterEach(() => {
  // Restore all mocks after each test
  jest.restoreAllMocks();
});

// Global test timeout
jest.setTimeout(10000);