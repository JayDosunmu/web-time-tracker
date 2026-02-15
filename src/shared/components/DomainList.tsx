import { useRef, useLayoutEffect, useMemo } from "preact/hooks";
import type { FunctionComponent } from "preact";
import { getDomainColor } from "../utils/domainColor";
import "./DomainList.css";

/**
 * Individual domain data item for the list
 */
export interface DomainListItem {
  domain: string;
  visitCount: number;
  activeTime: number; // milliseconds
}

/**
 * Format milliseconds to HH:MM:SS display string
 */
function formatTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Props for the DomainList component
 */
export interface DomainListProps {
  /** Array of domain data to display */
  items: DomainListItem[];
  /** Comparator function for sorting items. If omitted, items display in original order. */
  sortBy?: (a: DomainListItem, b: DomainListItem) => number;
  /** Maximum number of visible rows (overflow hidden) */
  maxRows?: number;
  /** Additional CSS class for the container */
  className?: string;
  /** Whether items are actively being updated (enables animations) */
  isLive?: boolean;
}

/**
 * DomainList - Displays domains with visit counts and active time.
 * Supports live updates with smooth reorder animations.
 */
export const DomainList: FunctionComponent<DomainListProps> = ({
  items,
  sortBy,
  maxRows = 10,
  className = "",
  isLive = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevPositions = useRef<Map<string, number>>(new Map());
  const prevDomains = useRef<Set<string>>(new Set());

  // Sort items if sortBy provided, otherwise use original order
  const sortedItems = useMemo(() => {
    if (!sortBy) return items;
    return items.slice().sort(sortBy);
  }, [items, sortBy]);

  // Limit to maxRows
  const visibleItems = useMemo(
    () => sortedItems.slice(0, maxRows),
    [sortedItems, maxRows]
  );

  // FLIP animation for reordering
  useLayoutEffect(() => {
    if (!containerRef.current || !isLive) return;

    const rows = containerRef.current.querySelectorAll(".domain-row");

    rows.forEach((row) => {
      const domain = row.getAttribute("data-domain");
      if (!domain) return;

      const rect = row.getBoundingClientRect();
      const oldTop = prevPositions.current.get(domain);

      // Animate if position changed significantly
      if (oldTop !== undefined && Math.abs(oldTop - rect.top) > 1) {
        const delta = oldTop - rect.top;
        const el = row as HTMLElement;

        // Apply inverse transform immediately
        el.style.transform = `translateY(${delta}px)`;
        el.style.transition = "none";

        // Animate to final position on next frame
        requestAnimationFrame(() => {
          el.style.transition = "transform 200ms ease-out";
          el.style.transform = "translateY(0)";
        });
      }
    });

    // Update position cache
    const newPositions = new Map<string, number>();
    rows.forEach((row) => {
      const domain = row.getAttribute("data-domain");
      if (domain) {
        newPositions.set(domain, row.getBoundingClientRect().top);
      }
    });
    prevPositions.current = newPositions;
    prevDomains.current = new Set(visibleItems.map((i) => i.domain));
  }, [visibleItems, isLive]);

  const containerClass = ["domain-list", className].filter(Boolean).join(" ");

  return (
    <div ref={containerRef} class={containerClass}>
      {visibleItems.map((item) => {
        const isNew = isLive && !prevDomains.current.has(item.domain);
        const rowClass = ["domain-row", isNew ? "entering" : ""]
          .filter(Boolean)
          .join(" ");

        return (
          <div key={item.domain} class={rowClass} data-domain={item.domain}>
            <span
              class="domain-dot"
              style={{ backgroundColor: getDomainColor(item.domain) }}
            />
            <span class="domain-name" title={item.domain}>
              {item.domain}
            </span>
            <span class="domain-visits">({item.visitCount})</span>
            <span class="domain-time">{formatTime(item.activeTime)}</span>
          </div>
        );
      })}
    </div>
  );
};

export default DomainList;
