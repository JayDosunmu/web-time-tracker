import type { FunctionComponent } from "preact";
import { getDomainColor } from "../utils/domainColor";
import "./DomainListItemCard.css";

/**
 * Props for the DomainListItemCard component
 */
export interface DomainListItemCardProps {
  /** Domain name */
  domain: string;
  /** Number of visits */
  visitCount: number;
  /** Active time in milliseconds */
  activeTime: number;
  /** Whether this domain is currently active (enables pulse animation) */
  isActive?: boolean;
  /** Additional CSS class */
  className?: string;
}

/**
 * Format milliseconds to HH:MM:SS display string
 */
function formatTimeFull(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Format milliseconds to H:MM display string (no seconds)
 */
function formatTimeShort(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

/**
 * DomainListItemCard - A single-line card displaying domain info.
 * Follows shadcn styling: rounded rectangle with vertically centered content.
 */
export const DomainListItemCard: FunctionComponent<DomainListItemCardProps> = ({
  domain,
  visitCount,
  activeTime,
  isActive = false,
  className = "",
}) => {
  const cardClass = [
    "domain-card",
    isActive ? "domain-card--active" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const dotClass = ["domain-card__dot", isActive ? "domain-card__dot--pulse" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div class={cardClass}>
      <span
        class={dotClass}
        style={{ backgroundColor: getDomainColor(domain) }}
      />
      <span class="domain-card__info">
        <span class="domain-card__name" title={domain}>
          {domain}
        </span>
        <span class="domain-card__visits">({visitCount})</span>
      </span>
      <span class="domain-card__time domain-card__time--full">{formatTimeFull(activeTime)}</span>
      <span class="domain-card__time domain-card__time--short">{formatTimeShort(activeTime)}</span>
    </div>
  );
};

export default DomainListItemCard;
