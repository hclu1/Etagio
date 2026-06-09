import Dexie from 'dexie';

// Initialisation de la base de données locale Étagio
export const db = new Dexie('EtagioLocalDB');

// Définition du schéma de la base
// Seuls les champs indexés pour les requêtes/recherches sont déclarés ici
db.version(1).stores({
  articles: 'id, name, category, shelf_location, barcode, synced, updated_at',
  sales: 'id, date, synced',
  movements: 'id, article_id, date, type, synced',
  sync_queue: '++id, action, table, entity_id',
  settings: 'key'
});

// Fonctions d'aide pour initialiser des configurations par défaut
export async function initDefaultSettings() {
  const defaultSettings = [
    { key: 'whatsapp_boss', value: '' },
    { key: 'apps_script_url', value: localStorage.getItem('etagio_test_url') || 'https://script.google.com/macros/s/AKfycbzgKAkQwK3GltWzN-WtKoyJnxS5yNgxbTotskQ4pDVtssKuMfXhvX8OL0Uxkil7KmLe/exec' },
    { key: 'api_key', value: localStorage.getItem('etagio_test_apikey') || 'ETAGIO_SECURE_TOKEN_2026' },
    { key: 'last_sync_time', value: '' }
  ];

  for (const setting of defaultSettings) {
    const exists = await db.settings.get(setting.key);
    if (!exists) {
      await db.settings.add(setting);
    } else if (setting.key === 'apps_script_url' && !exists.value) {
      await db.settings.put({ key: 'apps_script_url', value: setting.value });
    }
  }
}
