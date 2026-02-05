/**
 * Time display pill component - always visible floating timer
 * Preact component rendered inside closed Shadow DOM
 */

import { render, type FunctionComponent } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type { ExtensionSettings } from '../../../types';
import pillStyles from './TimeDisplayPill.styles.css?inline';

export type PillPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface SessionState {
  domain: string;
  currentTime: number;
  isActive: boolean;
  isPaused: boolean;
  startTime: number;
}

/**
 * Format milliseconds to HH:MM:SS or MM:SS display string
 */
function formatTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// ---- Internal Preact Component ----

interface PillProps {
  sessionState: SessionState | null;
  position: PillPosition;
  visible: boolean;
}

export const Pill: FunctionComponent<PillProps> = ({ sessionState, position, visible }) => {
  const [displayTime, setDisplayTime] = useState(0);
  const lastUpdateRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);

  const isActive = sessionState?.isActive ?? false;
  const isPaused = sessionState?.isPaused ?? false;
  const baseTime = sessionState?.currentTime ?? 0;

  // Update base time reference when session state changes
  useEffect(() => {
    lastUpdateRef.current = Date.now();
    setDisplayTime(baseTime);
  }, [baseTime]);

  // Animation frame loop for live time updates
  useEffect(() => {
    if (!isActive || isPaused || !visible) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    lastUpdateRef.current = Date.now();

    const animate = (): void => {
      const elapsed = Date.now() - lastUpdateRef.current;
      setDisplayTime(baseTime + elapsed);
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return (): void => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isActive, isPaused, visible, baseTime]);

  if (!sessionState || !visible) {
    return null;
  }

  const pillClass = [
    'pill-content',
    position,
    !isActive ? 'inactive' : '',
    isPaused ? 'paused' : '',
  ].filter(Boolean).join(' ');

  const statusClass = [
    'status-indicator',
    !isActive ? 'inactive' : '',
    isPaused ? 'paused' : '',
  ].filter(Boolean).join(' ');

  const handleClick = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div class={pillClass} onClick={handleClick}>
      <span class="time-display">{formatTime(displayTime)}</span>
      <span class={statusClass} />
    </div>
  );
};

// ---- Imperative Wrapper (public API for ContentScriptManager) ----

export class TimeDisplayPill {
  private element: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private container: HTMLDivElement | null = null;
  private state: {
    sessionState: SessionState | null;
    position: PillPosition;
    visible: boolean;
  };

  constructor() {
    this.state = {
      sessionState: null,
      position: 'top-right',
      visible: true,
    };
    this.mount();
  }

  /**
   * Handle session update from ContentScriptManager broadcast
   */
  public onSessionUpdate(state: SessionState | null): void {
    this.state.sessionState = state;
    this.renderComponent();
  }

  /**
   * Handle settings change from ContentScriptManager broadcast
   */
  public onSettingsChange(settings: Partial<ExtensionSettings>): void {
    if (settings.pillPosition) {
      this.state.position = settings.pillPosition;
    }
    if (typeof settings.pillVisibility === 'boolean') {
      this.state.visible = settings.pillVisibility;
    }
    this.renderComponent();
  }

  /**
   * Destroy the component and cleanup
   */
  public destroy(): void {
    if (this.container) {
      render(null, this.container);
    }
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.shadowRoot = null;
    this.container = null;
  }

  private mount(): void {
    this.element = document.createElement('div');
    this.element.id = 'web-time-tracker-pill';
    this.shadowRoot = this.element.attachShadow({ mode: 'closed' });

    if (!this.shadowRoot) return;

    // Inject styles into shadow root
    const style = document.createElement('style');
    style.textContent = pillStyles;
    this.shadowRoot.appendChild(style);

    // Create render container for Preact
    this.container = document.createElement('div');
    this.shadowRoot.appendChild(this.container);

    document.body.appendChild(this.element);
    this.renderComponent();
  }

  private renderComponent(): void {
    if (!this.container) return;
    render(
      <Pill
        sessionState={this.state.sessionState}
        position={this.state.position}
        visible={this.state.visible}
      />,
      this.container,
    );
  }
}
