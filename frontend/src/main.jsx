import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

function App() {
  return (
    <div style={{padding: '20px'}}>
      <h1>TEST - React is Working!</h1>
      <p>If you can see this, React is mounting correctly.</p>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)