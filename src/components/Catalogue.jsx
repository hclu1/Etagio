import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Icons } from './Icons';
import { Html5Qrcode } from 'html5-qrcode';

export default function Catalogue() {
const { articles, addArticle, updateArticle, deleteArticle, settings, correctStock } = useApp();  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterShelf, setFilterShelf] = useState('');

  // États du formulaire d'édition (Modal)
  const [showModal, setShowModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null); // null pour ajout
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    shelf_location: '',
    quantity: 0,
    purchase_price: 0,
    margin_pct: 20,
    sale_price: 0,
    sale_price_mode: 'auto', // 'auto' | 'manual'
    alert_threshold: 1,
    barcode: '',
    variants_input: ''
  });

  const [formScannerActive, setFormScannerActive] = useState(false);

  // États modal de réapprovisionnement
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [restockArticle, setRestockArticle] = useState(null);
  const [restockQty, setRestockQty] = useState(1);

  // États pour la préparation de commande WhatsApp
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [orderItems, setOrderItems] = useState([]);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [customItemName, setCustomItemName] = useState('');
  const [orderScannerActive, setOrderScannerActive] = useState(false);
  const orderScannerRef = useRef(null);

  // Recherche d'articles pour l'ajout à la commande (dérivé)
  const orderSearchResults = orderSearchQuery.trim()
    ? articles.filter(a => {
        const query = orderSearchQuery.toLowerCase().trim();
        return a.name.toLowerCase().includes(query) ||
               (a.shelf_location && a.shelf_location.toLowerCase().includes(query)) ||
               (a.barcode && String(a.barcode).toLowerCase().trim().includes(query));
      }).slice(0, 5)
    : [];

  // Masquer la barre de navigation basse lorsque l'un des modals est ouvert pour libérer l'espace et éviter les chevauchements
  useEffect(() => {
    if (showModal || showRestockModal) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [showModal, showRestockModal]);

  const openRestock = (article) => {
    setRestockArticle(article);
    setRestockQty(1);
    setShowRestockModal(true);
  };

  const handleRestock = async () => {
    if (!restockArticle || restockQty < 1) return;
    try {
      const newQty = restockArticle.quantity + Number(restockQty);
      await correctStock(restockArticle.id, newQty, `Réapprovisionnement (+${restockQty})`);
      setShowRestockModal(false);
      setRestockArticle(null);
    } catch (err) {
      alert("Erreur : " + err.message);
    }
  };
  const formScannerRef = useRef(null);

  // Extraire les catégories et étagères uniques pour les filtres
  const categories = Array.from(new Set(articles.map(a => a.category))).filter(Boolean).sort();
  const shelves = Array.from(new Set(articles.map(a => a.shelf_location))).filter(Boolean).sort();

  // Filtrer les articles affichés
  const filteredArticles = articles
    .filter(a => {
      const query = search.toLowerCase().trim();
      const matchSearch = a.name.toLowerCase().includes(query) ||
                          (a.barcode && String(a.barcode).toLowerCase().trim().includes(query)) ||
                          a.shelf_location.toLowerCase().includes(query);
      const matchCat = filterCategory ? a.category === filterCategory : true;
      const matchShelf = filterShelf ? a.shelf_location === filterShelf : true;
      return matchSearch && matchCat && matchShelf;
    })
    .sort((a, b) => {
      // Priorité : 0 = rupture (rouge) > 1 = stock faible (orange) > 2 = ok (vert)
      const getPriority = (art) => {
        if (art.quantity === 0) return 0;
        if (art.quantity <= art.alert_threshold) return 1;
        return 2;
      };
      return getPriority(a) - getPriority(b);
    });

  // Gérer le changement du prix d'achat ou de la marge (Recalcul automatique)
  const handlePurchaseOrMarginChange = (purchase, margin, mode) => {
    const p = Number(purchase) || 0;
    const m = Number(margin) || 0;
    
    if (mode === 'auto') {
      const calculatedSale = p * (1 + m / 100);
      return Number(calculatedSale.toFixed(2));
    }
    return formData.sale_price;
  };

  // Gérer le changement du prix de vente (Changement de mode et recalcul inverse de marge)
  const handleSalePriceChange = (sale, purchase) => {
    const s = Number(sale) || 0;
    const p = Number(purchase) || 0;

    if (p > 0) {
      const calculatedMargin = ((s / p) - 1) * 100;
      return {
        margin: Number(calculatedMargin.toFixed(1)),
        mode: 'manual'
      };
    }
    return {
      margin: formData.margin_pct,
      mode: 'manual'
    };
  };

  // Mettre à jour les champs du formulaire
  const handleChange = (e) => {
    const { name, value } = e.target;
    let newFields = { ...formData, [name]: value };

    if (name === 'purchase_price' || name === 'margin_pct') {
      const newSalePrice = handlePurchaseOrMarginChange(
        name === 'purchase_price' ? value : formData.purchase_price,
        name === 'margin_pct' ? value : formData.margin_pct,
        formData.sale_price_mode
      );
      newFields.sale_price = newSalePrice;
    } else if (name === 'sale_price') {
      const calculation = handleSalePriceChange(value, formData.purchase_price);
      newFields.margin_pct = calculation.margin;
      newFields.sale_price_mode = calculation.mode;
    } else if (name === 'sale_price_mode') {
      if (value === 'auto') {
        newFields.sale_price = handlePurchaseOrMarginChange(
          formData.purchase_price,
          formData.margin_pct,
          'auto'
        );
      }
    }

    setFormData(newFields);
  };

  // Ouvrir le modal d'ajout ou édition
  const openForm = (article = null) => {
    if (article) {
      setEditingArticle(article);
      setFormData({
        name: article.name,
        category: article.category || '',
        shelf_location: article.shelf_location || '',
        quantity: article.quantity || 0,
        purchase_price: article.purchase_price || 0,
        margin_pct: article.margin_pct || 0,
        sale_price: article.sale_price || 0,
        sale_price_mode: article.sale_price_mode || 'auto',
        alert_threshold: article.alert_threshold || 1,
        barcode: article.barcode || '',
        variants_input: Array.isArray(article.variants) ? article.variants.join(', ') : ''
      });
    } else {
      setEditingArticle(null);
      setFormData({
        name: '',
        category: '',
        shelf_location: '',
        quantity: 0,
        purchase_price: 0,
        margin_pct: 20,
        sale_price: 0,
        sale_price_mode: 'auto',
        alert_threshold: 1,
        barcode: '',
        variants_input: ''
      });
    }
    setShowModal(true);
  };

  // Soumission du formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const parsedVariants = formData.variants_input
        ? formData.variants_input.split(',').map(v => v.trim()).filter(Boolean)
        : [];

      const articlePayload = {
        name: formData.name,
        category: formData.category || 'Général',
        shelf_location: formData.shelf_location.toUpperCase(),
        quantity: Number(formData.quantity) || 0,
        purchase_price: Number(formData.purchase_price) || 0,
        margin_pct: Number(formData.margin_pct) || 0,
        sale_price: Number(formData.sale_price) || 0,
        sale_price_mode: formData.sale_price_mode,
        alert_threshold: Number(formData.alert_threshold) || 1,
        barcode: formData.barcode,
        variants: parsedVariants
      };

      if (editingArticle) {
        await updateArticle(editingArticle.id, articlePayload);
      } else {
        await addArticle(articlePayload);
      }
      setShowModal(false);
    } catch (err) {
      alert("Erreur lors de la sauvegarde : " + err.message);
    }
  };

  // Supprimer un article
  const handleDelete = async (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cet article ?")) {
      try {
        await deleteArticle(id);
      } catch (err) {
        alert("Erreur de suppression : " + err.message);
      }
    }
  };

  const stopFormScanner = async () => {
    if (formScannerRef.current && formScannerRef.current.isScanning) {
      try {
        await formScannerRef.current.stop();
      } catch {
        // ignore
      }
      formScannerRef.current = null;
    }
  };

  const startFormScanner = async () => {
    try {
      const html5QrCode = new Html5Qrcode("form-reader");
      formScannerRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          setFormData(prev => ({ ...prev, barcode: decodedText }));
          setFormScannerActive(false);
        },
        () => {}
      );
    } catch (err) {
      alert("Impossible de démarrer la caméra : " + err.message);
      setFormScannerActive(false);
    }
  };

  // Gérer le scanner de code-barres dans le formulaire
  useEffect(() => {
    if (formScannerActive) {
      setTimeout(() => {
        startFormScanner();
      }, 300);
    } else {
      stopFormScanner();
    }
    return () => stopFormScanner();
  }, [formScannerActive]);

  const addArticleToOrder = (article) => {
    setOrderItems((prev) => {
      const existing = prev.find(item => item.articleId === article.id);
      if (existing) {
        return prev.map(item =>
          item.articleId === article.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          articleId: article.id,
          name: article.name,
          quantity: 1,
          shelfLocation: article.shelf_location || '',
          isCustom: false
        }
      ];
    });
    setOrderSearchQuery('');
  };

  const addCustomItemToOrder = () => {
    if (!customItemName.trim()) return;
    setOrderItems((prev) => [
      ...prev,
      {
        articleId: `custom-${crypto.randomUUID()}`,
        name: customItemName.trim(),
        quantity: 1,
        shelfLocation: '',
        isCustom: true
      }
    ]);
    setCustomItemName('');
  };

  const updateOrderItemQty = (articleId, qty) => {
    const num = Number(qty);
    if (num <= 0) {
      removeOrderItem(articleId);
      return;
    }
    setOrderItems(prev =>
      prev.map(item =>
        item.articleId === articleId ? { ...item, quantity: num } : item
      )
    );
  };

  const removeOrderItem = (articleId) => {
    setOrderItems(prev => prev.filter(item => item.articleId !== articleId));
  };

  const clearOrder = () => {
    if (window.confirm("Vider la liste de commande actuelle ?")) {
      setOrderItems([]);
    }
  };

  const handleSendOrder = () => {
    const bossPhone = settings.whatsapp_boss || '';
    if (!bossPhone) {
      alert("Le numéro WhatsApp de la patronne n'est pas configuré. Veuillez aller dans la Configuration.");
      return;
    }
    if (orderItems.length === 0) return;

    const dateStr = new Date().toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let message = `📦 *BON DE COMMANDE - ÉTAGIO*\n`;
    message += `Date : ${dateStr}\n\n`;
    message += `Bonjour, voici la liste des articles à commander :\n\n`;

    orderItems.forEach((item) => {
      const shelfText = item.shelfLocation ? ` (Rayon: ${item.shelfLocation})` : '';
      const customText = item.isCustom ? ' [Nouveau]' : '';
      message += `• *${item.quantity}x* ${item.name}${shelfText}${customText}\n`;
    });

    message += `\nMerci !`;

    const encodedText = encodeURIComponent(message);
    const cleanPhone = bossPhone.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;

    window.open(whatsappUrl, '_blank');
    
    if (window.confirm("La commande a été préparée. Voulez-vous vider la liste de commande ?")) {
      setOrderItems([]);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (orderSearchResults.length > 0) {
        addArticleToOrder(orderSearchResults[0]);
      }
    }
  };

  const handleCustomKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomItemToOrder();
    }
  };

  const stopOrderScanner = async () => {
    if (orderScannerRef.current && orderScannerRef.current.isScanning) {
      try {
        await orderScannerRef.current.stop();
      } catch {
        // ignore
      }
      orderScannerRef.current = null;
    }
  };

  const startOrderScanner = async () => {
    try {
      const html5QrCode = new Html5Qrcode("order-reader");
      orderScannerRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          const cleanedText = String(decodedText).trim().toLowerCase();
          const found = articles.find(a => a.barcode && String(a.barcode).trim().toLowerCase() === cleanedText);
          if (found) {
            addArticleToOrder(found);
          } else {
            alert(`Code-barres inconnu : ${decodedText}. Il a été copié dans le champ "Hors-catalogue".`);
            setCustomItemName(decodedText);
          }
          setOrderScannerActive(false);
        },
        () => {}
      );
    } catch (err) {
      alert("Impossible de démarrer la caméra : " + err.message);
      setOrderScannerActive(false);
    }
  };

  // Gérer le scanner de code-barres dans la commande
  useEffect(() => {
    if (orderScannerActive) {
      setTimeout(() => {
        startOrderScanner();
      }, 300);
    } else {
      stopOrderScanner();
    }
    return () => stopOrderScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderScannerActive]);

  const sendWhatsAppReplenish = (article) => {
    const bossPhone = settings.whatsapp_boss || '';
    if (!bossPhone) {
      alert("Le numéro WhatsApp de la patronne n'est pas configuré.");
      return;
    }
    const message = `Bonjour, le produit ${article.name} est en rupture ou presque en rupture. Emplacement : ${article.shelf_location}. Stock actuel : ${article.quantity}. Seuil : ${article.alert_threshold}. Merci de prévoir un réapprovisionnement pour la boutique.`;
    const url = `https://wa.me/${bossPhone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };



  const formatPrice = (price) => {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
  };

  return (
    <div className="app-content animate-fade-in">
      {/* En-tête de catalogue */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <h1 style={{ fontSize: '1.8rem', margin: '10px 0 2px', textAlign: 'center' }}>Catalogue</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', marginBottom: '8px' }}>
          Gestion de vos {articles.length} articles en rayon.
        </p>
        <button
          className="btn-modern btn-modern-primary"
          onClick={() => openForm(null)}
          style={{ height: '42px', padding: '0 20px', width: '100%', maxWidth: '240px', justifyContent: 'center' }}
        >
          <Icons.Plus style={{ width: '18px', height: '18px', marginRight: '6px' }} />
          Ajouter un nouvel article
        </button>
        <button
          type="button"
          className="btn-modern btn-modern-secondary"
          onClick={() => setShowOrderPanel(!showOrderPanel)}
          style={{
            height: '42px',
            padding: '0 20px',
            width: '100%',
            maxWidth: '240px',
            justifyContent: 'center',
            marginTop: '4px'
          }}
        >
          <span>📝</span>
          <span style={{ marginLeft: '6px' }}>Préparer une commande</span>
          {orderItems.length > 0 && (
            <span
              style={{
                marginLeft: '8px',
                background: 'var(--primary)',
                color: 'white',
                fontSize: '0.75rem',
                borderRadius: '12px',
                padding: '2px 8px',
                fontWeight: 700
              }}
            >
              {orderItems.length}
            </span>
          )}
        </button>
      </div>

      {/* Accordéon de préparation de commande */}
      {showOrderPanel && (
        <div
          className="glass-card animate-fade-in"
          style={{
            padding: '16px',
            marginBottom: '16px',
            textAlign: 'left',
            width: '100%',
            maxWidth: '480px',
            margin: '0 auto 16px'
          }}
        >
          <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📦</span> Commande WhatsApp
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {orderItems.length} article(s)
            </span>
          </h3>

          {/* Recherche d'articles du catalogue */}
          <div className="form-group-modern" style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>RECHERCHER DANS LE CATALOGUE</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                className="input-modern"
                placeholder="Rechercher par nom, rayon, code-barres..."
                value={orderSearchQuery}
                onChange={(e) => setOrderSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                style={{ height: '36px', fontSize: '0.85rem', flex: 1 }}
              />
              <button
                type="button"
                className={`btn-modern ${orderScannerActive ? 'btn-modern-danger' : 'btn-modern-secondary'}`}
                onClick={() => setOrderScannerActive(!orderScannerActive)}
                title="Scanner un code-barres"
                style={{ padding: '8px 12px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icons.Scanner style={{ width: '18px', height: '18px' }} />
              </button>
            </div>

            {/* Lecteur photo pour scan commande */}
            {orderScannerActive && (
              <div style={{
                background: '#111827',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                overflow: 'hidden',
                marginTop: '8px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#1f2937', color: 'white', fontSize: '0.75rem' }}>
                  <span>Cadrez le code-barres de l'article</span>
                  <button type="button" onClick={() => setOrderScannerActive(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>X</button>
                </div>
                <div id="order-reader" style={{ width: '100%', overflow: 'hidden' }}></div>
              </div>
            )}
            
            {/* Résultats de recherche pour l'ajout à la commande */}
            {orderSearchResults.length > 0 && (
              <div
                style={{
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  marginTop: '4px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                {orderSearchResults.map(article => (
                  <div
                    key={article.id}
                    onClick={() => addArticleToOrder(article)}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    className="order-search-item"
                  >
                    <div>
                      <strong style={{ color: 'var(--text-heading)' }}>{article.name}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                        (Rayon: {article.shelf_location || 'N/A'})
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 'bold' }}>+ Ajouter</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ajout d'un article hors-catalogue */}
          <div className="form-group-modern" style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>AJOUTER UN ARTICLE HORS-CATALOGUE</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                className="input-modern"
                placeholder="Ex: Robe de soirée rouge..."
                value={customItemName}
                onChange={(e) => setCustomItemName(e.target.value)}
                onKeyDown={handleCustomKeyDown}
                list="order-catalog-articles"
                style={{ height: '36px', fontSize: '0.85rem', flex: 1 }}
              />
              <datalist id="order-catalog-articles">
                {articles.map(a => (
                  <option key={a.id} value={a.name} />
                ))}
              </datalist>
              <button
                type="button"
                className="btn-modern btn-modern-primary"
                onClick={addCustomItemToOrder}
                style={{ height: '36px', padding: '0 12px', fontSize: '0.8rem' }}
              >
                Ajouter
              </button>
            </div>
          </div>

          {/* Liste des articles de la commande */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
              LISTE DE COMMANDE
            </span>

            {orderItems.length === 0 ? (
              <div style={{ padding: '20px 0', textAlignment: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                Aucun article sélectionné. Recherchez un article ci-dessus ou ajoutez un produit hors-catalogue.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', marginBottom: '14px', paddingRight: '4px' }}>
                {orderItems.map(item => (
                  <div
                    key={item.articleId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px',
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      gap: '8px'
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-heading)' }}>
                        {item.name}
                      </div>
                      {item.isCustom ? (
                        <span style={{ fontSize: '0.65rem', background: 'var(--primary-light)', color: 'var(--primary-dark)', padding: '1px 4px', borderRadius: '4px', fontWeight: 'bold' }}>
                          Hors-cat
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Rayon: {item.shelfLocation || 'N/A'}
                        </span>
                      )}
                    </div>

                    {/* Quantité */}
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-card)' }}>
                      <button
                        type="button"
                        onClick={() => updateOrderItemQty(item.articleId, item.quantity - 1)}
                        style={{ padding: '3px 8px', border: 'none', background: 'transparent', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateOrderItemQty(item.articleId, e.target.value)}
                        style={{ width: '30px', textAlign: 'center', border: 'none', background: 'transparent', fontWeight: 'bold', fontSize: '0.8rem' }}
                      />
                      <button
                        type="button"
                        onClick={() => updateOrderItemQty(item.articleId, item.quantity + 1)}
                        style={{ padding: '3px 8px', border: 'none', background: 'transparent', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        +
                      </button>
                    </div>

                    {/* Supprimer */}
                    <button
                      type="button"
                      onClick={() => removeOrderItem(item.articleId)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--stock-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                    >
                      <Icons.Trash style={{ width: '16px', height: '16px' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Boutons d'action */}
          {orderItems.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <button
                type="button"
                className="btn-modern btn-modern-secondary"
                onClick={clearOrder}
                style={{ flex: 1, padding: '8px', fontSize: '0.85rem', height: '38px' }}
              >
                Vider
              </button>
              <button
                type="button"
                className="btn-modern btn-modern-primary"
                onClick={handleSendOrder}
                style={{ flex: 2, padding: '8px', fontSize: '0.85rem', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Icons.WhatsApp style={{ width: '14px', height: '14px' }} />
                Envoyer ({orderItems.reduce((acc, i) => acc + i.quantity, 0)})
              </button>
            </div>
          )}
        </div>
      )}

      {/* 1. Zone de Filtres */}
      <div className="glass-card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <input
          type="text"
          className="input-modern"
          placeholder="Rechercher (nom, code, étagère)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            className="input-modern"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '8px 10px', height: '36px' }}
          >
            <option value="">Toutes catégories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            className="input-modern"
            value={filterShelf}
            onChange={(e) => setFilterShelf(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '8px 10px', height: '36px' }}
          >
            <option value="">Tous emplacements</option>
            {shelves.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* 2. Liste des Articles */}
      <div className="glass-card" style={{ padding: '10px 0', overflowX: 'auto' }}>
        <table className="catalogue-table responsive-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>État</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Article</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Rayon</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center' }}>Qte</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'right' }}>Vente</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredArticles.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '30px 5px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Aucun article ne correspond à votre recherche.
                </td>
              </tr>
            ) : (
              filteredArticles.map(article => {
                const isOutOfStock = article.quantity === 0;
                const isLowStock = article.quantity > 0 && article.quantity <= article.alert_threshold;
                const statusColor = isOutOfStock ? 'var(--stock-danger)' : isLowStock ? 'var(--stock-warn)' : 'var(--stock-ok)';

                return (
                  <tr key={article.id} className="catalogue-row" style={{ borderBottom: '1px solid rgba(0,0,0,0.03)' }}>
                    {/* Indicateur d'état */}
                    <td className="cell-status" data-label="État" style={{ padding: '12px 8px', verticalAlign: 'middle' }}>
                      <div style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: statusColor,
                        boxShadow: `0 0 6px ${statusColor}`
                      }}></div>
                    </td>

                    {/* Nom et détails */}
                    <td className="cell-article" data-label="Article" style={{ padding: '12px 8px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', wordBreak: 'break-word' }}>{article.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{article.category}</div>
                    </td>

                    {/* Emplacement */}
                    <td className="cell-shelf" data-label="Rayon" style={{ padding: '12px 8px', fontWeight: 600, fontSize: '0.85rem' }}>
                      {article.shelf_location}
                    </td>

                    {/* Quantité */}
                    <td className="cell-qty" data-label="Quantité" style={{ padding: '12px 8px', fontWeight: 800, fontSize: '0.85rem', textAlign: 'center' }}>
                      <span className={`badge ${isOutOfStock ? 'badge-danger' : isLowStock ? 'badge-warn' : 'badge-ok'}`} style={{ padding: '2px 6px', fontSize: '0.7rem' }}>
                        {article.quantity}
                      </span>
                    </td>

                    {/* Prix de Vente */}
                    <td className="cell-price" data-label="Prix" style={{ padding: '12px 8px', fontWeight: 800, fontSize: '0.85rem', textAlign: 'right', color: 'var(--primary-dark)' }}>
                      {formatPrice(article.sale_price)}
                    </td>

                    {/* Actions */}
                    <td className="cell-actions" data-label="Actions" style={{ padding: '12px 8px' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {/* Modifier */}
                        <button
                          onClick={() => openForm(article)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer' }}
                          title="Modifier"
                        >
                          <Icons.Edit style={{ width: '16px', height: '16px' }} />
                        </button>

                        {/* Réappro rapide (toujours visible) */}
                        <button
                          onClick={() => openRestock(article)}
                          style={{ background: 'var(--primary)', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '4px', padding: '3px 7px', fontSize: '0.7rem', fontWeight: 700 }}
                          title="Réapprovisionner le stock"
                        >
                          +Réappro
                        </button>

                        {/* WhatsApp (visible si rupture/faible) */}
                        {(isOutOfStock || isLowStock) && (
                          <button
                            onClick={() => sendWhatsAppReplenish(article)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--stock-ok)', cursor: 'pointer' }}
                            title="Alerter WhatsApp"
                          >
                            <Icons.WhatsApp style={{ width: '16px', height: '16px' }} />
                          </button>
                        )}

                        {/* Supprimer */}
                        <button
                          onClick={() => handleDelete(article.id)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--stock-danger)', cursor: 'pointer' }}
                          title="Supprimer"
                        >
                          <Icons.Trash style={{ width: '16px', height: '16px' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 3. Modal Formulaire (Création / Édition) */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-container glass-card animate-fade-in" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              {editingArticle ? `Modifier : ${editingArticle.name}` : "Ajouter un nouvel article"}
            </h3>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group-modern">
                <label>NOM DE L'ARTICLE *</label>
                <input
                  type="text"
                  name="name"
                  required
                  className="input-modern"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Ex: Pâtes Barilla 500g"
                />
              </div>

              <div className="grid-2">
                <div className="form-group-modern">
                  <label>CATÉGORIE *</label>
                  <input
                    type="text"
                    name="category"
                    required
                    className="input-modern"
                    value={formData.category}
                    onChange={handleChange}
                    placeholder="Ex: Épicerie"
                    list="categories-list"
                  />
                  <datalist id="categories-list">
                    {categories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>

                <div className="form-group-modern">
                  <label>ÉTAGÈRE (A0-Z9) *</label>
                  <input
                    type="text"
                    name="shelf_location"
                    required
                    className="input-modern"
                    value={formData.shelf_location}
                    onChange={handleChange}
                    placeholder="Ex: A2"
                    pattern="[A-Za-z][0-9]"
                    title="Une lettre suivie d'un chiffre (Ex: A3)"
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group-modern">
                  <label>STOCK INITIAL *</label>
                  <input
                    type="number"
                    name="quantity"
                    required
                    min="0"
                    className="input-modern"
                    value={formData.quantity}
                    onChange={handleChange}
                    disabled={!!editingArticle} // Bloqué en édition (pour forcer le mode inventaire/correction)
                  />
                </div>

                <div className="form-group-modern">
                  <label>SEUIL D'ALERTE</label>
                  <input
                    type="number"
                    name="alert_threshold"
                    required
                    min="0"
                    className="input-modern"
                    value={formData.alert_threshold}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div className="form-group-modern">
                  <label>PRIX ACHAT (FCFA)</label>
                  <input
                    type="number"
                    name="purchase_price"
                    step="0.01"
                    min="0"
                    required
                    className="input-modern"
                    value={formData.purchase_price}
                    onChange={handleChange}
                    style={{ padding: '8px' }}
                  />
                </div>

                <div className="form-group-modern">
                  <label>MARGE (%)</label>
                  <input
                    type="number"
                    name="margin_pct"
                    step="0.1"
                    required
                    className="input-modern"
                    value={formData.margin_pct}
                    onChange={handleChange}
                    style={{ padding: '8px' }}
                  />
                </div>

                <div className="form-group-modern">
                  <label>PRIX VENTE (FCFA)</label>
                  <input
                    type="number"
                    name="sale_price"
                    step="0.01"
                    min="0"
                    required
                    className="input-modern"
                    value={formData.sale_price}
                    onChange={handleChange}
                    style={{ padding: '8px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="sale_price_mode"
                    value="auto"
                    checked={formData.sale_price_mode === 'auto'}
                    onChange={handleChange}
                  />
                  Auto (lier marge)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="sale_price_mode"
                    value="manual"
                    checked={formData.sale_price_mode === 'manual'}
                    onChange={handleChange}
                  />
                  Manuel (fixe)
                </label>
              </div>

              {/* Code-barres */}
              <div className="form-group-modern">
                <label>CODE-BARRES</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    name="barcode"
                    className="input-modern"
                    value={formData.barcode}
                    onChange={handleChange}
                    placeholder="Saisir ou scanner"
                  />
                  <button
                    type="button"
                    className={`btn-modern ${formScannerActive ? 'btn-modern-danger' : 'btn-modern-secondary'}`}
                    onClick={() => setFormScannerActive(!formScannerActive)}
                    style={{ padding: '8px' }}
                  >
                    <Icons.Scanner style={{ width: '18px', height: '18px' }} />
                  </button>
                </div>
                {formScannerActive && (
                  <div id="form-reader" style={{ width: '100%', overflow: 'hidden', borderRadius: '6px', border: '1px solid var(--border-color)', marginTop: '8px' }}></div>
                )}
              </div>

              {/* Variantes simples */}
              <div className="form-group-modern">
                <label>VARIANTES (SÉPARÉES PAR DES VIRGULES)</label>
                <input
                  type="text"
                  name="variants_input"
                  className="input-modern"
                  value={formData.variants_input}
                  onChange={handleChange}
                  placeholder="Ex: Fraise, Chocolat, Vanille"
                />
              </div>

              {/* Boutons actions modal */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-modern btn-modern-secondary"
                  onClick={() => setShowModal(false)}
                  style={{ flex: 1 }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-modern btn-modern-primary"
                  style={{ flex: 1 }}
                >
                  Sauvegarder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Réapprovisionnement */}
      {showRestockModal && restockArticle && (
        <div className="modal-overlay" onClick={() => setShowRestockModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 8px' }}>Réapprovisionnement</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
              <strong>{restockArticle.name}</strong> — Stock actuel : <strong>{restockArticle.quantity}</strong>
            </p>
            <div className="form-group-modern">
              <label>QUANTITÉ REÇUE</label>
              <input
                type="number"
                min="1"
                className="input-modern"
                value={restockQty}
                onChange={e => setRestockQty(Math.max(1, Number(e.target.value)))}
                autoFocus
              />
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--stock-ok)', marginBottom: '16px' }}>
              Nouveau stock : <strong>{restockArticle.quantity + Number(restockQty)}</strong>
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-modern btn-modern-secondary" style={{ flex: 1 }} onClick={() => setShowRestockModal(false)}>Annuler</button>
              <button className="btn-modern btn-modern-primary" style={{ flex: 1 }} onClick={handleRestock}>✓ Confirmer</button>
            </div>
          </div>
        </div>
      )}

          <style dangerouslySetInnerHTML={{__html: `
           .catalogue-table th {
  padding: 8px;
}
.catalogue-table td {
  padding: 10px 8px;
}
.modal-overlay {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: rgba(0, 0, 0, 0.45);
              backdrop-filter: blur(4px);
              display: flex;
              align-items: flex-start;
              justify-content: center;
              z-index: 200;
              padding: 20px 10px;
              box-sizing: border-box;
              overflow-y: auto;
            }
.modal-container {
  background: var(--bg-card) !important;
  box-shadow: var(--shadow-lg) !important;
  width: 100% !important;
  max-width: 460px !important;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  margin: auto !important;
  border-radius: 12px;
  box-sizing: border-box;
  flex-shrink: 0;
}
@media (max-width: 480px) {
  .grid-2 {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }
  .grid-3 {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }
  .modal-overlay {
    padding: 8px !important;
    align-items: flex-start !important;
  }
  .modal-container {
    border-radius: 8px !important;
    padding: 16px !important;
    max-height: calc(100vh - 16px);
  }
}
          `}} />
        </div>
      );
    }
