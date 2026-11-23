"use client";

import { useState } from "react";
import { ChartNoAxesColumn, ChevronDown } from "lucide-react";
import type { AdminDashboardEvent } from "@launchpad/supabase";

interface DashboardAnalyticsChartProps {
  events: AdminDashboardEvent[];
}

export function DashboardAnalyticsChart({ events }: DashboardAnalyticsChartProps) {
  const [dateRange, setDateRange] = useState("Last 30 days");
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Use up to 6 events for clean desktop chart display
  const chartEvents = events.slice(0, 6);

  const maxVal = Math.max(
    ...chartEvents.map((e) => Math.max(e.registration_count, e.attendance_count)),
    6
  );
  // Round up to nice number
  const yAxisMax = Math.ceil(maxVal / 5) * 5;
  const yAxisMid = Math.round(yAxisMax / 2);

  const chartBottom = 160;
  const chartTop = 20;
  const usableHeight = chartBottom - chartTop;

  return (
    <div className="bg-white rounded-[22px] border border-[#E9E9ED] p-6 shadow-sm flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#FFF3BD] text-[#8A6800] flex items-center justify-center shrink-0">
            <ChartNoAxesColumn className="w-4 h-4" />
          </div>
          <h2 className="text-[19px] font-bold text-[#171717] tracking-tight m-0">
            Registrations & Check-ins
          </h2>
        </div>

        {/* Date range selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setDateDropdownOpen((open) => !open)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#666B7A] bg-[#FAFAFA] border border-[#E9E9ED] rounded-full hover:bg-[#F5F5F7] hover:text-[#171717] transition-colors cursor-pointer"
          >
            <span>{dateRange}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {dateDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-36 bg-white border border-[#E9E9ED] rounded-xl shadow-lg p-1 z-30">
              {["Last 7 days", "Last 30 days", "All time"].map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => {
                    setDateRange(range);
                    setDateDropdownOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-[#171717] rounded-lg hover:bg-[#F5F5F7] transition-colors"
                >
                  {range}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mb-4 text-xs font-medium text-[#666B7A]">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[#FFD84D]" />
          <span>Registrations</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[#E0DAFB]" />
          <span>Check-ins</span>
        </div>
      </div>

      {/* Chart visualization */}
      {chartEvents.length === 0 ? (
        <div className="flex-1 min-h-[180px] flex flex-col items-center justify-center text-center p-6 border border-dashed border-[#E9E9ED] rounded-xl bg-[#FAFAFA]">
          <ChartNoAxesColumn className="w-8 h-8 text-[#858B98] mb-2" />
          <p className="text-sm font-medium text-[#666B7A] m-0">No event metrics recorded yet</p>
          <span className="text-xs text-[#858B98] mt-1">
            Data will automatically appear as students register and check in.
          </span>
        </div>
      ) : (
        <div className="relative w-full flex-1 min-h-[200px] select-none">
          <svg
            viewBox="0 0 540 210"
            className="w-full h-full overflow-visible"
            aria-label="Registrations and check-ins bar chart"
          >
            {/* Gridlines and Y-axis numbers */}
            <g className="text-[11px] fill-[#858B98] font-medium">
              {/* Top line */}
              <line x1="35" y1={chartTop} x2="520" y2={chartTop} stroke="#F0F0F3" strokeWidth="1" />
              <text x="10" y={chartTop + 4} textAnchor="start">
                {yAxisMax}
              </text>

              {/* Mid line */}
              <line
                x1="35"
                y1={chartTop + usableHeight / 2}
                x2="520"
                y2={chartTop + usableHeight / 2}
                stroke="#F0F0F3"
                strokeWidth="1"
              />
              <text x="10" y={chartTop + usableHeight / 2 + 4} textAnchor="start">
                {yAxisMid}
              </text>

              {/* Bottom baseline */}
              <line x1="35" y1={chartBottom} x2="520" y2={chartBottom} stroke="#E9E9ED" strokeWidth="1" />
              <text x="10" y={chartBottom + 4} textAnchor="start">
                0
              </text>
            </g>

            {/* Bars */}
            {chartEvents.map((event, idx) => {
              const totalSlots = chartEvents.length;
              const slotWidth = (520 - 45) / totalSlots;
              const groupCenterX = 45 + idx * slotWidth + slotWidth / 2;
              const barWidth = Math.min(22, slotWidth * 0.28);
              const barGap = 4;

              const regHeight = Math.max((event.registration_count / yAxisMax) * usableHeight, 4);
              const regY = chartBottom - regHeight;

              const attHeight = Math.max((event.attendance_count / yAxisMax) * usableHeight, 4);
              const attY = chartBottom - attHeight;

              const isHovered = hoveredIndex === idx;

              return (
                <g
                  key={event.id}
                  className="cursor-pointer transition-opacity"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Subtle hover background pillar */}
                  {isHovered && (
                    <rect
                      x={groupCenterX - barWidth - barGap - 8}
                      y={chartTop}
                      width={(barWidth + barGap) * 2 + 16}
                      height={usableHeight}
                      fill="#FAFAFA"
                      rx="8"
                    />
                  )}

                  {/* Registrations Bar (Yellow) */}
                  <rect
                    x={groupCenterX - barWidth - barGap / 2}
                    y={regY}
                    width={barWidth}
                    height={regHeight}
                    fill="#FFD84D"
                    rx="4"
                    className="transition-all duration-200"
                  />

                  {/* Check-ins Bar (Muted Lavender) */}
                  <rect
                    x={groupCenterX + barGap / 2}
                    y={attY}
                    width={barWidth}
                    height={attHeight}
                    fill="#E0DAFB"
                    rx="4"
                    className="transition-all duration-200"
                  />

                  {/* X-axis Label */}
                  <text
                    x={groupCenterX}
                    y={chartBottom + 20}
                    textAnchor="middle"
                    className="text-[12px] fill-[#666B7A] font-medium"
                  >
                    {event.title.length > 10 ? `${event.title.slice(0, 8)}…` : event.title}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Floating Tooltip */}
          {hoveredIndex !== null && chartEvents[hoveredIndex] && (
            <div
              className="absolute pointer-events-none bg-[#1C1C1C] text-white px-3 py-2 rounded-xl text-xs shadow-xl z-20 -translate-x-1/2 -translate-y-full transition-all duration-150"
              style={{
                left: `${
                  ((45 +
                    hoveredIndex * ((520 - 45) / chartEvents.length) +
                    (520 - 45) / chartEvents.length / 2) /
                    540) *
                  100
                }%`,
                top: "25%",
              }}
            >
              <div className="font-bold text-white mb-1">{chartEvents[hoveredIndex].title}</div>
              <div className="flex items-center gap-2 text-[#FFD84D]">
                <span>●</span> Registrations:{" "}
                <span className="font-semibold text-white">
                  {chartEvents[hoveredIndex].registration_count}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[#E0DAFB]">
                <span>●</span> Check-ins:{" "}
                <span className="font-semibold text-white">
                  {chartEvents[hoveredIndex].attendance_count}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
