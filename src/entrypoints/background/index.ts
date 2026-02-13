/**
 * WXT Background entrypoint
 * Initializes the background service for time tracking
 */

import { PersistenceManager } from "@/shared";
import { BackgroundService } from "../../background/background";
import { DataModelManager } from "../../background/services/DataModelManager";
import { TimeTracker } from "../../background/services/TimeTracker";
import {
  HistoryRepository,
  TabRepository,
  SettingsRepository,
} from "../../shared/repositories";

export default defineBackground(() => {
  const baseStorage = browser.storage.local;
  const storage = PersistenceManager.getInstance(baseStorage);

  // Initialize repositories (synchronous)
  const historyRepository = HistoryRepository.getInstance(storage);
  const tabRepository = TabRepository.getInstance(storage);
  const settingsRepository = SettingsRepository.getInstance(storage);

  // Initialize DataModelManager (synchronous constructor)
  const dataModelManager = DataModelManager.getInstance(
    historyRepository,
    tabRepository,
    settingsRepository,
  );

  // Initialize TimeTracker (synchronous)
  const timeTracker = TimeTracker.getInstance(dataModelManager);

  // Initialize BackgroundService (synchronous constructor)
  const backgroundService = BackgroundService.getInstance(
    dataModelManager,
    timeTracker,
    settingsRepository,
  );

  // Register event listeners SYNCHRONOUSLY (MV3 requirement)
  // Event listeners must be registered in the top-level scope
  // before any async operations
  backgroundService.registerEventListeners();

  // Register alarm handlers for boundary detection (MV3 replacement for setTimeout)
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "hour-boundary") {
      dataModelManager.handleHourElapsed();
    } else if (alarm.name === "day-boundary") {
      dataModelManager.handleDayElapsed();
    }
  });

  // Handle extension install/update events
  browser.runtime.onInstalled.addListener(async (details) => {
    console.log(`Extension ${details.reason}: notifying existing tabs`);

    // Wait a short moment for content scripts to be ready
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Notify all HTTP/HTTPS tabs to refresh their state
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url?.startsWith("http")) {
        try {
          await browser.tabs.sendMessage(tab.id, {
            type: "REFRESH_STATE",
            payload: { reason: "service_ready" },
            id: `bg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            timestamp: Date.now(),
          });
        } catch {
          // Content script may not be loaded on this tab - this is expected
        }
      }
    }
  });

  // Async initialization (runs after event listeners are registered)
  backgroundService.initialize().catch((error) => {
    console.error("Failed to initialize background service:", error);
  });

  console.log("Web Time Tracker background service started");
});
