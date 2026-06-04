// Tabs.jsx — primary nav (underline) and sub-filter (pill)
//
// Brand rules:
//   - Sentence case labels
//   - Active = gold accent (underline or muted-gold pill)
//   - Inactive = slate
//   - Counts in tabular numerals, slate when inactive, navy when active
//   - One row only — never wrap.
//
// Variants:
//   - "underline" — for primary navigation. Active tab has a 2px gold underline.
//   - "pill"      — for sub-filters. Rounded pill, gold-muted background when active.

import { useState } from 'react'

export default function Tabs({
  variant = 'underline',
  items,
  active,
  onChange,
}) {
  const [internal, setInternal] = useState(items[0]?.id)
  const activeId = active !== undefined ? active : internal
  const handle = (id) => {
    if (onChange) onChange(id)
    else setInternal(id)
  }

  if (variant === 'pill') {
    return (
      <div role="tablist" style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap', overflow: 'hidden' }}>
        {items.map(it => (
          <PillTab key={it.id} item={it} active={it.id === activeId} onClick={() => handle(it.id)} />
        ))}
      </div>
    )
  }

  return (
    <div role="tablist" style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-1)' }}>
      {items.map(it => (
        <UnderlineTab key={it.id} item={it} active={it.id === activeId} onClick={() => handle(it.id)} />
      ))}
    </div>
  )
}

function UnderlineTab({ item, active, onClick }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        padding: '12px 16px',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--fs-body-sm)',
        fontWeight: active ? 'var(--fw-bold)' : 'var(--fw-regular)',
        color: active ? 'var(--snh-gold)' : 'var(--snh-slate)',
        borderBottom: active ? '2px solid var(--snh-gold)' : '2px solid transparent',
        marginBottom: '-1px',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'color var(--dur-fast) var(--ease-standard)',
      }}
    >
      {item.label}
      {typeof item.count === 'number' && (
        <span
          className="tabular"
          style={{
            fontSize: 'var(--fs-eyebrow)',
            color: active ? 'var(--snh-gold)' : 'var(--snh-slate)',
            fontWeight: 'var(--fw-bold)',
          }}
        >
          {item.count}
        </span>
      )}
    </button>
  )
}

function PillTab({ item, active, onClick }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        background: active ? 'var(--snh-gold-muted)' : 'transparent',
        border: active ? '1px solid var(--snh-gold)' : '1px solid var(--border-1)',
        borderRadius: 'var(--radius-pill)',
        padding: '6px 14px',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--fs-body-sm)',
        fontWeight: active ? 'var(--fw-bold)' : 'var(--fw-regular)',
        color: active ? 'var(--snh-navy)' : 'var(--snh-slate)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
      }}
    >
      {item.label}
      {typeof item.count === 'number' && (
        <span
          className="tabular"
          style={{
            fontSize: 'var(--fs-eyebrow)',
            color: active ? 'var(--snh-navy)' : 'var(--snh-slate)',
            fontWeight: 'var(--fw-bold)',
            background: active ? 'rgba(26, 39, 68, 0.08)' : 'transparent',
            padding: active ? '1px 6px' : '0',
            borderRadius: 'var(--radius-pill)',
          }}
        >
          {item.count}
        </span>
      )}
    </button>
  )
}
