import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
// import { useState } from 'react'
import Login from './Login';
import Signup from './Signup';
import Home from './Home';
import NotFound from './NotFound';
import ProtectedRoute from './routes/ProtectedRoute';
import Header from './components/widgets/Header';
import './App.css'

function App() {
  // const [currentScreen, setCurrentScreen] = useState('login');
  
  return (
    <Router>
      <div className="flex min-h-screen w-full flex-col">
        <Header />
        <Routes>
          <Route path="/" element={<ProtectedRoute />}>
            <Route path="" element={<Home />} />
          </Route>
          <Route path="/login" element={<Login switchToSignup={() => 1+1}/>} />
          <Route path="/signup" element={<Signup switchToLogin={() => 1+1}/>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
