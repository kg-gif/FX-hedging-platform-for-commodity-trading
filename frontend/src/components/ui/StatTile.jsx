// StatTile.jsx — eyebrow + value + sub-caption + delta
//
// Brand rules:
//   - Value is the dominant figure — KaTeX_Main, --fw-bold, tabular numerals
//   - Eyebrow above (gold) per SNH eyebrow rule
//   - Caption below (slate) — supporting detail
//   - Delta uses semantic colour only if it represents a risk-state change

import EyebrowLabel from './EyebrowLabel'

export default function StatTile({
  eyebrow,
  value,
  caption,
  delta,
  emphasised = false,
}) {
  return (
    <div>
      {eyebrow && <EyebrowLabel style={{ marginBottom: '8px' }}>{eyebrow}</EyebrowLabel>}
      <div
        className="tabular"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 'var(--fw-bold)',
          fontSize: emphasised ? 'var(--fs-display-2)' : 'var(--fs-h2)',
          color: emphasised ? 'var(--snh-gold)' : 'var(--snh-navy)',
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </div>
      {caption && (
        <div className="caption" style={{ marginTop: '6px', color: 'var(--fg-2)' }}>
          {caption}
        </div>
      )}
      {delta && (
        <div
          className="tabular"
          style={{
            marginTop: '4px',
            fontSize: 'var(--fs-body-sm)',
            fontWeight: 'var(--fw-bold)',
            color: delta.neutral
              ? 'var(--fg-2)'
              : delta.direction === 'up'
                ? 'var(--snh-success)'
                : 'var(--snh-danger)',
          }}
        >
          {delta.value}
        </div>
      )}
    </div>
  )
}
