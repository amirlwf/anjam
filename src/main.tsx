import { createRoot } from 'react-dom/client'
import App from './App'
import { applyStoredAppearance } from './lib/appearance'
import './styles.css'

applyStoredAppearance()
createRoot(document.getElementById('root')!).render(<App />)
