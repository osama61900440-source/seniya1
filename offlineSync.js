// src/offlineSync.js
// Offline-First Local Database (IndexedDB) and Automatic Online Sync Manager for Seniya Web/POS

import {
  saveShopToFirestore,
  saveSaleToFirestore,
  saveExpenseToFirestore,
  saveInventoryItemToFirestore,
  isFirestoreConfigured
} from "./firebase.js";

// IndexedDB Constants
const DB_NAME = "SeniyaPOS_IndexedDB";
const DB_VERSION = 1;
const STORE_SHOPS = "shops_store";

let dbPromise = null;

export const syncEngineState = {
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  isSyncing: false,
  lastSyncedAt: null,
  listeners: []
};

/**
 * Initializes and returns the IndexedDB instance
 */
export function getIDB() {
  if (dbPromise) return dbPromise;
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_SHOPS)) {
          db.createObjectStore(STORE_SHOPS, { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        resolve(event.target.result);
      };
      request.onerror = (err) => {
        console.warn("[IndexedDB] Error opening database:", err);
        resolve(null);
      };
    } catch (e) {
      console.warn("[IndexedDB] Initialization exception:", e);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Asynchronously persists data to IndexedDB
 */
export async function saveToIndexedDB(key, data) {
  if (!key || !data) return false;
  try {
    const db = await getIDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_SHOPS, "readwrite");
        const store = tx.objectStore(STORE_SHOPS);
        const record = { id: String(key), data: data, updatedAt: Date.now() };
        const req = store.put(record);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  } catch (e) {
    return false;
  }
}

/**
 * Asynchronously loads data from IndexedDB
 */
export async function loadFromIndexedDB(key) {
  if (!key) return null;
  try {
    const db = await getIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_SHOPS, "readonly");
        const store = tx.objectStore(STORE_SHOPS);
        const req = store.get(String(key));
        req.onsuccess = (event) => {
          const res = event.target.result;
          resolve(res ? res.data : null);
        };
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  } catch (e) {
    return null;
  }
}

/**
 * Ensures all entity items carry synced: true / synced: false flags
 */
export function ensureDataSyncFlags(data) {
  if (!data || typeof data !== "object") return data;

  const collections = ["sales", "items", "expenses", "customers", "shipments"];
  collections.forEach((collName) => {
    if (Array.isArray(data[collName])) {
      data[collName].forEach((item) => {
        if (item && typeof item === "object") {
          if (item.synced === undefined) {
            item.synced = true;
          } else {
            item.synced = Boolean(item.synced);
          }
        }
      });
    }
  });

  return data;
}

/**
 * Counts unsynced records across all entity categories
 */
export function getPendingSyncStats(data) {
  if (!data || typeof data !== "object") {
    return { total: 0, sales: 0, items: 0, expenses: 0, customers: 0, shipments: 0 };
  }

  const sales = (data.sales || []).filter((s) => s && s.synced === false).length;
  const items = (data.items || []).filter((i) => i && i.synced === false).length;
  const expenses = (data.expenses || []).filter((e) => e && e.synced === false).length;
  const customers = (data.customers || []).filter((c) => c && c.synced === false).length;
  const shipments = (data.shipments || []).filter((sh) => sh && sh.synced === false).length;

  const shopUnsynced = data.synced === false ? 1 : 0;
  const total = sales + items + expenses + customers + shipments + shopUnsynced;

  return { total, sales, items, expenses, customers, shipments, shopUnsynced };
}

/**
 * Tests actual internet connectivity beyond navigator.onLine
 */
export async function testOnlineConnectivity() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("/api/health", { method: "HEAD", signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok || res.status < 500;
  } catch (e) {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  }
}

export function subscribeSyncStatus(listener) {
  if (typeof listener === "function") {
    syncEngineState.listeners.push(listener);
  }
  return () => {
    syncEngineState.listeners = syncEngineState.listeners.filter((l) => l !== listener);
  };
}

function notifySyncStatusChange() {
  syncEngineState.listeners.forEach((fn) => {
    try { fn(syncEngineState); } catch (e) {}
  });
}

/**
 * Executes automatic online synchronization for unsynced records
 */
