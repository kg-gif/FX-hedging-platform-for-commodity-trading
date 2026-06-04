// ThemePicker.jsx — preview-only theme switcher for the design demo
//
// IMPORTANT: This is an exploration tool, not a brand commitment.
// The canonical SNH palette is fixed by Brand Guide v1.2 and signed off by Pixel.
// Any palette change away from "SNH brand" requires Pixel + CEO MiniMe approval.

import { useEffect, useState } from 'react'

export const THEMES = {
  brand: {
    name: 'SNH brand',
    description: 'Canonical — signed off in Brand Guide v1.2',
    '--snh-navy':         '#1A2744',
    '--snh-navy-light':   '#243560',
    '--snh-gold':         '#C9A86C',
    '--snh-gold-muted':   'rgba(201, 168, 108, 0.15)',
    '--snh-slate':        '#8DA4C4',
    '--snh-page':         '#F0F2F7',
    '--snh-card':         '#FFFFFF',
  },
  midnight: {
    name: 'Midnight + Amber',
    description: 'Deep blue / warm amber — Goldman / JPM register',
    '--snh-navy':         '#0B1929',
    '--snh-navy-light':   '#162B43',
    '--snh-gold':         '#D4A24C',
    '--snh-gold-muted':   'rgba(212, 162, 76, 0.15)',
    '--snh-slate':        '#7A93B0',
    '--snh-page':         '#EEF2F7',
    '--snh-card':         '#FFFFFF',
  },
  charcoal: {
    name: 'Charcoal + Amber',
    description: 'Near-black / amber — Bloomberg terminal register',
    '--snh-navy':         '#1A1D24',
    '--snh-navy-light':   '#2C313B',
    '--snh-gold':         '#E8A33D',
    '--snh-gold-muted':   'rgba(232, 163, 61, 0.15)',
    '--snh-slate':        '#8B9099',
    '--snh-page':         '#F4F5F7',
    '--snh-card':         '#FFFFFF',
  },
  forest: {
    name: 'Forest + Brass',
    description: 'Deep green / brass — private banking register',
    '--snh-navy':         '#1F3B2D',
    '--snh-navy-light':   '#2E5443',
    '--snh-gold':         '#B89252',
    '--snh-gold-muted':   'rgba(184, 146, 82, 0.15)',
    '--snh-slate':        '#7E9990',
    '--snh-page':         '#F1F4F1',
    '--snh-card':         '#FFFFFF',
  },
  slate: {
    name: 'Slate + Teal',
    description: 'Cool slate / teal — modern fintech register',
    '--snh-navy':         '#1E2A3A',
    '--snh-navy-light':   '#2E3D52',
    '--snh-gold':         '#3FAFB4',
    '--snh-gold-muted':   'rgba(63, 175, 180, 0.15)',
    '--snh-slate':        '#8093A8',
    '--snh-page':         '#EFF2F6',
    '--snh-card':         '#FFFFFF',
  },
  ink: {
    name: 'Ink + Copper',
    description: 'Off-black / copper — editorial / Economist register',
    '--snh-navy':         '#1B1F26',
    '--snh-navy-light':   '#2A2F39',
    '--snh-gold':         '#B87333',
    '--snh-gold-muted':   'rgba(184, 115, 51, 0.15)',
    '--snh-slate':        '#8A8F99',
    '--snh-page':         '#F5F5F2',
    '--snh-card':         '#FFFFFF',
  },
}

const STORAGE_KEY = 'snh-theme-preview'

export function useTheme() {
  const [themeId, setThemeId] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && THEMES[stored]) return stored
    } catch (_) {}
    return 'brand'
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, themeId) } catch (_) {}
  }, [themeId])

  const theme = THEMES[themeId] || THEMES.brand
  const vars = Object.fromEntries(
    Object.entries(theme).filter(([k]) => k.startsWith('--'))
  )

  return { themeId, setThemeId, vars }
}

export default function ThemePicker({ themeId, onChange }) {
  return (
    <div style={{
      background: 'var(--snh-card)',
      border: '1px solid var(--border-1)',
      borderRadius: 'var(--radius-3)',
      padding: '16px 20px',
      marginBottom: '24px',
    }}>
      <div style={{
        fontSize: 'var(--fs-eyebrow)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontWeight: 'var(--fw-bold)',
        color: 'var(--snh-gold)',
        marginBottom: '6px',
      }}>
        Theme — preview only
      </div>
      <div className="caption" style={{ color: 'var(--fg-2)', marginBottom: '12px' }}>
        Test alternative palettes against the components. SNH brand is canonical — any change away
        from it requires Pixel and CEO MiniMe approval.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {Object.entries(THEMES).map(([id, t]) => {
          const active = id === themeId
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              style={{
                background: active ? 'var(--snh-gold-muted)' : 'transparent',
                border: active ? '1px solid var(--snh-gold)' : '1px solid var(--border-1)',
                borderRadius: 'var(--radius-pill)',
                padding: '6px 12px',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--fs-body-sm)',
                fontWeight: active ? 'var(--fw-bold)' : 'var(--fw-regular)',
                color: active ? 'var(--snh-navy)' : 'var(--snh-slate)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
              title={t.description}
            >
              <span style={{ display: 'inline-flex', gap: 2 }}>
                <span style={{ width: 10, height: 10, background: t['--snh-navy'], borderRadius: 2 }} />
                <span style={{ width: 10, height: 10, background: t['--snh-gold'], borderRadius: 2 }} />
                <span style={{ width: 10, height: 10, background: t['--snh-slate'], borderRadius: 2 }} />
              </span>
              {t.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
