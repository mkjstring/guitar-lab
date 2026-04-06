import { CircleOfFifths } from './components/CircleOfFifths'
import './GuitarTheoryLab.css'

function App() {
  return (
    <div className="lab-page">
      <header className="lab-header">
        <h1>Guitar Theory Lab</h1>
      </header>
      <main className="lab-main">
        <CircleOfFifths />
      </main>
    </div>
  )
}

export default App
