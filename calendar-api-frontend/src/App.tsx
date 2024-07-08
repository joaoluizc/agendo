import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
// import { useState } from 'react'
import Login from './pages/Login/Login';
import Signup from './pages/Signup/Signup';
import Home from './pages/Home/Home';
import NotFound from './NotFound';
import ProtectedRoute from './routes/ProtectedRoute';
import Header from './components/Header/Header';
import Settings from './pages/Settings/Settings';
import './App.css'
import { ThemeProvider } from "@/components/providers/theme-provider"
import Calendar from './pages/Calendar/Calendar';

function App() {
  // const [currentScreen, setCurrentScreen] = useState('login');
  
  return (
    <Router>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <div className="flex min-h-screen w-full flex-col font-sf">
          <Header />
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="" element={<ProtectedRoute />}>
              <Route path="home" element={<Home />} />
              <Route path="settings" element={<Settings />} />
              <Route path="calendars" element={<Calendar />} />
            </Route>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </ThemeProvider>
    </Router>
  )
}

export default App
