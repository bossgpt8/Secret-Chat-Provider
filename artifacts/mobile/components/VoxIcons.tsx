/**
 * VoxIcons — custom SVG tab bar icons.
 *
 * Each icon accepts `color` (hex string passed by the tab bar) and `size`
 * (number). They use react-native-svg which is already in the workspace.
 */

import React from "react";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

// ── Chat / Voice ──────────────────────────────────────────────────────────────
// Five waveform bars of ascending-descending heights — the audio/voice metaphor
export function VoiceWaveIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="1"  y="10" width="3" height="4"  rx="1.5" fill={color} />
      <Rect x="6"  y="6"  width="3" height="12" rx="1.5" fill={color} />
      <Rect x="11" y="2"  width="3" height="20" rx="1.5" fill={color} />
      <Rect x="16" y="6"  width="3" height="12" rx="1.5" fill={color} />
      <Rect x="21" y="10" width="3" height="4"  rx="1.5" fill={color} />
    </Svg>
  );
}

// ── Messages ──────────────────────────────────────────────────────────────────
// Single speech bubble with a left-bottom tail
export function BubbleIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
        stroke={color}
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────────
// Three horizontal rails with a circular handle each — EQ / sliders metaphor
export function SlidersIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Rail 1 */}
      <Line x1="3" y1="6"  x2="21" y2="6"  stroke={color} strokeWidth="1.85" strokeLinecap="round" />
      <Circle cx="8"  cy="6"  r="2.5" fill={color} />

      {/* Rail 2 */}
      <Line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth="1.85" strokeLinecap="round" />
      <Circle cx="16" cy="12" r="2.5" fill={color} />

      {/* Rail 3 */}
      <Line x1="3" y1="18" x2="21" y2="18" stroke={color} strokeWidth="1.85" strokeLinecap="round" />
      <Circle cx="10" cy="18" r="2.5" fill={color} />
    </Svg>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
// Minimal gear — inner circle + 8 evenly-spaced notch rects rotated via transform
export function GearIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
        stroke={color}
        strokeWidth="1.85"
      />
      <Path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={color}
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────────
// Classic person — head circle + shoulders arc
export function PersonIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
        stroke={color}
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="7" r="4" stroke={color} strokeWidth="1.85" />
    </Svg>
  );
}
