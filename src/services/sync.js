import { db } from '../db';
import { apiService } from './api';

// Statuts de synchronisation
export const SyncStatus = {
  IDLE: 'IDLE',         // En attente
  SYNCING: 'SYNCING',   // En cours
  OFFLINE: 'OFFLINE',   // Hors ligne
  ERROR: 'ERROR',       // Erreur
};

let syncStatusListeners = [];
let currentStatus = SyncStatus.IDLE;
let syncTimeoutId = null;

// Déclencher le changement de statut
function setStatus(status, details = '') {
  currentStatus = status;
  syncStatusListeners.forEach(listener => listener({ status, details }));
}

export const syncManager = {
  // S'abonner aux changements d'état de la synchronisation
  subscribe(listener) {
    syncStatusListeners.push(listener);
    // Renvoyer le statut actuel immédiatement
    listener({ status: currentStatus, details: '' });
    return () => {
      syncStatusListeners = syncStatusListeners.filter(l => l !== listener);
    };
  },

  getStatus() {
    return currentStatus;
  },

  // Ajouter une opération à la file de synchro locale
  async enqueue(action, table, entityId, payload) {
    await db.sync_queue.add({
      action,
      table,
      entity_id: entityId,
      payload: JSON.parse(JSON.stringify(payload)), // Deep copy pour éviter les proxies
      created_at: new Date().toISOString()
    });

    // Mettre à jour l'indicateur local de synchro sur l'objet lui-même
    if (db[table]) {
      await db[table].update(entityId, { synced: 0 });
    }

    // Tenter une synchronisation immédiate si en ligne
    this.triggerSync();
  },

  // Déclencher une synchronisation d'envoi et de réception
  async triggerSync() {
    if (!navigator.onLine) {
      setStatus(SyncStatus.OFFLINE);
      return;
    }

    if (currentStatus === SyncStatus.SYNCING) return;

    if (!(await apiService.isConfigured())) {
      setStatus(SyncStatus.ERROR, "Google Sheets non configuré.");
      return;
    }

    setStatus(SyncStatus.SYNCING, "Envoi des données locales...");

    try {
      // 1. Pousser les modifications locales en attente
      await this.pushLocalChanges();

      setStatus(SyncStatus.SYNCING, "Récupération des données distantes...");

      // 2. Récupérer et fusionner les données distantes
      await this.pullRemoteChanges();

      // Mettre à jour la date de dernière synchro réussie
      await db.settings.put({ key: 'last_sync_time', value: new Date().toISOString() });
      setStatus(SyncStatus.IDLE, "Synchronisation réussie !");
    } catch (error) {
      console.error("Erreur de synchronisation :", error);
      setStatus(SyncStatus.ERROR, error.message);
    }
  },

  // Pousser les modifications locales (file d'attente) vers le serveur
  async pushLocalChanges() {
    // Récupérer toutes les opérations en attente (triées par ID auto-incrémenté - FIFO)
    const queue = await db.sync_queue.toArray();
    if (queue.length === 0) {
      return;
    }

    // Préparer les opérations pour le serveur
    const operations = queue.map(item => ({
      action: item.action,
      table: item.table,
      payload: item.payload
    }));

    // Envoyer au serveur
    const response = await apiService.sendOperations(operations);

    if (response.success) {
      // Traiter les résultats pour chaque opération
      for (let i = 0; i < queue.length; i++) {
        const queueItem = queue[i];
        const opResult = response.results[i];

        if (opResult && opResult.success) {
          // Supprimer l'élément de la file d'attente
          await db.sync_queue.delete(queueItem.id);

          // Si l'élément existe toujours dans la table d'origine, le marquer comme synchronisé
          const table = queueItem.table;
          const entityId = queueItem.entity_id;
          
          if (db[table] && queueItem.action !== 'DELETE') {
            const exists = await db[table].get(entityId);
            if (exists) {
              await db[table].update(entityId, { synced: 1 });
            }
          }
        } else {
          const errorMsg = opResult ? opResult.error : "Erreur inconnue";
          throw new Error(`Erreur lors de la synchro de l'élément ${queueItem.entity_id} : ${errorMsg}`);
        }
      }
    }
  },

  // Récupérer les données distantes et les fusionner avec la base locale
  async pullRemoteChanges() {
    const remoteData = await apiService.fetchRemoteData(); // { articles: [], sales: [], movements: [] }

    // 1. Traiter les articles (Fusion intelligente)
    if (remoteData.articles) {
      for (const remoteArticle of remoteData.articles) {
        if (!remoteArticle.id) continue;

        // S'assurer que le code-barres est toujours une chaîne de caractères propre (non numérique, sans espaces)
        if (remoteArticle.barcode !== undefined && remoteArticle.barcode !== null) {
          remoteArticle.barcode = String(remoteArticle.barcode).trim();
        } else {
          remoteArticle.barcode = '';
        }

        const localArticle = await db.articles.get(remoteArticle.id);

        if (!localArticle) {
          // Si l'article n'existe pas localement, on l'ajoute
          // On s'assure qu'il est marqué comme synchronisé
          await db.articles.put({
            ...remoteArticle,
            synced: 1
          });
        } else {
          // Si l'article existe localement :
          // Si l'article est marqué localement non synchronisé, il y a un conflit potentiel.
          // On applique la règle Last-Write-Wins en comparant les timestamps de modification.
          const localTimestamp = localArticle.updated_at ? new Date(localArticle.updated_at).getTime() : 0;
          const remoteTimestamp = remoteArticle.updated_at ? new Date(remoteArticle.updated_at).getTime() : 0;

          if (localArticle.synced === 0) {
            // Conflit ! On ne remplace que si la version distante est strictement plus récente
            if (remoteTimestamp > localTimestamp) {
              await db.articles.put({
                ...remoteArticle,
                synced: 1
              });
              // Il faut aussi supprimer les éventuelles modifications locales obsolètes de cet article dans la file
              const pendingOps = await db.sync_queue.where({ table: 'articles', entity_id: remoteArticle.id }).toArray();
              for (const op of pendingOps) {
                await db.sync_queue.delete(op.id);
              }
            }
          } else {
            // Pas de modification locale en cours, on met à jour si la version distante est plus récente ou différente
            if (remoteTimestamp > localTimestamp || localArticle.updated_at !== remoteArticle.updated_at) {
              await db.articles.put({
                ...remoteArticle,
                synced: 1
              });
            }
          }
        }
      }
    }

    // 2. Traiter les ventes (Append-only : on ajoute celles qui n'existent pas)
    if (remoteData.sales) {
      for (const remoteSale of remoteData.sales) {
        if (!remoteSale.id) continue;
        const exists = await db.sales.get(remoteSale.id);
        if (!exists) {
          await db.sales.put({
            ...remoteSale,
            synced: 1
          });
        }
      }
    }

    // 3. Traiter les mouvements (Append-only : on ajoute ceux qui n'existent pas)
    if (remoteData.movements) {
      for (const remoteMvt of remoteData.movements) {
        if (!remoteMvt.id) continue;
        const exists = await db.movements.get(remoteMvt.id);
        if (!exists) {
          await db.movements.put({
            ...remoteMvt,
            synced: 1
          });
        }
      }
    }
  },

  // Démarrer la surveillance automatique (réseau et périodique)
  startAutoSync(intervalMs = 60000) {
    // Écouter les changements de statut réseau du navigateur
    window.addEventListener('online', () => {
      this.triggerSync();
    });
    window.addEventListener('offline', () => {
      setStatus(SyncStatus.OFFLINE);
    });

    // Boucle de synchro périodique
    const runPeriodicSync = async () => {
      await this.triggerSync();
      syncTimeoutId = setTimeout(runPeriodicSync, intervalMs);
    };

    runPeriodicSync();
  },

  stopAutoSync() {
    if (syncTimeoutId) {
      clearTimeout(syncTimeoutId);
      syncTimeoutId = null;
    }
  }
};
