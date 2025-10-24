// src/App.jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { initDB } from './database/dbConfig';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Importation du composant Login
import Login from './pages/Login';

// Layout
import Layout from './components/Layout';

// Pages
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Projects from './pages/Projects';
import Calendar from './pages/Calendar';
import Revenues from './pages/Revenues';
import Activities from './pages/Activities';
import Goals from './pages/Goals';

// Composant ProtectedRoute pour protéger les routes
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  
  // Utiliser useEffect pour la redirection
  useEffect(() => {
    // Ne rediriger que lorsque le chargement est terminé et que l'utilisateur n'est pas authentifié
    if (!isLoading && !isAuthenticated) {
      console.log("Utilisateur non authentifié, redirection vers login");
      navigate('/login');
    }
  }, [isLoading, isAuthenticated, navigate]);
  
  // Pendant le chargement, afficher un indicateur
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
        <p className="ml-2 text-white">Vérification de l'authentification...</p>
      </div>
    );
  }
  
  // Si non authentifié, ne rien rendre (la redirection est gérée par useEffect)
  if (!isAuthenticated) {
    return null;
  }
  
  // Si authentifié, afficher le contenu protégé
  return children;
};

const App = () => {
  const [loading, setLoading] = useState(true);

  // Initialisation de la base de données
  useEffect(() => {
    const setupDB = async () => {
      try {
        console.log("Initialisation de la base de données...");
        await initDB();
        console.log("Base de données initialisée avec succès");
      } catch (error) {
        console.error("Erreur lors de l'initialisation de la base de données:", error);
      } finally {
        setLoading(false);
      }
    };
    
    // Ajouter un léger délai pour éviter les problèmes de quota
    const timeoutId = setTimeout(() => {
      setupDB();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, []);

  // Afficher un indicateur de chargement
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
        <p className="ml-2 text-white">Chargement de l'application...</p>
      </div>
    );
  }

  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Route de login non protégée */}
          <Route path="/login" element={<Login />} />
          
          {/* Routes protégées avec Layout */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/leads" element={
            <ProtectedRoute>
              <Layout>
                <Leads />
              </Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/projects" element={
            <ProtectedRoute>
              <Layout>
                <Projects />
              </Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/calendar" element={
            <ProtectedRoute>
              <Layout>
                <Calendar />
              </Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/revenues" element={
            <ProtectedRoute>
              <Layout>
                <Revenues />
              </Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/activities" element={
            <ProtectedRoute>
              <Layout>
                <Activities />
              </Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/goals" element={
            <ProtectedRoute>
              <Layout>
                <Goals />
              </Layout>
            </ProtectedRoute>
          } />
          
          {/* Rediriger la racine et toutes les autres routes vers Dashboard ou Login selon l'authentification */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;