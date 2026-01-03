/**
 * Time display pill component - always visible floating timer
 */

import type { ExtensionSettings } from '../../../types';

export type PillPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface SessionState {
  domain: string;
  currentTime: number;
  isActive: boolean;
  isPaused: boolean;
  startTime: number;
}

export class TimeDisplayPill {
  private element: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private position: PillPosition = 'top-right';
  private isVisible = true;
  private currentTime = 0;
  private isActive = false;
  private isPaused = false;
  private animationFrame: number | null = null;
  private lastUpdateTime = 0;

  constructor() {
    this.createElement();
    this.attachStyles();
    this.setupEventListeners();
  }

  /**
   * Show the pill
   */
  public show(): void {
    if (this.element) {
      this.isVisible = true;
      this.element.style.display = 'block';
      this.startAnimation();
    }
  }

  /**
   * Hide the pill
   */
  public hide(): void {
    if (this.element) {
      this.isVisible = false;
      this.element.style.display = 'none';
      this.stopAnimation();
    }
  }

  /**
   * Update the displayed time
   */
  public updateTime(milliseconds: number): void {
    this.currentTime = milliseconds;
    this.lastUpdateTime = Date.now();
    this.renderTime();
  }

  /**
   * Update session state
   */
  public updateSessionState(state: SessionState | null): void {
    if (!state) {
      this.isActive = false;
      this.isPaused = false;
      this.currentTime = 0;
      this.hide();
      return;
    }

    this.isActive = state.isActive;
    this.isPaused = state.isPaused;
    this.currentTime = state.currentTime;
    this.lastUpdateTime = Date.now();

    if (this.isActive) {
      this.show();
      this.startAnimation();
    } else {
      this.stopAnimation();
    }

    this.updateActiveState();
    this.renderTime();
  }

  /**
   * Update pill position
   */
  public updatePosition(position: PillPosition): void {
    this.position = position;
    this.applyPosition();
  }

  /**
   * Update pill visibility
   */
  public updateVisibility(visible: boolean): void {
    if (visible) {
      this.show();
    } else {
      this.hide();
    }
  }

  /**
   * Handle settings change
   */
  public onSettingsChange(settings: Partial<ExtensionSettings>): void {
    if (settings.pillPosition) {
      this.updatePosition(settings.pillPosition);
    }
    if (typeof settings.pillVisibility === 'boolean') {
      this.updateVisibility(settings.pillVisibility);
    }
  }

  /**
   * Handle session update
   */
  public onSessionUpdate(state: SessionState | null): void {
    this.updateSessionState(state);
  }

  /**
   * Create the pill element
   */
  private createElement(): void {
    // Create the main container
    this.element = document.createElement('div');
    this.element.id = 'web-time-tracker-pill';
    
    // Create shadow DOM for style isolation
    this.shadowRoot = this.element.attachShadow({ mode: 'closed' });
    
    // Create the pill content
    const pillContent = document.createElement('div');
    pillContent.className = 'pill-content';
    
    const timeDisplay = document.createElement('span');
    timeDisplay.className = 'time-display';
    timeDisplay.textContent = '00:00:00';
    
    const statusIndicator = document.createElement('span');
    statusIndicator.className = 'status-indicator';
    
    pillContent.appendChild(timeDisplay);
    pillContent.appendChild(statusIndicator);
    this.shadowRoot.appendChild(pillContent);
    
    // Apply initial position
    this.applyPosition();
    
    // Append to document
    document.body.appendChild(this.element);
  }

