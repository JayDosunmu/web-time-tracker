/**
 * Time display pill component - always visible floating timer
 * Preact component rendered inside closed Shadow DOM
 */

import { render, type FunctionComponent } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { ExtensionSettings, PillPosition } from '../../../types';
import type { PositionChangeSource } from '../../../types/messages';
import pillStyles from './TimeDisplayPill.styles.css?inline';

export type { PillPosition };

export interface SessionState {
  domain: string;
  currentTime: number;
  totalTimeToday: number;
  visitCount: number;
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

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

}

/**
 * Format current time as HH:MM:SS
 */
function formatClockTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Clamp a position to viewport bounds
 */
function clampPosition(
  x: number,
  y: number,
  pillWidth: number,
  pillHeight: number
): PillPosition {
  const maxX = window.innerWidth - pillWidth;
  const maxY = window.innerHeight - pillHeight;
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
  };
}

// ---- Internal Preact Component ----

interface PillProps {
  sessionState: SessionState | null;
  position: PillPosition;
  visible: boolean;
  isConnecting: boolean;
  onPositionChange: (position: PillPosition, source: PositionChangeSource) => void;
}

export const Pill: FunctionComponent<PillProps> = ({
  sessionState,
  position,
  visible,
  isConnecting,
  onPositionChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [clampedPosition, setClampedPosition] = useState<PillPosition>(position);

  const pillRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const boundsRef = useRef({ maxX: 0, maxY: 0 });
  const prevPositionRef = useRef<PillPosition>(position);

  const isActive = sessionState?.isActive ?? false;
  const isPaused = sessionState?.isPaused ?? false;
  const displayTime = sessionState?.currentTime ?? 0;
  const totalTimeToday = sessionState?.totalTimeToday ?? 0;
  const visitCount = sessionState?.visitCount ?? 0;
  const domain = sessionState?.domain ?? '';

  // Update cached bounds and clamp position on window resize (local only, not persisted)
  const updateBoundsAndPosition = useCallback(() => {
    if (!pillRef.current) return;
    const rect = pillRef.current.getBoundingClientRect();
    boundsRef.current = {
      maxX: window.innerWidth - rect.width,
      maxY: window.innerHeight - rect.height,
    };
    // Clamp current position to new bounds
    setClampedPosition(prev => ({
      x: Math.max(0, Math.min(prev.x, boundsRef.current.maxX)),
      y: Math.max(0, Math.min(prev.y, boundsRef.current.maxY)),
    }));
  }, []);

  // Initial bounds calculation, position clamp, and resize handler
  useEffect(() => {
    // Calculate bounds immediately if element exists
    if (pillRef.current) {
      const rect = pillRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        boundsRef.current = {
          maxX: window.innerWidth - rect.width,
          maxY: window.innerHeight - rect.height,
        };
        // Clamp initial position to viewport
        setClampedPosition(clampPosition(position.x, position.y, rect.width, rect.height));
      }
    }

    window.addEventListener('resize', updateBoundsAndPosition);
    return () => {
      window.removeEventListener('resize', updateBoundsAndPosition);
    };
  }, [updateBoundsAndPosition, position.x, position.y]);

  // Sync external position updates (from settings) to local state
  // This ensures position is applied even when pill was hidden during the update
  useEffect(() => {
    prevPositionRef.current = position;
    setClampedPosition(prev => {
      // Only update if position actually changed (avoid unnecessary re-renders during drag)
      if (prev.x !== position.x || prev.y !== position.y) {
        return position;
      }
      return prev;
    });
  }, [position.x, position.y]);

  // Drag handlers
  const handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return; // Only left click
    event.preventDefault();

    // Calculate offset from mouse to pill corner once
    const rect = pillRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragStartRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setIsDragging(true);
  };

  // Store latest position for mouseup callback
  const clampedPositionRef = useRef(clampedPosition);
  clampedPositionRef.current = clampedPosition;

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent): void => {
      if (!dragStartRef.current) return;

      // Direct position calculation using cached offset
      const newX = event.clientX - dragStartRef.current.offsetX;
      const newY = event.clientY - dragStartRef.current.offsetY;

      // Clamp using cached bounds (no getBoundingClientRect call)
      const clampedX = Math.max(0, Math.min(newX, boundsRef.current.maxX));
      const clampedY = Math.max(0, Math.min(newY, boundsRef.current.maxY));

      setClampedPosition({ x: clampedX, y: clampedY });
    };

    const handleMouseUp = (): void => {
      setIsDragging(false);
      if (dragStartRef.current) {
        // Notify parent of position change for persistence
        onPositionChange(clampedPositionRef.current, "user_drag");
      }
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onPositionChange]);


  // Hide pill completely if not visible
  if (!visible) {
    return null;
  }

  const positionStyle = {
    left: `${clampedPosition.x}px`,
    top: `${clampedPosition.y}px`,
  } as const;

  // Show connecting state while waiting for background service
  if (isConnecting && !sessionState) {
    const pillClass = ['pill-content', 'connecting', isDragging ? 'dragging' : ''].filter(Boolean).join(' ');
    return (
      <div
        ref={pillRef}
        class={pillClass}
        style={positionStyle}
        onMouseDown={handleMouseDown}
      >
        <div class="pill-row">
          <span class="label">--:--:--</span>
        </div>
      </div>
    );
  }

  // Hide if no session and not connecting
  if (!sessionState) {
    return null;
  }

  const pillClass = [
    'pill-content',
    !isActive ? 'inactive' : '',
    isPaused ? 'paused' : '',
    isDragging ? 'dragging' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={pillRef}
      class={pillClass}
      style={positionStyle}
      onMouseDown={handleMouseDown}
    >
      {/* Row 1: Domain + time */}
      <div class="pill-row">
        <span class="label">{domain}:</span>
        <span class="value">{formatTime(displayTime)}</span>
      </div>
      {/* Row 2: Visit count (right-aligned, spans both columns) */}
      <div class="visit-count">
        <span class="visit-count-cell"></span>
        <span class="visit-count-cell">{visitCount} visits</span>
      </div>
      {/* Row 3: Today's Total */}
      <div class="pill-row">
        <span class="label">Today's Total:</span>
        <span class="value">{formatTime(totalTimeToday)}</span>
      </div>
      {/* Row 4: Clock */}
      <div class="pill-row">
        <span class="label">Clock:</span>
        <span class="value">{formatClockTime(new Date())}</span>
      </div>
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
    isConnecting: boolean;
  };
  private onPositionChangeCallback: ((position: PillPosition, source: PositionChangeSource) => void) | null = null;
  private animationFrameId: number | null = null;
  private lastUpdateTime = 0;

  constructor(initialPosition?: PillPosition) {
    this.state = {
      sessionState: null,
      // Use provided position or default to top-right (will be clamped to actual viewport)
      position: initialPosition ?? { x: 9999, y: 20 },
      visible: true,
      isConnecting: true,
    };
    this.mount();
  }

  /**
   * Set callback for position changes (for persistence)
   */
  public setPositionChangeCallback(callback: (position: PillPosition, source: PositionChangeSource) => void): void {
    this.onPositionChangeCallback = callback;
  }

  /**
   * Handle session update from ContentScriptManager broadcast
   */
  public onSessionUpdate(state: SessionState | null): void {
    const wasAnimating = this.shouldAnimate();
    this.state.sessionState = state;
    this.state.isConnecting = false; // Connection established
    this.updateAnimation(wasAnimating);
    this.renderComponent();
  }

  /**
   * Handle settings change from ContentScriptManager broadcast
   */
  public onSettingsChange(settings: Partial<ExtensionSettings>): void {
    const wasAnimating = this.shouldAnimate();
    if (settings.pillPosition) {
      this.state.position = settings.pillPosition;
    }
    if (typeof settings.pillVisibility === 'boolean') {
      this.state.visible = settings.pillVisibility;
    }
    this.updateAnimation(wasAnimating);
    this.renderComponent();
  }

  /**
   * Destroy the component and cleanup
   */
  public destroy(): void {
    this.stopAnimation();
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

  /**
   * Check if animation should be running
   */
  private shouldAnimate(): boolean {
    const session = this.state.sessionState;
    if (!session) return false;
    return session.isActive && !session.isPaused && this.state.visible;
  }

  /**
   * Update animation state based on current state
   */
  private updateAnimation(wasAnimating: boolean): void {
    const shouldAnimate = this.shouldAnimate();

    if (wasAnimating && !shouldAnimate) {
      this.stopAnimation();
    } else if (!wasAnimating && shouldAnimate) {
      this.startAnimation();
    }
  }

  /**
   * Start the animation loop
   */
  private startAnimation(): void {
    if (this.animationFrameId !== null) return;

    this.lastUpdateTime = Date.now();

    const animate = (): void => {
      if (!this.state.sessionState) return;

      const now = Date.now();
      const elapsed = now - this.lastUpdateTime;

      // Direct mutation - no object allocation needed for class state
      this.state.sessionState.currentTime += elapsed;
      this.state.sessionState.totalTimeToday += elapsed;
      this.lastUpdateTime = now;

      this.renderComponent();
      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Stop the animation loop
   */
  private stopAnimation(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private handlePositionChange = (position: PillPosition, source: PositionChangeSource): void => {
    this.state.position = position;
    if (this.onPositionChangeCallback) {
      this.onPositionChangeCallback(position, source);
    }
  };

  private mount(): void {
    // Remove any existing pill (handles extension reload, HMR, re-injection)
    const existing = document.getElementById('web-time-tracker-pill');
    if (existing?.parentNode) {
      existing.parentNode.removeChild(existing);
    }

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
        isConnecting={this.state.isConnecting}
        onPositionChange={this.handlePositionChange}
      />,
      this.container,
    );
  }
}
