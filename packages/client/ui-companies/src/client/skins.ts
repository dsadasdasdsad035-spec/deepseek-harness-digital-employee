/** Client-owned company skin catalog: preset visual styles for both 3D layers. */

/** Roof shape family a skin draws for campus houses. */
export type SkinRoofForm = 'pitched' | 'flat' | 'curved' | 'glass'

/** Procedural decoration kinds placed around a campus house. */
export type SkinDecoration = 'trees' | 'lanterns' | 'neon-edges' | 'chimney'

/** Ground drawing style of the campus plane. */
export type SkinGroundStyle = 'grid' | 'paved' | 'night-grid' | 'grass' | 'reflective'

/** Desk construction style inside the office layer. */
export type SkinDeskStyle = 'wood' | 'white' | 'dark' | 'glass'

/** Campus-layer visual parameters of one skin. */
export interface SkinCampus {
  /** Sky background color. */
  readonly sky: number
  /** Ground plane base color. */
  readonly ground: number
  readonly groundStyle: SkinGroundStyle
  /** House wall color. */
  readonly body: number
  readonly roofForm: SkinRoofForm
  /** Roof base color; the category hue tints within the skin palette. */
  readonly roofBase: number
  readonly decorations: readonly SkinDecoration[]
}

/** Office-layer visual parameters of one skin. */
export interface SkinOffice {
  /** Floor plane color. */
  readonly floor: number
  /** Partition and perimeter wall color inside the interior. */
  readonly wall: number
  /** Amenity furniture accent (sofa, counter, cabinets). */
  readonly fixture: number
  /** Carpet opacity multiplier (0..1) applied over the department color. */
  readonly carpetOpacity: number
  readonly desk: { readonly top: number; readonly leg: number; readonly style: SkinDeskStyle }
  /** Screen emissive color while busy. */
  readonly screenBusy: number
  /** Hemisphere light intensity. */
  readonly ambient: number
}

/** One shipped skin preset driving both 3D layers. */
export interface CompanySkin {
  readonly id: string
  /** Chinese label shown in the picker. */
  readonly label: string
  /** Picker preview swatches (css colors). */
  readonly preview: readonly string[]
  readonly campus: SkinCampus
  readonly office: SkinOffice
}

/** The shipped default preset; the rendering fallback for absent and unknown ids. */
export const DEFAULT_COMPANY_SKIN: CompanySkin = {
  id: 'modern',
  label: '现代简约',
  preview: ['#f3efe6', '#94a3b8', '#e8e4d8', '#b9925e'],
  campus: {
    sky: 0xdfe9f3,
    ground: 0xe8e4d8,
    groundStyle: 'grid',
    body: 0xf3efe6,
    roofForm: 'pitched',
    roofBase: 0x94a3b8,
    decorations: ['trees'],
  },
  office: {
    floor: 0xdcd7c9,
    wall: 0xe2e8f0,
    fixture: 0x94a3b8,
    carpetOpacity: 0.32,
    desk: { top: 0xb9925e, leg: 0x8a6a3f, style: 'wood' },
    screenBusy: 0xf87171,
    ambient: 1.4,
  },
}

/** The five shipped presets; `modern` (the phase-1 look) is the default. */
export const COMPANY_SKINS: readonly CompanySkin[] = [
  DEFAULT_COMPANY_SKIN,
  {
    id: 'courtyard',
    label: '中式庭院',
    preview: ['#f5f0e6', '#7f1d1d', '#d4a017', '#ef4444'],
    campus: {
      sky: 0xf3e9d2,
      ground: 0xd9cbb2,
      groundStyle: 'paved',
      body: 0xf5f0e6,
      roofForm: 'curved',
      roofBase: 0x7f1d1d,
      decorations: ['lanterns'],
    },
    office: {
      floor: 0xcbb99a,
      wall: 0xd8c3a5,
      fixture: 0x8c5a2b,
      carpetOpacity: 0.42,
      desk: { top: 0x8b3a2f, leg: 0x5c2a20, style: 'wood' },
      screenBusy: 0xfbbf24,
      ambient: 1.15,
    },
  },
  {
    id: 'neon',
    label: '科技霓虹',
    preview: ['#0f172a', '#22d3ee', '#a855f7', '#38bdf8'],
    campus: {
      sky: 0x0b1020,
      ground: 0x111827,
      groundStyle: 'night-grid',
      body: 0x1e293b,
      roofForm: 'flat',
      roofBase: 0x22d3ee,
      decorations: ['neon-edges'],
    },
    office: {
      floor: 0x0f172a,
      wall: 0x1e293b,
      fixture: 0x22d3ee,
      carpetOpacity: 0.55,
      desk: { top: 0x1f2937, leg: 0x334155, style: 'dark' },
      screenBusy: 0x22d3ee,
      ambient: 0.85,
    },
  },
  {
    id: 'cottage',
    label: '田园木屋',
    preview: ['#a9713d', '#7c4a21', '#86bb6c', '#4ade80'],
    campus: {
      sky: 0xcfe8d8,
      ground: 0x9ec98a,
      groundStyle: 'grass',
      body: 0xa9713d,
      roofForm: 'pitched',
      roofBase: 0x7c4a21,
      decorations: ['chimney', 'trees'],
    },
    office: {
      floor: 0xc2a878,
      wall: 0xb08d5e,
      fixture: 0x7c5a3a,
      carpetOpacity: 0.3,
      desk: { top: 0xc98f5a, leg: 0x8a6a3f, style: 'wood' },
      screenBusy: 0x4ade80,
      ambient: 1.5,
    },
  },
  {
    id: 'glass',
    label: '玻璃幕墙',
    preview: ['#bae6fd', '#7dd3fc', '#f8fafc', '#e2e8f0'],
    campus: {
      sky: 0xd6ecfb,
      ground: 0xdfe7ee,
      groundStyle: 'reflective',
      body: 0xbae6fd,
      roofForm: 'glass',
      roofBase: 0x7dd3fc,
      decorations: [],
    },
    office: {
      floor: 0xeef2f6,
      wall: 0xcdd9e5,
      fixture: 0x64748b,
      carpetOpacity: 0.22,
      desk: { top: 0xf8fafc, leg: 0xe2e8f0, style: 'glass' },
      screenBusy: 0x60a5fa,
      ambient: 1.6,
    },
  },
]

/**
 * Resolve one skin id to its preset.
 * @param skinId - stored per-company id; absent or unknown falls back to the default.
 * @returns the matching preset, or the default preset for unknown ids.
 */
export function resolveCompanySkin(skinId: string | undefined): CompanySkin {
  const match = COMPANY_SKINS.find(skin => skin.id === skinId)
  if (match !== undefined) return match
  return DEFAULT_COMPANY_SKIN
}
