import { useState } from 'react'
import Login from './Login';
import Signup from './Signup';
import './App.css'

function App() {
  const [currentScreen, setCurrentScreen] = useState('login');
  
  return (
    <div>
      {currentScreen === 'login' ? (
        <Login switchToSignup={() => setCurrentScreen('signup')} />
      ) : (
        <Signup switchToLogin={() => setCurrentScreen('login')} />
      )}
    </div>
  )
}

export default App
