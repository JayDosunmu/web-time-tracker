/**
 * Reusable toggle icon button with crossfade animation between icons
 * Supports hover preview, active state, and accessibility features
 */

import { type FunctionComponent, type ComponentType } from 'preact';
import { useState } from 'preact/hooks';
import './ToggleIconButton.css';

interface ToggleIconButtonProps {
  /** Whether the toggle is currently active/on */
  isActive: boolean;
  /** Callback when toggle is clicked */
  onToggle: () => void;
  /** Icon component to show when active */
  activeIcon: ComponentType<{ size: number }>;
  /** Icon component to show when inactive */
  inactiveIcon: ComponentType<{ size: number }>;
  /** Aria-label when toggle is active */
  activeLabel: string;
  /** Aria-label when toggle is inactive */
  inactiveLabel: string;
  /** Icon size in pixels (default: 24) */
  iconSize?: number;
  /** Additional CSS class for the button */
  className?: string;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** When true, shows active icon on hover even when inactive (default: false) */
  enableHoverPreview?: boolean;
  /** Callback when hover state changes (useful for parent reactions to hover) */
  onHoverChange?: (isHovered: boolean) => void;
}

export const ToggleIconButton: FunctionComponent<ToggleIconButtonProps> = ({
  isActive,
  onToggle,
  activeIcon: ActiveIcon,
  inactiveIcon: InactiveIcon,
  activeLabel,
  inactiveLabel,
  iconSize = 24,
  className = '',
  disabled = false,
  enableHoverPreview = false,
  onHoverChange,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Show active icon when: toggled on, OR (hover preview enabled AND hovering)
  const showActiveIcon = isActive || (enableHoverPreview && isHovered);

  const handleMouseEnter = (): void => {
    setIsHovered(true);
    onHoverChange?.(true);
  };

  const handleMouseLeave = (): void => {
    setIsHovered(false);
    onHoverChange?.(false);
  };

  const buttonClass = [
    'toggle-icon-button',
    isActive ? 'active' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      class={buttonClass}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={isActive ? activeLabel : inactiveLabel}
      aria-pressed={isActive}
      disabled={disabled}
    >
      <div class="toggle-icon-container">
        <span class={`toggle-icon inactive ${showActiveIcon ? 'hidden' : ''}`}>
          <InactiveIcon size={iconSize} />
        </span>
        <span class={`toggle-icon active ${showActiveIcon ? '' : 'hidden'}`}>
          <ActiveIcon size={iconSize} />
        </span>
      </div>
    </button>
  );
};
