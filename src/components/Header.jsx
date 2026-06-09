import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Icons } from './Icons';
import { SyncStatus } from '../services/sync';

export default function Header() {
  const { syncState, triggerSync } = useApp();
  const [isDark, setIsDark] = useState(
    localStorage.getItem('theme') === 'dark' || 
    (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );

  // Gérer le thème sombre
  useEffect(() => {
    if (isDark) {
      document.body.classList.add('theme-dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('theme-dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  // Obtenir la classe CSS et le label en fonction du statut de synchro
  const getSyncBadge = () => {
    switch (syncState.status) {
      case SyncStatus.SYNCING:
        return {
          class: 'sync-badge-syncing',
          text: 'Synchro...',
          iconClass: 'sync-icon-spin'
        };
      case SyncStatus.OFFLINE:
        return {
          class: 'sync-badge-offline',
          text: 'Hors ligne',
          iconClass: ''
        };
      case SyncStatus.ERROR:
        return {
          class: 'sync-badge-error',
          text: 'Erreur',
          iconClass: ''
        };
      case SyncStatus.IDLE:
      default:
        return {
          class: 'sync-badge-idle',
          text: 'En ligne',
          iconClass: ''
        };
    }
  };

  const badge = getSyncBadge();

  return (
    <header className="app-header">
      <div className="app-title-container">
        <div className="app-logo">É</div>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <h2>Étagio</h2>
            <span style={{ fontSize: '0.6rem', color: 'var(--primary)', fontWeight: 700, letterSpacing: '0.03em' }}>v1.7</span>
          </div>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginTop: '-2px' }}>
            Gestion de Stock
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Badge Synchronisation */}
        <button 
          onClick={triggerSync}
          disabled={syncState.status === SyncStatus.SYNCING}
          className={`sync-badge ${badge.class}`}
          title={syncState.details || "Forcer la synchronisation"}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: 'var(--border-color)',
            color: 'var(--text-main)'
          }}
        >
          <Icons.Sync 
            className={badge.iconClass}
            style={{ 
              width: '12px', 
              height: '12px', 
              strokeWidth: 3,
              animation: badge.iconClass ? 'spin 1.5s linear infinite' : 'none'
            }} 
          />
          {badge.text}
        </button>

        {/* Bouton Dark Mode */}
        <button
          onClick={toggleTheme}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-main)',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s'
          }}
          title="Changer de thème"
        >
          {isDark ? (
            // Icone Soleil
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          ) : (
            // Icone Lune
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
        </button>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .sync-badge-syncing {
          background-color: var(--primary-glow) !important;
          color: var(--primary) !important;
        }
        .sync-badge-offline {
          background-color: var(--stock-warn-bg) !important;
          color: var(--stock-warn) !important;
        }
        .sync-badge-error {
          background-color: var(--stock-danger-bg) !important;
          color: var(--stock-danger) !important;
        }
        .sync-badge-idle {
          background-color: var(--stock-ok-bg) !important;
          color: var(--stock-ok) !important;
        }
      `}} />
    </header>
  );
}