export async function performOnlineSync(getState, setState, showToast, isManualTrigger = false) {
  if (syncEngineState.isSyncing) {
    if (isManualTrigger && showToast) showToast("🔄 ሲንክሮናይዜሽን እየተካሄደ ነው... (Syncing in progress)");
    return;
  }

  const isOnline = await testOnlineConnectivity();
  if (!isOnline) {
    syncEngineState.isOnline = false;
    notifySyncStatusChange();
    if (isManualTrigger && showToast) {
      showToast("⚠️ የኢንተርኔት መስመር የለም (Offline mode) — ኮኔክሽን ሲመለስ አውቶማቲክ ይላካል");
    }
    return;
  }

  syncEngineState.isOnline = true;
  const currentState = getState ? getState() : null;
  const data = currentState ? currentState.data : null;
  if (!data) return;

  const stats = getPendingSyncStats(data);
  if (stats.total === 0 && !data.needsFullSync) {
    if (isManualTrigger && showToast) {
      showToast("✓ መረጃዎች በሙሉ አስቀድመው ኦንላይን ተልከዋል (Fully Synced)");
    }
    notifySyncStatusChange();
    return;
  }

  syncEngineState.isSyncing = true;
  notifySyncStatusChange();

  const storeId = String(data.store_id || data.storeId || data.shopId || "").trim();
  const ownerPhone = String(data.ownerPhoneNumber || (data.profile && data.profile.phone) || "").trim();

  let syncedAny = false;

  try {
    // 1. Sync Unsynced Sales
    if (Array.isArray(data.sales)) {
      for (const sale of data.sales) {
        if (sale && sale.synced === false) {
          try {
            await saveSaleToFirestore(sale, storeId);
            sale.synced = true;
            sale.syncedAt = Date.now();
            syncedAny = true;
          } catch (err) {
            console.warn("[AutoSync] Failed syncing sale:", sale.id, err);
          }
        }
      }
    }

    // 2. Sync Unsynced Items / Inventory
    if (Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item && item.synced === false) {
          try {
            await saveInventoryItemToFirestore(item, storeId);
            item.synced = true;
            item.syncedAt = Date.now();
            syncedAny = true;
          } catch (err) {
            console.warn("[AutoSync] Failed syncing item:", item.id, err);
          }
        }
      }
    }

    // 3. Sync Unsynced Expenses
    if (Array.isArray(data.expenses)) {
      for (const exp of data.expenses) {
        if (exp && exp.synced === false) {
          try {
            await saveExpenseToFirestore(exp, storeId);
            exp.synced = true;
            exp.syncedAt = Date.now();
            syncedAny = true;
          } catch (err) {
            console.warn("[AutoSync] Failed syncing expense:", exp.id, err);
          }
        }
      }
    }

    // 4. Sync Unsynced Customers & Shipments inside full shop payload
    if (Array.isArray(data.customers)) {
      data.customers.forEach((c) => { if (c) { c.synced = true; c.syncedAt = Date.now(); } });
    }
    if (Array.isArray(data.shipments)) {
      data.shipments.forEach((sh) => { if (sh) { sh.synced = true; sh.syncedAt = Date.now(); } });
    }

    // 5. Full Shop Payload Sync
    if (storeId) {
      const shopPayload = {
        store_id: storeId,
        storeId: storeId,
        shopId: storeId,
        owner_phone: ownerPhone,
        ownerPhoneNumber: ownerPhone,
        inventory: data.items || [],
        sales: data.sales || [],
        expenses: data.expenses || [],
        shipments: data.shipments || [],
        customers: data.customers || [],
        profile: data.profile || {},
        updatedAt: Date.now()
      };

      try {
        await saveShopToFirestore(shopPayload);
        data.synced = true;
        data.needsFullSync = false;
        syncedAny = true;
      } catch (err) {
        console.warn("[AutoSync] Full shop sync warning:", err);
      }

      try {
        await fetch("/api/shop/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(shopPayload)
        });
      } catch (e) {}
    }

    syncEngineState.lastSyncedAt = Date.now();

    if (syncedAny && setState) {
      setState(data);
      if (showToast) {
        showToast("✓ መረጃዎች በሙሉ በስኬት ወደ ኦንላይን ሲንክ ተደርገዋል! (Sync Complete)");
      }
    }
  } catch (err) {
    console.error("[AutoSync] Sync exception:", err);
  } finally {
    syncEngineState.isSyncing = false;
    notifySyncStatusChange();
  }
}

/**
 * Initializes automatic network listeners and periodic background sync
 */
