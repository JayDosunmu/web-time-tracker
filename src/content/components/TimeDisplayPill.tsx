/**
 * Time display pill component - always visible floating timer
 * Preact component rendered inside closed Shadow DOM
 */

import { render, type FunctionComponent } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { RiInformation2Line, RiInformation2Fill, RiEyeLine, RiEyeFill, RiDragMove2Line } from 'react-icons/ri';
import type { ExtensionSettings, PillPosition } from '../../../types';
import type { PositionChangeSource } from '../../../types/messages';
import { normalizeToReferencePhase } from '../../shared/utils';
import { ToggleIconButton } from './ToggleIconButton';
import pillStyles from './TimeDisplayPill.styles.css?inline';
import toggleIconButtonStyles from './ToggleIconButton.css?inline';

export type { PillPosition };

export interface SessionState {
  domain: string;
  baseCurrentTime: number;
  baseTotalTimeToday: number;
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
  showFullInfo: boolean;
  isHidden: boolean;
  onPositionChange: (position: PillPosition, source: PositionChangeSource) => void;
  onShowFullInfoChange: (showFullInfo: boolean) => void;
  onHiddenChange: (hidden: boolean) => void;
}

export const Pill: FunctionComponent<PillProps> = ({
  sessionState,
  position,
  visible,
  isConnecting,
  showFullInfo: isFullMode,
  isHidden,
  onPositionChange,
  onShowFullInfoChange,
  onHiddenChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [clampedPosition, setClampedPosition] = useState<PillPosition>(position);
  const [isInfoIconHovered, setIsInfoIconHovered] = useState(false);
  const [isVisibilityIconHovered, setIsVisibilityIconHovered] = useState(false);
  const [visibilityWasToggled, setVisibilityWasToggled] = useState(false);
  const [isCardHovered, setIsCardHovered] = useState(false);

  // Derived: show full info when toggled ON or hovering (but not during drag)
  const showFullInfo = (isFullMode || isInfoIconHovered);
  // Derived: hide card when toggled ON or hovering and toggled OFF. If hide was toggled after hovering, use visibilityWasToggled to invert this functionality. visibilityWasToggled will reset to false onExit from the icon.
  const hideCard = ((isHidden !== isVisibilityIconHovered) !== visibilityWasToggled);

  const pillRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const boundsRef = useRef({ maxX: 0, maxY: 0 });
  const prevPositionRef = useRef<PillPosition>(position);

  const isActive = sessionState?.isActive ?? false;
  const isPaused = sessionState?.isPaused ?? false;
  const visitCount = sessionState?.visitCount ?? 0;
  const domain = sessionState?.domain ?? '';

  // Calculate elapsed once for synchronized display of all times
  const now = Date.now();
  const startTime = sessionState?.startTime ?? now;
  const elapsed = (isActive && !isPaused) ? now - startTime : 0;

  // Normalize base times to have same sub-second phase as startTime
  // This ensures all displayed times tick to the next second simultaneously
  const normalizedCurrentTime = normalizeToReferencePhase(
    startTime,
    sessionState?.baseCurrentTime ?? 0
  );
  const normalizedTotalTime = normalizeToReferencePhase(
    startTime,
    sessionState?.baseTotalTimeToday ?? 0
  );

  const displayTime = normalizedCurrentTime + elapsed;
  const totalTimeToday = normalizedTotalTime + elapsed;
  const clockTime = formatClockTime(new Date(now));

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

  // Card hover detection using document-level listener
  // (needed because pointer-events: none on wrapper prevents local events)
  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent): void => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const isOver = (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
      setIsCardHovered(isOver);
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

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
    const connectingPillClass = ['pill-card', 'connecting', isDragging ? 'dragging' : ''].filter(Boolean).join(' ');
    const connectingWrapperClass = ['pill-wrapper', isHidden ? 'hidden' : ''].filter(Boolean).join(' ');
    return (
      <div ref={pillRef} class={connectingWrapperClass} style={positionStyle}>
        {/* Icons Container */}
        <div class="icons-container">
          {/* Drag Handle Icon */}
          <button
            class="drag-icon"
            onMouseDown={handleMouseDown}
            aria-label="Drag to reposition"
          >
            <RiDragMove2Line size={24} />
          </button>
          {/* Info Icon Button - disabled during connecting */}
          <ToggleIconButton
            isActive={false}
            onToggle={() => {}}
            activeIcon={RiInformation2Fill}
            inactiveIcon={RiInformation2Line}
            activeLabel="Show less information"
            inactiveLabel="Show more information"
            disabled={true}
            className="hideable"
          />
          {/* Visibility Toggle Button */}
          <ToggleIconButton
            isActive={isHidden}
            onToggle={() => onHiddenChange(!isHidden)}
            activeIcon={RiEyeFill}
            inactiveIcon={RiEyeLine}
            activeLabel="Show timer pill"
            inactiveLabel="Hide timer pill"
          />
        </div>

        <div class={connectingPillClass}>
          <div class="pill-header">
            <span class="domain">--</span>
          </div>
          <div class="pill-main">
            <span class="session-time">--:--:--</span>
            <div class="secondary-block">
              <div class="total-block">
                <span class="total-label">Total Time</span>
                <span class="total-time">--:--:--</span>
              </div>
              <div class="visit-count-block">
                <span class="visits-label">Visits</span>
                <span class="visits-value">--</span>
              </div>
            </div>
          </div>
          <div class="pill-footer">
            <span class="clock-pill">
              <span class="clock-label">Clock:</span>
              <span class="clock">--:--:--</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Hide if no session and not connecting
  if (!sessionState) {
    return null;
  }

  const pillClass = [
    'pill-card',
    !isActive ? 'inactive' : '',
    isPaused ? 'paused' : '',
    isDragging ? 'dragging' : '',
    !showFullInfo ? 'minimal' : '',
    isCardHovered ? 'hovered' : '',
  ].filter(Boolean).join(' ');

  const wrapperClass = ['pill-wrapper', hideCard ? 'hidden' : ''].filter(Boolean).join(' ');

  return (
    <div
      ref={pillRef}
      class={wrapperClass}
      style={positionStyle}
    >
      {/* Icons Container */}
      <div class="icons-container">
        {/* Drag Handle Icon */}
        <button
          class="drag-icon"
          onMouseDown={handleMouseDown}
          aria-label="Drag to reposition"
        >
          <RiDragMove2Line size={24} />
        </button>
        {/* Info Icon Button */}
        <ToggleIconButton
          isActive={isFullMode}
          onToggle={() => onShowFullInfoChange(!isFullMode)}
          activeIcon={RiInformation2Fill}
          inactiveIcon={RiInformation2Line}
          activeLabel="Show less information"
          inactiveLabel="Show more information"
          enableHoverPreview={true}
          onHoverChange={setIsInfoIconHovered}
          className="hideable"
        />
        {/* Visibility Toggle Button */}
        <ToggleIconButton
          isActive={isHidden}
          onToggle={() => {
            setVisibilityWasToggled(true);
            onHiddenChange(!isHidden)
          }}
          enableHoverPreview={!isHidden}
          onHoverChange={(isHovered: boolean) => {
            setIsVisibilityIconHovered(isHovered);
            // Reset the flag that visibility was toggled when mouse leaves the visibility icon.
            if (!isHovered) {
              setVisibilityWasToggled(false);
            }
          }}
          activeIcon={RiEyeFill}
          inactiveIcon={RiEyeLine}
          activeLabel="Show timer pill"
          inactiveLabel="Hide timer pill"
        />
      </div>

      {/* Pill Card */}
      <div ref={cardRef} class={pillClass}>
        {/* Row 1: Domain + visits */}
        <div class="pill-header">
          <span class="domain">{domain}</span>
          <span class="visits">({visitCount} visits)</span>
        </div>
        {/* Row 2: Session time (left) + Secondary block (right) */}
        <div class="pill-main">
          <span class="session-time">{formatTime(displayTime)}</span>
          <div class="secondary-block">
            <div class="total-block">
              <span class="total-label">Total Time</span>
              <span class="total-time">{formatTime(totalTimeToday)}</span>
            </div>
            <div class="visit-count-block">
              <span class="visits-label">Visits</span>
              <span class="visits-value">{visitCount}</span>
            </div>
          </div>
        </div>
        {/* Row 3: Clock in grey pill */}
        <div class="pill-footer">
          <span class="clock-pill">
            <span class="clock-label">Clock:</span>
            <span class="clock">{clockTime}</span>
          </span>
        </div>
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
    showFullInfo: boolean;
    hidden: boolean;
  };
  private onPositionChangeCallback: ((position: PillPosition, source: PositionChangeSource) => void) | null = null;
  private onShowFullInfoChangeCallback: ((showFullInfo: boolean) => void) | null = null;
  private onHiddenChangeCallback: ((hidden: boolean) => void) | null = null;
  private animationFrameId: number | null = null;

  constructor(initialPosition?: PillPosition, initialShowFullInfo?: boolean, initialHidden?: boolean) {
    this.state = {
      sessionState: null,
      // Use provided position or default to top-right (will be clamped to actual viewport)
      position: initialPosition ?? { x: 9999, y: 20 },
      visible: true,
      isConnecting: true,
      showFullInfo: initialShowFullInfo ?? false,
      hidden: initialHidden ?? false,
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
   * Set callback for showFullInfo changes (for persistence)
   */
  public setShowFullInfoChangeCallback(callback: (showFullInfo: boolean) => void): void {
    this.onShowFullInfoChangeCallback = callback;
  }

  /**
   * Set callback for hidden changes (for persistence)
   */
  public setHiddenChangeCallback(callback: (hidden: boolean) => void): void {
    this.onHiddenChangeCallback = callback;
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
    if (typeof settings.pillShowFullInfo === 'boolean') {
      this.state.showFullInfo = settings.pillShowFullInfo;
    }
    if (typeof settings.pillHidden === 'boolean') {
      this.state.hidden = settings.pillHidden;
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
   * Start the animation loop for smooth time display updates
   */
  private startAnimation(): void {
    if (this.animationFrameId !== null) return;

    const animate = (): void => {
      if (!this.state.sessionState) return;
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

  private handleShowFullInfoChange = (showFullInfo: boolean): void => {
    this.state.showFullInfo = showFullInfo;
    this.renderComponent();
    if (this.onShowFullInfoChangeCallback) {
      this.onShowFullInfoChangeCallback(showFullInfo);
    }
  };

  private handleHiddenChange = (hidden: boolean): void => {
    this.state.hidden = hidden;
    this.renderComponent();
    if (this.onHiddenChangeCallback) {
      this.onHiddenChangeCallback(hidden);
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
    style.textContent = pillStyles + '\n' + toggleIconButtonStyles;
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
        showFullInfo={this.state.showFullInfo}
        isHidden={this.state.hidden}
        onPositionChange={this.handlePositionChange}
        onShowFullInfoChange={this.handleShowFullInfoChange}
        onHiddenChange={this.handleHiddenChange}
      />,
      this.container,
    );
  }
}
