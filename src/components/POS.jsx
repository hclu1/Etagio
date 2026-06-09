import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Icons } from './Icons';
import { Html5Qrcode } from 'html5-qrcode';

export default function POS() {
  const { articles, recordSale, settings, sales, updateSetting } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // États pour les rapports et contrôle de caisse
  const [showReports, setShowReports] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState('stats');
  const [salesPeriod, setSalesPeriod] = useState('day');
  const [startingCashInput, setStartingCashInput] = useState('');
  const [actualCashInput, setActualCashInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('espèces');

  // Synchroniser le fond de caisse initialisé depuis les paramètres
  useEffect(() => {
    if (settings.fond_de_caisse !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStartingCashInput(settings.fond_de_caisse.toString());
    }
  }, [settings.fond_de_caisse]);

  const qrCodeInstance = useRef(null);

  // Recherche d'articles
  useEffect(() => {
    if (!searchQuery.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([]);
      return;
    }
    const query = searchQuery.toLowerCase();
    const filtered = articles.filter(
      a =>
        a.name.toLowerCase().includes(query) ||
        a.category.toLowerCase().includes(query) ||
        a.shelf_location.toLowerCase().includes(query) ||
        (a.barcode && a.barcode.includes(query))
    );
    setSearchResults(filtered);
  }, [searchQuery, articles]);

  // Ajouter un article au panier
  const addToCart = (article) => {
    setCart((prevCart) => {
      const existing = prevCart.find(item => item.articleId === article.id);
      if (existing) {
        // La quantité max autorisée dans le panier dépend du stock disponible
        // Mais la vente normale est bloquée uniquement si le stock actuel est 0
        return prevCart.map(item =>
          item.articleId === article.id
            ? { ...item, quantity: Math.min(item.quantity + 1, item.stock) }
            : item
        );
      } else {
        return [
          ...prevCart,
          {
            articleId: article.id,
            name: article.name,
            quantity: 1,
            selectedPrice: article.sale_price,
            stock: article.quantity,
            purchasePrice: article.purchase_price,
            shelfLocation: article.shelf_location,
            alertThreshold: article.alert_threshold
          }
        ];
      }
    });
    setSearchQuery('');
  };

  const handleBarcodeScanned = (barcode) => {
    const found = articles.find(a => a.barcode === barcode);
    if (found) {
      addToCart(found);
      setSuccessMessage(`Scanné : ${found.name}`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } else {
      setErrorMessage(`Code-barres inconnu : ${barcode}. Vous pouvez le copier ou créer l'article.`);
      setSearchQuery(barcode); // Préremplit la recherche avec le code
    }
  };

  const stopScanning = async () => {
    if (qrCodeInstance.current && qrCodeInstance.current.isScanning) {
      try {
        await qrCodeInstance.current.stop();
      } catch (err) {
        console.error("Erreur arrêt scanner :", err);
      }
      qrCodeInstance.current = null;
    }
  };

  const startScanning = async () => {
    try {
      setErrorMessage('');
      const html5QrCode = new Html5Qrcode("reader");
      qrCodeInstance.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (width, height) => {
            const min = Math.min(width, height);
            const size = Math.floor(min * 0.7);
            return { width: size, height: size };
          }
        },
        (decodedText) => {
          // Succès du scan
          handleBarcodeScanned(decodedText);
          stopScanning();
          setShowScanner(false);
        },
        () => {
          // Erreurs de lecture silencieuses
        }
      );
    } catch (err) {
      console.error("Erreur scanner caméra :", err);
      setErrorMessage("Impossible d'accéder à la caméra. Vérifiez les permissions.");
      setShowScanner(false);
    }
  };

  // Gérer le démarrage/arrêt du scanner de code-barres
  useEffect(() => {
    if (showScanner) {
      // Attendre un court instant que le div #reader soit monté
      setTimeout(() => {
        startScanning();
      }, 300);
    } else {
      stopScanning();
    }
    return () => stopScanning();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showScanner]);

  // Mettre à jour la quantité dans le panier
  const updateCartQty = (articleId, qty) => {
    if (qty <= 0) {
      removeFromCart(articleId);
      return;
    }
    setCart(prevCart =>
      prevCart.map(item =>
        item.articleId === articleId
          ? { ...item, quantity: Math.min(Number(qty), item.stock) }
          : item
      )
    );
  };

  // Mettre à jour le prix de vente dans le panier
  const updateCartPrice = (articleId, price) => {
    setCart(prevCart =>
      prevCart.map(item =>
        item.articleId === articleId ? { ...item, selectedPrice: Number(price) } : item
      )
    );
  };

  const removeFromCart = (articleId) => {
    setCart(prevCart => prevCart.filter(item => item.articleId !== articleId));
  };

  // Envoyer un message WhatsApp de réapprovisionnement
  const sendWhatsAppReplenish = (item) => {
    const bossNumber = settings.whatsapp_boss || '';
    if (!bossNumber) {
      alert("Le numéro WhatsApp de la patronne n'est pas configuré. Veuillez aller dans les Paramètres.");
      return;
    }

    // Message dynamique
    const message = `Bonjour, le produit ${item.name} est en rupture ou presque en rupture. Emplacement : ${item.shelfLocation}. Stock actuel : ${item.stock}. Seuil : ${item.alertThreshold}. Merci de prévoir un réapprovisionnement pour la boutique.`;
    
    // Encoder le message pour l'URL
    const encodedText = encodeURIComponent(message);
    const cleanedPhone = bossNumber.replace(/\D/g, ''); // Enlever les caractères non numériques
    const whatsappUrl = `https://wa.me/${cleanedPhone}?text=${encodedText}`;
    
    window.open(whatsappUrl, '_blank');
  };

  // Helper functions for date filtering (sales stats)
  const getStartOfDay = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getStartOfWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const getStartOfMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  };

  const getPeriodSales = (period) => {
    let limitDate;
    if (period === 'day') {
      limitDate = getStartOfDay();
    } else if (period === 'week') {
      limitDate = getStartOfWeek();
    } else {
      limitDate = getStartOfMonth();
    }
    return (sales || []).filter(s => new Date(s.date) >= limitDate);
  };

  // Stats calculation
  const periodSales = getPeriodSales(salesPeriod);
  const periodRevenue = periodSales.reduce((acc, s) => acc + s.total_amount, 0);
  const periodMargin = periodSales.reduce((acc, s) => acc + s.total_margin, 0);
  const periodCount = periodSales.length;

  // Cash reconciliation calculation
  const todaySales = getPeriodSales('day');
  const todayCashSales = todaySales
    .filter(s => s.payment_method === 'espèces')
    .reduce((acc, s) => acc + s.total_amount, 0);

  const startingCash = Number(settings.fond_de_caisse) || 0;
  const expectedCash = startingCash + todayCashSales;
  const actualCash = actualCashInput !== '' ? Number(actualCashInput) : 0;
  const cashError = actualCashInput !== '' ? actualCash - expectedCash : null;

  const handleSaveStartingCash = async (val) => {
    await updateSetting('fond_de_caisse', Number(val) || 0);
  };

  // Valider la vente
  const handleCheckout = async () => {
    try {
      setErrorMessage('');
      // Vérifier si des articles ont un stock à 0
      const hasBlockedItem = cart.some(item => item.stock === 0);
      if (hasBlockedItem) {
        setErrorMessage("Vente bloquée : Votre panier contient un ou plusieurs articles en rupture de stock.");
        return;
      }

      await recordSale(cart.map(item => ({
        articleId: item.articleId,
        quantity: item.quantity,
        selectedPrice: item.selectedPrice
      })), paymentMethod);

      setSuccessMessage("Vente enregistrée avec succès !");
      setCart([]);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.message || "Erreur lors de la validation de la vente.");
    }
  };

  const cartTotal = cart.reduce((acc, item) => acc + (item.selectedPrice * item.quantity), 0);
  const cartMargin = cart.reduce((acc, item) => acc + ((item.selectedPrice - item.purchasePrice) * item.quantity), 0);

  // Vérifier si le panier est valide pour encaissement
  // (Pas vide et aucun élément avec stock = 0)
  const isCartValid = cart.length > 0 && !cart.some(item => item.stock === 0);

  const formatPrice = (price) => {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
  };

  return (
    <div className="app-content animate-fade-in">
      <div>
        <h1 style={{ fontSize: '1.8rem', textAlign: 'left', margin: '10px 0 5px' }}>Caisse</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'left' }}>
          Enregistrer des ventes et précommander les ruptures.
        </p>
      </div>

      {/* 1. Panel Rapports & Contrôle de Caisse (Collapsible) */}
      <div className="glass-card animate-fade-in" style={{ padding: '14px', marginBottom: '4px' }}>
        <button
          onClick={() => setShowReports(!showReports)}
          className="btn-modern"
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            fontSize: '0.9rem',
            fontWeight: 700,
            border: 'none',
            background: 'var(--primary-light)',
            color: 'var(--primary-dark)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📊</span> Rapports & Contrôle de Caisse
          </span>
          <span>{showReports ? '▲' : '▼'}</span>
        </button>

        {showReports && (
          <div className="animate-fade-in" style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Tabs Selector */}
            <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)' }}>
              <button
                onClick={() => setActiveReportTab('stats')}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeReportTab === 'stats' ? '3px solid var(--primary)' : '3px solid transparent',
                  color: activeReportTab === 'stats' ? 'var(--primary-dark)' : 'var(--text-muted)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Suivi des Ventes
              </button>
              <button
                onClick={() => setActiveReportTab('cash')}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeReportTab === 'cash' ? '3px solid var(--primary)' : '3px solid transparent',
                  color: activeReportTab === 'cash' ? 'var(--primary-dark)' : 'var(--text-muted)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Fond de Caisse
              </button>
            </div>

            {/* TAB: STATS */}
            {activeReportTab === 'stats' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }} className="animate-fade-in">
                {/* Period Buttons */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['day', 'week', 'month'].map(p => (
                    <button
                      key={p}
                      onClick={() => setSalesPeriod(p)}
                      className="btn-modern"
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        backgroundColor: salesPeriod === p ? 'var(--primary)' : 'var(--bg-app)',
                        color: salesPeriod === p ? 'white' : 'var(--text-main)',
                        border: salesPeriod === p ? 'none' : '1px solid var(--border-color)',
                        borderRadius: '20px',
                        cursor: 'pointer'
                      }}
                    >
                      {p === 'day' ? 'Vente Jour' : p === 'week' ? 'Vente Semaine' : 'Vente Mois'}
                    </button>
                  ))}
                </div>

                {/* Metrics display */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '4px' }}>
                  <div style={{ background: 'var(--bg-app)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>CA</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--primary-dark)', marginTop: '2px' }}>{formatPrice(periodRevenue)}</div>
                  </div>
                  <div style={{ background: 'var(--bg-app)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Marge</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--stock-ok)', marginTop: '2px' }}>{formatPrice(periodMargin)}</div>
                  </div>
                  <div style={{ background: 'var(--bg-app)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Transac.</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-heading)', marginTop: '2px' }}>{periodCount}</div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: CASH CONTROL */}
            {activeReportTab === 'cash' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }} className="animate-fade-in">
                <div className="grid-2" style={{ gap: '10px' }}>
                  <div className="form-group-modern" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>FOND DE CAISSE (FCFA)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input-modern"
                      value={startingCashInput}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setStartingCashInput(val);
                        await handleSaveStartingCash(val);
                      }}
                      style={{ padding: '8px 10px', fontSize: '0.85rem', height: '36px' }}
                    />
                  </div>
                  <div className="form-group-modern" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>ESPÈCES RÉELLES (FCFA)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input-modern"
                      value={actualCashInput}
                      onChange={(e) => setActualCashInput(e.target.value)}
                      placeholder="Ex: 185.50"
                      style={{ padding: '8px 10px', fontSize: '0.85rem', height: '36px' }}
                    />
                  </div>
                </div>

                <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Fond de caisse :</span>
                    <strong>{formatPrice(startingCash)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Ventes espèces du jour :</span>
                    <strong>+ {formatPrice(todayCashSales)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-color)', paddingTop: '6px', marginTop: '2px' }}>
                    <span>Total attendu en caisse :</span>
                    <strong style={{ color: 'var(--primary-dark)' }}>{formatPrice(expectedCash)}</strong>
                  </div>
                </div>

                {/* Écart de Caisse Display */}
                {actualCashInput !== '' && (
                  <div
                    style={{
                      background: cashError === 0 ? 'var(--stock-ok-bg)' : cashError > 0 ? 'var(--stock-warn-bg)' : 'var(--stock-danger-bg)',
                      border: `1px solid ${cashError === 0 ? 'var(--stock-ok)' : cashError > 0 ? 'var(--stock-warn)' : 'var(--stock-danger)'}`,
                      borderRadius: '8px',
                      padding: '10px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: cashError === 0 ? 'var(--stock-ok)' : cashError > 0 ? 'var(--stock-warn)' : 'var(--stock-danger)'
                    }}
                  >
                    <span>
                      {cashError === 0
                        ? '✔️ Caisse équilibrée'
                        : cashError > 0
                        ? '⚠️ Excédent en caisse'
                        : '❌ Écart de caisse (Perte)'}
                    </span>
                    <span>
                      {cashError > 0 ? '+' : ''}
                      {formatPrice(cashError)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="banner banner-error animate-fade-in">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="banner banner-success animate-fade-in">
          {successMessage}
        </div>
      )}

      {/* 1. Recherche et Scanner */}
      <div className="search-section">
        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              className="input-modern"
              placeholder="Rechercher par nom, emplacement, code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '38px' }}
            />
            <Icons.Search style={{ position: 'absolute', left: '12px', top: '13px', width: '18px', height: '18px', color: 'var(--text-muted)' }} />
          </div>
          <button
            className={`btn-modern ${showScanner ? 'btn-modern-danger' : 'btn-modern-secondary'}`}
            onClick={() => setShowScanner(!showScanner)}
            title="Scanner un code-barres"
            style={{ padding: '12px' }}
          >
            <Icons.Scanner style={{ width: '22px', height: '22px' }} />
          </button>
        </div>

        {/* Caméra de scan */}
        {showScanner && (
          <div className="scanner-container animate-fade-in">
            <div className="scanner-header">
              <span>Cadrez le code-barres du produit</span>
              <button onClick={() => setShowScanner(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 'bold' }}>X</button>
            </div>
            <div id="reader" style={{ width: '100%', overflow: 'hidden', borderRadius: '0 0 10px 10px' }}></div>
          </div>
        )}

        {/* Résultats de recherche */}
        {searchResults.length > 0 && (
          <div className="search-results glass-card animate-fade-in">
            {searchResults.map(article => {
              const isOutOfStock = article.quantity === 0;
              const isLowStock = article.quantity > 0 && article.quantity <= article.alert_threshold;

              return (
                <div
                  key={article.id}
                  className="search-item"
                  onClick={() => addToCart(article)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 8px',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{article.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Réf: {article.shelf_location} | Cat: {article.category}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className={`badge ${isOutOfStock ? 'badge-danger' : isLowStock ? 'badge-warn' : 'badge-ok'}`}>
                      Stock: {article.quantity}
                    </span>
                    <span style={{ fontWeight: 800, color: 'var(--primary-dark)', fontSize: '0.95rem' }}>
                      {formatPrice(article.sale_price)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Le Panier de Vente */}
      <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h3 style={{ fontSize: '1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🛒 Panier actuel</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {cart.length} article(s)
          </span>
        </h3>

        {cart.length === 0 ? (
          <div style={{ padding: '40px 0', textAlignment: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Le panier est vide. Recherchez ou scannez un article pour l'ajouter.
          </div>
        ) : (
          <div className="cart-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {cart.map(item => {
              const isBlocked = item.stock === 0;
              const isLowStock = item.stock > 0 && item.stock <= item.alertThreshold;

              return (
                <div
                  key={item.articleId}
                  className={`cart-item-card ${isBlocked ? 'border-danger' : isLowStock ? 'border-warn' : ''}`}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '12px',
                    background: 'var(--bg-app)',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', gap: '8px' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', wordBreak: 'break-word' }}>{item.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Étagère {item.shelfLocation} | Stock dispo : <strong style={{ color: isBlocked ? 'var(--stock-danger)' : 'inherit' }}>{item.stock}</strong>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.articleId)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--stock-danger)', cursor: 'pointer', flexShrink: 0 }}
                    >
                      <Icons.Trash style={{ width: '18px', height: '18px' }} />
                    </button>
                  </div>

                  {/* Gestion de blocage si stock à 0 */}
                  {isBlocked && (
                    <div style={{
                      background: 'var(--stock-danger-bg)',
                      border: '1px solid var(--stock-danger)',
                      borderRadius: '6px',
                      padding: '8px',
                      marginBottom: '10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--stock-danger)', fontWeight: 700 }}>
                        ⚠️ Rupture ! Vente normale bloquée.
                      </span>
                      <button
                        className="btn-modern btn-modern-primary"
                        onClick={() => sendWhatsAppReplenish(item)}
                        style={{ padding: '4px 8px', fontSize: '0.7rem', borderRadius: '4px' }}
                      >
                        <Icons.WhatsApp style={{ width: '12px', height: '12px', marginRight: '4px' }} />
                        Réappro.
                      </button>
                    </div>
                  )}

                  {/* Inputs de Vente */}
                  <div className="cart-item-inputs">
                    {/* Quantité */}
                    <div className="cart-input-group" style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>QUANTITÉ</span>
                      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-card)', width: 'fit-content' }}>
                        <button
                          onClick={() => updateCartQty(item.articleId, item.quantity - 1)}
                          style={{ padding: '6px 10px', border: 'none', background: 'transparent', fontWeight: 'bold', cursor: 'pointer' }}
                          disabled={isBlocked || item.quantity >= item.stock}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateCartQty(item.articleId, e.target.value)}
                          style={{ width: '35px', textAlign: 'center', border: 'none', background: 'transparent', fontWeight: 'bold', fontSize: '0.85rem' }}
                          disabled={isBlocked}
                        />
                        <button
                          onClick={() => updateCartQty(item.articleId, item.quantity + 1)}
                          style={{ padding: '6px 10px', border: 'none', background: 'transparent', fontWeight: 'bold', cursor: 'pointer' }}
                          disabled={isBlocked}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Prix */}
                    <div className="cart-input-group" style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1.2 }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>PRIX DE VENTE (UNITÉ)</span>
                      <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '100%' }}>
                        <input
                          type="number"
                          step="0.01"
                          className="input-modern"
                          value={item.selectedPrice}
                          onChange={(e) => updateCartPrice(item.articleId, e.target.value)}
                          disabled={isBlocked}
                          style={{ padding: '6px 20px 6px 10px', fontSize: '0.85rem', height: '31px', width: '100%' }}
                        />
                        <span style={{ position: 'absolute', right: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>F</span>
                      </div>
                    </div>

                    {/* Total Item */}
                    <div className="cart-input-group cart-input-total" style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end', flex: 0.8 }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>TOTAL</span>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-heading)', height: '31px', display: 'flex', alignItems: 'center' }}>
                        {formatPrice(item.selectedPrice * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Total / Marge Recap */}
            <div style={{ borderTop: '2px solid var(--border-color)', paddingTop: '14px', marginTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                <span>Marge estimée sur panier :</span>
                <span style={{ color: 'var(--stock-ok)', fontWeight: 'bold' }}>{formatPrice(cartMargin)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-heading)' }}>
                <span>Total à encaisser :</span>
                <span style={{ color: 'var(--primary)' }}>{formatPrice(cartTotal)}</span>
              </div>
            </div>

            {/* Mode de Paiement Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left', marginTop: '10px', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>MODE DE PAIEMENT</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('espèces')}
                  className="btn-modern"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    backgroundColor: paymentMethod === 'espèces' ? 'var(--primary-light)' : 'var(--bg-app)',
                    color: paymentMethod === 'espèces' ? 'var(--primary-dark)' : 'var(--text-main)',
                    border: paymentMethod === 'espèces' ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                    borderRadius: '8px'
                  }}
                >
                  💵 Espèces
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('carte')}
                  className="btn-modern"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    backgroundColor: paymentMethod === 'carte' ? 'var(--primary-light)' : 'var(--bg-app)',
                    color: paymentMethod === 'carte' ? 'var(--primary-dark)' : 'var(--text-main)',
                    border: paymentMethod === 'carte' ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                    borderRadius: '8px'
                  }}
                >
                  💳 Carte
                </button>
              </div>
            </div>

            {/* Validation */}
            <button
              className="btn-modern btn-modern-primary"
              disabled={!isCartValid}
              onClick={handleCheckout}
              style={{ width: '100%', padding: '14px', fontSize: '1.05rem', marginTop: '10px' }}
            >
              Enregistrer la vente ({formatPrice(cartTotal)})
            </button>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .search-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .search-results {
          max-height: 250px;
          overflow-y: auto;
          text-align: left;
          padding: 8px;
          margin-top: 4px;
        }
        .scanner-container {
          background: #111827;
          border-radius: 10px;
          border: 1px solid #374151;
          overflow: hidden;
        }
        .scanner-header {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          background: #1f2937;
          color: white;
          font-size: 0.8rem;
        }
        .cart-item-card.border-danger {
          border-left: 5px solid var(--stock-danger) !important;
        }
        .cart-item-card.border-warn {
          border-left: 5px solid var(--stock-warn) !important;
        }
        .banner {
          padding: 12px;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 600;
          text-align: left;
        }
        .banner-error {
          background-color: var(--stock-danger-bg);
          color: var(--stock-danger);
          border: 1px solid var(--stock-danger);
        }
        .banner-success {
          background-color: var(--stock-ok-bg);
          color: var(--stock-ok);
          border: 1px solid var(--stock-ok);
        }
      `}} />
    </div>
  );
}
