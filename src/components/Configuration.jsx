import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../db';
import { SyncStatus } from '../services/sync';
import { runSelfTests } from '../utils/tests';

export default function Configuration() {
  const { settings, updateSetting, syncState, triggerSync, reloadData } = useApp();
  
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // États pour les auto-tests
  const [testResults, setTestResults] = useState([]);
  const [testing, setTesting] = useState(false);

  // Initialiser les formulaires avec les valeurs chargées
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(settings.apps_script_url || '');
    setKey(settings.api_key || 'ETAGIO_SECURE_TOKEN_2026');
    setWhatsapp(settings.whatsapp_boss || '');
  }, [settings]);

  // Compter les tâches de synchro en attente en local
  const checkPendingQueue = async () => {
    try {
      const count = await db.sync_queue.count();
      setPendingSyncCount(count);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkPendingQueue();
    // Re-vérifier régulièrement ou au statut de synchro
    const interval = setInterval(checkPendingQueue, 2000);
    return () => clearInterval(interval);
  }, [syncState]);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await updateSetting('apps_script_url', url);
      await updateSetting('api_key', key);
      await updateSetting('whatsapp_boss', whatsapp);
      alert("Configuration sauvegardée avec succès !");
    } catch (err) {
      alert("Erreur de sauvegarde : " + err.message);
    }
  };

  const handleClearLocalDB = async () => {
    if (window.confirm("ATTENTION : Cela va supprimer tous vos produits locaux, ventes et historiques en local. Les données sur Google Sheets ne seront PAS supprimées. Si vous êtes connecté à internet, l'application retéléchargera tout de suite les données depuis votre Google Sheet. Voulez-vous continuer ?")) {
      try {
        await db.articles.clear();
        await db.sales.clear();
        await db.movements.clear();
        await db.sync_queue.clear();
        
        await db.settings.put({ key: 'last_sync_time', value: '' });

        alert("Base locale réinitialisée ! Tentative de rechargement des données distantes...");
        await reloadData();
        await triggerSync();
      } catch (err) {
        alert("Erreur lors de la réinitialisation : " + err.message);
      }
    }
  };

  const executeSelfTests = async () => {
    setTesting(true);
    const results = await runSelfTests();
    setTestResults(results);
    setTesting(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "Jamais";
    return new Date(dateStr).toLocaleString('fr-FR');
  };

  return (
    <div className="app-content animate-fade-in">
      {/* En-tête */}
      <div>
        <h1 style={{ fontSize: '1.8rem', textAlign: 'left', margin: '10px 0 5px' }}>Configuration</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'left' }}>
          Paramètres de synchronisation et contact de réapprovisionnement.
        </p>
      </div>

      {/* 1. Statut de Synchronisation */}
      <div className="glass-card" style={{ padding: '16px', textAlign: 'left' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>📊 État de la Synchronisation</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Statut Réseau :</span>
            <strong style={{ color: navigator.onLine ? 'var(--stock-ok)' : 'var(--stock-warn)' }}>
              {navigator.onLine ? 'Connecté (En ligne)' : 'Hors ligne'}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Statut de l'API :</span>
            <strong>{syncState.status}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Tâches en attente d'envoi :</span>
            <span className="badge badge-warn" style={{ padding: '2px 8px', fontSize: '0.75rem', fontWeight: 800 }}>
              {pendingSyncCount} opération(s)
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Dernière synchro réussie :</span>
            <strong>{formatDate(settings.last_sync_time)}</strong>
          </div>
        </div>

        <button
          className="btn-modern btn-modern-primary"
          onClick={triggerSync}
          disabled={syncState.status === SyncStatus.SYNCING}
          style={{ width: '100%', marginTop: '16px', padding: '12px' }}
        >
          {syncState.status === SyncStatus.SYNCING ? "Synchronisation en cours..." : "Forcer la Synchronisation"}
        </button>
      </div>

      {/* 2. Paramètres Formulaire */}
      <div className="glass-card" style={{ padding: '16px' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '14px', textAlign: 'left' }}>⚙️ Paramètres de l'application</h3>
        
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group-modern">
            <label>NUMÉRO WHATSAPP DE LA PATRONNE</label>
            <input
              type="tel"
              className="input-modern"
              placeholder="Ex: +33612345678"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              title="Numéro de téléphone complet avec indicatif pays"
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Entrez le numéro au format international sans espaces (ex : +33612345678).
            </span>
          </div>

          <div className="form-group-modern">
            <label>URL DE LA WEB APP GOOGLE APPS SCRIPT</label>
            <input
              type="url"
              className="input-modern"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          <div className="form-group-modern">
            <label>CLÉ API DE SÉCURITÉ</label>
            <input
              type="text"
              className="input-modern"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-modern btn-modern-primary"
            style={{ width: '100%', padding: '12px' }}
          >
            Enregistrer la configuration
          </button>
        </form>
      </div>

      {/* 3. Auto-tests de diagnostic */}
      <div className="glass-card" style={{ padding: '16px', textAlign: 'left' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>🧪 Tests de Diagnostic Intégrés</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
          Vérifie les règles de calcul de marge, le blocage des stocks à 0 et la validité du format de message WhatsApp.
        </p>

        {testResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px', background: 'var(--bg-app)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            {testResults.map((t, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{t.name}</span>
                <span className={`badge ${t.status === 'PASS' ? 'badge-ok' : 'badge-danger'}`} style={{ padding: '2px 8px', fontSize: '0.65rem' }}>
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          className="btn-modern btn-modern-secondary"
          onClick={executeSelfTests}
          disabled={testing}
          style={{ width: '100%', padding: '10px' }}
        >
          {testing ? "Exécution..." : "Lancer les tests de diagnostic"}
        </button>
      </div>

      {/* 4. Maintenance de la Base Locale */}
      <div className="glass-card" style={{ padding: '16px', borderColor: 'var(--stock-danger)' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--stock-danger)', textAlign: 'left' }}>⚠️ Maintenance</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px', textAlign: 'left' }}>
          Réinitialise l'état de l'application en cas de problème de synchronisation persistant. 
          Cette action recharge la base locale depuis les feuilles Google Sheets en ligne.
        </p>

        <button
          className="btn-modern btn-modern-danger"
          onClick={handleClearLocalDB}
          style={{ width: '100%', padding: '12px', fontWeight: 'bold' }}
        >
          Réinitialiser la base locale
        </button>
      </div>
    </div>
  );
}
