import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
// import { useState } from 'react'
import Login from './Login';
import Signup from './Signup';
import Home from './Home';
import NotFound from './NotFound';
import ProtectedRoute from './routes/ProtectedRoute';
import Header from './components/widgets/Header';
import './App.css'
import { ThemeProvider } from "@/components/providers/theme-provider"

function App() {
  // const [currentScreen, setCurrentScreen] = useState('login');
  
  return (
    <Router>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
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
      </ThemeProvider>
    </Router>
  )
}

export default App
