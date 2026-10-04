export const STYLES = `
.tx { padding: 32px 40px; max-width: 1480px; margin: 0 auto; width: 100%; box-sizing: border-box; }
.tx-tabs { display: inline-flex; gap: 4px; padding: 4px; background: #f3f4f6; border-radius: 10px; margin-bottom: 18px; }
.tx .tx-tab { width: auto; padding: 7px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; background: transparent; color: #4b5563; border: none; }
.tx .tx-tab:hover { color: #111827; background: rgba(255,255,255,0.6); }
.tx .tx-tab.is-active { background: #fff; color: #111827; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
.tx-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
.tx-header h1 { font-size: 1.875rem; font-weight: 700; color: #111827; margin: 0 0 8px; }
.tx-header p { color: #6b7280; margin: 0; font-size: 0.95rem; }

.tx-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
.tx-kpi { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); min-width: 0; }
.tx-kpi-label { font-size: 0.72rem; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
.tx-kpi-value { font-size: 1.5rem; font-weight: 700; color: #111827; margin-top: 4px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tx-kpi-sub { font-size: 0.75rem; color: #9ca3af; margin-top: 2px; }
.tone-green { color: #059669 !important; }
.tone-red { color: #dc2626 !important; }
.tone-indigo { color: #4f46e5 !important; }

.tx-card { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.05); padding-bottom: 8px; }
.tx-ranges { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 16px 20px 0; }
.tx .tx-chip { padding: 6px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; background: #f3f4f6; color: #374151; border: 1px solid transparent; width: auto; }
.tx .tx-chip:hover { background: #e5e7eb; }
.tx .tx-chip.is-active { background: #111827; color: #fff; }
.tx-custom-range { display: inline-flex; align-items: center; gap: 6px; color: #6b7280; font-size: 0.8rem; }
.tx-custom-range input { width: auto; padding: 5px 8px; margin: 0; font-size: 0.8rem; }
.tx-seg { margin-left: auto; display: inline-flex; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; }
.tx .tx-seg-btn { border-radius: 0; background: #fff; color: #374151; padding: 6px 14px; font-size: 0.8rem; border-right: 1px solid #e5e7eb; width: auto; }
.tx .tx-seg-btn:last-child { border-right: none; }
.tx .tx-seg-btn:hover { background: #f9fafb; }
.tx .tx-seg-btn.is-active { background: #111827; color: #fff; }
.tx .tx-seg-btn.dir-credit.is-active { background: #059669; }
.tx .tx-seg-btn.dir-debit.is-active { background: #dc2626; }

.tx-toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; padding: 14px 20px 8px; }
.tx-search { position: relative; flex: 1 1 280px; max-width: 400px; }
.tx-search input { padding-left: 34px; padding-right: 32px; margin: 0; }
.tx-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 1.05rem; pointer-events: none; }
.tx .tx-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: transparent; color: #9ca3af; padding: 2px 8px; font-size: 1.1rem; line-height: 1; }
.tx .tx-search-clear:hover { background: #f3f4f6; color: #374151; }
.tx-field { display: grid; gap: 4px; font-size: 0.72rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.03em; }
.tx select { font: inherit; font-size: 0.875rem; font-weight: 500; text-transform: none; letter-spacing: normal; padding: 9px 10px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; color: #111827; min-width: 150px; max-width: 240px; cursor: pointer; }
.tx select:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
.tx-amount { display: inline-flex; align-items: center; gap: 6px; color: #9ca3af; }
.tx-amount input { width: 96px; margin: 0; padding: 9px 10px; font-size: 0.875rem; text-transform: none; }
.tx-check { display: inline-flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #374151; padding-bottom: 10px; cursor: pointer; white-space: nowrap; }
.tx-check input { width: 16px; height: 16px; margin: 0; }

.tx-active { padding: 0 20px 8px; }
.tx-pill { display: inline-flex; align-items: center; gap: 6px; background: #eef2ff; color: #3730a3; border-radius: 999px; padding: 4px 6px 4px 12px; font-size: 0.8rem; font-weight: 600; }
.tx .tx-pill button { background: transparent; color: #4338ca; padding: 0 6px; font-size: 1rem; line-height: 1; border-radius: 999px; width: auto; }
.tx .tx-pill button:hover { background: #c7d2fe; }

.tx-summary { padding: 4px 20px 12px; color: #6b7280; font-size: 0.85rem; }
.tx-summary strong { color: #111827; }
.tx-hint { color: #9ca3af; }
.tx-alert { margin: 0 20px 12px; padding: 10px 12px; border-radius: 8px; background: #fef2f2; color: #b91c1c; font-size: 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 12px; }

.tx-table-wrap { overflow-x: auto; }
.tx-table { width: 100%; border-collapse: collapse; text-align: left; }
.tx-th { padding: 11px 14px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; background: #f9fafb; white-space: nowrap; font-weight: 600; }
.tx-sort { cursor: pointer; user-select: none; display: inline-flex; align-items: center; gap: 4px; }
.tx-sort:hover, .tx-sort.is-active { color: #111827; }
.tx-sort-icon { font-size: 0.65rem; opacity: 0.5; }
.tx-sort.is-active .tx-sort-icon { opacity: 1; color: #4f46e5; }
.tx-td { padding: 11px 14px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; font-size: 0.875rem; }
.tx-row { cursor: pointer; }
.tx-row:hover { background: #fafafa; }
.tx-row.is-selected { background: #eef2ff; }
.tx-row:focus { outline: 2px solid #c7d2fe; outline-offset: -2px; }
tbody.is-loading { opacity: 0.6; transition: opacity 0.15s; }
.tx-id { color: #6b7280; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; }
.tx-user { display: flex; align-items: center; gap: 10px; min-width: 180px; max-width: 240px; }
.tx-avatar { flex: 0 0 32px; width: 32px; height: 32px; border-radius: 50%; background: #eef2ff; color: #4338ca; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; overflow: hidden; }
.tx-avatar img { width: 100%; height: 100%; object-fit: cover; }
.tx-name { font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tx .tx-link { background: transparent; color: #4f46e5; padding: 0; font-size: 0.75rem; font-weight: 500; border-radius: 0; width: auto; }
.tx .tx-link:hover { background: transparent; color: #3730a3; text-decoration: underline; }
.tx-sub { font-size: 0.75rem; color: #6b7280; }
.tx-title { max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 3px; }
.tx-type { display: inline-block; padding: 3px 9px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
.tx-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tx-amount-cell { font-weight: 700; }
.tx-amount-cell.pos { color: #059669; }
.tx-amount-cell.neg { color: #dc2626; }
.tx-amount-cell.zero { color: #9ca3af; }
.tx-muted { color: #6b7280; }
.tx-status { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; background: #f3f4f6; color: #374151; }
.tx-status.status-success, .tx-status.status-completed { background: #d1fae5; color: #065f46; }
.tx-status.status-pending { background: #fef3c7; color: #92400e; }
.tx-status.status-failed, .tx-status.status-reversed { background: #fee2e2; color: #991b1b; }
.tx-date { white-space: nowrap; color: #374151; }

.tx-skeleton { height: 32px; border-radius: 8px; background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 37%, #f3f4f6 63%); background-size: 400% 100%; animation: tx-shimmer 1.2s ease infinite; }
@keyframes tx-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
.tx-empty { padding: 48px 16px; text-align: center; color: #6b7280; font-size: 0.875rem; }
.tx-empty-title { font-weight: 600; color: #111827; font-size: 1rem; margin-bottom: 4px; }

.tx .tx-btn { padding: 8px 14px; font-size: 0.85rem; border-radius: 8px; width: auto; white-space: nowrap; }
.tx .tx-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.tx .tx-btn-export { background: #059669; color: #fff; }
.tx .tx-btn-export:hover:not(:disabled) { background: #047857; }
.tx .tx-btn-ghost { background: #fff; color: #374151; border: 1px solid #d1d5db; }
.tx .tx-btn-ghost:hover:not(:disabled) { background: #f3f4f6; }
.tx .tx-btn-primary { background: #111827; color: #fff; }
.tx .tx-btn-primary:hover { background: #1f2937; }
.tx-btn-link { display: inline-block; text-align: center; font-weight: 600; box-sizing: border-box; }
.tx-btn-link:hover { color: #111827; }

.tx-pager { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 14px 20px 8px; }
.tx-pager-info { display: flex; align-items: center; gap: 16px; color: #6b7280; font-size: 0.85rem; }
.tx-pager-info strong { color: #111827; }
.tx-page-size { display: inline-flex; align-items: center; gap: 6px; }
.tx .tx-page-size select { min-width: 0; padding: 5px 8px; }
.tx-pager-controls { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.tx .tx-page-btn { padding: 6px 11px; min-width: 34px; font-size: 0.8rem; border-radius: 8px; background: #fff; color: #374151; border: 1px solid #e5e7eb; width: auto; }
.tx .tx-page-btn:hover:not(:disabled) { background: #f3f4f6; }
.tx .tx-page-btn.is-active { background: #111827; color: #fff; border-color: #111827; }
.tx .tx-page-btn:disabled:not(.is-active) { opacity: 0.4; cursor: not-allowed; }
.tx-page-gap { color: #9ca3af; padding: 0 4px; }
.tx-jump { display: inline-flex; align-items: center; gap: 6px; margin-left: 10px; color: #6b7280; font-size: 0.8rem; }
.tx-jump input { width: 64px; padding: 5px 8px; margin: 0; }

.tx-drawer-overlay { position: fixed; inset: 0; background: rgba(17,24,39,0.35); z-index: 70; display: flex; justify-content: flex-end; }
.tx-drawer { width: 100%; max-width: 440px; height: 100%; background: #fff; box-shadow: -12px 0 32px rgba(0,0,0,0.12); padding: 24px; overflow-y: auto; box-sizing: border-box; animation: tx-slide 0.18s ease-out; display: flex; flex-direction: column; gap: 18px; }
@keyframes tx-slide { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
.tx-drawer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.tx-drawer-kicker { font-size: 0.8rem; color: #6b7280; font-weight: 600; }
.tx-drawer-amount { font-size: 1.75rem; font-weight: 700; margin: 4px 0 8px; font-variant-numeric: tabular-nums; }
.tx-drawer-amount.pos { color: #059669; }
.tx-drawer-amount.neg { color: #dc2626; }
.tx-drawer-amount.zero { color: #6b7280; }
.tx .tx-close { background: #f3f4f6; color: #374151; padding: 4px 10px; font-size: 1.2rem; line-height: 1; width: auto; }
.tx .tx-close:hover { background: #e5e7eb; }
.tx-dl { display: grid; grid-template-columns: 120px 1fr; gap: 10px 12px; margin: 0; font-size: 0.875rem; }
.tx-dl dt { color: #6b7280; }
.tx-dl dd { margin: 0; color: #111827; word-break: break-word; }
.tx-dl code, .tx-ref code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
.tx-ref { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tx-meta-label { font-size: 0.72rem; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 6px; }
.tx-meta pre { margin: 0; background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 8px; font-size: 0.75rem; max-height: 260px; overflow: auto; }
.tx-drawer-actions { display: grid; gap: 8px; margin-top: auto; }

.tx-toasts { position: fixed; right: 20px; bottom: 20px; display: grid; gap: 8px; z-index: 80; }
.tx-toast { padding: 10px 14px; border-radius: 10px; font-size: 0.875rem; font-weight: 500; box-shadow: 0 8px 24px rgba(0,0,0,0.12); animation: tx-in 0.18s ease-out; max-width: 360px; }
.tx-toast.success { background: #064e3b; color: #ecfdf5; }
.tx-toast.error { background: #7f1d1d; color: #fef2f2; }
@keyframes tx-in { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }

@media (max-width: 1200px) { .tx-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 900px) { .tx { padding: 20px 16px; } .tx-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .tx-seg { margin-left: 0; } }
`;
