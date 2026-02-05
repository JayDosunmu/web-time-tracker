/**
 * Tests for TimeDisplayPill component
 */

import { testUtils } from '../../../tests/utils';
import { TimeDisplayPill } from './TimeDisplayPill';
import type {
  SessionState
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

  describe('Session State Updates', () => {
    it('should hide when session state is null', () => {
      jest.spyOn(timeDisplayPill, 'hide');

      timeDisplayPill.updateSessionState(null);

      expect(timeDisplayPill.hide).toHaveBeenCalled();
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

  describe('Real-time Updates', () => {
    beforeEach(() => {
      timeDisplayPill.show();
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
});