  /**
   * Attach CSS styles to shadow DOM
   */
  private attachStyles(): void {
    if (!this.shadowRoot) return;

    const style = document.createElement('style');
    style.textContent = `
      .pill-content {
        position: fixed;
        z-index: 2147483647;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 8px 12px;
        border-radius: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(10px);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        cursor: pointer;
        user-select: none;
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 80px;
        opacity: 0.9;
      }

      .pill-content:hover {
        opacity: 1;
        transform: scale(1.05);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
      }

      .pill-content.paused {
        background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
        color: #8b4513;
      }

      .pill-content.inactive {
        background: linear-gradient(135deg, #d3d3d3 0%, #a9a9a9 100%);
        color: #555;
        opacity: 0.7;
      }

      .time-display {
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.5px;
      }

      .status-indicator {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #4ade80;
        animation: pulse 2s infinite;
      }

      .status-indicator.paused {
        background: #f59e0b;
        animation: none;
      }

      .status-indicator.inactive {
        background: #9ca3af;
        animation: none;
      }

      @keyframes pulse {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }

      /* Position-specific styles */
      .pill-content.top-left {
        top: 20px;
        left: 20px;
      }

      .pill-content.top-right {
        top: 20px;
        right: 20px;
      }

      .pill-content.bottom-left {
        bottom: 20px;
        left: 20px;
      }

      .pill-content.bottom-right {
        bottom: 20px;
        right: 20px;
      }

      /* Responsive adjustments */
      @media (max-width: 768px) {
        .pill-content {
          padding: 6px 10px;
          font-size: 11px;
        }
        
        .pill-content.top-left,
        .pill-content.top-right {
          top: 10px;
        }
        
        .pill-content.bottom-left,
        .pill-content.bottom-right {
          bottom: 10px;
        }
        
        .pill-content.top-left,
        .pill-content.bottom-left {
          left: 10px;
        }
        
        .pill-content.top-right,
        .pill-content.bottom-right {
          right: 10px;
        }
      }

      /* High contrast mode support */
      @media (prefers-contrast: high) {
        .pill-content {
          border: 2px solid currentColor;
          background: var(--system-background, #000);
          color: var(--system-foreground, #fff);
        }
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .pill-content {
          transition: none;
        }
        
        .pill-content:hover {
          transform: none;
        }
        
        .status-indicator {
          animation: none;
        }
      }
    `;
    
    this.shadowRoot.appendChild(style);
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    if (!this.shadowRoot) return;

    const pillContent = this.shadowRoot.querySelector('.pill-content');
    if (pillContent) {
      // Add click handler for future interactions (e.g., show detailed stats)
      pillContent.addEventListener('click', this.handleClick.bind(this));
      
      // Add hover handlers for accessibility
      pillContent.addEventListener('mouseenter', this.handleMouseEnter.bind(this));
      pillContent.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    }
  }

  /**
   * Apply position styles
   */
  private applyPosition(): void {
    if (!this.shadowRoot) return;

    const pillContent = this.shadowRoot.querySelector('.pill-content') as HTMLElement;
    if (pillContent) {
      // Remove all position classes
      pillContent.classList.remove('top-left', 'top-right', 'bottom-left', 'bottom-right');
      
      // Add current position class
      pillContent.classList.add(this.position);
    }
  }

  /**
   * Update active state styling
   */
  private updateActiveState(): void {
    if (!this.shadowRoot) return;

    const pillContent = this.shadowRoot.querySelector('.pill-content') as HTMLElement;
    const statusIndicator = this.shadowRoot.querySelector('.status-indicator') as HTMLElement;
    
    if (pillContent && statusIndicator) {
      pillContent.classList.remove('paused', 'inactive');
      statusIndicator.classList.remove('paused', 'inactive');
      
      if (!this.isActive) {
        pillContent.classList.add('inactive');
        statusIndicator.classList.add('inactive');
      } else if (this.isPaused) {
        pillContent.classList.add('paused');
        statusIndicator.classList.add('paused');
      }
    }
  }

  /**
   * Format time for display
   */
  private formatTime(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Render the current time
   */
  private renderTime(): void {
    if (!this.shadowRoot) return;

    const timeDisplay = this.shadowRoot.querySelector('.time-display');
    if (timeDisplay) {
      let displayTime = this.currentTime;
      
      // If active and not paused, add elapsed time since last update
      if (this.isActive && !this.isPaused) {
        const elapsed = Date.now() - this.lastUpdateTime;
        displayTime += elapsed;
      }
      
      timeDisplay.textContent = this.formatTime(displayTime);
    }
  }

  /**
   * Start animation loop for live time updates
   */
  private startAnimation(): void {
    if (this.animationFrame) {
      return; // Already running
    }

    const animate = () => {
      if (this.isActive && !this.isPaused && this.isVisible) {
        this.renderTime();
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        this.animationFrame = null;
      }
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  /**
   * Stop animation loop
   */
  private stopAnimation(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Handle click events
   */
  private handleClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    
    // Future: Could open detailed stats or settings
    console.log('Time pill clicked - current time:', this.formatTime(this.currentTime));
  }

  /**
   * Handle mouse enter events
   */
  private handleMouseEnter(): void {
    // Future: Could show tooltip with additional info
  }

  /**
   * Handle mouse leave events
   */
  private handleMouseLeave(): void {
    // Future: Could hide tooltip
  }

  /**
   * Destroy the component and cleanup
   */
  public destroy(): void {
    this.stopAnimation();
    
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    
    this.element = null;
    this.shadowRoot = null;
  }
}