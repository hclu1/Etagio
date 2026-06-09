import { createContext, useContext, useState, useEffect } from 'react';
import { db, initDefaultSettings } from '../db';
import { syncManager, SyncStatus } from '../services/sync';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [articles, setArticles] = useState([]);
  const [sales, setSales] = useState([]);
  const [movements, setMovements] = useState([]);
  const [settings, setSettings] = useState({});
  const [syncState, setSyncState] = useState({ status: SyncStatus.IDLE, details: '' });
  const [loading, setLoading] = useState(true);

  // Fonction pour recharger les données de Dexie dans l'état React
  const reloadData = async () => {
    try {
      const allArticles = await db.articles.toArray();
      const allSales = await db.sales.toArray();
      // Trier les mouvements par date décroissante pour l'historique
      const allMovements = await db.movements.orderBy('date').reverse().toArray();
      
      const allSettings = await db.settings.toArray();
      const settingsMap = {};
      allSettings.forEach(s => {
        settingsMap[s.key] = s.value;
      });

      setArticles(allArticles);
      setSales(allSales);
      setMovements(allMovements);
      setSettings(settingsMap);
    } catch (err) {
      console.error("Erreur de chargement Dexie :", err);
    }
  };

  // Initialisation au démarrage
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await initDefaultSettings();
      await reloadData();
      setLoading(false);

      // Démarrer la synchro automatique
      syncManager.startAutoSync(60000); // toutes les minutes

      // S'abonner aux statuts de synchronisation
      const unsubscribeSync = syncManager.subscribe(state => {
        setSyncState(state);
        // Si la synchro vient de se terminer avec succès, recharger les données
        if (state.status === SyncStatus.IDLE || state.status === SyncStatus.ERROR) {
          reloadData();
        }
      });

      return () => {
        syncManager.stopAutoSync();
        unsubscribeSync();
      };
    };

    init();
  }, []);

  // Forcer la synchronisation manuellement
  const triggerSync = async () => {
    await syncManager.triggerSync();
    await reloadData();
  };

  // Mettre à jour une configuration
  const updateSetting = async (key, value) => {
    await db.settings.put({ key, value });
    await reloadData();
    if (key === 'apps_script_url' || key === 'api_key') {
      // Si on change la config API, on tente de resynchroniser
      triggerSync();
    }
  };

  // 1. Ajouter un nouvel article
  const addArticle = async (articleData) => {
    const id = articleData.id || `art-${crypto.randomUUID()}`;
    const newArticle = {
      ...articleData,
      id,
      quantity: Number(articleData.quantity) || 0,
      purchase_price: Number(articleData.purchase_price) || 0,
      margin_pct: Number(articleData.margin_pct) || 0,
      sale_price: Number(articleData.sale_price) || 0,
      alert_threshold: Number(articleData.alert_threshold) || 0,
      variants: articleData.variants || [],
      barcode: articleData.barcode || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      synced: 0
    };

    // Ajouter en local
    await db.articles.add(newArticle);
    
    // Enregistrer le mouvement initial d'entrée en stock
    const mvtId = `mvt-${crypto.randomUUID()}`;
    const initialMovement = {
      id: mvtId,
      article_id: id,
      date: new Date().toISOString(),
      type: 'inventory_in',
      quantity_change: newArticle.quantity,
      previous_quantity: 0,
      new_quantity: newArticle.quantity,
      reason: 'Création initiale de l\'article',
      synced: 0
    };
    await db.movements.add(initialMovement);

    // Mettre en file de synchro
    await syncManager.enqueue('CREATE', 'articles', id, newArticle);
    await syncManager.enqueue('CREATE', 'movements', mvtId, initialMovement);

    await reloadData();
  };

  // 2. Modifier un article
  const updateArticle = async (id, changes) => {
    const original = await db.articles.get(id);
    if (!original) throw new Error("Article introuvable");

    const updatedArticle = {
      ...original,
      ...changes,
      updated_at: new Date().toISOString(),
      synced: 0
    };

    // Mettre à jour localement
    await db.articles.put(updatedArticle);

    // Mettre en file de synchro
    await syncManager.enqueue('UPDATE', 'articles', id, updatedArticle);

    await reloadData();
  };

  // 3. Supprimer un article
  const deleteArticle = async (id) => {
    const original = await db.articles.get(id);
    if (!original) throw new Error("Article introuvable");

    // Supprimer localement
    await db.articles.delete(id);

    // Mettre en file de synchro
    await syncManager.enqueue('DELETE', 'articles', id, original);

    await reloadData();
  };

  // 4. Enregistrer une vente (multi-articles)
  // cartItems: [{ articleId, quantity, selectedPrice }]
  const recordSale = async (cartItems, paymentMethod = 'espèces') => {
    const saleId = `sale-${crypto.randomUUID()}`;
    const saleDate = new Date().toISOString();
    const itemsRecord = [];
    let totalAmount = 0;
    let totalMargin = 0;

    // Étape 1 : Valider les stocks de tous les articles avant d'enregistrer quoi que ce soit (Transaction-like)
    for (const cartItem of cartItems) {
      const article = await db.articles.get(cartItem.articleId);
      if (!article) throw new Error(`Article ${cartItem.articleId} introuvable.`);
      if (article.quantity === 0) {
        throw new Error(`La vente de "${article.name}" est bloquée car le stock est à 0.`);
      }
      if (article.quantity < cartItem.quantity) {
        // Optionnel : on pourrait bloquer ou non. Ici on ne bloque pas si le stock est suffisant pour décrémenter
        // (Règle métier : bloqué uniquement si le stock est strictement à 0).
      }
    }

    // Étape 2 : Appliquer les décrémentations et créer les mouvements
    for (const cartItem of cartItems) {
      const article = await db.articles.get(cartItem.articleId);
      const prevQty = article.quantity;
      const newQty = Math.max(0, prevQty - cartItem.quantity); // Évite les stocks négatifs en vente forcée
      const qtyChange = -cartItem.quantity;

      // Mettre à jour l'article
      const updatedArticle = {
        ...article,
        quantity: newQty,
        updated_at: saleDate,
        synced: 0
      };
      await db.articles.put(updatedArticle);
      await syncManager.enqueue('UPDATE', 'articles', article.id, updatedArticle);

      // Créer le mouvement de stock
      const mvtId = `mvt-${crypto.randomUUID()}`;
      const movement = {
        id: mvtId,
        article_id: article.id,
        date: saleDate,
        type: 'sale',
        quantity_change: qtyChange,
        previous_quantity: prevQty,
        new_quantity: newQty,
        reason: `Vente POS (Ref Vente: ${saleId.substring(0,8)})`,
        synced: 0
      };
      await db.movements.add(movement);
      await syncManager.enqueue('CREATE', 'movements', mvtId, movement);

      // Calculer le montant et la marge pour cet article
      const itemTotal = cartItem.selectedPrice * cartItem.quantity;
      const itemMargin = (cartItem.selectedPrice - article.purchase_price) * cartItem.quantity;
      
      totalAmount += itemTotal;
      totalMargin += itemMargin;

      itemsRecord.push({
        article_id: article.id,
        name: article.name,
        quantity: cartItem.quantity,
        sale_price: cartItem.selectedPrice,
        purchase_price: article.purchase_price
      });
    }

    // Étape 3 : Créer la vente
    const newSale = {
      id: saleId,
      date: saleDate,
      items: itemsRecord,
      total_amount: totalAmount,
      total_margin: totalMargin,
      payment_method: paymentMethod,
      synced: 0
    };

    await db.sales.add(newSale);
    await syncManager.enqueue('CREATE', 'sales', saleId, newSale);

    await reloadData();
  };

  // 5. Correction manuelle / Inventaire rapide d'un article
  const correctStock = async (articleId, newQuantity, reason = 'Inventaire rapide') => {
    const article = await db.articles.get(articleId);
    if (!article) throw new Error("Article introuvable");

    const prevQty = article.quantity;
    const qtyChange = newQuantity - prevQty;
    if (qtyChange === 0) return; // Aucun changement

    const date = new Date().toISOString();

    // Mettre à jour l'article
    const updatedArticle = {
      ...article,
      quantity: newQuantity,
      updated_at: date,
      synced: 0
    };
    await db.articles.put(updatedArticle);
    await syncManager.enqueue('UPDATE', 'articles', articleId, updatedArticle);

    // Enregistrer le mouvement de stock
    const mvtId = `mvt-${crypto.randomUUID()}`;
    const movement = {
      id: mvtId,
      article_id: articleId,
      date,
      type: qtyChange > 0 ? 'inventory_in' : 'inventory_out',
      quantity_change: qtyChange,
      previous_quantity: prevQty,
      new_quantity: newQuantity,
      reason: reason,
      synced: 0
    };
    await db.movements.add(movement);
    await syncManager.enqueue('CREATE', 'movements', mvtId, movement);

    await reloadData();
  };

  return (
    <AppContext.Provider value={{
      articles,
      sales,
      movements,
      settings,
      syncState,
      loading,
      reloadData,
      updateSetting,
      addArticle,
      updateArticle,
      deleteArticle,
      recordSale,
      correctStock,
      triggerSync
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
