/**
 * Tests for TimeDisplayPill component
 */

import { testUtils } from '../../../tests/utils';
import { TimeDisplayPill } from './TimeDisplayPill';
import type {
  SessionState,
  SettingsState
} from '../../../types';

describe('TimeDisplayPill', () => {
  let timeDisplayPill: TimeDisplayPill;
  let mockElement: HTMLElement;
  let mockShadowRoot: ShadowRoot;

  beforeEach(() => {
    testUtils.resetAll();

    // Mock DOM elements
    mockElement = document.createElement('div');
    mockShadowRoot = mockElement.attachShadow({ mode: 'closed' }) as ShadowRoot;

    // Animation frame mocks are set up in testUtils.resetAll()

    // Spy on document.createElement and element methods
    jest.spyOn(document, 'createElement').mockReturnValue(mockElement);
    jest.spyOn(mockElement, 'attachShadow').mockReturnValue(mockShadowRoot);
    jest.spyOn(document.body, 'appendChild').mockImplementation();
    jest.spyOn(document.body, 'removeChild').mockImplementation();

    timeDisplayPill = new TimeDisplayPill();
  });

  afterEach(() => {
    if (timeDisplayPill) {
      timeDisplayPill.destroy();
    }
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should create DOM element with shadow root', () => {
      timeDisplayPill.show();

      expect(document.createElement).toHaveBeenCalledWith('div');
      expect(mockElement.attachShadow).toHaveBeenCalledWith({ mode: 'closed' });
      expect(document.body.appendChild).toHaveBeenCalledWith(mockElement);
    });

    it('should apply initial styles', () => {
      timeDisplayPill.show();

      expect(mockElement.className).toBe('web-time-tracker-pill');
      expect(mockElement.style.position).toBe('fixed');
      expect(mockElement.style.zIndex).toBe('999999');
    });

    it('should not create multiple elements', () => {
      timeDisplayPill.show();
      timeDisplayPill.show();

      expect(document.createElement).toHaveBeenCalledTimes(1);
      expect(document.body.appendChild).toHaveBeenCalledTimes(1);
    });
  });

  describe('Session State Updates', () => {
    beforeEach(() => {
      timeDisplayPill.show();
    });

    it('should update display with active session', () => {
      const sessionState: SessionState = {
        domain: 'example.com',
        currentTime: 125000, // 2:05
        isActive: true,
        isPaused: false,
        startTime: Date.now() - 125000
      };

      timeDisplayPill.updateSessionState(sessionState);

      expect(mockShadowRoot.innerHTML).toContain('2:05');
      expect(mockShadowRoot.innerHTML).toContain('example.com');
      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it('should update display with paused session', () => {
      const sessionState: SessionState = {
        domain: 'example.com',
        currentTime: 90000, // 1:30
        isActive: false,
        isPaused: true,
        startTime: Date.now() - 90000
      };

      timeDisplayPill.updateSessionState(sessionState);

      expect(mockShadowRoot.innerHTML).toContain('1:30');
      expect(mockShadowRoot.innerHTML).toContain('(Paused)');
    });

    it('should hide when session state is null', () => {
      jest.spyOn(timeDisplayPill, 'hide');

      timeDisplayPill.updateSessionState(null);

      expect(timeDisplayPill.hide).toHaveBeenCalled();
    });

    it('should handle different time formats', () => {
      const testCases = [
        { time: 30000, expected: '0:30' },      // 30 seconds
        { time: 90000, expected: '1:30' },      // 1 minute 30 seconds
        { time: 3600000, expected: '1:00:00' }, // 1 hour
        { time: 3900000, expected: '1:05:00' }, // 1 hour 5 minutes
        { time: 86400000, expected: '24:00:00' } // 24 hours
      ];

      testCases.forEach(({ time, expected }) => {
        const sessionState: SessionState = {
          domain: 'test.com',
          currentTime: time,
          isActive: true,
          isPaused: false,
          startTime: Date.now() - time
        };

        timeDisplayPill.updateSessionState(sessionState);
        expect(mockShadowRoot.innerHTML).toContain(expected);
      });
    });
  });

  describe('Animation Management', () => {
    beforeEach(() => {
      timeDisplayPill.show();
    });

    it('should start animation for active sessions', () => {
      const sessionState: SessionState = {
        domain: 'example.com',
        currentTime: 5000,
        isActive: true,
        isPaused: false,
        startTime: Date.now() - 5000
      };

      timeDisplayPill.updateSessionState(sessionState);

      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it('should stop animation for paused sessions', () => {
      const sessionState: SessionState = {
        domain: 'example.com',
        currentTime: 5000,
        isActive: false,
        isPaused: true,
        startTime: Date.now() - 5000
      };

      timeDisplayPill.updateSessionState(sessionState);

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should stop animation when hidden', () => {
      const sessionState: SessionState = {
        domain: 'example.com',
        currentTime: 5000,
        isActive: true,
        isPaused: false,
        startTime: Date.now() - 5000
      };

      timeDisplayPill.updateSessionState(sessionState);
      timeDisplayPill.hide();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('Settings Updates', () => {
    beforeEach(() => {
      timeDisplayPill.show();
    });

    it('should update position from settings', () => {
      const settings: SettingsState = {
        pillPosition: { x: 100, y: 200 },
        pillVisibility: 'always',
        excludedDomains: []
      };

      timeDisplayPill.updateSettings(settings);

      expect(mockElement.style.left).toBe('100px');
      expect(mockElement.style.top).toBe('200px');
    });

    it('should handle different visibility settings', () => {
      const alwaysSettings: SettingsState = {
        pillPosition: { x: 10, y: 10 },
        pillVisibility: 'always',
        excludedDomains: []
      };

      const hoverSettings: SettingsState = {
        pillPosition: { x: 10, y: 10 },
        pillVisibility: 'on-hover',
        excludedDomains: []
      };

      const neverSettings: SettingsState = {
        pillPosition: { x: 10, y: 10 },
        pillVisibility: 'never',
        excludedDomains: []
      };

      // Test always visible
      timeDisplayPill.updateSettings(alwaysSettings);
      expect(mockElement.style.display).toBe('block');

      // Test hover only
      timeDisplayPill.updateSettings(hoverSettings);
      expect(mockElement.style.opacity).toBe('0.3');

      // Test never visible
      timeDisplayPill.updateSettings(neverSettings);
      expect(mockElement.style.display).toBe('none');
    });

    it('should handle default position when not specified', () => {
      const settings: SettingsState = {
        pillPosition: undefined,
        pillVisibility: 'always',
        excludedDomains: []
      };

      timeDisplayPill.updateSettings(settings);

      expect(mockElement.style.top).toBe('20px');
      expect(mockElement.style.right).toBe('20px');
    });
  });

  describe('User Interactions', () => {
    beforeEach(() => {
      timeDisplayPill.show();
    });

    it('should handle mouse enter events', () => {
      const mouseEnterEvent = new MouseEvent('mouseenter');
      mockElement.dispatchEvent(mouseEnterEvent);

      expect(mockElement.style.opacity).toBe('1');
    });

    it('should handle mouse leave events', () => {
      // First set up hover state
      const settings: SettingsState = {
        pillPosition: { x: 10, y: 10 },
        pillVisibility: 'on-hover',
        excludedDomains: []
      };
      timeDisplayPill.updateSettings(settings);

      const mouseLeaveEvent = new MouseEvent('mouseleave');
      mockElement.dispatchEvent(mouseLeaveEvent);

      expect(mockElement.style.opacity).toBe('0.3');
    });

    it('should handle click events for dragging initiation', () => {
      const mouseDownEvent = new MouseEvent('mousedown', {
        clientX: 100,
        clientY: 200
      });

      const clickSpy = jest.fn();
      mockElement.addEventListener('mousedown', clickSpy);
      mockElement.dispatchEvent(mouseDownEvent);

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('Drag and Drop', () => {
    beforeEach(() => {
      timeDisplayPill.show();
    });

    it('should handle drag start', () => {
      const mouseDownEvent = new MouseEvent('mousedown', {
        clientX: 100,
        clientY: 200,
        bubbles: true
      });

      mockElement.dispatchEvent(mouseDownEvent);

      expect(mockElement.style.cursor).toBe('grabbing');
    });

    it('should handle drag move', () => {
      // Start drag
      const mouseDownEvent = new MouseEvent('mousedown', {
        clientX: 100,
        clientY: 200,
        bubbles: true
      });
      mockElement.dispatchEvent(mouseDownEvent);

      // Move mouse
      const mouseMoveEvent = new MouseEvent('mousemove', {
        clientX: 150,
        clientY: 250,
        bubbles: true
      });
      document.dispatchEvent(mouseMoveEvent);

      expect(mockElement.style.left).toBe('150px');
      expect(mockElement.style.top).toBe('250px');
    });

    it('should handle drag end', () => {
      // Start drag
      const mouseDownEvent = new MouseEvent('mousedown', {
        clientX: 100,
        clientY: 200,
        bubbles: true
      });
      mockElement.dispatchEvent(mouseDownEvent);

      // End drag
      const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true
      });
      document.dispatchEvent(mouseUpEvent);

      expect(mockElement.style.cursor).toBe('grab');
    });
  });

  describe('Time Formatting', () => {
    beforeEach(() => {
      timeDisplayPill.show();
    });

    it('should format seconds correctly', () => {
      const testCases = [
        { ms: 0, expected: '0:00' },
        { ms: 5000, expected: '0:05' },
        { ms: 30000, expected: '0:30' },
        { ms: 59000, expected: '0:59' }
      ];

      testCases.forEach(({ ms, expected }) => {
        const sessionState: SessionState = {
          domain: 'test.com',
          currentTime: ms,
          isActive: true,
          isPaused: false,
          startTime: Date.now() - ms
        };

        timeDisplayPill.updateSessionState(sessionState);
        expect(mockShadowRoot.innerHTML).toContain(expected);
      });
    });

    it('should format minutes correctly', () => {
      const testCases = [
        { ms: 60000, expected: '1:00' },
        { ms: 125000, expected: '2:05' },
        { ms: 599000, expected: '9:59' },
        { ms: 3599000, expected: '59:59' }
      ];

      testCases.forEach(({ ms, expected }) => {
        const sessionState: SessionState = {
          domain: 'test.com',
          currentTime: ms,
          isActive: true,
          isPaused: false,
          startTime: Date.now() - ms
        };

        timeDisplayPill.updateSessionState(sessionState);
        expect(mockShadowRoot.innerHTML).toContain(expected);
      });
    });

    it('should format hours correctly', () => {
      const testCases = [
        { ms: 3600000, expected: '1:00:00' },
        { ms: 3665000, expected: '1:01:05' },
        { ms: 7200000, expected: '2:00:00' },
        { ms: 86400000, expected: '24:00:00' }
      ];

      testCases.forEach(({ ms, expected }) => {
        const sessionState: SessionState = {
          domain: 'test.com',
          currentTime: ms,
          isActive: true,
          isPaused: false,
          startTime: Date.now() - ms
        };

        timeDisplayPill.updateSessionState(sessionState);
        expect(mockShadowRoot.innerHTML).toContain(expected);
      });
    });
  });

  describe('Visibility Management', () => {
    it('should show element when show() is called', () => {
      timeDisplayPill.show();

      expect(document.body.appendChild).toHaveBeenCalledWith(mockElement);
      expect(mockElement.style.display).toBe('block');
    });

    it('should hide element when hide() is called', () => {
      timeDisplayPill.show();
      timeDisplayPill.hide();

      expect(mockElement.style.display).toBe('none');
      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should handle hide when element does not exist', () => {
      expect(() => timeDisplayPill.hide()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed session state', () => {
      timeDisplayPill.show();

      const malformedState = {
        domain: 'example.com',
        currentTime: 'invalid',
        isActive: true
      } as any;

      expect(() => timeDisplayPill.updateSessionState(malformedState)).not.toThrow();
    });

    it('should handle missing shadow root', () => {
      jest.spyOn(mockElement, 'attachShadow').mockReturnValue(null as any);

      expect(() => timeDisplayPill.show()).not.toThrow();
    });

    it('should handle DOM creation failures', () => {
      jest.spyOn(document, 'createElement').mockImplementation(() => {
        throw new Error('DOM creation failed');
      });

      expect(() => timeDisplayPill.show()).not.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup properly when element exists', () => {
      timeDisplayPill.show();

      const sessionState: SessionState = {
        domain: 'example.com',
        currentTime: 5000,
        isActive: true,
        isPaused: false,
        startTime: Date.now() - 5000
      };
      timeDisplayPill.updateSessionState(sessionState);

      timeDisplayPill.destroy();

      expect(cancelAnimationFrame).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalledWith(mockElement);
    });

    it('should handle cleanup when element does not exist', () => {
      expect(() => timeDisplayPill.destroy()).not.toThrow();
    });

    it('should handle cleanup with running animation', () => {
      timeDisplayPill.show();

      const sessionState: SessionState = {
        domain: 'example.com',
        currentTime: 5000,
        isActive: true,
        isPaused: false,
        startTime: Date.now() - 5000
      };
      timeDisplayPill.updateSessionState(sessionState);

      expect(() => timeDisplayPill.destroy()).not.toThrow();
      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('Shadow DOM Styling', () => {
    beforeEach(() => {
      timeDisplayPill.show();
    });

    it('should inject CSS styles into shadow root', () => {
      expect(mockShadowRoot.innerHTML).toContain('<style>');
      expect(mockShadowRoot.innerHTML).toContain('.pill-container');
      expect(mockShadowRoot.innerHTML).toContain('background:');
      expect(mockShadowRoot.innerHTML).toContain('border-radius:');
    });

    it('should create proper HTML structure', () => {
      const sessionState: SessionState = {
        domain: 'example.com',
        currentTime: 5000,
        isActive: true,
        isPaused: false,
        startTime: Date.now() - 5000
      };

      timeDisplayPill.updateSessionState(sessionState);

      expect(mockShadowRoot.innerHTML).toContain('<div class="pill-container">');
      expect(mockShadowRoot.innerHTML).toContain('<span class="time">');
      expect(mockShadowRoot.innerHTML).toContain('<span class="domain">');
    });

    it('should include accessibility attributes', () => {
      expect(mockElement.getAttribute('role')).toBe('status');
      expect(mockElement.getAttribute('aria-live')).toBe('polite');
      expect(mockElement.getAttribute('aria-label')).toContain('Time tracker');
    });
  });

  describe('Real-time Updates', () => {
    beforeEach(() => {
      timeDisplayPill.show();
    });

    it('should update time display in real-time for active sessions', (done) => {
      const startTime = Date.now() - 5000;
      const sessionState: SessionState = {
        domain: 'example.com',
        currentTime: 5000,
        isActive: true,
        isPaused: false,
        startTime
      };

      timeDisplayPill.updateSessionState(sessionState);

      // Check that animation frame was called
      expect(requestAnimationFrame).toHaveBeenCalled();

      // Wait for animation frame and check time update
      setTimeout(() => {
        expect(mockShadowRoot.innerHTML).toContain('0:0');
        done();
      }, 20);
    });

    it('should not update time for paused sessions', () => {
      const sessionState: SessionState = {
        domain: 'example.com',
        currentTime: 5000,
        isActive: false,
        isPaused: true,
        startTime: Date.now() - 5000
      };

      timeDisplayPill.updateSessionState(sessionState);

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });
});
