/**
 * 🎨 Color utilities for custom campaign banner colors.
 *
 * Pure functions (no Angular deps) so they can be used in components,
 * services, and SSR safely.
 */

/** A curated palette shown in the admin color picker. */
export const CAMPAIGN_COLOR_PALETTE: string[] = [
  // Reds / warm
  '#b93818',
  '#e66a12',
  '#ef4444',
  '#dc2626',
  '#f97316',
  '#fb923c',
  // Pinks / magentas
  '#db2777',
  '#ec4899',
  '#be185d',
  '#f472b6',
  // Purples / violets
  '#7c3aed',
  '#8b5cf6',
  '#6366f1',
  '#a855f7',
  '#9333ea',
  // Blues
  '#1d4ed8',
  '#2563eb',
  '#3b82f6',
  '#0ea5e9',
  '#0284c7',
  '#1e40af',
  // Teals / cyans
  '#0d9488',
  '#14b8a6',
  '#0891b2',
  '#06b6d4',
  // Greens
  '#15803d',
  '#16a34a',
  '#22c55e',
  '#4ade80',
  '#047857',
  // Yellows / golds
  '#ca8a04',
  '#eab308',
  '#f59e0b',
  '#facc15',
  '#a16207',
  // Browns / neutrals
  '#78350f',
  '#92400e',
  '#b45309',
  '#78716c',
  '#57534e',
  '#44403c',
  // Grays / slate
  '#334155',
  '#475569',
  '#64748b',
  '#1e293b',
  '#0f172a',
  // Black / white
  '#111827',
  '#000000',
  '#ffffff',
];

/** Named color presets shown as quick-pick chips. */
export interface ColorPreset {
  label: string;
  from: string;
  to: string;
}

/** Ready-made gradient presets. */
export const CAMPAIGN_GRADIENT_PRESETS: ColorPreset[] = [
  { label: 'آتشین', from: '#b93818', to: '#e66a12' },
  { label: 'غروب', from: '#f97316', to: '#db2777' },
  { label: 'اقیانوس', from: '#1d4ed8', to: '#0891b2' },
  { label: 'یونیکورن', from: '#7c3aed', to: '#ec4899' },
  { label: 'جنگل', from: '#047857', to: '#4ade80' },
  { label: 'طلایی', from: '#ca8a04', to: '#facc15' },
  { label: 'شبنم', from: '#4c1d95', to: '#1d4ed8' },
  { label: 'گرگ و میش', from: '#334155', to: '#94a3b8' },
];

export const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Normalize any hex input (3 or 6 digits) to a 6-digit lowercase hex. */
export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  let hex = String(value).trim();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (!HEX_COLOR_PATTERN.test(hex)) return null;
  if (hex.length === 4) {
    // #abc → #aabbcc
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex.toLowerCase();
}

/** Convert a hex color to { r, g, b } (0–255). */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const full =
    normalized.length === 4
      ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
      : normalized;
  return {
    r: parseInt(full.slice(1, 3), 16),
    g: parseInt(full.slice(3, 5), 16),
    b: parseInt(full.slice(5, 7), 16),
  };
}

/** Convert { r, g, b } to a 6-digit hex string. */
export function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Relative luminance (WCAG).
 * Returns 0 (black) to 1 (white).
 */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * Pick a readable text color (white or dark) for the given background.
 * Uses WCAG contrast comparison so the result is always legible.
 */
export function readableTextColor(background: string): '#ffffff' | '#0f172a' {
  const lum = relativeLuminance(background);
  // Contrast against white vs against near-black; pick the higher one.
  const contrastWithWhite = 1.05 / (lum + 0.05);
  const contrastWithDark = (lum + 0.05) / 0.05;
  return contrastWithWhite >= contrastWithDark ? '#ffffff' : '#0f172a';
}

/** Average color of a set of hex colors (used for multi-stop gradients). */
export function averageColor(colors: string[]): string {
  const rgbs = colors.map(hexToRgb).filter(Boolean) as { r: number; g: number; b: number }[];
  if (rgbs.length === 0) return '#b93818';
  const sum = rgbs.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), {
    r: 0,
    g: 0,
    b: 0,
  });
  return rgbToHex(sum.r / rgbs.length, sum.g / rgbs.length, sum.b / rgbs.length);
}

/**
 * Build a CSS `linear-gradient(...)` value from 2–4 hex colors + an angle.
 */
export function buildGradient(colors: string[], angle = 120): string {
  const stops = colors.map(normalizeHex).filter(Boolean) as string[];
  if (stops.length < 2) {
    const single = stops[0] ?? '#b93818';
    return `linear-gradient(120deg, ${single} 0%, ${single} 100%)`;
  }
  const pct = 100 / (stops.length - 1);
  const parts = stops.map((c, i) => `${c} ${(i * pct).toFixed(2)}%`);
  return `linear-gradient(${angle}deg, ${parts.join(', ')})`;
}

/**
 * Build the CSS custom properties applied to a campaign banner.
 * Returns an empty object when no custom colors are set (theme applies instead).
 */
export function buildBannerStyle(
  colors: { background?: string; gradient?: string[]; gradientAngle?: number } | null | undefined,
): Record<string, string> {
  if (!colors) return {};

  const gradient = (colors.gradient ?? []).map(normalizeHex).filter(Boolean) as string[];
  const background = normalizeHex(colors.background);
  const angle = Math.max(0, Math.min(360, colors.gradientAngle ?? 120));

  if (gradient.length >= 2) {
    const average = averageColor(gradient);
    const textColor = readableTextColor(average);
    return {
      '--banner-gradient-from': gradient[0],
      '--banner-gradient-to': gradient[gradient.length - 1],
      '--banner-glow': `${gradient[0]}4d`,
      '--banner-text': textColor,
      '--banner-accent': textColor,
      '--banner-border': `${textColor === '#ffffff' ? '#ffffff' : '#0f172a'}2e`,
      '--banner-countdown-bg':
        textColor === '#ffffff' ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.22)',
      '--banner-focus': textColor,
      'background-image': buildGradient(gradient, angle),
    };
  }

  if (background) {
    const textColor = readableTextColor(background);
    return {
      '--banner-gradient-from': background,
      '--banner-gradient-to': background,
      '--banner-glow': `${background}4d`,
      '--banner-text': textColor,
      '--banner-accent': textColor,
      '--banner-border': `${textColor === '#ffffff' ? '#ffffff' : '#0f172a'}2e`,
      '--banner-countdown-bg':
        textColor === '#ffffff' ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.22)',
      '--banner-focus': textColor,
    };
  }

  return {};
}
