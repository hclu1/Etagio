import { useApp } from '../context/AppContext';

export default function Dashboard() {
  const { articles, sales, movements } = useApp();

  // 1. Calculs des Statistiques
  const rupturesCount = articles.filter(a => a.quantity === 0).length;
  const alertesCount = articles.filter(a => a.quantity > 0 && a.quantity <= a.alert_threshold).length;
  
  const totalValue = articles.reduce((acc, a) => acc + (a.purchase_price * a.quantity), 0);

  // Filtrer les ventes du jour
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySales = sales.filter(s => s.date.startsWith(todayStr));
  const todayRevenue = todaySales.reduce((acc, s) => acc + s.total_amount, 0);
  const todayMargin = todaySales.reduce((acc, s) => acc + s.total_margin, 0);

  // 2. Emplacements à vérifier en priorité aujourd'hui
  // (Emplacements ayant eu des mouvements aujourd'hui)
  const todayMovements = movements.filter(m => m.date.startsWith(todayStr));
  const movedShelves = new Set();
  
  todayMovements.forEach(mvt => {
    const article = articles.find(a => a.id === mvt.article_id);
    if (article && article.shelf_location) {
      movedShelves.add(article.shelf_location);
    }
  });

  const shelvesToVerify = Array.from(movedShelves).sort();

  const formatPrice = (price) => {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
  };

  // Obtenir le libellé du type de mouvement
  const getMvtTypeLabel = (type, change) => {
    switch (type) {
      case 'sale':
        return { text: 'Vente', color: 'var(--stock-danger)' };
      case 'restock':
        return { text: 'Réappro', color: 'var(--stock-ok)' };
      case 'inventory_in':
        return { text: 'Ajout Inv.', color: 'var(--stock-ok)' };
      case 'inventory_out':
        return { text: 'Retrait Inv.', color: 'var(--stock-danger)' };
      case 'correction':
        return { text: 'Correction', color: 'var(--primary)' };
      default:
        return { text: change > 0 ? 'Entrée' : 'Sortie', color: 'var(--text-muted)' };
    }
  };

  return (
    <div className="app-content animate-fade-in">
      {/* 1. Titre et description */}
      <div>
        <h1 style={{ fontSize: '1.8rem', textAlign: 'left', margin: '10px 0 5px' }}>Tableau de bord</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'left' }}>
          Vue d'ensemble de l'activité du rayon et alertes de stock.
        </p>
      </div>

      {/* 2. Grid de Métriques */}
      <div className="dashboard-grid">
        {/* Ruptures */}
        <div className="metric-card card-rupture">
          <div className="metric-header">
            <span>Ruptures</span>
            <div className="metric-dot dot-red"></div>
          </div>
          <div className="metric-value">{rupturesCount}</div>
          <div className="metric-desc">Articles en rupture totale</div>
        </div>

        {/* Alertes Seuil */}
        <div className="metric-card card-alerte">
          <div className="metric-header">
            <span>Stock Faible</span>
            <div className="metric-dot dot-orange"></div>
          </div>
          <div className="metric-value">{alertesCount}</div>
          <div className="metric-desc">Sous le seuil d'alerte</div>
        </div>

        {/* Ventes du Jour */}
        <div className="metric-card card-sales">
          <div className="metric-header">
            <span>Vente du jour</span>
            <div className="metric-dot dot-purple"></div>
          </div>
          <div className="metric-value">{formatPrice(todayRevenue)}</div>
          <div className="metric-desc">Marge : {formatPrice(todayMargin)} · {todaySales.length} vente(s)</div>
        </div>

        {/* Valeur Inventaire */}
        <div className="metric-card card-inventory">
          <div className="metric-header">
            <span>Inventaire</span>
            <div className="metric-dot dot-neutral"></div>
          </div>
          <div className="metric-value" style={{ fontSize: '1.4rem', fontWeight: 800 }}>
            {formatPrice(totalValue)}
          </div>
          <div className="metric-desc">Valeur d'achat globale</div>
        </div>
      </div>

      {/* 3. Vérification Prioritaire des Étagères */}
      <div className="glass-card" style={{ padding: '16px' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.3rem' }}>🔍</span> Étagères à vérifier aujourd'hui
        </h3>
        {shelvesToVerify.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Aucun mouvement enregistré aujourd'hui. Toutes les étagères sont à jour.
          </p>
        ) : (
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Ces étagères ont eu des mouvements de stock aujourd'hui. Effectuez un contrôle visuel rapide en rayon :
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {shelvesToVerify.map(shelf => (
                <div
                  key={shelf}
                  style={{
                    background: 'var(--primary-glow)',
                    color: 'var(--primary-dark)',
                    border: '1px solid var(--primary)',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    fontWeight: 700
                  }}
                >
                  Étagère {shelf}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Historique des Mouvements Récents */}
      <div className="glass-card" style={{ padding: '16px', overflowX: 'auto' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.3rem' }}>📋</span> Mouvements récents
        </h3>
        {movements.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Aucun mouvement de stock dans l'historique local.
          </p>
        ) : (
          <div className="table-responsive">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Article</th>
                  <th>Type</th>
                  <th>Mvt</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {movements.slice(0, 8).map(mvt => {
                  const article = articles.find(a => a.id === mvt.article_id);
                  const articleName = article ? article.name : 'Article inconnu';
                  const shelf = article ? ` (${article.shelf_location})` : '';
                  const labelInfo = getMvtTypeLabel(mvt.type, mvt.quantity_change);

                  return (
                    <tr key={mvt.id}>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(mvt.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="cell-article-name">
                        {articleName}
                        <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>{shelf}</span>
                      </td>
                      <td style={{ fontSize: '0.8rem', fontWeight: 600, color: labelInfo.color }}>
                        {labelInfo.text}
                      </td>
                      <td style={{ fontWeight: 800, fontSize: '0.85rem', color: mvt.quantity_change > 0 ? 'var(--stock-ok)' : 'var(--stock-danger)' }}>
                        {mvt.quantity_change > 0 ? `+${mvt.quantity_change}` : mvt.quantity_change}
                      </td>
                      <td style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {mvt.new_quantity}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 380px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
        }
        .metric-card {
          background: var(--bg-card);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-md);
          padding: 14px;
          text-align: left;
          box-shadow: var(--shadow-sm);
        }
        .metric-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
        }
        .metric-value {
          font-size: 1.8rem;
          font-weight: 800;
          color: var(--text-heading);
          margin: 6px 0;
          font-family: var(--font-heading);
        }
        .metric-desc {
          font-size: 0.7rem;
          color: var(--text-muted);
        }
        .metric-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .dot-red { background-color: var(--stock-danger); }
        .dot-orange { background-color: var(--stock-warn); }
        .dot-purple { background-color: var(--accent); }
        .dot-neutral { background-color: var(--text-muted); }

        .card-rupture { border-left: 4px solid var(--stock-danger); }
        .card-alerte { border-left: 4px solid var(--stock-warn); }
        .card-sales { border-left: 4px solid var(--accent); }
        .card-inventory { border-left: 4px solid var(--text-muted); }

        .dashboard-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .dashboard-table th {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: var(--text-muted);
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border-color);
        }
        .dashboard-table td {
          padding: 10px 0;
          border-bottom: 1px solid rgba(0,0,0,0.03);
        }
        .cell-article-name {
          font-weight: 600;
          font-size: 0.85rem;
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        @media (min-width: 580px) {
          .cell-article-name {
            max-width: none !important;
            white-space: normal !important;
          }
        }
        .table-responsive {
          width: 100%;
          overflow-x: auto;
        }
      `}} />
    </div>
  );
}
