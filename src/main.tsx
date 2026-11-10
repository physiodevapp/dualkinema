import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { depurarAlAbrir } from './persistencia/almacen'
import App from './ui/App'
import './styles.css'

depurarAlAbrir()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
