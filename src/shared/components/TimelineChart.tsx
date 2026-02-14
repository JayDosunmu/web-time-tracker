import { useRef, useEffect, useState } from "preact/hooks";
import type { FunctionComponent } from "preact";
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from "chart.js";
import type { HourTimesAggregate } from "../../../types";

// Register Chart.js components
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

/**
 * Aggregated data for a 4-hour interval
 */
export interface IntervalData {
  startHour: number; // 0, 4, 8, 12, 16, 20
  totalTime: number; // Aggregated ms from 4 hours
}

/**
 * Aggregate hourly data into 4-hour intervals
 */
export function aggregate4HourIntervals(hourTimes: HourTimesAggregate): IntervalData[] {
  const intervals: IntervalData[] = [];

  for (let startHour = 0; startHour < 24; startHour += 4) {
    let totalTime = 0;

    for (let h = startHour; h < startHour + 4; h++) {
      totalTime += hourTimes.hours[h];
    }

    intervals.push({ startHour, totalTime });
  }

  return intervals;
}

/**
 * Format milliseconds to a compact time string (e.g., "15m", "1h 30m")
 */
function formatTimeCompact(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * Get current hour as fractional value (0-24)
 */
export function getCurrentFractionalHour(now: Date): number {
  return now.getHours() + now.getMinutes() / 60;
}

/**
 * Props for the TimelineChart component
 */
export interface TimelineChartProps {
  /** Pre-aggregated hour times (24-element tuple) */
  hourTimes: HourTimesAggregate;
  /** Current Timestamp is a Datetime timestamp */
  currentDatetime?: Date;
  /** Override auto-calculated max time */
  maxTime?: number;
  /** Force compact x-axis labels (0, 12, 24) */
  compact?: boolean;
  /** Additional CSS class for the container */
  className?: string;
}

/**
 * TimelineChart - A composite chart showing activity per 4-hour interval
 * with a timeline indicator for current time.
 */
export const TimelineChart: FunctionComponent<TimelineChartProps> = ({
  hourTimes,
  currentDatetime,
  maxTime,
  compact,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(compact ?? false);


  const currentHour = getCurrentFractionalHour(currentDatetime || new Date());

  // Aggregate data into 4-hour intervals
  const intervals = aggregate4HourIntervals(hourTimes);

  // Max value for y-axis: 4 hours (the maximum possible time in a 4-hour interval)
  const MAX_INTERVAL_TIME = 4 * 60 * 60 * 1000; // 4 hours in ms
  const calculatedMax = maxTime ?? MAX_INTERVAL_TIME;

  // Detect compact mode based on container width
  useEffect(() => {
    if (compact !== undefined) {
      setIsCompact(compact);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompact(entry.contentRect.width < 200);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [compact]);

  // Create/update chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // X-axis labels based on compact mode
    const labels = isCompact
      ? ["0h", "", "", "12h", "", "", "24h"]
      : ["0h", "4", "8", "12h", "16", "20", "24h"];

    // Prepare data - add a 7th empty point for x=24
    const barData = [...intervals.map((i) => i.totalTime), 0];

    chartRef.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: barData,
            backgroundColor: "#1b72e2",
            borderRadius: 3,
            barPercentage: 0.7,
            categoryPercentage: 0.8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            left: 8,
            right: 8,
            bottom: 10,
          },
        },
        plugins: {
          tooltip: {
            enabled: true,
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex;
                if (idx === undefined || idx >= 6) return "";
                const start = idx * 4;
                const end = start + 4;
                return `${start}:00 - ${end}:00`;
              },
              label: (item) => {
                const value = item.raw as number;
                return value > 0 ? formatTimeCompact(value) : "No activity";
              },
            },
          },
          legend: {
            display: false,
          },
        },
        scales: {
          x: {
            offset: true,
            grid: {
              display: false,
            },
            border: {
              display: true,
              color: "#e2e8f0",
            },
            ticks: {
              color: "#64748b",
              font: {
                size: 10,
              },
              maxRotation: 0,
              minRotation: 0,
              autoSkip: false,
              callback: function (_, index) {
                // Only show label for actual hour marks
                return labels[index];
              },
            },
          },
          y: {
            min: 0,
            max: calculatedMax,
            position: "right",
            grid: {
              color: "#e2e8f0",
              drawTicks: false,
            },
            border: {
              display: false,
            },
            ticks: {
              color: "#94a3b8",
              font: {
                size: 10,
              },
              maxTicksLimit: 3,
              stepSize: calculatedMax / 2,
              callback: function (value) {
                const ms = value as number;
                if (ms === 0) return "0h";
                if (ms === calculatedMax / 2) return formatTimeCompact(calculatedMax / 2);
                if (ms === calculatedMax) return formatTimeCompact(calculatedMax);
                return "";
              },
            },
          },
        },
        animation: {
          duration: 0,
        },
      },
      plugins: [
        {
          id: "timelineIndicator",
          afterDraw: (chart) => {
            const { ctx, chartArea, scales } = chart;
            if (!chartArea || !scales.x) return;

            // Calculate x position for current time
            // Each unit on x-axis represents 4 hours, so divide currentHour by 4
            const xPosition = scales.x.getPixelForValue(currentHour / 4);

            // Draw timeline line from left edge to current time
            const y = chartArea.bottom + 6;

            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = "#1b72e2";
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            ctx.moveTo(chartArea.left, y);
            ctx.lineTo(xPosition, y);
            ctx.stroke();
            ctx.restore();
          },
        },
      ],
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [intervals, calculatedMax, currentHour, isCompact]);

  return (
    <div
      ref={containerRef}
      className={`timeline-chart ${className ?? ""}`.trim()}
    >
      <canvas ref={canvasRef} />
    </div>
  );
};

export default TimelineChart;
