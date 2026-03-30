// Glossary.jsx
// Plain-English FX glossary. Searchable, grouped by category.
// Terms are defined in frontend/src/utils/constants.js — single source of truth.
// Accessible from Settings sidebar and from every column-header ⓘ tooltip.

import React, { useState, useMemo } from 'react'
import { Search, ChevronDown, ChevronRight, Printer } from 'lucide-react'
import { NAVY, GOLD } from '../brand'
import { GLOSSARY } from '../utils/constants'

// Slugify a term name for use as an anchor ID: "MTM (Mark-to-Market)" → "mtm-mark-to-market"
export function slugify(term) {
  return term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Flatten all glossary terms into a searchable list
function allTerms() {
  return Object.entries(GLOSSARY).flatMap(([category, terms]) =>
    terms.map(t => ({ ...t, category }))
  )
}

function TermCard({ term, plain, why, example, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = slugify(term)

  return (
    <div
      id={id}
      className="border border-gray-200 rounded-xl overflow-hidden mb-2"
      style={{ scrollMarginTop: 80 }}
    >
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="font-semibold text-sm" style={{ color: NAVY }}>{term}</span>
        {open
          ? <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />
          : <ChevronRight size={15} className="text-gray-400 flex-shrink-0" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-gray-100">
          <p className="text-sm text-gray-700 pt-3">{plain}</p>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
              Why it matters
            </span>
            <p className="text-sm text-gray-600 mt-0.5">{why}</p>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Example
            </span>
            <p className="text-sm text-gray-500 mt-0.5 italic">{example}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Glossary() {
  const [query, setQuery] = useState('')

  // When searching, show all matching terms flattened (regardless of category)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null  // null = show grouped view
    return allTerms().filter(t =>
      t.term.toLowerCase().includes(q) ||
      t.plain.toLowerCase().includes(q) ||
      t.why.toLowerCase().includes(q) ||
      t.example.toLowerCase().includes(q)
    )
  }, [query])

  function handlePrint() {
    window.print()
  }

  return (
    <div className="min-h-screen" style={{ background: '#F0F2F7' }}>

      {/* Print-only header — hidden on screen */}
      <div className="hidden print:block mb-6">
        <div style={{ background: NAVY, color: '#C9A86C', padding: '16px 24px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: 4 }}>SUMNOHOW</h1>
          <p style={{ fontSize: 12, color: '#8DA4C4' }}>FX Glossary — Plain-English Reference</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 print:px-0 print:py-0 print:max-w-none">

        {/* Page header */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: NAVY }}>FX Glossary</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Plain-English definitions for every term in the platform.
            </p>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: NAVY }}
            title="Print or save as PDF"
          >
            <Printer size={15} />
            Export PDF
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6 print:hidden">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search terms, definitions…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm
                       focus:outline-none focus:border-blue-300 bg-white"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Search results — flat list */}
        {filtered !== null ? (
          filtered.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-12">
              No terms match "{query}"
            </p>
          ) : (
            <div>
              <p className="text-xs text-gray-400 mb-3">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
              {filtered.map(t => (
                <TermCard key={t.term} {...t} defaultOpen />
              ))}
            </div>
          )
        ) : (
          /* Grouped view */
          Object.entries(GLOSSARY).map(([category, terms]) => (
            <section key={category} className="mb-8 print:mb-6">
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3 pb-1 border-b border-gray-200"
                style={{ color: GOLD }}>
                {category}
              </h2>
              {terms.map(t => <TermCard key={t.term} {...t} />)}
            </section>
          ))
        )}

      </div>

      {/* Print styles — expand all cards, remove chrome */}
      <style>{`
        @media print {
          button, input, .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          body { background: white !important; }
          .border { border: 1px solid #ddd !important; }
        }
      `}</style>

    </div>
  )
}