export function initOfflineSyncEngine(getState, setState, showToast) {
  if (typeof window === "undefined") return;

  const handleOnline = () => {
    console.log("[OfflineSync] Event: online detected");
    syncEngineState.isOnline = true;
    notifySyncStatusChange();
    if (showToast) showToast("🌐 የኢንተርኔት መስመር ተገኝቷል — አውቶማቲክ ሲንክሮናይዜሽን እየተካሄደ ነው...");
    performOnlineSync(getState, setState, showToast, false);
  };

  const handleOffline = () => {
    console.log("[OfflineSync] Event: offline detected");
    syncEngineState.isOnline = false;
    notifySyncStatusChange();
    if (showToast) showToast("🔴 የኢንተርኔት መስመር ተቋርጧል — አፑ በኦፍላይን (Offline) ይሰራል");
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Background Periodic Sync Check (runs every 15 seconds)
  setInterval(() => {
    if (navigator.onLine && !syncEngineState.isSyncing) {
      const state = getState ? getState() : null;
      if (state && state.data) {
        const stats = getPendingSyncStats(state.data);
        if (stats.total > 0 || state.data.needsFullSync) {
          performOnlineSync(getState, setState, null, false);
        }
      }
    }
  }, 15000);

  // Initial sync run on app load if online
  if (navigator.onLine) {
    setTimeout(() => {
      performOnlineSync(getState, setState, null, false);
    }, 2500);
  }
}

/**
 * Creates the Sync Status Badge UI element
 */
export function createSyncStatusBadge(data, onOpenDetails) {
  const stats = getPendingSyncStats(data);
  const isOnline = syncEngineState.isOnline;
  const isSyncing = syncEngineState.isSyncing;

  let bgStyle = "#22c55e"; // Green
  let text = "🟢 ኦንላይን";
  let titleAttr = "የኢንተርኔት ኮኔክሽን አለ — መረጃዎች በሙሉ ተልከዋል";

  if (isSyncing) {
    bgStyle = "#3b82f6"; // Blue
    text = "🔄 እየተላከ ነው...";
    titleAttr = "መረጃዎች ወደ ኦንላይን ዳታቤዝ እየተላኩ ነው...";
  } else if (!isOnline) {
    bgStyle = "#ef4444"; // Red
    text = stats.total > 0 ? `🔴 ኦፍላይን (${stats.total} ያልተላኩ)` : "🔴 ኦፍላይን";
    titleAttr = "የኢንተርኔት ኮኔክሽን የለም — አፑ በኦፍላይን ሁነታ ይሰራል";
  } else if (stats.total > 0) {
    bgStyle = "#f59e0b"; // Amber/Orange
    text = `⚡ ${stats.total} ያልተላኩ`;
    titleAttr = `${stats.total} ያልተላኩ መረጃዎች አሉ — ለመላክ እዚህ ይጫኑ`;
  }

  const badgeEl = document.createElement("button");
  badgeEl.type = "button";
  badgeEl.className = "sync-status-badge-btn";
  badgeEl.setAttribute("title", titleAttr);
  badgeEl.setAttribute("aria-label", titleAttr);
  badgeEl.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: ${bgStyle};
    color: #ffffff;
    font-size: 11px;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 20px;
    border: none;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,0.18);
    transition: transform 0.15s ease, opacity 0.15s ease;
    white-space: nowrap;
    user-select: none;
    margin-left: auto;
    margin-right: 6px;
  `;

  if (isSyncing) {
    badgeEl.innerHTML = `<span style="display:inline-block; animation: spin 1s linear infinite;">🔄</span> <span>እየተላከ ነው...</span>`;
  } else {
    badgeEl.textContent = text;
  }

  badgeEl.onclick = (e) => {
    e.stopPropagation();
    if (typeof onOpenDetails === "function") {
      onOpenDetails();
    }
  };

  return badgeEl;
}

/**
 * Opens an interactive detail sheet displaying offline status & pending sync items
 */
export function openSyncDetailsSheet(getState, setState, showToast, openSheetFn) {
  const currentState = getState ? getState() : null;
  const data = currentState ? currentState.data : null;
  const stats = getPendingSyncStats(data);
  const isOnline = syncEngineState.isOnline;

  const content = document.createElement("div");
  content.className = "canva-sync-sheet-content";
  content.style.padding = "10px 4px";

  // Header Status Box
  const banner = document.createElement("div");
  banner.style.cssText = `
    padding: 14px;
    border-radius: 12px;
    background: ${isOnline ? (stats.total > 0 ? "#fffbebe6" : "#f0fdf4") : "#fef2f2"};
    border: 1.5px solid ${isOnline ? (stats.total > 0 ? "#fde68a" : "#bbf7d0") : "#fecaca"};
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  `;

  const icon = document.createElement("div");
  icon.style.fontSize = "28px";
  icon.textContent = isOnline ? (stats.total > 0 ? "⚡" : "🟢") : "🔴";

  const bannerText = document.createElement("div");
  bannerText.innerHTML = `
    <div style="font-weight:800; font-size:14px; color:${isOnline ? (stats.total > 0 ? "#92400e" : "#166534") : "#991b1b"};">
      ${isOnline ? (stats.total > 0 ? `${stats.total} ያልተላኩ መረጃዎች አሉ (Pending Sync)` : "የኢንተርኔት ግንኙነት አለ (Online)") : "የኢንተርኔት ግንኙነት የለም (Offline Mode)"}
    </div>
    <div style="font-size:12px; color:#475569; margin-top:2px;">
      ${isOnline ? "መረጃዎች በራስ-ሰር ወደ Firebase / Remote DB ይላካሉ።" : "አፑ በኦፍላይን ሁነታ እየሰራ ነው። መረጃዎች በስልኩ local database (IndexedDB / LocalStorage) ላይ በአስተማማኝ ሁኔታ ተቀምጠዋል።"}
    </div>
  `;

  banner.appendChild(icon);
  banner.appendChild(bannerText);
  content.appendChild(banner);

  // Unsynced Breakdown
  const listTitle = document.createElement("div");
  listTitle.style.cssText = "font-weight:800; font-size:13px; color:#1e293b; margin-bottom:8px;";
  listTitle.textContent = "የያዙ መረጃዎች ሁኔታ (Data Sync Breakdown):";
  content.appendChild(listTitle);

  const breakdownBox = document.createElement("div");
  breakdownBox.style.cssText = "background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:8px 12px; font-size:12.5px; display:flex; flex-direction:column; gap:6px;";

  const rows = [
    { label: "🛍️ ያልተላኩ ሽያጮች (Sales)", count: stats.sales },
    { label: "📦 ያልተላኩ የዕቃ መረጃዎች (Inventory)", count: stats.items },
    { label: "💸 ያልተላኩ ወጪዎች (Expenses)", count: stats.expenses },
    { label: "👤 ያልተላኩ የደንበኛ መረጃዎች (Customers)", count: stats.customers },
    { label: "🚚 ያልተላኩ የጭነት መረጃዎች (Shipments)", count: stats.shipments }
  ];

  rows.forEach((r) => {
    const rowEl = document.createElement("div");
    rowEl.style.cssText = "display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #f1f5f9;";
    rowEl.innerHTML = `<span>${r.label}</span> <strong style="color:${r.count > 0 ? '#d97706' : '#16a34a'}">${r.count > 0 ? `${r.count} ያልተላኩ` : '✓ ሁሉም ተልኳል'}</strong>`;
    breakdownBox.appendChild(rowEl);
  });

  content.appendChild(breakdownBox);

  // Last Synced Timestamp
  if (syncEngineState.lastSyncedAt) {
    const timeEl = document.createElement("div");
    timeEl.style.cssText = "font-size:11px; color:#64748b; margin-top:10px; text-align:right;";
    const d = new Date(syncEngineState.lastSyncedAt);
    timeEl.textContent = `የመጨረሻው ሲንክ: ${d.toLocaleTimeString("am-ET", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    content.appendChild(timeEl);
  }

  if (typeof openSheetFn === "function") {
    openSheetFn("⚡ ኦፍላይንና ሲንክሮናይዜሽን (Offline Sync)", function (body) {
      body.appendChild(content);
    }, function (close) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-primary";
      btn.style.cssText = "width:100%; padding:12px; font-weight:800; font-size:13.5px; display:flex; align-items:center; justify-content:center; gap:8px;";
      btn.innerHTML = "🔄 አሁኑኑ ወደ ኦንላይን ላክ (Sync Now)";
      btn.onclick = async () => {
        close();
        await performOnlineSync(getState, setState, showToast, true);
      };
      return btn;
    });
  }
}
