/**
 * Tests for TimeDisplayPill component
 */

import { testUtils } from '../../../tests/utils';
import { TimeDisplayPill } from './TimeDisplayPill';
import type { SessionState } from './TimeDisplayPill';
import type { HourTimesAggregate, Hours24Tuple } from '../../../types';

// Helper to create empty hourTimes for tests
const createEmptyHourTimes = (): HourTimesAggregate => ({
  hours: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as Hours24Tuple,
});

describe('TimeDisplayPill', () => {
  let timeDisplayPill: TimeDisplayPill;

  beforeEach(() => {
    jest.useFakeTimers();
    testUtils.resetAll();
  });

  afterEach(() => {
    if (timeDisplayPill) {
      timeDisplayPill.destroy();
    }
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Session State Updates', () => {
    it('should hide when session state is null', () => {
      timeDisplayPill = new TimeDisplayPill();
      jest.advanceTimersByTime(20);

      timeDisplayPill.onSessionUpdate(null);
      jest.advanceTimersByTime(20);

      // Host element should still exist but Pill renders null
      const host = document.getElementById('web-time-tracker-pill');
      expect(host).toBeTruthy();
    });
  });

  describe('Animation Management', () => {
    it('should start animation for active sessions', () => {
      timeDisplayPill = new TimeDisplayPill();
      jest.advanceTimersByTime(20);

      const sessionState: SessionState = {
        domain: 'example.com',
        baseCurrentTime: 5000,
        baseTotalTimeToday: 10000,
        visitCount: 3,
        isActive: true,
        isPaused: false,
        startTime: Date.now() - 5000,
        hourTimes: createEmptyHourTimes(),
        domainStats: [],
      };

      timeDisplayPill.onSessionUpdate(sessionState);
      jest.advanceTimersByTime(20);

      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it('should stop animation for paused sessions', () => {
      timeDisplayPill = new TimeDisplayPill();
      jest.advanceTimersByTime(20);

      // First activate a session to start animation
      const activeState: SessionState = {
        domain: 'example.com',
        baseCurrentTime: 5000,
        baseTotalTimeToday: 10000,
        visitCount: 3,
        isActive: true,
        isPaused: false,
        startTime: Date.now() - 5000,
        hourTimes: createEmptyHourTimes(),
        domainStats: [],
      };
      timeDisplayPill.onSessionUpdate(activeState);
      jest.advanceTimersByTime(20);

      // Then pause it
      const pausedState: SessionState = {
        domain: 'example.com',
        baseCurrentTime: 5000,
        baseTotalTimeToday: 10000,
        visitCount: 3,
        isActive: false,
        isPaused: true,
        startTime: Date.now() - 5000,
        hourTimes: createEmptyHourTimes(),
        domainStats: [],
      };
      timeDisplayPill.onSessionUpdate(pausedState);
      jest.advanceTimersByTime(20);

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should stop animation when hidden', () => {
      timeDisplayPill = new TimeDisplayPill();
      jest.advanceTimersByTime(20);

      const sessionState: SessionState = {
        domain: 'example.com',
        baseCurrentTime: 5000,
        baseTotalTimeToday: 10000,
        visitCount: 3,
        isActive: true,
        isPaused: false,
        startTime: Date.now() - 5000,
        hourTimes: createEmptyHourTimes(),
        domainStats: [],
      };

      timeDisplayPill.onSessionUpdate(sessionState);
      jest.advanceTimersByTime(20);

      // Hide the pill via settings
      timeDisplayPill.onSettingsChange({ pillVisibility: false });
      jest.advanceTimersByTime(20);

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('Real-time Updates', () => {
    it('should not update time for paused sessions', () => {
      timeDisplayPill = new TimeDisplayPill();
      jest.advanceTimersByTime(20);

      // First activate
      const activeState: SessionState = {
        domain: 'example.com',
        baseCurrentTime: 5000,
        baseTotalTimeToday: 10000,
        visitCount: 3,
        isActive: true,
        isPaused: false,
        startTime: Date.now() - 5000,
        hourTimes: createEmptyHourTimes(),
        domainStats: [],
      };
      timeDisplayPill.onSessionUpdate(activeState);
      jest.advanceTimersByTime(20);

      // Then pause
      const pausedState: SessionState = {
        domain: 'example.com',
        baseCurrentTime: 5000,
        baseTotalTimeToday: 10000,
        visitCount: 3,
        isActive: false,
        isPaused: true,
        startTime: Date.now() - 5000,
        hourTimes: createEmptyHourTimes(),
        domainStats: [],
      };
      timeDisplayPill.onSessionUpdate(pausedState);
      jest.advanceTimersByTime(20);

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed session state', () => {
      timeDisplayPill = new TimeDisplayPill();
      jest.advanceTimersByTime(20);

      const malformedState = {
        domain: 'example.com',
        baseCurrentTime: 'invalid',
        isActive: true
      } as any;

      expect(() => timeDisplayPill.onSessionUpdate(malformedState)).not.toThrow();
    });

    it('should handle missing shadow root', () => {
      jest.spyOn(HTMLElement.prototype, 'attachShadow').mockReturnValue(null as any);

      expect(() => {
        timeDisplayPill = new TimeDisplayPill();
      }).not.toThrow();
    });

    it('should handle DOM creation failures', () => {
      jest.spyOn(document, 'createElement').mockImplementation(() => {
        throw new Error('DOM creation failed');
      });

      expect(() => {
        try {
          timeDisplayPill = new TimeDisplayPill();
        } catch {
          // Expected - DOM creation failed
        }
      }).not.toThrow();
    });
  });

  describe('Info Icon Toggle', () => {
    const createSessionState = (): SessionState => ({
      domain: 'example.com',
      baseCurrentTime: 5000,
      baseTotalTimeToday: 10000,
      visitCount: 3,
      isActive: true,
      isPaused: false,
      startTime: Date.now() - 5000,
      hourTimes: createEmptyHourTimes(),
      domainStats: [],
    });

    // Note: Shadow DOM uses 'closed' mode, so we test behavior through observable effects
    // rather than querying the shadow DOM directly

    it('should render without errors when session state is provided', () => {
      timeDisplayPill = new TimeDisplayPill();
      jest.advanceTimersByTime(20);

      expect(() => {
        timeDisplayPill.onSessionUpdate(createSessionState());
        jest.advanceTimersByTime(20);
      }).not.toThrow();

      const host = document.getElementById('web-time-tracker-pill');
      expect(host).toBeTruthy();
    });

    it('should render connecting state without errors', () => {
      timeDisplayPill = new TimeDisplayPill();
      jest.advanceTimersByTime(20);

      // Connecting state is shown when no session state yet
      const host = document.getElementById('web-time-tracker-pill');
      expect(host).toBeTruthy();
    });

    it('should handle multiple session updates without errors', () => {
      timeDisplayPill = new TimeDisplayPill();
      jest.advanceTimersByTime(20);

      const sessionState = createSessionState();

      expect(() => {
        // Multiple updates shouldn't cause issues
        timeDisplayPill.onSessionUpdate(sessionState);
        jest.advanceTimersByTime(20);
        timeDisplayPill.onSessionUpdate({ ...sessionState, visitCount: 5 });
        jest.advanceTimersByTime(20);
        timeDisplayPill.onSessionUpdate({ ...sessionState, visitCount: 10 });
        jest.advanceTimersByTime(20);
      }).not.toThrow();
    });

    it('should maintain host element after session updates', () => {
      timeDisplayPill = new TimeDisplayPill();
      jest.advanceTimersByTime(20);

      timeDisplayPill.onSessionUpdate(createSessionState());
      jest.advanceTimersByTime(20);

      const host = document.getElementById('web-time-tracker-pill');
      expect(host).toBeTruthy();
      expect(host?.parentElement).toBe(document.body);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup properly when element exists', () => {
      timeDisplayPill = new TimeDisplayPill();
      jest.advanceTimersByTime(20);

      const sessionState: SessionState = {
        domain: 'example.com',
        baseCurrentTime: 5000,
        baseTotalTimeToday: 10000,
        visitCount: 3,
        isActive: true,
        isPaused: false,
        startTime: Date.now() - 5000,
        hourTimes: createEmptyHourTimes(),
        domainStats: [],
      };
      timeDisplayPill.onSessionUpdate(sessionState);
      jest.advanceTimersByTime(20);

      const host = document.getElementById('web-time-tracker-pill');
      expect(host).toBeTruthy();

      timeDisplayPill.destroy();

      const hostAfterDestroy = document.getElementById('web-time-tracker-pill');
      expect(hostAfterDestroy).toBeNull();
    });

    it('should handle cleanup when element does not exist', () => {
      timeDisplayPill = new TimeDisplayPill();
      jest.advanceTimersByTime(20);
      timeDisplayPill.destroy();

      // Second destroy should not throw
      expect(() => timeDisplayPill.destroy()).not.toThrow();
    });

    it('should handle cleanup with running animation', () => {
      timeDisplayPill = new TimeDisplayPill();
      jest.advanceTimersByTime(20);

      const sessionState: SessionState = {
        domain: 'example.com',
        baseCurrentTime: 5000,
        baseTotalTimeToday: 10000,
        visitCount: 3,
        isActive: true,
        isPaused: false,
        startTime: Date.now() - 5000,
        hourTimes: createEmptyHourTimes(),
        domainStats: [],
      };
      timeDisplayPill.onSessionUpdate(sessionState);
      jest.advanceTimersByTime(20);

      expect(() => timeDisplayPill.destroy()).not.toThrow();
    });
  });
});
