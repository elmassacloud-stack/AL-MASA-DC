export const DEFAULT_BRAND_COLOR = '#2563eb';

export interface BrandColorPreset {
  id: string;
  nameAr: string;
  hex: string;
}

export const BRAND_COLOR_PRESETS: BrandColorPreset[] = [
  { id: 'royal-blue', nameAr: 'الأزرق الملكي (الافتراضي)', hex: '#2563eb' },
  { id: 'navy-blue', nameAr: 'الأزرق الهندسي الداكن', hex: '#1d4ed8' },
  { id: 'emerald', nameAr: 'الأخضر الزمردي', hex: '#059669' },
  { id: 'teal', nameAr: 'التركوازي العميق', hex: '#0d9488' },
  { id: 'indigo', nameAr: 'النيلي التنفيذي', hex: '#4f46e5' },
  { id: 'crimson', nameAr: 'العنابي الرسمي', hex: '#be123c' },
  { id: 'amber-bronze', nameAr: 'البرونزي الهندسي', hex: '#b45309' },
  { id: 'slate-pro', nameAr: 'الرمادي الفحمي', hex: '#334155' }
];

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_REGEX.test(value.trim());
}

export function normalizeHexColor(value?: string | null): string {
  if (!value) return DEFAULT_BRAND_COLOR;
  const trimmed = value.trim().toLowerCase();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return HEX_COLOR_REGEX.test(withHash) ? withHash : DEFAULT_BRAND_COLOR;
}

interface RgbTuple {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RgbTuple {
  const clean = normalizeHexColor(hex).slice(1);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }: RgbTuple): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')
  );
}

function mixRgb(base: RgbTuple, target: RgbTuple, targetWeight: number): RgbTuple {
  const w = Math.max(0, Math.min(1, targetWeight));
  return {
    r: base.r * (1 - w) + target.r * w,
    g: base.g * (1 - w) + target.g * w,
    b: base.b * (1 - w) + target.b * w
  };
}

export type BrandShadeKey =
  | '50'
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900'
  | '950';

export type BrandPalette = Record<BrandShadeKey, string>;

const WHITE_RGB: RgbTuple = { r: 255, g: 255, b: 255 };
const DEEP_INK_RGB: RgbTuple = { r: 10, g: 15, b: 28 };

/**
 * Generate a harmonious 11-step Tailwind palette anchored at shade 600
 * so buttons (`bg-blue-600`), hover states (`bg-blue-700`), soft badges (`bg-blue-50`),
 * borders (`border-blue-200`), and dark-mode surfaces (`dark:bg-blue-950`) all adapt cohesively.
 */
export function generateBrandPalette(hex: string): BrandPalette {
  const normalized = normalizeHexColor(hex);
  const base = hexToRgb(normalized);

  return {
    '50': rgbToHex(mixRgb(base, WHITE_RGB, 0.94)),
    '100': rgbToHex(mixRgb(base, WHITE_RGB, 0.86)),
    '200': rgbToHex(mixRgb(base, WHITE_RGB, 0.72)),
    '300': rgbToHex(mixRgb(base, WHITE_RGB, 0.52)),
    '400': rgbToHex(mixRgb(base, WHITE_RGB, 0.28)),
    '500': rgbToHex(mixRgb(base, WHITE_RGB, 0.12)),
    '600': normalized,
    '700': rgbToHex(mixRgb(base, DEEP_INK_RGB, 0.16)),
    '800': rgbToHex(mixRgb(base, DEEP_INK_RGB, 0.34)),
    '900': rgbToHex(mixRgb(base, DEEP_INK_RGB, 0.54)),
    '950': rgbToHex(mixRgb(base, DEEP_INK_RGB, 0.74))
  };
}

/**
 * Compute WCAG relative luminance (0..1) to warn admins if they select
 * an overly bright brand color that reduces white-text readability on buttons.
 */
export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const linearize = (channel: number) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function isBrandColorTooLight(hex: string): boolean {
  return getRelativeLuminance(hex) > 0.45;
}

const SHADE_KEYS: BrandShadeKey[] = [
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950'
];

/**
 * Apply the custom Brand Color globally by updating Tailwind v4's `--color-blue-*`
 * CSS custom properties and `--brand-*` semantic tokens on `:root`.
 * When set to the default color, removes inline overrides so native defaults apply cleanly.
 */
export function applyBrandColorToDocument(hex: string): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const normalized = normalizeHexColor(hex);
  const palette = generateBrandPalette(normalized);

  root.style.setProperty('--brand-primary', palette['600']);
  root.style.setProperty('--brand-primary-hover', palette['700']);
  root.style.setProperty('--brand-primary-dark', palette['800']);
  root.style.setProperty('--brand-primary-soft', palette['50']);

  if (normalized === DEFAULT_BRAND_COLOR) {
    for (const shade of SHADE_KEYS) {
      root.style.removeProperty(`--color-blue-${shade}`);
    }
  } else {
    for (const shade of SHADE_KEYS) {
      root.style.setProperty(`--color-blue-${shade}`, palette[shade]);
    }
  }

  // Keep mobile browser address bar theme-color synchronized
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', palette['600']);
  }
}
