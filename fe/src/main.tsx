import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import App from './App'
import './style.css'
import './dashboard.css'

const container = document.getElementById('root')
if (!container) throw new Error('Missing root element')
createRoot(container).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>)
