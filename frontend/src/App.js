// src/App.jsx
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';

// Importation du composant Login et pages de récupération de mot de passe
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

// Layout
import Layout from './components/Layout';

// Pages
import Dashboard from './pages/Dashboard';
import Portefeuille from './pages/Portefeuille';
import Calendar from './pages/Calendar';
import Revenues from './pages/Revenues';
import Activities from './pages/Activities';
import Goals from './pages/Goals';
import Reports from './pages/Reports';
import Quotes from './pages/Quotes';
import Invoices from './pages/Invoices';
import Settings from './pages/Settings';
import Maintenance from './pages/Maintenance';

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

// Redirige une ancienne route (/leads, /clients, /projects) vers l'onglet correspondant
// de /portefeuille, en PRÉSERVANT les query params existants (ex. ?id=123, ?filter=new)
// pour que les deep-links et l'ouverture de fiche continuent de fonctionner.
const RedirectToPortefeuille = ({ tab }) => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('tab', tab);
  return <Navigate to={`/portefeuille?${params.toString()}`} replace />;
};

// Redirige /treasury vers l'onglet correspondant du hub Finances (/invoices),
// en préservant les query params éventuels.
const RedirectToInvoicesTab = ({ tab }) => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('tab', tab);
  return <Navigate to={`/invoices?${params.toString()}`} replace />;
};

const App = () => {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <Routes>
            {/* Routes d'authentification non protégées */}
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

          {/* Routes protégées avec Layout */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Portefeuille : hub Prospects / Clients / Projets */}
          <Route path="/portefeuille" element={
            <ProtectedRoute>
              <Layout>
                <Portefeuille />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Anciennes routes conservées : redirigées vers le bon onglet de /portefeuille
              en préservant les query params (deep-links, ouverture de fiche). */}
          <Route path="/leads" element={
            <ProtectedRoute>
              <RedirectToPortefeuille tab="prospects" />
            </ProtectedRoute>
          } />

          <Route path="/clients" element={
            <ProtectedRoute>
              <RedirectToPortefeuille tab="clients" />
            </ProtectedRoute>
          } />

          <Route path="/projects" element={
            <ProtectedRoute>
              <RedirectToPortefeuille tab="projets" />
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

          <Route path="/reports" element={
            <ProtectedRoute>
              <Layout>
                <Reports />
              </Layout>
            </ProtectedRoute>
          } />

          <Route path="/quotes" element={
            <ProtectedRoute>
              <Layout>
                <Quotes />
              </Layout>
            </ProtectedRoute>
          } />

          <Route path="/invoices" element={
            <ProtectedRoute>
              <Layout>
                <Invoices />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Trésorerie : désormais un onglet du hub Finances. Route conservée et
              redirigée vers /invoices?tab=treasury (params préservés). */}
          <Route path="/treasury" element={
            <ProtectedRoute>
              <RedirectToInvoicesTab tab="treasury" />
            </ProtectedRoute>
          } />

          <Route path="/maintenance" element={
            <ProtectedRoute>
              <Layout>
                <Maintenance />
              </Layout>
            </ProtectedRoute>
          } />

          <Route path="/settings" element={
            <ProtectedRoute>
              <Layout>
                <Settings />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Rediriger la racine et toutes les autres routes vers Dashboard ou Login selon l'authentification */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
      </ToastProvider>
    </AuthProvider>
  );
};

export default App;
