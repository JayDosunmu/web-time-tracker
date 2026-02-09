import { type FunctionComponent } from "preact";
import { useState, useEffect } from "preact/hooks";

interface SessionData {
  domain: string;
  currentTime: number;
  isActive: boolean;
  isPaused: boolean;
  startTime: number;
}

interface StorageData {
  domains: Record<string, any>;
  activeSession: any;
  settings: any;
  version: number;
  installDate: number;
}

interface PopupState {
  currentSession: SessionData | null;
  todayTotal: number;
  loading: boolean;
  error: string | null;
  showDebug: boolean;
  storageData: StorageData | null;
}

/**
 * Format nanoseconds to HH:MM:SS display string
 */
function formatTime(nanoseconds: number): string {
  const totalSeconds = Math.floor(nanoseconds / 1000_000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Get today's date as ISO string (YYYY-MM-DD)
 */
function getTodayKey(): string {
  return new Date().toISOString().split("T")[0];
}

export const App: FunctionComponent = () => {
  const [state, setState] = useState<PopupState>({
    currentSession: null,
    todayTotal: 0,
    loading: true,
    error: null,
    showDebug: false,
    storageData: null,
  });

  useEffect(() => {
    async function loadData(): Promise<void> {
      try {
        // Get current tab to determine domain
        const [activeTab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        const currentDomain = activeTab?.url
          ? new URL(activeTab.url).hostname
          : null;

        // Get all storage data
        const data = await browser.storage.local.get(null);
        const domains = data.domains || {};
        const activeSession = data.activeSession;

        // Calculate today's total from all domains
        const todayKey = getTodayKey();
        let todayTotal = 0;
        for (const domainData of Object.values(domains)) {
          const daily = (domainData as any).dailyStats?.[todayKey] || 0;
          todayTotal += daily;
        }

        // Get current session data if active and matches current tab
        let currentSession: SessionData | null = null;
        if (
          activeSession &&
          currentDomain &&
          activeSession.domain === currentDomain
        ) {
          const elapsed = Date.now() - activeSession.startTime;
          console.log(elapsed);
          currentSession = {
            domain: activeSession.domain,
            currentTime: elapsed,
            isActive: !activeSession.isPaused,
            isPaused: activeSession.isPaused || false,
            startTime: activeSession.startTime,
          };
        }

        setState((prev) => ({
          ...prev,
          currentSession,
          todayTotal,
          loading: false,
          error: null,
          storageData: {
            domains: data.domains || {},
            activeSession: data.activeSession || null,
            settings: data.settings || {},
            version: data.version || 0,
            installDate: data.installDate || 0,
          },
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : "Failed to load data",
        }));
      }
    }

    loadData();

    // Update every second for live time display
    const interval = window.setInterval(loadData, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const toggleDebug = (): void => {
    setState((prev) => ({ ...prev, showDebug: !prev.showDebug }));
  };

  if (state.loading) {
    return (
      <div class="popup-container">
        <div class="loading">Loading...</div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div class="popup-container">
        <div class="error">{state.error}</div>
      </div>
    );
  }

  return (
    <div class="popup-container">
      <header class="header">
        <h1>Web Time Tracker</h1>
      </header>

      <section class="current-session">
        <h2>Current Session</h2>
        {state.currentSession ? (
          <div class="session-info">
            <div class="time-display">
              {formatTime(state.currentSession.currentTime)}
            </div>
            <div class="domain-name">{state.currentSession.domain}</div>
            {state.currentSession.isPaused && (
              <div class="status paused">Paused</div>
            )}
          </div>
        ) : (
          <div class="no-session">No active session</div>
        )}
      </section>

      <div class="divider" />

      <section class="today-total">
        <h2>Today's Total</h2>
        <div class="time-display total">
          {
            // todayTotal's units are millis, formatTime units are nanos
            formatTime(state.todayTotal * 1000)
          }
        </div>
      </section>

      <div class="divider" />

      <section class="debug-section">
        <button class="debug-toggle" onClick={toggleDebug}>
          {state.showDebug ? "Hide" : "Show"} Storage Data
        </button>

        {state.showDebug && state.storageData && (
          <div class="debug-data">
            <div class="debug-item">
              <h3>Active Session</h3>
              <pre>
                {JSON.stringify(state.storageData.activeSession, null, 2)}
              </pre>
            </div>

            <div class="debug-item">
              <h3>Settings</h3>
              <pre>{JSON.stringify(state.storageData.settings, null, 2)}</pre>
            </div>

            <div class="debug-item">
              <h3>Domains ({Object.keys(state.storageData.domains).length})</h3>
              <pre>{JSON.stringify(state.storageData.domains, null, 2)}</pre>
            </div>

            <div class="debug-item">
              <h3>Metadata</h3>
              <pre>
                {JSON.stringify(
                  {
                    version: state.storageData.version,
                    installDate: state.storageData.installDate
                      ? new Date(state.storageData.installDate).toISOString()
                      : null,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
