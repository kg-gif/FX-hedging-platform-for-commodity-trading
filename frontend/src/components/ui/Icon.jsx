// Icon.jsx — Lucide wrapper enforcing SNH brand rules
//
// Brand rules (SNH_BRAND_GUIDE.md v1.2 section 4):
//   - 1.5px stroke
//   - 24px box by default (sizes: 16, 20, 24)
//   - square caps, square joins
//   - currentColor — inherits text colour, never coloured for decoration

import * as LucideIcons from 'lucide-react'

function toPascal(name) {
  return name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export default function Icon({ name, size = 24, className = '', ...rest }) {
  const Component = LucideIcons[toPascal(name)]
  if (!Component) {
    console.error(`[SNH Icon] Unknown Lucide icon: "${name}"`)
    return null
  }
  return (
    <Component
      size={size}
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      {...rest}
    />
  )
}
