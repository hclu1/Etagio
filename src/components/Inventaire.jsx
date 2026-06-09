import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export default function Inventaire() {
  const { articles, correctStock } = useApp();
  const [subTab, setSubTab] = useState('quick'); // 'quick' | 'full'

  // --- ÉTATS INVENTAIRE RAPIDE ---
  const [selectedShelf, setSelectedShelf] = useState('');
  const [quickCounts, setQuickCounts] = useState({}); // { [articleId]: quantity }
  const [saveStatus, setSaveStatus] = useState({}); // { [articleId]: 'idle' | 'saving' | 'saved' }

  // Extraire les étagères uniques existantes
  const shelves = Array.from(new Set(articles.map(a => a.shelf_location))).filter(Boolean).sort();

  // Filtrer les articles de l'étagère sélectionnée
  const shelfArticles = articles.filter(a => a.shelf_location === selectedShelf);

  // Initialiser les valeurs du formulaire rapide au changement d'étagère
  useEffect(() => {
    const counts = {};
    articles
      .filter(a => a.shelf_location === selectedShelf)
      .forEach(a => {
        counts[a.id] = a.quantity;
      });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuickCounts(counts);
  }, [selectedShelf, articles]);

  const handleQuickCountChange = (articleId, value) => {
    const val = Math.max(0, Number(value));
    setQuickCounts(prev => ({ ...prev, [articleId]: val }));
  };

  const handleSaveQuickCorrection = async (articleId) => {
    try {
      setSaveStatus(prev => ({ ...prev, [articleId]: 'saving' }));
      const newQty = quickCounts[articleId];
      await correctStock(articleId, newQty, `Inventaire rapide étagère ${selectedShelf}`);
      
      setSaveStatus(prev => ({ ...prev, [articleId]: 'saved' }));
      setTimeout(() => {
        setSaveStatus(prev => ({ ...prev, [articleId]: 'idle' }));
      }, 2000);
    } catch (err) {
      alert("Erreur lors de la mise à jour : " + err.message);
      setSaveStatus(prev => ({ ...prev, [articleId]: 'idle' }));
    }
  };

  // --- ÉTATS INVENTAIRE COMPLET ---
  const [fullAuditSearch, setFullAuditSearch] = useState('');
  const [verifiedArticles, setVerifiedArticles] = useState(
    JSON.parse(localStorage.getItem('etagio_verified_audit')) || {}
  );
  const [auditCounts, setAuditCounts] = useState({});

  // Sauvegarder la liste des articles vérifiés localement
  useEffect(() => {
    localStorage.setItem('etagio_verified_audit', JSON.stringify(verifiedArticles));
  }, [verifiedArticles]);

  const toggleVerify = (articleId) => {
    setVerifiedArticles(prev => ({
      ...prev,
      [articleId]: !prev[articleId]
    }));
  };

  const handleAuditCountChange = (articleId, val) => {
    setAuditCounts(prev => ({ ...prev, [articleId]: Math.max(0, Number(val)) }));
  };

  const handleSaveAuditCorrection = async (articleId) => {
    try {
      const newQty = auditCounts[articleId];
      if (newQty === undefined) return;
      await correctStock(articleId, newQty, "Inventaire complet guidé");
      alert("Quantité corrigée avec succès !");
    } catch (err) {
      alert("Erreur : " + err.message);
    }
  };

  const resetAuditSession = () => {
    if (window.confirm("Voulez-vous réinitialiser la session d'audit ? Tous les produits cochés comme vérifiés repasseront à non vérifiés.")) {
      setVerifiedArticles({});
      setAuditCounts({});
    }
  };

  // Calcul du taux de complétion de l'audit complet
  const verifiedCount = Object.values(verifiedArticles).filter(Boolean).length;
  const auditPercent = articles.length > 0 ? Math.round((verifiedCount / articles.length) * 100) : 0;

  // Filtrer les articles pour l'audit complet
  const auditedArticlesFiltered = articles.filter(a => 
    a.name.toLowerCase().includes(fullAuditSearch.toLowerCase()) ||
    a.shelf_location.toLowerCase().includes(fullAuditSearch.toLowerCase()) ||
    a.category.toLowerCase().includes(fullAuditSearch.toLowerCase())
  );

  return (
    <div className="app-content animate-fade-in">
      {/* En-tête de section */}
      <div>
        <h1 style={{ fontSize: '1.8rem', textAlign: 'left', margin: '10px 0 5px' }}>Inventaire</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'left' }}>
          Corriger les quantités observées en rayon et auditer la boutique.
        </p>
      </div>

      {/* Sous-onglets */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)', marginBottom: '10px' }}>
        <button
          onClick={() => setSubTab('quick')}
          style={{
            flex: 1,
            padding: '12px',
            background: 'transparent',
            border: 'none',
            borderBottom: subTab === 'quick' ? '3px solid var(--primary)' : '3px solid transparent',
            color: subTab === 'quick' ? 'var(--primary-dark)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer'
          }}
        >
          Inventaire Rapide
        </button>
        <button
          onClick={() => setSubTab('full')}
          style={{
            flex: 1,
            padding: '12px',
            background: 'transparent',
            border: 'none',
            borderBottom: subTab === 'full' ? '3px solid var(--primary)' : '3px solid transparent',
            color: subTab === 'full' ? 'var(--primary-dark)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer'
          }}
        >
          Inventaire Complet
        </button>
      </div>

      {/* --- MODE INVENTAIRE RAPIDE --- */}
      {subTab === 'quick' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="animate-fade-in">
          {/* Sélection de l'étagère */}
          <div className="glass-card" style={{ padding: '16px', textAlign: 'left' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-heading)', display: 'block', marginBottom: '8px' }}>
              SÉLECTIONNEZ L'ÉTAGÈRE À AUDITER
            </label>
            <select
              className="input-modern"
              value={selectedShelf}
              onChange={(e) => setSelectedShelf(e.target.value)}
              style={{ fontSize: '1rem', fontWeight: 'bold' }}
            >
              <option value="">-- Choisir une étagère --</option>
              {shelves.map(s => <option key={s} value={s}>Étagère {s}</option>)}
            </select>
          </div>

          {/* Liste des articles dans l'étagère */}
          {selectedShelf && (
            <div className="glass-card" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Articles étagère {selectedShelf}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {shelfArticles.length} produit(s)
                </span>
              </h3>

              {shelfArticles.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', padding: '20px 0', fontSize: '0.85rem' }}>
                  Aucun produit enregistré sur l'étagère {selectedShelf}.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {shelfArticles.map(article => {
                    const currentVal = quickCounts[article.id] !== undefined ? quickCounts[article.id] : article.quantity;
                    const isSaving = saveStatus[article.id] === 'saving';
                    const isSaved = saveStatus[article.id] === 'saved';
                    const hasChanged = currentVal !== article.quantity;

                    return (
                  <div
                    key={article.id}
                    className="inventaire-item"
                  >
                    <div style={{ flex: 1, textAlign: 'left', paddingRight: '10px', minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', wordBreak: 'break-word' }}>{article.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Stock actuel : <strong style={{ color: article.quantity === 0 ? 'var(--stock-danger)' : 'inherit' }}>{article.quantity}</strong>
                      </div>
                    </div>

                    {/* Contrôles de correction */}
                    <div className="inventaire-controls">
                          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '6px', height: '34px', background: 'var(--bg-app)' }}>
                            <button
                              onClick={() => handleQuickCountChange(article.id, currentVal - 1)}
                              style={{ padding: '0 8px', border: 'none', background: 'transparent', fontWeight: 'bold', cursor: 'pointer', height: '100%' }}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              value={currentVal}
                              onChange={(e) => handleQuickCountChange(article.id, e.target.value)}
                              style={{ width: '32px', textAlign: 'center', border: 'none', background: 'transparent', fontWeight: 'bold', fontSize: '0.85rem', height: '100%' }}
                            />
                            <button
                              onClick={() => handleQuickCountChange(article.id, currentVal + 1)}
                              style={{ padding: '0 8px', border: 'none', background: 'transparent', fontWeight: 'bold', cursor: 'pointer', height: '100%' }}
                            >
                              +
                            </button>
                          </div>

                          {/* Action de sauvegarde */}
                          <button
                            className={`btn-modern ${isSaved ? 'btn-modern-primary' : hasChanged ? 'btn-modern-primary' : 'btn-modern-secondary'}`}
                            onClick={() => handleSaveQuickCorrection(article.id)}
                            disabled={!hasChanged || isSaving}
                            style={{
                              padding: '0 12px',
                              height: '34px',
                              fontSize: '0.75rem',
                              backgroundColor: isSaved ? 'var(--stock-ok)' : undefined,
                              color: isSaved ? 'white' : undefined
                            }}
                          >
                            {isSaving ? '...' : isSaved ? '✓ OK' : 'Corriger'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- MODE INVENTAIRE COMPLET --- */}
      {subTab === 'full' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="animate-fade-in">
          {/* Barre de progression audit */}
          <div className="glass-card" style={{ padding: '16px', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '6px' }}>
              <span>Progression de l'audit</span>
              <span style={{ color: 'var(--primary)' }}>
                {verifiedCount} / {articles.length} vérifiés ({auditPercent}%)
              </span>
            </div>
            <div style={{ width: '100%', height: '10px', background: 'var(--border-color)', borderRadius: '5px', overflow: 'hidden', marginBottom: '12px' }}>
              <div style={{ width: `${auditPercent}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--accent))', transition: 'width 0.3s' }}></div>
            </div>
            <button
              className="btn-modern btn-modern-secondary"
              onClick={resetAuditSession}
              style={{ fontSize: '0.75rem', padding: '6px 12px' }}
            >
              Réinitialiser l'audit
            </button>
          </div>

          {/* Recherche audit */}
          <input
            type="text"
            className="input-modern"
            placeholder="Rechercher par nom, étagère ou catégorie..."
            value={fullAuditSearch}
            onChange={(e) => setFullAuditSearch(e.target.value)}
          />

          {/* Liste checklist */}
          <div className="glass-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {auditedArticlesFiltered.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', padding: '20px 0', fontSize: '0.85rem' }}>
                  Aucun article trouvé.
                </p>
              ) : (
                auditedArticlesFiltered.map(article => {
                  const isVerified = !!verifiedArticles[article.id];
                  const tempVal = auditCounts[article.id] !== undefined ? auditCounts[article.id] : article.quantity;
                  const hasCorrection = tempVal !== article.quantity;

                  return (
                    <div
                      key={article.id}
                      className="inventaire-item"
                      style={{
                        opacity: isVerified ? 0.65 : 1,
                        transition: 'opacity 0.2s'
                      }}
                    >
                      {/* Checkbox Vérifié */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1, textAlign: 'left', paddingRight: '8px', minWidth: 0 }}>
                        <input
                          type="checkbox"
                          checked={isVerified}
                          onChange={() => toggleVerify(article.id)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', textDecoration: isVerified ? 'line-through' : 'none', wordBreak: 'break-word' }}>
                            {article.name}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            Étagère : <strong>{article.shelf_location}</strong> | Stock : {article.quantity}
                          </div>
                        </div>
                      </label>

                      {/* Entrée de correction rapide si besoin */}
                      <div className="inventaire-controls" style={{ gap: '6px' }}>
                        <input
                          type="number"
                          value={tempVal}
                          onChange={(e) => handleAuditCountChange(article.id, e.target.value)}
                          style={{
                            width: '45px',
                            padding: '4px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            textAlign: 'center',
                            backgroundColor: 'var(--bg-app)'
                          }}
                        />
                        {hasCorrection && (
                          <button
                            onClick={() => handleSaveAuditCorrection(article.id)}
                            style={{
                              backgroundColor: 'var(--primary)',
                              color: 'white',
                              border: 'none',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 'bold',
                              cursor: 'pointer'
                            }}
                          >
                            ✓
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
