/**
 * Tooltip component with automatic positioning using Floating UI
 * Supports dynamic content, auto-flip, and accessible behavior
 */

import { type FunctionComponent, type ComponentChildren } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { computePosition, flip, offset, shift, arrow, type Placement } from '@floating-ui/dom';
import './Tooltip.css';

interface TooltipProps {
  /** Tooltip text content */
  content: ComponentChildren;
  /** Preferred placement (will flip if insufficient space) */
  placement?: 'top' | 'bottom';
  /** Delay before showing tooltip in ms (default: 150) */
  delay?: number;
  /** Child element that triggers the tooltip */
  children: ComponentChildren;
  /** Additional CSS class for the container */
  className?: string;
}

export const Tooltip: FunctionComponent<TooltipProps> = ({
  content,
  placement: preferredPlacement = 'bottom',
  delay = 150,
  children,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [actualPlacement, setActualPlacement] = useState<Placement>(preferredPlacement);
  const [arrowPosition, setArrowPosition] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  const updatePosition = useCallback(async () => {
    const trigger = containerRef.current;
    const tooltip = tooltipRef.current;
    const arrowEl = arrowRef.current;

    if (!trigger || !tooltip || !arrowEl) return;

    const { x, y, placement, middlewareData } = await computePosition(
      trigger,
      tooltip,
      {
        placement: preferredPlacement,
        middleware: [
          offset(8), // 8px gap from trigger
          flip(), // Auto-flip to opposite side if needed
          shift({ padding: 8 }), // Keep within viewport with padding
          arrow({ element: arrowEl }),
        ],
      }
    );

    setPosition({ x, y });
    setActualPlacement(placement);

    // Position the arrow
    if (middlewareData.arrow) {
      const { x: arrowX, y: arrowY } = middlewareData.arrow;
      setArrowPosition({
        x: arrowX ?? 0,
        y: arrowY ?? 0,
      });
    }
  }, [preferredPlacement]);

  // Update position when visible or content changes
  useEffect(() => {
    if (isVisible) {
      updatePosition();
    }
  }, [isVisible, content, updatePosition]);

  const handleMouseEnter = (): void => {
    // Clear any pending hide timeout
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Delay before showing
    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(true);
      timeoutRef.current = null;
    }, delay);
  };

  const handleMouseLeave = (): void => {
    // Clear any pending show timeout
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Hide immediately
    setIsVisible(false);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const containerClass = ['tooltip-container', className].filter(Boolean).join(' ');
  const tooltipClass = ['tooltip', isVisible ? 'visible' : '', `tooltip-${actualPlacement}`].filter(Boolean).join(' ');

  // Calculate arrow styles based on placement
  const arrowStyles: Record<string, string> = {};
  if (actualPlacement.startsWith('bottom')) {
    arrowStyles.top = '-4px';
    arrowStyles.left = `${arrowPosition.x}px`;
  } else if (actualPlacement.startsWith('top')) {
    arrowStyles.bottom = '-4px';
    arrowStyles.left = `${arrowPosition.x}px`;
  }

  return (
    <div
      ref={containerRef}
      class={containerClass}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      <div
        ref={tooltipRef}
        class={tooltipClass}
        role="tooltip"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
      >
        {content}
        <div
          ref={arrowRef}
          class="tooltip-arrow"
          style={arrowStyles}
        />
      </div>
    </div>
  );
};
