// JumpNav.jsx
// Shared sticky jump-navigation bar used by Reports, Hedging, and other long pages.
//
// Props:
//   sections   — [{ id, label }]  list of sections to navigate
//   active     — string           currently active section id
//   onNavigate — fn(id)           called when a section button is clicked
//   variant    — "pill" | "tab"   pill = rounded badge (Reports), tab = underline (Hedging)

import { NAVY, GOLD } from '../brand'

export default function JumpNav({ sections, active, onNavigate, variant = 'pill' }) {
  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 sticky z-30"
      style={{ top: 73 }}
    >
      <div className={`px-4 flex flex-wrap gap-2 ${variant === 'tab' ? 'gap-1 px-5' : 'py-3'}`}>
        {sections.map(s => {
          const isActive = active === s.id
          if (variant === 'tab') {
            return (
              <button
                key={s.id}
                onClick={() => onNavigate(s.id)}
                className="px-4 py-3.5 text-sm font-semibold transition-all"
                style={{
                  color:        isActive ? GOLD : '#6B7280',
                  borderBottom: isActive ? `2px solid ${GOLD}` : '2px solid transparent',
                  background:   'transparent',
                }}
              >
                {s.label}
              </button>
            )
          }
          return (
            <button
              key={s.id}
              onClick={() => onNavigate(s.id)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all border"
              style={isActive
                ? { background: GOLD,    color: NAVY,      borderColor: GOLD      }
                : { background: 'white', color: '#6B7280', borderColor: '#E5E7EB' }
              }
            >
              {s.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
