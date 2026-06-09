/* global SpreadsheetApp, ContentService */
/* eslint-disable no-unused-vars */
/**
 * Étagio - Google Apps Script Backend
 * A coller dans Extensions > Apps Script de votre Google Sheet.
 * Déployer ensuite en tant que "Application Web" :
 * - Exécuter en tant que : Vous (votre adresse email)
 * - Qui a accès : Tout le monde (Anyone)
 */

const API_KEY = "ETAGIO_SECURE_TOKEN_2026"; // À changer pour plus de sécurité

// Noms des feuilles de calcul
const SHEETS = {
  ARTICLES: "articles",
  SALES: "sales",
  MOVEMENTS: "movements"
};

// En-têtes pour initialisation automatique
const HEADERS = {
  [SHEETS.ARTICLES]: [
    "id", "name", "category", "shelf_location", "quantity", 
    "purchase_price", "margin_pct", "sale_price", "sale_price_mode", 
    "alert_threshold", "variants", "barcode", "created_at", "updated_at"
  ],
  [SHEETS.SALES]: [
    "id", "date", "items", "total_amount", "total_margin", "payment_method"
  ],
  [SHEETS.MOVEMENTS]: [
    "id", "article_id", "date", "type", "quantity_change", 
    "previous_quantity", "new_quantity", "reason"
  ]
};

function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  for (const sheetName of Object.values(SHEETS)) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(HEADERS[sheetName]);
      // Formater la première ligne en gras
      sheet.getRange(1, 1, 1, HEADERS[sheetName].length).setFontWeight("bold");
    }
  }
}

// Fonction de réponse formatée JSON pour contourner CORS
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Gérer les requêtes GET (Lecture complète pour la synchro initiale)
function doGet(e) {
  try {
    initSheets();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const result = { success: true, data: {} };

    for (const sheetName of Object.values(SHEETS)) {
      const sheet = ss.getSheetByName(sheetName);
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0];
      const dataRows = rows.slice(1);

      result.data[sheetName] = dataRows.map(row => {
        const item = {};
        headers.forEach((header, index) => {
          let val = row[index];
          // Parser les variantes et items en JSON si nécessaire
          if ((header === "variants" || header === "items") && typeof val === "string" && val) {
            try {
              val = JSON.parse(val);
            } catch (err) {
              // Garder tel quel si erreur
            }
          }
          item[header] = val;
        });
        return item;
      });
    }

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

// Gérer les requêtes POST (Création/Mise à jour en lot)
// Reçoit un Content-Type 'text/plain' pour éviter la requête pré-vol OPTIONS CORS
function doPost(e) {
  try {
    initSheets();
    
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: "Corps de requête vide" });
    }

    const payload = JSON.parse(e.postData.contents);
    
    // Vérification de la clé API
    if (payload.apiKey !== API_KEY) {
      return jsonResponse({ success: false, error: "Clé API invalide" });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const operations = payload.operations || []; // [{ action: 'CREATE'|'UPDATE'|'DELETE', table: 'articles'|..., payload: {} }]
    const results = [];

    for (const op of operations) {
      const sheet = ss.getSheetByName(op.table);
      if (!sheet) {
        results.push({ success: false, error: `Table inconnue: ${op.table}` });
        continue;
      }

      const headers = sheet.getDataRange().getValues()[0];
      
      if (op.action === "CREATE" || op.action === "UPDATE") {
        const rowData = headers.map(header => {
          let val = op.payload[header];
          if (val === undefined || val === null) return "";
          if (typeof val === "object") return JSON.stringify(val);
          return val;
        });

        const idIndex = headers.indexOf("id");
        let existingRowIndex = -1;

        if (idIndex !== -1 && op.payload.id) {
          const values = sheet.getDataRange().getValues();
          for (let i = 1; i < values.length; i++) {
            if (values[i][idIndex] === op.payload.id) {
              existingRowIndex = i + 1; // 1-based index + header offset
              break;
            }
          }
        }

        if (existingRowIndex !== -1) {
          // UPDATE
          sheet.getRange(existingRowIndex, 1, 1, rowData.length).setValues([rowData]);
          results.push({ success: true, action: "UPDATE", id: op.payload.id });
        } else {
          // CREATE
          sheet.appendRow(rowData);
          results.push({ success: true, action: "CREATE", id: op.payload.id });
        }
      } else if (op.action === "DELETE") {
        const idIndex = headers.indexOf("id");
        let deleted = false;
        if (idIndex !== -1 && op.payload.id) {
          const values = sheet.getDataRange().getValues();
          for (let i = 1; i < values.length; i++) {
            if (values[i][idIndex] === op.payload.id) {
              sheet.deleteRow(i + 1);
              deleted = true;
              results.push({ success: true, action: "DELETE", id: op.payload.id });
              break;
            }
          }
        }
        if (!deleted) {
          results.push({ success: false, error: "Élément à supprimer introuvable", id: op.payload.id });
        }
      }
    }

    return jsonResponse({ success: true, results: results });

  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}
