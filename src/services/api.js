import { db } from '../db';

/**
 * Service de communication avec le Google Apps Script (Web App)
 */
export const apiService = {
  // Récupérer l'URL de l'App Script et la clé API depuis la base de données
  async getCredentials() {
    const urlSetting = await db.settings.get('apps_script_url');
    const keySetting = await db.settings.get('api_key');
    return {
      url: urlSetting ? urlSetting.value : '',
      apiKey: keySetting ? keySetting.value : 'ETAGIO_SECURE_TOKEN_2026'
    };
  },

  // Tester si l'URL est configurée
  async isConfigured() {
    const creds = await this.getCredentials();
    return !!creds.url;
  },

  // Récupérer toutes les données de Google Sheets (doGet)
  async fetchRemoteData() {
    const { url } = await this.getCredentials();
    if (!url) {
      throw new Error("URL de synchronisation Google Sheets non configurée dans les paramètres.");
    }

    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors'
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP : ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Une erreur inconnue est survenue lors de la récupération des données.");
    }

    return result.data; // { articles: [], sales: [], movements: [] }
  },

  // Envoyer un lot d'opérations (doPost)
  // Utilise text/plain pour contourner les blocages CORS pré-vol
  async sendOperations(operations) {
    if (operations.length === 0) return { success: true, results: [] };

    const { url, apiKey } = await this.getCredentials();
    if (!url) {
      throw new Error("URL de synchronisation Google Sheets non configurée.");
    }

    const payload = {
      apiKey,
      operations
    };

    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP lors de l'envoi : ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Erreur renvoyée par le serveur de synchronisation.");
    }

    return result; // { success: true, results: [...] }
  }
};
