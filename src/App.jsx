import { useState, useEffect } from 'react';
import { useApp } from './context/AppContext';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import POS from './components/POS';
import Catalogue from './components/Catalogue';
import Inventaire from './components/Inventaire';
import Configuration from './components/Configuration';
import { Icons } from './components/Icons';

function App() {
  const { settings, loading } = useApp();
  const [activeTab, setActiveTab] = useState('dashboard');

  // Si l'application n'est pas encore configurée (pas d'URL de synchronisation),
  // on redirige automatiquement l'utilisateur vers l'écran de configuration au démarrage.
  useEffect(() => {
    if (!loading && !settings.apps_script_url) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab('config');
    }
  }, [loading, settings.apps_script_url]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: '12px',
        color: 'var(--text-main)',
        backgroundColor: 'var(--bg-app)'
      }}>
        <div className="spinner" style={{
          width: '40px',
          height: '40px',
          border: '4px solid var(--border-color)',
          borderTopColor: 'var(--primary)',
          borderRadius: '50%',
          animation: 'spin-loader 1s linear infinite'
        }}></div>
        <strong style={{ fontSize: '0.95rem' }}>Chargement d'Étagio...</strong>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin-loader {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}} />
      </div>
    );
  }

  // Rendu de la vue active
  const renderContent = () => {
    switch (activeTab) {
      case 'pos':
        return <POS />;
      case 'catalogue':
        return <Catalogue />;
      case 'inventaire':
        return <Inventaire />;
      case 'config':
        return <Configuration />;
      case 'dashboard':
      default:
        return <Dashboard />;
    }
  };

  return (
    <>
      {/* 1. En-tête */}
      <Header />

      {/* Message d'avertissement de configuration si URL manquante */}
      {!settings.apps_script_url && activeTab !== 'config' && (
        <div style={{
          background: 'var(--stock-warn-bg)',
          color: 'var(--stock-warn)',
          padding: '10px 20px',
          fontSize: '0.8rem',
          fontWeight: 700,
          borderBottom: '1px solid var(--stock-warn)',
          textAlign: 'left',
          cursor: 'pointer'
        }} onClick={() => setActiveTab('config')}>
          ⚠️ Configuration Google Sheets manquante. Cliquez ici pour la renseigner.
        </div>
      )}

      {/* 2. Corps de la vue défilable */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {renderContent()}
      </main>

      {/* 3. Barre de navigation basse */}
      <nav className="bottom-nav">
        <button
          className={`bottom-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <Icons.Dashboard />
          Tableau
        </button>

        <button
          className={`bottom-nav-item ${activeTab === 'pos' ? 'active' : ''}`}
          onClick={() => setActiveTab('pos')}
        >
          <Icons.POS />
          Caisse
        </button>

        <button
          className={`bottom-nav-item ${activeTab === 'catalogue' ? 'active' : ''}`}
          onClick={() => setActiveTab('catalogue')}
        >
          <Icons.Catalogue />
          Stock
        </button>

        <button
          className={`bottom-nav-item ${activeTab === 'inventaire' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventaire')}
        >
          <Icons.Inventaire />
          Inventaire
        </button>

        <button
          className={`bottom-nav-item ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          <Icons.Configuration />
          Paramètres
        </button>
      </nav>
    </>
  );
}

export default App;
