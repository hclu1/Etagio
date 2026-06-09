/**
 * Étagio - Suite de tests unitaires d'auto-diagnostic
 * Permet de vérifier le bon fonctionnement des règles métier critiques directement en client.
 */

// Simuler les fonctions métier pour le test unitaire indépendant
export const testUtils = {
  calculateSalePrice(purchasePrice, marginPct) {
    const p = Number(purchasePrice) || 0;
    const m = Number(marginPct) || 0;
    return Number((p * (1 + m / 100)).toFixed(2));
  },

  calculateMarginPct(salePrice, purchasePrice) {
    const s = Number(salePrice) || 0;
    const p = Number(purchasePrice) || 0;
    if (p <= 0) return 0;
    return Number((((s / p) - 1) * 100).toFixed(1));
  },

  validateSaleItem(itemStock, cartQty) {
    if (itemStock === 0) {
      return { valid: false, error: 'BLOCKED_OUT_OF_STOCK' };
    }
    if (itemStock < cartQty) {
      return { valid: true, warning: 'LOW_STOCK_WARNING' };
    }
    return { valid: true };
  },

  formatWhatsAppUrl(article, bossPhone) {
    const cleanPhone = bossPhone.replace(/\D/g, '');
    const message = `Bonjour, le produit ${article.name} est en rupture ou presque en rupture. Emplacement : ${article.shelf_location}. Stock actuel : ${article.quantity}. Seuil : ${article.alert_threshold}. Merci de prévoir un réapprovisionnement pour la boutique.`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }
};

// Exécuteur de tests
export async function runSelfTests() {
  const results = [];

  const runTest = (name, testFn) => {
    try {
      testFn();
      results.push({ name, status: 'PASS' });
    } catch (err) {
      results.push({ name, status: 'FAIL', error: err.message });
    }
  };

  // 1. Calcul du prix de vente automatique
  runTest("Calcul automatique du prix de vente (Prix d'achat + Marge %)", () => {
    const price = testUtils.calculateSalePrice(10.00, 20); // 10€ + 20% = 12€
    if (price !== 12.00) {
      throw new Error(`Attendu : 12.00, Obtenu : ${price}`);
    }
    const priceFloat = testUtils.calculateSalePrice(5.50, 15); // 5.50€ + 15% = 6.325 -> 6.33€
    if (priceFloat !== 6.33) {
      throw new Error(`Attendu : 6.33, Obtenu : ${priceFloat}`);
    }
  });

  // 2. Calcul inverse du pourcentage de marge en saisie manuelle
  runTest("Calcul inverse de la marge lors de la saisie manuelle du prix de vente", () => {
    const margin = testUtils.calculateMarginPct(15.00, 10.00); // 15€ pour 10€ d'achat = 50%
    if (margin !== 50.0) {
      throw new Error(`Attendu : 50.0, Obtenu : ${margin}`);
    }
    const marginFloat = testUtils.calculateMarginPct(6.60, 5.50); // 6.60€ pour 5.50€ = 20%
    if (marginFloat !== 20.0) {
      throw new Error(`Attendu : 20.0, Obtenu : ${marginFloat}`);
    }
  });

  // 3. Validation de vente POS - Blocage si stock à 0
  runTest("Vente POS - Blocage strict si le stock disponible est à 0", () => {
    const validation = testUtils.validateSaleItem(0, 1); // Stock = 0, Cart = 1
    if (validation.valid !== false || validation.error !== 'BLOCKED_OUT_OF_STOCK') {
      throw new Error(`La vente aurait dû être bloquée. Résultat obtenu : ${JSON.stringify(validation)}`);
    }
  });

  // 4. Validation de vente POS - Autorisation avec avertissement si stock faible
  runTest("Vente POS - Autorisation avec avertissement si la quantité vendue dépasse le stock", () => {
    const validation = testUtils.validateSaleItem(2, 3); // Stock = 2, Cart = 3
    if (validation.valid !== true || validation.warning !== 'LOW_STOCK_WARNING') {
      throw new Error(`La vente aurait dû être acceptée avec avertissement. Résultat obtenu : ${JSON.stringify(validation)}`);
    }
  });

  // 5. Génération et encodage correct du lien WhatsApp
  runTest("Génération dynamique et encodage de l'URL WhatsApp click-to-chat", () => {
    const article = {
      name: "Café Moka",
      shelf_location: "B2",
      quantity: 0,
      alert_threshold: 3
    };
    const bossPhone = "+33 (6) 12 34 56 78";
    const url = testUtils.formatWhatsAppUrl(article, bossPhone);
    
    if (!url.startsWith("https://wa.me/33612345678?text=")) {
      throw new Error(`Numéro mal formaté ou URL incorrecte. Reçu : ${url}`);
    }
    
    const decodedMessage = decodeURIComponent(url.split("?text=")[1]);
    if (!decodedMessage.includes("Café Moka") || !decodedMessage.includes("Emplacement : B2")) {
      throw new Error(`Le message ne contient pas les données attendues de l'article. Message décodé : ${decodedMessage}`);
    }
  });

  return results;
}
