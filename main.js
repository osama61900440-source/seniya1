// main.js - Application UI, Interactions, and State Management
import {
  uid, todayISO, toCents, fmt, daysBetween, guarded,
  loadData, saveLocal, storageAvailable, storageErrorDetail,
  loadPrefs, savePrefs, applyPrefs, simpleHash,
  itemStock, itemSoldOutInfo, totalCapitalCents, inventoryValueCents,
  periodStats, dayStats, paymentBreakdown, expenseByCategory,
  verifyPaymentReconciliation, goalTrackerStats, capitalUtilizationStats,
  capitalAllocationPercent, getCapitalPool, calculateSequentialDeduction, recordCapitalInjection,
  getAllocatedFundBalances, syncAndGetDailyAllocations, saleCogsCents, cumulativeSoldProductCostCents,
  ethLabel, gregorianToEthiopian, freshProfile, freshLoanCenter, freshLocations, ETH_MONTHS, ETH_WEEKDAYS,
  EXPENSE_CATEGORIES, getExpenseCategories, BANK_NAMES, GOAL_MONTHLY_CENTS_DEFAULT, ACCENT_PRESETS, mergeOrAddItem, freshSalesSample,
  freshAllocations, freshSuppliers, freshCustomers, freshShipmentsSample, freshEmployees, freshItemsSample,
  getRegistrationHistoryInfo, getActiveStoreId
} from './core.js';
import { exportPrintableReport, exportPrintableReceipt, exportPrintableFreightReport, exportPrintableInventorySummary } from './report.js';
import { buildAuthContainer, resetAuthState, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_BOT_LINK } from './auth.js';
import {
  fetchUserFromFirestore,
  updateUserFullNameInFirestore,
  fetchShopFromFirestore,
  fetchSalesByStoreId,
  fetchInventoryByStoreId,
  fetchExpensesByStoreId,
  saveShopToFirestore,
  saveSaleToFirestore,
  saveExpenseToFirestore,
  saveInventoryItemToFirestore
} from './firebase.js';
import {
  initOfflineSyncEngine,
  performOnlineSync,
  createSyncStatusBadge,
  openSyncDetailsSheet,
  subscribeSyncStatus,
  ensureDataSyncFlags
} from './offlineSync.js';

export function el(tag, props, children) {
  var e = document.createElement(tag);
  props = props || {};
  for (var k in props) {
    if (!props.hasOwnProperty(k)) continue;
    var v = props[k];
    if (v === undefined || v === null) continue;
    if (k === "class") e.className = v;
    else if (k === "style" && typeof v === "object") { for (var s in v) e.style[s] = v[s]; }
    else if (k.indexOf("on") === 0 && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  children = children || [];
  if (!Array.isArray(children)) children = [children];
  children.forEach(function (c) {
    if (c === null || c === undefined || c === false) return;
    if (typeof c === "string" || typeof c === "number") e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  });
  return e;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function getActiveSessionPhone() {
  if (typeof window === "undefined") return "";
  try {
    var p = sessionStorage.getItem("user_phone") || sessionStorage.getItem("active_phone");
    if (p && p.trim() && p !== "0911000000") return p.trim();
    p = localStorage.getItem("user_phone") || localStorage.getItem("active_phone");
    if (p && p.trim() && p !== "0911000000") return p.trim();
    var sCur = sessionStorage.getItem("currentUser") || sessionStorage.getItem("authUser");
    if (sCur) {
      var parsed = JSON.parse(sCur);
      if (parsed && parsed.phone && parsed.phone !== "0911000000") return String(parsed.phone).trim();
    }
    var lCur = localStorage.getItem("currentUser") || localStorage.getItem("authUser");
    if (lCur) {
      var parsedL = JSON.parse(lCur);
      if (parsedL && parsedL.phone && parsedL.phone !== "0911000000") return String(parsedL.phone).trim();
    }
  } catch (e) {}
  return "";
}

export function getCurrentStoreId() {
  if (typeof window === "undefined") return "";
  try {
    var s = sessionStorage.getItem("current_store_id") || sessionStorage.getItem("store_id");
    if (s && s.trim()) return s.trim();
    s = localStorage.getItem("current_store_id") || localStorage.getItem("store_id");
    if (s && s.trim()) return s.trim();
    var sCur = sessionStorage.getItem("currentUser") || sessionStorage.getItem("authUser");
    if (sCur) {
      var p = JSON.parse(sCur);
      if (p && (p.store_id || p.storeId)) return String(p.store_id || p.storeId).trim();
    }
    var lCur = localStorage.getItem("currentUser") || localStorage.getItem("authUser");
    if (lCur) {
      var pL = JSON.parse(lCur);
      if (pL && (pL.store_id || pL.storeId)) return String(pL.store_id || pL.storeId).trim();
    }
    if (state && state.data && (state.data.store_id || state.data.storeId || state.data.shopId)) {
      return String(state.data.store_id || state.data.storeId || state.data.shopId).trim();
    }
  } catch (e) {}
  return "";
}

var prefs = loadPrefs();
var initialSessionPhone = getActiveSessionPhone();
var initialSessionStoreId = getCurrentStoreId();
var state = {
  data: loadData(initialSessionPhone, initialSessionStoreId),
  tab: "dashboard",
  tabHistory: [],
  locked: false,
  currentUser: (prefs && prefs.authUser) || null,
  currentStoreId: initialSessionStoreId
};
state.locked = !!(prefs.appLockEnabled && prefs.pinHash);

export function getCurrentUser() {
  var user = null;
  if (typeof window !== "undefined" && window.currentUser && typeof window.currentUser === "object") {
    user = Object.assign({}, window.currentUser);
  }
  if (!user && state && state.currentUser && typeof state.currentUser === "object") {
    user = Object.assign({}, state.currentUser);
  }
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      var sCur = sessionStorage.getItem("currentUser") || sessionStorage.getItem("authUser") || sessionStorage.getItem("auth_user");
      if (sCur) {
        var parsed = JSON.parse(sCur);
        if (parsed && typeof parsed === "object") {
          user = Object.assign({}, parsed, user || {});
        }
      }
      var sRole = sessionStorage.getItem("role") || sessionStorage.getItem("userRole");
      if (sRole) {
        if (!user) user = {};
        user.role = sRole;
      }
    } catch (e) {}
  }
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      var lCur = localStorage.getItem("currentUser") || localStorage.getItem("authUser") || localStorage.getItem("auth_user");
      if (lCur) {
        var parsedL = JSON.parse(lCur);
        if (parsedL && typeof parsedL === "object") {
          if (!user) user = parsedL;
          else if (!user.role && parsedL.role) user.role = parsedL.role;
        }
      }
      var lRole = localStorage.getItem("role") || localStorage.getItem("userRole");
      if (lRole && (!user || !user.role)) {
        if (!user) user = {};
        user.role = lRole;
      }
    } catch (e) {}
  }
  if ((!user || !user.role) && prefs && prefs.authUser) {
    if (!user) user = Object.assign({}, prefs.authUser);
    else if (!user.role) user.role = prefs.authUser.role;
  }
  if (!user) {
    user = {
      role: (state.data && state.data.profile && state.data.profile.ownerName) ? "admin" : "employee",
      name: (state.data && state.data.profile && state.data.profile.ownerName) || "የሱቅ ባለቤት"
    };
  }

  var activePhone = getActiveSessionPhone();
  if (activePhone) {
    user.phone = activePhone;
  } else if (user.phone === "0911000000") {
    user.phone = "";
  }

  var rawRole = String(user.role || "").toLowerCase().trim();
  var normalizedRole = "employee";

  if (
    rawRole === "admin" ||
    rawRole === "owner" ||
    rawRole === "administrator" ||
    rawRole === "superadmin" ||
    rawRole === "ባለቤት" ||
    rawRole === "የሱቅ ባለቤት" ||
    rawRole === "አስተዳዳሪ" ||
    user.isOwner === true
  ) {
    normalizedRole = "admin";
  } else {
    normalizedRole = "employee";
  }

  user.role = normalizedRole;
  if (normalizedRole === "employee") {
    var jobTitle = user.jobTitle || user.roleTitle || user.employeeRole;
    if (!jobTitle && state.data && Array.isArray(state.data.employees)) {
      var matchedEmp = state.data.employees.find(function (e) {
        return (user.id && e.id === user.id) || (user.phone && e.phone === user.phone) || (user.name && e.name === user.name);
      });
      if (matchedEmp) {
        jobTitle = matchedEmp.jobTitle || matchedEmp.roleTitle || matchedEmp.role;
      }
    }
    user.jobTitle = (jobTitle && String(jobTitle).trim()) || "ሰራተኛ";
    user.roleTitle = user.jobTitle;
  }
  if (!user.name) {
    user.name = normalizedRole === "admin"
      ? ((state.data && state.data.profile && state.data.profile.ownerName) || "የሱቅ ባለቤት")
      : "ሰራተኛ";
  }

  return user;
}

export function navigateToTab(tab, options) {
  var user = getCurrentUser();
  if (user && user.role === "employee" && (tab === "profile" || tab === "allocgoal")) {
    showToast("⛔ ይህ ክፍል ለአስተዳዳሪ ብቻ የተፈቀደ ነው");
    return;
  }
  var isFromSidebar = false;
  if (typeof options === "boolean") {
    isFromSidebar = options;
  } else if (options && typeof options === "object") {
    isFromSidebar = !!options.fromSidebar;
  }

  if (state.tab === tab) {
    if (isFromSidebar) state.fromSidebar = true;
    return;
  }
  if (!Array.isArray(state.tabHistory)) state.tabHistory = [];
  if (state.tabHistory[state.tabHistory.length - 1] !== state.tab) {
    state.tabHistory.push(state.tab);
  }
  state.tab = tab;
  state.fromSidebar = isFromSidebar;

  try {
    window.history.pushState({ tab: tab, fromSidebar: isFromSidebar }, "", "#" + tab);
  } catch (e) {}
  renderApp();
}

export function navigateBack() {
  var prevTab = (Array.isArray(state.tabHistory) && state.tabHistory.length > 0)
    ? state.tabHistory[state.tabHistory.length - 1]
    : null;

  // Level 1 Back Navigation logic:
  // Check if history stack is empty OR fromSidebar === true OR previous view was 'dashboard'
  var isLevel1Base = (!Array.isArray(state.tabHistory) || state.tabHistory.length === 0) ||
                     !!state.fromSidebar ||
                     (prevTab === "dashboard");

  if (isLevel1Base) {
    state.fromSidebar = false;
    if (Array.isArray(state.tabHistory) && state.tabHistory.length > 0 && prevTab === "dashboard") {
      state.tabHistory.pop();
    }
    openMainMenu();
    return;
  }

  // Deeper nested history stack (Level 2, 3, 4, 5) step-by-step back navigation
  if (Array.isArray(state.tabHistory) && state.tabHistory.length > 0) {
    var poppedTab = state.tabHistory.pop();
    while (poppedTab === state.tab && state.tabHistory.length > 0) {
      poppedTab = state.tabHistory.pop();
    }
    if (poppedTab && poppedTab !== state.tab) {
      state.tab = poppedTab;
      try {
        window.history.replaceState({ tab: state.tab }, "", "#" + state.tab);
      } catch (e) {}
      renderApp();
      return;
    }
  }

  state.fromSidebar = false;
  openMainMenu();
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", function (ev) {
    var overlays = document.querySelectorAll(".app .overlay");
    if (overlays && overlays.length > 0) {
      var topOverlay = overlays[overlays.length - 1];
      if (topOverlay) {
        topOverlay.remove();
        return;
      }
    }
    if (ev.state && ev.state.tab) {
      state.tab = ev.state.tab;
      renderApp();
    } else if (Array.isArray(state.tabHistory) && state.tabHistory.length > 0) {
      state.tab = state.tabHistory.pop();
      renderApp();
    } else {
      state.tab = "dashboard";
      renderApp();
    }
  });
}

function syncShopToFirestore(data) {
  if (!data) return;
  var sessionPhone = getActiveSessionPhone();
  var currentStoreId = getCurrentStoreId();
  var ownerPhone = sessionPhone || data.ownerPhoneNumber || (data.profile && data.profile.phone) || "";
  if (ownerPhone === "0911000000") ownerPhone = "";
  var shopId = currentStoreId || data.store_id || data.storeId || data.shopId || (ownerPhone ? ("store_" + ownerPhone) : "store_default");
  var ownerPin = data.ownerPin || "";
  var shopName = (data.profile && data.profile.shopName) || "የእኔ ሱቅ";

  var employeesPayload = (data.employees || []).map(function (e) {
    return {
      id: e.id || uid(),
      name: e.name || "",
      phone: (e.phone || "").replace(/\s+/g, ""),
      pin: e.pin || "",
      role: e.role || "cashier",
      permissions: Array.isArray(e.permissions) ? e.permissions : ["sales"],
      status: e.status || "active",
      salaryCents: e.salaryCents || 0,
      createdAt: e.createdAt || Date.now()
    };
  });

  var fullPayload = {
    userId: ownerPhone,
    phone: ownerPhone,
    store_id: shopId,
    storeId: shopId,
    shopId: shopId,
    name: shopName,
    ownerPhoneNumber: ownerPhone,
    owner_phone: ownerPhone,
    ownerPin: ownerPin,
    employees: employeesPayload,
    inventory: data.items || [],
    sales: data.sales || [],
    expenses: data.expenses || [],
    shipments: data.shipments || [],
    customers: data.customers || [],
    profile: data.profile || {},
    updatedAt: Date.now()
  };

  if (ownerPhone) {
    fetch("/api/users/" + encodeURIComponent(ownerPhone), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fullPayload)
    }).catch(function (err) {
      console.warn("User shop sync error:", err);
    });
  }

  fetch("/api/shop/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fullPayload)
  }).catch(function (err) {
    console.warn("Shop sync offline or fallback:", err);
  });

  // Direct Firestore Store Persistence: shops/{store_id}
  if (shopId) {
    saveShopToFirestore(fullPayload).catch(function () {});
  }

  if (typeof window !== "undefined" && window.firebase && window.firebase.firestore) {
    try {
      var db = window.firebase.firestore();
      if (ownerPhone) {
        db.collection("users").doc(ownerPhone).set(fullPayload, { merge: true }).catch(function () {});
      }
    } catch (e) {}
  }
}

function setData(mutator) {
  var oldSales = (state.data && state.data.sales) ? state.data.sales.slice() : [];
  var oldItems = (state.data && state.data.items) ? state.data.items.slice() : [];
  var oldExpenses = (state.data && state.data.expenses) ? state.data.expenses.slice() : [];
  var oldCustomers = (state.data && state.data.customers) ? state.data.customers.slice() : [];
  var oldShipments = (state.data && state.data.shipments) ? state.data.shipments.slice() : [];

  state.data = mutator(state.data);

  // Auto-flag newly inserted or modified items as synced: false unless explicitly marked synced: true
  var markUnsynced = function (coll, oldColl) {
    if (!Array.isArray(coll)) return;
    var oldMap = {};
    (oldColl || []).forEach(function (x) { if (x && x.id) oldMap[x.id] = x; });
    coll.forEach(function (item) {
      if (!item || typeof item !== "object") return;
      var prev = item.id ? oldMap[item.id] : null;
      if (!prev) {
        if (item.synced === undefined) item.synced = false;
      } else {
        if (item.synced === undefined) {
          item.synced = prev.synced !== undefined ? prev.synced : true;
        }
      }
    });
  };

  markUnsynced(state.data.sales, oldSales);
  markUnsynced(state.data.items, oldItems);
  markUnsynced(state.data.expenses, oldExpenses);
  markUnsynced(state.data.customers, oldCustomers);
  markUnsynced(state.data.shipments, oldShipments);

  var activePhone = getActiveSessionPhone();
  var currentStoreId = getCurrentStoreId();
  if (currentStoreId) {
    state.data.store_id = currentStoreId;
    state.data.storeId = currentStoreId;
    state.data.shopId = currentStoreId;
  }

  saveLocal(state.data, activePhone, currentStoreId);

  if (typeof navigator !== "undefined" && navigator.onLine) {
    performOnlineSync(function () { return state; }, function (newData) { state.data = newData; renderApp(); }, showToast, false);
  } else {
    state.data.needsFullSync = true;
    syncShopToFirestore(state.data);
  }

  renderApp();
}

export function showToast(msg) {
  var appEl = document.querySelector(".app") || document.body; if (!appEl) return;
  var old = appEl.querySelector(".toast"); if (old) old.remove();
  var t = el("div", { class: "toast" }, msg);
  appEl.appendChild(t);
  setTimeout(function () { t.remove(); }, 2500);
}

function openSheet(title, bodyBuilder, footerBuilder, isWide, options) {
  var opts = {};
  if (typeof options === "object" && options !== null) {
    opts = options;
  } else if (typeof isWide === "object" && isWide !== null) {
    opts = isWide;
  } else if (typeof footerBuilder === "object" && footerBuilder !== null && typeof footerBuilder !== "function") {
    opts = footerBuilder;
  }
  var actualIsWide = (typeof isWide === "boolean") ? isWide : !!opts.isWide;

  var overlay = el("div", { class: "overlay" + (actualIsWide ? " wide-overlay" : "") });
  var bg = el("div", { class: "overlay-bg", onclick: function () { close(true); } });
  var body = el("div", { class: "sheet-body" });
  var footerWrap = el("div", { class: "sheet-footer" });

  function close(isBack) {
    overlay.remove();
    if (isBack !== false && opts && opts.fromSidebar) {
      openMainMenu();
    }
  }

  var headerEl = title ? el("div", { class: "sheet-header" }, [
    el("button", { class: "sheet-back", "aria-label": "ወደ ኋላ ተመለስ", title: "ወደ ኋላ ተመለስ", onclick: function () { close(true); } }, "←"),
    el("h2", {}, title)
  ]) : null;
  var sheetEl = el("div", { class: "sheet" + (actualIsWide ? " sheet-wide" : "") }, [
    headerEl,
    body, footerWrap
  ].filter(Boolean));
  overlay.appendChild(bg); overlay.appendChild(sheetEl);

  function refreshFooter() { clear(footerWrap); if (footerBuilder) footerWrap.appendChild(footerBuilder(close, refreshFooter)); }
  bodyBuilder(body, close, refreshFooter);
  if (footerBuilder) refreshFooter(); else footerWrap.remove();
  document.querySelector(".app").appendChild(overlay);
  return { close: close };
}

function confirmModal(message, onConfirm, onCancel, options) {
  options = options || {};
  var title = options.title || "⚠️ ማረጋገጫ";
  var confirmText = options.confirmText || "ይሰረዝ";
  var cancelText = options.cancelText || "ተመለስ";

  var overlay = el("div", {
    class: "overlay",
    style: {
      zIndex: "9999",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)",
      background: "rgba(15, 23, 42, 0.45)"
    }
  });
  var bg = el("div", { class: "overlay-bg", onclick: cancel });
  var modalEl = el("div", {
    class: "card",
    style: {
      position: "relative",
      zIndex: "10000",
      maxWidth: "360px",
      width: "100%",
      padding: "22px 20px",
      background: "#ffffff",
      borderRadius: "18px",
      boxShadow: "0 20px 25px -5px rgba(0,0,0,.25)",
      textAlign: "center",
      border: "1px solid #e2e8f0"
    }
  }, [
    el("div", { style: { fontSize: "32px", marginBottom: "8px" } }, "⚠️"),
    el("div", {
      style: {
        fontSize: "16px",
        fontWeight: "800",
        color: "#1e293b",
        marginBottom: "8px"
      }
    }, title),
    el("div", {
      style: {
        fontSize: "13.5px",
        color: "#475569",
        marginBottom: "20px",
        lineHeight: "1.4"
      }
    }, message),
    el("div", { class: "flex gap2", style: { justifyContent: "center" } }, [
      el("button", {
        class: "btn btn-outline",
        style: { flex: "1", padding: "10px 14px", justifyContent: "center", fontSize: "13px", fontWeight: "700", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1" },
        onclick: cancel
      }, cancelText),
      el("button", {
        class: "btn btn-danger",
        style: {
          flex: "1",
          padding: "10px 14px",
          justifyContent: "center",
          fontSize: "13px",
          background: "#dc2626",
          color: "#ffffff",
          fontWeight: "800",
          border: "none",
          boxShadow: "0 2px 6px rgba(220, 38, 38, 0.3)"
        },
        onclick: confirm
      }, confirmText)
    ])
  ]);

  function close() { overlay.remove(); }
  function cancel() { close(); if (typeof onCancel === "function") onCancel(); }
  function confirm() { close(); if (typeof onConfirm === "function") onConfirm(); }

  overlay.appendChild(bg);
  overlay.appendChild(modalEl);
  var appEl = document.querySelector(".app") || document.body;
  appEl.appendChild(overlay);
  return { close: close };
}

function showConfirmationDialog(title, message, onConfirm) {
  return confirmModal(message, onConfirm, null, { title: title, confirmText: "ይሰረዝ", cancelText: "ተመለስ" });
}

/**
 * Modern Custom Searchable Dropdown Select Component
 * Replaces native HTML <select> with a clean, searchable, styled picker
 */
function createCustomSelect(cfg) {
  var options = Array.isArray(cfg.options) ? cfg.options : [];
  var selectedValue = cfg.value !== undefined && cfg.value !== null ? String(cfg.value) : "";
  var placeholder = cfg.placeholder || "-- ይምረጡ --";
  var labelText = cfg.label || placeholder;
  var changeListeners = [];

  function normalizeOption(opt) {
    if (typeof opt === "string") {
      return { value: opt, label: opt, sub: "", badge: "" };
    }
    if (!opt) return { value: "", label: "", sub: "", badge: "" };
    return {
      value: String(opt.value !== undefined ? opt.value : ""),
      label: opt.label || opt.name || opt.value || "",
      sub: opt.sub || (opt.code ? ("ኮድ: " + opt.code) : "") || (opt.stock !== undefined ? ("ስቶክ: " + opt.stock) : "") || "",
      badge: opt.badge || (opt.price !== undefined ? opt.price : "") || "",
      disabled: !!opt.disabled
    };
  }

  var normOptions = options.map(normalizeOption);

  function getSelectedOption() {
    return normOptions.find(function (o) { return o.value === selectedValue; });
  }

  var container = el("div", {
    class: "custom-select-wrapper " + (cfg.class || ""),
    style: Object.assign({ width: "100%", position: "relative" }, cfg.style || {})
  });

  var trigger = el("button", {
    type: "button",
    class: "custom-select-trigger input",
    style: {
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      cursor: "pointer",
      textAlign: "left",
      background: "#ffffff",
      borderRadius: "12px",
      border: "1.5px solid #cbd5e1",
      padding: "9px 12px",
      fontSize: "13.5px",
      fontWeight: "600",
      color: "#1e293b",
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
      transition: "border-color 0.15s, box-shadow 0.15s"
    }
  });

  var textSpan = el("span", {
    style: { flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
  });

  var chevron = el("span", {
    style: { color: "#64748b", fontSize: "12px", flexShrink: "0" }
  }, "▾");

  trigger.appendChild(textSpan);
  trigger.appendChild(chevron);
  container.appendChild(trigger);

  function updateTriggerDisplay() {
    var cur = getSelectedOption();
    if (cur && cur.value) {
      textSpan.textContent = cur.label;
      textSpan.style.color = "#0f172a";
      textSpan.style.fontWeight = "700";
    } else {
      textSpan.textContent = placeholder;
      textSpan.style.color = "#94a3b8";
      textSpan.style.fontWeight = "500";
    }
  }

  function openDropdown() {
    openSheet(labelText, function (body, close) {
      var searchWrap = el("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "#f8fafc",
          border: "1.5px solid #cbd5e1",
          borderRadius: "12px",
          padding: "8px 12px",
          marginBottom: "12px"
        }
      });
      var searchIcon = el("span", { style: { color: "#64748b", fontSize: "14px" } }, "🔍");
      var searchInput = el("input", {
        type: "text",
        placeholder: "ፈልግ (በስም፣ በኮድ ወይም በምድብ)...",
        style: {
          border: "none",
          outline: "none",
          background: "transparent",
          width: "100%",
          fontSize: "13.5px",
          fontWeight: "600"
        }
      });
      searchWrap.appendChild(searchIcon);
      searchWrap.appendChild(searchInput);
      body.appendChild(searchWrap);

      var listContainer = el("div", {
        style: {
          maxHeight: "380px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "4px"
        }
      });
      body.appendChild(listContainer);

      function renderList(query) {
        clear(listContainer);
        var q = (query || "").trim().toLowerCase();
        var filtered = normOptions.filter(function (opt) {
          if (!q) return true;
          return (opt.label || "").toLowerCase().includes(q) ||
                 (opt.sub || "").toLowerCase().includes(q) ||
                 (opt.badge || "").toLowerCase().includes(q);
        });

        if (filtered.length === 0) {
          listContainer.appendChild(el("div", {
            style: { textAlign: "center", padding: "24px 12px", color: "#94a3b8", fontSize: "13px" }
          }, "ምንም አማራጭ አልተገኘም"));
          return;
        }

        filtered.forEach(function (opt) {
          var isSelected = opt.value === selectedValue;
          var itemBtn = el("button", {
            type: "button",
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "11px 14px",
              background: isSelected ? "#eff6ff" : "#ffffff",
              border: isSelected ? "1.5px solid #3b82f6" : "1px solid #f1f5f9",
              borderRadius: "12px",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.12s ease",
              marginBottom: "4px"
            }
          });

          var leftCol = el("div", { style: { flex: "1", minWidth: "0" } });
          var mainText = el("div", {
            style: {
              fontWeight: isSelected ? "800" : "700",
              fontSize: "13.5px",
              color: isSelected ? "#1d4ed8" : "#1e293b",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }
          }, opt.label);
          leftCol.appendChild(mainText);

          if (opt.sub) {
            var subText = el("div", {
              style: { fontSize: "11.5px", color: "#64748b", marginTop: "2px" }
            }, opt.sub);
            leftCol.appendChild(subText);
          }
          itemBtn.appendChild(leftCol);

          var rightCol = el("div", {
            style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" }
          });
          if (opt.badge) {
            var badgeEl = el("span", {
              style: {
                background: isSelected ? "#dbeafe" : "#f1f5f9",
                color: isSelected ? "#1e40af" : "#475569",
                padding: "3px 8px",
                borderRadius: "8px",
                fontSize: "11.5px",
                fontWeight: "700"
              }
            }, opt.badge);
            rightCol.appendChild(badgeEl);
          }
          if (isSelected) {
            var checkEl = el("span", { style: { color: "#2563eb", fontWeight: "900", fontSize: "15px" } }, "✓");
            rightCol.appendChild(checkEl);
          }
          itemBtn.appendChild(rightCol);

          itemBtn.addEventListener("click", function () {
            selectedValue = opt.value;
            updateTriggerDisplay();
            close();
            if (typeof cfg.onChange === "function") cfg.onChange(opt.value, opt);
            changeListeners.forEach(function (fn) { fn({ target: { value: opt.value } }); });
          });

          listContainer.appendChild(itemBtn);
        });
      }

      searchInput.addEventListener("input", function () {
        renderList(searchInput.value);
      });

      renderList("");
      setTimeout(function () { searchInput.focus(); }, 120);
    });
  }

  trigger.addEventListener("click", openDropdown);
  updateTriggerDisplay();

  // API compatible with standard select
  Object.defineProperty(container, "value", {
    get: function () { return selectedValue; },
    set: function (newVal) {
      selectedValue = String(newVal !== undefined && newVal !== null ? newVal : "");
      updateTriggerDisplay();
    }
  });

  container.setValue = function (newVal) {
    selectedValue = String(newVal !== undefined && newVal !== null ? newVal : "");
    updateTriggerDisplay();
  };

  container.setOptions = function (newOpts) {
    normOptions = (newOpts || []).map(normalizeOption);
    updateTriggerDisplay();
  };

  container.addEventListener = function (type, fn) {
    if (type === "change") {
      changeListeners.push(fn);
    } else {
      trigger.addEventListener(type, fn);
    }
  };

  return container;
}

function Field(labelText, required, inputEl) {
  return el("div", { class: "field" }, [el("label", {}, labelText + (required ? " *" : "")), inputEl]);
}

function renderAllocationBlock(profitCents, allocations, periodLabel) {
  var wrap = el("div", {});
  wrap.appendChild(el("div", { style: { fontSize: "11px", color: "#94a3b8", marginBottom: "8px" } },
    periodLabel + " ትርፍ (" + fmt(profitCents) + ")"));
  if (profitCents <= 0) {
    wrap.appendChild(el("div", { style: { fontSize: "12px", color: "#b45309", background: "#fffbeb", padding: "10px", borderRadius: "10px" } },
      "⚠️ በዚህ ጊዜ ውስጥ ትርፍ ስላልተገኘ (" + fmt(profitCents) + ") የትርፍ ክፍፍል አይሰላም። ኪሳራ/ወጪ በመቶኛ መከፋፈል ትክክል ስላልሆነ ተትቷል።"));
    return wrap;
  }
  var totalPct = allocations.reduce(function (s, a) { return s + Number(a.percent); }, 0);
  if (allocations.length === 0) {
    wrap.appendChild(el("div", { class: "empty" }, "ምንም ክፍፍል አልተዘጋጀም"));
  } else {
    allocations.forEach(function (a) {
      var amt = Math.round(profitCents * (Number(a.percent) / 100));
      wrap.appendChild(el("div", { class: "list-row" }, [
        el("span", {}, a.name + " (" + a.percent + "%)"),
        el("span", { style: { fontWeight: "700", color: "#1e293b" } }, fmt(amt))
      ]));
    });
    if (Math.abs(totalPct - 100) > 0.01) {
      wrap.appendChild(el("div", { style: { fontSize: "10.5px", color: "#f59e0b", marginTop: "6px" } }, "⚠️ ጠቅላላ መቶኛ " + totalPct + "% ነው (100% አይደለም)"));
    }
  }
  return wrap;
}

function renderGoalTrackerBlock(gt) {
  var wrap = el("div", {});
  wrap.appendChild(el("div", { class: "eyebrow mb2" }, ethLabel(gt.ethYear, gt.ethMonth) + " — ቀን " + gt.daysElapsed + " / " + gt.totalDaysInMonth));
  var pctBarColor = gt.onTrack ? "#16a34a" : "#ef4444";
  wrap.appendChild(el("div", { class: "mb2" }, [
    el("div", { class: "flex items-center justify-between", style: { fontSize: "11px", color: "#64748b", marginBottom: "4px" } }, [
      el("span", {}, "የወርሃዊ ግብ እድገት"), el("span", { style: { fontWeight: "700" } }, gt.pctOfMonthlyGoal + "%")
    ]),
    el("div", { class: "progress-track" }, [el("div", { class: "progress-fill", style: { width: gt.pctOfMonthlyGoal + "%", background: pctBarColor } })])
  ]));
  wrap.appendChild(el("div", { style: { fontSize: "10.5px", color: "#94a3b8", marginBottom: "6px" } },
    "🔗 መነሻ: " + gt.capitalPct + "% ካፒታል ክፍፍል × የ" + ethLabel(gt.ethYear, gt.ethMonth) + " ትክክለኛ ትርፍ (" + fmt(gt.monthProfitCents) + ") — ከምንም ያልተነሳ፣ ራሱ ከመዝገቡ የተሰላ።"));
  wrap.appendChild(el("div", { class: "list-row" }, [el("span", {}, "የወር ግብ"), el("span", { style: { fontWeight: "700" } }, fmt(gt.monthlyGoalCents))]));
  wrap.appendChild(el("div", { class: "list-row" }, [el("span", {}, "እስካሁን ማግኘት የነበረበት (ግቡ በቀናት ተከፋፍሎ)"), el("span", { style: { fontWeight: "700" } }, fmt(gt.paceToDateCents))]));
  wrap.appendChild(el("div", { class: "list-row" }, [el("span", {}, "እስካሁን ወደ ካፒታል የተመደበው (" + gt.capitalPct + "% ከትርፍ)"), el("span", { style: { fontWeight: "700", color: gt.actualCents >= 0 ? "#16a34a" : "#dc2626" } }, fmt(gt.actualCents))]));
  wrap.appendChild(el("div", { class: "mt2" }, [
    gt.onTrack
      ? el("div", { class: "goal-ok" }, "✅ በእቅዱ መሰረት እየሄዱ ነው!")
      : el("div", { class: "goal-warning" }, "⚠️ ግብ አልተሳካም! ጉድለት: " + fmt(gt.shortfallCents))
  ]));
  return wrap;
}

function renderCapitalUtilizationBlock(cu) {
  var wrap = el("div", {});
  wrap.appendChild(el("div", { class: "eyebrow mb2" }, cu.label));
  wrap.appendChild(el("div", { style: { fontSize: "11px", color: "#64748b", marginBottom: "8px", lineHeight: "1.5" } },
    "* 'ለስራ/ለዕቃ መግዣ የዋለው' የሚሰላው ከውስጥ ትርፍ ቋቶች በተከፈሉ አዲስ የዕቃ ግዢ ደረሰኞች ድምር ብቻ ነው። ከውጫዊ/ከተጨመረ ካፒታል የተገዙ ዕቃዎች በቋቱ ስሌት ላይ አይካተቱም።"));
  wrap.appendChild(el("div", { class: "list-row" }, [el("span", {}, "ለካፒታል የተመደበ (" + cu.capitalPct + "%)"), el("span", { style: { fontWeight: "700" } }, fmt(cu.allocatedCents))]));
  wrap.appendChild(el("div", { class: "list-row" }, [el("span", {}, "✅ ለስራ/ለዕቃ መግዣ የዋለ (ከቋት)"), el("span", { style: { fontWeight: "700", color: "#16a34a" } }, fmt(cu.usedCents))]));
  wrap.appendChild(el("div", { class: "list-row" + (cu.idleCents > 0 ? " out" : "") }, [el("span", {}, "🕒 ያልተጠቀሙበት / በእጅ ያለ ካፒታል"), el("span", { style: { fontWeight: "700", color: cu.idleCents > 0 ? "#16a34a" : "#64748b" } }, fmt(cu.idleCents))]));
  if (cu.overageCents > 0) {
    wrap.appendChild(el("div", { class: "list-row" }, [el("span", {}, "ℹ️ ከመድቡ በላይ የተገዛ (ከመሠረት ካፒታል የተሸፈነ)"), el("span", { style: { fontWeight: "700", color: "#8b5cf6" } }, fmt(cu.overageCents))]));
  }
  if (cu.externalUsedCents > 0) {
    wrap.appendChild(el("div", { class: "list-row" }, [el("span", {}, "➕ ከውጫዊ/ከተጨመረ ካፒታል የተገዛ"), el("span", { style: { fontWeight: "700", color: "#2563eb" } }, fmt(cu.externalUsedCents))]));
  }
  if (cu.returnedCogsUsedCents > 0) {
    wrap.appendChild(el("div", { class: "list-row" }, [el("span", {}, "🔄 ከተመለሰ ካፒታል (COGS) የተገዛ"), el("span", { style: { fontWeight: "700", color: "#0891b2" } }, fmt(cu.returnedCogsUsedCents))]));
  }
  wrap.appendChild(el("div", { class: "progress-track mt2" }, [el("div", { class: "progress-fill", style: { width: cu.usedPct + "%", background: cu.usedPct >= 70 ? "#16a34a" : cu.usedPct >= 30 ? "#f59e0b" : "#ef4444" } })]));
  wrap.appendChild(el("div", { style: { fontSize: "10.5px", color: "#64748b", marginTop: "4px", textAlign: "right" } }, cu.usedPct + "% ስራ ላይ ውሏል (" + (cu.purchaseCount || 0) + " ግዢ ደረሰኞች)"));

  var quickBtn = el("button", {
    class: "btn btn-outline btn-sm mt2",
    style: { width: "100%", fontSize: "11px", justifyContent: "center" }
  }, "🚚 አዲስ የዕቃ ጭነት / ግዢ መዝግብ");
  quickBtn.addEventListener("click", function () {
    openReceiveShipmentSheet();
  });
  wrap.appendChild(quickBtn);

  return wrap;
}

function renderDashboard(container) {
  var data = state.data;
  var stats = periodStats(data, "day");
  var lowStock = data.items.filter(function (i) { var s = itemStock(data, i.id); return s > 0 && s <= 5; });
  var outStock = data.items.filter(function (i) { return itemStock(data, i.id) <= 0; });

  var totalAsset = totalCapitalCents(data);

  var totalAssetCard = el("div", { class: "card section", style: { background: "linear-gradient(135deg, #6d28d9 0%, #4c1d95 100%)", color: "#ffffff", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 10px 25px -5px rgba(109, 40, 217, 0.3)" } }, [
    el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, [
      el("div", {}, [
        el("div", { style: { fontSize: "13px", fontWeight: "600", color: "#ddd6fe", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" } }, "💎 ጠቅላላ እሴት (TOTAL ASSET)"),
        el("div", { style: { fontSize: "28px", fontWeight: "900", color: "#ffffff" } }, fmt(totalAsset)),
        el("div", { style: { fontSize: "11.5px", color: "#e9d5ff", marginTop: "4px" } }, "የእቃዎች ጠቅላላ የመሸጫ እሴት (ካፒታል + የሚጠበቅ ትርፍ)")
      ]),
      el("div", { style: { width: "48px", height: "48px", borderRadius: "12px", background: "rgba(255, 255, 255, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" } }, "🏛️")
    ])
  ]);
  container.appendChild(totalAssetCard);

  var row1 = el("div", { class: "grid2 section" });
  row1.appendChild(el("div", { class: "card-compact green" }, [
    el("div", { class: "card-label" }, "🧾 የዛሬ ሽያጭ"),
    el("div", { class: "card-value" }, fmt(stats.revenue))
  ]));
  var expCardCompact = el("div", { class: "card-compact red" }, [
    el("div", { class: "card-label" }, "📉 የዛሬ ወጪ"),
    el("div", { class: "card-value" }, fmt(stats.expenseTotal))
  ]);
  expCardCompact.addEventListener("click", function() { openAddExpenseModal(); });
  row1.appendChild(expCardCompact);
  container.appendChild(row1);

  var row2 = el("div", { class: "grid2 section" });
  row2.appendChild(el("div", { class: "card-compact teal" }, [
    el("div", { class: "card-label" }, "📈 የተጣራ ትርፍ"),
    el("div", { class: "card-value", style: { color: stats.profit >= 0 ? "#0f766e" : "#dc2626" } }, fmt(stats.profit))
  ]));
  row2.appendChild(el("div", { class: "card-compact orange" }, [
    el("div", { class: "card-label" }, "⚠️ ያለቁ ዕቃዎች"),
    el("div", { class: "card-value" }, outStock.length + " እቃዎች")
  ]));
  container.appendChild(row2);

  // Calculate Today's Credit Sales
  var todayCreditSales = (data.sales || []).filter(function (s) {
    return s.date === todayISO() && s.paymentMethod === "credit";
  });
  var todayUnpaidCreditCents = todayCreditSales.reduce(function (sum, s) {
    var rem = s.creditRemainingCents !== undefined ? s.creditRemainingCents : (s.paid ? 0 : s.totalCents);
    return sum + (rem > 0 ? rem : 0);
  }, 0);

  var highlightsRow = el("div", { class: "grid2 section" });

  var topSellingCard = el("div", { class: "card amber", style: { margin: "0" } }, [
    el("div", { class: "card-label", style: { color: "#b45309" } }, "🔥 የዛሬ በጣም የተሸጠው"),
    el("div", { class: "card-value", style: { color: "#78350f", fontSize: "14px", lineHeight: "1.3", marginTop: "4px" } }, stats.topName ? (stats.topName + " (" + stats.topQty + ")") : "ምንም አልተሸጠም")
  ]);

  var creditCard = el("div", {
    class: "card",
    style: {
      margin: "0",
      background: "#fff7ed",
      borderColor: "#fdba74",
      cursor: "pointer"
    }
  }, [
    el("div", { class: "card-label", style: { color: "#c2410c" } }, "💳 በዱቤ የተሸጠ"),
    el("div", { class: "card-value", style: { color: "#9a3412" } }, fmt(todayUnpaidCreditCents)),
    el("div", { style: { fontSize: "11px", color: "#ea580c", marginTop: "2px" } }, todayCreditSales.length + " ዱቤዎች")
  ]);
  creditCard.addEventListener("click", openCustomerCreditSheet);

  highlightsRow.appendChild(topSellingCard);
  highlightsRow.appendChild(creditCard);
  container.appendChild(highlightsRow);

  if (lowStock.length > 0 || outStock.length > 0) {
    var warnCard = el("div", { class: "card section", style: { borderColor: "#fb923c" } });
    warnCard.appendChild(el("div", { class: "card-label", style: { color: "#ea580c", marginBottom: "8px" } }, "⚠️ ያለቁ / የሚያልቁ ዕቃዎች"));
    outStock.forEach(function (i) { warnCard.appendChild(el("div", { class: "list-row out" }, [el("span", {}, i.name), el("span", { class: "badge out" }, "አልቋል")])); });
    lowStock.forEach(function (i) { warnCard.appendChild(el("div", { class: "list-row" }, [el("span", {}, i.name), el("span", { class: "badge" }, "ቀሪ ስቶክ: " + itemStock(data, i.id))])); });
    container.appendChild(warnCard);
  }
}

function openEditCapitalModal() {
  var input;
  openSheet("የመነሻ ካፒታል አርም", function (body) {
    body.appendChild(el("div", { class: "helpmsg" }, "ይህ ከዕቃ ክምችት ውጭ ያለ ተጨማሪ ገንዘብ (ካሽ) ነው። የዕቃ ክምችት ዋጋ ራሱ ዕቃ ሲገባ/ሲሸጥ ራሱ ስለሚታሰብ፣ እዚህ የያዙትን ተጨማሪ የመነሻ ገንዘብ ብቻ ያስተካክሉ።"));
    input = el("input", { class: "input", type: "number", step: "0.01", value: (state.data.baseCapitalCents / 100).toFixed(2) });
    body.appendChild(input);
  }, function (close) {
    var btn = el("button", { class: "btn btn-primary" }, "አስቀምጥ");
    btn.addEventListener("click", guarded(function () { setData(function (d) { d.baseCapitalCents = toCents(input.value); return d; }); close(); }));
    return btn;
  });
}

function openInjectCapitalModal() {
  var amountInput, sourceSelect, methodSelect, bankSelect, bankField, dateInput, noteInput, errBox;

  openSheet("+ አዲስ ካፒታል ጨምር (Inject Capital)", function (body) {
    body.appendChild(el("div", { class: "helpmsg" },
      "ከሱቁ ሽያጭ ውጭ ከኪስ፣ ከብድር ወይም ከአጋር የተጨመረ አዲስ ገንዘብ (ውጫዊ ካፒታል) እዚህ ይመዝግቡ። ይህ ገንዘብ በቀጥታ ወደ 'ውጫዊ/የተጨመረ ካፒታል' ገቢ ሆኖ ለዕቃ ግዢ ይውላል።"
    ));

    amountInput = el("input", { class: "input", type: "number", step: "0.01", min: "1", placeholder: "0.00" });

    sourceSelect = el("select", { class: "input" }, [
      el("option", { value: "የግል ቁጠባ (Personal Savings)" }, "የግል ቁጠባ (Personal Savings)"),
      el("option", { value: "ተጨማሪ የባለቤት ኢንቨስትመንት (Owner Equity)" }, "ተጨማሪ የባለቤት ኢንቨስትመንት (Owner Equity)"),
      el("option", { value: "የባንክ ብድር (Bank Loan / Credit)" }, "የባንክ ብድር (Bank Loan / Credit)"),
      el("option", { value: "የአጋር / ባለድርሻ ፈንድ (Partner Contribution)" }, "የአጋር / ባለድርሻ ፈንድ (Partner Contribution)"),
      el("option", { value: "ሌላ ውጫዊ ምንጭ (Other External Source)" }, "ሌላ ውጫዊ ምንጭ (Other External Source)")
    ]);

    methodSelect = el("select", { class: "input" }, [
      el("option", { value: "cash" }, "ካሽ በእጅ (Cash)"),
      el("option", { value: "bank" }, "በባንክ ገቢ (Bank Transfer)")
    ]);

    bankSelect = el("select", { class: "input" });
    BANK_NAMES.forEach(function (b) { bankSelect.appendChild(el("option", { value: b }, b)); });
    bankField = Field("የባንክ ስም", true, bankSelect);
    bankField.style.display = "none";

    methodSelect.addEventListener("change", function () {
      bankField.style.display = methodSelect.value === "bank" ? "block" : "none";
    });

    dateInput = el("input", { class: "input", type: "date", value: todayISO() });
    noteInput = el("input", { class: "input", placeholder: "ማስታወሻ ወይም የደረሰኝ ቁጥር (ካለ)" });
    errBox = el("div", { class: "errmsg" });

    body.appendChild(Field("የካፒታል መጠን (ብር)", true, amountInput));
    body.appendChild(Field("የካፒታል ምንጭ", true, sourceSelect));
    body.appendChild(Field("የክፍያ ዘዴ", true, methodSelect));
    body.appendChild(bankField);
    body.appendChild(Field("የገባበት ቀን", true, dateInput));
    body.appendChild(Field("ማስታወሻ / ማብራሪያ", false, noteInput));
    body.appendChild(errBox);
  }, function (close) {
    var btn = el("button", { class: "btn btn-primary" }, "💾 ካፒታል መዝግብ");
    btn.addEventListener("click", guarded(function () {
      var amt = toCents(amountInput.value);
      if (amt <= 0) {
        errBox.textContent = "እባክዎ ትክክለኛ የካፒታል መጠን ያስገቡ (ከ0 በላይ)";
        return;
      }
      setData(function (d) {
        recordCapitalInjection(
          d,
          amt,
          dateInput.value || todayISO(),
          sourceSelect.value,
          methodSelect.value,
          methodSelect.value === "bank" ? bankSelect.value : "",
          noteInput.value.trim()
        );
        return d;
      });
      showToast("✓ አዲስ ካፒታል (" + fmt(amt) + ") በተሳካ ሁኔታ ተጨምሯል!");
      close();
      renderApp();
    }));
    return btn;
  });
}

function openInjectedCapitalHistorySheet() {
  openSheet("📜 የታከለ ካፒታል ታሪክ (Capital Injections)", function (body, close) {
    var injections = Array.isArray(state.data.capitalInjections) ? state.data.capitalInjections : [];
    var totalInj = injections.reduce(function (s, x) { return s + (x.amountCents || 0); }, 0);

    body.appendChild(el("div", { class: "card section", style: { background: "#f8fafc", borderColor: "#cbd5e1" } }, [
      el("div", { class: "card-label", style: { color: "#475569" } }, "ጠቅላላ የታከለ ውጫዊ ካፒታል"),
      el("div", { class: "card-value", style: { color: "#0f172a" } }, fmt(totalInj)),
      el("div", { style: { fontSize: "12px", color: "#64748b", marginTop: "4px" } }, "የተመዘገቡ ጭማሪዎች ድምር: " + injections.length)
    ]));

    var addBtn = el("button", { class: "btn btn-primary btn-block mb3" }, "+ አዲስ ካፒታል ጨምር");
    addBtn.addEventListener("click", function () { close(); openInjectCapitalModal(); });
    body.appendChild(addBtn);

    if (injections.length === 0) {
      body.appendChild(el("div", { class: "empty", style: { padding: "30px 10px" } }, "📭 እስካሁን የተመዘገበ ውጫዊ ካፒታል የለም።"));
      return;
    }

    injections.forEach(function (inj) {
      var row = el("div", { class: "item-row", style: { padding: "10px 12px" } });
      row.appendChild(el("div", { class: "flex items-center justify-between" }, [
        el("div", {}, [
          el("div", { style: { fontWeight: "700", color: "#1e293b" } }, inj.source || "ውጫዊ ካፒታል"),
          el("div", { style: { fontSize: "11px", color: "#64748b" } },
            (inj.date || todayISO()) + " · " + (inj.paymentMethod === "bank" ? "ባንክ (" + (inj.bankName || "") + ")" : "ካሽ") +
            (inj.note ? " · " + inj.note : "")
          )
        ]),
        el("div", { style: { fontWeight: "800", color: "#16a34a" } }, "+" + fmt(inj.amountCents))
      ]));
      body.appendChild(row);
    });
  });
}

function openCreateExpenseCategoryModal(onCreated) {
  var inputEl, errEl;
  openSheet("አዲስ የወጪ ምድብ", function (body) {
    body.appendChild(el("div", { class: "helpmsg" }, "አዲስ የወጪ ምድብ ስም ያስገቡ (ለምሳሌ፦ የቤት ኪራይ, ደሞዝ, ጥቃቅን ወጪዎች, ለትምህርት ቤት)።"));
    inputEl = el("input", { class: "input", placeholder: "የምድብ ስም...", autofocus: true });
    errEl = el("div", { class: "errmsg" });
    body.appendChild(Field("የምድብ ስም", true, inputEl));
    body.appendChild(errEl);
    setTimeout(function () { inputEl.focus(); }, 100);
  }, function (close) {
    var btn = el("button", { class: "btn btn-primary" }, "ፍጠር");
    btn.addEventListener("click", guarded(function () {
      var name = inputEl.value.trim();
      if (!name) { errEl.textContent = "እባክዎ የምድብ ስም ያስገቡ"; return; }
      setData(function (d) {
        var cats = getExpenseCategories(d).slice();
        if (cats.indexOf(name) === -1) {
          cats.push(name);
          d.expenseCategories = cats;
        }
        return d;
      });
      showToast("ምድብ '" + name + "' ተፈጥሯል");
      close();
      if (onCreated) onCreated(name);
      renderApp();
    }));
    return btn;
  });
}

function openEditExpenseCategoryModal(oldName, onUpdated) {
  var inputEl, errEl;
  openSheet("የወጪ ምድብ አርም", function (body) {
    inputEl = el("input", { class: "input", value: oldName });
    errEl = el("div", { class: "errmsg" });
    body.appendChild(Field("የምድብ ስም", true, inputEl));
    body.appendChild(errEl);
    setTimeout(function () { inputEl.focus(); }, 100);
  }, function (close) {
    var btn = el("button", { class: "btn btn-primary" }, "አስቀምጥ");
    btn.addEventListener("click", guarded(function () {
      var newName = inputEl.value.trim();
      if (!newName) { errEl.textContent = "እባክዎ የምድብ ስም ያስገቡ"; return; }
      setData(function (d) {
        var cats = getExpenseCategories(d).slice();
        var idx = cats.indexOf(oldName);
        if (idx !== -1) cats[idx] = newName;
        else cats.push(newName);
        d.expenseCategories = cats;
        (d.expenses || []).forEach(function (e) {
          if (e.category === oldName) e.category = newName;
        });
        return d;
      });
      showToast("ምድብ ተስተካክሏል");
      close();
      if (onUpdated) onUpdated(newName);
      renderApp();
    }));
    return btn;
  });
}

function openExpenseCategorySheetModal(currentCat, onSelect) {
  openSheet("የወጪ ምድብ ይምረጡ", function (body, close) {
    var listWrap = el("div", { style: { maxHeight: "350px", overflowY: "auto", marginBottom: "12px" } });
    body.appendChild(listWrap);

    function redrawList() {
      clear(listWrap);
      var cats = getExpenseCategories(state.data);
      cats.forEach(function (cat) {
        var row = el("div", {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            background: cat === currentCat ? "#eff6ff" : "#ffffff",
            border: cat === currentCat ? "1.5px solid #3b82f6" : "1.5px solid #e2e8f0",
            borderRadius: "12px",
            marginBottom: "8px",
            cursor: "pointer"
          }
        });

        var nameSpan = el("span", {
          style: { fontWeight: "700", fontSize: "14px", color: "#1e293b", flex: "1" },
          onclick: function () {
            onSelect(cat);
            close();
          }
        }, cat);

        var actions = el("div", { class: "flex gap1 items-center" }, [
          el("button", {
            type: "button",
            class: "icon-btn",
            title: "አርም (✎)",
            style: { padding: "4px 8px", fontSize: "14px", color: "#2563eb" },
            onclick: function (e) {
              e.stopPropagation();
              openEditExpenseCategoryModal(cat, function (updated) {
                if (currentCat === cat) currentCat = updated;
                redrawList();
              });
            }
          }, "✎"),
          el("button", {
            type: "button",
            class: "icon-btn",
            title: "ሰርዝ (🗑)",
            style: { padding: "4px 8px", fontSize: "14px", color: "#dc2626" },
            onclick: function (e) {
              e.stopPropagation();
              if (confirm("'" + cat + "' የሚለውን የወጪ ምድብ መሰረዝ ይፈልጋሉ?")) {
                setData(function (d) {
                  var updatedCats = getExpenseCategories(d).filter(function (c) { return c !== cat; });
                  d.expenseCategories = updatedCats.length ? updatedCats : ["ሌላ"];
                  return d;
                });
                if (currentCat === cat) {
                  var remaining = getExpenseCategories(state.data);
                  currentCat = remaining[0] || "ሌላ";
                  onSelect(currentCat);
                }
                redrawList();
                renderApp();
              }
            }
          }, "🗑")
        ]);

        row.appendChild(nameSpan);
        row.appendChild(actions);
        listWrap.appendChild(row);
      });
    }

    redrawList();

    var addBtn = el("button", {
      type: "button",
      class: "btn btn-outline",
      style: { width: "100%", padding: "10px", fontSize: "13px", fontWeight: "700", borderColor: "#93c5fd", color: "#1d4ed8" }
    }, "+ አዲስ ምድብ ጨምር");
    addBtn.addEventListener("click", function () {
      openCreateExpenseCategoryModal(function (newCat) {
        currentCat = newCat;
        onSelect(newCat);
        redrawList();
      });
    });
    body.appendChild(addBtn);
  });
}

function openAddExpenseModal(existing) {
  var titleInput, amountInput, dateInput, selectedCategory, catTriggerBtn, catTriggerText, errBox;
  var initialCat = existing ? (existing.category || "ሌላ") : (getExpenseCategories(state.data)[0] || "የቤት ኪራይ");
  selectedCategory = initialCat;

  openSheet(existing ? "ወጪ አርም" : "ወጪ መዝግብ", function (body) {
    // 1. Category label with neat "+" / "+ አዲስ ምድብ" button
    var catLabelRow = el("div", {
      class: "flex items-center justify-between mb1",
      style: { marginBottom: "6px" }
    }, [
      el("label", { style: { fontWeight: "800", fontSize: "12px", color: "#475569" } }, "የወጪ ምድብ *"),
      el("button", {
        type: "button",
        class: "btn btn-outline btn-sm",
        style: { fontSize: "11px", padding: "2px 8px", color: "#1d4ed8", borderColor: "#bfdbfe", background: "#eff6ff", fontWeight: "700" }
      }, "+ አዲስ ምድብ")
    ]);

    catLabelRow.querySelector("button").addEventListener("click", function () {
      openCreateExpenseCategoryModal(function (newCat) {
        selectedCategory = newCat;
        updateCatTriggerUI();
      });
    });

    catTriggerBtn = el("button", {
      type: "button",
      class: "input",
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "10px 14px",
        background: "#ffffff",
        border: "1.5px solid #cbd5e1",
        borderRadius: "12px",
        cursor: "pointer",
        textAlign: "left"
      }
    });

    catTriggerText = el("span", { style: { fontWeight: "700", fontSize: "13.5px", color: "#1e293b" } });
    var chevron = el("span", { style: { color: "#64748b", fontSize: "14px" } }, "▾");
    catTriggerBtn.appendChild(catTriggerText);
    catTriggerBtn.appendChild(chevron);

    function updateCatTriggerUI() {
      catTriggerText.textContent = selectedCategory || "ምድብ ይምረጡ...";
    }
    updateCatTriggerUI();

    catTriggerBtn.addEventListener("click", function () {
      openExpenseCategorySheetModal(selectedCategory, function (cat) {
        selectedCategory = cat;
        updateCatTriggerUI();
      });
    });

    var catFieldWrap = el("div", { class: "field" }, [
      catLabelRow,
      catTriggerBtn
    ]);
    body.appendChild(catFieldWrap);

    titleInput = el("input", { class: "input", placeholder: "ማብራሪያ (ካስፈለገ)", value: existing ? (existing.title || "") : "" });
    amountInput = el("input", { class: "input", type: "number", step: "0.01", min: "0", placeholder: "0.00", value: existing ? (existing.amountCents / 100).toFixed(2) : "" });
    dateInput = el("input", { class: "input", type: "date", value: existing ? existing.date : todayISO() });
    errBox = el("div", { class: "errmsg" });

    body.appendChild(Field("ማብራሪያ", false, titleInput));
    body.appendChild(Field("መጠን", true, amountInput));
    body.appendChild(Field("ቀን", true, dateInput));
    body.appendChild(errBox);
  }, function (close) {
    var btn = el("button", { class: "btn btn-primary" }, "አስቀምጥ");
    btn.addEventListener("click", guarded(function () {
      var amt = toCents(amountInput.value);
      if (amt <= 0) { errBox.textContent = "እባክዎ ትክክለኛ መጠን ያስገቡ"; return; }
      var cat = selectedCategory || "ሌላ";
      var title = titleInput.value.trim() || cat;
      setData(function (d) {
        if (existing) {
          var e = d.expenses.find(function (x) { return x.id === existing.id; });
          if (e) { e.title = title; e.amountCents = amt; e.date = dateInput.value || todayISO(); e.category = cat; }
        } else {
          d.expenses.push({ id: uid(), title: title, category: cat, amountCents: amt, date: dateInput.value || todayISO(), createdAt: Date.now() });
        }
        return d;
      });
      showToast(existing ? "ተስተካክሏል" : "ወጪ ተመዝግቧል");
      close();
      renderApp();
    }));
    return btn;
  });
}

function openVaultWithdrawModal(defaultVaultId) {
  var data = state.data;
  var fundStats = getAllocatedFundBalances(data);
  var vaults = fundStats.categoryBalances;

  openSheet("💸 ከቋት ገንዘብ ማውጫ", function (body) {
    body.appendChild(el("div", { class: "helpmsg", style: { fontSize: "12px", lineHeight: "1.5", marginBottom: "12px" } },
      "ከተጠራቀመው ቋት ውስጥ ገንዘብ ወጪ ማድረግ ይችላሉ (ለምሳሌ፦ የእቁብ ክፍያ መክፈል፣ ለራስ ትርፍ ማውጣት፣ ወይም ለስራ ካፒታል መጠቀም)። ይህ መጠን በቀጥታ ከተጠራቀመው ቋት ቀሪ ሂሳብ ላይ ይቀነሳል።"));

    var selectedVaultId = defaultVaultId || (vaults[0] ? vaults[0].id : "");
    var curVault = vaults.find(function (v) { return v.id === selectedVaultId; }) || vaults[0];

    var vaultSelect = el("select", { class: "input", style: { borderRadius: "10px", padding: "10px", marginBottom: "10px" } });
    vaults.forEach(function (v) {
      var opt = el("option", { value: v.id }, v.name + " (ያለ ቀሪ: " + fmt(v.balanceCents) + ")");
      if (curVault && v.id === curVault.id) opt.selected = true;
      vaultSelect.appendChild(opt);
    });

    var balanceNotice = el("div", {
      style: { background: "#f8fafc", border: "1px solid #e2e8f0", padding: "10px 14px", borderRadius: "10px", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "12px" }
    }, "በዚህ ቋት ውስጥ የሚገኝ ጠቅላላ ተቀማጭ፦ " + (curVault ? fmt(curVault.balanceCents) : "0.00 ብር"));

    var amtInput = el("input", { class: "input", type: "number", step: "any", placeholder: "የሚወጣው የገንዘብ መጠን (ብር)", style: { borderRadius: "10px", padding: "10px" } });
    var noteInput = el("input", { class: "input", type: "text", placeholder: "ምክንያት / ማስታወሻ (ለምሳሌ፦ የእቁብ ዙር ክፍያ)", style: { borderRadius: "10px", padding: "10px" } });
    var dateInput = el("input", { class: "input", type: "date", value: todayISO(), style: { borderRadius: "10px", padding: "10px" } });

    vaultSelect.addEventListener("change", function () {
      selectedVaultId = vaultSelect.value;
      curVault = vaults.find(function (v) { return v.id === selectedVaultId; });
      balanceNotice.textContent = "በዚህ ቋት ውስጥ የሚገኝ ጠቅላላ ተቀማጭ፦ " + (curVault ? fmt(curVault.balanceCents) : "0.00 ብር");
    });

    body.appendChild(Field("የሚወጣበት ቋት", true, vaultSelect));
    body.appendChild(balanceNotice);
    body.appendChild(Field("የሚወጣው መጠን (ብር)", true, amtInput));
    body.appendChild(Field("የማውጫ ምክንያት", false, noteInput));
    body.appendChild(Field("ቀን", true, dateInput));
  }, function (close) {
    var btn = el("button", { class: "btn btn-primary" }, "ወጪ አድርግ (አስቀምጥ)");
    btn.addEventListener("click", guarded(function () {
      var amt = toCents(amtInput.value);
      if (amt <= 0) { showToast("እባክዎ ትክክለኛ የገንዘብ መጠን ያስገቡ"); return; }
      if (curVault && amt > curVault.balanceCents) {
        showToast("የጠየቁት መጠን በቋቱ ውስጥ ካለው ቀሪ ሂሳብ (" + fmt(curVault.balanceCents) + ") ይበልጣል!");
        return;
      }
      setData(function (d) {
        if (!Array.isArray(d.vaultWithdrawals)) d.vaultWithdrawals = [];
        d.vaultWithdrawals.push({
          id: uid(),
          vaultId: curVault ? curVault.id : "",
          vaultName: curVault ? curVault.name : "ቋት",
          amountCents: amt,
          note: noteInput.value.trim() || "ወጪ",
          date: dateInput.value || todayISO(),
          createdAt: Date.now()
        });
        syncAndGetDailyAllocations(d);
        return d;
      });
      showToast("✓ " + fmt(amt) + " ከ" + (curVault ? curVault.name : "ቋት") + " ወጪ ተደርጓል");
      close();
      renderApp();
    }));
    return btn;
  });
}

function openAllocationModal() {
  // Allow all user-defined categories while cleaning up legacy 'exp' id
  var rows = (state.data.allocations || [])
    .filter(function (a) { return a.id !== "exp"; })
    .map(function (a) { return { id: a.id, name: a.name, percent: a.percent }; });

  if (rows.length === 0) {
    rows = freshAllocations().map(function (a) { return { id: a.id, name: a.name, percent: a.percent }; });
  }

  var currentExpPct = typeof state.data.expensePercent === "number" ? state.data.expensePercent : 0;
  var expInput;

  var listWrap, totalLabel, errBox, saveBtn;
  function redraw() {
    clear(listWrap);
    rows.forEach(function (r, idx) {
      var nameInput = el("input", { class: "input alloc-name", value: r.name });
      nameInput.addEventListener("input", function (e) { r.name = e.target.value; });
      var pctInput = el("input", { class: "input alloc-pct", type: "number", step: "0.1", value: r.percent });
      pctInput.addEventListener("input", function (e) { r.percent = Number(e.target.value) || 0; updateTotal(); });
      var rmBtn = el("button", { class: "trash-btn" }, "✕");
      rmBtn.addEventListener("click", function () { rows.splice(idx, 1); redraw(); });
      listWrap.appendChild(el("div", { class: "flex gap2 items-center", style: { marginBottom: "8px" } }, [nameInput, pctInput, rmBtn]));
    });
    updateTotal();
  }
  function updateTotal() {
    var expPct = Math.max(0, Math.min(100, Number(expInput ? expInput.value : currentExpPct) || 0));
    var tot = Math.round(rows.reduce(function (s, r) { return s + (Number(r.percent) || 0); }, 0) * 10) / 10;
    var maxAllowed = Math.round((100 - expPct) * 10) / 10;

    if (totalLabel) {
      totalLabel.textContent = "የቋቶች ድምር: " + tot + "% (ከ " + maxAllowed + "% መብለጥ የለበትም)";
    }

    if (tot > maxAllowed) {
      if (totalLabel) totalLabel.style.color = "#dc2626";
      if (errBox) errBox.textContent = "⚠️ የቋቶች ድምር ከ " + maxAllowed + "% መብለጥ የለበትም! (ወጪ " + expPct + "% + ቋቶች " + tot + "% = " + Math.round((expPct + tot) * 10) / 10 + "%)";
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.style.opacity = "0.5";
        saveBtn.style.cursor = "not-allowed";
      }
    } else {
      if (totalLabel) totalLabel.style.color = "#16a34a";
      if (errBox) errBox.textContent = "";
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.style.opacity = "1";
        saveBtn.style.cursor = "pointer";
      }
    }
  }
  openSheet("የዕለት ትርፍ ክፍፍል እና የወጪ ተቀናሽ ማስተካከያ", function (body) {
    // 1. Expense Deduction First section
    var expSection = el("div", {
      style: { background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "14px", padding: "14px", marginBottom: "16px" }
    });
    expSection.appendChild(el("div", { style: { fontWeight: "800", fontSize: "13.5px", color: "#0f172a", marginBottom: "4px" } }, "1. ከጥቅል ትርፍ ቀድሞ የሚቀነስ ወጪ (%)፦"));
    expSection.appendChild(el("div", { style: { fontSize: "11.5px", color: "#64748b", lineHeight: "1.4", marginBottom: "10px" } },
      "ይህ መቶኛ ከዕለቱ ጥቅል ትርፍ ላይ ቀድሞ እንደ ወጪ ይሰላል።"));
    
    expInput = el("input", {
      class: "input",
      type: "number",
      step: "0.5",
      min: "0",
      max: "100",
      value: currentExpPct,
      style: { maxWidth: "160px", fontWeight: "800", fontSize: "15px" }
    });
    expInput.addEventListener("input", function () { updateTotal(); });

    var expWrap = el("div", { class: "flex items-center gap2" }, [
      expInput,
      el("span", { style: { fontWeight: "800", fontSize: "14px", color: "#475569" } }, "% የወጪ ተቀናሽ")
    ]);
    expSection.appendChild(expWrap);
    body.appendChild(expSection);

    // 2. Gross Profit Allocation section
    var netSection = el("div", {
      style: { background: "#ffffff", border: "1.5px solid #ede9fe", borderRadius: "14px", padding: "14px" }
    });
    netSection.appendChild(el("div", { style: { fontWeight: "800", fontSize: "13.5px", color: "#6d28d9", marginBottom: "4px" } }, "2. ከጥቅል ትርፍ የሚከፋፈሉ ቋቶች (%)፦"));
    netSection.appendChild(el("div", { style: { fontSize: "11.5px", color: "#64748b", lineHeight: "1.4", marginBottom: "12px" } },
      "ከጥቅል ትርፍ የሚደለደሉ ቋቶች (ለምሳሌ፦ ለስራ ካፒታል 50%፣ እቁብ 15%፣ ቁጠባ 10%)። የቋቶች ድምር ከ (100% - የወጪ %) መብለጥ የለበትም።"));

    listWrap = el("div", {});
    netSection.appendChild(listWrap);
    var addBtn = el("button", { class: "btn btn-outline btn-sm", style: { marginTop: "6px" } }, "+ አዲስ ቋት ጨምር");
    addBtn.addEventListener("click", function () { rows.push({ id: uid(), name: "አዲስ ቋት", percent: 0 }); redraw(); });
    netSection.appendChild(addBtn);
    totalLabel = el("div", { style: { fontSize: "13px", fontWeight: "800", marginTop: "12px", textAlign: "center" } });
    netSection.appendChild(totalLabel);
    errBox = el("div", { class: "errmsg text-center mt1" });
    netSection.appendChild(errBox);
    body.appendChild(netSection);

    redraw();
  }, function (close) {
    saveBtn = el("button", { class: "btn btn-primary" }, "አስቀምጥ");
    saveBtn.addEventListener("click", guarded(function () {
      var newExpPct = Math.max(0, Math.min(100, Number(expInput.value) || 0));
      setData(function (d) {
        d.expensePercent = newExpPct;
        d.allocations = rows.map(function (r) {
          return { id: r.id || uid(), name: r.name.trim() || "ቋት", percent: Number(r.percent) || 0 };
        });
        syncAndGetDailyAllocations(d);
        return d;
      });
      showToast("የትርፍ ክፍፍል እና የወጪ ተቀናሽ ተስተካክሏል");
      close();
      renderApp();
    }));
    return saveBtn;
  });
}

function renderAllocationAndGoalPage(container) {
  var data = state.data;
  var fundStats = getAllocatedFundBalances(data);
  var categories = Array.isArray(fundStats.categoryBalances) ? fundStats.categoryBalances : [];

  // ==========================================
  // SECTION 1: TOP BAR - TODAY'S PROFIT QUICK METRICS & SUMMARY
  // ==========================================
  var section1Wrap = el("div", {
    style: { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "14px" }
  });

  // 1A. Today's Profit Quick Metrics (ጥቅል ትርፍ | ወጪ | የተጣራ ትርፍ)
  var todayMetricsCard = el("div", {
    id: "card-today-profit-quick-metrics",
    style: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "14px",
      padding: "14px 16px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
    }
  }, [
    el("div", {
      class: "flex items-center justify-between mb2",
      style: { borderBottom: "1px solid #f1f5f9", paddingBottom: "8px" }
    }, [
      el("div", { style: { fontSize: "13px", fontWeight: "800", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" } }, [
        el("span", {}, "📊"),
        el("span", {}, "የዛሬ ትርፍ ፈጣን ማጠቃለያ")
      ]),
      el("span", {
        style: { fontSize: "11px", fontWeight: "700", color: "#64748b", background: "#f8fafc", padding: "2px 8px", borderRadius: "6px", border: "1px solid #e2e8f0" }
      }, todayISO())
    ]),
    el("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "8px",
        textAlign: "center"
      }
    }, [
      // Gross Profit
      el("div", { style: { padding: "4px" } }, [
        el("div", { style: { fontSize: "11px", color: "#64748b", fontWeight: "700", marginBottom: "3px" } }, "ጥቅል ትርፍ"),
        el("div", { style: { fontSize: "15px", fontWeight: "900", color: "#0f172a" } }, fmt(fundStats.todayGrossProfitCents))
      ]),
      // Expenses
      el("div", { style: { padding: "4px", borderLeft: "1px solid #f1f5f9", borderRight: "1px solid #f1f5f9" } }, [
        el("div", { style: { fontSize: "11px", color: "#dc2626", fontWeight: "700", marginBottom: "3px" } }, "የዛሬ ወጪ"),
        el("div", { style: { fontSize: "15px", fontWeight: "900", color: "#dc2626" } }, fmt(fundStats.todayExpenseCents))
      ]),
      // Net Profit
      el("div", { style: { padding: "4px" } }, [
        el("div", { style: { fontSize: "11px", color: "#16a34a", fontWeight: "700", marginBottom: "3px" } }, "የተጣራ ትርፍ"),
        el("div", { style: { fontSize: "15.5px", fontWeight: "900", color: "#16a34a" } }, fmt(fundStats.todayNetProfitCents))
      ])
    ])
  ]);
  section1Wrap.appendChild(todayMetricsCard);

  // 1B. ONLY ONE Clean Summary Card for Total Cash & Returned Inventory Cost
  var singleSummaryCard = el("div", {
    id: "card-total-cash-inventory-summary",
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "10px"
    }
  }, [
    // Total Cash
    el("div", {
      style: {
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        padding: "12px 12px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
      }
    }, [
      el("div", { style: { fontSize: "11px", fontWeight: "800", color: "#475569", marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" } }, [
        el("span", {}, "💵"),
        el("span", {}, "በእጅ ላይ ጠቅላላ ጥሬ ገንዘብ")
      ]),
      el("div", { style: { fontSize: "16.5px", fontWeight: "900", color: "#0f172a", marginBottom: "3px" } }, fmt(fundStats.totalCashCents)),
      el("div", { style: { fontSize: "10px", color: "#64748b" } }, "የተሸጠ ዕቃ ዋጋ + የትርፍ ቋቶች")
    ]),
    // Returned Inventory Cost
    el("div", {
      style: {
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        padding: "12px 12px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
      }
    }, [
      el("div", { style: { fontSize: "11px", fontWeight: "800", color: "#475569", marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" } }, [
        el("span", {}, "🔄"),
        el("span", {}, "የተሸጠው ዕቃ ዋና ዋጋ")
      ]),
      el("div", { style: { fontSize: "16.5px", fontWeight: "900", color: "#0f172a", marginBottom: "3px" } }, fmt(fundStats.cumulativeSoldCogsCents)),
      el("div", { style: { fontSize: "10px", color: "#059669", fontWeight: "700" } }, "የዛሬ ዕቃዎች ዋጋ፦ " + fmt(fundStats.todayCogsCents))
    ])
  ]);
  section1Wrap.appendChild(singleSummaryCard);
  container.appendChild(section1Wrap);

  // ==========================================
  // SECTION 2: CUMULATIVE VAULTS (የተጠራቀሙ ቋቶች)
  // ==========================================
  var section2Wrap = el("div", {
    id: "section-cumulative-vaults",
    style: { marginBottom: "16px" }
  });

  // Section 2 Header with Action Buttons
  var allocHeaderRow = el("div", {
    class: "flex items-center justify-between mb2",
    style: { padding: "0 2px" }
  }, [
    el("div", {}, [
      el("div", {
        style: { fontSize: "13.5px", fontWeight: "900", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }
      }, [
        el("span", {}, "🧮"),
        el("span", {}, "የተጠራቀሙ የትርፍ ቋቶች")
      ]),
      el("div", { style: { fontSize: "10.5px", color: "#64748b", marginTop: "1px" } }, "የአሁኑ የቋቶች የገንዘብ ክምችት እና ከተጠራቀመው ጠቅላላ ሀብት ያላቸው ድርሻ (%)")
    ]),
    el("div", { class: "flex items-center gap1" }, [
      el("button", {
        type: "button",
        class: "btn btn-outline btn-sm",
        style: { fontSize: "11px", padding: "3px 8px", borderColor: "#cbd5e1", color: "#334155" },
        onclick: function () { openVaultWithdrawModal(); }
      }, "💸 ወጪ አድርግ"),
      el("button", {
        type: "button",
        "aria-label": "ክፍፍል አርም",
        style: {
          background: "#f8fafc",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          fontSize: "13px",
          cursor: "pointer",
          color: "#475569",
          padding: "3px 7px"
        },
        onclick: openAllocationModal
      }, "✏️")
    ])
  ]);
  section2Wrap.appendChild(allocHeaderRow);

  // Total Accumulated Cash Pool Banner
  var poolBanner = el("div", {
    style: {
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      borderRadius: "14px",
      padding: "12px 14px",
      color: "#ffffff",
      marginBottom: "10px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      boxShadow: "0 2px 6px rgba(15, 23, 42, 0.08)"
    }
  }, [
    el("div", {}, [
      el("div", { style: { fontSize: "11px", opacity: "0.8", fontWeight: "700", marginBottom: "2px" } }, "ጠቅላላ የተጠራቀመ የቋቶች ገንዳ"),
      el("div", { style: { fontSize: "20px", fontWeight: "900", color: "#38bdf8" } }, fmt(fundStats.totalPoolCents)),
      el("div", { style: { fontSize: "9.5px", opacity: "0.7", marginTop: "2px" } }, "እስኪወጣ ድረስ በጊዜ ሂደት የሚጠራቀም")
    ]),
    el("button", {
      type: "button",
      class: "btn btn-outline btn-sm",
      style: { borderColor: "rgba(255,255,255,0.35)", color: "#ffffff", fontSize: "11px", padding: "4px 8px" },
      onclick: function () { openVaultWithdrawModal(); }
    }, "💸 ማውጫ")
  ]);
  section2Wrap.appendChild(poolBanner);

  // Dynamic Vault Cards in a responsive grid
  if (categories.length === 0) {
    var emptyVaultsEl = el("div", {
      style: {
        background: "#ffffff",
        border: "1px dashed #cbd5e1",
        borderRadius: "14px",
        padding: "20px 16px",
        textAlign: "center",
        color: "#64748b"
      }
    }, [
      el("div", { style: { fontSize: "13px", fontWeight: "700", marginBottom: "8px" } }, "ምንም የትርፍ ቋት አልተዋቀረም"),
      el("button", {
        type: "button",
        class: "btn btn-primary btn-sm",
        style: { fontSize: "12px", padding: "6px 14px" },
        onclick: openAllocationModal
      }, "+ አዲስ የትርፍ ቋት ፍጠር")
    ]);
    section2Wrap.appendChild(emptyVaultsEl);
  } else {
    var allocGrid = el("div", {
      style: {
        display: "grid",
        gridTemplateColumns: categories.length === 1 ? "1fr" : "1fr 1fr",
        gap: "10px"
      }
    });

    categories.forEach(function (c) {
      var poolRatioPct = typeof c.poolPercent === "number" ? c.poolPercent : 0;
      allocGrid.appendChild(el("div", {
        style: {
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          padding: "12px 10px",
          textAlign: "center",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          position: "relative"
        }
      }, [
        el("div", {
          style: { fontSize: "12.5px", fontWeight: "800", color: "#0f172a", marginBottom: "3px" }
        }, c.name),
        el("div", {
          style: {
            display: "inline-block",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#166534",
            fontSize: "10px",
            fontWeight: "800",
            borderRadius: "999px",
            padding: "1px 7px",
            marginBottom: "6px"
          }
        }, poolRatioPct + "% ከተጠራቀመው"),
        el("div", {
          style: { fontSize: "15.5px", fontWeight: "900", color: "#0f172a", marginBottom: "3px" }
        }, fmt(c.balanceCents)),
        el("div", {
          style: { fontSize: "10.5px", color: "#059669", fontWeight: "700", marginBottom: "6px" }
        }, "የዛሬ :- +" + fmt(c.todayAllocatedCents)),
        el("button", {
          type: "button",
          class: "btn btn-outline btn-sm",
          style: { fontSize: "9.5px", padding: "2px 8px", borderRadius: "6px", color: "#475569", borderColor: "#cbd5e1" },
          onclick: function () { openVaultWithdrawModal(c.id); }
        }, "💸 ማውጫ")
      ]));
    });
    section2Wrap.appendChild(allocGrid);
  }
  container.appendChild(section2Wrap);

  // ==========================================
  // SECTION 3: DAILY SPLIT CALCULATOR (የዕለት ትርፍ ክፍፍል ስሌት)
  // ==========================================
  var todayAllocCard = el("div", {
    id: "card-today-profit-allocation",
    style: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "16px",
      padding: "16px 16px",
      marginBottom: "16px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
    }
  });

  // Top header with title and pencil edit button
  var todayAllocHeader = el("div", {
    class: "flex items-center justify-between",
    style: { marginBottom: "12px", borderBottom: "1px solid #f1f5f9", paddingBottom: "8px" }
  }, [
    el("div", {}, [
      el("div", {
        style: {
          fontSize: "14px",
          fontWeight: "900",
          color: "#4338ca",
          display: "flex",
          alignItems: "center",
          gap: "6px"
        }
      }, [
        el("span", {}, "⚙️"),
        el("span", {}, "የዕለት ትርፍ ክፍፍል ህግጋት (Daily Split Rules)")
      ]),
      el("div", {
        style: { fontSize: "10.5px", color: "#64748b", marginTop: "1px" }
      }, "ከየዕለቱ ጥቅል ትርፍ (Gross Profit) ለቋቶች የሚደለደልበት ቋሚ የመደብ ቀመር")
    ]),
    el("button", {
      type: "button",
      id: "btn-edit-today-profit-allocation",
      "aria-label": "የትርፍ ክፍፍል አርም",
      style: {
        background: "#f8fafc",
        border: "1px solid #cbd5e1",
        borderRadius: "8px",
        padding: "4px 8px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "12px",
        color: "#4338ca"
      },
      onclick: openAllocationModal
    }, "✏️ አርም")
  ]);
  todayAllocCard.appendChild(todayAllocHeader);

  // Step 1: Expense Deduction First card
  var step1Card = el("div", {
    style: {
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      borderRadius: "12px",
      padding: "10px 12px",
      marginBottom: "12px"
    }
  }, [
    el("div", { style: { fontSize: "11.5px", fontWeight: "800", color: "#334155", marginBottom: "6px" } }, "ደረጃ 1፦ የቀን ጥቅል ትርፍ እና የወጪ ተቀናሽ"),
    el("div", { class: "flex items-center justify-between", style: { fontSize: "12px", marginBottom: "3px" } }, [
      el("span", { style: { color: "#64748b" } }, "የዛሬ ጠቅላላ (ጥቅል) ትርፍ:"),
      el("span", { style: { fontWeight: "800", color: "#0f172a" } }, fmt(fundStats.todayGrossProfitCents))
    ]),
    el("div", { class: "flex items-center justify-between", style: { fontSize: "12px", marginBottom: "3px" } }, [
      el("span", { style: { color: "#dc2626", fontWeight: "700" } }, "የወጪ ተቀናሽ ቀዳሚ ድርሻ" + (fundStats.expensePercent > 0 ? " (" + fundStats.expensePercent + "%):" : ":")),
      el("span", { style: { fontWeight: "800", color: "#dc2626" } }, "- " + fmt(fundStats.todayExpenseCents))
    ]),
    el("div", { style: { borderTop: "1px dashed #cbd5e1", margin: "5px 0" } }),
    el("div", { class: "flex items-center justify-between", style: { fontSize: "12.5px" } }, [
      el("span", { style: { color: "#166534", fontWeight: "800" } }, "የቀረ የሚከፋፈል የተጣራ ትርፍ:"),
      el("span", { style: { fontWeight: "900", color: "#16a34a" } }, "= " + fmt(fundStats.todayNetProfitCents))
    ])
  ]);
  todayAllocCard.appendChild(step1Card);

  var todayAllocList = el("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "6px"
    }
  });

  var dailyCategories = categories.filter(function (c) {
    return c.id !== "exp_deduction";
  });

  if (dailyCategories.length === 0) {
    todayAllocList.appendChild(el("div", {
      style: { fontSize: "12px", color: "#64748b", padding: "8px 0", textAlign: "center" }
    }, "ምንም የትርፍ ቋቶች አልተዋቀሩም"));
  } else {
    dailyCategories.forEach(function (c) {
      var catAllocatedCents = typeof c.todayAllocatedCents === "number" ? c.todayAllocatedCents : Math.round(fundStats.todayGrossProfitCents * ((Number(c.percent) || 0) / 100));
      var itemEl = el("div", {
        class: "flex items-center justify-between",
        style: {
          background: "#faf5ff",
          border: "1px solid #f3e8ff",
          borderRadius: "10px",
          padding: "9px 12px"
        }
      }, [
        el("div", {}, [
          el("div", {
            style: { fontSize: "13px", fontWeight: "800", color: "#1e293b" }
          }, c.name + " (የዕለት ክፍፍል ህግ፦ " + c.percent + "%)")
        ]),
        el("span", {
          style: { fontSize: "13.5px", fontWeight: "900", color: "#16a34a" }
        }, "+ " + fmt(catAllocatedCents))
      ]);
      todayAllocList.appendChild(itemEl);
    });
  }

  todayAllocCard.appendChild(todayAllocList);

  container.appendChild(todayAllocCard);

  // 5. Section 5: Restored Sub-sections requested by user
  // 🎯 የካፒታል ክምችት ግብ ክትትል (Capital Goal Tracking)
  var gt = goalTrackerStats(data);
  var goalCard = el("div", { class: "card green section", style: { marginTop: "16px" } });
  goalCard.appendChild(el("div", { class: "flex items-center justify-between mb2" }, [
    el("div", { class: "card-label", style: { fontSize: "14px", fontWeight: "900", color: "#166534" } }, "🎯 የካፒታል ክምችት ግብ ክትትል"),
    el("button", {
      type: "button",
      class: "btn btn-outline btn-sm",
      style: { fontSize: "11px", padding: "4px 8px" },
      onclick: openCapitalGoalModal
    }, "ግብ አርም")
  ]));
  goalCard.appendChild(renderGoalTrackerBlock(gt));
  container.appendChild(goalCard);

  // 🏗️ የካፒታል አጠቃቀም — ወርሃዊ (Monthly Capital Utilization)
  var cuMonth = capitalUtilizationStats(data, "month");
  var cuMonthCard = el("div", { class: "card blue section", style: { marginTop: "14px" } });
  cuMonthCard.appendChild(el("div", { class: "card-label mb2", style: { fontSize: "14px", fontWeight: "900", color: "#1e40af" } }, "🏗️ የካፒታል አጠቃቀም — ወርሃዊ"));
  cuMonthCard.appendChild(renderCapitalUtilizationBlock(cuMonth));
  container.appendChild(cuMonthCard);

  // 🏗️ የካፒታል አጠቃቀም — አመታዊ (Annual Capital Utilization)
  var cuYear = capitalUtilizationStats(data, "year");
  var cuYearCard = el("div", { class: "card violet section", style: { marginTop: "14px" } });
  cuYearCard.appendChild(el("div", { class: "card-label mb2", style: { fontSize: "14px", fontWeight: "900", color: "#5b21b6" } }, "🏗️ የካፒታል አጠቃቀም — አመታዊ"));
  cuYearCard.appendChild(renderCapitalUtilizationBlock(cuYear));
  container.appendChild(cuYearCard);
}

function openCapitalGoalModal() {
  var input;
  openSheet("የወርሃዊ ካፒታል ግብ አርም", function (body) {
    body.appendChild(el("div", { class: "helpmsg" }, "ይህ የወርሃዊ ካፒታል ክምችት ግብዎ (ኢላማ) ነው። እድገቱ ግን ሁልጊዜ ከትክክለኛው የካፒታል ክፍፍል መቶኛ (☰ → 🧮) እና ከትክክለኛው ወርሃዊ ትርፍ ራሱ ይሰላል።"));
    input = el("input", { class: "input", type: "number", step: "0.01", value: ((state.data.capitalGoalMonthlyCents || GOAL_MONTHLY_CENTS_DEFAULT) / 100).toFixed(2) });
    body.appendChild(input);
  }, function (close) {
    var btn = el("button", { class: "btn btn-primary" }, "አስቀምጥ");
    btn.addEventListener("click", guarded(function () {
      var cents = toCents(input.value);
      setData(function (d) { d.capitalGoalMonthlyCents = cents > 0 ? cents : GOAL_MONTHLY_CENTS_DEFAULT; return d; });
      close();
    }));
    return btn;
  });
}

function renderSales(container) {
  state.salesSubTab = state.salesSubTab || "sales";
  if (state.salesSubTab === "today") state.salesSubTab = "history";

  // Modern & Clean Top Tabs Bar:
  // - Sleek segmented control container with a soft background
  // - Clean minimal layout, no messy emojis/icons
  // - Active tab: solid green background, bold white text, subtle accent line
  // - Inactive tabs: neutral dark grey text on soft background
  // - 4 tabs: "ሽያጭ", "የሽያጭ ታሪክ", "ዱቤ", "ደንበኛ" arranged in equal 4 columns
  var navTabsWrap = el("div", {
    class: "sales-subtabs-nav",
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: "0px",
      background: "#ffffff",
      borderBottom: "1px solid #f1f5f9",
      padding: "4px 0",
      marginBottom: "14px"
    }
  });

  var tabDefs = [
    { id: "sales", label: "ሽያጭ" },
    { id: "history", label: "የዛሬ ሽያጭ" },
    { id: "debits", label: "ዱቤ" },
    { id: "customers", label: "ደበኛ" }
  ];

  tabDefs.forEach(function (t) {
    var isActive = state.salesSubTab === t.id;
    var btn = el("button", {
      type: "button",
      class: "sales-subtab-btn" + (isActive ? " active" : ""),
      style: {
        width: "100%",
        padding: "8px 2px 6px 2px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontWeight: isActive ? "900" : "600",
        fontSize: "13.5px",
        textAlign: "center",
        whiteSpace: "nowrap",
        color: isActive ? "#0f172a" : "#64748b",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px"
      }
    }, [
      el("span", {}, t.label),
      isActive ? el("span", {
        style: {
          width: "28px",
          height: "3.5px",
          background: "#10b981",
          borderRadius: "9999px"
        }
      }) : el("span", {
        style: {
          width: "28px",
          height: "3.5px",
          background: "transparent"
        }
      })
    ]);
    btn.addEventListener("click", function () {
      state.salesSubTab = t.id;
      renderApp();
    });
    navTabsWrap.appendChild(btn);
  });
  container.appendChild(navTabsWrap);

  // Router for Sub-Tabs
  if (state.salesSubTab === "history") {
    renderSalesHistoryTab(container);
    return;
  }
  if (state.salesSubTab === "debits") {
    renderDebitsTab(container);
    return;
  }
  if (state.salesSubTab === "customers") {
    renderCustomersTab(container);
    return;
  }

  // ==========================================
  // TAB 1: New Simplified Sales Form ("ሽያጭ")
  // ==========================================
  var formCard = el("div", {
    class: "card section",
    style: {
      borderColor: "#cbd5e1",
      borderRadius: "16px",
      padding: "18px 16px",
      background: "#ffffff",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)"
    }
  });

  // Local state for active sales cart
  state.activeSaleCart = state.activeSaleCart || [];
  state.saleCustomer = state.saleCustomer || "";
  state.salePhone = state.salePhone || "";
  state.salePayMethod = state.salePayMethod || "cash";
  state.saleBankName = state.saleBankName || BANK_NAMES[0];
  state.saleAmountPaid = state.saleAmountPaid !== undefined ? state.saleAmountPaid : "0.00";

  // 2. Customer Selection Field: Modal/Bottom Sheet for Customer Selection
  var custSection = el("div", { style: { marginBottom: "16px" } });
  custSection.appendChild(el("label", {
    style: { display: "block", fontWeight: "800", fontSize: "13px", color: "#1e293b", marginBottom: "6px" }
  }, "👤 ደንበኛ በስም / በስልክ ፈልግ"));

  var custRow = el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } });

  var custTriggerBtn = el("button", {
    type: "button",
    class: "input",
    style: {
      flex: "1.6",
      minWidth: "200px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 14px",
      background: state.saleCustomer ? "#f8fafc" : "#ffffff",
      border: state.saleCustomer ? "1.5px solid #3b82f6" : "1.5px solid #cbd5e1",
      borderRadius: "12px",
      cursor: "pointer",
      textAlign: "left"
    }
  });

  var custTriggerText = el("div", { style: { flex: "1" } });
  var custTriggerChevron = el("span", { style: { color: "#64748b", fontSize: "14px", marginLeft: "8px" } }, "▾");
  custTriggerBtn.appendChild(custTriggerText);
  custTriggerBtn.appendChild(custTriggerChevron);

  var custPhoneInput = el("input", {
    class: "input",
    type: "tel",
    value: state.salePhone || "",
    placeholder: "ስልክ ቁጥር (ምሳሌ: 0911...)",
    style: { flex: "1", minWidth: "140px", fontSize: "13.5px", padding: "10px 12px" }
  });
  custPhoneInput.addEventListener("input", function (e) {
    state.salePhone = e.target.value.trim();
  });

  function updateCustTriggerUI() {
    clear(custTriggerText);
    if (state.saleCustomer) {
      custTriggerText.appendChild(el("div", { style: { fontWeight: "800", fontSize: "13.5px", color: "#1e293b" } }, state.saleCustomer));
      custTriggerText.appendChild(el("div", { style: { fontSize: "11px", color: "#64748b" } }, state.salePhone ? ("ስልክ: " + state.salePhone) : "ስልክ አልተመዘገበም"));
      custTriggerBtn.style.border = "1.5px solid #3b82f6";
      custTriggerBtn.style.background = "#eff6ff";
    } else {
      custTriggerText.appendChild(el("div", { style: { color: "#64748b", fontSize: "13px" } }, "🔍 ደንበኛ በስም / በስልክ ፈልግ..."));
      custTriggerBtn.style.border = "1.5px solid #cbd5e1";
      custTriggerBtn.style.background = "#ffffff";
    }
  }
  updateCustTriggerUI();

  // Extract unique customer list from state.data.customers and state.data.sales
  function getCustomerDirectory() {
    var list = [];
    var map = {};
    if (Array.isArray(state.data.customers)) {
      state.data.customers.forEach(function (c) {
        if (c.name && !map[c.name.toLowerCase()]) {
          map[c.name.toLowerCase()] = true;
          list.push({ name: c.name, phone: c.phone || "", debit: c.balanceCents || 0 });
        }
      });
    }
    if (Array.isArray(state.data.sales)) {
      state.data.sales.forEach(function (s) {
        if (s.customer && s.customer !== "ስም ያልገለጸ ደንበኛ" && !map[s.customer.toLowerCase()]) {
          map[s.customer.toLowerCase()] = true;
          list.push({ name: s.customer, phone: s.customerPhone || "", debit: 0 });
        }
      });
    }
    return list;
  }

  function openCustomerSelectModal() {
    openSheet("ደንበኛ ይምረጡ", function (body, close) {
      var searchWrap = el("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "#f8fafc",
          border: "1.5px solid #cbd5e1",
          borderRadius: "12px",
          padding: "8px 12px",
          marginBottom: "12px"
        }
      });
      var searchInput = el("input", {
        type: "text",
        placeholder: "🔍 ፈልግ (በስም ወይም በስልክ)...",
        style: {
          border: "none",
          background: "transparent",
          outline: "none",
          width: "100%",
          fontSize: "13.5px",
          color: "#1e293b"
        }
      });
      searchWrap.appendChild(searchInput);
      body.appendChild(searchWrap);

      var listWrap = el("div", { style: { maxHeight: "360px", overflowY: "auto" } });
      body.appendChild(listWrap);

      function renderList(queryText) {
        clear(listWrap);
        var query = (queryText || "").trim().toLowerCase();
        var all = getCustomerDirectory();
        var filtered = all.filter(function (c) {
          return !query || c.name.toLowerCase().indexOf(query) !== -1 || (c.phone && c.phone.indexOf(query) !== -1);
        });

        // Option to add as a new customer if query is typed
        if (query && !all.some(function (c) { return c.name.toLowerCase() === query; })) {
          var newRow = el("div", {
            style: {
              background: "#f0fdf4",
              border: "1.5px dashed #86efac",
              borderRadius: "12px",
              padding: "12px 14px",
              marginBottom: "8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }
          }, [
            el("div", {}, [
              el("div", { style: { fontWeight: "800", fontSize: "13.5px", color: "#166534" } }, "+ '" + queryText.trim() + "' እንደ አዲስ ደንበኛ ምረጥ"),
              el("div", { style: { fontSize: "11.5px", color: "#15803d" } }, "አዲስ ደንበኛ")
            ]),
            el("span", { style: { fontSize: "16px", color: "#16a34a", fontWeight: "700" } }, "✓")
          ]);
          newRow.addEventListener("click", function () {
            state.saleCustomer = queryText.trim();
            updateCustTriggerUI();
            close();
          });
          listWrap.appendChild(newRow);
        }

        if (filtered.length === 0 && !query) {
          listWrap.appendChild(el("div", {
            style: { padding: "28px 12px", textAlign: "center", color: "#64748b", fontSize: "13px" }
          }, "ምንም የተመዘገበ ደንበኛ አልተገኘም"));
          return;
        }

        filtered.forEach(function (c) {
          var row = el("div", {
            style: {
              background: "#ffffff",
              border: "1.5px solid #e2e8f0",
              borderRadius: "12px",
              padding: "12px 14px",
              marginBottom: "8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
            }
          }, [
            el("div", {}, [
              el("div", { style: { fontWeight: "800", fontSize: "14px", color: "#1e293b", marginBottom: "3px" } }, c.name),
              el("div", { style: { fontSize: "12px", color: "#64748b" } }, c.phone ? ("ስልክ: " + c.phone) : "ስልክ: አልተመዘገበም")
            ]),
            c.debit > 0
              ? el("span", { class: "badge red", style: { fontSize: "11px", fontWeight: "700" } }, "ቀሪ ዱቤ: " + fmt(c.debit))
              : el("span", { style: { color: "#94a3b8", fontSize: "16px" } }, "›")
          ]);
          row.addEventListener("click", function () {
            state.saleCustomer = c.name;
            state.salePhone = c.phone || "";
            custPhoneInput.value = state.salePhone;
            updateCustTriggerUI();
            close();
          });
          listWrap.appendChild(row);
        });
      }

      searchInput.addEventListener("input", function (e) {
        renderList(e.target.value);
      });

      renderList("");
      setTimeout(function () { searchInput.focus(); }, 100);
    });
  }

  custTriggerBtn.addEventListener("click", function () {
    openCustomerSelectModal();
  });

  var clearCustBtn = el("button", {
    type: "button",
    class: "btn btn-outline btn-sm",
    style: { padding: "8px 10px", fontSize: "12px", color: "#64748b", display: state.saleCustomer ? "block" : "none" },
    title: "ደምስስ"
  }, "✕");
  clearCustBtn.addEventListener("click", function () {
    state.saleCustomer = "";
    state.salePhone = "";
    custPhoneInput.value = "";
    updateCustTriggerUI();
    clearCustBtn.style.display = "none";
  });

  custRow.appendChild(custTriggerBtn);
  custRow.appendChild(custPhoneInput);
  custRow.appendChild(clearCustBtn);
  custSection.appendChild(custRow);
  formCard.appendChild(custSection);

  // 3. Item Addition Row (Horizontal Inputs):
  // Single compact row: "ዕቃ" (Select), "ብዛት" (Input), "መሸጫ ዋጋ" (Input), "+ ጨምር" (Button), and "ጠቅላላ ዋጋ: 0.00" label below price.
  var itemAddSection = el("div", {
    style: {
      background: "#f8fafc",
      border: "1.5px solid #e2e8f0",
      borderRadius: "14px",
      padding: "14px 12px",
      marginBottom: "16px"
    }
  });

  var rowTitle = el("div", {
    style: { fontWeight: "800", fontSize: "12.5px", color: "#334155", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }
  }, [el("span", {}, "📦"), el("span", {}, "ዕቃ መረጣ እና ዋጋ መሙያ")]);
  itemAddSection.appendChild(rowTitle);

  // Row Flexbox Container
  var hRow = el("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: "8px",
      flexWrap: "wrap"
    }
  });

  // 3.1 "ዕቃ" (Item Select Dropdown using Custom Dropdown Component)
  var itemCol = el("div", { style: { flex: "2.5", minWidth: "180px" } });
  itemCol.appendChild(el("label", {
    style: { display: "block", fontSize: "11.5px", fontWeight: "700", color: "#475569", marginBottom: "4px" }
  }, "ዕቃ"));

  var itemsList = state.data.items || [];
  var itemOptions = itemsList.map(function (it) {
    var stock = itemStock(state.data, it.id);
    return {
      value: it.id,
      label: it.name,
      sub: (it.code ? ("ኮድ: " + it.code + " · ") : "") + "ስቶክ: " + stock,
      badge: fmt(it.sellPriceCents)
    };
  });

  var itemSelect = createCustomSelect({
    placeholder: "-- ዕቃ ይምረጡ --",
    label: "ዕቃ ይምረጡ",
    options: itemOptions
  });
  itemCol.appendChild(itemSelect);
  hRow.appendChild(itemCol);

  // 3.2 "ብዛት" (Quantity Input Field)
  var qtyCol = el("div", { style: { flex: "1", minWidth: "65px", maxWidth: "85px" } });
  qtyCol.appendChild(el("label", {
    style: { display: "block", fontSize: "11.5px", fontWeight: "700", color: "#475569", marginBottom: "4px" }
  }, "ብዛት"));

  var qtyInput = el("input", {
    class: "input",
    type: "number",
    min: "1",
    value: "1",
    style: { width: "100%", textAlign: "center", fontSize: "13px", padding: "7px 4px", fontWeight: "700" }
  });
  qtyCol.appendChild(qtyInput);
  hRow.appendChild(qtyCol);

  // 3.3 "መሸጫ ዋጋ" (Unit Selling Price Input Field) + "ጠቅላላ ዋጋ: 0.00" label below
  var priceCol = el("div", { style: { flex: "1.4", minWidth: "110px" } });
  priceCol.appendChild(el("label", {
    style: { display: "block", fontSize: "11.5px", fontWeight: "700", color: "#475569", marginBottom: "4px" }
  }, "መሸጫ ዋጋ"));

  var priceInput = el("input", {
    class: "input",
    type: "number",
    step: "0.01",
    min: "0",
    value: "0.00",
    style: { width: "100%", textAlign: "right", fontSize: "13px", padding: "7px 8px", fontWeight: "700" }
  });
  priceCol.appendChild(priceInput);

  // Auto-calculation label placed directly below price
  var autoCalcTotalLabel = el("div", {
    class: "item-calc-total-label",
    style: {
      fontSize: "11px",
      fontWeight: "800",
      color: "#1d4ed8",
      marginTop: "4px",
      whiteSpace: "nowrap"
    }
  }, "ጠቅላላ ዋጋ: 0.00");
  priceCol.appendChild(autoCalcTotalLabel);
  hRow.appendChild(priceCol);

  // Live calculation updater for row
  function updateAutoCalcLabel() {
    var q = parseFloat(qtyInput.value) || 0;
    var p = parseFloat(priceInput.value) || 0;
    var tot = q * p;
    autoCalcTotalLabel.textContent = "ጠቅላላ ዋጋ: " + tot.toFixed(2);
  }

  itemSelect.addEventListener("change", function () {
    var chosenId = itemSelect.value;
    var chosenItem = itemsList.find(function (x) { return x.id === chosenId; });
    if (chosenItem) {
      priceInput.value = ((chosenItem.sellPriceCents || 0) / 100).toFixed(2);
    } else {
      priceInput.value = "0.00";
    }
    updateAutoCalcLabel();
  });

  qtyInput.addEventListener("input", updateAutoCalcLabel);
  priceInput.addEventListener("input", updateAutoCalcLabel);

  // 3.4 "+ ጨምር" (Add Item Button)
  var addBtnCol = el("div", { style: { display: "flex", flexDirection: "column", justifyContent: "flex-start", paddingTop: "20px" } });
  var addRowBtn = el("button", {
    class: "btn btn-emerald",
    type: "button",
    style: {
      padding: "8px 16px",
      fontSize: "13.5px",
      fontWeight: "800",
      borderRadius: "10px",
      whiteSpace: "nowrap",
      height: "38px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, "+ ጨምር");

  addRowBtn.addEventListener("click", function () {
    var itemId = itemSelect.value;
    if (!itemId) {
      showToast("እባክዎ መጀመሪያ ዕቃ ይምረጡ");
      return;
    }
    var item = itemsList.find(function (x) { return x.id === itemId; });
    if (!item) return;

    var qty = parseInt(qtyInput.value, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast("እባክዎ ትክክለኛ የዕቃ ብዛት ያስገቡ");
      return;
    }

    var availStock = itemStock(state.data, item.id);
    var inCartQty = state.activeSaleCart
      .filter(function (x) { return x.itemId === item.id; })
      .reduce(function (acc, x) { return acc + x.qty; }, 0);

    if (inCartQty + qty > availStock) {
      showToast("⚠️ የቀረ ስቶክ: " + availStock + " ብቻ ነው! (በጋሪ: " + inCartQty + ")");
    }

    var sellPriceCents = toCents(priceInput.value);
    var lineTotalCents = qty * sellPriceCents;

    // Auto-combine same item into existing cart row if present
    var existingRow = state.activeSaleCart.find(function (x) { return x.itemId === item.id; });
    if (existingRow) {
      existingRow.qty += qty;
      existingRow.unitPriceCents = sellPriceCents;
      existingRow.totalCents = existingRow.qty * sellPriceCents;
    } else {
      state.activeSaleCart.push({
        itemId: item.id,
        name: item.name,
        code: item.code || "",
        qty: qty,
        unitPriceCents: sellPriceCents,
        costPriceCents: item.costPriceCents || 0,
        totalCents: lineTotalCents
      });
    }

    // Reset selection & inputs
    itemSelect.setValue("");
    qtyInput.value = "1";
    priceInput.value = "0.00";
    autoCalcTotalLabel.textContent = "ጠቅላላ ዋጋ: 0.00";

    renderCartView();
    showToast("✓ ዕቃ ወደ ጋሪ ተጨምሯል");
  });

  addBtnCol.appendChild(addRowBtn);
  hRow.appendChild(addBtnCol);
  itemAddSection.appendChild(hRow);
  formCard.appendChild(itemAddSection);

  // Cart / Items Added List View
  var cartBox = el("div", { class: "cart-items-section", style: { marginBottom: "16px" } });
  formCard.appendChild(cartBox);

  // 4. Payment & Checkout Actions:
  var checkoutSection = el("div", {
    style: {
      background: "#f1f5f9",
      borderRadius: "14px",
      padding: "14px 16px",
      border: "1px solid #cbd5e1"
    }
  });

  // Payment Method Radios / Pills
  var payMethodRow = el("div", { style: { display: "flex", gap: "8px", marginBottom: "12px" } });
  var methods = [
    { id: "cash", label: "ጥሬ ገንዘብ" },
    { id: "bank", label: "በባንክ" },
    { id: "credit", label: "በዱቤ" }
  ];

  var bankSelectWrap = el("div", { style: { marginBottom: "12px", display: state.salePayMethod === "bank" ? "block" : "none" } });
  var bankSelect = createCustomSelect({
    placeholder: "ባንክ ይምረጡ",
    label: "የክፍያ ባንክ ይምረጡ",
    value: state.saleBankName || BANK_NAMES[0],
    options: BANK_NAMES.map(function (b) { return { value: b, label: b }; })
  });
  bankSelect.addEventListener("change", function () { state.saleBankName = bankSelect.value; });
  bankSelectWrap.appendChild(el("label", { style: { fontSize: "11.5px", fontWeight: "700", display: "block", marginBottom: "4px" } }, "ባንክ ይምረጡ:"));
  bankSelectWrap.appendChild(bankSelect);

  var pillButtons = [];
  methods.forEach(function (m) {
    var isM = state.salePayMethod === m.id;
    var pill = el("button", {
      type: "button",
      class: "btn btn-sm",
      style: {
        flex: "1",
        fontSize: "12.5px",
        fontWeight: "800",
        padding: "8px 4px",
        borderRadius: "8px",
        background: isM ? "#1e293b" : "#ffffff",
        color: isM ? "#ffffff" : "#475569",
        border: "1.5px solid " + (isM ? "#1e293b" : "#cbd5e1")
      }
    }, m.label);
    pill.addEventListener("click", function () {
      state.salePayMethod = m.id;
      bankSelectWrap.style.display = m.id === "bank" ? "block" : "none";
      pillButtons.forEach(function (pb) {
        var sel = state.salePayMethod === pb.id;
        pb.btn.style.background = sel ? "#1e293b" : "#ffffff";
        pb.btn.style.color = sel ? "#ffffff" : "#475569";
        pb.btn.style.borderColor = sel ? "#1e293b" : "#cbd5e1";
      });
      var tot = getCartTotalCents();
      if (m.id === "cash" || m.id === "bank") {
        paidInput.value = (tot / 100).toFixed(2);
        state.saleAmountPaid = paidInput.value;
      } else if (m.id === "credit") {
        if (toCents(paidInput.value) >= tot && tot > 0) {
          paidInput.value = "0.00";
          state.saleAmountPaid = "0.00";
        }
      }
      renderCartView();
    });
    pillButtons.push({ id: m.id, btn: pill });
    payMethodRow.appendChild(pill);
  });
  checkoutSection.appendChild(payMethodRow);
  checkoutSection.appendChild(bankSelectWrap);

  // 4.1 "የተከፈለ" (Amount Paid Input Field)
  var paidRow = el("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      marginBottom: "8px"
    }
  });

  paidRow.appendChild(el("label", {
    style: { fontWeight: "800", fontSize: "13.5px", color: "#1e293b" }
  }, "💵 የተከፈለ መጠን:"));

  var paidInputWrap = el("div", { style: { display: "flex", alignItems: "center", gap: "6px" } });
  var paidInput = el("input", {
    class: "input",
    type: "number",
    step: "0.01",
    min: "0",
    value: state.saleAmountPaid,
    style: { width: "120px", textAlign: "right", fontWeight: "800", fontSize: "15px", color: "#16a34a", padding: "6px 8px" }
  });

  var fullPayBtn = el("button", {
    type: "button",
    class: "btn btn-outline btn-sm",
    style: { fontSize: "11px", padding: "6px 8px", whiteSpace: "nowrap" }
  }, "ሙሉ ክፍያ");

  paidInputWrap.appendChild(paidInput);
  paidInputWrap.appendChild(fullPayBtn);
  paidRow.appendChild(paidInputWrap);
  checkoutSection.appendChild(paidRow);

  // Live Payment Status Indicator
  var payStatusIndicator = el("div", {
    style: {
      fontSize: "12px",
      fontWeight: "700",
      textAlign: "right",
      marginBottom: "12px"
    }
  });
  checkoutSection.appendChild(payStatusIndicator);

  // 4.2 Centered, rounded action button labeled "ሽያጭ አጠናቅ" (Complete Sale - Primary Action Button)
  var completeSaleBtn = el("button", {
    class: "btn btn-emerald",
    type: "button",
    style: {
      width: "100%",
      maxWidth: "340px",
      margin: "12px auto 0",
      display: "block",
      textAlign: "center",
      padding: "13px 20px",
      fontSize: "16px",
      fontWeight: "900",
      borderRadius: "14px",
      boxShadow: "0 4px 14px rgba(16,185,129,0.35)",
      letterSpacing: "0.2px"
    }
  }, "✓ ሽያጭ አጠናቅ");

  checkoutSection.appendChild(completeSaleBtn);
  formCard.appendChild(checkoutSection);
  container.appendChild(formCard);

  function getCartTotalCents() {
    return state.activeSaleCart.reduce(function (sum, it) { return sum + it.totalCents; }, 0);
  }

  function renderCartView() {
    clear(cartBox);
    var cart = state.activeSaleCart;
    var grandTotalCents = getCartTotalCents();

    if (cart.length === 0) {
      cartBox.appendChild(el("div", {
        style: {
          textAlign: "center",
          padding: "20px 12px",
          color: "#94a3b8",
          background: "#f8fafc",
          borderRadius: "12px",
          border: "1px dashed #cbd5e1",
          fontSize: "12.5px"
        }
      }, "እስካሁን ምንም ዕቃ አልተመረጠም። ከላይ ዕቃ መርጠው '+ ጨምር' ይጫኑ"));
    } else {
      var table = el("table", {
        style: { width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "8px" }
      });
      var thead = el("thead", {}, [
        el("tr", { style: { borderBottom: "1.5px solid #cbd5e1", color: "#64748b" } }, [
          el("th", { style: { textAlign: "left", padding: "6px" } }, "የዕቃ ስም"),
          el("th", { style: { textAlign: "center", padding: "6px" } }, "ብዛት"),
          el("th", { style: { textAlign: "right", padding: "6px" } }, "ነጠላ ዋጋ"),
          el("th", { style: { textAlign: "right", padding: "6px" } }, "ድምር"),
          el("th", { style: { width: "30px" } }, "")
        ])
      ]);
      table.appendChild(thead);

      var tbody = el("tbody");
      cart.forEach(function (row, idx) {
        var tr = el("tr", { style: { borderBottom: "1px solid #f1f5f9" } });
        tr.appendChild(el("td", { style: { padding: "8px 6px", fontWeight: "700" } }, row.name));

        // Inline quantity adjustment controls
        var qtyCell = el("td", { style: { padding: "8px 6px", textAlign: "center" } });
        var qtyWrap = el("div", { style: { display: "inline-flex", alignItems: "center", gap: "4px" } });
        var minusBtn = el("button", {
          type: "button",
          style: { width: "22px", height: "22px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer", fontWeight: "900", lineHeight: "1" }
        }, "−");
        minusBtn.addEventListener("click", function () {
          if (row.qty > 1) {
            row.qty -= 1;
            row.totalCents = row.qty * row.unitPriceCents;
          } else {
            state.activeSaleCart.splice(idx, 1);
          }
          renderCartView();
        });
        var qtyVal = el("span", { style: { minWidth: "22px", textAlign: "center", fontWeight: "800", fontSize: "13px" } }, String(row.qty));
        var plusBtn = el("button", {
          type: "button",
          style: { width: "22px", height: "22px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer", fontWeight: "900", lineHeight: "1" }
        }, "+");
        plusBtn.addEventListener("click", function () {
          row.qty += 1;
          row.totalCents = row.qty * row.unitPriceCents;
          renderCartView();
        });
        qtyWrap.appendChild(minusBtn);
        qtyWrap.appendChild(qtyVal);
        qtyWrap.appendChild(plusBtn);
        qtyCell.appendChild(qtyWrap);
        tr.appendChild(qtyCell);

        tr.appendChild(el("td", { style: { padding: "8px 6px", textAlign: "right" } }, fmt(row.unitPriceCents)));
        tr.appendChild(el("td", { style: { padding: "8px 6px", textAlign: "right", fontWeight: "800", color: "#1e3a8a" } }, fmt(row.totalCents)));

        var delBtn = el("button", {
          class: "trash-btn",
          style: { padding: "3px 6px", fontSize: "12px" },
          title: "አስወግድ"
        }, "✕");
        delBtn.addEventListener("click", function () {
          state.activeSaleCart.splice(idx, 1);
          renderCartView();
        });
        tr.appendChild(el("td", { style: { textAlign: "center" } }, delBtn));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      cartBox.appendChild(table);

      // Cart Total Summary Bar
      var totalBar = el("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#ecfdf5",
          border: "1.5px solid #a7f3d0",
          borderRadius: "10px",
          padding: "10px 14px"
        }
      }, [
        el("span", { style: { fontWeight: "800", color: "#065f46", fontSize: "13px" } }, "ጠቅላላ የሽያጭ ዋጋ:"),
        el("span", { style: { fontWeight: "900", color: "#047857", fontSize: "16px" } }, fmt(grandTotalCents))
      ]);
      cartBox.appendChild(totalBar);
    }

    // Update payment indicator
    var paidCents = toCents(paidInput.value);
    if (grandTotalCents > 0) {
      if (paidCents >= grandTotalCents) {
        var changeCents = paidCents - grandTotalCents;
        payStatusIndicator.innerHTML = '<span style="color:#16a34a;">✓ ሙሉ በሙሉ ተከፍሏል</span>' + (changeCents > 0 ? (' <span style="color:#2563eb;">(ተመላሽ / Change: ' + fmt(changeCents) + ')</span>') : '');
      } else {
        var debitRemCents = grandTotalCents - paidCents;
        payStatusIndicator.innerHTML = '<span style="color:#dc2626;">⚠️ ቀሪ ዱቤ (Debit): ' + fmt(debitRemCents) + '</span>';
      }
    } else {
      payStatusIndicator.textContent = "";
    }
  }

  paidInput.addEventListener("input", function () {
    state.saleAmountPaid = paidInput.value;
    renderCartView();
  });

  fullPayBtn.addEventListener("click", function () {
    var tot = getCartTotalCents();
    paidInput.value = (tot / 100).toFixed(2);
    state.saleAmountPaid = paidInput.value;
    renderCartView();
  });

  renderCartView();

  // Complete Sale Action Handler - Combines all items into ONE single receipt / sale record
  completeSaleBtn.addEventListener("click", guarded(function () {
    var cart = state.activeSaleCart;
    if (cart.length === 0) {
      showToast("እባክዎ መጀመሪያ ቢያንስ አንድ ዕቃ ወደ ጋሪ ይጨምሩ");
      return;
    }

    var grandTotalCents = getCartTotalCents();
    var paidCents = toCents(paidInput.value);

    var customerName = (state.saleCustomer || "").trim();
    var customerPhone = (state.salePhone || (custPhoneInput && custPhoneInput.value) || "").trim();

    // Mandatory Customer Validation for Credit Sales
    if (state.salePayMethod === "credit") {
      if (!customerName || customerName === "ስም ያልገለጸ ደንበኛ" || !customerPhone) {
        showToast("እባክዎን የደንበኛውን ስምና ስልክ ቁጥር ይሙሉ/ይምረጡ!");
        return;
      }
    }

    if (!customerName) {
      customerName = "ስም ያልገለጸ ደንበኛ";
    }

    var finalMethod = state.salePayMethod || "cash";
    var isFullyPaid = false;

    // When "ጥሬ ገንዘብ" or "በባንክ" is selected, automatically set paidAmount equal to totalAmount and register the transaction status as "Paid" (የተከፈለ).
    // Only record as "በዱቤ" when the user explicitly clicks the "በዱቤ" option.
    if (finalMethod === "cash" || finalMethod === "bank") {
      paidCents = grandTotalCents;
      paidInput.value = (grandTotalCents / 100).toFixed(2);
      isFullyPaid = true;
    } else {
      finalMethod = "credit";
      isFullyPaid = paidCents >= grandTotalCents;
    }

    var saleDate = todayISO();
    var createdSaleRecord = null;

    setData(function (data) {
      if (!Array.isArray(data.sales)) data.sales = [];
      if (!Array.isArray(data.customers)) data.customers = [];

      // If customer provided, register or update customer record
      if (customerName && customerName !== "ስም ያልገለጸ ደንበኛ") {
        var existCust = data.customers.find(function (c) { return c.name.toLowerCase() === customerName.toLowerCase(); });
        if (!existCust) {
          data.customers.push({
            id: uid(),
            name: customerName,
            phone: customerPhone,
            balanceCents: Math.max(0, grandTotalCents - paidCents),
            createdAt: Date.now()
          });
        } else {
          if (customerPhone && !existCust.phone) existCust.phone = customerPhone;
          if (!isFullyPaid) {
            existCust.balanceCents = (existCust.balanceCents || 0) + (grandTotalCents - paidCents);
          }
        }
      }

      // Order ID generation
      var orderNum = data.sales.length + 1;
      var orderId = "ORD-" + (1000 + orderNum);

      var primaryItem = cart[0];
      var totalQty = cart.reduce(function (sum, c) { return sum + c.qty; }, 0);
      var displayItemName = cart.length === 1
        ? primaryItem.name
        : (primaryItem.name + " (" + primaryItem.qty + ") እና ሌሎች " + (cart.length - 1) + " ዕቃዎች");

      // Combine items bought in the same transaction into ONE overall Receipt / Sale record
      createdSaleRecord = {
        id: uid(),
        orderId: orderId,
        orderNumber: orderNum,
        customer: customerName,
        customerPhone: customerPhone,
        paymentMethod: finalMethod,
        bankName: finalMethod === "bank" ? state.saleBankName : "",
        items: cart.map(function (c) {
          return {
            itemId: c.itemId,
            name: c.name,
            itemName: c.name,
            code: c.code || "",
            qty: c.qty,
            unitPriceCents: c.unitPriceCents,
            costPriceCents: c.costPriceCents || 0,
            totalCents: c.totalCents
          };
        }),
        itemId: primaryItem.itemId,
        itemName: displayItemName,
        qty: totalQty,
        unitPriceCents: cart.length === 1 ? primaryItem.unitPriceCents : 0,
        costPriceCents: cart.length === 1 ? (primaryItem.costPriceCents || 0) : 0,
        totalCents: grandTotalCents,
        advanceCents: paidCents,
        creditRemainingCents: Math.max(0, grandTotalCents - paidCents),
        paid: isFullyPaid,
        date: saleDate,
        createdAt: Date.now()
      };

      data.sales.unshift(createdSaleRecord);
      return data;
    });

    showToast("✓ ሽያጩ በተሳካ ሁኔታ ተጠናቋል!");

    // Instant Receipt Prompt Modal
    openSheet("የተጠናቀቀ ሽያጭ ደረሰኝ", function (body, close) {
      body.appendChild(el("div", {
        style: { textAlign: "center", padding: "16px 8px" }
      }, [
        el("div", { style: { fontSize: "40px", marginBottom: "8px" } }, "🎉"),
        el("div", { style: { fontWeight: "900", fontSize: "16px", color: "#166534" } }, "ሽያጩ በተሳካ ሁኔታ ተመዝግቧል!"),
        el("div", { style: { fontSize: "13px", color: "#475569", marginTop: "4px" } }, "ትዕዛዝ: " + (createdSaleRecord ? createdSaleRecord.orderId : "") + " · ጠቅላላ ሂሳብ: " + fmt(grandTotalCents) + " · የተከፈለ: " + fmt(paidCents)),
        el("button", {
          class: "btn btn-primary",
          style: { width: "100%", marginTop: "18px", padding: "12px", fontSize: "14px", fontWeight: "800" },
          onclick: function () {
            close();
            if (createdSaleRecord) {
              exportPrintableReceipt(state.data, createdSaleRecord, showToast);
            }
          }
        }, "🖨️ ይፋዊ የሽያጭ ደረሰኝ አትም / Save PDF")
      ]));
    });

    // Reset Sales State & Cart
    state.activeSaleCart = [];
    state.saleCustomer = "";
    state.salePhone = "";
    state.saleAmountPaid = "0.00";
    if (custPhoneInput) custPhoneInput.value = "";
    if (typeof updateCustTriggerUI === "function") updateCustTriggerUI();
    renderCartView();
  }));
}

function fmtNum(cents) {
  var whole = Math.floor((Number(cents) || 0) / 100);
  return whole.toLocaleString("en-US");
}

function renderSalesHistoryTab(container) {
  var data = state.data;
  var allSales = Array.isArray(data.sales) ? data.sales.slice().reverse() : [];
  var todayISOStr = todayISO();
  var todaySales = allSales.filter(function (s) { return s.date === todayISOStr; });

  // 1. Search Bar directly below the tabs with placeholder "በስም በስልክ ፈልግ"
  var searchWrap = el("div", {
    style: {
      position: "relative",
      marginBottom: "14px"
    }
  });

  var searchInput = el("input", {
    type: "text",
    placeholder: "በስም በስልክ ፈልግ",
    value: state.salesSearchQuery || "",
    style: {
      width: "100%",
      padding: "10px 14px 10px 38px",
      background: "#f8fafc",
      border: "1px solid #cbd5e1",
      borderRadius: "10px",
      fontSize: "13px",
      color: "#0f172a",
      outline: "none",
      boxSizing: "border-box"
    }
  });

  var searchIcon = el("span", {
    style: {
      position: "absolute",
      left: "12px",
      top: "50%",
      transform: "translateY(-50%)",
      color: "#94a3b8",
      fontSize: "14px",
      pointerEvents: "none"
    }
  }, "🔍");

  searchWrap.appendChild(searchIcon);
  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);

  // 2. Summary stats for today
  var todayRev = todaySales.reduce(function (sum, s) { return sum + (s.totalCents || 0); }, 0);
  var todayPaid = todaySales.reduce(function (sum, s) {
    var adv = s.advanceCents !== undefined ? s.advanceCents : (s.paid ? s.totalCents : 0);
    return sum + (adv || 0);
  }, 0);
  var todayCredit = Math.max(0, todayRev - todayPaid);

  var summaryBar = el("div", {
    class: "card section",
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderRadius: "14px",
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
      gap: "10px",
      marginBottom: "14px"
    }
  }, [
    el("div", { style: { flex: "1", minWidth: "80px" } }, [
      el("div", { style: { fontSize: "11px", fontWeight: "700", color: "#64748b" } }, "የዛሬ ሽያጭ"),
      el("div", { style: { fontSize: "15px", fontWeight: "900", color: "#0f172a", marginTop: "2px" } }, fmt(todayRev))
    ]),
    el("div", { style: { width: "1px", height: "26px", background: "#e2e8f0" } }),
    el("div", { style: { flex: "1", minWidth: "80px" } }, [
      el("div", { style: { fontSize: "11px", fontWeight: "700", color: "#16a34a" } }, "የተሰበሰበ"),
      el("div", { style: { fontSize: "15px", fontWeight: "900", color: "#15803d", marginTop: "2px" } }, fmt(todayPaid))
    ]),
    el("div", { style: { width: "1px", height: "26px", background: "#e2e8f0" } }),
    el("div", { style: { flex: "1", minWidth: "80px" } }, [
      el("div", { style: { fontSize: "11px", fontWeight: "700", color: todayCredit > 0 ? "#dc2626" : "#64748b" } }, "ቀሪ ዱቤ"),
      el("div", { style: { fontSize: "15px", fontWeight: "900", color: todayCredit > 0 ? "#b91c1c" : "#64748b", marginTop: "2px" } }, fmt(todayCredit))
    ])
  ]);
  container.appendChild(summaryBar);

  // Cards container
  var listContainer = el("div", { class: "sales-cards-container" });
  container.appendChild(listContainer);

  function renderList() {
    clear(listContainer);
    var query = (state.salesSearchQuery || "").trim().toLowerCase();
    var filtered = todaySales;
    if (query) {
      filtered = allSales.filter(function (s) {
        var cust = (s.customer || "").toLowerCase();
        var phone = (s.customerPhone || "").toLowerCase();
        var oid = (s.orderId || "").toLowerCase();
        var matchItem = Array.isArray(s.items) && s.items.some(function (it) {
          return (it.name || it.itemName || "").toLowerCase().indexOf(query) !== -1;
        });
        return cust.indexOf(query) !== -1 || phone.indexOf(query) !== -1 || oid.indexOf(query) !== -1 || matchItem;
      });
    }

    if (filtered.length === 0) {
      listContainer.appendChild(el("div", {
        class: "card",
        style: { textAlign: "center", padding: "32px 16px", color: "#94a3b8", borderRadius: "14px", border: "1px dashed #cbd5e1" }
      }, [
        el("div", { style: { fontSize: "28px", marginBottom: "8px" } }, "🧾"),
        el("div", { style: { fontWeight: "700", fontSize: "14px", color: "#64748b" } }, query ? "የተፈለገው ሽያጭ አልተገኘም" : "ዛሬ እስካሁን የተመዘገበ ሽያጭ የለም"),
        el("div", { style: { fontSize: "12px", marginTop: "4px" } }, query ? "እባክዎ ሌላ ስም ወይም ስልክ ፈልገው ይሞክሩ" : "አዲስ ሽያጭ ለመመዝገብ ወደ 'ሽያጭ' ትር ይመለሱ")
      ]));
      return;
    }

    filtered.forEach(function (s) {
      var custName = s.customer || "ስም ያልገለጸ ደንበኛ";
      var custPhone = s.customerPhone || "";
      var isCredit = s.paymentMethod === "credit" || (!s.paid && (s.creditRemainingCents > 0 || (s.totalCents - (s.advanceCents || 0)) > 0));
      var badgeText = isCredit ? "ዱቤ" : (s.paymentMethod === "bank" ? "ባንክ" : "ካሽ");
      var badgeStyle = isCredit
        ? { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }
        : (s.paymentMethod === "bank"
          ? { background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe" }
          : { background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" });

      var items = Array.isArray(s.items) && s.items.length > 0 ? s.items : [{
        name: s.itemName,
        qty: s.qty,
        unitPriceCents: s.unitPriceCents,
        totalCents: s.totalCents
      }];

      var paidAmt = s.advanceCents !== undefined ? s.advanceCents : (s.paid ? s.totalCents : 0);
      var remDebit = s.paid ? 0 : (s.creditRemainingCents !== undefined ? s.creditRemainingCents : Math.max(0, s.totalCents - paidAmt));

      // Compact Transaction Card Layout
      var card = el("div", {
        class: "card",
        style: {
          padding: "14px 16px",
          borderRadius: "14px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          marginBottom: "12px"
        }
      });

      // 1. Header Row: Customer Name, Phone Number, Status Badge
      var headerRow = el("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "8px",
          marginBottom: "10px",
          borderBottom: "1px solid #f1f5f9"
        }
      }, [
        el("div", { style: { display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" } }, [
          el("span", { style: { fontWeight: "900", fontSize: "14.5px", color: "#0f172a" } }, custName),
          custPhone ? el("span", { style: { fontSize: "12px", color: "#64748b", fontWeight: "600" } }, custPhone) : null
        ].filter(Boolean)),
        el("span", {
          style: {
            fontSize: "11px",
            fontWeight: "800",
            padding: "2px 8px",
            borderRadius: "6px",
            background: badgeStyle.background,
            color: badgeStyle.color,
            border: badgeStyle.border
          }
        }, badgeText)
      ]);
      card.appendChild(headerRow);

      // 2. Body: Left Column (Items List), Right Column (Totals)
      var bodyRow = el("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px"
        }
      });

      // Left Column (Items List)
      var leftCol = el("div", { style: { flex: "1", minWidth: "0" } });
      leftCol.appendChild(el("div", {
        style: { fontSize: "11px", fontWeight: "800", color: "#64748b", marginBottom: "4px" }
      }, "ዕቃ"));

      var itemsWrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "3px" } });
      items.forEach(function (it) {
        var itLineTot = it.totalCents || (it.unitPriceCents * it.qty);
        var itemLine = el("div", {
          style: { fontSize: "12.5px", color: "#1e293b", fontWeight: "600" }
        }, (it.name || it.itemName) + " : × " + it.qty + "  (" + fmtNum(itLineTot) + " ብር)");
        itemsWrap.appendChild(itemLine);
      });
      leftCol.appendChild(itemsWrap);
      bodyRow.appendChild(leftCol);

      // Right Column (Totals)
      var rightCol = el("div", { style: { textAlign: "right", flexShrink: "0" } });
      rightCol.appendChild(el("div", {
        style: { fontWeight: "900", fontSize: "14px", color: "#0f172a" }
      }, "ጠቅላላ: " + fmtNum(s.totalCents)));

      if (isCredit && remDebit > 0) {
        rightCol.appendChild(el("div", {
          style: { fontSize: "12px", fontWeight: "800", color: "#dc2626", marginTop: "3px" }
        }, "ቀሪ: " + fmtNum(remDebit)));
      } else {
        rightCol.appendChild(el("div", {
          style: { fontSize: "12px", fontWeight: "800", color: "#16a34a", marginTop: "3px" }
        }, "ተከፍሏል: " + fmtNum(s.totalCents)));
      }
      bodyRow.appendChild(rightCol);
      card.appendChild(bodyRow);

      // 3. Bottom Right Actions: Inline icon buttons for Receipt (ደረሰኝ), Edit (እርምጃ), and Delete (ሰርዝ)
      var actionFooter = el("div", {
        style: {
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "6px",
          marginTop: "10px",
          paddingTop: "8px",
          borderTop: "1px dashed #f1f5f9"
        }
      });

      // ደረሰኝ
      var printBtn = el("button", {
        type: "button",
        class: "btn btn-outline btn-sm",
        style: {
          fontSize: "11px",
          padding: "4px 8px",
          borderRadius: "6px",
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
          fontWeight: "700"
        }
      }, [el("span", {}, "🖨️"), el("span", {}, "ደረሰኝ")]);
      printBtn.addEventListener("click", function () {
        exportPrintableReceipt(state.data, s, showToast);
      });

      // እርምጃ (Edit)
      var editBtn = el("button", {
        type: "button",
        class: "btn btn-outline btn-sm",
        style: {
          fontSize: "11px",
          padding: "4px 8px",
          borderRadius: "6px",
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
          fontWeight: "700"
        }
      }, [el("span", {}, "✏️"), el("span", {}, "እርምጃ")]);
      editBtn.addEventListener("click", function () { openEditSaleModal(s); });

      // ሰርዝ (Delete)
      var delBtn = el("button", {
        type: "button",
        class: "btn btn-outline btn-sm",
        style: {
          fontSize: "11px",
          padding: "4px 8px",
          borderRadius: "6px",
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
          fontWeight: "700",
          color: "#dc2626",
          borderColor: "#fecaca",
          background: "#fff5f5"
        }
      }, [el("span", {}, "🗑️"), el("span", {}, "ሰርዝ")]);
      delBtn.addEventListener("click", function () {
        showConfirmationDialog(
          "ይህ ሽያጭ ይሰረዝ?",
          custName + " የተደረገው ሽያጭ ይሰረዝ? ዕቃዎች ወደ ስቶክ ይመለሳሉ።",
          function () {
            setData(function (d) {
              d.sales = d.sales.filter(function (x) { return x.id !== s.id; });
              return d;
            });
            showToast("✓ ሽያጩ ተሰርዟል");
          }
        );
      });

      actionFooter.appendChild(printBtn);
      actionFooter.appendChild(editBtn);
      actionFooter.appendChild(delBtn);
      card.appendChild(actionFooter);

      listContainer.appendChild(card);
    });
  }

  searchInput.addEventListener("input", function (e) {
    state.salesSearchQuery = e.target.value;
    renderList();
  });

  renderList();

  // 3. Bottom Section: Include a button/link at the bottom for "ያለፉ የሽያጭ ታሪኮች"
  var pastSalesWrap = el("div", {
    style: {
      textAlign: "center",
      marginTop: "16px",
      marginBottom: "24px"
    }
  });

  var pastSalesBtn = el("button", {
    type: "button",
    class: "btn btn-outline",
    style: {
      width: "100%",
      padding: "11px 16px",
      borderRadius: "12px",
      fontSize: "13px",
      fontWeight: "800",
      color: "#1e3a8a",
      borderColor: "#bfdbfe",
      background: "#f0f7ff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px"
    }
  }, [
    el("span", {}, "📜"),
    el("span", {}, "ያለፉ የሽያጭ ታሪኮች")
  ]);

  pastSalesBtn.addEventListener("click", function () {
    openPastSalesHistoryModal();
  });

  pastSalesWrap.appendChild(pastSalesBtn);
  container.appendChild(pastSalesWrap);
}

// Backward compatibility alias
function renderTodaySalesTab(container) {
  renderSalesHistoryTab(container);
}

function openPastSalesHistoryModal() {
  openSheet("📜 ያለፉ የሽያጭ ታሪኮች", function (body, close) {
    var data = state.data;
    var allSales = Array.isArray(data.sales) ? data.sales.slice().reverse() : [];
    var filterPeriod = "all";
    var query = "";

    var headerBox = el("div", { style: { marginBottom: "14px" } });

    // Search bar
    var searchInput = el("input", {
      type: "text",
      placeholder: "በስም ወይም በስልክ ፈልግ...",
      style: { width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box", marginBottom: "8px" }
    });
    headerBox.appendChild(searchInput);

    // Period buttons
    var btnRow = el("div", { style: { display: "flex", gap: "6px" } });
    var periods = [
      { id: "all", label: "ሁሉም" },
      { id: "week", label: "የዚህ ሳምንት" },
      { id: "month", label: "የዚህ ወር" }
    ];
    periods.forEach(function (p) {
      var pBtn = el("button", {
        type: "button",
        class: "btn btn-outline btn-sm",
        style: { flex: "1", fontSize: "12px", fontWeight: "700" }
      }, p.label);
      pBtn.addEventListener("click", function () {
        filterPeriod = p.id;
        renderPastList();
      });
      btnRow.appendChild(pBtn);
    });
    headerBox.appendChild(btnRow);
    body.appendChild(headerBox);

    var listWrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } });
    body.appendChild(listWrap);

    function renderPastList() {
      clear(listWrap);
      var q = query.toLowerCase().trim();
      var now = Date.now();
      var filtered = allSales.filter(function (s) {
        if (filterPeriod === "week") {
          var dt = new Date(s.date || s.createdAt || now).getTime();
          if (now - dt > 86400000 * 7) return false;
        } else if (filterPeriod === "month") {
          var dt = new Date(s.date || s.createdAt || now).getTime();
          if (now - dt > 86400000 * 30) return false;
        }
        if (q) {
          var c = (s.customer || "").toLowerCase();
          var p = (s.customerPhone || "").toLowerCase();
          var itMatch = Array.isArray(s.items) && s.items.some(function (it) { return (it.name || it.itemName || "").toLowerCase().indexOf(q) !== -1; });
          return c.indexOf(q) !== -1 || p.indexOf(q) !== -1 || itMatch;
        }
        return true;
      });

      if (filtered.length === 0) {
        listWrap.appendChild(el("div", {
          style: { textAlign: "center", padding: "24px 10px", color: "#94a3b8", fontSize: "13px" }
        }, "ምንም የተመዘገበ ታሪክ አልተገኘም"));
        return;
      }

      var tot = filtered.reduce(function (sum, s) { return sum + (s.totalCents || 0); }, 0);
      listWrap.appendChild(el("div", {
        style: { fontSize: "12px", fontWeight: "800", color: "#475569", paddingBottom: "6px", borderBottom: "1px solid #e2e8f0" }
      }, "ጠቅላላ " + filtered.length + " ግብይቶች · ድምር፡ " + fmt(tot)));

      filtered.forEach(function (s) {
        var card = el("div", {
          class: "card",
          style: { padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }
        });
        var isCredit = s.paymentMethod === "credit" || (!s.paid && (s.creditRemainingCents > 0 || (s.totalCents - (s.advanceCents || 0)) > 0));
        var rem = s.paid ? 0 : (s.creditRemainingCents !== undefined ? s.creditRemainingCents : Math.max(0, s.totalCents - (s.advanceCents || 0)));

        card.appendChild(el("div", {
          style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }
        }, [
          el("span", { style: { fontWeight: "800", fontSize: "13px", color: "#0f172a" } }, (s.customer || "ስም ያልገለጸ ደንበኛ") + (s.customerPhone ? " (" + s.customerPhone + ")" : "")),
          el("span", { style: { fontSize: "11px", color: "#64748b" } }, s.date || "")
        ]));

        var items = Array.isArray(s.items) && s.items.length > 0 ? s.items : [{ name: s.itemName, qty: s.qty, totalCents: s.totalCents }];
        var itemsStr = items.map(function (it) { return (it.name || it.itemName) + " × " + it.qty; }).join(", ");
        card.appendChild(el("div", { style: { fontSize: "12px", color: "#334155", marginBottom: "6px" } }, itemsStr));

        var botRow = el("div", {
          style: { display: "flex", justifyContent: "space-between", alignItems: "center" }
        }, [
          el("div", {}, [
            el("span", { style: { fontWeight: "800", fontSize: "13px", color: "#0f172a" } }, "ጠቅላላ: " + fmt(s.totalCents)),
            isCredit && rem > 0 ? el("span", { style: { fontSize: "11px", color: "#dc2626", fontWeight: "700", marginLeft: "6px" } }, "ቀሪ: " + fmt(rem)) : null
          ].filter(Boolean)),
          el("button", {
            type: "button",
            class: "btn btn-outline btn-sm",
            style: { fontSize: "11px", padding: "3px 8px" }
          }, "🖨️ ደረሰኝ")
        ]);

        botRow.querySelector("button").addEventListener("click", function () {
          exportPrintableReceipt(state.data, s, showToast);
        });

        card.appendChild(botRow);
        listWrap.appendChild(card);
      });
    }

    searchInput.addEventListener("input", function (e) {
      query = e.target.value;
      renderPastList();
    });

    renderPastList();
  }, null, true);
}

function openSendMessageModal(custName, custPhone, remCents, orderId) {
  openSheet("✈️ Send Message / የክፍያ ማስታወሻ", function (body, close) {
    var form = el("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });

    var phoneClean = (custPhone || "").replace(/[^0-9+]/g, "");
    var defaultMsg = "ሰላም " + (custName || "ደንበኛ") + "፡ ቀሪ የዱቤ ሂሳብዎ " + fmt(remCents) + " ነው። እባክዎ ክፍያዎን ያጠናቁ። እናመሰግናለን!";

    var headerCard = el("div", {
      style: {
        background: "#f8fafc",
        padding: "12px",
        borderRadius: "10px",
        border: "1px solid #e2e8f0"
      }
    }, [
      el("div", { style: { fontWeight: "800", fontSize: "14px", color: "#0f172a" } }, custName || "ስም ያልገለጸ ደንበኛ"),
      el("div", { style: { fontSize: "12px", color: "#64748b", marginTop: "2px" } }, "📞 " + (custPhone || "ስልክ አልተመዘገበም") + (orderId ? " · ትዕዛዝ፡ " + orderId : "")),
      el("div", { style: { fontSize: "13px", fontWeight: "800", color: "#dc2626", marginTop: "4px" } }, "ያልተከፈለ ቀሪ ዱቤ፡ " + fmt(remCents))
    ]);
    form.appendChild(headerCard);

    var msgBox = el("div", {}, [
      el("label", { style: { fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" } }, "የመልዕክት ፅሁፍ"),
      el("textarea", {
        id: "debit-msg-text",
        rows: "4",
        style: { width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box", resize: "vertical" }
      }, defaultMsg)
    ]);
    form.appendChild(msgBox);

    var actionsWrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "6px" } });

    // 1. SMS Button
    var smsBtn = el("button", {
      type: "button",
      class: "btn btn-outline",
      style: { width: "100%", padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "13px", fontWeight: "700" }
    }, [el("span", {}, "📲"), el("span", {}, "በ SMS ላክ")]);
    smsBtn.addEventListener("click", function () {
      var msgVal = form.querySelector("#debit-msg-text").value;
      if (!phoneClean) {
        showToast("⚠️ የደንበኛው ስልክ ቁጥር አልተመዘገበም");
        return;
      }
      window.location.href = "sms:" + phoneClean + "?body=" + encodeURIComponent(msgVal);
    });
    actionsWrap.appendChild(smsBtn);

    // 2. WhatsApp Button
    var waBtn = el("button", {
      type: "button",
      class: "btn btn-outline",
      style: { width: "100%", padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "13px", fontWeight: "700", color: "#15803d", borderColor: "#bbf7d0" }
    }, [el("span", {}, "💬"), el("span", {}, "በ WhatsApp ላክ")]);
    waBtn.addEventListener("click", function () {
      var msgVal = form.querySelector("#debit-msg-text").value;
      if (!phoneClean) {
        showToast("⚠️ የደንበኛው ስልክ ቁጥር አልተመዘገበም");
        return;
      }
      var intl = phoneClean.startsWith("0") ? "251" + phoneClean.slice(1) : phoneClean;
      window.open("https://wa.me/" + intl + "?text=" + encodeURIComponent(msgVal), "_blank");
    });
    actionsWrap.appendChild(waBtn);

    // 3. Copy Text Button
    var copyBtn = el("button", {
      type: "button",
      class: "btn btn-outline",
      style: { width: "100%", padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "13px", fontWeight: "700" }
    }, [el("span", {}, "📋"), el("span", {}, "መልዕክቱን ኮፒ አድርግ")]);
    copyBtn.addEventListener("click", function () {
      var msgVal = form.querySelector("#debit-msg-text").value;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(msgVal);
      }
      showToast("✓ መልዕክቱ ኮፒ ተደርጓል");
    });
    actionsWrap.appendChild(copyBtn);

    form.appendChild(actionsWrap);
    body.appendChild(form);
  });
}

function openCollectPaymentModal(sale, onSaved) {
  openSheet("💰 የዱቤ ክፍያ መቀበያ", function (body, close) {
    var rem = sale.creditRemainingCents !== undefined ? sale.creditRemainingCents : Math.max(0, sale.totalCents - (sale.advanceCents || 0));
    var custName = sale.customer || "ስም ያልገለጸ ደንበኛ";

    var form = el("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });

    var infoCard = el("div", {
      style: {
        background: "#f0fdf4",
        padding: "12px",
        borderRadius: "10px",
        border: "1px solid #bbf7d0"
      }
    }, [
      el("div", { style: { fontWeight: "800", fontSize: "14px", color: "#0f172a" } }, custName),
      el("div", { style: { fontSize: "12px", color: "#64748b", marginTop: "2px" } }, "ጠቅላላ የሽያጭ ዋጋ፡ " + fmt(sale.totalCents)),
      el("div", { style: { fontSize: "14px", fontWeight: "900", color: "#dc2626", marginTop: "4px" } }, "ያልተከፈለ ቀሪ ዱቤ፡ " + fmt(rem))
    ]);
    form.appendChild(infoCard);

    // Amount collected input
    var amtField = el("div", {}, [
      el("label", { style: { fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" } }, "የተቀበሉት የብር መጠን (ብር) *"),
      el("input", {
        type: "number",
        step: "0.01",
        id: "collect-amount-input",
        value: (rem / 100).toFixed(2),
        style: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1.5px solid #cbd5e1", fontSize: "15px", fontWeight: "800", boxSizing: "border-box" }
      })
    ]);
    form.appendChild(amtField);

    // Quick Full / Partial buttons
    var quickBtns = el("div", { style: { display: "flex", gap: "8px" } }, [
      el("button", {
        type: "button",
        class: "btn btn-outline btn-sm",
        style: { flex: "1", fontSize: "12px", fontWeight: "700" }
      }, "ሙሉ ቀሪ (" + fmtNum(rem) + " ብር)"),
      el("button", {
        type: "button",
        class: "btn btn-outline btn-sm",
        style: { flex: "1", fontSize: "12px", fontWeight: "700" }
      }, "ግማሽ (" + fmtNum(Math.round(rem / 2)) + " ብር)")
    ]);
    quickBtns.children[0].addEventListener("click", function () {
      form.querySelector("#collect-amount-input").value = (rem / 100).toFixed(2);
    });
    quickBtns.children[1].addEventListener("click", function () {
      form.querySelector("#collect-amount-input").value = (Math.round(rem / 2) / 100).toFixed(2);
    });
    form.appendChild(quickBtns);

    // Payment Method
    var selectedMethod = "cash";
    var methodField = el("div", {}, [
      el("label", { style: { fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "6px" } }, "የክፍያ አይነት"),
      el("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" } }, [
        { id: "cash", label: "💵 ካሽ" },
        { id: "bank", label: "🏦 ባንክ" },
        { id: "telebirr", label: "📱 ቴሌብር" }
      ].map(function (m) {
        var mBtn = el("button", {
          type: "button",
          class: "btn btn-outline btn-sm",
          style: {
            padding: "8px 4px",
            fontSize: "12px",
            fontWeight: "700",
            background: selectedMethod === m.id ? "#10b981" : "#ffffff",
            color: selectedMethod === m.id ? "#ffffff" : "#475569",
            borderColor: selectedMethod === m.id ? "#10b981" : "#cbd5e1"
          }
        }, m.label);
        mBtn.addEventListener("click", function () {
          selectedMethod = m.id;
          Array.from(mBtn.parentElement.children).forEach(function (b) {
            b.style.background = "#ffffff";
            b.style.color = "#475569";
            b.style.borderColor = "#cbd5e1";
          });
          mBtn.style.background = "#10b981";
          mBtn.style.color = "#ffffff";
          mBtn.style.borderColor = "#10b981";
        });
        return mBtn;
      }))
    ]);
    form.appendChild(methodField);

    // Confirm button
    var submitBtn = el("button", {
      type: "button",
      class: "btn btn-emerald",
      style: { width: "100%", padding: "12px", fontSize: "14px", fontWeight: "800", marginTop: "10px" }
    }, "✓ ብር ተቀበልና መዝግብ");

    submitBtn.addEventListener("click", function () {
      var val = parseFloat(form.querySelector("#collect-amount-input").value);
      if (isNaN(val) || val <= 0) {
        showToast("⚠️ እባክዎ ትክክለኛ የብር መጠን ያስገቡ");
        return;
      }
      var payCents = toCents(val);

      setData(function (d) {
        var target = (d.sales || []).find(function (x) { return x.id === sale.id; });
        if (target) {
          var curAdv = target.advanceCents || 0;
          var newAdv = curAdv + payCents;
          target.advanceCents = newAdv;
          var newRem = Math.max(0, target.totalCents - newAdv);
          target.creditRemainingCents = newRem;
          if (newRem === 0 || newAdv >= target.totalCents) {
            target.paid = true;
          }
          if (!Array.isArray(target.paymentHistory)) target.paymentHistory = [];
          target.paymentHistory.push({
            date: todayISO(),
            amountCents: payCents,
            method: selectedMethod,
            timestamp: Date.now()
          });
        }
        return d;
      });

      close();
      showToast("✓ " + fmt(payCents) + " ክፍያ በተሳካ ሁኔታ ተመዝግቧል");
      if (typeof onSaved === "function") onSaved();
    });

    form.appendChild(submitBtn);
    body.appendChild(form);
  });
}

function renderDebitsTab(container) {
  var data = state.data;
  state.debitFilter = state.debitFilter || "all";

  var creditSales = (data.sales || []).filter(function (s) {
    return s.paymentMethod === "credit" || (!s.paid && (s.creditRemainingCents > 0 || (s.totalCents - (s.advanceCents || 0)) > 0));
  });

  if (!Array.isArray(data.sales) || data.sales.length === 0) {
    var samples = freshSalesSample();
    if (samples && samples.length > 0) {
      data.sales = samples;
      saveLocal(data);
      creditSales = (data.sales || []).filter(function (s) {
        return s.paymentMethod === "credit" || (!s.paid && (s.creditRemainingCents > 0 || (s.totalCents - (s.advanceCents || 0)) > 0));
      });
    }
  }

  var unpaidDebits = creditSales.filter(function (s) { return !s.paid; });
  var paidDebits = creditSales.filter(function (s) { return s.paid; });

  var totalUnpaidCents = unpaidDebits.reduce(function (sum, s) {
    var rem = s.creditRemainingCents !== undefined ? s.creditRemainingCents : (s.totalCents - (s.advanceCents || 0));
    return sum + (rem > 0 ? rem : 0);
  }, 0);

  var totalCollectedCents = creditSales.reduce(function (sum, s) {
    var adv = s.advanceCents || 0;
    if (s.paid) return sum + s.totalCents;
    return sum + adv;
  }, 0);

  // 1. Search Bar: Pill-shaped input "በስም በስልክ ፈልግ"
  var searchWrap = el("div", {
    style: {
      position: "relative",
      marginBottom: "14px",
      display: "flex",
      justifyContent: "center"
    }
  });

  var searchInput = el("input", {
    type: "text",
    placeholder: "በስም በስልክ ፈልግ",
    value: state.debitSearchQuery || "",
    style: {
      width: "100%",
      maxWidth: "360px",
      padding: "7px 18px",
      background: "#ffffff",
      border: "1.5px solid #cbd5e1",
      borderRadius: "9999px",
      fontSize: "13px",
      color: "#0f172a",
      outline: "none",
      textAlign: "center",
      boxSizing: "border-box"
    }
  });

  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);

  // 2. Top Two Summary Metric Cards (Exact layout from image)
  var summaryRow = el("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "12px",
      marginBottom: "14px"
    }
  });

  // Left Card: "የተሰበሰበ ዱቤ" / "ጠቅላላ፡ 2,000 ብር" with soft lavender border
  var leftCard = el("div", {
    class: "card",
    style: {
      background: "#ffffff",
      border: "2px solid #e9d5ff",
      borderRadius: "14px",
      padding: "10px 12px",
      textAlign: "center",
      boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
    }
  }, [
    el("div", { style: { fontSize: "13px", fontWeight: "800", color: "#334155" } }, "የተሰበሰበ ዱቤ"),
    el("div", { style: { fontSize: "12.5px", fontWeight: "800", color: "#0f172a", marginTop: "4px" } }, "ጠቅላላ፡ " + fmtNum(totalCollectedCents) + " ብር")
  ]);

  // Right Card: "ያልተሰበሰበ ቀሪ ዱቤ" / "ቀሪ፡ 10,500" with soft cyan border
  var rightCard = el("div", {
    class: "card",
    style: {
      background: "#ffffff",
      border: "2px solid #a5f3fc",
      borderRadius: "14px",
      padding: "10px 12px",
      textAlign: "center",
      boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
    }
  }, [
    el("div", { style: { fontSize: "13px", fontWeight: "800", color: "#334155" } }, "ያልተሰበሰበ ቀሪ ዱቤ"),
    el("div", { style: { fontSize: "12.5px", fontWeight: "800", color: "#0f172a", marginTop: "4px" } }, "ቀሪ፡ " + fmtNum(totalUnpaidCents))
  ]);

  summaryRow.appendChild(leftCard);
  summaryRow.appendChild(rightCard);
  container.appendChild(summaryRow);

  // 3. Filter Pills Bar (ሁሉም, ቀናቸው የደረሰ, ያለፈባቸው, ከፊል የከፈሉ)
  var filterWrap = el("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "4px",
      marginBottom: "14px",
      padding: "2px 0",
      overflowX: "auto"
    }
  });

  var filterDefs = [
    { id: "all", label: "ሁሉም" },
    { id: "due", label: "ቀናቸው የደረሰ" },
    { id: "overdue", label: "ያለፈባቸው" },
    { id: "partial", label: "ከፊል የከፈሉ" }
  ];

  filterDefs.forEach(function (f) {
    var isAct = state.debitFilter === f.id;
    var fBtn = el("button", {
      type: "button",
      style: {
        padding: isAct ? "4px 14px" : "4px 8px",
        borderRadius: "9999px",
        border: "none",
        background: isAct ? "#10b981" : "transparent",
        color: isAct ? "#ffffff" : "#475569",
        fontWeight: isAct ? "800" : "700",
        fontSize: "12px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 0.15s ease"
      }
    }, f.label);
    fBtn.addEventListener("click", function () {
      state.debitFilter = f.id;
      renderDebitsList();
      Array.from(filterWrap.children).forEach(function (c, idx) {
        var match = filterDefs[idx].id === f.id;
        c.style.background = match ? "#10b981" : "transparent";
        c.style.color = match ? "#ffffff" : "#475569";
        c.style.fontWeight = match ? "800" : "700";
        c.style.padding = match ? "4px 14px" : "4px 8px";
      });
    });
    filterWrap.appendChild(fBtn);
  });
  container.appendChild(filterWrap);

  // 4. Debit Cards Container
  var listCardContainer = el("div", { class: "debit-cards-container" });
  container.appendChild(listCardContainer);

  function renderDebitsList() {
    clear(listCardContainer);
    var query = (state.debitSearchQuery || "").trim().toLowerCase();
    var curFilter = state.debitFilter || "all";
    var todayStr = todayISO();

    var filtered = unpaidDebits.filter(function (s) {
      if (curFilter === "partial") {
        if (!s.advanceCents || s.advanceCents <= 0) return false;
      } else if (curFilter === "due") {
        var isDue = (s.dueDate && s.dueDate === todayStr) || (!s.dueDate && s.date === todayStr);
        if (!isDue) return false;
      } else if (curFilter === "overdue") {
        var isOver = (s.dueDate && s.dueDate < todayStr) || (!s.dueDate && daysBetween(s.date, todayStr) > 7);
        if (!isOver) return false;
      }
      if (query) {
        var c = (s.customer || "").toLowerCase();
        var p = (s.customerPhone || "").toLowerCase();
        return c.indexOf(query) !== -1 || p.indexOf(query) !== -1;
      }
      return true;
    });

    if (filtered.length === 0) {
      listCardContainer.appendChild(el("div", {
        class: "card",
        style: { textAlign: "center", padding: "30px 16px", color: "#94a3b8", borderRadius: "14px", border: "1px dashed #cbd5e1" }
      }, [
        el("div", { style: { fontSize: "28px", marginBottom: "8px" } }, "🎉"),
        el("div", { style: { fontWeight: "800", fontSize: "14px", color: "#64748b" } }, query ? "የተፈለገው ዱቤ አልተገኘም" : "ምንም ያልተሰበሰበ ቀሪ ዱቤ የለም!"),
        el("div", { style: { fontSize: "12px", marginTop: "4px" } }, "አዲስ የዱቤ ሽያጭ ሲመዘገብ እዚህ ዝርዝር ውስጥ ይታያል")
      ]));
      return;
    }

    filtered.forEach(function (s) {
      var custName = s.customer || "ረቢ ሰራጅ";
      var custPhone = s.customerPhone || "0712615908";
      var rem = s.creditRemainingCents !== undefined ? s.creditRemainingCents : Math.max(0, s.totalCents - (s.advanceCents || 0));

      var items = Array.isArray(s.items) && s.items.length > 0 ? s.items : [{
        name: s.itemName || "ጣሳ",
        qty: s.qty || 5,
        unitPriceCents: s.unitPriceCents || 100000,
        totalCents: s.totalCents || 500000
      }];

      // Debit Card Box (soft border matching Canva photo)
      var card = el("div", {
        class: "card",
        style: {
          background: "#ffffff",
          border: "1.5px solid #fecdd3",
          borderRadius: "14px",
          padding: "12px 14px",
          marginBottom: "14px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
        }
      });

      // Header Row: Customer Name, Phone, and Send Message Button
      var headerRow = el("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "8px",
          marginBottom: "8px",
          borderBottom: "1px solid #f1f5f9"
        }
      });

      var leftHeader = el("div", {
        style: { display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }
      }, [
        el("span", { style: { fontWeight: "900", fontSize: "14.5px", color: "#0f172a" } }, custName),
        el("span", { style: { fontWeight: "700", fontSize: "12px", color: "#0f172a" } }, "📞 " + custPhone)
      ]);

      var sendMsgBtn = el("button", {
        type: "button",
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "3px 10px",
          borderRadius: "9999px",
          border: "1px solid #cbd5e1",
          background: "#ffffff",
          fontSize: "11px",
          fontWeight: "700",
          color: "#475569",
          cursor: "pointer"
        }
      }, [
        el("span", { style: { fontSize: "11px" } }, "✈️"),
        el("span", {}, "Send Message")
      ]);
      sendMsgBtn.addEventListener("click", function () {
        openSendMessageModal(custName, custPhone, rem, s.orderId);
      });

      headerRow.appendChild(leftHeader);
      headerRow.appendChild(sendMsgBtn);
      card.appendChild(headerRow);

      // Body Row: Left items list, Right totals
      var bodyRow = el("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px"
        }
      });

      // Left Column (Items List)
      var leftCol = el("div", { style: { flex: "1", minWidth: "0" } });
      leftCol.appendChild(el("div", {
        style: { fontSize: "12px", fontWeight: "900", color: "#0f172a", marginBottom: "4px" }
      }, "ዕቃ"));

      var itemsListEl = el("div", { style: { display: "flex", flexDirection: "column", gap: "3px" } });
      items.forEach(function (it) {
        var itLineTot = it.totalCents || (it.unitPriceCents * it.qty);
        var itemLine = el("div", {
          style: { fontSize: "12.5px", color: "#0f172a", fontWeight: "700" }
        }, (it.name || it.itemName) + " : × " + it.qty + "   (" + fmtNum(itLineTot) + " ብር)");
        itemsListEl.appendChild(itemLine);
      });
      leftCol.appendChild(itemsListEl);
      bodyRow.appendChild(leftCol);

      // Right Column (Totals)
      var rightCol = el("div", { style: { textAlign: "right", flexShrink: "0" } });
      rightCol.appendChild(el("div", {
        style: { fontWeight: "900", fontSize: "14px", color: "#0f172a" }
      }, "ጠቅላላ፡ " + fmtNum(s.totalCents)));

      rightCol.appendChild(el("div", {
        style: { fontWeight: "900", fontSize: "14px", color: "#0f172a", marginTop: "4px" }
      }, "ቀሪ፡ " + fmtNum(rem)));

      bodyRow.appendChild(rightCol);
      card.appendChild(bodyRow);

      // Bottom Right Actions: "ደረሰኝ" link and solid green pill "ብር ተቀበል"
      var actionFooter = el("div", {
        style: {
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "12px",
          marginTop: "8px",
          paddingTop: "6px"
        }
      });

      // ደረሰኝ
      var printBtn = el("button", {
        type: "button",
        style: {
          background: "transparent",
          border: "none",
          fontSize: "12px",
          fontWeight: "700",
          color: "#475569",
          cursor: "pointer",
          padding: "4px 6px"
        }
      }, "ደረሰኝ");
      printBtn.addEventListener("click", function () {
        exportPrintableReceipt(state.data, s, showToast);
      });

      // ብር ተቀበል (Solid green pill button)
      var collectBtn = el("button", {
        type: "button",
        style: {
          background: "#10b981",
          color: "#ffffff",
          border: "none",
          borderRadius: "9999px",
          padding: "5px 16px",
          fontSize: "12.5px",
          fontWeight: "800",
          cursor: "pointer",
          boxShadow: "0 1px 3px rgba(16,185,129,0.3)"
        }
      }, "ብር ተቀበል");
      collectBtn.addEventListener("click", function () {
        openCollectPaymentModal(s, function () {
          renderApp();
        });
      });

      actionFooter.appendChild(printBtn);
      actionFooter.appendChild(collectBtn);
      card.appendChild(actionFooter);

      listCardContainer.appendChild(card);
    });
  }

  searchInput.addEventListener("input", function (e) {
    state.debitSearchQuery = e.target.value;
    renderDebitsList();
  });

  renderDebitsList();

  // 5. Bottom Section: Link/Button "🗓️ ያለፈ የሽያጭ ታሪኮች"
  var pastSalesWrap = el("div", {
    style: {
      textAlign: "center",
      marginTop: "24px",
      marginBottom: "24px"
    }
  });

  var pastSalesBtn = el("button", {
    type: "button",
    style: {
      background: "transparent",
      border: "none",
      fontSize: "13.5px",
      fontWeight: "800",
      color: "#0f172a",
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      cursor: "pointer",
      padding: "8px 16px"
    }
  }, [
    el("span", {}, "🗓️"),
    el("span", {}, "ያለፈ የሽያጭ ታሪኮች")
  ]);

  pastSalesBtn.addEventListener("click", function () {
    openPastSalesHistoryModal();
  });

  pastSalesWrap.appendChild(pastSalesBtn);
  container.appendChild(pastSalesWrap);
}

function renderCustomersTab(container) {
  var data = state.data;
  if (!Array.isArray(data.customers)) data.customers = [];

  // 1. Search Bar & Layout: Grey-style input field directly under tab bar with placeholder "በስም / በስልክ ፈልግ"
  var searchWrap = el("div", {
    style: {
      position: "relative",
      marginBottom: "14px"
    }
  });

  var searchInput = el("input", {
    type: "text",
    placeholder: "በስም / በስልክ ፈልግ",
    value: state.customerSearchQuery || "",
    style: {
      width: "100%",
      padding: "10px 14px 10px 38px",
      background: "#f1f5f9",
      border: "1px solid #cbd5e1",
      borderRadius: "10px",
      fontSize: "13px",
      color: "#0f172a",
      outline: "none",
      boxSizing: "border-box"
    }
  });

  var searchIcon = el("span", {
    style: {
      position: "absolute",
      left: "12px",
      top: "50%",
      transform: "translateY(-50%)",
      color: "#94a3b8",
      fontSize: "14px",
      pointerEvents: "none"
    }
  }, "🔍");

  searchWrap.appendChild(searchIcon);
  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);

  // Customer List Table Container
  var tableCard = el("div", {
    class: "card",
    style: {
      padding: "0",
      borderRadius: "14px",
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
      marginBottom: "80px"
    }
  });

  var tableWrap = el("div", { style: { overflowX: "auto" } });
  tableCard.appendChild(tableWrap);
  container.appendChild(tableCard);

  function renderTable() {
    clear(tableWrap);
    var query = (state.customerSearchQuery || "").trim().toLowerCase();
    var list = data.customers;
    if (query) {
      list = list.filter(function (c) {
        return (c.name || "").toLowerCase().indexOf(query) !== -1 ||
               (c.phone || "").toLowerCase().indexOf(query) !== -1 ||
               (c.address || "").toLowerCase().indexOf(query) !== -1;
      });
    }

    if (list.length === 0) {
      tableWrap.appendChild(el("div", {
        style: { textAlign: "center", padding: "36px 16px", color: "#94a3b8" }
      }, [
        el("div", { style: { fontSize: "28px", marginBottom: "8px" } }, "👥"),
        el("div", { style: { fontWeight: "700", fontSize: "14px", color: "#64748b" } }, query ? "የተፈለገው ደንበኛ አልተገኘም" : "እስካሁን የተመዘገበ ደንበኛ የለም"),
        el("div", { style: { fontSize: "12px", marginTop: "4px" } }, "ደንበኛ ለመመዝገብ ከታች ያለውን አረንጓዴ '+' ቁልፍ ይጫኑ")
      ]));
      return;
    }

    var table = el("table", {
      style: {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "13px"
      }
    });

    // Table Headers: "ስም", "ስልክ", "አድራሻ", and "እርምጃዎች" (Actions)
    var thead = el("thead", {}, [
      el("tr", { style: { background: "#f8fafc", borderBottom: "1.5px solid #e2e8f0" } }, [
        el("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: "800", color: "#475569", fontSize: "12px" } }, "ስም"),
        el("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: "800", color: "#475569", fontSize: "12px" } }, "ስልክ"),
        el("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: "800", color: "#475569", fontSize: "12px" } }, "አድራሻ"),
        el("th", { style: { padding: "10px 12px", textAlign: "right", fontWeight: "800", color: "#475569", fontSize: "12px" } }, "እርምጃዎች")
      ])
    ]);
    table.appendChild(thead);

    var tbody = el("tbody");
    list.forEach(function (c, idx) {
      var isEven = idx % 2 === 0;
      var tr = el("tr", {
        style: {
          background: isEven ? "#ffffff" : "#fcfcfd",
          borderBottom: "1px solid #f1f5f9",
          transition: "background 0.1s"
        }
      });

      // ስም (Name)
      tr.appendChild(el("td", {
        style: { padding: "12px", fontWeight: "800", color: "#0f172a", whiteSpace: "nowrap" }
      }, c.name || "—"));

      // ስልክ (Phone)
      tr.appendChild(el("td", {
        style: { padding: "12px", color: "#334155", fontWeight: "600", whiteSpace: "nowrap" }
      }, c.phone || "—"));

      // አድራሻ (Address)
      tr.appendChild(el("td", {
        style: { padding: "12px", color: "#64748b", whiteSpace: "nowrap" }
      }, c.address || "—"));

      // እርምጃዎች (Actions: Edit and Delete)
      var tdActions = el("td", {
        style: { padding: "12px", textAlign: "right", whiteSpace: "nowrap" }
      });

      var actionsWrap = el("div", {
        style: { display: "inline-flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }
      });

      // Edit (Pencil Icon)
      var editBtn = el("button", {
        type: "button",
        class: "btn btn-outline btn-sm",
        title: "አርም",
        style: {
          padding: "5px 8px",
          borderRadius: "6px",
          fontSize: "12px",
          color: "#2563eb",
          borderColor: "#bfdbfe",
          background: "#eff6ff",
          cursor: "pointer"
        }
      }, "✏️");
      editBtn.addEventListener("click", function () {
        openEditCustomerModal(c);
      });

      // Delete (Trash Icon)
      var delBtn = el("button", {
        type: "button",
        class: "btn btn-outline btn-sm",
        title: "ሰርዝ",
        style: {
          padding: "5px 8px",
          borderRadius: "6px",
          fontSize: "12px",
          color: "#dc2626",
          borderColor: "#fecaca",
          background: "#fef2f2",
          cursor: "pointer"
        }
      }, "🗑️");
      delBtn.addEventListener("click", function () {
        showConfirmationDialog(
          "ይህ ደንበኛ ይሰረዝ?",
          "ደንበኛ '" + (c.name || "ያልታወቀ") + "' ከዝርዝሩ ይሰረዝ?",
          function () {
            setData(function (d) {
              d.customers = (d.customers || []).filter(function (x) { return x.id !== c.id; });
              return d;
            });
            showToast("✓ ደንበኛው ተሰርዟል");
          }
        );
      });

      actionsWrap.appendChild(editBtn);
      actionsWrap.appendChild(delBtn);
      tdActions.appendChild(actionsWrap);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
  }

  searchInput.addEventListener("input", function (e) {
    state.customerSearchQuery = e.target.value;
    renderTable();
  });

  renderTable();

  // 4. Floating Add Button: Green FAB with '+' icon at bottom right corner
  var fab = el("button", {
    type: "button",
    id: "add-customer-fab",
    style: {
      position: "fixed",
      bottom: "85px",
      right: "20px",
      width: "52px",
      height: "52px",
      borderRadius: "50%",
      background: "#10b981",
      color: "#ffffff",
      border: "none",
      boxShadow: "0 4px 14px rgba(16,185,129,0.45)",
      fontSize: "26px",
      fontWeight: "800",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      zIndex: "60",
      transition: "transform 0.15s ease, background 0.15s ease"
    },
    title: "አዲስ ደንበኛ መዝግብ"
  }, "+");

  fab.addEventListener("click", function () {
    openAddCustomerModal();
  });

  container.appendChild(fab);
}

function openAddCustomerModal(onSaved) {
  openSheet("👤 አዲስ ደንበኛ መዝግብ", function (body, close) {
    var form = el("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });

    // Name
    var nameField = el("div", {}, [
      el("label", { style: { fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" } }, "የደንበኛው ስም *"),
      el("input", {
        type: "text",
        id: "cust-add-name",
        placeholder: "ምሳሌ፡ ረቢ ሰራጅ",
        style: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }
      })
    ]);
    form.appendChild(nameField);

    // Phone
    var phoneField = el("div", {}, [
      el("label", { style: { fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" } }, "ስልክ ቁጥር"),
      el("input", {
        type: "tel",
        id: "cust-add-phone",
        placeholder: "ምሳሌ፡ 0712615908",
        style: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }
      })
    ]);
    form.appendChild(phoneField);

    // Address
    var addrField = el("div", {}, [
      el("label", { style: { fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" } }, "አድራሻ / አካባቢ"),
      el("input", {
        type: "text",
        id: "cust-add-addr",
        placeholder: "ምሳሌ፡ ፍጬ ወይም ሱቅ 01 አጠገብ",
        style: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }
      })
    ]);
    form.appendChild(addrField);

    // Notes
    var notesField = el("div", {}, [
      el("label", { style: { fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" } }, "ተጨማሪ ማስታወሻ"),
      el("input", {
        type: "text",
        id: "cust-add-notes",
        placeholder: "ምሳሌ፡ መደበኛ ታማኝ ደንበኛ",
        style: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }
      })
    ]);
    form.appendChild(notesField);

    // Save button
    var saveBtn = el("button", {
      type: "button",
      class: "btn btn-emerald",
      style: { width: "100%", padding: "12px", fontSize: "14px", fontWeight: "800", marginTop: "8px" }
    }, "✓ ደንበኛውን መዝግብ");

    saveBtn.addEventListener("click", function () {
      var nameVal = form.querySelector("#cust-add-name").value.trim();
      var phoneVal = form.querySelector("#cust-add-phone").value.trim();
      var addrVal = form.querySelector("#cust-add-addr").value.trim();
      var notesVal = form.querySelector("#cust-add-notes").value.trim();

      if (!nameVal) {
        showToast("⚠️ እባክዎ የደንበኛውን ስም ያስገቡ");
        return;
      }

      setData(function (d) {
        if (!Array.isArray(d.customers)) d.customers = [];
        d.customers.push({
          id: uid(),
          name: nameVal,
          phone: phoneVal,
          address: addrVal,
          notes: notesVal,
          createdAt: Date.now()
        });
        return d;
      });

      close();
      showToast("✓ አዲስ ደንበኛ ተመዝግቧል");
      if (typeof onSaved === "function") onSaved();
    });

    form.appendChild(saveBtn);
    body.appendChild(form);
  });
}

function openEditCustomerModal(cust, onSaved) {
  openSheet("✏️ ደንበኛ አርም", function (body, close) {
    var form = el("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });

    // Name
    var nameField = el("div", {}, [
      el("label", { style: { fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" } }, "የደንበኛው ስም *"),
      el("input", {
        type: "text",
        id: "cust-edit-name",
        value: cust.name || "",
        style: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }
      })
    ]);
    form.appendChild(nameField);

    // Phone
    var phoneField = el("div", {}, [
      el("label", { style: { fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" } }, "ስልክ ቁጥር"),
      el("input", {
        type: "tel",
        id: "cust-edit-phone",
        value: cust.phone || "",
        style: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }
      })
    ]);
    form.appendChild(phoneField);

    // Address
    var addrField = el("div", {}, [
      el("label", { style: { fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" } }, "አድራሻ / አካባቢ"),
      el("input", {
        type: "text",
        id: "cust-edit-addr",
        value: cust.address || "",
        style: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }
      })
    ]);
    form.appendChild(addrField);

    // Notes
    var notesField = el("div", {}, [
      el("label", { style: { fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" } }, "ተጨማሪ ማስታወሻ"),
      el("input", {
        type: "text",
        id: "cust-edit-notes",
        value: cust.notes || "",
        style: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }
      })
    ]);
    form.appendChild(notesField);

    // Save button
    var saveBtn = el("button", {
      type: "button",
      class: "btn btn-emerald",
      style: { width: "100%", padding: "12px", fontSize: "14px", fontWeight: "800", marginTop: "8px" }
    }, "✓ ለውጡን መዝግብ");

    saveBtn.addEventListener("click", function () {
      var nameVal = form.querySelector("#cust-edit-name").value.trim();
      var phoneVal = form.querySelector("#cust-edit-phone").value.trim();
      var addrVal = form.querySelector("#cust-edit-addr").value.trim();
      var notesVal = form.querySelector("#cust-edit-notes").value.trim();

      if (!nameVal) {
        showToast("⚠️ እባክዎ የደንበኛውን ስም ያስገቡ");
        return;
      }

      setData(function (d) {
        var target = (d.customers || []).find(function (x) { return x.id === cust.id; });
        if (target) {
          target.name = nameVal;
          target.phone = phoneVal;
          target.address = addrVal;
          target.notes = notesVal;
        }
        return d;
      });

      close();
      showToast("✓ የደንበኛው መረጃ ተስተካክሏል");
      if (typeof onSaved === "function") onSaved();
    });

    form.appendChild(saveBtn);
    body.appendChild(form);
  });
}

function openEditSaleModal(sale) {
  var custInput, errBox;
  var items = Array.isArray(sale.items) && sale.items.length > 0 ? sale.items : [{
    itemId: sale.itemId,
    name: sale.itemName,
    itemName: sale.itemName,
    qty: sale.qty,
    unitPriceCents: sale.unitPriceCents,
    totalCents: sale.totalCents
  }];

  var itemInputs = [];

  openSheet("ሽያጭ አርም (" + (sale.orderId || sale.itemName) + ")", function (body) {
    body.appendChild(el("div", { class: "helpmsg" }, "የደንበኛ መረጃ እና የሽያጭ ዝርዝር ያስተካክሉ። ስቶክ እና ካፒታል ራሳቸው ይስተካከላሉ።"));
    custInput = el("input", { class: "input", value: sale.customer || "" });
    body.appendChild(Field("የደንበኛ ስም", false, custInput));

    body.appendChild(el("div", { style: { fontWeight: "800", fontSize: "12px", color: "#475569", marginTop: "12px", marginBottom: "6px" } }, "የዕቃዎች ዝርዝር:"));

    items.forEach(function (it, idx) {
      var itBox = el("div", {
        style: {
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "10px",
          marginBottom: "8px"
        }
      });
      itBox.appendChild(el("div", { style: { fontWeight: "800", fontSize: "13px", color: "#1e293b", marginBottom: "6px" } }, (it.name || it.itemName)));

      var row = el("div", { style: { display: "flex", gap: "8px" } });
      var qInp = el("input", { class: "input", type: "number", min: "1", value: it.qty, style: { flex: "1" } });
      var pInp = el("input", { class: "input", type: "number", step: "0.01", value: ((it.unitPriceCents || 0) / 100).toFixed(2), style: { flex: "1.5" } });

      row.appendChild(Field("ብዛት", true, qInp));
      row.appendChild(Field("ነጠላ ዋጋ", true, pInp));
      itBox.appendChild(row);

      itemInputs.push({ item: it, qInp: qInp, pInp: pInp });
      body.appendChild(itBox);
    });

    errBox = el("div", { class: "errmsg" });
    body.appendChild(errBox);
  }, function (close) {
    var btn = el("button", { class: "btn btn-primary" }, "አስቀምጥ");
    btn.addEventListener("click", guarded(function () {
      var updatedItems = [];
      var newGrandTotal = 0;

      for (var i = 0; i < itemInputs.length; i++) {
        var inp = itemInputs[i];
        var q = Math.max(1, parseInt(inp.qInp.value, 10) || 1);
        var p = toCents(inp.pInp.value);
        if (p < 0) { errBox.textContent = "ትክክለኛ ዋጋ ያስገቡ"; return; }
        var lineTot = q * p;
        newGrandTotal += lineTot;
        updatedItems.push({
          itemId: inp.item.itemId,
          name: inp.item.name || inp.item.itemName,
          itemName: inp.item.name || inp.item.itemName,
          code: inp.item.code || "",
          qty: q,
          unitPriceCents: p,
          costPriceCents: inp.item.costPriceCents || 0,
          totalCents: lineTot
        });
      }

      setData(function (d) {
        var t = d.sales.find(function (x) { return x.id === sale.id; });
        if (t) {
          t.customer = custInput.value.trim() || "ስም ያልገለጸ ደንበኛ";
          t.items = updatedItems;
          t.totalCents = newGrandTotal;
          if (updatedItems.length === 1) {
            t.itemId = updatedItems[0].itemId;
            t.itemName = updatedItems[0].name;
            t.qty = updatedItems[0].qty;
            t.unitPriceCents = updatedItems[0].unitPriceCents;
          } else {
            t.qty = updatedItems.reduce(function (sum, it) { return sum + it.qty; }, 0);
          }
          if (t.paid) {
            t.advanceCents = newGrandTotal;
            t.creditRemainingCents = 0;
          } else {
            t.creditRemainingCents = Math.max(0, newGrandTotal - (t.advanceCents || 0));
          }
        }
        return d;
      });
      showToast("✓ ተስተካክሏል");
      close();
    }));
    return btn;
  });
}

function isWarehouseItem(it) {
  if (!it) return false;
  if (it.locationType === "warehouse") return true;
  if (it.locationType === "shop") return false;
  var loc = String(it.location || it.locationName || "").toLowerCase();
  return loc.indexOf("መጋዘን") !== -1 || loc.indexOf("warehouse") !== -1;
}

function getLocationsList(data) {
  if (data && Array.isArray(data.locations) && data.locations.length > 0) {
    return data.locations;
  }
  return [
    { id: "shop01", name: "ሱቅ 01 (ክ)", code: "SHP-01", type: "shop", manager: "ዋና ማናጀር", address: "ዋና ገበያ", note: "ዋና የመሸጫ ሱቅ" },
    { id: "shop02", name: "ሱቅ 02", code: "SHP-02", type: "shop", manager: "", address: "ቅርንጫፍ", note: "" },
    { id: "wh01", name: "መጋዘን 01", code: "WH-01", type: "warehouse", manager: "መጋዘን ኃላፊ", address: "ዋና መጋዘን", note: "ዋና ማከማቻ" },
    { id: "wh02", name: "መጋዘን 02", code: "WH-02", type: "warehouse", manager: "", address: "ቦሌ", note: "" }
  ];
}

function isItemInLocation(it, loc) {
  if (!it || !loc) return false;
  if (it.locationId && it.locationId === loc.id) return true;
  var itLoc = String(it.locationName || it.location || "").trim().toLowerCase();
  var locName = String(loc.name || "").trim().toLowerCase();
  if (itLoc && (itLoc === locName || locName.indexOf(itLoc) !== -1 || itLoc.indexOf(locName) !== -1)) return true;
  if (loc.id === "shop01" || loc.name === "ሱቅ 01 (ክ)") {
    if (it.locationType === "warehouse" || isWarehouseItem(it)) return false;
    if (itLoc.indexOf("02") !== -1 || itLoc.indexOf("ቅርንጫፍ") !== -1) return false;
    return true;
  }
  if (loc.id === "shop02" || loc.name === "ሱቅ 02") {
    if (it.locationType === "warehouse" || isWarehouseItem(it)) return false;
    return itLoc.indexOf("02") !== -1 || itLoc.indexOf("ቅርንጫፍ") !== -1;
  }
  if (loc.id === "wh01" || loc.name === "መጋዘን 01") {
    if (it.locationType !== "warehouse" && !isWarehouseItem(it)) return false;
    if (itLoc.indexOf("02") !== -1) return false;
    return true;
  }
  if (loc.id === "wh02" || loc.name === "መጋዘን 02") {
    if (it.locationType !== "warehouse" && !isWarehouseItem(it)) return false;
    return itLoc.indexOf("02") !== -1;
  }
  return false;
}

function getLocationStats(data, loc) {
  var locItems = (data.items || []).filter(function (it) {
    return isItemInLocation(it, loc);
  });
  var totalStockQty = 0;
  var valueCents = 0;
  var costValueCents = 0;
  var profitCents = 0;

  locItems.forEach(function (it) {
    var stock = Math.max(0, itemStock(data, it.id));
    totalStockQty += stock;
    var cost = typeof it.costPriceCents === "number" ? it.costPriceCents : 0;
    var sell = (typeof it.sellPriceCents === "number" && it.sellPriceCents > 0) ? it.sellPriceCents : cost;
    var expProfit = Math.max(0, sell - cost);

    costValueCents += stock * cost;
    profitCents += stock * expProfit;
    valueCents += stock * sell; // Exactly stock * (cost + expProfit)
  });

  return {
    items: locItems,
    itemsCount: locItems.length,
    totalStockQty: totalStockQty,
    costValueCents: costValueCents,
    valueCents: valueCents,
    profitCents: profitCents
  };
}

function getGlobalInventorySummary(data) {
  var locations = getLocationsList(data);
  var shopValueCents = 0;
  var shopProfitCents = 0;
  var warehouseValueCents = 0;
  var warehouseProfitCents = 0;

  locations.forEach(function (loc) {
    var s = getLocationStats(data, loc);
    if (loc.type === "warehouse") {
      warehouseValueCents += s.valueCents;
      warehouseProfitCents += s.profitCents;
    } else {
      shopValueCents += s.valueCents;
      shopProfitCents += s.profitCents;
    }
  });

  return {
    shopValueCents: shopValueCents,
    shopProfitCents: shopProfitCents,
    warehouseValueCents: warehouseValueCents,
    warehouseProfitCents: warehouseProfitCents
  };
}

function getInventoryStats(data) {
  var summary = getGlobalInventorySummary(data);
  var shopItems = (data.items || []).filter(function (it) { return !isWarehouseItem(it); });
  var warehouseItems = (data.items || []).filter(function (it) { return isWarehouseItem(it); });
  return {
    shopValueCents: summary.shopValueCents,
    shopProfitCents: summary.shopProfitCents,
    warehouseValueCents: summary.warehouseValueCents,
    warehouseProfitCents: summary.warehouseProfitCents,
    shopItems: shopItems,
    warehouseItems: warehouseItems
  };
}

export function openCreateLocationModal(type) {
  var isShop = type === "shop";
  var title = isShop ? "🏪 አዲስ ሱቅ ጨምር" : "🏢 አዲስ መጋዘን ጨምር";

  var nameInput, codeInput, addressInput, errBox;

  openSheet(title, function (body) {
    nameInput = el("input", {
      class: "input",
      placeholder: isShop ? "ምሳሌ: ሱቅ 03 (ገርጂ) ወይም ፒያሳ ቅርንጫፍ" : "ምሳሌ: መጋዘን 03 (ቃሊቲ) ወይም ዋና መጋዘን",
      required: true
    });

    codeInput = el("input", {
      class: "input",
      placeholder: isShop ? "ምሳሌ: SHP-03" : "ምሳሌ: WH-03"
    });

    addressInput = el("input", {
      class: "input",
      placeholder: "አካባቢ / ህንጻ / ቢሮ ቁጥር"
    });

    errBox = el("div", { class: "errmsg" });

    body.appendChild(Field(isShop ? "የሱቅ ስም *" : "የመጋዘን ስም *", true, nameInput));
    body.appendChild(Field("መለያ ኮድ (አማራጭ)", false, codeInput));
    body.appendChild(Field("አድራሻ / አካባቢ", false, addressInput));
    body.appendChild(errBox);
  }, function (close) {
    var btn = el("button", { class: "btn btn-primary" }, isShop ? "ሱቅ መዝግብ" : "መጋዘን መዝግብ");
    btn.addEventListener("click", guarded(function () {
      var name = nameInput.value.trim();
      if (!name) {
        errBox.textContent = "እባክዎ " + (isShop ? "የሱቅ ስም" : "የመጋዘን ስም") + " ያስገቡ";
        nameInput.focus();
        return;
      }

      var locations = getLocationsList(state.data);
      var exists = locations.some(function (l) { return l.name.toLowerCase() === name.toLowerCase(); });
      if (exists) {
        errBox.textContent = "ይህ ስም አስቀድሞ ተመዝግቧል፤ እባክዎ የተለየ ስም ይጠቀሙ";
        return;
      }

      var newId = (isShop ? "shop_" : "wh_") + uid();
      var defaultCode = (isShop ? "SHP-" : "WH-") + (locations.filter(function (l) { return l.type === type; }).length + 1);

      var newLocation = {
        id: newId,
        name: name,
        code: codeInput.value.trim() || defaultCode,
        type: type,
        address: addressInput.value.trim(),
        createdAt: Date.now()
      };

      setData(function (d) {
        if (!Array.isArray(d.locations)) d.locations = freshLocations();
        d.locations.push(newLocation);
        return d;
      });

      showToast(isShop ? "✓ አዲስ ሱቅ '" + name + "' ተመዝግቧል!" : "✓ አዲስ መጋዘን '" + name + "' ተመዝግቧል!");
      close();

      state.selectedLocation = newId;
      renderApp();
    }));
    return btn;
  });
}

export function openEditLocationModal(loc) {
  var isShop = loc.type === "shop";
  var title = isShop ? "✏️ ሱቅ ማስተካከያ" : "✏️ መጋዘን ማስተካከያ";

  var nameInput, codeInput, addressInput, managerInput, phoneInput, errBox;

  openSheet(title, function (body) {
    nameInput = el("input", {
      class: "input",
      value: loc.name || "",
      placeholder: isShop ? "የሱቅ ስም" : "የመጋዘን ስም",
      required: true
    });

    codeInput = el("input", {
      class: "input",
      value: loc.code || "",
      placeholder: "መለያ ኮድ"
    });

    addressInput = el("input", {
      class: "input",
      value: loc.address || "",
      placeholder: "አካባቢ / ህንጻ / ቢሮ ቁጥር"
    });

    managerInput = el("input", {
      class: "input",
      value: loc.manager || "",
      placeholder: "የኃላፊው ስም"
    });

    phoneInput = el("input", {
      class: "input",
      value: loc.phone || "",
      placeholder: "ስልክ ቁጥር"
    });

    errBox = el("div", { class: "errmsg" });

    body.appendChild(Field(isShop ? "የሱቅ ስም *" : "የመጋዘን ስም *", true, nameInput));
    body.appendChild(Field("መለያ ኮድ", false, codeInput));
    body.appendChild(Field("አድራሻ / አካባቢ", false, addressInput));
    body.appendChild(Field("ኃላፊ (አማራጭ)", false, managerInput));
    body.appendChild(Field("ስልክ (አማራጭ)", false, phoneInput));
    body.appendChild(errBox);
  }, function (close) {
    var btn = el("button", { class: "btn btn-primary" }, "አስተካክልና መዝግብ");
    btn.addEventListener("click", guarded(function () {
      var name = nameInput.value.trim();
      if (!name) {
        errBox.textContent = "እባክዎ ስም ያስገቡ";
        nameInput.focus();
        return;
      }

      setData(function (d) {
        if (!Array.isArray(d.locations)) d.locations = freshLocations();
        var target = d.locations.find(function (l) { return l.id === loc.id; });
        if (target) {
          target.name = name;
          target.code = codeInput.value.trim();
          target.address = addressInput.value.trim();
          target.manager = managerInput.value.trim();
          target.phone = phoneInput.value.trim();
        }
        return d;
      });

      showToast("✓ መረጃው በተሳካ ሁኔታ ተስተካክሏል!");
      close();
      renderApp();
    }));
    return btn;
  });
}

export function openLocationPickerSheet(onSelected) {
  var selected = state.selectedLocation;
  var overlay = el("div", {
    class: "overlay",
    style: {
      zIndex: "9999",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
      background: "rgba(15, 23, 42, 0.45)"
    }
  });

  var bg = el("div", {
    class: "overlay-bg",
    style: { background: "transparent" },
    onclick: function () { overlay.remove(); }
  });

  var modal = el("div", {
    class: "card",
    style: {
      position: "relative",
      zIndex: "10000",
      maxWidth: "460px",
      width: "100%",
      maxHeight: "88vh",
      display: "flex",
      flexDirection: "column",
      background: "#ffffff",
      borderRadius: "20px",
      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
      border: "1px solid #e2e8f0",
      padding: "0",
      overflow: "hidden"
    }
  });

  // Clear Header: "🏬 የመቀበያ ቦታ (ሱቅ/መጋዘን) ይምረጡ" with clean close icon (X) at top right
  var header = el("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "18px 20px",
      borderBottom: "1px solid #f1f5f9"
    }
  }, [
    el("div", { style: { fontSize: "16px", fontWeight: "800", color: "#0f172a" } }, "🏬 የመቀበያ ቦታ (ሱቅ/መጋዘን) ይምረጡ"),
    el("button", {
      class: "btn btn-ghost",
      style: {
        width: "32px",
        height: "32px",
        padding: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        fontSize: "17px",
        color: "#64748b",
        border: "none",
        cursor: "pointer",
        background: "#f1f5f9"
      },
      onclick: function () { overlay.remove(); }
    }, "✕")
  ]);

  var body = el("div", {
    style: {
      padding: "16px 20px",
      overflowY: "auto",
      flex: "1"
    }
  });

  var locations = getLocationsList(state.data);
  var listWrap = el("div", { class: "flex-col gap2" });

  // Option: All locations
  var isAll = !selected;
  var allCheck = isAll ? el("span", { class: "badge green", style: { fontWeight: "800", fontSize: "12px", padding: "4px 8px" } }, "✓") : el("span", { style: { color: "#cbd5e1", fontSize: "18px" } }, "○");
  var allCard = el("div", {
    class: "card-compact",
    style: {
      padding: "14px 16px",
      cursor: "pointer",
      borderRadius: "14px",
      border: isAll ? "2px solid #00b87c" : "1px solid #e2e8f0",
      background: isAll ? "#f0fdf4" : "#ffffff",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      transition: "all 0.15s ease",
      marginBottom: "8px"
    }
  }, [
    el("div", { class: "flex items-center gap3" }, [
      el("span", { style: { fontSize: "22px" } }, "📋"),
      el("div", {}, [
        el("div", { style: { fontWeight: "800", color: "#1e293b", fontSize: "14px" } }, "ሁሉም ሱቆች እና መጋዘኖች"),
        el("div", { style: { fontSize: "11.5px", color: "#64748b", marginTop: "2px" } }, "አጠቃላይ ጥምር የስቶክ ዝርዝር")
      ])
    ]),
    allCheck
  ]);

  var tileNodes = [];
  function redrawTiles() {
    allCard.style.border = !selected ? "2px solid #00b87c" : "1px solid #e2e8f0";
    allCard.style.background = !selected ? "#f0fdf4" : "#ffffff";
    var newAllCheck = !selected ? el("span", { class: "badge green", style: { fontWeight: "800", fontSize: "12px", padding: "4px 8px" } }, "✓") : el("span", { style: { color: "#cbd5e1", fontSize: "18px" } }, "○");
    allCheck.replaceWith(newAllCheck);
    allCheck = newAllCheck;

    tileNodes.forEach(function (t) {
      var isCur = selected === t.loc.id;
      t.node.style.border = isCur ? "2px solid #00b87c" : "1px solid #e2e8f0";
      t.node.style.background = isCur ? "#f0fdf4" : "#ffffff";
      var newCheck = isCur ? el("span", { class: "badge green", style: { fontWeight: "800", fontSize: "12px", padding: "4px 8px" } }, "✓") : el("span", { style: { color: "#cbd5e1", fontSize: "18px" } }, "○");
      t.checkEl.replaceWith(newCheck);
      t.checkEl = newCheck;
    });
  }

  allCard.addEventListener("click", function () {
    selected = null;
    redrawTiles();
  });
  listWrap.appendChild(allCard);

  locations.forEach(function (loc) {
    var isCur = selected === loc.id;
    var icon = loc.type === "warehouse" ? "🏢" : "🏪";
    var typeLabel = loc.type === "warehouse" ? "መጋዘን" : "ሱቅ";
    var checkEl = isCur ? el("span", { class: "badge green", style: { fontWeight: "800", fontSize: "12px", padding: "4px 8px" } }, "✓") : el("span", { style: { color: "#cbd5e1", fontSize: "18px" } }, "○");

    var card = el("div", {
      class: "card-compact",
      style: {
        padding: "14px 16px",
        cursor: "pointer",
        borderRadius: "14px",
        border: isCur ? "2px solid #00b87c" : "1px solid #e2e8f0",
        background: isCur ? "#f0fdf4" : "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        transition: "all 0.15s ease",
        marginBottom: "8px"
      }
    }, [
      el("div", { class: "flex items-center gap3" }, [
        el("span", { style: { fontSize: "22px" } }, icon),
        el("div", {}, [
          el("div", { style: { fontWeight: "800", color: "#1e293b", fontSize: "14px" } }, loc.name),
          el("div", { style: { fontSize: "11.5px", color: "#64748b", marginTop: "2px" } },
            typeLabel + (loc.code ? " · " + loc.code : "") + (loc.address ? " · " + loc.address : ""))
        ])
      ]),
      checkEl
    ]);

    card.addEventListener("click", function () {
      selected = loc.id;
      redrawTiles();
    });

    tileNodes.push({ loc: loc, node: card, checkEl: checkEl });
    listWrap.appendChild(card);
  });

  body.appendChild(listWrap);

  // Footer: Primary localized action button "ቦታውን አረጋግጥ"
  var footer = el("div", {
    style: {
      padding: "14px 20px",
      borderTop: "1px solid #f1f5f9",
      background: "#f8fafc"
    }
  });

  var confirmBtn = el("button", {
    class: "btn btn-primary btn-block",
    style: {
      padding: "12px",
      fontSize: "14px",
      fontWeight: "800",
      borderRadius: "12px",
      justifyContent: "center"
    }
  }, "ቦታውን አረጋግጥ");

  confirmBtn.addEventListener("click", function () {
    state.selectedLocation = selected;
    if (typeof onSelected === "function") onSelected(selected);
    overlay.remove();
    renderApp();
    showToast("✓ የመቀበያ ቦታ ተመርጧል!");
  });

  footer.appendChild(confirmBtn);

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);

  overlay.appendChild(bg);
  overlay.appendChild(modal);
  var appEl = document.querySelector(".app") || document.body;
  appEl.appendChild(overlay);

  return { close: function () { overlay.remove(); } };
}

export function renderItems(container) {
  if (!state.selectedLocation) {
    renderInventoryOverview(container);
  } else {
    renderStoreDetailView(container, state.selectedLocation);
  }
}

function renderInventoryOverview(container) {
  state.inventorySubTab = state.inventorySubTab || "all";
  var searchVal = "";

  // 1. Top Segmented Filter Tabs: (ሁሉም) | (ሱቆች) | (መጋዘኖች)
  var tabsRow = el("div", {
    class: "flex gap2 mb3",
    style: {
      background: "#f1f5f9",
      padding: "4px",
      borderRadius: "12px",
      border: "1px solid #e2e8f0"
    }
  });

  var subTabs = [
    { k: "all", l: "(ሁሉም)" },
    { k: "shops", l: "(ሱቆች)" },
    { k: "warehouses", l: "(መጋዘኖች)" }
  ];

  subTabs.forEach(function (tab) {
    var isActive = state.inventorySubTab === tab.k;
    var btn = el("button", {
      class: "btn" + (isActive ? " btn-primary" : " btn-ghost"),
      style: {
        flex: "1",
        borderRadius: "9px",
        padding: "8px 4px",
        fontSize: "12.5px",
        fontWeight: isActive ? "800" : "600",
        boxShadow: isActive ? "0 2px 6px rgba(0, 184, 124, 0.3)" : "none"
      }
    }, tab.l);
    btn.addEventListener("click", function () {
      state.inventorySubTab = tab.k;
      renderApp();
    });
    tabsRow.appendChild(btn);
  });
  container.appendChild(tabsRow);

  // 2. Summary Metric Cards
  var summary = getGlobalInventorySummary(state.data);
  var cardsWrap = el("div", { class: "grid-2 mb3" });

  if (state.inventorySubTab === "all" || state.inventorySubTab === "shops") {
    cardsWrap.appendChild(el("div", { class: "card", style: { borderTop: "3px solid #10b981", padding: "14px" } }, [
      el("div", { class: "eyebrow", style: { color: "#065f46" } }, "🏪 ጠቅላላ የሱቆች እሴት"),
      el("div", { style: { fontSize: "19px", fontWeight: "800", color: "#166534", marginTop: "4px" } }, fmt(summary.shopValueCents)),
      el("div", { style: { fontSize: "11px", color: "#64748b", marginTop: "2px" } }, "በሱቆች የሚገኙ እቃዎች ጠቅላላ የመሸጫ እሴት (ካፒታል + ትርፍ)")
    ]));

    cardsWrap.appendChild(el("div", { class: "card", style: { borderTop: "3px solid #059669", padding: "14px" } }, [
      el("div", { class: "eyebrow", style: { color: "#047857" } }, "📈 ጠቅላላ ከሱቆች ሊገኝ የታሰበው ትርፍ"),
      el("div", { style: { fontSize: "19px", fontWeight: "800", color: "#047857", marginTop: "4px" } }, fmt(summary.shopProfitCents)),
      el("div", { style: { fontSize: "11px", color: "#64748b", marginTop: "2px" } }, "ሽያጭ ሲጠናቀቅ የሚገኝ")
    ]));
  }

  if (state.inventorySubTab === "all" || state.inventorySubTab === "warehouses") {
    cardsWrap.appendChild(el("div", { class: "card", style: { borderTop: "3px solid #2563eb", padding: "14px" } }, [
      el("div", { class: "eyebrow", style: { color: "#1e40af" } }, "🏢 ጠቅላላ የመጋዘኖች እሴት"),
      el("div", { style: { fontSize: "19px", fontWeight: "800", color: "#1e40af", marginTop: "4px" } }, fmt(summary.warehouseValueCents)),
      el("div", { style: { fontSize: "11px", color: "#64748b", marginTop: "2px" } }, "በመጋዘኖች የተከማቹ እቃዎች ጠቅላላ የመሸጫ እሴት (ካፒታል + ትርፍ)")
    ]));

    cardsWrap.appendChild(el("div", { class: "card", style: { borderTop: "3px solid #3b82f6", padding: "14px" } }, [
      el("div", { class: "eyebrow", style: { color: "#1d4ed8" } }, "📊 ጠቅላላ ከመጋዘኖች ሊገኝ የታሰበው ትርፍ"),
      el("div", { style: { fontSize: "19px", fontWeight: "800", color: "#1d4ed8", marginTop: "4px" } }, fmt(summary.warehouseProfitCents)),
      el("div", { style: { fontSize: "11px", color: "#64748b", marginTop: "2px" } }, "ወደ ሱቅ ተዛውሮ ሲሸጥ")
    ]));
  }

  container.appendChild(cardsWrap);

  // 3. Search Bar for Stores/Warehouses
  var searchInput = el("input", {
    class: "input mb3",
    placeholder: "🔍 ሱቆች ወይም መጋዘኖችን ይፈልጉ...",
    style: { borderRadius: "12px" }
  });
  container.appendChild(searchInput);

  // 4. Locations List Container
  var locationsListContainer = el("div", { class: "flex-col gap2 mb4" });
  container.appendChild(locationsListContainer);

  function updateLocationsList() {
    clear(locationsListContainer);
    var allLocations = getLocationsList(state.data);
    var q = searchVal.trim().toLowerCase();

    var filtered = allLocations.filter(function (loc) {
      if (state.inventorySubTab === "shops" && loc.type !== "shop") return false;
      if (state.inventorySubTab === "warehouses" && loc.type !== "warehouse") return false;
      if (q) {
        var matchName = (loc.name || "").toLowerCase().indexOf(q) !== -1;
        var matchCode = (loc.code || "").toLowerCase().indexOf(q) !== -1;
        var matchAddr = (loc.address || "").toLowerCase().indexOf(q) !== -1;
        var matchMgr = (loc.manager || "").toLowerCase().indexOf(q) !== -1;
        if (!matchName && !matchCode && !matchAddr && !matchMgr) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      locationsListContainer.appendChild(el("div", {
        class: "card",
        style: { textAlign: "center", padding: "32px 16px", color: "#64748b" }
      }, [
        el("div", { style: { fontSize: "32px", marginBottom: "8px" } }, "🔍"),
        el("div", { style: { fontWeight: "700", fontSize: "14px" } }, "ምንም ሱቅ ወይም መጋዘን አልተገኘም"),
        el("div", { style: { fontSize: "12px", marginTop: "4px" } }, "እባክዎ የተለየ የፍለጋ ቃል ይጠቀሙ ወይም አዲስ ይመዝግቡ")
      ]));
      return;
    }

    filtered.forEach(function (loc) {
      var isWh = loc.type === "warehouse";
      var stats = getLocationStats(state.data, loc);

      var card = el("div", {
        class: "loc-card",
        title: loc.name
      });

      // Top Row
      var topRow = el("div", { class: "flex items-center justify-between mb2" }, [
        el("div", { class: "flex items-center gap2" }, [
          el("div", {
            style: {
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              background: isWh ? "#eff6ff" : "#f0fdf4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px"
            }
          }, isWh ? "🏢" : "🏪"),
          el("div", {}, [
            el("div", { style: { fontSize: "16px", fontWeight: "800", color: isWh ? "#1e40af" : "#065f46" } }, loc.name),
            el("div", { style: { fontSize: "11px", color: "#64748b" } }, (loc.code ? "መለያ: " + loc.code + " • " : "") + (loc.address || (isWh ? "ማዕከላዊ መጋዘን" : "ዋና ሱቅ")))
          ])
        ]),
        el("div", { class: isWh ? "loc-badge-wh" : "loc-badge-shop" }, isWh ? "መጋዘን" : "ሱቅ")
      ]);
      card.appendChild(topRow);

      // Details / Manager info if available
      if (loc.manager || loc.phone) {
        var infoRow = el("div", { style: { fontSize: "11.5px", color: "#64748b", marginBottom: "8px" } }, [
          loc.manager ? el("span", { style: { marginRight: "12px" } }, "👤 ኃላፊ: " + loc.manager) : null,
          loc.phone ? el("span", {}, "📞 " + loc.phone) : null
        ]);
        card.appendChild(infoRow);
      }

      // If under "all" tab: Remove stats grid, provide exactly 3 action buttons
      if (state.inventorySubTab === "all") {
        var actionsRow = el("div", {
          class: "flex gap2 mt3 pt2",
          style: { borderTop: "1px solid #f1f5f9", alignItems: "center" }
        });

        // 1. Edit Button
        var editBtn = el("button", {
          class: "btn btn-outline btn-sm",
          style: { flex: "1", padding: "8px 10px", fontSize: "12px", fontWeight: "700", borderRadius: "8px", background: "#f8fafc" }
        }, "✏️ አስተካክል");
        editBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          openEditLocationModal(loc);
        });

        // 2. Delete Button
        var delBtn = el("button", {
          class: "btn btn-outline btn-sm",
          style: { flex: "1", padding: "8px 10px", fontSize: "12px", fontWeight: "700", color: "#dc2626", borderColor: "#fecaca", borderRadius: "8px", background: "#fef2f2" }
        }, "🗑️ ሰርዝ");
        delBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          confirmModal("ይህንን " + (isWh ? "መጋዘን" : "ሱቅ") + " (" + loc.name + ") ከሲስተሙ መሰረዝ ይፈልጋሉ?", function () {
            setData(function (d) {
              if (!Array.isArray(d.locations)) d.locations = freshLocations();
              d.locations = d.locations.filter(function (x) { return x.id !== loc.id; });
              return d;
            });
            showToast("✓ ቦታው በተሳካ ሁኔታ ተሰርዟል!");
            renderApp();
          }, null, {
            title: "⚠️ ቦታ መሰረዝ",
            confirmText: "ይሰረዝ",
            cancelText: "ተመለስ"
          });
        });

        // 3. View Inventory Button
        var viewBtn = el("button", {
          class: "btn btn-primary btn-sm",
          style: { flex: "1.3", padding: "8px 10px", fontSize: "12px", fontWeight: "800", borderRadius: "8px" }
        }, "👁️ ክምችት ተመልከት");
        viewBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          state.selectedLocation = loc.id;
          renderApp();
        });

        actionsRow.appendChild(editBtn);
        actionsRow.appendChild(delBtn);
        actionsRow.appendChild(viewBtn);
        card.appendChild(actionsRow);

      } else {
        // Under "ሱቆች" and "መጋዘኖች" tabs: Keep detailed 3-column stats grid
        var statsGrid = el("div", {
          style: {
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "8px",
            background: "#f8fafc",
            padding: "10px 12px",
            borderRadius: "12px",
            border: "1px solid #f1f5f9",
            marginTop: "6px"
          }
        }, [
          el("div", { style: { textAlign: "center" } }, [
            el("div", { style: { fontSize: "10.5px", color: "#64748b", fontWeight: "600" } }, "የዕቃዎች ብዛት"),
            el("div", { style: { fontSize: "13px", fontWeight: "800", color: "#0f172a", marginTop: "2px" } }, stats.itemsCount + " ዓይነቶች"),
            el("div", { style: { fontSize: "10px", color: "#94a3b8" } }, "(" + stats.totalStockQty + " ፍሬ)")
          ]),
          el("div", { style: { textAlign: "center", borderLeft: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0" } }, [
            el("div", { style: { fontSize: "10.5px", color: "#64748b", fontWeight: "600" } }, "እሴት (ካፒታል)"),
            el("div", { style: { fontSize: "13px", fontWeight: "800", color: "#166534", marginTop: "2px" } }, fmt(stats.valueCents))
          ]),
          el("div", { style: { textAlign: "center" } }, [
            el("div", { style: { fontSize: "10.5px", color: "#64748b", fontWeight: "600" } }, "የሚጠበቅ ትርፍ"),
            el("div", { style: { fontSize: "13px", fontWeight: "800", color: "#047857", marginTop: "2px" } }, fmt(stats.profitCents))
          ])
        ]);

        var actionLink = el("div", {
          class: "flex items-center justify-end mt2",
          style: { fontSize: "12px", fontWeight: "700", color: "#00b87c" }
        }, "ዝርዝር ክምችት ይመልከቱ →");

        card.appendChild(statsGrid);
        card.appendChild(actionLink);

        card.addEventListener("click", function () {
          state.selectedLocation = loc.id;
          renderApp();
        });
      }

      locationsListContainer.appendChild(card);
    });
  }

  searchInput.addEventListener("input", function (e) {
    searchVal = e.target.value;
    updateLocationsList();
  });

  updateLocationsList();

  // Task 7: Conditional Floating Add Button Logic Based on Active Tab
  // Hide on "ሁሉም" (all), Show for "ሱቆች" (Add Store) and "መጋዘኖች" (Add Warehouse)
  if (state.inventorySubTab === "shops") {
    var fabShop = el("button", {
      class: "inv-fab-btn",
      title: "አዲስ ሱቅ መመዝገቢያ",
      onclick: function () { openCreateLocationModal("shop"); }
    }, "+");
    container.appendChild(fabShop);
  } else if (state.inventorySubTab === "warehouses") {
    var fabWh = el("button", {
      class: "inv-fab-btn",
      title: "አዲስ መጋዘን ጨምር",
      onclick: function () { openCreateLocationModal("warehouse"); }
    }, "+");
    container.appendChild(fabWh);
  }
}

function renderStoreDetailView(container, locId) {
  var locations = getLocationsList(state.data);
  var loc = locations.find(function (l) { return l.id === locId; }) || locations[0];
  state.inventoryFilter = state.inventoryFilter || "all";
  var searchVal = "";

  // 1. Two Top Metric Cards: እሴት and የሚጠበቅ ትርፍ
  var locStats = getLocationStats(state.data, loc);

  var topCardsGrid = el("div", { class: "grid-2 mb3" }, [
    el("div", {
      class: "card",
      style: {
        background: "#ffffff",
        border: "1.5px solid #e2e8f0",
        borderRadius: "16px",
        padding: "16px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)"
      }
    }, [
      el("div", { style: { fontSize: "12px", fontWeight: "700", color: "#64748b" } }, "ጠቅላላ እሴት"),
      el("div", { style: { fontSize: "20px", fontWeight: "900", color: "#166534", marginTop: "4px" } }, fmt(locStats.valueCents)),
      el("div", { style: { fontSize: "10.5px", color: "#94a3b8", marginTop: "2px" } }, "የእቃዎች ጠቅላላ የመሸጫ እሴት (ካፒታል + ትርፍ)")
    ]),

    el("div", {
      class: "card",
      style: {
        background: "#ffffff",
        border: "1.5px solid #e2e8f0",
        borderRadius: "16px",
        padding: "16px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)"
      }
    }, [
      el("div", { style: { fontSize: "12px", fontWeight: "700", color: "#64748b" } }, "የሚጠበቅ ትርፍ"),
      el("div", { style: { fontSize: "20px", fontWeight: "900", color: "#047857", marginTop: "4px" } }, fmt(locStats.profitCents)),
      el("div", { style: { fontSize: "10.5px", color: "#94a3b8", marginTop: "2px" } }, "ሽያጭ ሲጠናቀቅ የሚገኝ")
    ])
  ]);
  container.appendChild(topCardsGrid);

  // 2. Prominent Centered Button: ዕቃ አዛውር →
  var transferBtnWrap = el("div", { class: "flex justify-center mb3" }, [
    el("button", {
      class: "btn btn-primary",
      style: {
        padding: "12px 32px",
        borderRadius: "12px",
        fontSize: "14.5px",
        fontWeight: "800",
        background: "#00b87c",
        border: "none",
        boxShadow: "0 4px 14px rgba(0, 184, 124, 0.35)",
        cursor: "pointer"
      },
      onclick: function () {
        openStockTransferModal(null, loc.id);
      }
    }, "ዕቃ አዛውር →")
  ]);
  container.appendChild(transferBtnWrap);

  // 3. Search Input Field
  var searchInput = el("input", {
    class: "input mb3",
    placeholder: "🔍 ዕቃ በስም ወይም በመለያ ይፈልጉ...",
    style: { borderRadius: "12px" }
  });
  container.appendChild(searchInput);

  // 4. Horizontally Scrollable Filter Tabs: (ሁሉም) (የሚሸጡ) (ያለቁ / ያነሱ) (የቆዩ / ጊዜ ያለፈባቸው)
  var pillsBar = el("div", { class: "inv-pills-bar mb3" });
  var filterTabs = [
    { k: "all", l: "(ሁሉም)" },
    { k: "selling", l: "(የሚሸጡ)" },
    { k: "low", l: "(ያለቁ / ያነሱ)" },
    { k: "expired", l: "(የቆዩ / ጊዜ ያለፈባቸው)" }
  ];

  filterTabs.forEach(function (ft) {
    var isActive = state.inventoryFilter === ft.k;
    var btn = el("button", {
      class: "inv-filter-pill" + (isActive ? " active" : "")
    }, ft.l);
    btn.addEventListener("click", function () {
      state.inventoryFilter = ft.k;
      renderApp();
    });
    pillsBar.appendChild(btn);
  });
  container.appendChild(pillsBar);

  // 5. Horizontally Scrollable Data Table
  var tableWrap = el("div", { class: "inv-table-wrap mb4" });
  container.appendChild(tableWrap);

  function updateTable() {
    clear(tableWrap);

    var rawItems = (state.data.items || []).filter(function (it) {
      return isItemInLocation(it, loc);
    });

    var todayStr = todayISO();
    var q = searchVal.trim().toLowerCase();

    var filtered = rawItems.filter(function (it) {
      var stock = Math.max(0, itemStock(state.data, it.id));
      var isExpired = it.expiry && it.expiry <= todayStr;
      var isOld = it.dateAdded && (Date.now() - new Date(it.dateAdded).getTime()) > 60 * 86400000;

      if (state.inventoryFilter === "selling") {
        if (stock <= 0 || isExpired) return false;
      } else if (state.inventoryFilter === "low") {
        if (stock > 5) return false;
      } else if (state.inventoryFilter === "expired") {
        if (!isExpired && !isOld) return false;
      }

      if (q) {
        var matchName = (it.name || "").toLowerCase().indexOf(q) !== -1;
        var matchCode = (it.code || it.id || "").toLowerCase().indexOf(q) !== -1;
        if (!matchName && !matchCode) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tableWrap.appendChild(el("div", {
        style: { textAlign: "center", padding: "36px 16px", color: "#64748b" }
      }, [
        el("div", { style: { fontSize: "32px", marginBottom: "8px" } }, "📦"),
        el("div", { style: { fontWeight: "700", fontSize: "14px" } }, "በዚህ ቦታ ውስጥ ምንም ዕቃ አልተገኘም"),
        el("div", { style: { fontSize: "12px", marginTop: "4px" } }, "በዚህ ቦታ ውስጥ የተመዘገበ ዕቃ የለም")
      ]));
      return;
    }

    var table = el("table", { class: "inv-table" });

    // Exact Columns: መለያ, ስም, ብዛት, ግዢ ዋጋ, ካፒታል, የሽያጭ ዋጋ, ሁኔታ, ትርፍ, እርምጃ
    var thead = el("thead", {}, [
      el("tr", {}, [
        el("th", {}, "መለያ"),
        el("th", { style: { textAlign: "left", paddingLeft: "12px" } }, "ስም"),
        el("th", {}, "ብዛት"),
        el("th", {}, "ግዢ ዋጋ"),
        el("th", {}, "ካፒታል"),
        el("th", {}, "የሽያጭ ዋጋ"),
        el("th", {}, "ሁኔታ"),
        el("th", {}, "ትርፍ"),
        el("th", {}, "እርምጃ")
      ])
    ]);

    var tbody = el("tbody");

    filtered.forEach(function (it) {
      var stock = Math.max(0, itemStock(state.data, it.id));
      var cost = it.costPriceCents || 0;
      var sell = it.sellPriceCents || 0;
      var capital = stock * cost;
      var profit = stock * Math.max(0, sell - cost);

      var isExpired = it.expiry && it.expiry <= todayStr;

      // Status Badge
      var statusBadge;
      if (isExpired) {
        statusBadge = el("span", {
          style: { background: "#fee2e2", color: "#b91c1c", padding: "3px 8px", borderRadius: "6px", fontSize: "10.5px", fontWeight: "800" }
        }, "ጊዜ ያለፈበት");
      } else if (stock <= 0) {
        statusBadge = el("span", {
          style: { background: "#fee2e2", color: "#b91c1c", padding: "3px 8px", borderRadius: "6px", fontSize: "10.5px", fontWeight: "800" }
        }, "ያለቀ");
      } else if (stock <= 5) {
        statusBadge = el("span", {
          style: { background: "#fef3c7", color: "#b45309", padding: "3px 8px", borderRadius: "6px", fontSize: "10.5px", fontWeight: "800" }
        }, "ያነሰ (" + stock + ")");
      } else {
        statusBadge = el("span", {
          style: { background: "#dcfce7", color: "#15803d", padding: "3px 8px", borderRadius: "6px", fontSize: "10.5px", fontWeight: "800" }
        }, "የሚሸጥ");
      }

      var codeLabel = it.code || ("ITM-" + (it.id || "").slice(-4));

      // Action Buttons: Edit / Transfer / Delete
      var editBtn = el("button", {
        class: "btn btn-outline btn-sm",
        style: { padding: "4px 8px", fontSize: "11px", borderRadius: "6px" },
        title: "ዕቃ አርም",
        onclick: function () { openEditItemModal(it); }
      }, "✎");

      var transBtn = el("button", {
        class: "btn btn-outline btn-sm",
        style: { padding: "4px 8px", fontSize: "11px", borderRadius: "6px" },
        title: "ዕቃ አዛውር",
        onclick: function () { openStockTransferModal(it, loc.id); }
      }, "🔄");

      var delBtn = el("button", {
        class: "trash-btn",
        style: { padding: "4px 8px", fontSize: "11px" },
        title: "ዕቃ ሰርዝ",
        onclick: function () {
          confirmModal("ይህንን ዕቃ መሰረዝ ይፈልጋሉ?", function () {
            setData(function (d) {
              d.items = d.items.filter(function (x) { return x.id !== it.id; });
              return d;
            });
            showToast("ዕቃው ተሰርዟል");
          });
        }
      }, "✕");

      var tr = el("tr", {}, [
        el("td", { style: { fontWeight: "700", color: "#64748b" } }, codeLabel),
        el("td", { style: { textAlign: "left", paddingLeft: "12px", fontWeight: "700", color: "#0f172a" } }, it.name),
        el("td", { style: { fontWeight: "800", color: stock <= 5 ? "#b91c1c" : "#0f172a" } }, String(stock)),
        el("td", {}, fmt(cost)),
        el("td", { style: { fontWeight: "700", color: "#166534" } }, fmt(capital)),
        el("td", { style: { fontWeight: "700" } }, fmt(sell)),
        el("td", {}, statusBadge),
        el("td", { style: { fontWeight: "800", color: "#047857" } }, fmt(profit)),
        el("td", {}, [
          el("div", { class: "flex items-center justify-center gap1" }, [editBtn, transBtn, delBtn])
        ])
      ]);

      tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.appendChild(table);
  }

  searchInput.addEventListener("input", function (e) {
    searchVal = e.target.value;
    updateTable();
  });

  updateTable();
}

export function openAddLocationMenu() {
  openSheet("አዲስ ሱቅ ወይም መጋዘን ጨምር", function (body, close) {
    body.appendChild(el("div", { style: { display: "flex", flexDirection: "column", gap: "12px", padding: "4px 0" } }, [
      el("div", {
        class: "card",
        style: { cursor: "pointer", border: "1.5px solid #10b981", display: "flex", alignItems: "center", gap: "14px", padding: "16px", background: "#f0fdf4" },
        onclick: function () { close(); openCreateLocationModal("shop"); }
      }, [
        el("div", { style: { fontSize: "28px" } }, "🏪"),
        el("div", {}, [
          el("div", { style: { fontWeight: "800", fontSize: "15px", color: "#065f46" } }, "አዲስ ሱቅ ጨምር"),
          el("div", { style: { fontSize: "11.5px", color: "#047857", marginTop: "2px" } }, "አዲስ የመሸጫ ሱቅ ወይም የችርቻሮ ቅርንጫፍ መዝግብ")
        ])
      ]),

      el("div", {
        class: "card",
        style: { cursor: "pointer", border: "1.5px solid #2563eb", display: "flex", alignItems: "center", gap: "14px", padding: "16px", background: "#eff6ff" },
        onclick: function () { close(); openCreateLocationModal("warehouse"); }
      }, [
        el("div", { style: { fontSize: "28px" } }, "🏢"),
        el("div", {}, [
          el("div", { style: { fontWeight: "800", fontSize: "15px", color: "#1e40af" } }, "አዲስ መጋዘን ጨምር"),
          el("div", { style: { fontSize: "11.5px", color: "#1d4ed8", marginTop: "2px" } }, "አዲስ የዕቃ ማከማቻ መጋዘን መዝግብ")
        ])
      ])
    ]));
  });
}

export function openInventoryActionMenu() {
  openAddLocationMenu();
}

export function openAddItemModal(defaultLoc) {
  var locSelect, nameInput, codeInput, costInput, sellInput, stockInput, expiryInput, errBox;
  var locations = getLocationsList(state.data);

  openSheet("አዲስ ዕቃ መዝግብ", function (body) {
    var locOptions = locations.map(function (loc) {
      var icon = loc.type === "warehouse" ? "🏢 " : "🏪 ";
      var badge = loc.type === "warehouse" ? " (መጋዘን)" : " (ሱቅ)";
      return el("option", { value: loc.id }, icon + loc.name + badge);
    });

    locSelect = el("select", { class: "input" }, locOptions);
    if (defaultLoc) {
      if (typeof defaultLoc === "object" && defaultLoc.id) {
        locSelect.value = defaultLoc.id;
      } else if (typeof defaultLoc === "string") {
        var match = locations.find(function (l) { return l.id === defaultLoc || l.name === defaultLoc || l.type === defaultLoc; });
        if (match) locSelect.value = match.id;
      }
    }

    nameInput = el("input", { class: "input", placeholder: "ምሳሌ: ስኳር 1 ኪግ ወይም ሳሙና" });
    codeInput = el("input", { class: "input", placeholder: "ባርኮድ ወይም መለያ ኮድ (አማራጭ)" });
    costInput = el("input", { class: "input", type: "number", step: "0.01", placeholder: "0.00" });
    sellInput = el("input", { class: "input", type: "number", step: "0.01", placeholder: "0.00" });
    stockInput = el("input", { class: "input", type: "number", placeholder: "100" });
    expiryInput = el("input", { class: "input", type: "date" });
    errBox = el("div", { class: "errmsg" });

    body.appendChild(Field("የዕቃው ቦታ (መጋዘን / ሱቅ)", true, locSelect));
    body.appendChild(Field("የዕቃ ስም", true, nameInput));
    body.appendChild(Field("የዕቃ ኮድ / ባርኮድ", false, codeInput));
    body.appendChild(Field("የመጀመሪያ ስቶክ (ብዛት)", true, stockInput));
    body.appendChild(Field("የግዢ ዋጋ (ወጪ)", false, costInput));
    body.appendChild(Field("የመሸጫ ዋጋ", true, sellInput));
    body.appendChild(Field("የሚያበቃበት ቀን", false, expiryInput));
    body.appendChild(errBox);
  }, function (close) {
    var btn = el("button", { class: "btn btn-primary" }, "መዝግብ");
    btn.addEventListener("click", guarded(function () {
      var name = nameInput.value.trim();
      var sellCents = toCents(sellInput.value);
      var stock = Number(stockInput.value) || 0;
      if (!name || sellCents <= 0 || stock < 0) {
        errBox.textContent = "እባክዎ ትክክለኛ የዕቃ ስም፣ የመሸጫ ዋጋ እና ስቶክ ያስገቡ";
        return;
      }

      var chosenLoc = locations.find(function (l) { return l.id === locSelect.value; }) || locations[0];

      setData(function (d) {
        mergeOrAddItem(d, {
          name: name,
          code: codeInput.value.trim(),
          locationId: chosenLoc.id,
          locationType: chosenLoc.type,
          locationName: chosenLoc.name,
          landedCostCents: toCents(costInput.value || 0),
          sellPriceCents: sellCents,
          qty: stock,
          dateAdded: todayISO(),
          expiry: expiryInput.value || ""
        });
        return d;
      });
      showToast("ዕቃው በተሳካ ሁኔታ ተመዝግቧል/ተዋህዷል");
      close();
    }));
    return btn;
  });
}

export function openEditItemModal(item) {
  var locSelect, nameInput, codeInput, costInput, sellInput, stockInput, expiryInput, errBox;
  var locations = getLocationsList(state.data);

  openSheet("ዕቃ አርም", function (body) {
    var locOptions = locations.map(function (loc) {
      var icon = loc.type === "warehouse" ? "🏢 " : "🏪 ";
      var badge = loc.type === "warehouse" ? " (መጋዘን)" : " (ሱቅ)";
      return el("option", { value: loc.id }, icon + loc.name + badge);
    });

    locSelect = el("select", { class: "input" }, locOptions);
    var itemLoc = locations.find(function (l) {
      return l.id === item.locationId || l.name === item.locationName || l.name === item.location;
    });
    if (itemLoc) locSelect.value = itemLoc.id;

    nameInput = el("input", { class: "input", value: item.name || "" });
    codeInput = el("input", { class: "input", value: item.code || "" });
    costInput = el("input", { class: "input", type: "number", step: "0.01", value: ((item.costPriceCents || 0) / 100).toFixed(2) });
    sellInput = el("input", { class: "input", type: "number", step: "0.01", value: ((item.sellPriceCents || 0) / 100).toFixed(2) });
    stockInput = el("input", { class: "input", type: "number", value: item.openingStock || 0 });
    expiryInput = el("input", { class: "input", type: "date", value: item.expiry || "" });
    errBox = el("div", { class: "errmsg" });

    body.appendChild(Field("የዕቃው ቦታ", true, locSelect));
    body.appendChild(Field("የዕቃ ስም", true, nameInput));
    body.appendChild(Field("የዕቃ ኮድ", false, codeInput));
    body.appendChild(Field("የመክፈቻ ስቶክ", true, stockInput));
    body.appendChild(Field("የገዢ ዋጋ", false, costInput));
    body.appendChild(Field("የመሸጫ ዋጋ", true, sellInput));
    body.appendChild(Field("የሚያበቃበት ቀን", false, expiryInput));
    body.appendChild(errBox);
  }, function (close) {
    var btn = el("button", { class: "btn btn-primary" }, "አስቀምጥ");
    btn.addEventListener("click", guarded(function () {
      var name = nameInput.value.trim();
      var sellCents = toCents(sellInput.value);
      if (!name || sellCents <= 0) {
        errBox.textContent = "ትክክለኛ ስም እና የመሸጫ ዋጋ ያስገቡ";
        return;
      }
      var chosenLoc = locations.find(function (l) { return l.id === locSelect.value; }) || locations[0];

      setData(function (d) {
        var it = d.items.find(function (x) { return x.id === item.id; });
        if (it) {
          it.name = name;
          it.code = codeInput.value.trim();
          it.locationId = chosenLoc.id;
          it.locationType = chosenLoc.type;
          it.locationName = chosenLoc.name;
          it.location = chosenLoc.name;
          it.costPriceCents = toCents(costInput.value || 0);
          it.sellPriceCents = sellCents;
          it.openingStock = Number(stockInput.value) || 0;
          it.expiry = expiryInput.value || "";
        }
        return d;
      });
      showToast("ተስተካክሏል");
      close();
    }));
    return btn;
  });
}

export function openStockTransferModal(preselectedItem, defaultSourceLocId) {
  var itemSelect, fromBadge, toSelect, qtyInput, maxLabel, errBox;
  var locations = getLocationsList(state.data);

  openSheet("የዕቃ ዝውውር (ሱቅ ↔ መጋዘን)", function (body) {
    var itemsWithStock = state.data.items.filter(function (it) {
      if (defaultSourceLocId) {
        var matchesLoc = (it.locationId === defaultSourceLocId) ||
                         (it.locationName && it.locationName.trim() === defaultSourceLocId) ||
                         (it.location && it.location.trim() === defaultSourceLocId);
        if (!matchesLoc) return false;
      }
      return itemStock(state.data, it.id) > 0;
    });

    if (itemsWithStock.length === 0) {
      body.appendChild(el("div", { class: "card", style: { textAlign: "center", padding: "24px 16px", color: "#64748b" } }, [
        el("div", { style: { fontSize: "32px", marginBottom: "8px" } }, "📦"),
        el("div", { style: { fontWeight: "700", fontSize: "14px" } }, "በአሁኑ ሰዓት የሚዘዋወር ስቶክ ያለው ዕቃ የለም።")
      ]));
      return;
    }

    itemSelect = el("select", { class: "input" });
    itemsWithStock.forEach(function (it) {
      var s = itemStock(state.data, it.id);
      var itLoc = locations.find(function (l) { return l.id === it.locationId || l.name === it.locationName || l.name === it.location; });
      var locName = itLoc ? itLoc.name : (it.locationName || "ሱቅ");
      var isWh = itLoc ? (itLoc.type === "warehouse") : isWarehouseItem(it);
      var icon = isWh ? "🏢 " : "🏪 ";
      var opt = el("option", { value: it.id }, it.name + " (" + icon + locName + " — ቀሪ: " + s + ")");
      itemSelect.appendChild(opt);
    });

    if (preselectedItem && itemsWithStock.find(function (x) { return x.id === preselectedItem.id; })) {
      itemSelect.value = preselectedItem.id;
    }

    fromBadge = el("div", { style: { padding: "8px 12px", background: "#f1f5f9", borderRadius: "10px", fontWeight: "700", fontSize: "13px" } });
    toSelect = el("select", { class: "input" });
    maxLabel = el("div", { style: { fontSize: "11.5px", color: "#64748b", marginTop: "4px" } });
    qtyInput = el("input", { class: "input", type: "number", min: "1", value: "1" });
    errBox = el("div", { class: "errmsg" });

    function updateOptions() {
      var it = itemsWithStock.find(function (x) { return x.id === itemSelect.value; }) || itemsWithStock[0];
      if (!it) return;
      var curSourceLoc = locations.find(function (l) { return l.id === it.locationId || l.name === it.locationName || l.name === it.location; });
      var srcName = curSourceLoc ? curSourceLoc.name : (it.locationName || "ዋና ሱቅ");
      var isWh = curSourceLoc ? (curSourceLoc.type === "warehouse") : isWarehouseItem(it);

      fromBadge.textContent = (isWh ? "🏢 ከመጋዘን (" : "🏪 ከሱቅ (") + srcName + ")";

      clear(toSelect);
      var destLocations = locations.filter(function (l) {
        if (curSourceLoc && l.id === curSourceLoc.id) return false;
        if (!curSourceLoc && l.name === srcName) return false;
        return true;
      });

      if (destLocations.length === 0) {
        toSelect.appendChild(el("option", { value: "" }, "ሌላ መዳረሻ ቦታ የለም (አዲስ ሱቅ/መጋዘን ይጨምሩ)"));
      } else {
        destLocations.forEach(function (dl) {
          var dIcon = dl.type === "warehouse" ? "🏢 " : "🏪 ";
          var dTag = dl.type === "warehouse" ? " (መጋዘን)" : " (ሱቅ)";
          toSelect.appendChild(el("option", { value: dl.id }, dIcon + "ወደ " + dl.name + dTag));
        });
      }

      var maxStock = itemStock(state.data, it.id);
      maxLabel.textContent = "የሚዘዋወረው ከፍተኛ መጠን: " + maxStock + " ፍሬ";
      qtyInput.max = maxStock;
    }

    itemSelect.addEventListener("change", updateOptions);
    updateOptions();

    body.appendChild(Field("የሚዘዋወረው ዕቃ", true, itemSelect));
    body.appendChild(Field("መነሻ ቦታ", false, fromBadge));
    body.appendChild(Field("መዳረሻ ቦታ", true, toSelect));
    body.appendChild(Field("የሚዘዋወረው ብዛት", true, qtyInput));
    body.appendChild(maxLabel);
    body.appendChild(errBox);
  }, function (close) {
    var btn = el("button", { class: "btn btn-primary" }, "አስተላልፍ");
    btn.addEventListener("click", guarded(function () {
      if (!itemSelect) { close(); return; }
      var sourceItem = state.data.items.find(function (x) { return x.id === itemSelect.value; });
      if (!sourceItem) { errBox.textContent = "ዕቃ አልተመረጠም"; return; }
      var curStock = itemStock(state.data, sourceItem.id);
      var transferQty = Math.floor(Number(qtyInput.value) || 0);

      if (transferQty <= 0 || transferQty > curStock) {
        errBox.textContent = "እባክዎ ከ 1 እስከ " + curStock + " መካከል ያለ ትክክለኛ ብዛት ያስገቡ";
        return;
      }

      var destLoc = locations.find(function (l) { return l.id === toSelect.value; });
      if (!destLoc) {
        errBox.textContent = "እባክዎ ትክክለኛ መዳረሻ ቦታ ይምረጡ";
        return;
      }

      setData(function (d) {
        // 1. Subtract transferQty from source item opening stock (or remaining)
        var s = d.items.find(function (x) { return x.id === sourceItem.id; });
        if (s) {
          s.openingStock = Math.max(0, s.openingStock - transferQty);
        }

        // 2. Add transferQty to existing destination item or create a new entry
        var destItem = d.items.find(function (x) {
          return x.name.toLowerCase() === sourceItem.name.toLowerCase() &&
                 (x.locationId === destLoc.id || x.locationName === destLoc.name || x.location === destLoc.name);
        });

        if (destItem) {
          destItem.openingStock += transferQty;
        } else {
          d.items.push({
            id: uid(),
            name: sourceItem.name,
            code: sourceItem.code || "",
            locationId: destLoc.id,
            locationType: destLoc.type,
            locationName: destLoc.name,
            location: destLoc.name,
            costPriceCents: sourceItem.costPriceCents || 0,
            sellPriceCents: sourceItem.sellPriceCents || 0,
            openingStock: transferQty,
            dateAdded: todayISO(),
            expiry: sourceItem.expiry || "",
            createdAt: Date.now()
          });
        }
        return d;
      });

      showToast(transferQty + " ፍሬ ዕቃ በተሳካ ሁኔታ ወደ " + destLoc.name + " ተዘዋውሯል");
      close();
    }));
    return btn;
  });
}

function formatDDMMYYYY(isoDateStr) {
  if (!isoDateStr) return "";
  var parts = isoDateStr.split("-");
  if (parts.length === 3) {
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }
  return isoDateStr;
}

function renderExpenses(container) {
  // 1. Header with prominent "+" / "+ አዲስ ምድብ" button for dynamic category creation
  var headerRow = el("div", { class: "flex items-center justify-between section mb2" }, [
    el("div", { class: "eyebrow", style: { margin: "0", fontSize: "16px", fontWeight: "800", color: "#1e293b" } }, "💸 የወጪ መዝገብ"),
    el("button", {
      type: "button",
      class: "btn btn-outline btn-sm",
      style: {
        background: "#eff6ff",
        color: "#1d4ed8",
        borderColor: "#93c5fd",
        fontWeight: "800",
        padding: "6px 12px",
        borderRadius: "10px",
        fontSize: "12.5px"
      },
      title: "አዲስ የወጪ ምድብ ፍጠር"
    }, "+ አዲስ ምድብ")
  ]);
  headerRow.querySelector("button").addEventListener("click", function () {
    openCreateExpenseCategoryModal(function () {
      renderApp();
    });
  });
  container.appendChild(headerRow);

  var addBtn = el("button", {
    class: "btn btn-primary section",
    style: { width: "100%", padding: "12px", fontSize: "14px", fontWeight: "800", borderRadius: "12px", marginBottom: "16px" }
  }, "+ ወጪ መዝግብ");
  addBtn.addEventListener("click", function () { openAddExpenseModal(); });
  container.appendChild(addBtn);

  // 2. Dynamic 2-column Category Summary Grid
  var categories = getExpenseCategories(state.data);
  var byCat = expenseByCategory(state.data.expenses);

  var gridWrap = el("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: "10px",
      marginBottom: "20px"
    }
  });

  categories.forEach(function (c) {
    var catTotalCents = byCat[c] || 0;
    var catCard = el("div", {
      style: {
        background: "#ffffff",
        border: "1.5px solid #e2e8f0",
        borderRadius: "14px",
        padding: "12px 14px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between"
      }
    }, [
      el("div", { class: "flex items-center justify-between mb1" }, [
        el("span", { style: { fontWeight: "800", fontSize: "13.5px", color: "#1e293b" } }, c),
        el("span", { style: { fontSize: "12px", color: "#94a3b8" } }, "📂")
      ]),
      el("div", {
        style: { fontSize: "13px", fontWeight: "800", color: catTotalCents > 0 ? "#dc2626" : "#64748b", marginTop: "4px" }
      }, "ጠቅላላ: " + fmt(catTotalCents))
    ]);
    gridWrap.appendChild(catCard);
  });
  container.appendChild(gridWrap);

  // 3. Daily Expenses List (የዛሬ ወጪዎች)
  var todayFormatted = formatDDMMYYYY(todayISO());
  container.appendChild(el("div", { class: "eyebrow mb2", style: { fontSize: "13px", fontWeight: "800", color: "#334155" } }, "የዛሬ ወጪዎች (" + todayFormatted + ")"));
  var listWrap = el("div", { class: "list-scroll", style: { marginBottom: "16px" } });
  container.appendChild(listWrap);

  function draw() {
    clear(listWrap);
    var list = state.data.expenses.filter(function (e) { return e.date === todayISO(); }).slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    if (list.length === 0) {
      listWrap.appendChild(el("div", {
        class: "empty",
        style: { padding: "20px 12px", textAlign: "center", color: "#64748b", fontSize: "13px", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e1" }
      }, "📭 ዛሬ ምንም ወጪ አልተመዘገበም"));
      return;
    }
    list.forEach(function (e) {
      var row = el("div", {
        style: {
          background: "#ffffff",
          border: "1.5px solid #e2e8f0",
          borderRadius: "12px",
          padding: "12px 14px",
          marginBottom: "8px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
        }
      });

      var catAmountLine = el("div", {
        class: "flex items-center justify-between",
        style: { fontWeight: "800", fontSize: "14px", color: "#1e293b", marginBottom: e.title ? "3px" : "0" }
      }, [
        el("span", {}, (e.category || "ሌላ") + " : " + fmt(e.amountCents)),
        el("div", { class: "flex gap1 items-center" }, [
          el("button", {
            type: "button",
            class: "icon-btn",
            title: "✎ አርም",
            style: { padding: "4px 8px", fontSize: "13.5px", color: "#2563eb", background: "#eff6ff", borderRadius: "8px" },
            onclick: function () { openAddExpenseModal(e); }
          }, "✎"),
          el("button", {
            type: "button",
            class: "icon-btn",
            title: "🗑️ ሰርዝ",
            style: { padding: "4px 8px", fontSize: "13.5px", color: "#dc2626", background: "#fef2f2", borderRadius: "8px" },
            onclick: function () {
              if (confirm("ይህን ወጪ መሰረዝ ይፈልጋሉ?")) {
                setData(function (d) {
                  d.expenses = d.expenses.filter(function (x) { return x.id !== e.id; });
                  return d;
                });
                renderApp();
              }
            }
          }, "🗑")
        ])
      ]);

      row.appendChild(catAmountLine);
      if (e.title && e.title !== e.category) {
        row.appendChild(el("div", { style: { fontSize: "11.5px", color: "#64748b" } }, "📝 " + e.title));
      }
      listWrap.appendChild(row);
    });
  }
  draw();

  // 4. Historical Navigation Button
  var histBtn = el("button", {
    class: "btn btn-outline section",
    style: {
      width: "100%",
      padding: "12px 14px",
      fontSize: "13.5px",
      fontWeight: "700",
      marginTop: "12px",
      borderRadius: "12px",
      borderColor: "#cbd5e1",
      background: "#f8fafc",
      color: "#334155"
    }
  }, "📅 ወደ ታሪክ / ሳምንታዊ / ወርሃዊ / አመታዊ ዝርዝር ይግቡ");
  histBtn.addEventListener("click", function () { openHistoryPicker(); });
  container.appendChild(histBtn);
}

var reportsPeriod = "month";
function renderReports(container) {
  container.appendChild(el("div", { class: "eyebrow section" }, "📊 ሪፖርት (ለባንክ ብድር ማመልከቻ ዝግጁ)"));

  var pillRow = el("div", { class: "pill-row section" });
  [["week", "ሳምንት"], ["month", "ወር"], ["year", "አመት"], ["all", "ጠቅላላ ጊዜ"]].forEach(function (p) {
    var b = el("button", { class: "pill" + (reportsPeriod === p[0] ? " active" : ""), style: { flex: "1" } }, p[1]);
    b.addEventListener("click", function () { reportsPeriod = p[0]; state.tab = "reports"; renderApp(); });
    pillRow.appendChild(b);
  });
  container.appendChild(pillRow);

  var data = state.data;
  var sales, expenses;
  if (reportsPeriod === "all") { sales = data.sales; expenses = data.expenses; }
  else {
    var now = new Date(), start;
    if (reportsPeriod === "week") { var day = now.getDay(); var diffToMonday = (day + 6) % 7; start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday); }
    else if (reportsPeriod === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
    else start = new Date(now.getFullYear(), 0, 1);
    var range = { start: start.getTime(), end: now.getTime() + 1 };
    sales = data.sales.filter(function (s) { var t = new Date(s.date + "T00:00:00").getTime(); return t >= range.start && t <= range.end; });
    expenses = data.expenses.filter(function (e) { var t = new Date(e.date + "T00:00:00").getTime(); return t >= range.start && t <= range.end; });
  }

  var st = {
    revenue: sales.reduce(function (s, x) { return s + x.totalCents; }, 0),
    expenseTotal: expenses.reduce(function (s, x) { return s + x.amountCents; }, 0),
    profit: sales.reduce(function (s, x) { return s + (x.unitPriceCents - x.unitCostCents) * x.qty; }, 0) - expenses.reduce(function (s, x) { return s + x.amountCents; }, 0)
  };
  var pay = paymentBreakdown(sales);
  var byCat = expenseByCategory(expenses);
  var capital = totalCapitalCents(data);
  var invValue = inventoryValueCents(data);

  var summaryCard = el("div", { class: "card blue section" });
  summaryCard.appendChild(el("div", { class: "card-label mb2" }, "🏦 ለባንክ ቁልፍ መረጃዎች"));
  [["ጠቅላላ ገቢ (Gross Revenue)", st.revenue], ["ጠቅላላ ወጪ (Total Expenses)", st.expenseTotal], ["የተጣራ ትርፍ (Net Profit)", st.profit], ["የዕቃ ክምችት እሴት (Inventory Asset Value)", invValue], ["ጠቅላላ ካፒታል (Total Capital)", capital]].forEach(function (row) {
    summaryCard.appendChild(el("div", { class: "list-row" }, [el("span", {}, row[0]), el("span", { style: { fontWeight: "800", color: row[0].indexOf("ትርፍ") !== -1 ? (row[1] >= 0 ? "#16a34a" : "#dc2626") : "#1e293b" } }, fmt(row[1]))]));
  });
  container.appendChild(summaryCard);

  var payCard = el("div", { class: "card violet section" });
  payCard.appendChild(el("div", { class: "card-label mb2" }, "💳 የክፍያ ፍሰት (ካሽ / ባንክ / ዱቤ)"));
  payCard.appendChild(el("div", { class: "list-row" }, [el("span", {}, "ካሽ"), el("span", { style: { fontWeight: "700" } }, fmt(pay.cash))]));
  payCard.appendChild(el("div", { class: "list-row" }, [el("span", {}, "ባንክ ትራንስፈር"), el("span", { style: { fontWeight: "700" } }, fmt(pay.bank))]));
  payCard.appendChild(el("div", { class: "list-row" }, [el("span", {}, "ዱቤ (ጠቅላላ)"), el("span", { style: { fontWeight: "700" } }, fmt(pay.credit))]));
  payCard.appendChild(el("div", { class: "list-row out" }, [el("span", {}, "⚠️ ያልተከፈለ ዱቤ (Outstanding)"), el("span", { style: { fontWeight: "700", color: "#dc2626" } }, fmt(pay.creditOutstanding))]));
  container.appendChild(payCard);

  var recon = verifyPaymentReconciliation(sales);
  container.appendChild(el("div", { class: "section", style: { fontSize: "11.5px", fontWeight: "700", textAlign: "center", padding: "10px", borderRadius: "10px", background: recon.ok ? "#f0fdf4" : "#fef2f2", color: recon.ok ? "#16a34a" : "#dc2626" } },
    recon.ok ? ("✓ ተረጋግጧል፦ ካሽ + ባንክ + ዱቤ (" + fmt(recon.sumOfMethods) + ") = ጠቅላላ ገቢ (" + fmt(recon.total) + ")")
      : ("⚠️ ማሳሰቢያ፦ የሽያጭ እና የገቢ ቁጥሮችዎ አልተገጣጠሙም (" + fmt(recon.sumOfMethods) + " ≠ " + fmt(recon.total) + ")፣ እባክዎ ኦዲተሮች ውድቅ እንዳያደርጉት ያስተካክሉ።")));

  if (Object.keys(byCat).length > 0) {
    var catCard = el("div", { class: "card red section" });
    catCard.appendChild(el("div", { class: "card-label mb2" }, "🗂️ ወጪ በምድብ"));
    EXPENSE_CATEGORIES.forEach(function (c) { if (byCat[c]) catCard.appendChild(el("div", { class: "list-row" }, [el("span", {}, c), el("span", { style: { fontWeight: "700" } }, fmt(byCat[c]))])); });
    container.appendChild(catCard);
  }

  var allocCard = el("div", { class: "card section", style: { borderColor: "#8b5cf6" } });
  allocCard.appendChild(el("div", { class: "card-label mb2", style: { color: "#6d28d9" } }, "🧮 የትርፍ ክፍፍል"));
  allocCard.appendChild(renderAllocationBlock(st.profit, data.allocations, "የተመረጠው ጊዜ"));
  container.appendChild(allocCard);

  var pdfBtn = el("button", { class: "btn btn-navy section" }, "🖨️ የተሟላ ሪፖርትና አባሪዎች (19-20 ገጾች) አዘጋጅ / አውርድ");
  pdfBtn.addEventListener("click", guarded(function () { openReportPrepSheet(); }));
  container.appendChild(pdfBtn);
}

function renderUserProfileEdit(container) {
  container.appendChild(el("div", { class: "eyebrow section" }, "👤 የግል ፕሮፋይል ማስተካከያ"));

  var activeUser = state.currentUser || (prefs && prefs.authUser) || {};
  var initialName = (activeUser.name || activeUser.fullName || (state.data.profile && state.data.profile.ownerName) || "").trim();
  var sessionPhone = getActiveSessionPhone();
  var initialPhone = (sessionPhone || activeUser.phone || state.data.ownerPhoneNumber || (state.data.profile && state.data.profile.phone) || "").trim();
  if (initialPhone === "0911000000") initialPhone = "";
  var initialPhoto = activeUser.avatar || (state.data.profile && state.data.profile.managerPhoto) || "";

  var card = el("div", { class: "card section", style: { padding: "20px" } });

  // 1. Profile Photo Uploader (ፕሮፋይል ፎቶ መስቀያ)
  var photoWrap = el("div", { class: "flex-col items-center gap2 mb4" });
  var avatarPreview = el("img", {
    src: initialPhoto || "",
    style: {
      width: "90px",
      height: "90px",
      borderRadius: "50%",
      objectFit: "cover",
      border: "3px solid #cbd5e1",
      background: "#f1f5f9",
      display: initialPhoto ? "block" : "none"
    }
  });
  var avatarPlaceholder = el("div", {
    style: {
      width: "90px",
      height: "90px",
      borderRadius: "50%",
      background: "#f1f5f9",
      display: initialPhoto ? "none" : "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "36px",
      border: "3px solid #cbd5e1"
    }
  }, "👤");

  var currentPhotoData = initialPhoto;

  var fileInput = el("input", {
    type: "file",
    accept: "image/*",
    class: "input",
    style: { fontSize: "11px", maxWidth: "240px" }
  });
  fileInput.addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        var size = 240;
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext("2d");
        var scale = Math.max(size / img.width, size / img.height);
        var w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        var dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        currentPhotoData = dataUrl;
        avatarPreview.src = dataUrl;
        avatarPreview.style.display = "block";
        avatarPlaceholder.style.display = "none";
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  photoWrap.appendChild(avatarPreview);
  photoWrap.appendChild(avatarPlaceholder);
  photoWrap.appendChild(el("label", { class: "label", style: { marginTop: "4px" } }, "የፕሮፋይል ፎቶ"));
  photoWrap.appendChild(fileInput);
  card.appendChild(photoWrap);

  // 2. Full Name Input (ሙሉ ስም)
  var nameInput = el("input", {
    class: "input",
    id: "profile-fullname-field",
    value: initialName,
    placeholder: "ሙሉ ስምዎን ያስገቡ"
  });
  card.appendChild(Field("ሙሉ ስም (Full Name)", true, nameInput));

  // Directly fetch and read users/{currentUserPhone}.full_name from Firestore
  if (initialPhone) {
    fetchUserFromFirestore(initialPhone).then(function (userData) {
      if (userData) {
        var remoteFullName = userData.full_name || userData.fullName || userData.name;
        if (remoteFullName && typeof remoteFullName === "string" && remoteFullName.trim()) {
          var trimmedName = remoteFullName.trim();
          nameInput.value = trimmedName;
          if (state.currentUser) {
            state.currentUser.name = trimmedName;
            state.currentUser.fullName = trimmedName;
            state.currentUser.full_name = trimmedName;
          }
          if (prefs && prefs.authUser) {
            prefs.authUser.name = trimmedName;
            prefs.authUser.fullName = trimmedName;
            prefs.authUser.full_name = trimmedName;
          }
          console.log("[Profile] ✓ Directly retrieved full_name from Firestore users/" + initialPhone + ":", trimmedName);
        }
      }
    }).catch(function (err) {
      console.error("[Profile Error] Failed to fetch users/" + initialPhone + " from Firestore:", err);
    });
  }

  // 3. Phone Number Display (ስልክ ቁጥር - Read Only)
  var phoneDisplay = el("input", {
    class: "input",
    id: "profile-phone-readonly",
    value: initialPhone || "ያልተመዘገበ",
    readOnly: true,
    disabled: true,
    style: { background: "#f8fafc", color: "#1e293b", cursor: "not-allowed", fontWeight: "700" }
  });
  var phoneField = Field("ስልክ ቁጥር (Read-Only)", false, phoneDisplay);
  phoneField.appendChild(el("div", { style: { fontSize: "10.5px", color: "#64748b", marginTop: "3px" } }, "🔒 ስልክ ቁጥር ከመለያው ጋር የተቆለፈ የማይቀየር የደህንነት መለያ ነው"));
  card.appendChild(phoneField);

  // 4. Save Action (አስቀምጥ)
  var saveBtn = el("button", { class: "btn btn-primary mt3" }, "💾 አስቀምጥ");
  saveBtn.addEventListener("click", guarded(function () {
    var newName = nameInput.value.trim();
    if (!newName) {
      showToast("እባክዎ ሙሉ ስም ያስገቡ");
      return;
    }

    // Direct Firestore update of users/{currentUserPhone}.full_name
    if (initialPhone) {
      updateUserFullNameInFirestore(initialPhone, newName).then(function (res) {
        if (res && res.ok) {
          console.log("[Profile] ✓ Successfully updated users/" + initialPhone + ".full_name in Firestore:", newName);
        } else {
          console.error("[Profile Error] Failed updating users/" + initialPhone + ".full_name in Firestore:", res && res.error);
        }
      }).catch(function (err) {
        console.error("[Profile Exception] Uncaught error updating users/" + initialPhone + ".full_name:", err);
      });
    }

    if (!state.currentUser) state.currentUser = {};
    state.currentUser.name = newName;
    state.currentUser.fullName = newName;
    state.currentUser.full_name = newName;
    state.currentUser.avatar = currentPhotoData;

    if (prefs && prefs.authUser) {
      prefs.authUser.name = newName;
      prefs.authUser.fullName = newName;
      prefs.authUser.full_name = newName;
      prefs.authUser.avatar = currentPhotoData;
      savePrefs(prefs);
    }

    setData(function (d) {
      if (!d.profile) d.profile = {};
      d.profile.ownerName = newName;
      d.profile.managerPhoto = currentPhotoData;
      return d;
    });

    showToast("✓ ፕሮፋይል ተስተካክሏል (Firestore ተዘምኗል)");
    renderApp();
  }));
  card.appendChild(saveBtn);

  container.appendChild(card);
}

function renderProfile(container) {
  container.appendChild(el("div", { class: "eyebrow section" }, "🏢 የንግድ ድርጅት ፕሮፋይልና ህጋዊ መረጃ"));
  var p = state.data.profile || freshProfile();
  var card = el("div", { class: "card section" });

  // 1. Manager Photo and Trademark / Stamp Logo
  var photoRow = el("div", { class: "grid gap3 mb3", style: { gridTemplateColumns: "1fr 1fr" } });

  // Manager Photo
  var mgrWrap = el("div", { class: "flex-col gap1" });
  mgrWrap.appendChild(el("label", { class: "label" }, "የማናጀር ፎቶ"));
  var mgrPreview = el("img", { src: p.managerPhoto || "", style: { width: "72px", height: "72px", borderRadius: "12px", objectFit: "cover", background: "#f1f5f9", display: p.managerPhoto ? "block" : "none", marginBottom: "6px" } });
  var mgrInput = el("input", { type: "file", accept: "image/*", class: "input", style: { fontSize: "11px" } });
  mgrInput.addEventListener("change", function (e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        var size = 240; canvas.width = size; canvas.height = size;
        var ctx = canvas.getContext("2d");
        var scale = Math.max(size / img.width, size / img.height);
        var w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        var dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        mgrPreview.src = dataUrl; mgrPreview.style.display = "block";
        mgrPreview.dataset.value = dataUrl;
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
  mgrWrap.appendChild(mgrPreview);
  mgrWrap.appendChild(mgrInput);
  photoRow.appendChild(mgrWrap);

  // Trademark Logo / Stamp Photo
  var logoWrap = el("div", { class: "flex-col gap1" });
  logoWrap.appendChild(el("label", { class: "label" }, "የትሬድማርክ ሎጎ / ማህተም"));
  var logoPreview = el("img", { src: p.trademarkLogo || "", style: { width: "72px", height: "72px", borderRadius: "12px", objectFit: "contain", background: "#f1f5f9", display: p.trademarkLogo ? "block" : "none", marginBottom: "6px" } });
  var logoInput = el("input", { type: "file", accept: "image/*", class: "input", style: { fontSize: "11px" } });
  logoInput.addEventListener("change", function (e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        var size = 240; canvas.width = size; canvas.height = size;
        var ctx = canvas.getContext("2d");
        var scale = Math.min(size / img.width, size / img.height);
        var w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        var dataUrl = canvas.toDataURL("image/png");
        logoPreview.src = dataUrl; logoPreview.style.display = "block";
        logoPreview.dataset.value = dataUrl;
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
  logoWrap.appendChild(logoPreview);
  logoWrap.appendChild(logoInput);
  photoRow.appendChild(logoWrap);

  card.appendChild(photoRow);

  // Standard Text Fields
  var textFields = [
    ["shopName", "የድርጅት ስም", true],
    ["ownerName", "የማናጀር / ወኪል ስም", true],
    ["businessSector", "የስራ ዘርፍ", false],
    ["tin", "TIN ቁጥር", true],
    ["license", "የታደሰ ንግድ ፈቃድ ቁጥር", true],
    ["businessRegistration", "የጸደቀ የንግድ ምዝገባ ቁጥር", false],
    ["digitalId", "የታደሰ ዲጅታል መታወቅያ (ፋይዳ) ቁጥር", false]
  ];

  var inputs = {};
  textFields.forEach(function (f) {
    var input = el("input", { class: "input", value: p[f[0]] || "" });
    inputs[f[0]] = input;
    card.appendChild(Field(f[1], f[2], input));
  });

  // Helper for document file upload
  function makeDocUploadBox(labelTitle, currentDoc, currentName, onFile) {
    var box = el("div", { class: "mb3", style: { background: "#f8fafc", padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1" } });
    box.appendChild(el("label", { class: "label", style: { marginBottom: "4px" } }, labelTitle));
    var statusRow = el("div", { class: "flex items-center gap2 mb2", style: { fontSize: "11.5px" } });
    var statusIcon = el("span", {}, currentDoc ? (currentDoc.indexOf("data:image") !== -1 ? "🖼️" : "📄") : "📎");
    var statusText = el("span", { style: { fontWeight: "700", color: currentDoc ? "#166534" : "#64748b" } },
      currentDoc ? ("ተያይዟል: " + (currentName || "ሰነድ")) : "ሰነድ አልተያያዘም (PDF ወይም ምስል)");
    statusRow.appendChild(statusIcon);
    statusRow.appendChild(statusText);
    box.appendChild(statusRow);

    var fileInp = el("input", { type: "file", accept: "image/*,application/pdf,.pdf", class: "input", style: { fontSize: "11px" } });
    fileInp.addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        statusIcon.textContent = file.type.indexOf("image") !== -1 ? "🖼️" : "📄";
        statusText.textContent = "ተያይዟል: " + file.name;
        statusText.style.color = "#166534";
        onFile(ev.target.result, file.name);
      };
      reader.readAsDataURL(file);
    });
    box.appendChild(fileInp);
    return box;
  }

  // Address
  var addrInput = el("input", { class: "input", value: p.address || "" });
  inputs.address = addrInput;
  card.appendChild(Field("የስራ አድራሻ", true, addrInput));

  // Contact Info
  var emailInput = el("input", { class: "input", value: p.email || "" });
  inputs.email = emailInput;
  card.appendChild(Field("ኢሜይል", false, emailInput));

  var phoneInput = el("input", { class: "input", value: p.phone || "" });
  inputs.phone = phoneInput;
  card.appendChild(Field("ስልክ ቁጥር", true, phoneInput));

  // --- Document Annex Attachments Section ---
  card.appendChild(el("div", { class: "eyebrow mb2 mt3", style: { color: "#1e3a8a" } }, "📑 የሪፖርት አባሪ ሰነዶች (Annex Attachments)"));

  // Annex 1: Business License & Registration
  var licDocData = p.businessLicenseDoc || "";
  var licDocName = p.businessLicenseDocName || "";
  card.appendChild(makeDocUploadBox("አባሪ 1(ሀ)፡ የታደሰ ንግድ ፈቃድ ቅጂ (PDF/Image)", licDocData, licDocName, function (d, n) { licDocData = d; licDocName = n; }));

  var regDocData = p.registrationDoc || "";
  var regDocName = p.registrationDocName || "";
  card.appendChild(makeDocUploadBox("አባሪ 1(ለ)፡ የንግድ ምዝገባ ምስክር ወረቀት ቅጂ (PDF/Image)", regDocData, regDocName, function (d, n) { regDocData = d; regDocName = n; }));

  // Annex 2: TIN & Tax
  var tinDocData = p.tinDoc || "";
  var tinDocName = p.tinDocName || "";
  card.appendChild(makeDocUploadBox("አባሪ 2(ሀ)፡ የTIN ሰርተፊኬት / ካርድ ቅጂ (PDF/Image)", tinDocData, tinDocName, function (d, n) { tinDocData = d; tinDocName = n; }));

  var taxDocData = p.taxClearanceDoc || "";
  var taxDocName = p.taxClearanceDocName || "";
  card.appendChild(makeDocUploadBox("አባሪ 2(ለ)፡ የታክስ ክሊራንስ / የክፍያ ደረሰኝ ቅጂ (PDF/Image)", taxDocData, taxDocName, function (d, n) { taxDocData = d; taxDocName = n; }));

  // Annex 3: Lease Contract
  var leaseDocData = p.leaseContractDoc || "";
  var leaseDocName = p.leaseContractDocName || "";
  card.appendChild(makeDocUploadBox("አባሪ 3(ሀ)፡ የቤት/የቦታ ኪራይ ውል ገጽ 1 (PDF/Image)", leaseDocData, leaseDocName, function (d, n) { leaseDocData = d; leaseDocName = n; }));

  var leaseDocData2 = p.leaseContractDocPage2 || "";
  var leaseDocName2 = p.leaseContractDocPage2Name || "";
  card.appendChild(makeDocUploadBox("አባሪ 3(ለ)፡ የቤት/የቦታ ኪራይ ውል ገጽ 2 (PDF/Image)", leaseDocData2, leaseDocName2, function (d, n) { leaseDocData2 = d; leaseDocName2 = n; }));

  var leaseDocData3 = p.leaseContractDocPage3 || "";
  var leaseDocName3 = p.leaseContractDocPage3Name || "";
  card.appendChild(makeDocUploadBox("አባሪ 3(ሐ)፡ የቤት/የቦታ ኪራይ ውል ገጽ 3 (አማራጭ)", leaseDocData3, leaseDocName3, function (d, n) { leaseDocData3 = d; leaseDocName3 = n; }));

  // Annex 4: Identity & Marital Status
  var idDocData = p.idCardDoc || "";
  var idDocName = p.idCardDocName || "";
  card.appendChild(makeDocUploadBox("አባሪ 4(ሀ)፡ ዲጂታል / ብሔራዊ መታወቂያ ፊትና ጀርባ (PDF/Image)", idDocData, idDocName, function (d, n) { idDocData = d; idDocName = n; }));

  var maritalDocData = p.maritalStatusDoc || "";
  var maritalDocName = p.maritalStatusDocName || "";
  card.appendChild(makeDocUploadBox("አባሪ 4(ለ)፡ የጋብቻ ሁኔታ / የነጠላነት ማስረጃ ሰነድ (PDF/Image)", maritalDocData, maritalDocName, function (d, n) { maritalDocData = d; maritalDocName = n; }));

  var saveBtn = el("button", { class: "btn btn-primary mt3" }, "💾 አስቀምጥ");
  saveBtn.addEventListener("click", guarded(function () {
    setData(function (d) {
      var np = d.profile || {};
      textFields.forEach(function (f) { np[f[0]] = inputs[f[0]].value.trim(); });
      np.address = inputs.address.value.trim();
      np.email = inputs.email.value.trim();
      np.phone = inputs.phone.value.trim();
      np.managerPhoto = mgrPreview.dataset.value || p.managerPhoto || "";
      np.trademarkLogo = logoPreview.dataset.value || p.trademarkLogo || "";

      np.businessLicenseDoc = licDocData;
      np.businessLicenseDocName = licDocName;
      np.registrationDoc = regDocData;
      np.registrationDocName = regDocName;
      np.tinDoc = tinDocData;
      np.tinDocName = tinDocName;
      np.taxClearanceDoc = taxDocData;
      np.taxClearanceDocName = taxDocName;
      np.leaseContractDoc = leaseDocData;
      np.leaseContractDocName = leaseDocName;
      np.leaseContractDocPage2 = leaseDocData2;
      np.leaseContractDocPage2Name = leaseDocName2;
      np.leaseContractDocPage3 = leaseDocData3;
      np.leaseContractDocPage3Name = leaseDocName3;
      np.idCardDoc = idDocData;
      np.idCardDocName = idDocName;
      np.maritalStatusDoc = maritalDocData;
      np.maritalStatusDocName = maritalDocName;

      d.profile = np;
      return d;
    });

    // Synchronize full_name to Firestore users/{phone}.full_name if available
    var activePhone = getActiveSessionPhone() || (state.currentUser && state.currentUser.phone) || (inputs.phone && inputs.phone.value.trim());
    var ownerNameVal = inputs.ownerName ? inputs.ownerName.value.trim() : "";
    if (activePhone && ownerNameVal) {
      updateUserFullNameInFirestore(activePhone, ownerNameVal).then(function (res) {
        if (res && res.ok) {
          console.log("[Profile] ✓ Synchronized ownerName to users/" + activePhone + ".full_name in Firestore:", ownerNameVal);
        }
      }).catch(function (err) {
        console.error("[Profile Exception] Error syncing users/" + activePhone + ".full_name in Firestore:", err);
      });
    }

    showToast("✓ የንግድ ድርጅት ፕሮፋይልና አባሪ ሰነዶች ተቀምጠዋል");
  }));
  card.appendChild(saveBtn);
  container.appendChild(card);
  container.appendChild(el("div", { class: "helpmsg section" }, "ይህ መረጃ በባለ 19/20-ገጽ PDF ሪፖርት እና አባሪዎች ላይ በቀጥታ ይካተታል — ለባንክ ብድርና ለህጋዊ ኦዲት በጥንቃቄ ይሙሉ።"));
}

function renderLoanCenter(container) {
  container.appendChild(el("div", { class: "eyebrow section" }, "🏦 የባንክ ብድር ማዕከል"));
  var lc = state.data.loanCenter || freshLoanCenter();

  var utilCard = el("div", { class: "card blue section" });
  utilCard.appendChild(el("div", { class: "card-label mb2" }, "ሀ. የብድር ፍላጎት እና አጠቃቀም"));

  // Bank Name Selection / Input
  var bankNames = [
    "የኢትዮጵያ ንግድ ባንክ (CBE)",
    "አዋሽ ባንክ (Awash Bank)",
    "አቢሲኒያ ባንክ (Bank of Abyssinia)",
    "ዳሽን ባንክ (Dashen Bank)",
    "ኅብረት ባንክ (Hibret Bank)",
    "ኦሮሚያ ባንክ (Oromia Bank)",
    "ወጋገን ባንክ (Wegagen Bank)",
    "ንብ ባንክ (Nib Bank)",
    "ዘመን ባንክ (Zemen Bank)",
    "ፀደይ ባንክ (Tsedey Bank)",
    "ኦሮሚያ ህብረት ስራ ባንክ (Coop Bank)",
    "አንበሳ ኢንተርናሽናል ባንክ",
    "ግሎባል ባንክ ኢትዮጵያ",
    "ሲናን ባንክ"
  ];

  var bankWrap = el("div", { class: "mb3" });
  bankWrap.appendChild(el("label", { class: "label" }, "የባንክ ስም / ብድር የሚጠየቅበት ባንክ"));
  var bankSelect = el("select", { class: "input mb2", style: { fontSize: "12px" } });
  bankSelect.appendChild(el("option", { value: "" }, "-- ባንክ ይምረጡ ወይም ከታች ይጻፉ --"));
  bankNames.forEach(function (bn) {
    var opt = el("option", { value: bn }, bn);
    if (lc.bankName === bn) opt.selected = true;
    bankSelect.appendChild(opt);
  });
  var customBankInput = el("input", {
    class: "input",
    placeholder: "የባንኩ ስም (ይምረጡ ወይም እዚህ ይጻፉ)",
    value: lc.bankName || ""
  });
  bankSelect.addEventListener("change", function () {
    if (bankSelect.value) customBankInput.value = bankSelect.value;
  });
  bankWrap.appendChild(bankSelect);
  bankWrap.appendChild(customBankInput);
  utilCard.appendChild(bankWrap);

  var amtInput = el("input", { class: "input", type: "number", step: "0.01", value: (lc.requestedAmountCents / 100).toFixed(2) });
  utilCard.appendChild(Field("የሚጠየቀው የብድር መጠን", true, amtInput));
  var saveAmtBtn = el("button", { class: "btn btn-outline btn-sm" }, "የብድር መረጃ አስቀምጥ");
  saveAmtBtn.addEventListener("click", guarded(function () {
    setData(function (d) {
      d.loanCenter.requestedAmountCents = toCents(amtInput.value);
      d.loanCenter.bankName = customBankInput.value.trim();
      return d;
    });
    showToast("የብድር መረጃ ተቀምጧል");
  }));
  utilCard.appendChild(saveAmtBtn);

  utilCard.appendChild(el("div", { class: "mt3 mb2", style: { fontSize: "12px", fontWeight: "700", color: "#1e293b" } }, "የገንዘቡ አጠቃቀም ስርጭት (%)"));
  var usageWrap = el("div", {});
  utilCard.appendChild(usageWrap);
  function drawUsage() {
    clear(usageWrap);
    var rows = lc.usageAllocations;
    var tot = rows.reduce(function (s, r) { return s + Number(r.percent); }, 0);
    rows.forEach(function (r, idx) {
      var nameInput = el("input", { class: "input alloc-name", value: r.purpose });
      var pctInput = el("input", { class: "input alloc-pct", type: "number", value: r.percent });
      var rmBtn = el("button", { class: "trash-btn" }, "✕");
      rmBtn.addEventListener("click", function () { setData(function (d) { d.loanCenter.usageAllocations.splice(idx, 1); return d; }); });
      nameInput.addEventListener("change", function (e) { setData(function (d) { d.loanCenter.usageAllocations[idx].purpose = e.target.value; return d; }); });
      pctInput.addEventListener("change", function (e) { setData(function (d) { d.loanCenter.usageAllocations[idx].percent = Number(e.target.value) || 0; return d; }); });
      usageWrap.appendChild(el("div", { class: "flex gap2 items-center mb2" }, [nameInput, pctInput, rmBtn]));
    });
    usageWrap.appendChild(el("div", { style: { fontSize: "11px", fontWeight: "700", color: Math.abs(tot - 100) > 0.01 ? "#f59e0b" : "#16a34a" } }, "ጠቅላላ: " + tot + "%"));
  }
  drawUsage();
  var addUsageBtn = el("button", { class: "btn btn-outline btn-sm mt2" }, "+ ስርጭት ጨምር");
  addUsageBtn.addEventListener("click", function () { setData(function (d) { d.loanCenter.usageAllocations.push({ id: uid(), purpose: "አዲስ አላማ", percent: 0 }); return d; }); });
  utilCard.appendChild(addUsageBtn);
  container.appendChild(utilCard);

  var proformaCard = el("div", { class: "card section" });
  proformaCard.appendChild(el("div", { class: "card-label mb2" }, "📄 የፕሮፎርማ ኢንቮይስ መዝገብ"));
  var pfSupplier = el("input", { class: "input", placeholder: "አቅራቢ ስም" });
  var pfDesc = el("input", { class: "input", placeholder: "ዝርዝር (ምን እንደሚገዛ)" });
  var pfAmt = el("input", { class: "input", type: "number", step: "0.01", placeholder: "የተጠቀሰ ዋጋ" });
  var addPfBtn = el("button", { class: "btn btn-outline btn-sm" }, "+ ጨምር");
  addPfBtn.addEventListener("click", guarded(function () {
    if (!pfSupplier.value.trim() || !pfAmt.value) { showToast("እባክዎ አቅራቢ ስም እና ዋጋ ያስገቡ"); return; }
    setData(function (d) { d.loanCenter.proformaInvoices.push({ id: uid(), supplier: pfSupplier.value.trim(), description: pfDesc.value.trim(), amountCents: toCents(pfAmt.value), date: todayISO() }); return d; });
    pfSupplier.value = ""; pfDesc.value = ""; pfAmt.value = "";
  }));
  proformaCard.appendChild(pfSupplier); proformaCard.appendChild(el("div", { class: "mt2" }, [pfDesc])); proformaCard.appendChild(el("div", { class: "mt2" }, [pfAmt])); proformaCard.appendChild(el("div", { class: "mt2" }, [addPfBtn]));
  lc.proformaInvoices.forEach(function (pf) {
    proformaCard.appendChild(el("div", { class: "list-row", style: { marginTop: "8px" } }, [
      el("span", {}, pf.supplier + (pf.description ? " · " + pf.description : "")),
      el("span", { style: { fontWeight: "700" } }, fmt(pf.amountCents))
    ]));
  });
  container.appendChild(proformaCard);

  var cfCard = el("div", { class: "card green section" });
  cfCard.appendChild(el("div", { class: "card-label mb2" }, "ለ. የ12 ወራት የገንዘብ ፍሰት ትንበያ"));
  var todayEth = { month: 1 };
  try {
    var ethNow = todayISO().split('-');
    todayEth.month = parseInt(ethNow[1]) || 1;
  } catch(e){}
  if (!lc.cashFlowProjection || lc.cashFlowProjection.length !== 12) {
    var proj = [];
    for (var m = 0; m < 12; m++) { var mm = ((todayEth.month - 1 + m) % 12) + 1; proj.push({ month: mm, projectedRevenueCents: 0 }); }
    lc.cashFlowProjection = proj;
  }
  lc.cashFlowProjection.forEach(function (row, idx) {
    var input = el("input", { class: "input", type: "number", step: "0.01", value: (row.projectedRevenueCents / 100).toFixed(2), style: { flex: "1" } });
    input.addEventListener("change", function (e) { setData(function (d) { d.loanCenter.cashFlowProjection[idx].projectedRevenueCents = toCents(e.target.value); return d; }); });
    cfCard.appendChild(el("div", { class: "flex items-center gap2 mb2" }, [el("span", { style: { width: "88px", fontSize: "12px", color: "#64748b" } }, ETH_MONTHS[row.month - 1]), input]));
  });
  container.appendChild(cfCard);

  var mktCard = el("div", { class: "card amber section" });
  mktCard.appendChild(el("div", { class: "card-label mb2", style: { color: "#b45309" } }, "ሐ. አቅራቢዎች እና የገበያ ሁኔታ"));
  var supName = el("input", { class: "input", placeholder: "የአቅራቢ ስም" });
  var supAddr = el("input", { class: "input", placeholder: "አድራሻ" });
  var addSupBtn = el("button", { class: "btn btn-outline btn-sm" }, "+ አቅራቢ ጨምር");
  addSupBtn.addEventListener("click", guarded(function () {
    if (!supName.value.trim()) { showToast("የአቅራቢ ስም ያስገቡ"); return; }
    setData(function (d) { d.loanCenter.suppliers.push({ id: uid(), name: supName.value.trim(), address: supAddr.value.trim() }); return d; });
    supName.value = ""; supAddr.value = "";
  }));
  mktCard.appendChild(supName); mktCard.appendChild(el("div", { class: "mt2" }, [supAddr])); mktCard.appendChild(el("div", { class: "mt2" }, [addSupBtn]));
  lc.suppliers.forEach(function (s, sIdx) {
    mktCard.appendChild(el("div", { class: "list-row", style: { marginTop: "8px" } }, [
      el("span", {}, s.name + (s.address ? " · " + s.address : "")),
      el("button", { class: "trash-btn", onclick: function () { setData(function (d) { d.loanCenter.suppliers.splice(sIdx, 1); return d; }); } }, "✕")
    ]));
  });
  var mktText = el("textarea", { class: "input mt3", rows: "4", placeholder: "የሱቁን ተወዳዳሪነት ጥንካሬዎች (ጥራት፣ ዋጋ፣ አካባቢ...)" });
  mktText.value = lc.marketAnalysis || "";
  mktCard.appendChild(mktText);
  var saveMktBtn = el("button", { class: "btn btn-outline btn-sm mt2" }, "መግለጫ አስቀምጥ");
  saveMktBtn.addEventListener("click", guarded(function () { setData(function (d) { d.loanCenter.marketAnalysis = mktText.value.trim(); return d; }); showToast("ተቀምጧል"); }));
  mktCard.appendChild(saveMktBtn);
  container.appendChild(mktCard);

  // Section D: Customers & Buyers Register (መ. የገዢዎች / ቁልፍ ደንበኞች መዝገብ)
  var custCard = el("div", { class: "card section", style: { borderColor: "#10b981" } });
  custCard.appendChild(el("div", { class: "card-label mb2", style: { color: "#059669" } }, "መ. የገዢዎች / ቁልፍ ደንበኞች መዝገብ"));
  var custName = el("input", { class: "input", placeholder: "የደንበኛ/ገዢ ስም" });
  var custAddr = el("input", { class: "input mt2", placeholder: "አድራሻ / አካባቢ" });
  var custPhone = el("input", { class: "input mt2", placeholder: "ስልክ ቁጥር" });
  var custNotes = el("input", { class: "input mt2", placeholder: "ልዩ ማስታወሻ / የሚገዙት የዕቃ ዓይነት" });
  var addCustBtn = el("button", { class: "btn btn-emerald btn-sm mt2" }, "+ ደንበኛ ጨምር");
  addCustBtn.addEventListener("click", guarded(function () {
    if (!custName.value.trim()) { showToast("የደንበኛ ስም ያስገቡ"); return; }
    setData(function (d) {
      if (!d.loanCenter.customers) d.loanCenter.customers = [];
      d.loanCenter.customers.push({
        id: uid(),
        name: custName.value.trim(),
        address: custAddr.value.trim(),
        phone: custPhone.value.trim(),
        notes: custNotes.value.trim()
      });
      return d;
    });
    custName.value = ""; custAddr.value = ""; custPhone.value = ""; custNotes.value = "";
    showToast("ደንበኛ ተመዝግቧል");
  }));
  custCard.appendChild(custName);
  custCard.appendChild(custAddr);
  custCard.appendChild(custPhone);
  custCard.appendChild(custNotes);
  custCard.appendChild(addCustBtn);

  (lc.customers || []).forEach(function (c, cIdx) {
    custCard.appendChild(el("div", { class: "list-row", style: { marginTop: "8px" } }, [
      el("div", {}, [
        el("strong", {}, c.name),
        el("div", { style: { fontSize: "11px", color: "#64748b" } }, [
          c.phone ? el("span", {}, "📞 " + c.phone + " ") : null,
          c.address ? el("span", {}, "📍 " + c.address + " ") : null,
          c.notes ? el("span", {}, "📝 " + c.notes) : null
        ])
      ]),
      el("button", { class: "trash-btn", onclick: function () { setData(function (d) { d.loanCenter.customers.splice(cIdx, 1); return d; }); } }, "✕")
    ]));
  });
  container.appendChild(custCard);

  var pdfBtn = el("button", { class: "btn btn-navy section" }, "🖨️ የተሟላ ሪፖርትና አባሪዎች (19-20 ገጾች) አዘጋጅ / አውርድ");
  pdfBtn.addEventListener("click", guarded(function () { openReportPrepSheet(); }));
  container.appendChild(pdfBtn);
}

function openReportPrepSheet(opts) {
  var user = getCurrentUser();
  if (user && user.role === "employee") {
    showToast("⛔ ይህ ክፍል ለአስተዳዳሪ ብቻ የተፈቀደ ነው");
    return;
  }

  // 1 & 2: Automatic Registration History Detection & Dynamic Period Options
  var hist = getRegistrationHistoryInfo(state.data);
  var todayEth = hist.todayEth;
  var selectedPeriod = "current_year"; // Default to current fiscal year

  openSheet("📄 የተሟላ የባንክ ሪፖርትና አባሪዎች", function (body) {
    body.appendChild(el("div", { class: "helpmsg mb3" }, "ሪፖርቱ ከመረጃ ቋቱ በራሱ (አውቶማቲክ) ይዘጋጃል። ለባንክ ብድርና ኦዲት የሚያገለግል የፋይናንስ ማጠቃለያ፣ የተመዘገቡ ንቁ ዓመታት ንጽጽር እና ህጋዊ አባሪዎችን ያካትታል።"));

    // 2. Automatic Registration History Detection Banner
    var historyCard = el("div", {
      class: "mb3",
      style: {
        background: "#eff6ff",
        border: "1.5px solid #bfdbfe",
        borderRadius: "10px",
        padding: "12px 14px"
      }
    });

    historyCard.appendChild(el("div", {
      style: { fontWeight: "800", fontSize: "12.5px", color: "#1e3a8a", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }
    }, [
      el("span", {}, "⏱️ አውቶማቲክ የመዝገብ ታሪክ መረጃ (Registration History Detection)")
    ]));

    var coverageRow = el("div", {
      style: { fontSize: "12px", fontWeight: "700", color: "#0f172a", marginBottom: "6px", lineHeight: "1.5" }
    });
    coverageRow.innerHTML = "<b>" + hist.coverageText + "</b>";
    historyCard.appendChild(coverageRow);

    var detailsRow = el("div", {
      class: "flex gap3",
      style: { flexWrap: "wrap", fontSize: "11.5px", color: "#475569", paddingTop: "6px", borderTop: "1px dashed #cbd5e1" }
    });
    detailsRow.appendChild(el("div", {}, "⏳ <b>ጠቅላላ ቆይታ፦</b> " + hist.durationText));
    detailsRow.appendChild(el("div", {}, "📊 <b>የግብይቶች ብዛት፦</b> " + (hist.salesCount + hist.expensesCount) + " (" + hist.salesCount + " ሽያጭ፣ " + hist.expensesCount + " ወጪ)"));
    detailsRow.appendChild(el("div", {}, "🏢 <b>ንቁ ዓመታት፦</b> " + hist.activeYears.map(function (y) { return y + " ዓ.ም"; }).join(", ")));
    historyCard.appendChild(detailsRow);

    body.appendChild(historyCard);

    // 1. Dynamic Period Selector UI
    body.appendChild(el("div", { class: "eyebrow mb2" }, "📅 የሪፖርት የጊዜ ሽፋን (Report Period Coverage)"));
    var periodButtonsCol = el("div", { class: "flex flex-col gap2 mb3" });

    var periodOptions = [
      {
        id: "current_year",
        label: "የአሁኑ ዓመት (Current Year)",
        sub: "የ" + todayEth.year + " ዓ.ም የበጀት ዓመት ትክክለኛ ግብይቶች ብቻ"
      },
      {
        id: "last_12_months",
        label: "ባለፉት 12 ወራት (Last 12 Months)",
        sub: "ባለፉት 12 ወራት ውስጥ የተመዘገቡ ተጨባጭ ግብይቶች"
      },
      {
        id: "all_time",
        label: "አፑ ከተጀመረበት ጀምሮ - ሙሉ ታሪክ (All Time / From Start)",
        sub: "ከመጀመሪያው መዝገብ (" + hist.firstDateEthStr + ") ጀምሮ ያሉ ሁሉም ግብይቶች"
      }
    ];

    var btnRefs = [];
    periodOptions.forEach(function (opt) {
      var isCur = opt.id === selectedPeriod;
      var btn = el("button", {
        type: "button",
        class: "btn " + (isCur ? "btn-primary" : "btn-outline"),
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          textAlign: "left",
          padding: "10px 12px",
          borderRadius: "8px",
          width: "100%",
          cursor: "pointer"
        }
      }, [
        el("div", { style: { fontWeight: "800", fontSize: "12.5px" } }, (isCur ? "✓ " : "") + opt.label),
        el("div", { style: { fontSize: "11px", opacity: "0.85", marginTop: "2px", fontWeight: "normal" } }, opt.sub)
      ]);

      btn.addEventListener("click", function () {
        selectedPeriod = opt.id;
        btnRefs.forEach(function (bRef, i) {
          var active = periodOptions[i].id === selectedPeriod;
          bRef.className = "btn " + (active ? "btn-primary" : "btn-outline");
          var titleDiv = bRef.querySelector("div:first-child");
          if (titleDiv) titleDiv.textContent = (active ? "✓ " : "") + periodOptions[i].label;
        });
        updateDesc();
      });
      btnRefs.push(btn);
      periodButtonsCol.appendChild(btn);
    });
    body.appendChild(periodButtonsCol);

    var noteBox = el("div", { class: "rnote mb3", style: { fontSize: "11.5px", background: "#f8fafc", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", lineHeight: "1.5" } });
    function updateDesc() {
      if (selectedPeriod === "current_year") {
        noteBox.innerHTML = "✨ <b>የአሁኑ ዓመት (" + todayEth.year + " ዓ.ም) ሪፖርት፦</b> በዚህ የበጀት ዓመት ውስጥ የተመዘገቡ ተጨባጭ ሽያጮችን፣ ወጪዎችን እና የካፒታል እድገት ብቻ ያካትታል። ባዶ ዓመታት ወይም ምናባዊ መረጃዎች አይካተቱም።";
      } else if (selectedPeriod === "last_12_months") {
        noteBox.innerHTML = "✨ <b>የባለፉት 12 ወራት ሪፖርት፦</b> ባለፉት 12 ወራት ውስጥ ከመረጃ ቋቱ በትክክል የተከናወኑ ተጨባጭ ግብይቶችን ብቻ ያቀርባል።";
      } else {
        noteBox.innerHTML = "✨ <b>ሙሉ ታሪክ (All Time / From Start)፦</b> አፑ ከተጀመረበት የመጀመሪያ ቀን (" + hist.firstDateEthStr + ") እስከ ዛሬ ድረስ የተመዘገቡ ተጨባጭ ግብይቶችን ያጠቃልላል" + (hist.activeYears.length > 1 ? ("። የተመዘገቡት " + hist.activeYears.length + " ንቁ ዓመታት (" + hist.activeYears.join(", ") + " ዓ.ም) ዓመታዊ የዕድገት ንጽጽር ማትሪክስ (YoY Matrix) ያካትታል።") : "። ባዶ ዓመታት ወይም ግምታዊ ገጾች አይፈጠሩም።");
      }
    }
    updateDesc();
    body.appendChild(noteBox);

    var editRow = el("div", { class: "flex gap2 mb3", style: { flexWrap: "wrap" } });
    [["🏢 ፕሮፋይል", "profile"], ["🏦 ብድር ማዕከል", "loancenter"], ["🧮 ክፍፍል/ግብ", "allocgoal"]].forEach(function (x) {
      var b = el("button", { class: "btn btn-outline btn-sm" }, x[0]);
      b.addEventListener("click", function () { navigateToTab(x[1]); });
      editRow.appendChild(b);
    });
    body.appendChild(editRow);
    body.appendChild(el("div", { class: "eyebrow mb2" }, "ሪፖርቱ የሚያካትታቸው ዋና ዋና ክፍሎችና አባሪዎች"));
    var list = [
      "• የባንክና የፋይናንስ ሪፖርት ማጠቃለያ (Executive Overview)",
      "• የተመዘገቡ ንቁ ዓመታት ንጽጽር ማትሪክስ (ተጨባጭ ዓመታት ካሉ ብቻ)",
      "• የዕለታዊ/ወርሃዊ ሽያጭ ሪፖርት እና የወጪዎች ማጠቃለያ",
      "• የዕቃ ክምችት ሁኔታ እና የትርፍ ክፍፍል (70% ካፒታል ድልድል)",
      "• የካፒታል ክምችት ግብ ክትትል እና የካፒታል አጠቃቀም (Working vs Idle)",
      "• አባሪ 1፡ የታደሰ ንግድ ፈቃድና የንግድ ምዝገባ ምስክር ወረቀት (2 ገጾች)",
      "• አባሪ 2፡ የቲን (TIN) እና የታክስ ክሊራንስ ሰነዶች (2 ገጾች)",
      "• አባሪ 3፡ የቤት/የቦታ ኪራይ ውል ስምምነት (2-3 ገጾች)",
      "• አባሪ 4፡ ዲጂታል መታወቂያና የጋብቻ/ነጠላነት ማስረጃ (2 ገጾች)"
    ];
    list.forEach(function (t) { body.appendChild(el("div", { style: { fontSize: "12px", color: "#475569", padding: "3px 0" } }, t)); });
  }, function (close) {
    var wrap = el("div", { class: "flex-col gap2" });
    var printBtn = el("button", { class: "btn btn-primary" }, "🖨️ የተሟላ ሪፖርት አዘጋጅ / አውርድ (PDF)");
    printBtn.addEventListener("click", guarded(function () {
      exportPrintableReport(state.data, showToast, { period: selectedPeriod });
      close();
    }));
    wrap.appendChild(printBtn);
    return wrap;
  }, false, opts);
}

function buildAccordion(titleEm, title, itemsBuilder) {
  var wrap = el("div", { class: "accordion" });
  var head = el("button", { class: "accordion-head" }, [
    el("span", {}, titleEm + " " + title),
    el("span", { class: "chev" }, "▾")
  ]);
  var bodyEl = el("div", { class: "accordion-body" });
  itemsBuilder.forEach(function (it) { bodyEl.appendChild(it); });
  head.addEventListener("click", function () {
    var isOpen = head.classList.toggle("open");
    bodyEl.classList.toggle("open", isOpen);
  });
  wrap.appendChild(head); wrap.appendChild(bodyEl);
  return wrap;
}

function openMainMenu() {
  var overlay = el("div", { class: "drawer-overlay" });
  var bg = el("div", { class: "drawer-bg", onclick: close });
  var drawerEl = el("div", { class: "drawer canva-blue" });
  overlay.appendChild(bg); overlay.appendChild(drawerEl);

  function close() { overlay.remove(); }
  function go(tab) { close(); navigateToTab(tab, { fromSidebar: true }); }

  function showBlueMenu() {
    clear(drawerEl);
    drawerEl.className = "drawer canva-blue";

    var currentUser = getCurrentUser();
    var rawName = (currentUser && (currentUser.name || currentUser.fullName)) || (state.data.profile && state.data.profile.ownerName) || "";
    var displayName = rawName.trim() || (currentUser.role === "admin" ? "የሱቅ ባለቤት" : "ሰራተኛ");
    // Dynamic Job Title Badge: Display registered job title (e.g. currentUser.jobTitle or currentUser.roleTitle)
    // Fallback to "ሰራተኛ" if empty or undefined
    var employeeJobTitle = currentUser.jobTitle || currentUser.roleTitle || currentUser.employeeRole;
    if (!employeeJobTitle && currentUser.role === "employee" && state.data && Array.isArray(state.data.employees)) {
      var empMatch = state.data.employees.find(function (e) {
        return (currentUser.id && e.id === currentUser.id) || (currentUser.phone && e.phone === currentUser.phone) || (currentUser.name && e.name === currentUser.name);
      });
      if (empMatch) {
        employeeJobTitle = empMatch.jobTitle || empMatch.roleTitle || empMatch.role;
      }
    }
    var displayRole = currentUser.role === "admin"
      ? "አስተዳዳሪ (ባለቤት)"
      : ((employeeJobTitle && String(employeeJobTitle).trim()) || "ሰራተኛ");
    var avatarImg = (currentUser && currentUser.avatar) || (state.data.profile && state.data.profile.managerPhoto) || "";

    var avatarEl;
    if (avatarImg) {
      avatarEl = el("img", {
        src: avatarImg,
        class: "canva-avatar",
        style: { width: "46px", height: "46px", borderRadius: "50%", objectFit: "cover", border: "2px solid #ffffff" }
      });
    } else {
      avatarEl = el("div", { class: "canva-avatar" }, "👤");
    }

    var profileBox = el("div", {
      class: "canva-profile-box",
      style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }
    }, [
      el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, [
        avatarEl,
        el("div", { class: "canva-info" }, [
          el("div", { class: "canva-greeting", style: { fontSize: "11.5px", opacity: "0.85" } }, "ሰላም"),
          el("div", { class: "canva-name-wrap" }, [
            el("div", { class: "canva-name", style: { fontSize: "15px", fontWeight: "800" } }, displayName),
            el("div", { class: "canva-underline" })
          ])
        ])
      ]),
      el("div", {
        class: "canva-role-badge",
        style: {
          background: "rgba(255, 255, 255, 0.2)",
          color: "#ffffff",
          padding: "4px 10px",
          borderRadius: "16px",
          fontSize: "11px",
          fontWeight: "700",
          whiteSpace: "nowrap"
        }
      }, displayRole)
    ]);
    profileBox.style.cursor = "pointer";
    profileBox.title = "ፕሮፋይል ማስተካከያ";
    profileBox.addEventListener("click", function () { close(); go("profile_edit"); });
    drawerEl.appendChild(profileBox);

    var menuList = el("div", { class: "canva-menu-list" });

    function makeBtn(icon, text, onClick) {
      var b = el("button", { class: "canva-menu-btn", type: "button" }, [
        icon ? el("span", { class: "em-icon" }, icon) : el("span", { class: "em-icon", style: { opacity: "0" } }, "•"),
        el("span", { style: { flex: "1", textAlign: "left" } }, text)
      ]);
      b.addEventListener("click", function (ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        if (typeof onClick === "function") onClick(ev);
      });
      return b;
    }

    // 1. Dynamic Array Filtering Logic:
    // Define the navigation menu array with an explicit roles property for each item:
    //   * "የንግድ መረጃ" -> allowedRoles: ['admin']
    //   * "የትርፍ ክፍፍል" -> allowedRoles: ['admin']
    //   * "የሰራተኞች ቁጥጥር" -> allowedRoles: ['admin']
    //   * "የባንክ ሪፖርት ማውጫ" -> allowedRoles: ['admin']
    const menuItems = [
      {
        id: "profile",
        icon: "🏪",
        text: "የንግድ መረጃ",
        roles: ["admin"],
        allowedRoles: ["admin"],
        onClick: function () { close(); go("profile"); }
      },
      {
        id: "items",
        icon: "📦",
        text: "የዕቃ ክምችት",
        roles: ["admin", "employee"],
        allowedRoles: ["admin", "employee"],
        onClick: function () { close(); go("items"); }
      },
      {
        id: "receive_shipment",
        icon: "🚚",
        text: "አዲስ ጭነት መመዝገቢያ",
        roles: ["admin", "employee"],
        allowedRoles: ["admin", "employee"],
        onClick: function () { close(); openReceiveShipmentSheet({ fromSidebar: true }); }
      },
      {
        id: "allocgoal",
        icon: "💰",
        text: "የትርፍ ክፍፍል",
        roles: ["admin"],
        allowedRoles: ["admin"],
        onClick: function () { close(); go("allocgoal"); }
      },
      {
        id: "employees",
        icon: "👥",
        text: "የሰራተኞች ቁጥጥር",
        roles: ["admin"],
        allowedRoles: ["admin"],
        onClick: function () { close(); openEmployeeManagementSheet({ fromSidebar: true }); }
      },
      {
        id: "sales_report",
        icon: "📊",
        text: "የሽያጭና ወጪ ሪፖርት",
        roles: ["admin", "employee"],
        allowedRoles: ["admin", "employee"],
        onClick: function () { close(); openTimeReportSheet({ fromSidebar: true }); }
      },
      {
        id: "sync_status",
        icon: "⚡",
        text: "ኦፍላይንና ሲንክሮናይዜሽን (Sync Status)",
        roles: ["admin", "employee"],
        allowedRoles: ["admin", "employee"],
        onClick: function () {
          close();
          openSyncDetailsSheet(function () { return state; }, function (newData) { state.data = newData; renderApp(); }, showToast, openSheet);
        }
      },
      {
        id: "bank_report",
        icon: "📄",
        text: "የባንክ ሪፖርት ማውጫ",
        roles: ["admin"],
        allowedRoles: ["admin"],
        onClick: function () { close(); openReportPrepSheet({ fromSidebar: true }); }
      },
      {
        id: "shipment_history",
        icon: "📜",
        text: "የጭነት ታሪክ",
        roles: ["admin", "employee"],
        allowedRoles: ["admin", "employee"],
        onClick: function () { close(); openShipmentHistorySheet({ fromSidebar: true }); }
      },
      {
        id: "suppliers",
        icon: "🚛",
        text: "የዕቃ አስራካቢዎች መረጃ",
        roles: ["admin", "employee"],
        allowedRoles: ["admin", "employee"],
        onClick: function () { close(); openSuppliersDirectorySheet({ fromSidebar: true }); }
      },
      {
        id: "customers",
        icon: "👥",
        text: "የደንበኞች መረጃ",
        roles: ["admin", "employee"],
        allowedRoles: ["admin", "employee"],
        onClick: function () { close(); openCustomerDirectorySheet({ fromSidebar: true }); }
      },
      {
        id: "help",
        icon: "💬",
        text: "እርዳታና ድጋፍ",
        roles: ["admin", "employee"],
        allowedRoles: ["admin", "employee"],
        onClick: function () { close(); openHelpAndSupportSheet({ fromSidebar: true }); }
      },
      {
        id: "divider",
        isDivider: true,
        roles: ["admin", "employee"],
        allowedRoles: ["admin", "employee"]
      },
      {
        id: "settings",
        icon: "⚙️",
        text: "ቅንብሮች",
        roles: ["admin", "employee"],
        allowedRoles: ["admin", "employee"],
        onClick: function () { showSettingsView(); }
      },
      {
        id: "logout",
        icon: "🚪",
        text: "ወደ ውጭ ውጣ",
        roles: ["admin", "employee"],
        allowedRoles: ["admin", "employee"],
        onClick: function () { handleLogout(close); }
      }
    ];

    // Filter the menu list dynamically BEFORE rendering
    const visibleMenuItems = menuItems.filter(item => item.allowedRoles.includes(currentUser.role));

    // 2. Do NOT Hardcode HTML List: Render ONLY from visibleMenuItems.map(...)
    visibleMenuItems.map(function (item) {
      if (item.isDivider) {
        var divider = el("div", { class: "canva-menu-divider" });
        menuList.appendChild(divider);
        return divider;
      }
      var b = makeBtn(item.icon, item.text, item.onClick);
      b.id = "menu-btn-" + item.id;
      if (item.id === "logout") b.id = "menu-btn-logout";
      menuList.appendChild(b);
      return b;
    });

    drawerEl.appendChild(menuList);

    // 3. State Verification & Fallback:
    // If currentUser.role === 'employee', the rendered sidebar DOM MUST NOT contain elements
    // with text: "የንግድ መረጃ", "የትርፍ ክፍፍል", "የሰራተኞች ቁጥጥር", or "የባንክ ሪፖርት ማውጫ".
    if (currentUser.role === 'employee') {
      var forbiddenSensitiveTexts = ["የንግድ መረጃ", "የትርፍ ክፍፍል", "የሰራተኞች ቁጥጥር", "የባንክ ሪፖርት ማውጫ"];
      var elements = drawerEl.querySelectorAll(".canva-menu-btn, button, a, span, div");
      for (var k = 0; k < elements.length; k++) {
        var node = elements[k];
        for (var f = 0; f < forbiddenSensitiveTexts.length; f++) {
          if (node.textContent && node.textContent.trim().indexOf(forbiddenSensitiveTexts[f]) !== -1) {
            var targetToRemove = node.closest(".canva-menu-btn") || node;
            if (targetToRemove && targetToRemove.parentNode) {
              targetToRemove.parentNode.removeChild(targetToRemove);
            }
          }
        }
      }
    }
  }

  function showSettingsView() {
    clear(drawerEl);
    drawerEl.className = "drawer";
    var currentUser = getCurrentUser();

    var wrap = el("div", { class: "canva-settings-wrap" });

    var head = el("div", { class: "canva-settings-head", onclick: showBlueMenu }, [
      el("button", { class: "canva-settings-back" }, "«"),
      el("h2", {}, "ቅንብሮች")
    ]);
    wrap.appendChild(head);

    var body = el("div", { class: "canva-settings-body" });

    // 1. 👤 ፕሮፋይል ማስተካከያ (Personal User Profile)
    var profItem = el("button", { class: "canva-set-item" }, [
      el("div", { class: "canva-set-left" }, [
        el("span", { class: "icon" }, "👤"),
        el("span", {}, "ፕሮፋይል ማስተካከያ")
      ]),
      el("span", { style: { color: "#94a3b8", fontSize: "16px" } }, "›")
    ]);
    profItem.addEventListener("click", function () { go("profile_edit"); });
    body.appendChild(profItem);

    // 1b. 🏢 የንግድ ድርጅት መረጃ (Business & Legal Profile) - Only admin
    if (currentUser.role === 'admin') {
      var bizItem = el("button", { class: "canva-set-item" }, [
        el("div", { class: "canva-set-left" }, [
          el("span", { class: "icon" }, "🏢"),
          el("span", {}, "የንግድ ድርጅት መረጃ")
        ]),
        el("span", { style: { color: "#94a3b8", fontSize: "16px" } }, "›")
      ]);
      bizItem.addEventListener("click", function () { go("profile"); });
      body.appendChild(bizItem);

      // 1c. 🏛️ የሱቆችና መጋዘኖች ማስተዳደሪያ (Branches & Warehouses Management) - Only admin
      var locItem = el("button", { class: "canva-set-item" }, [
        el("div", { class: "canva-set-left" }, [
          el("span", { class: "icon" }, "🏛️"),
          el("span", {}, "የሱቆችና መጋዘኖች ማስተዳደሪያ")
        ]),
        el("span", { style: { color: "#94a3b8", fontSize: "16px" } }, "›")
      ]);
      locItem.addEventListener("click", function () {
        close();
        openLocationManagementSheet({ fromSidebar: true });
      });
      body.appendChild(locItem);
    }

    // 2. ጨለማ ገጽታ 🌙 [toggle]
    var darkSwitch = el("label", { class: "switch" });
    var darkInput = el("input", { type: "checkbox" });
    darkInput.checked = !!prefs.darkMode;
    darkInput.addEventListener("change", function () {
      prefs.darkMode = darkInput.checked;
      savePrefs(prefs);
      applyPrefs(prefs);
    });
    darkSwitch.appendChild(darkInput);
    darkSwitch.appendChild(el("span", { class: "track" }));

    var darkItem = el("div", { class: "canva-set-item" }, [
      el("div", { class: "canva-set-left" }, [
        el("span", {}, "ጨለማ ገጽታ"),
        el("span", { class: "icon" }, "🌙")
      ]),
      darkSwitch
    ]);
    body.appendChild(darkItem);

    // 3. የፊደል መጠን %100
    var currentFontPct = Math.round((prefs.fontZoom || 1) * 100);
    var fontValSpan = el("span", { style: { fontWeight: "800", color: "#2563eb" } }, "%" + currentFontPct);
    var fontBtns = el("div", { class: "flex items-center gap2" }, [
      (function () {
        var minus = el("button", { class: "btn btn-outline btn-sm", style: { padding: "4px 8px" } }, "-");
        minus.addEventListener("click", function (ev) {
          ev.stopPropagation();
          prefs.fontZoom = Math.max(0.8, (prefs.fontZoom || 1) - 0.1);
          savePrefs(prefs); applyPrefs(prefs);
          fontValSpan.textContent = "%" + Math.round(prefs.fontZoom * 100);
        });
        return minus;
      })(),
      (function () {
        var plus = el("button", { class: "btn btn-outline btn-sm", style: { padding: "4px 8px" } }, "+");
        plus.addEventListener("click", function (ev) {
          ev.stopPropagation();
          prefs.fontZoom = Math.min(1.3, (prefs.fontZoom || 1) + 0.1);
          savePrefs(prefs); applyPrefs(prefs);
          fontValSpan.textContent = "%" + Math.round(prefs.fontZoom * 100);
        });
        return plus;
      })()
    ]);
    var fontItem = el("div", { class: "canva-set-item" }, [
      el("div", { class: "canva-set-left" }, [
        el("span", {}, "የፊደል መጠን"),
        fontValSpan
      ]),
      fontBtns
    ]);
    body.appendChild(fontItem);

    // 4. 🔒 ደህንነት
    var secItem = el("button", { class: "canva-set-item" }, [
      el("div", { class: "canva-set-left" }, [
        el("span", { class: "icon" }, "🔒"),
        el("span", {}, "ደህንነት" + (prefs.appLockEnabled ? " (በርቷል)" : ""))
      ]),
      el("span", { style: { color: "#94a3b8", fontSize: "16px" } }, "›")
    ]);
    secItem.addEventListener("click", function () {
      close();
      openPinSetupModal(prefs.appLockEnabled ? "change" : "set");
    });
    body.appendChild(secItem);

    // 5. 🔗 መተግበሪያውን አጋራ
    var shareItem = el("button", { class: "canva-set-item" }, [
      el("div", { class: "canva-set-left" }, [
        el("span", { class: "icon" }, "🔗"),
        el("span", {}, "መተግበሪያውን አጋራ")
      ]),
      el("span", { style: { color: "#94a3b8", fontSize: "16px" } }, "›")
    ]);
    shareItem.addEventListener("click", function () { shareAppLink(); });
    body.appendChild(shareItem);

    // 6. ⭐ አፑን ደረጃ ይስጡ
    var rateItem = el("button", { class: "canva-set-item" }, [
      el("div", { class: "canva-set-left" }, [
        el("span", { class: "icon" }, "⭐"),
        el("span", {}, "አፑን ደረጃ ይስጡ")
      ]),
      el("span", { style: { color: "#94a3b8", fontSize: "16px" } }, "›")
    ]);
    rateItem.addEventListener("click", function () { close(); openRatingModal(); });
    body.appendChild(rateItem);

    // 7. ℹ️ ስለ አፑ እና ስሪት መረጃ
    var aboutItem = el("button", { class: "canva-set-item" }, [
      el("div", { class: "canva-set-left" }, [
        el("span", { class: "icon" }, "ℹ️"),
        el("span", {}, "ስለ አፑ እና ስሪት መረጃ")
      ]),
      el("span", { style: { color: "#94a3b8", fontSize: "16px" } }, "›")
    ]);
    aboutItem.addEventListener("click", function () { close(); openAboutModal(); });
    body.appendChild(aboutItem);

    // 8. ☁️ መረጃ ምትክ አስቀምጥ
    var backupItem = el("button", { class: "canva-set-item" }, [
      el("div", { class: "canva-set-left" }, [
        el("span", { class: "icon" }, "☁️"),
        el("span", {}, "መረጃ ምትክ አስቀምጥ")
      ]),
      el("span", { style: { color: "#94a3b8", fontSize: "16px" } }, "›")
    ]);
    backupItem.addEventListener("click", function () { close(); openBackupRestoreSheet(); });
    body.appendChild(backupItem);

    wrap.appendChild(body);
    wrap.appendChild(el("div", { class: "canva-version-foot" }, "ስሪት 1.00"));

    drawerEl.appendChild(wrap);
  }

  showBlueMenu();
  document.querySelector(".app").appendChild(overlay);
}

function handleLogout(closeDrawer) {
  // 1. Close side navigation drawer layout immediately
  if (closeDrawer) {
    try { closeDrawer(); } catch (e) {}
  }
  try {
    document.querySelectorAll(".drawer-overlay").forEach(function (node) { node.remove(); });
  } catch (e) {}

  // 2. Call Firebase Auth signOut if available
  if (window.firebase && window.firebase.auth) {
    try { window.firebase.auth().signOut(); } catch (e) {}
  }

  // 3. Clear sessionStorage completely
  try {
    sessionStorage.clear();
  } catch (e) {}

  // 4. Clear auth & session credentials from localStorage
  try {
    sessionStorage.removeItem("user_phone");
    sessionStorage.removeItem("active_phone");
    sessionStorage.removeItem("pending_auth_phone");
    localStorage.removeItem("user_phone");
    localStorage.removeItem("active_phone");
    localStorage.removeItem("pending_auth_phone");
    localStorage.removeItem("auth_user");
    localStorage.removeItem("authUser");
    localStorage.removeItem("currentUser");
    localStorage.removeItem("role");
    localStorage.removeItem("userRole");
    localStorage.removeItem("firebase:authUser");
    localStorage.removeItem("session");
    localStorage.removeItem("token");
    localStorage.removeItem("shop-control-auth");
  } catch (e) {}

  // 5. Reset user preferences auth & security flags
  try {
    var p = loadPrefs();
    delete p.authUser;
    p.appLockEnabled = false;
    delete p.pinHash;
    savePrefs(p);
  } catch (e) {}

  // 6. Reset authentication state completely (screen -> login, clear inputs)
  try {
    resetAuthState();
  } catch (e) {}

  // 7. Reset in-memory session state
  state.locked = false;
  state.currentUser = null;
  if (typeof window !== "undefined") window.currentUser = null;
  state.selectedLocation = null;
  state.data = loadData("");
  state.tab = "auth";

  // 8. Visual confirmation & instantly navigate back to Login view
  showToast("✓ በተሳካ ሁኔታ ወጥተዋል (Logged out)");
  renderApp();
}

function handleCloseApp(closeDrawer) {
  handleLogout(closeDrawer);
}

function openReceiveShipmentSheet(opts) {
  openSheet("🚚 አዲስ የዕቃ ጭነት መመዝገቢያ", function (sheetBody, close) {
    var ownerName = (state.data.profile && state.data.profile.ownerName) || "ረቢ ካሻ";

    var initialLocations = getLocationsList(state.data);
    var defaultLocName = (initialLocations && initialLocations[0] && initialLocations[0].name) || "ዋና ሱቅ";

    var wizard = {
      step: 1, // Single standard flow starting directly at Step 1
      option: "A",
      location: defaultLocName,
      shipmentDate: todayISO(),
      truckPlate: "",
      driverName: "",
      supplierId: "",
      supplierPhone: "",
      freightCost: 0,
      offloadingCost: 0,
      miscCost: 0,
      estimatedCount: 1,
      items: []
    };

    function syncItemRows(targetCount) {
      var count = parseInt(targetCount, 10);
      if (isNaN(count) || count < 1) count = 1;
      wizard.estimatedCount = count;

      var currentLen = wizard.items.length;
      if (currentLen < count) {
        for (var i = currentLen; i < count; i++) {
          wizard.items.push({
            id: uid(),
            name: "",
            code: "",
            supplier: wizard.driverName || "",
            qty: 0,
            damaged: 0,
            costPrice: 0,
            landedCost: 0,
            sellPrice: 0,
            unitProfit: 0,
            expiry: ""
          });
        }
      } else if (currentLen > count) {
        wizard.items = wizard.items.slice(0, count);
      }
    }
    syncItemRows(wizard.estimatedCount);

    function getFreightTotals() {
      var tf = (Number(wizard.freightCost) || 0) + (Number(wizard.offloadingCost) || 0) + (Number(wizard.miscCost) || 0);
      var totalAllQty = wizard.items.reduce(function (acc, it) {
        return acc + Math.max(0, Number(it.qty) || 0);
      }, 0);
      var totalUsableQty = wizard.items.reduce(function (acc, it) {
        var net = (Number(it.qty) || 0) - (Number(it.damaged) || 0);
        return acc + (net > 0 ? net : 0);
      }, 0);
      var avgOverheadPerUnit = totalAllQty > 0 ? (tf / totalAllQty) : 0;
      return {
        totalFreight: tf,
        totalAllQty: totalAllQty,
        totalUsableQty: totalUsableQty,
        overheadPerUnit: avgOverheadPerUnit
      };
    }

    // Accurate Landed Cost & Profit Calculation Engine
    function calculateItemMetrics(it) {
      var freightInfo = getFreightTotals();
      var tf = freightInfo.totalFreight;
      var totalAllQty = freightInfo.totalAllQty;

      var totalQty = Math.max(0, Number(it.qty) || 0);
      var damagedQty = Math.max(0, Number(it.damaged) || 0);
      var usableQty = Math.max(0, totalQty - damagedQty);
      var unitCost = Math.max(0, Number(it.costPrice) || 0);
      var sellPrice = Math.max(0, Number(it.sellPrice) || 0);

      // Apportion freight proportionally across total quantities
      var apportionedFreight = 0;
      if (tf > 0) {
        if (totalAllQty > 0 && totalQty > 0) {
          apportionedFreight = tf * (totalQty / totalAllQty);
        } else {
          apportionedFreight = tf / Math.max(1, wizard.items.length);
        }
      }

      // Total Item Expense = (Total Qty * Unit Purchase Price) + Apportioned Freight
      var totalItemExpense = (totalQty * unitCost) + apportionedFreight;

      // Single Unit Landed Cost (የቋመበት ዋጋ) = Total Item Expense / Usable Qty
      var singleUnitLanded = 0;
      if (usableQty > 0) {
        singleUnitLanded = totalItemExpense / usableQty;
      } else if (totalQty > 0) {
        singleUnitLanded = totalItemExpense / totalQty;
      } else {
        singleUnitLanded = unitCost;
      }

      // Single Unit Profit (የአንዱ ፍሬ ትርፍ) = Selling Price - Single Unit Landed Cost
      var singleUnitProfit = sellPrice > 0 ? (sellPrice - singleUnitLanded) : 0;

      return {
        usableQty: usableQty,
        apportionedFreight: apportionedFreight,
        totalItemExpense: totalItemExpense,
        landedCost: singleUnitLanded,
        unitProfit: singleUnitProfit
      };
    }

    function renderStepper(currentStep) {
      var wrap = el("div", { class: "shipment-stepper" });
      var track = el("div", { class: "shipment-step-line" });
      var fillWidth = currentStep === 1 ? "15%" : currentStep === 2 ? "55%" : "100%";
      var fill = el("div", { class: "shipment-step-line-fill", style: { width: fillWidth } });
      track.appendChild(fill);
      wrap.appendChild(track);

      var steps = [
        { num: 1, label: "1. የጭነት መረጃ" },
        { num: 2, label: "2. የዕቃ ዝርዝር" },
        { num: 3, label: "3. ማጠቃለያ" }
      ];

      steps.forEach(function (s) {
        var isDone = currentStep > s.num;
        var isActive = currentStep === s.num;
        var nodeClass = "shipment-step-node" + (isActive ? " active" : "") + (isDone ? " done" : "");
        var circle = el("div", { class: "shipment-step-circle" }, isDone ? "✓" : s.num);
        var label = el("div", { class: "shipment-step-label" }, s.label);
        var node = el("div", { class: nodeClass }, [circle, label]);

        node.addEventListener("click", function () {
          if (isDone || s.num === 1 || s.num === 2) {
            wizard.step = s.num;
            drawWizard();
          }
        });

        wrap.appendChild(node);
      });

      return wrap;
    }

    function drawWizard() {
      clear(sheetBody);

      if (wizard.step <= 1) {
        drawStep1();
      } else if (wizard.step === 2) {
        drawStep2();
      } else if (wizard.step === 3) {
        drawStep3();
      }
    }

    // ==========================================
    // STAGE 1: Vehicle & Freight Info with Compact Location Selector
    // ==========================================
    function drawStep1() {
      sheetBody.appendChild(renderStepper(1));

      // Compact, Inline Location Selector (Single row layout)
      var locWrap = el("div", {
        class: "flex items-center justify-between gap2 mb3",
        style: {
          background: "#fff7ed",
          border: "1px solid #fed7aa",
          borderRadius: "12px",
          padding: "8px 14px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.03)"
        }
      });

      var locLeft = el("div", { class: "flex items-center gap2", style: { whiteSpace: "nowrap" } }, [
        el("span", { style: { fontSize: "18px" } }, "🏛️"),
        el("span", { style: { fontSize: "13px", fontWeight: "700", color: "#9a3412" } }, "የመቀበያ ቦታ ይምረጡ:")
      ]);

      var locSelect = el("select", {
        class: "input",
        style: {
          flex: "1",
          maxWidth: "250px",
          border: "1px solid #fdba74",
          background: "#ffffff",
          padding: "6px 10px",
          fontSize: "12.5px",
          fontWeight: "700",
          borderRadius: "8px",
          color: "#1e293b"
        }
      });

      var allLocations = getLocationsList(state.data);
      allLocations.forEach(function (loc) {
        var opt = el("option", { value: loc.name }, (loc.type === "warehouse" ? "🏢 " : "🏪 ") + loc.name + (loc.code ? " (" + loc.code + ")" : ""));
        if (loc.name === wizard.location || loc.id === wizard.location) opt.selected = true;
        locSelect.appendChild(opt);
      });
      locSelect.addEventListener("change", function () {
        wizard.location = locSelect.value;
      });

      locWrap.appendChild(locLeft);
      locWrap.appendChild(locSelect);
      sheetBody.appendChild(locWrap);

      var headerBadgeRow = el("div", { class: "flex items-center justify-between mb3", style: { background: "#eff6ff", borderRadius: "10px", padding: "8px 12px" } }, [
        el("span", { class: "badge", style: { background: "#dbeafe", color: "#1e40af" } }, "ደረጃ 1 ከ 3"),
        el("span", { style: { fontSize: "13px", fontWeight: "800", color: "#1e3a8a" } }, "🚚 የመኪና ጭነትና የትራንስፖርት መረጃ"),
        el("span", { class: "badge", style: { background: "#fee2e2", color: "#991b1b" } }, "ታሪፍና ወጪ")
      ]);
      sheetBody.appendChild(headerBadgeRow);

      var grid = el("div", { class: "grid2" });

      var plateInp = el("input", { class: "input", type: "text", value: wizard.truckPlate || "", placeholder: "ምሳሌ: AA1253798" });
      plateInp.addEventListener("input", function () { wizard.truckPlate = plateInp.value.trim(); });

      var driverInpWrap = el("div", { style: { position: "relative", display: "flex", alignItems: "center" } });

      var driverInp = el("input", {
        class: "input",
        type: "text",
        value: wizard.driverName || "",
        placeholder: "ምሳሌ: አበበ ከበደ (ለመምረጥ ጠቅ ያድርጉ)",
        list: "registered-suppliers-datalist",
        style: { paddingRight: "42px", cursor: "pointer" }
      });
      driverInp.addEventListener("input", function () {
        wizard.driverName = driverInp.value.trim();
        wizard.items.forEach(function (it) { if (!it.supplier) it.supplier = wizard.driverName; });
      });

      function triggerDriverSelect() {
        openSupplierSelectModal(function (selectedSup) {
          if (!selectedSup) return;
          driverInp.value = selectedSup.name || "";
          wizard.driverName = selectedSup.name || "";
          wizard.supplierId = selectedSup.id || "";
          wizard.supplierPhone = selectedSup.phone || "";
          wizard.items.forEach(function (it) {
            if (!it.supplier || it.supplier === "አቅራቢ") it.supplier = selectedSup.name || "";
          });
        });
      }

      driverInp.addEventListener("click", function () {
        triggerDriverSelect();
      });

      var driverPickerBtn = el("button", {
        type: "button",
        title: "አስረካቢ ይምረጡ",
        style: {
          position: "absolute",
          right: "6px",
          background: "#e0f2fe",
          color: "#0284c7",
          border: "none",
          borderRadius: "8px",
          padding: "5px 9px",
          fontSize: "13px",
          fontWeight: "800",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }
      }, "🔍");
      driverPickerBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        triggerDriverSelect();
      });

      driverInpWrap.appendChild(driverInp);
      driverInpWrap.appendChild(driverPickerBtn);

      // Inject datalist for registered suppliers if not already in document
      if (!document.getElementById("registered-suppliers-datalist")) {
        var supDatalist = el("datalist", { id: "registered-suppliers-datalist" });
        (state.data.suppliers || []).forEach(function (sp) {
          supDatalist.appendChild(el("option", { value: sp.name }));
        });
        document.body.appendChild(supDatalist);
      }

      var freightInp = el("input", { class: "input", type: "number", step: "0.01", value: wizard.freightCost ? wizard.freightCost : "", placeholder: "0.00" });
      freightInp.addEventListener("input", function () { wizard.freightCost = parseFloat(freightInp.value) || 0; updateLiveCost(); });

      var offloadInp = el("input", { class: "input", type: "number", step: "0.01", value: wizard.offloadingCost ? wizard.offloadingCost : "", placeholder: "0.00" });
      offloadInp.addEventListener("input", function () { wizard.offloadingCost = parseFloat(offloadInp.value) || 0; updateLiveCost(); });

      var miscInp = el("input", { class: "input", type: "number", step: "0.01", value: wizard.miscCost ? wizard.miscCost : "", placeholder: "0.00" });
      miscInp.addEventListener("input", function () { wizard.miscCost = parseFloat(miscInp.value) || 0; updateLiveCost(); });

      var estCountInp = el("input", { class: "input", type: "number", min: "1", value: wizard.estimatedCount ? wizard.estimatedCount : "", placeholder: "ምሳሌ: 1" });
      estCountInp.addEventListener("input", function () {
        var val = parseInt(estCountInp.value, 10);
        if (!isNaN(val) && val >= 1) {
          syncItemRows(val);
        } else if (!estCountInp.value) {
          syncItemRows(1);
        }
        updateLiveCost();
      });

      grid.appendChild(Field("🚚 የመኪና ታርጋ", true, plateInp));
      grid.appendChild(Field("👤 አሽከርካሪ/አስጫኝ (አስረካቢ)", true, driverInpWrap));
      grid.appendChild(Field("💰 ትራንስፖርት ወጪ (ብር)", false, freightInp));
      grid.appendChild(Field("📦 የማውረጃ ወጪ (ብር)", false, offloadInp));
      grid.appendChild(Field("💸 የተለያዩ ወጪ (ብር)", false, miscInp));
      grid.appendChild(Field("📊 የዕቃ ዓይነቶች ብዛት", false, estCountInp));

      sheetBody.appendChild(grid);

      // Auto-calculated total expense box
      var costCard = el("div", { class: "card section mt2", style: { background: "#f8fafc", borderColor: "#cbd5e1" } });
      var costLabel = el("div", { class: "card-label", style: { color: "#475569" } }, "💵 አጠቃላይ የወጣ ወጪ: (ትራንስፖርት + ማውረጃ + የተለያዩ)");
      var costValue = el("div", { class: "card-value", style: { color: "#1e3a8a", fontSize: "20px" } }, "0.00 ETB");
      var perUnitNotice = el("div", { style: { fontSize: "11.5px", color: "#64748b", marginTop: "4px" } }, "");

      costCard.appendChild(costLabel);
      costCard.appendChild(costValue);
      costCard.appendChild(perUnitNotice);
      sheetBody.appendChild(costCard);

      function updateLiveCost() {
        var totals = getFreightTotals();
        costValue.textContent = totals.totalFreight.toFixed(2) + " ETB";
        perUnitNotice.textContent = "ይህ ወጪ በደረጃ 2 በዕቃዎች ብዛትና ድርሻ ተሰልቶ ወደ እያንዳንዱ ዕቃ የቆመበት ዋጋ ይደመራል።";
      }
      updateLiveCost();

      // Navigation Buttons
      var navRow = el("div", { class: "flex gap2 mt3" });
      var cancelBtn = el("button", { class: "btn btn-outline", style: { flex: "1" } }, "✕ ሰርዝ (ዝጋ)");
      cancelBtn.addEventListener("click", function () {
        close();
      });

      var nextBtn = el("button", { class: "btn btn-primary", style: { flex: "1.5" } }, "ቀጣይ → የዕቃ ዝርዝር (ደረጃ 2) →");
      nextBtn.addEventListener("click", function () {
        var val = parseInt(estCountInp.value, 10);
        if (!isNaN(val) && val >= 1) {
          syncItemRows(val);
        } else {
          syncItemRows(wizard.items.length || 3);
        }
        wizard.step = 2;
        drawWizard();
      });

      navRow.appendChild(cancelBtn);
      navRow.appendChild(nextBtn);
      sheetBody.appendChild(navRow);
    }

    // ==========================================
    // STAGE 2: Table of Items (Dynamic Rows & Virtualized Scrolling)
    // ==========================================
    function drawStep2() {
      sheetBody.appendChild(renderStepper(2));

      var totals = getFreightTotals();
      var filledCount = wizard.items.filter(function (x) { return x.name && (Number(x.qty) > 0); }).length;

      // Compact Combined Summary & Batch Expiry Bar
      var compactSummaryBar = el("div", {
        class: "flex items-center justify-between mb2",
        style: {
          flexWrap: "wrap",
          gap: "6px",
          background: "#f8fafc",
          padding: "6px 10px",
          borderRadius: "10px",
          border: "1px solid #e2e8f0"
        }
      });

      var countBadge = el("span", { class: "badge", style: { background: "#e0e7ff", color: "#3730a3", fontSize: "11px", fontWeight: "700", padding: "3px 8px" } }, "📊 ዕቃዎች: " + wizard.items.length);
      var filledBadge = el("span", { class: "badge", style: { background: "#f1f5f9", color: "#334155", fontSize: "10.5px", padding: "3px 8px" } }, "የተሞሉ: " + filledCount + " ከ " + wizard.items.length);
      var freightBadge = el("span", { class: "badge", style: { background: "#fef3c7", color: "#92400e", fontSize: "10.5px", padding: "3px 8px" } }, "ጠቅላላ ጭነት: " + totals.totalFreight.toFixed(2) + " ETB");
      var overheadBadge = el("span", { class: "badge", style: { background: "#dcfce7", color: "#166534", fontSize: "10.5px", padding: "3px 8px" } }, "አማካይ ጭነት: +" + totals.overheadPerUnit.toFixed(2) + " ETB");

      var badgesLeft = el("div", { class: "flex items-center gap1", style: { flexWrap: "wrap" } }, [
        countBadge, filledBadge, freightBadge, overheadBadge
      ]);

      // Streamlined inline expiry date controls
      var expiryGroup = el("div", { class: "flex items-center gap1", style: { flexWrap: "wrap" } });
      expiryGroup.appendChild(el("span", { style: { fontSize: "11px", fontWeight: "700", color: "#475569" } }, "📅 የሚያበቃበት:"));
      var batchDateInp = el("input", { class: "input", type: "date", style: { width: "125px", padding: "3px 6px", fontSize: "11.5px", height: "28px" } });
      var applyDateBtn = el("button", { class: "btn btn-outline btn-sm", style: { fontSize: "10.5px", padding: "3px 7px", height: "28px" } }, "ለሁሉም");
      applyDateBtn.addEventListener("click", function () {
        if (!batchDateInp.value) { showToast("እባክዎ መጀመሪያ ቀን ይምረጡ"); return; }
        wizard.items.forEach(function (it) { it.expiry = batchDateInp.value; });
        drawWizard();
        showToast("ቀን ለሁሉም ዕቃዎች ተቀይሯል");
      });

      var naDateBtn = el("button", { class: "btn btn-outline btn-sm", style: { fontSize: "10.5px", padding: "3px 7px", height: "28px" } }, "አያልፍበትም (N/A)");
      naDateBtn.addEventListener("click", function () {
        wizard.items.forEach(function (it) { it.expiry = "N/A (አያልፍበትም)"; });
        drawWizard();
        showToast("ለመለስተኛ ምርቶች N/A ተደርጓል");
      });

      expiryGroup.appendChild(batchDateInp);
      expiryGroup.appendChild(applyDateBtn);
      expiryGroup.appendChild(naDateBtn);

      compactSummaryBar.appendChild(badgesLeft);
      compactSummaryBar.appendChild(expiryGroup);
      sheetBody.appendChild(compactSummaryBar);

      // THE HORIZONTALLY SCROLLABLE AND VIRTUALIZED TABLE
      var tableContainer = el("div", { class: "shipment-table-container" });
      var table = el("table", { class: "shipment-table" });

      // Table Header (11 Columns + Action)
      var thead = el("thead");
      var headRow = el("tr");
      var columns = [
        "ተ/ቁ", "የእቃው ስም", "ኮድ", "የአስረካቢው ስም", "ብዛት", "የተበላሸ",
        "የግዢ ዋጋ", "የቆመበት ዋጋ", "የሽያጭ ዋጋ", "የአንዱ ፍሬ ትርፍ", "የሚያበቃበት ቀን", "ድርጊት"
      ];
      columns.forEach(function (col) {
        headRow.appendChild(el("th", {}, col));
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      var tbody = el("tbody");
      table.appendChild(tbody);
      tableContainer.appendChild(table);
      sheetBody.appendChild(tableContainer);

      var activeRowRecalcs = [];

      function updateStats() {
        var f = wizard.items.filter(function (x) { return x.name && (Number(x.qty) > 0); }).length;
        filledBadge.textContent = "የተሞሉ: " + f + " ከ " + wizard.items.length;
        countBadge.textContent = "📊 ዕቃዎች: " + wizard.items.length;
        var t = getFreightTotals();
        overheadBadge.textContent = "አማካይ ጭነት: +" + t.overheadPerUnit.toFixed(2) + " ETB";
        activeRowRecalcs.forEach(function (fn) { fn(); });
      }

      function createRow(it, idx) {
        var tr = el("tr", { style: { height: "42px" } });

        // 1. ተ/ቁ
        tr.appendChild(el("td", { style: { textAlign: "center", fontWeight: "800", color: "#64748b" } }, idx + 1));

        // 2. የእቃው ስም with Interactive Dropdown Autocomplete
        var nameCell = el("td", { style: { position: "relative" } });
        var nameWrap = el("div", { style: { position: "relative", width: "100%" } });
        var nameInp = el("input", {
          type: "text",
          autocomplete: "off",
          value: it.name || "",
          placeholder: "የዕቃ ስም ይጻፉ...",
          style: { width: "100%", minWidth: "150px" }
        });

        var suggestDrop = el("div", {
          style: {
            position: "absolute",
            top: "calc(100% + 2px)",
            left: "0",
            minWidth: "220px",
            background: "#ffffff",
            border: "1.5px solid #3b82f6",
            borderRadius: "8px",
            boxShadow: "0 6px 18px rgba(0,0,0,0.16)",
            maxHeight: "180px",
            overflowY: "auto",
            zIndex: "9999",
            display: "none"
          }
        });

        function showSuggestions(q) {
          clear(suggestDrop);
          var term = (q || "").trim().toLowerCase();
          var allItems = state.data.items || [];
          var matches = allItems.filter(function (x) {
            return (x.name && x.name.toLowerCase().indexOf(term) !== -1) ||
                   (x.code && x.code.toLowerCase().indexOf(term) !== -1);
          });

          if (matches.length === 0) {
            suggestDrop.style.display = "none";
            return;
          }

          matches.slice(0, 8).forEach(function (m) {
            var opt = el("div", {
              style: {
                padding: "6px 10px",
                cursor: "pointer",
                borderBottom: "1px solid #f1f5f9",
                fontSize: "11.5px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }
            }, [
              el("div", {}, [
                el("div", { style: { fontWeight: "700", color: "#1e293b" } }, m.name),
                el("div", { style: { fontSize: "10px", color: "#64748b" } }, m.code ? ("ኮድ: " + m.code) : "")
              ]),
              el("div", { style: { fontSize: "10.5px", fontWeight: "700", color: "#2563eb" } }, m.sellPriceCents ? fmt(m.sellPriceCents) : "")
            ]);

            opt.addEventListener("mousedown", function (e) {
              e.preventDefault();
              it.name = m.name;
              nameInp.value = m.name;
              if (m.code) {
                it.code = m.code;
                codeInp.value = m.code;
              }
              if (m.costPriceCents && (!it.costPrice || it.costPrice === 0)) {
                it.costPrice = m.costPriceCents / 100;
                costInp.value = it.costPrice;
              }
              if (m.sellPriceCents && (!it.sellPrice || it.sellPrice === 0)) {
                it.sellPrice = m.sellPriceCents / 100;
                sellInp.value = it.sellPrice;
              }
              suggestDrop.style.display = "none";
              recalcRow();
              updateStats();
            });

            opt.addEventListener("mouseenter", function () { opt.style.background = "#eff6ff"; });
            opt.addEventListener("mouseleave", function () { opt.style.background = "#ffffff"; });
            suggestDrop.appendChild(opt);
          });

          suggestDrop.style.display = "block";
        }

        nameInp.addEventListener("input", function () {
          it.name = nameInp.value;
          showSuggestions(nameInp.value);
          var matched = (state.data.items || []).find(function (x) { return x.name.trim().toLowerCase() === nameInp.value.trim().toLowerCase(); });
          if (matched) {
            if (!it.code && matched.code) { it.code = matched.code; codeInp.value = matched.code; }
            if ((!it.costPrice || it.costPrice === 0) && matched.costPriceCents) {
              it.costPrice = (matched.costPriceCents / 100);
              costInp.value = it.costPrice;
            }
            if ((!it.sellPrice || it.sellPrice === 0) && matched.sellPriceCents) {
              it.sellPrice = (matched.sellPriceCents / 100);
              sellInp.value = it.sellPrice;
            }
            recalcRow();
          }
          updateStats();
        });

        nameInp.addEventListener("focus", function () {
          if (nameInp.value.trim()) {
            showSuggestions(nameInp.value);
          }
        });

        nameInp.addEventListener("blur", function () {
          setTimeout(function () { suggestDrop.style.display = "none"; }, 250);
        });

        nameWrap.appendChild(nameInp);
        nameWrap.appendChild(suggestDrop);
        nameCell.appendChild(nameWrap);
        tr.appendChild(nameCell);

        // 3. ኮድ
        var codeInp = el("input", { type: "text", value: it.code || "", placeholder: "ኮድ/ባርኮድ", style: { width: "90px" } });
        codeInp.addEventListener("input", function () { it.code = codeInp.value.trim(); });
        tr.appendChild(el("td", {}, codeInp));

        // 4. የአስረካቢው ስም
        var supWrap = el("div", { style: { position: "relative", display: "inline-flex", alignItems: "center" } });
        var supInp = el("input", {
          type: "text",
          value: it.supplier || wizard.driverName || "",
          placeholder: "አስረካቢ",
          title: "አስረካቢ ለመምረጥ ጠቅ ያድርጉ",
          style: { width: "120px", paddingRight: "26px", cursor: "pointer" }
        });
        supInp.addEventListener("input", function () { it.supplier = supInp.value.trim(); });
        function triggerRowSupSelect() {
          openSupplierSelectModal(function (sel) {
            if (!sel) return;
            supInp.value = sel.name || "";
            it.supplier = sel.name || "";
            if (!wizard.driverName) {
              wizard.driverName = sel.name || "";
              wizard.supplierId = sel.id || "";
              wizard.supplierPhone = sel.phone || "";
            }
          });
        }
        supInp.addEventListener("click", function () { triggerRowSupSelect(); });

        var supPickBtn = el("button", {
          type: "button",
          title: "አስረካቢ ይምረጡ",
          style: {
            position: "absolute",
            right: "3px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "11px",
            padding: "2px 4px",
            color: "#0284c7"
          }
        }, "🔍");
        supPickBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          triggerRowSupSelect();
        });

        supWrap.appendChild(supInp);
        supWrap.appendChild(supPickBtn);
        tr.appendChild(el("td", {}, supWrap));

        // 5. ብዛት
        var qtyInp = el("input", { type: "number", min: "0", value: it.qty ? it.qty : "", placeholder: "0", style: { width: "70px", textAlign: "right" } });
        qtyInp.addEventListener("input", function () {
          it.qty = parseInt(qtyInp.value, 10) || 0;
          updateStats();
        });
        tr.appendChild(el("td", {}, qtyInp));

        // 6. የተበላሸ
        var damInp = el("input", { type: "number", min: "0", value: it.damaged ? it.damaged : "", placeholder: "0", style: { width: "65px", textAlign: "right", color: "#dc2626" } });
        damInp.addEventListener("input", function () {
          it.damaged = parseInt(damInp.value, 10) || 0;
          updateStats();
        });
        tr.appendChild(el("td", {}, damInp));

        // 7. የግዢ ዋጋ
        var costInp = el("input", { type: "number", step: "0.01", min: "0", value: it.costPrice ? it.costPrice : "", placeholder: "0.00", style: { width: "85px", textAlign: "right" } });
        costInp.addEventListener("input", function () {
          it.costPrice = parseFloat(costInp.value) || 0;
          recalcRow();
        });
        tr.appendChild(el("td", {}, costInp));

        // 8. የቆመበት ዋጋ (Calculated: Total Item Expense / Usable Qty)
        var landedCell = el("td", { style: { textAlign: "right", fontWeight: "700", color: "#1e3a8a", minWidth: "90px" } }, "0.00");
        tr.appendChild(landedCell);

        // 9. የሽያጭ ዋጋ
        var sellInp = el("input", { type: "number", step: "0.01", min: "0", value: it.sellPrice ? it.sellPrice : "", placeholder: "0.00", style: { width: "85px", textAlign: "right", fontWeight: "700" } });
        sellInp.addEventListener("input", function () {
          it.sellPrice = parseFloat(sellInp.value) || 0;
          recalcRow();
        });
        tr.appendChild(el("td", {}, sellInp));

        // 10. የአንዱ ፍሬ ትርፍ (Calculated: Selling Price - Landed Cost)
        var profitCell = el("td", { style: { textAlign: "right", fontWeight: "800", minWidth: "95px" } }, "0.00");
        tr.appendChild(profitCell);

        // 11. የሚያበቃበት ቀን
        var expInp = el("input", { type: "text", value: it.expiry || "", placeholder: "YYYY-MM-DD / N/A", style: { width: "115px" } });
        expInp.addEventListener("input", function () { it.expiry = expInp.value; });
        tr.appendChild(el("td", {}, expInp));

        // 12. ድርጊት (Delete)
        var delBtn = el("button", { class: "trash-btn", style: { padding: "4px 8px" }, title: "ረድፉን አስወግድ" }, "🗑️");
        delBtn.addEventListener("click", function () {
          wizard.items.splice(idx, 1);
          if (wizard.items.length === 0) {
            syncItemRows(1);
          } else {
            wizard.estimatedCount = wizard.items.length;
          }
          drawWizard();
        });
        tr.appendChild(el("td", { style: { textAlign: "center" } }, delBtn));

        function recalcRow() {
          var metrics = calculateItemMetrics(it);
          it.landedCost = metrics.landedCost;
          it.unitProfit = metrics.unitProfit;

          landedCell.textContent = metrics.landedCost.toFixed(2);
          profitCell.textContent = (metrics.unitProfit >= 0 ? "+" : "") + metrics.unitProfit.toFixed(2);
          profitCell.className = metrics.unitProfit >= 0 ? "profit-pos" : "profit-neg";
        }
        recalcRow();
        activeRowRecalcs.push(recalcRow);

        return tr;
      }

      // VIRTUALIZED SCROLLING ENGINE FOR LARGE NUMBERS
      var ROW_HEIGHT = 44;
      var OVERSCAN = 8;
      var lastStart = -1;
      var lastEnd = -1;

      var topSpacerRow = el("tr");
      var topSpacerCell = el("td", { colspan: "12", style: { height: "0px", padding: "0", border: "none" } });
      topSpacerRow.appendChild(topSpacerCell);

      var bottomSpacerRow = el("tr");
      var bottomSpacerCell = el("td", { colspan: "12", style: { height: "0px", padding: "0", border: "none" } });
      bottomSpacerRow.appendChild(bottomSpacerCell);

      function renderVirtualRows() {
        activeRowRecalcs = [];
        var total = wizard.items.length;
        if (total <= 35) {
          clear(tbody);
          wizard.items.forEach(function (item, idx) {
            tbody.appendChild(createRow(item, idx));
          });
          return;
        }

        var scrollTop = tableContainer.scrollTop || 0;
        var containerHeight = tableContainer.clientHeight || 480;
        var startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
        var visibleCount = Math.ceil(containerHeight / ROW_HEIGHT);
        var endIdx = Math.min(total, startIdx + visibleCount + (OVERSCAN * 2));

        if (startIdx === lastStart && endIdx === lastEnd) return;
        lastStart = startIdx;
        lastEnd = endIdx;

        clear(tbody);

        // Top Spacer
        var topH = startIdx * ROW_HEIGHT;
        topSpacerCell.style.height = topH + "px";
        if (topH > 0) tbody.appendChild(topSpacerRow);

        // Render Visible Rows
        for (var i = startIdx; i < endIdx; i++) {
          tbody.appendChild(createRow(wizard.items[i], i));
        }

        // Bottom Spacer
        var botH = Math.max(0, (total - endIdx) * ROW_HEIGHT);
        bottomSpacerCell.style.height = botH + "px";
        if (botH > 0) tbody.appendChild(bottomSpacerRow);
      }

      tableContainer.addEventListener("scroll", renderVirtualRows, { passive: true });
      renderVirtualRows();
      setTimeout(renderVirtualRows, 60);

      // Navigation Buttons
      var navRow = el("div", { class: "flex gap2 mt3" });
      var backBtn = el("button", { class: "btn btn-outline", style: { flex: "1" } }, "ተመለስ");
      backBtn.addEventListener("click", function () {
        wizard.step = 1;
        drawWizard();
      });

      var nextBtn = el("button", { class: "btn btn-primary", style: { flex: "1.5" } }, "ቀጣይ");
      nextBtn.addEventListener("click", function () {
        var valid = wizard.items.filter(function (x) { return x.name && (Number(x.qty) > 0); });
        if (valid.length === 0) {
          showToast("እባክዎ ቢያንስ የአንድ ዕቃ ስም እና ብዛት ያስገቡ");
          return;
        }
        wizard.step = 3;
        drawWizard();
      });

      navRow.appendChild(backBtn);
      navRow.appendChild(nextBtn);
      sheetBody.appendChild(navRow);
    }

    // ==========================================
    // STAGE 3: Review & Summary Confirmation
    // ==========================================
    function drawStep3() {
      sheetBody.appendChild(renderStepper(3));

      var totals = getFreightTotals();
      var validItems = wizard.items.filter(function (x) { return x.name && (Number(x.qty) > 0); });

      var sumNetQty = 0;
      var sumDamaged = 0;
      var totalCostCents = 0;
      var totalExpectedProfitCents = 0;

      validItems.forEach(function (it) {
        var metrics = calculateItemMetrics(it);
        var net = metrics.usableQty;
        sumNetQty += net;
        sumDamaged += (Number(it.damaged) || 0);

        var landed = metrics.landedCost;
        var costC = toCents(landed) * net;
        var sellC = toCents(it.sellPrice) * net;
        var profitC = sellC - costC;

        totalCostCents += costC;
        totalExpectedProfitCents += profitC;
      });

      // Header Info Card (Dynamic Store/Warehouse & Recorder Name)
      var allLocs = getLocationsList(state.data);
      var matchedLoc = allLocs.find(function (l) { return l.name === wizard.location || l.id === wizard.location; });
      var isWh = matchedLoc && (matchedLoc.type === "warehouse" || matchedLoc.type === "መጋዘን");
      var locTypeLabel = isWh ? "መጋዘን" : "ሱቅ";
      var recorderName = (state.currentUser && (state.currentUser.name || state.currentUser.fullName || state.currentUser.username)) || (state.data.profile && state.data.profile.ownerName) || "አስተዳዳሪ";

      var infoCard = el("div", { class: "card section", style: { background: "#f8fafc", borderColor: "#cbd5e1", padding: "14px", borderRadius: "12px" } }, [
        el("div", { class: "flex items-center justify-between", style: { borderBottom: "1px solid #e2e8f0", paddingBottom: "8px", marginBottom: "8px" } }, [
          el("div", { style: { fontSize: "13px", fontWeight: "800", color: "#1e3a8a" } }, "📋 የጭነት ማጠቃለያ መረጃ"),
          el("div", { class: "badge", style: { background: "#dbeafe", color: "#1e40af" } }, "የመኪና ጭነት")
        ]),
        el("div", { class: "grid2", style: { fontSize: "12.5px" } }, [
          el("div", {}, [el("b", {}, "👤 መዝጋቢ :- "), el("span", { style: { color: "#1e293b", fontWeight: "700" } }, recorderName)]),
          el("div", {}, [el("b", {}, "🏛️ " + locTypeLabel + " :- "), el("span", { style: { color: "#1e293b", fontWeight: "700" } }, wizard.location)]),
          el("div", {}, [el("b", {}, "📅 ቀን :- "), el("span", { style: { color: "#475569" } }, wizard.shipmentDate)]),
          el("div", {}, [el("b", {}, "🚚 ታርጋ :- "), el("span", { style: { color: "#475569" } }, wizard.truckPlate || "---")]),
          el("div", {}, [el("b", {}, "👤 አስረካቢ :- "), el("span", { style: { color: "#475569" } }, wizard.driverName || "---")]),
          el("div", {}, [el("b", {}, "💵 የጭነት ወጪ ድምር :- "), el("span", { style: { color: "#b91c1c", fontWeight: "800" } }, totals.totalFreight.toFixed(2) + " ብር")])
        ])
      ]);
      sheetBody.appendChild(infoCard);

      // Top Shipment Summary Card (Items Count, Cost & Green Profit Highlight)
      var topSummaryCard = el("div", {
        style: {
          background: "#ffffff",
          border: "1.5px solid #e2e8f0",
          borderRadius: "12px",
          padding: "12px 16px",
          marginBottom: "12px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
        }
      }, [
        el("div", { style: { fontSize: "12.5px", fontWeight: "700", color: "#475569", marginBottom: "5px" } }, [
          el("span", {}, "የተለያዩ ዕቃ ብዛት : "),
          el("b", { style: { color: "#0f172a" } }, validItems.length),
          el("span", {}, " ድምር ዕቃ ብዛት: "),
          el("b", { style: { color: "#0f172a" } }, sumNetQty + " ፍሬ")
        ]),
        el("div", { style: { fontSize: "14px", fontWeight: "800", color: "#0f172a", marginBottom: "8px" } },
          "ጠቅላላ የግዢ ወጪ (" + fmt(totalCostCents) + ")"
        ),
        el("div", {
          style: {
            background: "#dcfce7",
            border: "1px solid #86efac",
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "13.5px",
            fontWeight: "800",
            color: "#15803d",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }
        }, [
          el("span", {}, "🟢"),
          el("span", {}, "የሚጠበቅ ጠቅላላ ትርፍ: " + fmt(totalExpectedProfitCents))
        ])
      ]);
      sheetBody.appendChild(topSummaryCard);

      // Review Table of Valid Items
      var reviewTableWrap = el("div", { class: "shipment-table-container", style: { maxHeight: "280px" } });
      var table = el("table", { class: "shipment-table" });

      var thead = el("thead");
      var headRow = el("tr");
      ["ተ/ቁ", "የእቃው ስም", "ኮድ", "የተገዛ", "የተበላሸ", "የተጣራ", "የግዢ ዋጋ", "የቆመበት", "መሸጫ", "አንዱ ትርፍ", "የሚያበቃበት", "ጠቅላላ ትርፍ"].forEach(function (h) {
        headRow.appendChild(el("th", {}, h));
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      var tbody = el("tbody");
      validItems.forEach(function (it, idx) {
        var metrics = calculateItemMetrics(it);
        var net = metrics.usableQty;
        var landed = metrics.landedCost;
        var unitProf = metrics.unitProfit;
        var rowTotalProf = unitProf * net;

        var tr = el("tr");
        tr.appendChild(el("td", { style: { textAlign: "center", fontWeight: "700" } }, idx + 1));
        tr.appendChild(el("td", { style: { fontWeight: "700" } }, it.name));
        tr.appendChild(el("td", { style: { color: "#64748b" } }, it.code || "—"));
        tr.appendChild(el("td", { style: { textAlign: "right" } }, it.qty));
        tr.appendChild(el("td", { style: { textAlign: "right", color: it.damaged > 0 ? "#dc2626" : "#64748b" } }, it.damaged || 0));
        tr.appendChild(el("td", { style: { textAlign: "right", fontWeight: "800", color: "#15803d" } }, net));
        tr.appendChild(el("td", { style: { textAlign: "right" } }, (Number(it.costPrice) || 0).toFixed(2)));
        tr.appendChild(el("td", { style: { textAlign: "right", fontWeight: "700", color: "#1e40af" } }, landed.toFixed(2)));
        tr.appendChild(el("td", { style: { textAlign: "right", fontWeight: "700" } }, (Number(it.sellPrice) || 0).toFixed(2)));
        tr.appendChild(el("td", { style: { textAlign: "right", fontWeight: "800", color: unitProf >= 0 ? "#16a34a" : "#dc2626" } }, (unitProf >= 0 ? "+" : "") + unitProf.toFixed(2)));
        tr.appendChild(el("td", { style: { fontSize: "11px", color: "#64748b" } }, it.expiry || "—"));
        tr.appendChild(el("td", { style: { textAlign: "right", fontWeight: "800", color: rowTotalProf >= 0 ? "#16a34a" : "#dc2626" } }, (rowTotalProf >= 0 ? "+" : "") + rowTotalProf.toFixed(2)));
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      reviewTableWrap.appendChild(table);
      sheetBody.appendChild(reviewTableWrap);

      // 💰 Multi-Vault Manual Allocation & Validation
      var fundStats = getAllocatedFundBalances(state.data);
      var currentPool = getCapitalPool(state.data);

      // Define all 6 required funding sources
      var fundingSources = [];

      // 1. የተመለሰ ካፒታል (Returned Capital / COGS)
      fundingSources.push({
        id: "cogs_returned",
        name: "🔄 የተመለሰ ካፒታል (COGS)",
        cleanName: "የተመለሰ ካፒታል",
        icon: "🔄",
        balanceCents: fundStats.cumulativeSoldCogsCents,
        type: "cogs"
      });

      // 2. የትርፍ ካፒታል (ለስራ ካፒታል)
      var capCat = (fundStats.categoryBalances || []).find(function (c) {
        return c.id === "cap" || (c.name && (c.name.indexOf("ካፒታል") !== -1 || c.name.indexOf("ስራ") !== -1));
      });
      fundingSources.push({
        id: capCat ? capCat.id : "cap",
        name: "💼 " + ((capCat && capCat.name) || "የትርፍ ካፒታል (ለስራ)"),
        cleanName: (capCat && capCat.name) || "የትርፍ ካፒታል",
        icon: "💼",
        balanceCents: capCat ? capCat.balanceCents : 0,
        type: "profit"
      });

      // 3. እቁብ
      var equbCat = (fundStats.categoryBalances || []).find(function (c) {
        return c.id === "equb" || (c.name && c.name.indexOf("እቁብ") !== -1);
      });
      fundingSources.push({
        id: equbCat ? equbCat.id : "equb",
        name: "🤝 " + ((equbCat && equbCat.name) || "እቁብ"),
        cleanName: (equbCat && equbCat.name) || "እቁብ",
        icon: "🤝",
        balanceCents: equbCat ? equbCat.balanceCents : 0,
        type: "profit"
      });

      // 4. ለራሴ
      var rebiCat = (fundStats.categoryBalances || []).find(function (c) {
        return c.id === "rebi" || (c.name && (c.name.indexOf("ረቢ") !== -1 || c.name.indexOf("ለራስ") !== -1));
      });
      fundingSources.push({
        id: rebiCat ? rebiCat.id : "rebi",
        name: "👤 " + ((rebiCat && rebiCat.name) || "ለራሴ"),
        cleanName: (rebiCat && rebiCat.name) || "ለራሴ",
        icon: "👤",
        balanceCents: rebiCat ? rebiCat.balanceCents : 0,
        type: "profit"
      });

      // 5. ቁጠባ
      var savCat = (fundStats.categoryBalances || []).find(function (c) {
        return c.id === "sav" || (c.name && c.name.indexOf("ቁጠባ") !== -1);
      });
      fundingSources.push({
        id: savCat ? savCat.id : "sav",
        name: "🏦 " + ((savCat && savCat.name) || "ቁጠባ"),
        cleanName: (savCat && savCat.name) || "ቁጠባ",
        icon: "🏦",
        balanceCents: savCat ? savCat.balanceCents : 0,
        type: "profit"
      });

      // Add any additional custom profit categories if configured
      (fundStats.categoryBalances || []).forEach(function (c) {
        if (c.id === "exp" || (c.name && c.name.indexOf("ወጪ") !== -1)) return;
        var exists = fundingSources.some(function (f) { return f.id === c.id; });
        if (!exists) {
          fundingSources.push({
            id: c.id,
            name: "💰 " + c.name,
            cleanName: c.name,
            icon: "💰",
            balanceCents: c.balanceCents,
            type: "profit"
          });
        }
      });

      // 6. ውጫዊ/የተጨመረ ካፒታል
      fundingSources.push({
        id: "external_capital",
        name: "➕ ውጫዊ/የተጨመረ ካፒታል",
        cleanName: "ውጫዊ/የተጨመረ ካፒታል",
        icon: "➕",
        balanceCents: Math.max(0, currentPool.external_capital),
        type: "external"
      });

      // Initialize allocation amounts: all input fields start EMPTY (or 0) so the user manually enters amounts
      var amountsState = {};
      fundingSources.forEach(function (s) {
        amountsState[s.id] = "";
      });

      var capDeductionCard = el("div", {
        class: "card section",
        style: {
          background: "#ffffff",
          borderColor: "#e2e8f0",
          marginTop: "14px",
          marginBottom: "12px",
          padding: "16px",
          borderRadius: "14px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)"
        }
      }, [
        el("div", {
          class: "card-label flex items-center justify-between",
          style: { color: "#1e3a8a", fontWeight: "800", fontSize: "13px", marginBottom: "4px" }
        }, [
          el("span", {}, "💰 የክፍያ ምንጮች ድልድል (Multi-Vault Allocation)"),
          el("span", { class: "badge", style: { background: "#dbeafe", color: "#1e40af", fontSize: "10.5px", fontWeight: "700" } }, "የእያንዳንዱን ቋት ድርሻ ያስገቡ")
        ]),
        el("div", { style: { fontSize: "11.5px", color: "#64748b", marginBottom: "12px", lineHeight: "1.4" } },
          "የዕቃ ጭነቱን ጠቅላላ ዋጋ (" + fmt(totalCostCents) + ") ለመሸፈን ከሚፈልጓቸው ቋቶች ውስጥ የሚከፈለውን መጠን በነፃነት ያስገቡ፦")
      ]);

      var fundInputsContainer = el("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginBottom: "14px"
        }
      });

      // Deduction summary and validation display
      var summaryBox = el("div", {
        style: {
          background: "#f8fafc",
          border: "1.5px solid #cbd5e1",
          borderRadius: "12px",
          padding: "12px 14px",
          fontSize: "12px",
          marginBottom: "12px"
        }
      });

      // Live validation alert box
      var validationAlertBox = el("div", { style: { marginBottom: "12px" } });

      // Credit purchase option checkbox & container
      var creditContainer = el("div", {
        id: "creditPurchaseContainer",
        style: {
          background: "#fffbeb",
          border: "1.5px solid #fde68a",
          borderRadius: "12px",
          padding: "12px 14px",
          marginBottom: "14px",
          display: "none"
        }
      });

      var creditCheckbox = el("input", {
        type: "checkbox",
        id: "recordRemainingAsCredit",
        style: { width: "18px", height: "18px", cursor: "pointer", accentColor: "#d97706" }
      });

      var creditCheckLabel = el("label", {
        htmlFor: "recordRemainingAsCredit",
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          cursor: "pointer",
          fontWeight: "800",
          fontSize: "13px",
          color: "#92400e"
        }
      }, [
        creditCheckbox,
        el("span", {}, "ቀሪው ሂሳብ በዱቤ ይመዝገብ (Record Remaining as Credit)")
      ]);

      var creditSubDesc = el("div", {
        style: { fontSize: "11px", color: "#b45309", marginTop: "3px", paddingLeft: "26px" }
      }, "ያልተከፈለውን ቀሪ ሂሳብ በአቅራቢዎች ዱቤ መዝገብ (Accounts Payable) ላይ ይመዘግባል።");

      // Expandable supplier details when credit is checked
      var supplierFieldsBox = el("div", {
        style: {
          display: "none",
          marginTop: "10px",
          paddingTop: "10px",
          borderTop: "1px dashed #fcd34d"
        }
      });

      var supplierNameWrap = el("div", { style: { position: "relative", display: "flex", alignItems: "center", marginBottom: "8px" } });

      var initialSupName = wizard.driverName || (validItems[0] && validItems[0].supplier) || "አቅራቢ";
      var supplierNameInput = el("input", {
        class: "input",
        placeholder: "የአቅራቢ ስም (ለመምረጥ ጠቅ ያድርጉ)",
        value: initialSupName,
        style: { background: "#ffffff", paddingRight: "42px", cursor: "pointer", width: "100%" },
        list: "registered-suppliers-datalist"
      });

      var supplierPhoneInput = el("input", {
        class: "input",
        type: "tel",
        placeholder: "የአቅራቢ ስልክ ቁጥር (ምሳሌ: 0911223344)",
        style: { background: "#ffffff", marginBottom: "8px" }
      });

      // Try auto-filling phone from matched supplier or wizard
      if (wizard.supplierPhone) {
        supplierPhoneInput.value = wizard.supplierPhone;
      } else {
        var matchSup = (state.data.suppliers || []).find(function (x) {
          return x.name && x.name.trim().toLowerCase() === (supplierNameInput.value || "").trim().toLowerCase();
        });
        if (matchSup && matchSup.phone) {
          supplierPhoneInput.value = matchSup.phone;
        }
      }

      function triggerStep3SupSelect() {
        openSupplierSelectModal(function (selectedSup) {
          if (!selectedSup) return;
          supplierNameInput.value = selectedSup.name || "";
          if (selectedSup.phone) {
            supplierPhoneInput.value = selectedSup.phone;
          }
          wizard.driverName = selectedSup.name || "";
          wizard.supplierId = selectedSup.id || "";
          wizard.supplierPhone = selectedSup.phone || "";
        });
      }

      supplierNameInput.addEventListener("click", function () {
        triggerStep3SupSelect();
      });

      var supNamePickerBtn = el("button", {
        type: "button",
        title: "አስረካቢ ይምረጡ",
        style: {
          position: "absolute",
          right: "6px",
          background: "#e0f2fe",
          color: "#0284c7",
          border: "none",
          borderRadius: "8px",
          padding: "5px 9px",
          fontSize: "13px",
          fontWeight: "800",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }
      }, "🔍");
      supNamePickerBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        triggerStep3SupSelect();
      });

      supplierNameWrap.appendChild(supplierNameInput);
      supplierNameWrap.appendChild(supNamePickerBtn);

      supplierNameInput.addEventListener("input", function () {
        var sNameVal = (supplierNameInput.value || "").trim().toLowerCase();
        var found = (state.data.suppliers || []).find(function (x) {
          return x.name && x.name.trim().toLowerCase() === sNameVal;
        });
        if (found && found.phone && !supplierPhoneInput.value) {
          supplierPhoneInput.value = found.phone;
        }
      });

      var supplierDueDateInput = el("input", {
        class: "input",
        type: "date",
        style: { background: "#ffffff" }
      });

      supplierFieldsBox.appendChild(el("div", { style: { fontSize: "11px", fontWeight: "700", color: "#92400e", marginBottom: "4px" } }, "የአቅራቢ መረጃ (ዱቤ የሚያዘው)፦"));
      supplierFieldsBox.appendChild(supplierNameWrap);
      supplierFieldsBox.appendChild(supplierPhoneInput);
      supplierFieldsBox.appendChild(el("div", { style: { fontSize: "11px", color: "#92400e", marginBottom: "2px" } }, "የዱቤ መክፈያ ቀን ገደብ (አማራጭ)፦"));
      supplierFieldsBox.appendChild(supplierDueDateInput);

      creditContainer.appendChild(creditCheckLabel);
      creditContainer.appendChild(creditSubDesc);
      creditContainer.appendChild(supplierFieldsBox);

      // Actions: Left 'ተመለስ' (Red), Right 'ጭነቱን አፅድቅ' (Dark Blue)
      var actionRow = el("div", { class: "flex gap2 mt3", style: { marginTop: "16px" } });
      var editBtn = el("button", {
        type: "button",
        style: {
          flex: "1",
          background: "#dc2626",
          color: "#ffffff",
          border: "none",
          borderRadius: "14px",
          padding: "12px 18px",
          fontSize: "14px",
          fontWeight: "800",
          cursor: "pointer",
          boxShadow: "0 2px 6px rgba(220,38,38,0.2)"
        }
      }, "ተመለስ");
      editBtn.addEventListener("click", function () {
        wizard.step = 2;
        drawWizard();
      });

      var approveBtn = el("button", {
        type: "button",
        style: {
          flex: "1.6",
          background: "#1e3a8a",
          color: "#ffffff",
          border: "none",
          borderRadius: "14px",
          padding: "12px 24px",
          fontSize: "14.5px",
          fontWeight: "800",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(30,58,138,0.25)",
          transition: "all 0.15s ease"
        }
      }, "ጭነቱን አፅድቅ");

      // Dynamic calculation and UI sync
      function calculateLiveFunding() {
        var totalPaidCents = 0;
        fundingSources.forEach(function (s) {
          var valCents = toCents(amountsState[s.id] || 0);
          if (valCents > 0) {
            totalPaidCents += valCents;
          }
        });

        var remainingUnpaidCents = totalCostCents - totalPaidCents;
        return {
          totalPaidCents: totalPaidCents,
          remainingUnpaidCents: remainingUnpaidCents
        };
      }

      function updateValidationAndControls() {
        var funding = calculateLiveFunding();
        var totalPaidCents = funding.totalPaidCents;
        var remainingUnpaidCents = funding.remainingUnpaidCents;
        var isCreditChecked = creditCheckbox.checked;

        // Conditional display for Credit Checkbox:
        // Hide COMPLETELY whenever remainingUnpaid <= 0 (when full amount is paid or overpaid).
        // Show ONLY when there is an outstanding balance (remainingUnpaid > 0).
        if (remainingUnpaidCents > 0) {
          creditContainer.style.display = "block";
          supplierFieldsBox.style.display = isCreditChecked ? "block" : "none";
        } else {
          creditContainer.style.display = "none";
          creditCheckbox.checked = false;
          supplierFieldsBox.style.display = "none";
        }

        // 1. Update Summary Box
        summaryBox.innerHTML = "";
        summaryBox.appendChild(el("div", { class: "flex items-center justify-between mb1" }, [
          el("span", { style: { color: "#475569", fontWeight: "600" } }, "የጭነቱ ጠቅላላ ዋጋ:"),
          el("span", { style: { fontWeight: "800", color: "#1e293b", fontSize: "13px" } }, fmt(totalCostCents))
        ]));
        summaryBox.appendChild(el("div", { class: "flex items-center justify-between mb1" }, [
          el("span", { style: { color: "#475569", fontWeight: "600" } }, "የተከፈለው ድምር (Total Paid):"),
          el("span", { style: { fontWeight: "800", color: "#1e3a8a", fontSize: "13px" } }, fmt(totalPaidCents))
        ]));
        summaryBox.appendChild(el("div", {
          class: "flex items-center justify-between",
          style: { borderTop: "1px dashed #cbd5e1", paddingTop: "6px", marginTop: "6px" }
        }, [
          el("span", { style: { fontWeight: "700", color: remainingUnpaidCents > 0 ? "#dc2626" : remainingUnpaidCents < 0 ? "#ea580c" : "#16a34a" } },
            remainingUnpaidCents > 0 ? "ቀሪ ያልተከፈለ (Unpaid Balance):" : remainingUnpaidCents < 0 ? "ከተጠየቀው በላይ (Overpaid):" : "ቀሪ ሂሳብ:"),
          el("span", {
            style: {
              fontWeight: "900",
              fontSize: "14px",
              color: remainingUnpaidCents > 0 ? "#dc2626" : remainingUnpaidCents < 0 ? "#ea580c" : "#16a34a"
            }
          }, remainingUnpaidCents === 0 ? "0.00 ብር (ሙሉ ተከፍሏል)" : fmt(Math.abs(remainingUnpaidCents)))
        ]));

        // 2. Update Live Validation Message
        validationAlertBox.innerHTML = "";
        if (remainingUnpaidCents > 0) {
          var warnEl = el("div", {
            style: {
              background: "#fef2f2",
              border: "1.5px solid #f87171",
              borderRadius: "10px",
              padding: "10px 14px",
              color: "#991b1b",
              fontWeight: "700",
              fontSize: "12.5px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }
          }, [
            el("span", { style: { fontSize: "16px" } }, "⚠️"),
            el("span", {}, "ትክክል አይደለም፤ የተከፈለው ሂሳብ " + fmt(remainingUnpaidCents) + " ብር ይጎድላል")
          ]);
          validationAlertBox.appendChild(warnEl);
        } else if (remainingUnpaidCents < 0) {
          var overEl = el("div", {
            style: {
              background: "#fff7ed",
              border: "1.5px solid #fdba74",
              borderRadius: "10px",
              padding: "10px 14px",
              color: "#c2410c",
              fontWeight: "700",
              fontSize: "12.5px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }
          }, [
            el("span", { style: { fontSize: "16px" } }, "⚠️"),
            el("span", {}, "ትክክል አይደለም፤ ከተጠየቀው በላይ " + fmt(Math.abs(remainingUnpaidCents)) + " ብር ተከፍሏል፤ እባክዎ ያስተካክሉ")
          ]);
          validationAlertBox.appendChild(overEl);
        } else {
          var okEl = el("div", {
            style: {
              background: "#f0fdf4",
              border: "1.5px solid #86efac",
              borderRadius: "10px",
              padding: "10px 14px",
              color: "#166534",
              fontWeight: "700",
              fontSize: "12.5px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }
          }, [
            el("span", { style: { fontSize: "16px" } }, "✓"),
            el("span", {}, "የተከፈለው ሂሳብ ሙሉ በሙሉ ተሟልቷል (" + fmt(totalCostCents) + ")")
          ]);
          validationAlertBox.appendChild(okEl);
        }

        // 3. Submission Lock Logic
        if (remainingUnpaidCents < 0) {
          approveBtn.disabled = true;
          approveBtn.style.opacity = "0.45";
          approveBtn.style.cursor = "not-allowed";
          approveBtn.style.background = "#64748b";
          approveBtn.textContent = "ጭነቱን አፅድቅ (ትርፍ ተከፍሏል)";
        } else if (remainingUnpaidCents > 0) {
          if (isCreditChecked) {
            approveBtn.disabled = false;
            approveBtn.style.opacity = "1";
            approveBtn.style.cursor = "pointer";
            approveBtn.style.background = "#d97706";
            approveBtn.textContent = "ጭነቱን አፅድቅ (ቀሪው በዱቤ)";
          } else {
            approveBtn.disabled = true;
            approveBtn.style.opacity = "0.45";
            approveBtn.style.cursor = "not-allowed";
            approveBtn.style.background = "#64748b";
            approveBtn.textContent = "ጭነቱን አፅድቅ (" + fmt(remainingUnpaidCents) + " ይጎድላል)";
          }
        } else {
          approveBtn.disabled = false;
          approveBtn.style.opacity = "1";
          approveBtn.style.cursor = "pointer";
          approveBtn.style.background = "#1e3a8a";
          approveBtn.textContent = "ጭነቱን አፅድቅ";
        }
      }

      function renderFundInputs() {
        fundInputsContainer.innerHTML = "";
        fundingSources.forEach(function (source) {
          var isExternal = source.type === "external" || source.id === "external_capital";
          var currentVal = amountsState[source.id] || "";
          var curValCents = toCents(currentVal || 0);

          var rowCard = el("div", {
            id: "vaultCard-" + source.id,
            style: {
              background: curValCents > 0 ? "#f8fafc" : "#ffffff",
              border: curValCents > 0 ? "1.5px solid #93c5fd" : "1.5px solid #e2e8f0",
              borderRadius: "12px",
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              boxSizing: "border-box",
              width: "100%",
              transition: "all 0.15s ease"
            }
          });

          // TOP LINE: Display full Vault Name and Available Balance clearly (or just name for external)
          var topLine = el("div", {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              width: "100%"
            }
          });

          var titleAndBalance = el("div", {
            style: {
              display: "flex",
              alignItems: "baseline",
              flexWrap: "wrap",
              gap: "6px",
              minWidth: "0",
              flex: "1"
            }
          }, [
            el("span", {
              style: {
                fontWeight: "800",
                fontSize: "13px",
                color: "#1e293b",
                wordBreak: "break-word"
              }
            }, source.name)
          ]);

          // Requirement 2: Remove "(ያለ ቀሪ: 0.00 ብር)" from external/added capital card
          if (!isExternal) {
            titleAndBalance.appendChild(el("span", {
              style: {
                fontSize: "11.5px",
                fontWeight: "700",
                color: source.balanceCents > 0 ? "#166534" : "#94a3b8",
                whiteSpace: "nowrap"
              }
            }, "(ያለ ቀሪ: " + fmt(source.balanceCents) + ")"));
          }
          topLine.appendChild(titleAndBalance);

          if (!isExternal && source.balanceCents > 0) {
            var maxBtn = el("button", {
              type: "button",
              id: "maxFillBtn-" + source.id,
              style: {
                background: "#e0f2fe",
                color: "#0369a1",
                border: "1px solid #bae6fd",
                borderRadius: "6px",
                padding: "2px 8px",
                fontSize: "11px",
                fontWeight: "800",
                cursor: "pointer",
                flexShrink: "0",
                transition: "background 0.1s ease"
              }
            }, "ሙላ");
            maxBtn.addEventListener("click", function () {
              var curFunding = calculateLiveFunding();
              var othersPaid = curFunding.totalPaidCents - curValCents;
              var needed = Math.max(0, totalCostCents - othersPaid);
              var fillAmt = Math.min(source.balanceCents, needed > 0 ? needed : source.balanceCents);
              amountsState[source.id] = (fillAmt / 100).toFixed(2);
              renderFundInputs();
              updateValidationAndControls();
            });
            topLine.appendChild(maxBtn);
          }

          // BOTTOM LINE: Place the number input box underneath the title spanning the full width of the card
          var bottomInputWrap = el("div", {
            style: {
              width: "100%",
              position: "relative",
              boxSizing: "border-box"
            }
          });

          // Requirement 4: Allow and properly parse both comma and dot characters without blocking input
          var numInput = el("input", {
            id: "vaultInput-" + source.id,
            type: "text",
            inputmode: "decimal",
            autocomplete: "off",
            placeholder: "0.00",
            value: currentVal,
            style: {
              width: "100%",
              padding: "8px 36px 8px 12px",
              borderRadius: "8px",
              border: curValCents > 0 ? "1.5px solid #93c5fd" : "1.5px solid #cbd5e1",
              fontSize: "14px",
              fontWeight: "700",
              textAlign: "right",
              color: "#0f172a",
              background: "#ffffff",
              boxSizing: "border-box",
              outline: "none"
            }
          });

          var currencySuffix = el("span", {
            style: {
              position: "absolute",
              right: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: "11.5px",
              color: "#64748b",
              fontWeight: "700",
              pointerEvents: "none"
            }
          }, "ብር");

          // Requirement 3: Inline error element: "ከቋቱ ቀሪ ሂሳብ በላይ ማውጣት አይችሉም!"
          var inlineError = el("div", {
            id: "vaultError-" + source.id,
            class: "vault-limit-error",
            style: {
              display: "none",
              color: "#dc2626",
              fontSize: "11.5px",
              fontWeight: "700",
              marginTop: "3px",
              alignItems: "center",
              gap: "5px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "6px",
              padding: "4px 8px",
              boxSizing: "border-box"
            }
          }, [
            el("span", { style: { fontSize: "13px" } }, "⚠️"),
            el("span", {}, "ከቋቱ ቀሪ ሂሳብ በላይ ማውጣት አይችሉም!")
          ]);

          var errorTimer = null;

          // Prevent typing non-numeric characters while allowing digits, commas, and dots
          numInput.addEventListener("beforeinput", function (e) {
            if (!e.data) return;
            if (!/[\d.,]/.test(e.data)) {
              e.preventDefault();
            }
          });

          numInput.addEventListener("input", function (e) {
            var rawVal = e.target.value;
            var newCents = toCents(rawVal);

            // Requirement 3: Strict Vault Balance Limit Validation:
            // For all standard vaults (non-external), ensure the user CANNOT enter an amount greater than available balance.
            // If user types more than available, automatically cap it at the maximum available amount and display inline error.
            if (!isExternal && newCents > source.balanceCents) {
              var maxAvailable = (source.balanceCents / 100).toFixed(2);
              amountsState[source.id] = maxAvailable;
              numInput.value = maxAvailable;

              inlineError.style.display = "flex";
              numInput.style.borderColor = "#ef4444";
              numInput.style.color = "#dc2626";
              rowCard.style.borderColor = "#f87171";

              if (errorTimer) clearTimeout(errorTimer);
              errorTimer = setTimeout(function () {
                inlineError.style.display = "none";
                numInput.style.borderColor = source.balanceCents > 0 ? "#93c5fd" : "#cbd5e1";
                numInput.style.color = "#0f172a";
                rowCard.style.borderColor = source.balanceCents > 0 ? "#93c5fd" : "#e2e8f0";
              }, 4500);
            } else {
              // Valid amount or External Capital (Requirement 2: no upper limit)
              amountsState[source.id] = rawVal;
              if (errorTimer) clearTimeout(errorTimer);
              inlineError.style.display = "none";
              numInput.style.borderColor = newCents > 0 ? "#93c5fd" : "#cbd5e1";
              numInput.style.color = "#0f172a";
              rowCard.style.borderColor = newCents > 0 ? "#93c5fd" : "#e2e8f0";
              rowCard.style.background = newCents > 0 ? "#f8fafc" : "#ffffff";
            }

            updateValidationAndControls();
          });

          bottomInputWrap.appendChild(numInput);
          bottomInputWrap.appendChild(currencySuffix);

          rowCard.appendChild(topLine);
          rowCard.appendChild(bottomInputWrap);
          rowCard.appendChild(inlineError);
          fundInputsContainer.appendChild(rowCard);
        });
      }

      creditCheckbox.addEventListener("change", function () {
        updateValidationAndControls();
      });

      capDeductionCard.appendChild(fundInputsContainer);
      capDeductionCard.appendChild(summaryBox);
      capDeductionCard.appendChild(validationAlertBox);
      capDeductionCard.appendChild(creditContainer);
      sheetBody.appendChild(capDeductionCard);

      renderFundInputs();
      updateValidationAndControls();

      approveBtn.addEventListener("click", guarded(function () {
        var funding = calculateLiveFunding();
        var totalPaidCents = funding.totalPaidCents;
        var remainingUnpaidCents = funding.remainingUnpaidCents;
        var isCredit = remainingUnpaidCents > 0 && creditCheckbox.checked;

        if (remainingUnpaidCents > 0 && !isCredit) {
          showToast("⚠️ እባክዎ የተጓደለውን " + fmt(remainingUnpaidCents) + " ብር ይሙሉ ወይም 'በዱቤ ይመዝገብ' የሚለውን ይምረጡ");
          return;
        }

        if (remainingUnpaidCents < 0) {
          showToast("⚠️ ከተጠየቀው በላይ ተከፍሏል፤ እባክዎ የተከፈለውን መጠን ያስተካክሉ");
          return;
        }

        approveBtn.disabled = true;

        // Build detailed multi-vault allocation map and breakdown
        var vaultDeductionsMap = {};
        var fromRetC = 0;
        var fromProfC = 0;
        var fromExtC = 0;

        fundingSources.forEach(function (s) {
          var enteredCents = toCents(amountsState[s.id] || 0);
          if (enteredCents > 0) {
            vaultDeductionsMap[s.id] = enteredCents;
            if (s.type === "cogs" || s.id === "cogs_returned") {
              fromRetC += enteredCents;
            } else if (s.type === "external" || s.id === "external_capital") {
              fromExtC += enteredCents;
            } else {
              fromProfC += enteredCents;
            }
          }
        });

        var creditAmountCents = isCredit ? remainingUnpaidCents : 0;
        var supplierNameVal = supplierNameInput.value.trim() || wizard.driverName || (validItems[0] && validItems[0].supplier) || "አቅራቢ";
        var supplierPhoneVal = supplierPhoneInput.value.trim();
        var supplierDueDateVal = supplierDueDateInput.value || "";

        setData(function (data) {
          if (!Array.isArray(data.items)) data.items = [];
          if (!Array.isArray(data.shipments)) data.shipments = [];
          if (!Array.isArray(data.expenses)) data.expenses = [];
          if (!Array.isArray(data.accountsPayable)) data.accountsPayable = [];

          // 1. Process items into stock
          validItems.forEach(function (row) {
            var metrics = calculateItemMetrics(row);
            var netQty = metrics.usableQty;
            var landedCostVal = metrics.landedCost;
            var costCents = toCents(landedCostVal > 0 ? landedCostVal : row.costPrice);
            var sellCents = toCents(row.sellPrice);

            mergeOrAddItem(data, {
              name: row.name.trim(),
              code: row.code || "",
              landedCostCents: costCents,
              sellPriceCents: sellCents,
              qty: netQty,
              dateAdded: wizard.shipmentDate,
              expiry: row.expiry || "",
              locationId: wizard.locationId,
              locationName: wizard.location
            });
          });

          // 2. Freight/transport costs are excluded from general expenses (already factored into product landed cost)

          // 3. Save comprehensive Shipment Record with multi-vault allocation
          var shipmentId = uid();
          var creditRecordId = isCredit ? uid() : null;

          // Auto-register supplier in data.suppliers if not present yet
          if (!Array.isArray(data.suppliers)) data.suppliers = [];
          var supNameClean = (supplierNameVal || "").trim();
          var existingSup = data.suppliers.find(function (s) {
            return s.name && s.name.trim().toLowerCase() === supNameClean.toLowerCase();
          });
          var matchedSupplierId = wizard.supplierId || (existingSup ? existingSup.id : null);
          if (!existingSup && supNameClean && supNameClean !== "አቅራቢ") {
            matchedSupplierId = "sup_" + uid();
            data.suppliers.push({
              id: matchedSupplierId,
              name: supNameClean,
              phone: supplierPhoneVal || "",
              address: "",
              createdAt: Date.now()
            });
          }

          var shipmentRecord = {
            id: shipmentId,
            date: wizard.shipmentDate,
            option: wizard.option,
            location: wizard.location,
            truckPlate: wizard.truckPlate || "",
            driver: wizard.driverName || "",
            supplier: supplierNameVal,
            supplierId: matchedSupplierId,
            supplierPhone: supplierPhoneVal,
            freightCostCents: toCents(wizard.freightCost),
            offloadingCostCents: toCents(wizard.offloadingCost),
            miscCostCents: toCents(wizard.miscCost),
            totalFreightCents: toCents(totals.totalFreight),
            overheadPerUnitCents: toCents(totals.overheadPerUnit),
            itemsCount: validItems.length,
            totalPieces: sumNetQty,
            damagedPieces: sumDamaged,
            totalCostCents: totalCostCents,
            totalPaidCents: totalPaidCents,
            expectedProfitCents: totalExpectedProfitCents,
            isCreditPurchase: isCredit,
            creditAmountCents: creditAmountCents,
            supplierCreditId: creditRecordId,
            creditDueDate: supplierDueDateVal,
            vaultDeductions: vaultDeductionsMap,
            capitalSource: fromRetC > 0 ? "returned_capital" : "profit_capital",
            capitalDeduction: {
              deductedAmountCents: totalPaidCents,
              fromReturnedCents: fromRetC,
              fromProfitCents: fromProfC,
              fromExternalCents: fromExtC,
              vaultDeductions: vaultDeductionsMap,
              totalCostCents: totalCostCents,
              isCredit: isCredit,
              creditAmountCents: creditAmountCents
            },
            items: validItems.map(function (x) {
              var metrics = calculateItemMetrics(x);
              return {
                name: x.name,
                code: x.code || "",
                supplier: x.supplier || supplierNameVal || wizard.driverName || "",
                qty: Number(x.qty) || 0,
                damaged: Number(x.damaged) || 0,
                netQty: metrics.usableQty,
                costPriceCents: toCents(x.costPrice),
                landedCostCents: toCents(metrics.landedCost),
                sellPriceCents: toCents(x.sellPrice),
                expiry: x.expiry || ""
              };
            }),
            createdAt: Date.now()
          };
          data.shipments.unshift(shipmentRecord);

          // 4. Record into Accounts Payable / Credit ledger if credit purchase option was selected
          if (isCredit && creditAmountCents > 0) {
            data.accountsPayable.unshift({
              id: creditRecordId,
              shipmentId: shipmentId,
              type: "shipment_credit",
              supplier: supplierNameVal,
              supplierPhone: supplierPhoneVal,
              totalCostCents: totalCostCents,
              paidCents: totalPaidCents,
              creditCents: creditAmountCents,
              remainingCents: creditAmountCents,
              date: wizard.shipmentDate || todayISO(),
              dueDate: supplierDueDateVal,
              notes: "የዕቃ ጭነት ቀሪ ዱቤ (" + validItems.length + " ዓይነት ዕቃዎች)",
              paid: false,
              paidDate: null,
              createdAt: Date.now()
            });
          }

          return data;
        });

        if (isCredit) {
          showToast("✓ ጭነቱ ጸድቋል! ቀሪው " + fmt(creditAmountCents) + " በአቅራቢ ዱቤ ተመዝግቧል");
        } else {
          showToast("✓ የዕቃ ጭነት በሙሉ ክፍያ ጸድቆ ወደ ስቶክ ገብቷል!");
        }
        close();
        navigateToTab("items");
      }));

      actionRow.appendChild(editBtn);
      actionRow.appendChild(approveBtn);
      sheetBody.appendChild(actionRow);
    }

    // Initialize with Step 0
    drawWizard();
  }, null, true, opts);
}

function openShipmentHistorySheet(opts) {
  openSheet("📜 የጭነት ታሪክ", function (body, close) {
    var shipments = (state.data.shipments || []).slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    var totalShipmentCents = shipments.reduce(function (s, x) { return s + (x.totalCostCents || 0); }, 0);

    body.appendChild(el("div", { class: "card section", style: { background: "#eff6ff", borderColor: "#bfdbfe" } }, [
      el("div", { class: "card-label", style: { color: "#1d4ed8" } }, "ጠቅላላ የተጫኑ ዕቃዎች ዋጋ"),
      el("div", { class: "card-value", style: { color: "#1e40af" } }, fmt(totalShipmentCents)),
      el("div", { style: { fontSize: "12px", color: "#60a5fa", marginTop: "4px" } }, "የተመዘገቡ ጭነቶች ድምር: " + shipments.length)
    ]));

    var addShipBtn = el("button", { class: "btn btn-primary btn-block mb3" }, "🚚 አዲስ ጭነት መዝግብ");
    addShipBtn.addEventListener("click", function () { close(); openReceiveShipmentSheet(); });
    body.appendChild(addShipBtn);

    if (shipments.length === 0) {
      body.appendChild(el("div", { class: "empty", style: { padding: "30px 10px" } }, [
        el("div", { style: { fontSize: "32px", marginBottom: "8px" } }, "📦"),
        el("div", { style: { fontWeight: "700" } }, "እስካሁን የተመዘገበ የዕቃ ጭነት የለም"),
        el("div", { style: { fontSize: "12px", color: "#94a3b8", marginTop: "4px" } }, "ከላይ ያለውን 'አዲስ ጭነት መዝግብ' በመንካት ያስገቡ።")
      ]));
      return;
    }

    var listWrap = el("div", { class: "list-scroll" });
    shipments.forEach(function (s) {
      var titleText = s.itemsCount
        ? ((s.truckPlate ? "🚚 " + s.truckPlate + " · " : "📦 ") + s.itemsCount + " ዓይነት ዕቃዎች (" + s.totalPieces + " ፍሬ)")
        : ((s.itemName || "ጭነት") + " × " + (s.qty || 1));

      var subText = (s.driver || s.supplier || "አቅራቢ") + " · " + s.date + (s.location ? " · " + s.location : "") + (s.billNo ? " · #" + s.billNo : "");

      var row = el("div", { class: "item-row", style: { cursor: s.items && s.items.length ? "pointer" : "default" } }, [
        el("div", { class: "flex items-center justify-between" }, [
          el("div", { style: { flex: "1" } }, [
            el("div", { class: "item-name", style: { fontSize: "14px", fontWeight: "700" } }, titleText),
            el("div", { class: "item-sub", style: { fontSize: "12px", color: "#64748b" } }, subText)
          ]),
          el("div", { style: { textAlign: "right", marginLeft: "12px" } }, [
            el("div", { style: { fontWeight: "800", color: "#1e293b" } }, fmt(s.totalCostCents || 0)),
            el("div", { style: { fontSize: "11px", color: s.expectedProfitCents ? "#16a34a" : "#94a3b8" } },
              s.expectedProfitCents ? ("ትርፍ: " + fmt(s.expectedProfitCents)) : ("@ " + fmt(s.unitCostCents || 0)))
          ])
        ])
      ]);

      if (s.items && s.items.length) {
        row.addEventListener("click", function () {
          var detailModal = el("div", { class: "overlay", style: { zIndex: "60" } });
          var bg = el("div", { class: "overlay-bg", onclick: function () { detailModal.remove(); } });
          var box = el("div", { class: "sheet sheet-wide", style: { maxHeight: "85vh", padding: "16px" } }, [
            el("div", { class: "sheet-header", style: { marginBottom: "12px" } }, [
              el("button", { class: "sheet-back", onclick: function () { detailModal.remove(); } }, "‹"),
              el("h2", {}, "📦 የጭነት ዝርዝር: " + (s.truckPlate || s.date))
            ]),
            el("div", { class: "shipment-table-container" }, [
              (function () {
                var dt = el("table", { class: "shipment-table" });
                var thd = el("thead");
                var thr = el("tr");
                ["ተ/ቁ", "የእቃው ስም", "ኮድ", "ብዛት", "የተበላሸ", "የተጣራ", "የግዢ", "የቆመበት", "መሸጫ", "የሚያበቃበት"].forEach(function (h) {
                  thr.appendChild(el("th", {}, h));
                });
                thd.appendChild(thr);
                dt.appendChild(thd);
                var tbd = el("tbody");
                s.items.forEach(function (it, idx) {
                  var tr = el("tr");
                  tr.appendChild(el("td", { style: { textAlign: "center" } }, idx + 1));
                  tr.appendChild(el("td", { style: { fontWeight: "700" } }, it.name));
                  tr.appendChild(el("td", { style: { color: "#64748b" } }, it.code || "—"));
                  tr.appendChild(el("td", { style: { textAlign: "right" } }, it.qty));
                  tr.appendChild(el("td", { style: { textAlign: "right", color: it.damaged > 0 ? "#dc2626" : "#64748b" } }, it.damaged || 0));
                  tr.appendChild(el("td", { style: { textAlign: "right", fontWeight: "700", color: "#16a34a" } }, it.netQty || it.qty));
                  tr.appendChild(el("td", { style: { textAlign: "right" } }, fmt(it.costPriceCents || 0)));
                  tr.appendChild(el("td", { style: { textAlign: "right", fontWeight: "700", color: "#1e3a8a" } }, fmt(it.landedCostCents || 0)));
                  tr.appendChild(el("td", { style: { textAlign: "right", fontWeight: "700" } }, fmt(it.sellPriceCents || 0)));
                  tr.appendChild(el("td", { style: { fontSize: "11px", color: "#64748b" } }, it.expiry || "—"));
                  tbd.appendChild(tr);
                });
                dt.appendChild(tbd);
                return dt;
              })()
            ]),
            el("button", { class: "btn btn-primary btn-block mt3", onclick: function () { detailModal.remove(); } }, "ዝጋ")
          ]);
          detailModal.appendChild(bg);
          detailModal.appendChild(box);
          document.querySelector(".app").appendChild(detailModal);
        });
      }

      listWrap.appendChild(row);
    });
    body.appendChild(listWrap);
  }, null, false, opts);
}

function openCustomerCreditSheet() {
  openSheet("💳 የደበኞች ዴቢ መረጃ (ዱቤ)", function (body, close) {
    var allCreditSales = (state.data.sales || []).filter(function (s) { return s.paymentMethod === "credit"; });
    var unpaidSales = allCreditSales.filter(function (s) {
      if (s.paid) return false;
      var rem = s.creditRemainingCents !== undefined ? s.creditRemainingCents : s.totalCents;
      return rem > 0;
    });
    var totalUnpaidCents = allCreditSales.reduce(function (sum, s) {
      if (s.paid) return sum;
      var rem = s.creditRemainingCents !== undefined ? s.creditRemainingCents : s.totalCents;
      return sum + Math.max(0, rem);
    }, 0);
    var totalPaidCents = allCreditSales.reduce(function (sum, s) {
      var adv = s.advanceCents || 0;
      return sum + (s.paid ? s.totalCents : adv);
    }, 0);

    body.appendChild(el("div", { class: "grid2 mb3" }, [
      el("div", { class: "card-compact red" }, [
        el("div", { class: "card-label" }, "ያልተሰበሰበ ዱቤ"),
        el("div", { class: "card-value", style: { color: "#dc2626" } }, fmt(totalUnpaidCents))
      ]),
      el("div", { class: "card-compact green" }, [
        el("div", { class: "card-label" }, "የተሰበሰበ ዱቤ"),
        el("div", { class: "card-value", style: { color: "#16a34a" } }, fmt(totalPaidCents))
      ])
    ]));

    var filterUnpaidOnly = true;
    var listWrap = el("div", { class: "list-scroll" });

    function renderList() {
      clear(listWrap);
      var displayList = filterUnpaidOnly ? unpaidSales : allCreditSales;
      if (displayList.length === 0) {
        listWrap.appendChild(el("div", { class: "empty" }, filterUnpaidOnly ? "🎉 ምንም ያልተሰበሰበ ዱቤ የለም!" : "ምንም የዱቤ ሽያጭ አልተመዘገበም"));
        return;
      }
      displayList.forEach(function (s) {
        var remCents = s.paid ? 0 : (s.creditRemainingCents !== undefined ? s.creditRemainingCents : s.totalCents);
        var advCents = s.advanceCents || 0;
        var isOverdue = !s.paid && s.dueDate && s.dueDate < todayISO();
        var card = el("div", { class: "item-row", style: { background: s.paid ? "#f8fafc" : (isOverdue ? "#fef2f2" : "#fff") } });

        var topRow = el("div", { class: "flex items-center justify-between mb1" }, [
          el("div", { style: { fontWeight: "800", fontSize: "14px" } }, s.customer || "ደንበኛ"),
          el("div", { style: { textAlign: "right" } }, [
            el("div", { style: { fontWeight: "900", color: s.paid ? "#16a34a" : "#dc2626", fontSize: "14px" } }, s.paid ? ("✓ " + fmt(s.totalCents)) : ("ቀሪ: " + fmt(remCents))),
            (advCents > 0 && !s.paid) ? el("div", { style: { fontSize: "10.5px", color: "#64748b" } }, "ቅድሚያ: " + fmt(advCents)) : null
          ].filter(Boolean))
        ]);

        var midRow = el("div", { class: "flex items-center justify-between text-xs", style: { color: "#64748b", marginBottom: "6px" } }, [
          el("span", {}, s.itemName + " × " + s.qty + " (ጠቅላላ " + fmt(s.totalCents) + ")"),
          el("span", { style: { fontWeight: "600", color: isOverdue ? "#ef4444" : "#64748b" } },
            s.paid ? "✓ ሙሉ በሙሉ ተከፍሏል" : (s.dueDate ? ("ቀን ገደብ: " + s.dueDate + (isOverdue ? " (አልፏል)" : "")) : "ቀን ገደብ የለውም"))
        ]);

        var actRow = el("div", { class: "flex items-center justify-between", style: { marginTop: "6px", paddingTop: "6px", borderTop: "1px dashed #e2e8f0" } });
        if (s.customerPhone) {
          var callLink = el("a", { href: "tel:" + s.customerPhone, class: "btn btn-outline btn-sm", style: { textDecoration: "none", padding: "4px 10px" } }, "📞 " + s.customerPhone);
          actRow.appendChild(callLink);
        } else {
          actRow.appendChild(el("span", { style: { fontSize: "11px", color: "#94a3b8" } }, "ስልክ አልተመዘገበም"));
        }

        if (!s.paid) {
          var payBtn = el("button", { class: "btn btn-primary btn-sm", style: { padding: "4px 12px" } }, "✓ ክፍያ ተቀበል");
          payBtn.addEventListener("click", guarded(function () {
            setData(function (data) {
              var target = data.sales.find(function (x) { return x.id === s.id; });
              if (target) {
                target.paid = true;
                target.creditRemainingCents = 0;
                target.paidDate = todayISO();
              }
              return data;
            });
            showToast("✓ የዱቤ ክፍያ ተመዝግቧል");
            close();
            openCustomerCreditSheet();
          }));
          actRow.appendChild(payBtn);
        } else {
          actRow.appendChild(el("span", { style: { fontSize: "11px", color: "#16a34a", fontWeight: "700" } }, "የተጠናቀቀ"));
        }

        card.appendChild(topRow);
        card.appendChild(midRow);
        card.appendChild(actRow);
        listWrap.appendChild(card);
      });
    }

    var toggleRow = el("div", { class: "flex gap2 mb3" });
    var btnUnpaid = el("button", { class: "btn btn-sm btn-primary", style: { flex: "1" } }, "ያልተከፈለ (" + unpaidSales.length + ")");
    var btnAll = el("button", { class: "btn btn-sm btn-outline", style: { flex: "1" } }, "ሁሉንም (" + allCreditSales.length + ")");

    btnUnpaid.addEventListener("click", function () {
      filterUnpaidOnly = true;
      btnUnpaid.className = "btn btn-sm btn-primary";
      btnAll.className = "btn btn-sm btn-outline";
      renderList();
    });
    btnAll.addEventListener("click", function () {
      filterUnpaidOnly = false;
      btnAll.className = "btn btn-sm btn-primary";
      btnUnpaid.className = "btn btn-sm btn-outline";
      renderList();
    });

    toggleRow.appendChild(btnUnpaid);
    toggleRow.appendChild(btnAll);
    body.appendChild(toggleRow);
    body.appendChild(listWrap);
    renderList();
  }, null);
}

// ==========================================
// 🚛 የዕቃ አስራካቢዎች መረጃ (SUPPLIERS MANAGEMENT)
// ==========================================

function openSupplierSelectModal(onSelectSupplier) {
  openSheet("አስረካቢ ይምረጡ", function (body, close) {
    var searchWrap = el("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        background: "#f8fafc",
        border: "1.5px solid #cbd5e1",
        borderRadius: "12px",
        padding: "8px 12px",
        marginBottom: "12px"
      }
    });

    var searchInput = el("input", {
      type: "text",
      placeholder: "🔍 ፈልግ (በስም ወይም በስልክ)...",
      style: {
        border: "none",
        background: "transparent",
        outline: "none",
        width: "100%",
        fontSize: "13.5px",
        color: "#1e293b"
      }
    });
    searchWrap.appendChild(searchInput);
    body.appendChild(searchWrap);

    var listWrap = el("div", { style: { maxHeight: "380px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" } });
    body.appendChild(listWrap);

    function renderList(queryText) {
      clear(listWrap);
      var query = (queryText || "").trim().toLowerCase();
      var all = Array.isArray(state.data.suppliers) ? state.data.suppliers : [];
      var filtered = all.filter(function (s) {
        if (!query) return true;
        var sName = (s.name || "").toLowerCase();
        var sPhone = (s.phone || "").replace(/\s+/g, "");
        var sAddr = (s.address || "").toLowerCase();
        return sName.indexOf(query) !== -1 || sPhone.indexOf(query) !== -1 || sAddr.indexOf(query) !== -1;
      });

      // Quick "+ አዲስ አስራካቢ ጨምር" row when user typed a name that isn't exact match
      if (query && !all.some(function (s) { return (s.name || "").trim().toLowerCase() === query; })) {
        var newTypedRow = el("div", {
          style: {
            background: "#f0fdf4",
            border: "1.5px dashed #86efac",
            borderRadius: "12px",
            padding: "11px 14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }
        }, [
          el("div", {}, [
            el("div", { style: { fontWeight: "800", fontSize: "13.5px", color: "#166534" } }, "+ '" + queryText.trim() + "' እንደ አስረካቢ ምረጥ"),
            el("div", { style: { fontSize: "11.5px", color: "#15803d" } }, "አዲስ አስረካቢ ስም")
          ]),
          el("span", { style: { fontSize: "16px", color: "#16a34a", fontWeight: "700" } }, "✓")
        ]);
        newTypedRow.addEventListener("click", function () {
          close();
          if (typeof onSelectSupplier === "function") {
            onSelectSupplier({
              id: "sup_" + uid(),
              name: queryText.trim(),
              phone: "",
              address: ""
            });
          }
        });
        listWrap.appendChild(newTypedRow);
      }

      if (filtered.length === 0 && !query) {
        listWrap.appendChild(el("div", {
          style: {
            padding: "24px 12px",
            textAlign: "center",
            color: "#64748b",
            fontSize: "13px",
            background: "#f8fafc",
            borderRadius: "10px"
          }
        }, [
          el("div", { style: { fontSize: "28px", marginBottom: "6px" } }, "🚛"),
          el("div", { style: { fontWeight: "700", color: "#475569" } }, "ምንም የተመዘገበ አስራካቢ አልተገኘም"),
          el("div", { style: { fontSize: "11.5px", color: "#94a3b8", marginTop: "2px" } }, "ከታች ያለውን '+ አዲስ አስራካቢ ጨምር' በመጫን አዲስ ያስመዝግቡ")
        ]));
      }

      filtered.forEach(function (sup) {
        var card = el("div", {
          class: "card",
          style: {
            background: "#ffffff",
            border: "1.5px solid #e2e8f0",
            borderRadius: "12px",
            padding: "12px 14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            transition: "all 0.15s ease"
          }
        }, [
          el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, [
            el("div", {
              style: {
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                background: "#e0f2fe",
                color: "#0369a1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                flexShrink: "0"
              }
            }, "👤"),
            el("div", {}, [
              el("div", { style: { fontWeight: "800", fontSize: "14px", color: "#1e293b", marginBottom: "2px" } }, sup.name || "ስም የሌለው አስራካቢ"),
              el("div", { style: { fontSize: "12px", color: "#64748b", display: "flex", alignItems: "center", gap: "8px" } }, [
                el("span", {}, sup.phone ? ("📞 " + sup.phone) : "📞 ስልክ የለም"),
                sup.address ? el("span", { style: { color: "#94a3b8" } }, "• " + sup.address) : el("span")
              ])
            ])
          ]),
          el("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, [
            el("span", {
              class: "badge",
              style: {
                background: "#f1f5f9",
                color: "#475569",
                fontSize: "11px",
                fontWeight: "700"
              }
            }, "ይምረጡ"),
            el("span", { style: { color: "#94a3b8", fontSize: "16px", fontWeight: "700" } }, "›")
          ])
        ]);

        card.addEventListener("mouseenter", function () {
          card.style.borderColor = "#00b87c";
          card.style.background = "#f0fdf4";
        });
        card.addEventListener("mouseleave", function () {
          card.style.borderColor = "#e2e8f0";
          card.style.background = "#ffffff";
        });

        card.addEventListener("click", function () {
          close();
          if (typeof onSelectSupplier === "function") {
            onSelectSupplier(sup);
          }
        });

        listWrap.appendChild(card);
      });
    }

    renderList("");

    searchInput.addEventListener("input", function (e) {
      renderList(e.target.value);
    });

    // FOOTER ACTION: Option to click "+ አዲስ አስራካቢ ጨምር" if the supplier isn't listed
    var footerWrap = el("div", {
      style: {
        marginTop: "12px",
        paddingTop: "12px",
        borderTop: "1px solid #f1f5f9"
      }
    });

    var addBtn = el("button", {
      type: "button",
      class: "btn btn-block",
      style: {
        padding: "11px 14px",
        fontSize: "13.5px",
        fontWeight: "800",
        background: "#00b87c",
        color: "#ffffff",
        borderRadius: "10px",
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        cursor: "pointer"
      }
    }, [
      el("span", { style: { fontSize: "16px" } }, "+"),
      el("span", {}, "አዲስ አስራካቢ ጨምር")
    ]);

    addBtn.addEventListener("click", function () {
      close();
      openSupplierFormModal(null, function () {
        // Find newly added supplier (most recently created)
        var sups = Array.isArray(state.data.suppliers) ? state.data.suppliers : [];
        var newlyAdded = sups[sups.length - 1];
        if (newlyAdded && typeof onSelectSupplier === "function") {
          onSelectSupplier(newlyAdded);
        }
      });
    });

    footerWrap.appendChild(addBtn);
    body.appendChild(footerWrap);

    setTimeout(function () {
      try { searchInput.focus(); } catch (e) {}
    }, 120);
  }, null);
}

function getShipmentsForSupplier(supplier) {
  var sName = (supplier.name || "").trim().toLowerCase();
  var sPhone = (supplier.phone || "").replace(/\s+/g, "");
  var allShipments = Array.isArray(state.data.shipments) ? state.data.shipments : [];

  return allShipments.filter(function (s) {
    var curSup = (s.supplier || "").trim().toLowerCase();
    var curDriver = (s.driver || "").trim().toLowerCase();
    var curPhone = (s.supplierPhone || "").replace(/\s+/g, "");
    var idMatch = supplier.id && s.supplierId && supplier.id === s.supplierId;

    var nameMatch = sName && (curSup === sName || curSup.indexOf(sName) !== -1 || sName.indexOf(curSup) !== -1 || curDriver === sName);
    var phoneMatch = sPhone && curPhone && (curPhone === sPhone || curPhone.indexOf(sPhone) !== -1 || sPhone.indexOf(curPhone) !== -1);
    var itemMatch = sName && Array.isArray(s.items) && s.items.some(function (it) {
      var itSup = (it.supplier || "").trim().toLowerCase();
      return itSup && (itSup === sName || itSup.indexOf(sName) !== -1);
    });

    return idMatch || nameMatch || phoneMatch || itemMatch;
  });
}

function formatShipmentDateTime(shipment) {
  var d = shipment.date || "";
  var t = "";
  if (shipment.createdAt) {
    try {
      var dt = new Date(shipment.createdAt);
      if (!isNaN(dt.getTime())) {
        var hrs = dt.getHours();
        var mins = String(dt.getMinutes()).padStart(2, "0");
        var ampm = hrs >= 12 ? "ከሰዓት" : "ጥዋት";
        var h12 = hrs % 12 || 12;
        t = h12 + ":" + mins + " " + ampm + " (" + (hrs >= 12 ? "PM" : "AM") + ")";
      }
    } catch (e) {}
  }
  return d + (t ? " · " + t : "");
}

function openSupplierFormModal(existingSupplier, onSaved) {
  openSheet(existingSupplier ? "✏️ አስራካቢ ማስተካከያ" : "➕ አዲስ አስራካቢ መዝግብ", function (body, close) {
    var formCard = el("div", {
      class: "card section",
      style: {
        background: "#ffffff",
        borderRadius: "14px",
        padding: "18px 16px",
        border: "1px solid #e2e8f0",
        display: "flex",
        flexDirection: "column",
        gap: "14px"
      }
    });

    // Subtitle note
    formCard.appendChild(el("div", {
      style: {
        fontSize: "12.5px",
        color: "#64748b",
        marginBottom: "4px"
      }
    }, existingSupplier ? "የአስራካቢውን ስም፣ ስልክ እና አድራሻ ያሻሽሉ፦" : "አዲስ የዕቃ አስራካቢ መረጃ እዚህ ያስመዝግቡ፦"));

    // 1. Supplier Name
    var nameGroup = el("div", {}, [
      el("label", { style: { display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" } }, "የአስራካቢው ሙሉ ስም *"),
      el("input", {
        id: "sup-form-name",
        class: "input",
        type: "text",
        placeholder: "ምሳሌ: አቶ ከበደ ሀይሉ",
        value: existingSupplier ? (existingSupplier.name || "") : "",
        style: { width: "100%", boxSizing: "border-box" }
      })
    ]);
    var nameInp = nameGroup.querySelector("input");

    // 2. Phone Number
    var phoneGroup = el("div", {}, [
      el("label", { style: { display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" } }, "ስልክ ቁጥር *"),
      el("input", {
        id: "sup-form-phone",
        class: "input",
        type: "tel",
        placeholder: "ምሳሌ: 0911223344",
        value: existingSupplier ? (existingSupplier.phone || "") : "",
        style: { width: "100%", boxSizing: "border-box" }
      })
    ]);
    var phoneInp = phoneGroup.querySelector("input");

    // 3. Address
    var addrGroup = el("div", {}, [
      el("label", { style: { display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" } }, "አድራሻ / ከተማ / መጋዘን ቦታ *"),
      el("input", {
        id: "sup-form-addr",
        class: "input",
        type: "text",
        placeholder: "ምሳሌ: መርካቶ፣ አዲስ አበባ ወይም ድሬዳዋ",
        value: existingSupplier ? (existingSupplier.address || "") : "",
        style: { width: "100%", boxSizing: "border-box" }
      })
    ]);
    var addrInp = addrGroup.querySelector("input");

    var errBox = el("div", {
      style: {
        display: "none",
        color: "#dc2626",
        background: "#fef2f2",
        border: "1px solid #fecaca",
        padding: "8px 12px",
        borderRadius: "8px",
        fontSize: "12px",
        fontWeight: "700"
      }
    });

    var submitBtn = el("button", {
      type: "button",
      id: "sup-submit-btn",
      class: "btn btn-primary btn-block",
      style: {
        marginTop: "8px",
        padding: "13px",
        fontSize: "14.5px",
        fontWeight: "800",
        background: "#00b87c",
        borderColor: "#00b87c",
        borderRadius: "10px"
      }
    }, existingSupplier ? "💾 ለውጦችን መዝግብ" : "➕ አስራካቢ መዝግብ");

    submitBtn.addEventListener("click", function () {
      var nameVal = nameInp.value.trim();
      var phoneVal = phoneInp.value.trim();
      var addrVal = addrInp.value.trim();

      if (!nameVal) {
        errBox.textContent = "⚠️ እባክዎ የአስራካቢውን ስም ያስገቡ!";
        errBox.style.display = "block";
        nameInp.focus();
        return;
      }
      if (!phoneVal) {
        errBox.textContent = "⚠️ እባክዎ የስልክ ቁጥር ያስገቡ!";
        errBox.style.display = "block";
        phoneInp.focus();
        return;
      }
      if (!addrVal) {
        errBox.textContent = "⚠️ እባክዎ የአስራካቢውን አድራሻ ያስገቡ!";
        errBox.style.display = "block";
        addrInp.focus();
        return;
      }

      errBox.style.display = "none";

      setData(function (data) {
        if (!Array.isArray(data.suppliers)) data.suppliers = [];
        if (existingSupplier) {
          var target = data.suppliers.find(function (s) { return s.id === existingSupplier.id; });
          if (target) {
            target.name = nameVal;
            target.phone = phoneVal;
            target.address = addrVal;
            target.updatedAt = Date.now();
          }
        } else {
          data.suppliers.push({
            id: "sup_" + uid(),
            name: nameVal,
            phone: phoneVal,
            address: addrVal,
            createdAt: Date.now()
          });
        }
        return data;
      });

      showToast(existingSupplier ? "✓ አስራካቢ በተሳካ ሁኔታ ተስተካክሏል" : "✓ አዲስ አስራካቢ በተሳካ ሁኔታ ተመዝግቧል");
      close();
      if (typeof onSaved === "function") onSaved();
    });

    formCard.appendChild(nameGroup);
    formCard.appendChild(phoneGroup);
    formCard.appendChild(addrGroup);
    formCard.appendChild(errBox);
    formCard.appendChild(submitBtn);

    body.appendChild(formCard);
  }, null);
}

// ============================================================================
// 🚛 የዕቃ አስራካቢዎች መረጃ - 3-PAGE NAVIGATION STRUCTURE
// ============================================================================

var ETH_12_MONTHS = ["መስከረም", "ጥቅምት", "ህዳር", "ታህሳስ", "ጥር", "የካቲት", "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሀምሌ", "ነሐሴ"];

function getShipmentDateParts(s) {
  var rawDate = s.date || (s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : todayISO());
  var dt = new Date(rawDate.indexOf("T") !== -1 ? rawDate : (rawDate + "T00:00:00"));
  var eth = null;
  try {
    eth = gregorianToEthiopian(dt);
  } catch (e) {}

  var gregYear = isNaN(dt.getTime()) ? 2026 : dt.getFullYear();
  var gregMonth = isNaN(dt.getTime()) ? 9 : (dt.getMonth() + 1);
  var gregDay = isNaN(dt.getTime()) ? 1 : dt.getDate();

  return {
    raw: rawDate,
    ethYear: eth ? eth.year : (gregYear - 7),
    ethMonth: eth ? eth.month : gregMonth,
    ethDay: eth ? eth.day : gregDay,
    gregYear: gregYear,
    gregMonth: gregMonth,
    gregDay: gregDay
  };
}

function getSupplierMetrics(supplier, yearFilter) {
  var allDeliveries = getShipmentsForSupplier(supplier);
  var deliveries = allDeliveries;
  if (yearFilter) {
    deliveries = allDeliveries.filter(function (d) {
      var dp = getShipmentDateParts(d);
      return dp.ethYear === yearFilter || dp.gregYear === yearFilter;
    });
  }

  var totalPurchasedCents = deliveries.reduce(function (sum, d) { return sum + (d.totalCostCents || 0); }, 0);
  
  var totalProfitCents = deliveries.reduce(function (sum, d) {
    if (typeof d.expectedProfitCents === "number" && d.expectedProfitCents !== 0) {
      return sum + d.expectedProfitCents;
    }
    var items = Array.isArray(d.items) ? d.items : [];
    var iProfit = items.reduce(function (isum, it) {
      var sell = it.sellPriceCents || 0;
      var landed = it.landedCostCents || it.costPriceCents || 0;
      var usable = it.netQty !== undefined ? it.netQty : Math.max(0, (it.qty || 0) - (it.damaged || 0));
      var p = sell > 0 ? (sell - landed) * usable : 0;
      return isum + Math.max(0, p);
    }, 0);
    return sum + iProfit;
  }, 0);

  // Credit balance
  var sName = (supplier.name || "").trim().toLowerCase();
  var payables = Array.isArray(state.data.accountsPayable) ? state.data.accountsPayable : [];
  var apCredit = payables.filter(function (ap) {
    var apSup = (ap.supplier || "").trim().toLowerCase();
    var matchSup = (supplier.id && ap.supplierId === supplier.id) || (sName && apSup === sName);
    if (!matchSup) return false;
    if (yearFilter && ap.date) {
      var yr = parseInt(ap.date.slice(0, 4), 10);
      return yr === yearFilter || (yr - 7) === yearFilter;
    }
    return true;
  }).reduce(function (sum, ap) {
    var rem = ap.remainingCents !== undefined ? ap.remainingCents : (ap.creditCents || 0);
    return sum + rem;
  }, 0);

  var totalCreditCents = apCredit > 0 ? apCredit : deliveries.reduce(function (sum, d) {
    return (d.isCreditPurchase || (d.creditAmountCents && d.creditAmountCents > 0)) ? sum + (d.creditAmountCents || 0) : sum;
  }, 0);

  // Damaged items & loss
  var totalDamagedPieces = deliveries.reduce(function (sum, d) { return sum + (d.damagedPieces || 0); }, 0);
  var totalDamagedLossCents = deliveries.reduce(function (sum, d) {
    var items = Array.isArray(d.items) ? d.items : [];
    return sum + items.reduce(function (isum, it) {
      var dCount = Number(it.damaged) || 0;
      var cPrice = it.costPriceCents || 0;
      return isum + (dCount * cPrice);
    }, 0);
  }, 0);

  var totalPieces = deliveries.reduce(function (sum, d) {
    return sum + (d.totalPieces || (d.qty || 0));
  }, 0);

  return {
    deliveries: deliveries,
    deliveryCount: deliveries.length,
    totalPurchasedCents: totalPurchasedCents,
    totalProfitCents: totalProfitCents,
    totalCreditCents: totalCreditCents,
    totalDamagedPieces: totalDamagedPieces,
    totalDamagedLossCents: totalDamagedLossCents,
    totalPieces: totalPieces
  };
}

// ----------------------------------------------------------------------------
// Year Picker Modal Dialog
// ----------------------------------------------------------------------------
function openYearPickerModal(currentYear, onSelectYear) {
  var overlay = el("div", {
    class: "overlay",
    style: {
      zIndex: "10000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)",
      background: "rgba(15, 23, 42, 0.5)"
    }
  });

  function close() { overlay.remove(); }
  var bg = el("div", { class: "overlay-bg", onclick: close });
  overlay.appendChild(bg);

  var years = [2014, 2015, 2016, 2017, 2018, 2019, 2020];

  var modalCard = el("div", {
    class: "card",
    style: {
      position: "relative",
      zIndex: "10001",
      maxWidth: "360px",
      width: "100%",
      padding: "20px",
      background: "#ffffff",
      borderRadius: "16px",
      boxShadow: "0 20px 25px -5px rgba(0,0,0,.3)",
      textAlign: "center"
    }
  }, [
    el("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "16px"
      }
    }, [
      el("div", { style: { fontSize: "16px", fontWeight: "900", color: "#1e1b4b" } }, "📅 ዓመተ ምህረት ይምረጡ"),
      el("button", {
        type: "button",
        style: {
          background: "transparent",
          border: "none",
          fontSize: "18px",
          fontWeight: "900",
          cursor: "pointer",
          color: "#64748b"
        },
        onclick: close
      }, "✕")
    ]),
    el("p", { style: { fontSize: "13px", color: "#64748b", marginBottom: "16px", textAlign: "left" } },
      "የአስረካቢውን የዕቃ መረጃ ለማየት የሚፈልጉትን ዓመት ይምረጡ፦")
  ]);

  var yearGrid = el("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "10px",
      marginBottom: "16px"
    }
  });

  years.forEach(function (y) {
    var isSelected = (y === currentYear);
    var btn = el("button", {
      type: "button",
      style: {
        background: isSelected ? "#4338ca" : "#f1f5f9",
        color: isSelected ? "#ffffff" : "#1e293b",
        border: isSelected ? "2px solid #312e81" : "1px solid #cbd5e1",
        borderRadius: "10px",
        padding: "10px 4px",
        fontSize: "14px",
        fontWeight: "900",
        cursor: "pointer",
        transition: "all 0.15s ease"
      },
      onclick: function () {
        close();
        if (typeof onSelectYear === "function") onSelectYear(y);
      }
    }, String(y));

    if (!isSelected) {
      btn.addEventListener("mouseenter", function () { btn.style.background = "#e2e8f0"; });
      btn.addEventListener("mouseleave", function () { btn.style.background = "#f1f5f9"; });
    }

    yearGrid.appendChild(btn);
  });
  modalCard.appendChild(yearGrid);

  // Custom Year Input
  var customWrap = el("div", {
    style: {
      display: "flex",
      gap: "8px",
      alignItems: "center"
    }
  });
  var customInp = el("input", {
    type: "number",
    placeholder: "ሌላ ዓመት (ምሳሌ፡ 2013)",
    style: {
      flex: "1",
      padding: "9px 12px",
      border: "1px solid #cbd5e1",
      borderRadius: "8px",
      fontSize: "13px",
      outline: "none"
    }
  });
  var customBtn = el("button", {
    type: "button",
    style: {
      background: "#10b981",
      color: "#ffffff",
      border: "none",
      borderRadius: "8px",
      padding: "9px 16px",
      fontWeight: "800",
      fontSize: "13px",
      cursor: "pointer"
    },
    onclick: function () {
      var val = parseInt(customInp.value.trim(), 10);
      if (val && val >= 1900 && val <= 2100) {
        close();
        if (typeof onSelectYear === "function") onSelectYear(val);
      } else {
        showToast("እባክዎ ትክክለኛ ዓመት ያስገቡ");
      }
    }
  }, "ምረጥ");

  customWrap.appendChild(customInp);
  customWrap.appendChild(customBtn);
  modalCard.appendChild(customWrap);

  overlay.appendChild(modalCard);
  document.querySelector(".app").appendChild(overlay);
}

// ----------------------------------------------------------------------------
// Item Credit Payment Modal ("የብር ሁኔታ" Settlement)
// ----------------------------------------------------------------------------
function openItemCreditPaymentModal(supplier, item, year, monthIndex, monthName, onComplete) {
  var overlay = el("div", {
    class: "overlay",
    style: {
      zIndex: "10000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)",
      background: "rgba(15, 23, 42, 0.5)"
    }
  });

  function close() { overlay.remove(); }
  var bg = el("div", { class: "overlay-bg", onclick: close });
  overlay.appendChild(bg);

  var itemQty = Number(item.qty) || 0;
  var itemCost = Number(item.costPrice) || 750000;
  var estimatedCredit = item.soldTotal ? Number(item.soldTotal) : (itemCost * itemQty);

  var modalEl = el("div", {
    class: "card",
    style: {
      position: "relative",
      zIndex: "10001",
      maxWidth: "400px",
      width: "100%",
      padding: "22px 20px",
      background: "#ffffff",
      borderRadius: "16px",
      boxShadow: "0 20px 25px -5px rgba(0,0,0,.3)",
      textAlign: "left"
    }
  });

  // Modal Header
  var mHeader = el("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "14px",
      borderBottom: "1px solid #f1f5f9",
      paddingBottom: "10px"
    }
  }, [
    el("div", {
      style: {
        fontSize: "16px",
        fontWeight: "900",
        color: "#1e1b4b",
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }
    }, [
      el("span", {}, "💳"),
      el("span", {}, "የዕቃ ዱቤ ክፍያ ማወራረጃ")
    ]),
    el("button", {
      type: "button",
      style: {
        background: "transparent",
        border: "none",
        fontSize: "18px",
        fontWeight: "900",
        cursor: "pointer",
        color: "#64748b"
      },
      onclick: close
    }, "✕")
  ]);
  modalEl.appendChild(mHeader);

  // Item Info Details Card
  var itemCard = el("div", {
    style: {
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      borderRadius: "10px",
      padding: "12px 14px",
      marginBottom: "16px"
    }
  }, [
    el("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "6px" } }, [
      el("span", { style: { fontSize: "13px", color: "#64748b", fontWeight: "700" } }, "የዕቃው ስም / ኮድ፦"),
      el("span", { style: { fontSize: "14px", fontWeight: "900", color: "#0f172a" } }, (item.name || "ዕቃ") + " (" + (item.code || "ኮድ") + ")")
    ]),
    el("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "6px" } }, [
      el("span", { style: { fontSize: "13px", color: "#64748b", fontWeight: "700" } }, "ብዛት፦"),
      el("span", { style: { fontSize: "13.5px", fontWeight: "800", color: "#0f172a" } }, itemQty + " ፍሬ")
    ]),
    el("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "6px" } }, [
      el("span", { style: { fontSize: "13px", color: "#64748b", fontWeight: "700" } }, "የተገዛበት / ዱቤ ዋጋ፦"),
      el("span", { style: { fontSize: "14px", fontWeight: "900", color: "#dc2626" } }, fmt(estimatedCredit))
    ]),
    el("div", { style: { display: "flex", justifyContent: "space-between" } }, [
      el("span", { style: { fontSize: "13px", color: "#64748b", fontWeight: "700" } }, "የአሁን ሁኔታ፦"),
      el("span", {
        style: {
          fontSize: "12px",
          fontWeight: "800",
          color: "#b91c1c",
          background: "#fee2e2",
          padding: "2px 8px",
          borderRadius: "6px"
        }
      }, item.paymentStatus || "ዱቤ")
    ])
  ]);
  modalEl.appendChild(itemCard);

  // Settlement Form Fields
  var amountGroup = el("div", { style: { marginBottom: "14px" } }, [
    el("label", { style: { display: "block", fontSize: "12.5px", fontWeight: "800", color: "#334155", marginBottom: "6px" } },
      "የሚከፈለው የገንዘብ መጠን (ብር)፦"),
    el("input", {
      type: "number",
      value: String(Math.round(estimatedCredit / 100)),
      id: "creditSettleAmtInput",
      style: {
        width: "100%",
        padding: "10px 12px",
        border: "1.5px solid #cbd5e1",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: "800",
        color: "#0f172a",
        outline: "none"
      }
    })
  ]);
  modalEl.appendChild(amountGroup);

  // Payment Method Selection
  var methodGroup = el("div", { style: { marginBottom: "18px" } }, [
    el("label", { style: { display: "block", fontSize: "12.5px", fontWeight: "800", color: "#334155", marginBottom: "6px" } },
      "የክፍያ ዘዴ፦")
  ]);

  var methods = [
    { id: "cash", label: "💵 ጥሬ ገንዘብ" },
    { id: "cbe", label: "🏦 ሲቢኢ / ባንክ" },
    { id: "telebirr", label: "📱 ቴሌብር" }
  ];
  var selectedMethod = "cash";
  var methodButtonsRow = el("div", { style: { display: "flex", gap: "8px" } });

  methods.forEach(function (m) {
    var mBtn = el("button", {
      type: "button",
      style: {
        flex: "1",
        padding: "8px 4px",
        borderRadius: "8px",
        border: m.id === selectedMethod ? "2px solid #4338ca" : "1px solid #cbd5e1",
        background: m.id === selectedMethod ? "#e0e7ff" : "#ffffff",
        color: m.id === selectedMethod ? "#3730a3" : "#475569",
        fontSize: "12px",
        fontWeight: "800",
        cursor: "pointer",
        textAlign: "center"
      },
      onclick: function () {
        selectedMethod = m.id;
        Array.from(methodButtonsRow.children).forEach(function (child, idx) {
          var isMatch = methods[idx].id === selectedMethod;
          child.style.border = isMatch ? "2px solid #4338ca" : "1px solid #cbd5e1";
          child.style.background = isMatch ? "#e0e7ff" : "#ffffff";
          child.style.color = isMatch ? "#3730a3" : "#475569";
        });
      }
    }, m.label);
    methodButtonsRow.appendChild(mBtn);
  });
  methodGroup.appendChild(methodButtonsRow);
  modalEl.appendChild(methodGroup);

  // Action Buttons (Confirm Settle vs Cancel)
  var actionsRow = el("div", {
    style: {
      display: "flex",
      gap: "10px",
      marginTop: "16px"
    }
  }, [
    el("button", {
      type: "button",
      style: {
        flex: "1",
        padding: "11px",
        background: "#f1f5f9",
        color: "#475569",
        border: "1px solid #cbd5e1",
        borderRadius: "8px",
        fontWeight: "800",
        fontSize: "13px",
        cursor: "pointer"
      },
      onclick: close
    }, "ይቅር / ተመለስ"),
    el("button", {
      type: "button",
      style: {
        flex: "2",
        padding: "11px",
        background: "#10b981",
        color: "#ffffff",
        border: "none",
        borderRadius: "8px",
        fontWeight: "900",
        fontSize: "13.5px",
        cursor: "pointer",
        boxShadow: "0 4px 6px -1px rgba(16, 185, 129, 0.3)"
      },
      onclick: function () {
        // Update item payment status
        item.paymentStatus = "የተከፈለ";
        item.settledAt = Date.now();
        item.settleMethod = selectedMethod;

        // Persist change if it exists in state shipments
        setData(function (data) {
          if (Array.isArray(data.shipments)) {
            data.shipments.forEach(function (sh) {
              if (Array.isArray(sh.items)) {
                sh.items.forEach(function (it) {
                  if ((it.name === item.name && it.code === item.code) || it.id === item.id) {
                    it.paymentStatus = "የተከፈለ";
                    it.paid = true;
                  }
                });
              }
            });
          }
          return data;
        });

        showToast("✓ የ" + (item.name || "ዕቃው") + " ዱቤ ክፍያ በተሳካ ሁኔታ ተከፍሏል!");
        close();
        if (typeof onComplete === "function") onComplete();
      }
    }, "✓ ክፍያ ፈጽም (የተከፈለ አድርግ)")
  ]);
  modalEl.appendChild(actionsRow);

  overlay.appendChild(modalEl);
  document.querySelector(".app").appendChild(overlay);
}

// ----------------------------------------------------------------------------
// PAGE 1: Main Suppliers List (የአስረካቢዎች መረጃ - Image 3)
// ----------------------------------------------------------------------------
function openSuppliersDirectorySheet(opts) {
  // Pass null as title to eliminate redundant outer sheet-header bar
  openSheet(null, function (body, close) {
    // Custom Canva Top Header Banner
    var headerBanner = el("div", {
      style: {
        background: "#d4d4d8",
        borderRadius: "8px",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        marginBottom: "14px"
      }
    }, [
      el("button", {
        type: "button",
        style: {
          position: "absolute",
          left: "12px",
          background: "transparent",
          border: "none",
          fontSize: "20px",
          fontWeight: "900",
          color: "#000000",
          cursor: "pointer",
          padding: "2px 6px"
        },
        onclick: function () { close(); }
      }, "←"),
      el("div", {
        style: {
          fontSize: "15px",
          fontWeight: "900",
          color: "#000000",
          letterSpacing: "0.2px"
        }
      }, "የአስረካቢዎች መረጃ")
    ]);
    body.appendChild(headerBanner);

    // Search input + Green (+) pill Add Button
    var searchRow = el("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        marginBottom: "16px"
      }
    });

    var searchInput = el("input", {
      type: "text",
      placeholder: "በስም /በስልክ ፈልግ",
      style: {
        flex: "1",
        background: "#d4d4d8",
        border: "none",
        borderRadius: "8px",
        padding: "10px 14px",
        fontSize: "13.5px",
        color: "#18181b",
        fontWeight: "600",
        outline: "none"
      }
    });

    var addSupplierBtn = el("button", {
      type: "button",
      title: "አዲስ አስራካቢ ጨምር",
      style: {
        background: "#10b981",
        border: "none",
        borderRadius: "20px",
        width: "56px",
        height: "36px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
        fontSize: "22px",
        fontWeight: "900",
        cursor: "pointer",
        flexShrink: 0
      }
    }, "+");

    addSupplierBtn.addEventListener("click", function () {
      openSupplierFormModal(null, function () {
        renderList();
      });
    });

    searchRow.appendChild(searchInput);
    searchRow.appendChild(addSupplierBtn);
    body.appendChild(searchRow);

    // Suppliers List Table Container with Horizontal ScrollView
    var tableWrap = el("div", {
      style: {
        width: "100%",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        marginBottom: "30px",
        borderRadius: "8px",
        border: "1px solid #e2e8f0"
      }
    });
    body.appendChild(tableWrap);

    function renderList() {
      clear(tableWrap);
      if (!Array.isArray(state.data.suppliers)) {
        state.data.suppliers = [];
      }
      var currentSuppliers = state.data.suppliers;

      var q = searchInput.value.trim().toLowerCase();
      var filtered = currentSuppliers.filter(function (s) {
        if (!q) return true;
        var n = (s.name || "").toLowerCase();
        var p = (s.phone || "").toLowerCase().replace(/\s+/g, "");
        var a = (s.address || "").toLowerCase();
        return n.indexOf(q) !== -1 || p.indexOf(q) !== -1 || a.indexOf(q) !== -1;
      });

      if (filtered.length === 0) {
        tableWrap.appendChild(el("div", {
          style: {
            padding: "30px 16px",
            textAlign: "center",
            color: "#64748b",
            fontSize: "14px",
            fontWeight: "700"
          }
        }, "ምንም የተመዘገበ አስረካቢ የለም"));
        return;
      }

      var table = el("table", {
        style: {
          width: "100%",
          minWidth: "480px",
          borderCollapse: "collapse",
          background: "#ffffff"
        }
      });

      var tbody = el("tbody");
      filtered.forEach(function (sup) {
        var tr = el("tr", {
          style: {
            borderBottom: "1px solid #e2e8f0",
            cursor: "pointer",
            transition: "background 0.15s ease"
          }
        });

        tr.addEventListener("mouseenter", function () { tr.style.background = "#f8fafc"; });
        tr.addEventListener("mouseleave", function () { tr.style.background = "transparent"; });
        tr.addEventListener("click", function () {
          close();
          openSupplierProfileSheet(sup, function () {
            openSuppliersDirectorySheet();
          });
        });

        // 1. Name Column (Single-line, no overlap)
        tr.appendChild(el("td", {
          style: {
            padding: "13px 14px",
            fontWeight: "800",
            fontSize: "14px",
            color: "#000000",
            borderRight: "1px solid #e2e8f0",
            whiteSpace: "nowrap",
            minWidth: "140px"
          }
        }, sup.name || "-"));

        // 2. Phone Column (Single-line, no overlap)
        tr.appendChild(el("td", {
          style: {
            padding: "13px 14px",
            fontWeight: "800",
            fontSize: "13.5px",
            color: "#000000",
            borderRight: "1px solid #e2e8f0",
            whiteSpace: "nowrap",
            minWidth: "120px"
          }
        }, sup.phone || "-"));

        // 3. Location / Address Tag (Single-line, no overlap)
        tr.appendChild(el("td", {
          style: {
            padding: "13px 14px",
            fontWeight: "700",
            fontSize: "13px",
            color: "#000000",
            borderRight: "1px solid #e2e8f0",
            textAlign: "center",
            whiteSpace: "nowrap",
            minWidth: "120px"
          }
        }, sup.address || "አዳማ"));

        // 4. Action Arrow (>)
        tr.appendChild(el("td", {
          style: {
            padding: "13px 10px",
            fontWeight: "900",
            fontSize: "18px",
            color: "#475569",
            textAlign: "center",
            width: "44px",
            minWidth: "44px"
          }
        }, ">"));

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      tableWrap.appendChild(table);
    }

    searchInput.addEventListener("input", renderList);
    renderList();
  }, null, true, opts);
}

// ----------------------------------------------------------------------------
// PAGE 2: Supplier Detail, 4 Stat Summary Cards & Months Selector (Image 2)
// ----------------------------------------------------------------------------
function openSupplierProfileSheet(supplier, onBack) {
  // Pass null as title to eliminate redundant outer sheet-header bar
  openSheet(null, function (body, close) {
    var initialEthYear = 2017;
    try {
      var curEth = gregorianToEthiopian(new Date());
      if (curEth && curEth.year) {
        initialEthYear = curEth.year;
      }
    } catch (e) {}
    var selectedYear = initialEthYear;

    // Custom Top Header Banner
    var headerBanner = el("div", {
      style: {
        background: "#d4d4d8",
        borderRadius: "8px",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        marginBottom: "12px"
      }
    }, [
      el("button", {
        type: "button",
        style: {
          position: "absolute",
          left: "12px",
          background: "transparent",
          border: "none",
          fontSize: "20px",
          fontWeight: "900",
          color: "#000000",
          cursor: "pointer",
          padding: "2px 6px"
        },
        onclick: function () {
          close();
          if (typeof onBack === "function") onBack();
          else openSuppliersDirectorySheet();
        }
      }, "←"),
      el("div", {
        style: {
          fontSize: "14.5px",
          fontWeight: "900",
          color: "#000000",
          letterSpacing: "0.2px"
        }
      }, "የአስረካቢዎች ዝርዝር የዕቃ መረጃ")
    ]);
    body.appendChild(headerBanner);

    // Supplier Identity Row (Grey rounded container)
    var identityRow = el("div", {
      style: {
        background: "#dcdcdc",
        borderRadius: "8px",
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "14px"
      }
    }, [
      // Left: Profile Circle + Name
      el("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "10px"
        }
      }, [
        el("div", {
          style: {
            width: "30px",
            height: "30px",
            borderRadius: "50%",
            background: "#000000",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "15px",
            fontWeight: "900"
          }
        }, "👤"),
        el("div", {
          style: {
            fontSize: "15px",
            fontWeight: "900",
            color: "#000000"
          }
        }, supplier.name || "ረቢ ሰራጅ")
      ]),

      // Right: Edit Pen + Delete Trash
      el("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "16px"
        }
      }, [
        el("button", {
          type: "button",
          title: "አስራካቢ አስተካክል",
          style: {
            background: "transparent",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            color: "#000000",
            padding: "2px"
          },
          onclick: function () {
            openSupplierFormModal(supplier, function () {
              close();
              var curSups = state.data.suppliers || [];
              var refreshed = curSups.find(function (x) { return x.id === supplier.id; }) || supplier;
              openSupplierProfileSheet(refreshed, onBack);
            });
          }
        }, "✏️"),
        el("button", {
          type: "button",
          title: "አስራካቢ ሰርዝ",
          style: {
            background: "transparent",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            color: "#000000",
            padding: "2px"
          },
          onclick: function () {
            confirmModal("አስራካቢ '" + supplier.name + "' ከዝርዝር ውስጥ ይሰረዝ?", function () {
              setData(function (data) {
                if (Array.isArray(data.suppliers)) {
                  data.suppliers = data.suppliers.filter(function (x) { return x.id !== supplier.id; });
                }
                return data;
              });
              showToast("✓ አስራካቢ በተሳካ ሁኔታ ተሰርዟል");
              close();
              if (typeof onBack === "function") onBack();
              else openSuppliersDirectorySheet();
            }, null, { title: "🗑️ አስራካቢ ማስወገጃ", confirmText: "አዎ፣ ይሰረዝ", cancelText: "ይቅር" });
          }
        }, "🗑️")
      ])
    ]);
    body.appendChild(identityRow);

    // 4 Stat Summary Cards Container (Dynamically updated on Year change)
    var summaryCardsContainer = el("div");
    body.appendChild(summaryCardsContainer);

    function renderSummaryCards() {
      clear(summaryCardsContainer);
      var metrics = getSupplierMetrics(supplier, selectedYear);

      var displayCost = metrics.totalPurchasedCents > 0 ? fmt(metrics.totalPurchasedCents) : "0.00 ብር";
      var displayPieces = (metrics.totalPieces || 0) + " ፍሬ";
      var displayProfit = metrics.totalProfitCents > 0 ? fmt(metrics.totalProfitCents) : "0.00 ብር";
      var displaySoldPieces = (Math.max(0, (metrics.totalPieces || 0) - (metrics.totalDamagedPieces || 0))) + " ፍሬ";
      var displayCredit = metrics.totalCreditCents > 0 ? fmt(metrics.totalCreditCents) : "0.00 ብር";
      var displayDamagedPieces = (metrics.totalDamagedPieces || 0) + " ፍሬ";
      var displayDamagedCost = metrics.totalDamagedLossCents > 0 ? fmt(metrics.totalDamagedLossCents) : "0.00 ብር";

      var summaryGrid = el("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px",
          marginBottom: "16px"
        }
      }, [
        // Top-Left Card: ጠቅላላ የዕቃ ግዢ ዋጋ
        el("div", {
          style: {
            background: "#dcdcdc",
            borderRadius: "8px",
            padding: "12px 10px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minHeight: "84px"
          }
        }, [
          el("div", { style: { fontSize: "11.5px", fontWeight: "700", color: "#000000" } }, "ጠቅላላ የዕቃ ግዢ ዋጋ"),
          el("div", { style: { fontSize: "12.5px", fontWeight: "800", color: "#000000", marginTop: "4px" } }, displayPieces),
          el("div", { style: { fontSize: "13.5px", fontWeight: "900", color: "#000000", marginTop: "4px" } }, displayCost)
        ]),

        // Top-Right Card: ጠቅላላ የዕቃ ሽያጭ ትርፍ
        el("div", {
          style: {
            background: "#dcdcdc",
            borderRadius: "8px",
            padding: "12px 10px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minHeight: "84px"
          }
        }, [
          el("div", { style: { fontSize: "11.5px", fontWeight: "700", color: "#000000" } }, "ጠቅላላ የዕቃ ሽያጭ ትርፍ"),
          el("div", { style: { fontSize: "12.5px", fontWeight: "800", color: "#000000", marginTop: "4px" } }, displaySoldPieces),
          el("div", { style: { fontSize: "13.5px", fontWeight: "900", color: "#000000", marginTop: "4px" } }, displayProfit)
        ]),

        // Bottom-Left Card: ጠቅላላ የዕቃ ዱቤ የተገዛ
        el("div", {
          style: {
            background: "#dcdcdc",
            borderRadius: "8px",
            padding: "12px 10px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minHeight: "84px"
          }
        }, [
          el("div", { style: { fontSize: "11.5px", fontWeight: "700", color: "#000000" } }, "ጠቅላላ የዕቃ ዱቤ የተገዛ"),
          el("div", { style: { fontSize: "14px", fontWeight: "900", color: "#000000", marginTop: "4px" } }, displayCredit),
          el("div", { style: { fontSize: "11px", fontWeight: "700", color: "#1e293b", marginTop: "4px" } }, "ያልተከፈለ :- " + displayCredit)
        ]),

        // Bottom-Right Card: የተበላሹ እቃዎች
        el("div", {
          style: {
            background: "#dcdcdc",
            borderRadius: "8px",
            padding: "12px 10px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minHeight: "84px"
          }
        }, [
          el("div", { style: { fontSize: "11.5px", fontWeight: "700", color: "#000000" } }, "የተበላሹ እቃዎች"),
          el("div", { style: { fontSize: "12.5px", fontWeight: "800", color: "#000000", marginTop: "4px" } }, displayDamagedPieces),
          el("div", { style: { fontSize: "13.5px", fontWeight: "900", color: "#000000", marginTop: "4px" } }, displayDamagedCost)
        ])
      ]);
      summaryCardsContainer.appendChild(summaryGrid);
    }
    renderSummaryCards();

    // Month Selector Header Row (With Dynamic Clickable Year Picker)
    var yearPickerBtn = el("button", {
      type: "button",
      title: "ዓመተ ምህረት ለመምረጥ እዚህ ይጫኑ",
      style: {
        fontSize: "12.5px",
        fontWeight: "900",
        color: "#000000",
        background: "#e4e4e7",
        border: "1px solid #cbd5e1",
        borderRadius: "8px",
        padding: "5px 10px",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px"
      },
      onclick: function () {
        openYearPickerModal(selectedYear, function (chosenYear) {
          selectedYear = chosenYear;
          yearPickerBtn.textContent = "አመታትን ይምረጡ :- (" + selectedYear + ") ▾";
          renderSummaryCards();
          renderMonths();
        });
      }
    }, "አመታትን ይምረጡ :- (" + selectedYear + ") ▾");

    var monthHeaderRow = el("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "12px",
        marginTop: "10px"
      }
    }, [
      // Purple Badge Kicker
      el("div", {
        style: {
          background: "#5b51d8",
          color: "#ffffff",
          borderRadius: "14px",
          padding: "4px 14px",
          fontSize: "11px",
          fontWeight: "800"
        }
      }, "እቃዎች የተላኩበት ወቅት"),

      // Clickable Year Button
      yearPickerBtn
    ]);
    body.appendChild(monthHeaderRow);

    // 3 Columns of Month Pills Container
    var monthsContainer = el("div", {
      style: {
        display: "flex",
        gap: "10px",
        marginBottom: "20px"
      }
    });
    body.appendChild(monthsContainer);

    var col1Months = [
      { name: "መስከረም", idx: 1 },
      { name: "ጥቅምት", idx: 2 },
      { name: "ህዳር", idx: 3 },
      { name: "ታህሳስ", idx: 4 },
      { name: "ጥር", idx: 5 }
    ];
    var col2Months = [
      { name: "የካቲት", idx: 6 },
      { name: "መጋቢት", idx: 7 },
      { name: "ሚያዚያ", idx: 8 },
      { name: "ግንቦት", idx: 9 },
      { name: "ሰኔ", idx: 10 }
    ];
    var col3Months = [
      { name: "ሀምሌ", idx: 11 },
      { name: "ጳጉሜ", idx: 13 },
      { name: "ነሀሴ", idx: 12 }
    ];

    function createMonthColumn(monthList) {
      var col = el("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          flex: "1"
        }
      });

      monthList.forEach(function (m) {
        var btn = el("button", {
          type: "button",
          style: {
            background: "#ffffff",
            border: "2px solid #2d24b2",
            borderRadius: "8px",
            padding: "6px 6px",
            color: "#000000",
            fontSize: "12.5px",
            fontWeight: "800",
            textAlign: "center",
            cursor: "pointer",
            width: "100%",
            transition: "all 0.15s ease"
          },
          onclick: function () {
            close();
            openSupplierMonthlyDetailSheet(supplier, selectedYear, m.idx, m.name, function () {
              openSupplierProfileSheet(supplier, onBack);
            });
          }
        }, m.name);

        btn.addEventListener("mouseenter", function () { btn.style.background = "#eff6ff"; });
        btn.addEventListener("mouseleave", function () { btn.style.background = "#ffffff"; });

        col.appendChild(btn);
      });

      return col;
    }

    function renderMonths() {
      clear(monthsContainer);
      monthsContainer.appendChild(createMonthColumn(col1Months));
      monthsContainer.appendChild(createMonthColumn(col2Months));
      monthsContainer.appendChild(createMonthColumn(col3Months));
    }
    renderMonths();

    // Bottom Contact Action Icons (Message & Phone)
    var hasPhone = Boolean(supplier.phone && supplier.phone.trim());
    var contactRow = el("div", {
      style: {
        borderTop: "1px solid #d1d5db",
        paddingTop: "16px",
        display: "flex",
        alignItems: "center",
        gap: "24px",
        paddingLeft: "6px",
        marginBottom: "20px"
      }
    }, [
      // Message bubble
      el("a", {
        href: hasPhone ? ("sms:" + supplier.phone.trim()) : "#",
        title: "መልእክት ላክ (SMS)",
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "48px",
          height: "32px",
          borderRadius: "16px",
          border: "2px solid #000000",
          color: "#000000",
          fontSize: "16px",
          textDecoration: "none",
          cursor: hasPhone ? "pointer" : "not-allowed"
        },
        onclick: function (e) {
          if (!hasPhone) {
            e.preventDefault();
            showToast("ለዚህ አስራካቢ ስልክ ቁጥር አልተመዘገበም");
          }
        }
      }, "💬"),

      // Circular Phone
      el("a", {
        href: hasPhone ? ("tel:" + supplier.phone.trim()) : "#",
        title: "ደውል",
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          border: "2px solid #000000",
          color: "#000000",
          fontSize: "16px",
          textDecoration: "none",
          cursor: hasPhone ? "pointer" : "not-allowed"
        },
        onclick: function (e) {
          if (!hasPhone) {
            e.preventDefault();
            showToast("ለዚህ አስራካቢ ስልክ ቁጥር አልተመዘገበም");
          }
        }
      }, "📞")
    ]);
    body.appendChild(contactRow);
  }, null, true);
}

// ----------------------------------------------------------------------------
// PAGE 3: Monthly Detailed Table & Cards (Image 1)
// ----------------------------------------------------------------------------
function openSupplierMonthlyDetailSheet(supplier, year, monthIndex, monthName, onBack) {
  // Pass null as title to eliminate redundant outer sheet-header bar
  openSheet(null, function (body, close) {
    var curEth = null;
    try {
      curEth = gregorianToEthiopian(new Date());
    } catch (e) {}
    var displayDay = (curEth && curEth.day) ? curEth.day : (new Date().getDate());
    var dateLabel = "ቀን " + displayDay + "/" + monthIndex + "/" + year;

    // Top Dark Blue Header Bar: Left "← ቀን/D/M/YYYY", Right "ወር"
    var topBlueBar = el("div", {
      style: {
        background: "#000099",
        color: "#ffffff",
        padding: "10px 14px",
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "14px"
      }
    }, [
      el("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "14px",
          fontWeight: "900"
        }
      }, [
        el("button", {
          type: "button",
          style: {
            background: "transparent",
            border: "none",
            color: "#ffffff",
            fontSize: "18px",
            fontWeight: "900",
            cursor: "pointer",
            padding: "0 4px"
          },
          onclick: function () {
            close();
            if (typeof onBack === "function") onBack();
            else openSupplierProfileSheet(supplier);
          }
        }, "←"),
        el("span", {}, dateLabel)
      ]),
      el("div", {
        style: {
          fontSize: "15px",
          fontWeight: "900",
          letterSpacing: "0.5px"
        }
      }, monthName || "መስከረም")
    ]);
    body.appendChild(topBlueBar);

    var cardsWrapper = el("div");
    body.appendChild(cardsWrapper);

    var tableWrap = el("div", {
      style: {
        width: "100%",
        overflowX: "auto",
        marginBottom: "30px",
        WebkitOverflowScrolling: "touch"
      }
    });
    body.appendChild(tableWrap);

    // Dynamic month items retrieval & calculation from actual shipments
    var allDeliveries = getShipmentsForSupplier(supplier);
    var monthDeliveries = allDeliveries.filter(function (s) {
      var dp = getShipmentDateParts(s);
      var yearMatch = (dp.ethYear === year || dp.gregYear === year);
      var monthMatch = (dp.ethMonth === monthIndex || dp.gregMonth === monthIndex);
      return yearMatch && monthMatch;
    });

    var flatItems = [];
    if (monthDeliveries.length > 0) {
      monthDeliveries.forEach(function (s) {
        var items = Array.isArray(s.items) && s.items.length > 0 ? s.items : [];
        items.forEach(function (it) {
          var itQty = Number(it.qty) || 0;
          var itDamaged = Number(it.damaged) || 0;
          var itCost = Number(it.costPriceCents) || 0;
          var itSell = Number(it.sellPriceCents) || 0;
          var usableQty = Math.max(0, itQty - itDamaged);
          var itSold = Number(it.soldTotalCents) || (itSell * usableQty) || 0;
          var itProfit = Number(it.profitCents) || (itSell > 0 ? Math.max(0, (itSell - itCost) * usableQty) : 0);
          var dp = getShipmentDateParts(s);

          flatItems.push({
            id: it.id || ("it_" + uid()),
            day: it.day || String(dp.ethDay || dp.gregDay || 1),
            name: it.name || "ዕቃ",
            code: it.code || "-",
            qty: itQty,
            damaged: itDamaged,
            costPrice: itCost,
            soldTotal: itSold,
            profit: itProfit,
            paymentStatus: it.paymentStatus || (it.paid ? "የተከፈለ" : (s.isCreditPurchase || s.creditAmountCents > 0 ? "ዱቤ ከፋይ" : "የተከፈለ"))
          });
        });
      });
    }

    function renderMonthlyView() {
      // Calculate active metrics
      var totalMonthPurchasedCents = 0;
      var totalMonthProfitCents = 0;
      var totalMonthDamaged = 0;
      var totalMonthCreditCents = 0;
      var totalMonthDamagedLossCents = 0;

      flatItems.forEach(function (item) {
        var itQty = Number(item.qty) || 0;
        var itDamaged = Number(item.damaged) || 0;
        var itCost = Number(item.costPrice) || 0;
        var itProfit = Number(item.profit) || 0;

        totalMonthPurchasedCents += (itCost * itQty);
        totalMonthProfitCents += itProfit;
        totalMonthDamaged += itDamaged;
        totalMonthDamagedLossCents += (itCost * itDamaged);
        if (item.paymentStatus && item.paymentStatus.indexOf("ዱቤ") !== -1) {
          totalMonthCreditCents += (itCost * itQty);
        }
      });

      // 4 Monthly Summary Cards
      clear(cardsWrapper);
      var mNameLabel = monthName || "መስከረም";
      var cardsGrid = el("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px",
          marginBottom: "16px"
        }
      }, [
        // Card 1: ጠቅላላ የዕቃ ግዢ ዋጋ
        el("div", {
          style: {
            background: "#ffffff",
            borderRadius: "14px",
            padding: "12px 10px",
            textAlign: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            border: "1px solid #f1f5f9",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minHeight: "75px"
          }
        }, [
          el("div", { style: { fontSize: "11px", fontWeight: "700", color: "#000000" } }, "ጠቅላላ የዕቃ ግዢ ዋጋ"),
          el("div", { style: { fontSize: "13px", fontWeight: "900", color: "#000000", marginTop: "4px" } },
            totalMonthPurchasedCents > 0 ? fmt(totalMonthPurchasedCents) : "0.00 ብር")
        ]),

        // Card 2: የ[ወር] የዕቃ ትርፍ
        el("div", {
          style: {
            background: "#ffffff",
            borderRadius: "14px",
            padding: "12px 10px",
            textAlign: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            border: "1px solid #f1f5f9",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minHeight: "75px"
          }
        }, [
          el("div", { style: { fontSize: "11px", fontWeight: "700", color: "#000000" } }, "የ" + mNameLabel + " የዕቃ ትርፍ"),
          el("div", { style: { fontSize: "13px", fontWeight: "900", color: "#000000", marginTop: "4px" } },
            totalMonthProfitCents > 0 ? fmt(totalMonthProfitCents) : "0.00 ብር")
        ]),

        // Card 3: የ[ወር] የተበላሸ እቃ
        el("div", {
          style: {
            background: "#ffffff",
            borderRadius: "14px",
            padding: "12px 10px",
            textAlign: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            border: "1px solid #f1f5f9",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minHeight: "75px"
          }
        }, [
          el("div", { style: { fontSize: "11px", fontWeight: "700", color: "#000000" } }, "የ" + mNameLabel + " የተበላሸ እቃ"),
          el("div", { style: { fontSize: "12.5px", fontWeight: "900", color: "#000000", marginTop: "2px" } },
            totalMonthDamaged + " ፍሬ"),
          el("div", { style: { fontSize: "12px", fontWeight: "700", color: "#000000", marginTop: "2px" } },
            totalMonthDamagedLossCents > 0 ? fmt(totalMonthDamagedLossCents) : "0.00 ብር")
        ]),

        // Card 4: የ[ወር] የዕቃ ዱቤ
        el("div", {
          style: {
            background: "#ffffff",
            borderRadius: "14px",
            padding: "12px 10px",
            textAlign: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            border: "1px solid #f1f5f9",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minHeight: "75px",
            position: "relative"
          }
        }, [
          el("div", { style: { fontSize: "11px", fontWeight: "700", color: "#000000" } }, "የ" + mNameLabel + " የዕቃ ዱቤ"),
          el("div", { style: { fontSize: "13px", fontWeight: "900", color: "#000000", marginTop: "4px" } },
            totalMonthCreditCents > 0 ? fmt(totalMonthCreditCents) : "0.00 ብር"),
          el("span", {
            style: {
              position: "absolute",
              right: "12px",
              fontSize: "16px",
              fontWeight: "900",
              color: "#000000"
            }
          }, ">")
        ])
      ]);
      cardsWrapper.appendChild(cardsGrid);

      // Detailed Table
      clear(tableWrap);
      var table = el("table", {
        style: {
          width: "100%",
          minWidth: "620px",
          borderCollapse: "collapse",
          border: "1.5px solid #000000",
          fontSize: "12px",
          textAlign: "center",
          background: "#ffffff"
        }
      });

      // Headers: [ ቀን | ስም | ኮድ | ብዛት | የተበላሸ | የገዢ ዋጋ | የተሸጠበት | ትርፍ | የብር ሁኔታ ]
      var headerTitles = ["ቀን", "ስም", "ኮድ", "ብዛት", "የተበላሸ", "የገዢ ዋጋ", "የተሸጠበት", "ትርፍ", "የብር ሁኔታ"];
      var trHead = el("tr", { style: { borderBottom: "1.5px solid #000000" } });
      headerTitles.forEach(function (h) {
        trHead.appendChild(el("th", {
          style: {
            border: "1px solid #000000",
            padding: "7px 5px",
            fontSize: "11px",
            fontWeight: "800",
            color: "#000000",
            whiteSpace: "nowrap"
          }
        }, h));
      });
      table.appendChild(el("thead", {}, [trHead]));

      var tbody = el("tbody");
      if (flatItems.length === 0) {
        var emptyTr = el("tr", {}, [
          el("td", {
            colspan: 9,
            style: {
              padding: "30px 16px",
              textAlign: "center",
              color: "#64748b",
              fontSize: "13px",
              fontWeight: "700"
            }
          }, "በ" + (monthName || "ዚህ ወር") + " " + year + " ዓ.ም ለዚህ አስራካቢ የተመዘገበ የዕቃ ጭነት ዝርዝር የለም")
        ]);
        tbody.appendChild(emptyTr);
      } else {
        flatItems.forEach(function (item) {
          var tr = el("tr", { style: { borderBottom: "1px solid #cbd5e1" } });

          // 1. ቀን
          tr.appendChild(el("td", {
            style: { border: "1px solid #cbd5e1", padding: "8px 4px", fontWeight: "900", fontSize: "14px", color: "#000000" }
          }, item.day || "1"));

          // 2. ስም
          tr.appendChild(el("td", {
            style: { border: "1px solid #cbd5e1", padding: "8px 4px", fontWeight: "700", fontSize: "12.5px", color: "#000000", whiteSpace: "nowrap" }
          }, item.name || "-"));

          // 3. ኮድ
          tr.appendChild(el("td", {
            style: { border: "1px solid #cbd5e1", padding: "8px 4px", fontWeight: "900", fontSize: "14px", color: "#000000", whiteSpace: "nowrap" }
          }, item.code || "-"));

          // 4. ብዛት
          tr.appendChild(el("td", {
            style: { border: "1px solid #cbd5e1", padding: "8px 4px", fontWeight: "900", fontSize: "15px", color: "#000000" }
          }, String(item.qty || 0)));

          // 5. የተበላሸ
          tr.appendChild(el("td", {
            style: {
              border: "1px solid #cbd5e1",
              padding: "8px 4px",
              fontWeight: "800",
              fontSize: "13.5px",
              color: item.damaged > 0 ? "#dc2626" : "#000000"
            }
          }, item.damaged > 0 ? String(item.damaged) : "00"));

          // 6. የገዢ ዋጋ
          tr.appendChild(el("td", {
            style: { border: "1px solid #cbd5e1", padding: "8px 4px", fontSize: "11px", fontWeight: "600", color: "#000000", whiteSpace: "nowrap" }
          }, fmt(item.costPrice || 0)));

          // 7. የተሸጠበት
          tr.appendChild(el("td", {
            style: { border: "1px solid #cbd5e1", padding: "8px 4px", fontSize: "11px", fontWeight: "600", color: "#000000", whiteSpace: "nowrap" }
          }, fmt(item.soldTotal || 0)));

          // 8. ትርፍ
          tr.appendChild(el("td", {
            style: { border: "1px solid #cbd5e1", padding: "8px 4px", fontSize: "11px", fontWeight: "700", color: "#000000", whiteSpace: "nowrap" }
          }, fmt(item.profit || 0)));

          // 9. የብር ሁኔታ (Clickable Credit Payment Button if unpaid / ዱቤ)
          var isCredit = Boolean(item.paymentStatus && item.paymentStatus.indexOf("ዱቤ") !== -1);
          var statusTd = el("td", {
            style: {
              border: "1px solid #cbd5e1",
              padding: "6px 4px",
              fontSize: "11px",
              fontWeight: "800",
              whiteSpace: "nowrap"
            }
          });

          if (isCredit) {
            var creditBtn = el("button", {
              type: "button",
              title: "ዱቤ ለመክፈል እዚህ ይጫኑ",
              style: {
                background: "#fee2e2",
                color: "#b91c1c",
                border: "1px solid #f87171",
                borderRadius: "6px",
                padding: "4px 8px",
                fontWeight: "900",
                fontSize: "11px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                transition: "all 0.15s ease",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
              },
              onclick: function (e) {
                e.stopPropagation();
                openItemCreditPaymentModal(supplier, item, year, monthIndex, monthName, function () {
                  renderMonthlyView();
                });
              }
            }, [
              el("span", {}, item.paymentStatus || "ዱቤ ከፋይ"),
              el("span", { style: { fontSize: "10px" } }, "💳")
            ]);
            creditBtn.addEventListener("mouseenter", function () { creditBtn.style.background = "#fca5a5"; });
            creditBtn.addEventListener("mouseleave", function () { creditBtn.style.background = "#fee2e2"; });
            statusTd.appendChild(creditBtn);
          } else {
            var paidBadge = el("span", {
              style: {
                background: "#dcfce7",
                color: "#15803d",
                border: "1px solid #86efac",
                borderRadius: "6px",
                padding: "3px 8px",
                fontWeight: "800",
                fontSize: "11px",
                display: "inline-block"
              }
            }, item.paymentStatus || "የተከፈለ");
            statusTd.appendChild(paidBadge);
          }

          tr.appendChild(statusTd);
          tbody.appendChild(tr);
        });
      }

      table.appendChild(tbody);
      tableWrap.appendChild(table);
    }

    renderMonthlyView();
  }, null, true);
}

// Backward-compatibility alias
var openSupplierDetailSheet = openSupplierProfileSheet;
window.openSuppliersDirectorySheet = openSuppliersDirectorySheet;



function openCustomerDirectorySheet(opts) {
  openSheet("👥 የደበኞች መረጃ ማውጫ", function (body) {
    var customerMap = {};
    (state.data.sales || []).forEach(function (s) {
      var cname = (s.customer || "").trim() || "አጠቃላይ ደንበኛ";
      if (!customerMap[cname]) {
        customerMap[cname] = { name: cname, phone: s.customerPhone || "", totalSpentCents: 0, orderCount: 0, unpaidCreditCents: 0 };
      }
      customerMap[cname].totalSpentCents += (s.totalCents || 0);
      customerMap[cname].orderCount += 1;
      if (s.paymentMethod === "credit" && !s.paid) {
        customerMap[cname].unpaidCreditCents += (s.totalCents || 0);
      }
      if (s.customerPhone && !customerMap[cname].phone) {
        customerMap[cname].phone = s.customerPhone;
      }
    });

    var custList = Object.values(customerMap).sort(function (a, b) { return b.totalSpentCents - a.totalSpentCents; });

    var searchInp = el("input", { class: "input mb3", type: "text", placeholder: "🔍 ደንበኛ በስም ወይም በስልክ ይፈልጉ..." });
    body.appendChild(searchInp);

    var listWrap = el("div", { class: "list-scroll" });

    function renderFiltered(query) {
      clear(listWrap);
      var q = (query || "").trim().toLowerCase();
      var filtered = custList.filter(function (c) {
        return !q || c.name.toLowerCase().indexOf(q) >= 0 || c.phone.indexOf(q) >= 0;
      });

      if (filtered.length === 0) {
        listWrap.appendChild(el("div", { class: "empty" }, "ምንም ደንበኛ አልተገኘም"));
        return;
      }

      filtered.forEach(function (c) {
        var card = el("div", { class: "item-row" });
        var head = el("div", { class: "flex items-center justify-between" }, [
          el("div", {}, [
            el("div", { class: "item-name" }, c.name),
            el("div", { class: "item-sub" }, (c.phone ? ("📞 " + c.phone + " · ") : "") + c.orderCount + " ግዢዎች")
          ]),
          el("div", { style: { textAlign: "right" } }, [
            el("div", { style: { fontWeight: "800", color: "#1e293b" } }, fmt(c.totalSpentCents)),
            c.unpaidCreditCents > 0
              ? el("div", { style: { fontSize: "11px", color: "#dc2626", fontWeight: "700" } }, "ዱቤ: " + fmt(c.unpaidCreditCents))
              : el("div", { style: { fontSize: "11px", color: "#16a34a" } }, "ዱቤ የለበትም")
          ])
        ]);
        card.appendChild(head);
        listWrap.appendChild(card);
      });
    }

    searchInp.addEventListener("input", function () { renderFiltered(searchInp.value); });
    body.appendChild(listWrap);
    renderFiltered("");
  }, null, false, opts);
}

function openEmployeeManagementSheet(opts) {
  var user = getCurrentUser();
  if (user && user.role === "employee") {
    showToast("⛔ ይህ ክፍል ለአስተዳዳሪ ብቻ የተፈቀደ ነው");
    return;
  }
  openSheet("👥 ሰራተኞች", function (body, close, refreshFooter) {
    var employees = state.data.employees || [];

    // Header bar with Title & Total Count (top + button removed, keep only bottom-right floating FAB)
    var headerRow = el("div", { class: "mb3" }, [
      el("div", { style: { fontWeight: "800", color: "#0f172a", fontSize: "17px" } }, "የሰራተኞች ዝርዝር"),
      el("div", { style: { fontSize: "12px", color: "#64748b", marginTop: "2px" } }, "ጠቅላላ ሰራተኞች: " + employees.length + " | ንቁ: " + employees.filter(function (e) { return e.status !== "blocked" && e.status !== "የታገደ" && e.status !== "የቀነሰ"; }).length)
    ]);
    body.appendChild(headerRow);

    if (employees.length === 0) {
      body.appendChild(el("div", { class: "empty", style: { padding: "32px 16px", textAlign: "center" } }, [
        el("div", { style: { fontSize: "32px", marginBottom: "8px" } }, "👥"),
        el("div", { style: { fontWeight: "800", fontSize: "15px", marginBottom: "4px" } }, "እስካሁን የተመዘገበ ሰራተኛ የለም"),
        el("div", { style: { fontSize: "12px", color: "#64748b", marginBottom: "16px" } }, "አዲስ ሰራተኛ በመመዝገብ ስም፣ ስልክ እና የስራ ምድብ ይመድቡ።"),
        (function () {
          var b = el("button", { class: "btn btn-primary", style: { background: "#00b87c", borderColor: "#00b87c" } }, "➕ አዲስ ሰራተኛ መዝግብ");
          b.addEventListener("click", function () {
            openEmployeeFormModal(null, function () {
              close();
              openEmployeeManagementSheet();
            });
          });
          return b;
        })()
      ]));
      return;
    }

    // Horizontally Scrollable Table Container
    var tableWrap = el("div", { class: "emp-table-wrap" });
    var table = el("table", { class: "emp-table" });

    // Table Header with exact requested columns: ስም፣ ስልክ ቁጥር፣ የስራ ምድብ፣ ማስተካከያ፣ አግድ፣ ሰርዝ
    var thead = el("thead", {}, [
      el("tr", {}, [
        el("th", { style: { minWidth: "160px" } }, "ስም"),
        el("th", { style: { minWidth: "140px" } }, "ስልክ ቁጥር"),
        el("th", { style: { minWidth: "130px" } }, "የስራ ምድብ"),
        el("th", { style: { minWidth: "95px", textAlign: "center" } }, "ማስተካከያ"),
        el("th", { style: { minWidth: "95px", textAlign: "center" } }, "አግድ"),
        el("th", { style: { minWidth: "85px", textAlign: "center" } }, "ሰርዝ")
      ])
    ]);
    table.appendChild(thead);

    var tbody = el("tbody", {});
    employees.forEach(function (emp) {
      var isBlocked = emp.status === "blocked" || emp.status === "የታገደ" || emp.status === "የቀነሰ";
      var tr = el("tr", { style: { opacity: isBlocked ? "0.65" : "1" } });

      // 1. ስም (Name + Avatar Initial circle)
      var initialChar = (emp.name && emp.name.trim().length > 0) ? emp.name.trim().charAt(0) : "👤";
      var nameTd = el("td", {}, [
        el("div", { class: "flex items-center gap2" }, [
          el("div", { class: "emp-avatar" }, initialChar),
          el("div", {}, [
            el("div", { style: { fontWeight: "700", color: "#0f172a", fontSize: "13.5px" } }, emp.name || "ስም የሌለው"),
            isBlocked ? el("span", { class: "badge", style: { background: "#fee2e2", color: "#dc2626", fontSize: "9.5px", fontWeight: "700" } }, "የታገደ") : null
          ])
        ])
      ]);
      tr.appendChild(nameTd);

      // 2. ስልክ ቁጥር (Phone Number in blue link)
      var phoneTd = el("td", {}, [
        el("a", {
          href: emp.phone ? ("tel:" + emp.phone) : "javascript:void(0)",
          style: {
            color: "#2563eb",
            fontWeight: "700",
            fontFamily: "monospace",
            fontSize: "13px",
            textDecoration: "none"
          }
        }, emp.phone || "-")
      ]);
      tr.appendChild(phoneTd);

      // 3. የስራ ምድብ (Role / Category Badge)
      var roleColorMap = {
        "ማናጀር": { bg: "#fef3c7", color: "#92400e" },
        "ካሸር / ሽያጭ": { bg: "#dcfce7", color: "#166534" },
        "የስቶክ/መጋዘን ኃላፊ": { bg: "#e0f2fe", color: "#0369a1" },
        "ሒሳብ ሹም": { bg: "#f3e8ff", color: "#6b21a8" }
      };
      var roleStyle = roleColorMap[emp.role] || { bg: "#f1f5f9", color: "#334155" };
      var roleTd = el("td", {}, [
        el("span", {
          style: {
            background: roleStyle.bg,
            color: roleStyle.color,
            fontSize: "11px",
            fontWeight: "700",
            padding: "4px 10px",
            borderRadius: "999px",
            display: "inline-block",
            whiteSpace: "nowrap"
          }
        }, emp.role || "ሰራተኛ")
      ]);
      tr.appendChild(roleTd);

      // 4. ማስተካከያ (Edit Action Button)
      var editBtn = el("button", {
        type: "button",
        class: "btn btn-outline btn-sm",
        style: {
          padding: "5px 10px",
          fontSize: "11.5px",
          fontWeight: "700",
          borderRadius: "8px",
          borderColor: "#cbd5e1"
        }
      }, "✏️ ማስተካከያ");
      editBtn.addEventListener("click", function () {
        openEmployeeFormModal(emp, function () {
          close();
          openEmployeeManagementSheet();
        });
      });
      var editTd = el("td", { style: { textAlign: "center" } }, [editBtn]);
      tr.appendChild(editTd);

      // 5. አግድ (Block / Suspend Toggle Action Button - toggles status and label to ፈታ when blocked)
      var blockBtn = el("button", {
        type: "button",
        class: "btn btn-sm",
        style: {
          padding: "6px 12px",
          fontSize: "11.5px",
          fontWeight: "700",
          borderRadius: "8px",
          background: isBlocked ? "#f0fdf4" : "#fff7ed",
          color: isBlocked ? "#166534" : "#c2410c",
          border: isBlocked ? "1px solid #bbf7d0" : "1px solid #fed7aa",
          cursor: "pointer",
          whiteSpace: "nowrap"
        }
      }, isBlocked ? "🔓 ፈታ" : "🚫 አግድ");
      blockBtn.addEventListener("click", function () {
        var nextBlocked = !isBlocked;
        setData(function (data) {
          if (!Array.isArray(data.employees)) data.employees = [];
          var target = data.employees.find(function (x) { return x.id === emp.id; });
          if (target) {
            target.status = nextBlocked ? "blocked" : "active";
            target.updatedAt = Date.now();
          }
          return data;
        });

        // Sync block status to backend
        fetch("/api/shop/employee/toggle-block", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopId: state.data.shopId || "shop_default",
            employeeId: emp.id,
            blocked: nextBlocked
          })
        }).catch(function () {});

        showToast(nextBlocked ? "✓ " + (emp.name || "ሰራተኛው") + " ታግዷል" : "✓ የ" + (emp.name || "ሰራተኛው") + " እገዳ ተነስቷል (ተፈትቷል)");
        close();
        openEmployeeManagementSheet();
      });
      var blockTd = el("td", { style: { textAlign: "center" } }, [blockBtn]);
      tr.appendChild(blockTd);

      // 6. ሰርዝ (Delete Action Button with Confirmation Modal)
      var delBtn = el("button", {
        type: "button",
        class: "btn btn-sm",
        style: {
          padding: "6px 12px",
          fontSize: "11.5px",
          fontWeight: "700",
          borderRadius: "8px",
          background: "#fef2f2",
          color: "#dc2626",
          border: "1px solid #fecaca",
          cursor: "pointer",
          whiteSpace: "nowrap"
        }
      }, "🗑️ ሰርዝ");
      delBtn.addEventListener("click", function () {
        confirmModal("እርግጠኛ ነዎት ይህንን ሰራተኛ (" + (emp.name || "ሰራተኛ") + ") ከሲስተሙ መሰረዝ ይፈልጋሉ?", function () {
          setData(function (data) {
            data.employees = (data.employees || []).filter(function (x) { return x.id !== emp.id; });
            return data;
          });

          // Sync delete to backend
          var sId = state.data.storeId || state.data.shopId || "shop_default";
          fetch("/api/shop/employee/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              shopId: sId,
              employeeId: emp.id
            })
          }).catch(function () {});

          // Remove row immediately from UI
          tr.remove();
          if (tbody && !tbody.children.length) {
            close();
            openEmployeeManagementSheet();
          }

          showToast("ሰራተኛው በተሳካ ሁኔታ ተሰርዟል!");
        }, null, {
          title: "⚠️ ሰራተኛ መሰረዝ",
          confirmText: "ይሰረዝ",
          cancelText: "ተመለስ"
        });
      });
      var delTd = el("td", { style: { textAlign: "center" } }, [delBtn]);
      tr.appendChild(delTd);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    body.appendChild(tableWrap);

    // Floating Green Plus Action Button (+) matching Screenshot 1
    var fabBtn = el("button", {
      class: "emp-fab-btn",
      title: "አዲስ ሰራተኛ መዝግብ"
    }, "+");
    fabBtn.addEventListener("click", function () {
      openEmployeeFormModal(null, function () {
        close();
        openEmployeeManagementSheet();
      });
    });
    body.appendChild(fabBtn);
  }, null, false, opts);
}

function openEmployeeFormModal(existingEmp, onSaved) {
  openSheet(existingEmp ? "👤 ሰራተኛ ማስተካከያ" : "➕ አዲስ ሰራተኛ", function (body, close) {
    // 1. ስም
    var nameInp = el("input", {
      class: "input",
      type: "text",
      value: existingEmp ? existingEmp.name : "",
      placeholder: "ስም ያስገቡ",
      style: { borderRadius: "10px", padding: "12px", fontSize: "14px", width: "100%", boxSizing: "border-box" }
    });

    // 2. ስልክ ቁጥር
    var phoneInp = el("input", {
      class: "input",
      type: "tel",
      name: "no-autofill-phone",
      value: existingEmp ? (existingEmp.phone || "") : "",
      placeholder: "09... ወይም 07...",
      autocomplete: "off",
      autocorrect: "off",
      autocapitalize: "none",
      spellcheck: "false",
      "data-form-type": "other",
      "data-lpignore": "true",
      "data-1p-ignore": "true",
      style: { borderRadius: "10px", padding: "12px", fontSize: "14px", width: "100%", boxSizing: "border-box" }
    });

    // 3. የይለፍ ቃል (PIN) - Full-width, random generator button removed, toggle eye inside
    var pinWrap = el("div", {
      style: {
        position: "relative",
        display: "flex",
        alignItems: "center",
        width: "100%"
      }
    });
    var pinInp = el("input", {
      class: "input",
      type: "password",
      name: "no-autofill-pass",
      placeholder: "የይለፍ ቃል (PIN) ያስገቡ",
      value: existingEmp ? (existingEmp.pin || "") : "",
      autocomplete: "new-password",
      autocorrect: "off",
      autocapitalize: "none",
      spellcheck: "false",
      "data-lpignore": "true",
      "data-1p-ignore": "true",
      style: {
        borderRadius: "10px",
        padding: "12px 42px 12px 14px",
        fontSize: "14px",
        letterSpacing: "2px",
        fontWeight: "700",
        width: "100%",
        boxSizing: "border-box"
      }
    });
    var pinEye = el("button", {
      type: "button",
      title: "ፒን አሳይ/ደብቅ",
      style: {
        position: "absolute",
        right: "10px",
        background: "none",
        border: "none",
        fontSize: "18px",
        cursor: "pointer",
        padding: "4px 8px",
        color: "#64748b"
      }
    }, "👁️");
    pinEye.addEventListener("click", function () {
      pinInp.type = pinInp.type === "password" ? "text" : "password";
    });
    pinWrap.appendChild(pinInp);
    pinWrap.appendChild(pinEye);

    // 4. የስራ ምድብ - Clean standard text input box
    var roleInp = el("input", {
      class: "input",
      type: "text",
      placeholder: "የስራ ምድብ/ሃላፊነት ያስገቡ (ምሳሌ፦ ካሸር፣ ረዳት)",
      value: existingEmp ? (existingEmp.role || "") : "",
      style: {
        borderRadius: "10px",
        padding: "12px 14px",
        fontSize: "14px",
        width: "100%",
        boxSizing: "border-box"
      }
    });

    // Append standard fields with clean label titles
    body.appendChild(Field("ስም", true, nameInp));
    body.appendChild(Field("ስልክ ቁጥር", true, phoneInp));
    body.appendChild(Field("የይለፍ ቃል (PIN)", true, pinWrap));
    body.appendChild(Field("የስራ ምድብ", true, roleInp));

    // Submit button matching Screenshot 2: "መዝግብ (አስገባ)" in prominent green
    var submitBtn = el("button", {
      class: "btn btn-primary btn-block mt3",
      style: {
        background: "#00b87c",
        borderColor: "#00b87c",
        color: "#ffffff",
        padding: "14px",
        borderRadius: "12px",
        fontSize: "15px",
        fontWeight: "800",
        boxShadow: "0 4px 12px rgba(0, 184, 124, 0.35)"
      }
    }, existingEmp ? "አስቀምጥ (አዘምን)" : "መዝግብ (አስገባ)");

    submitBtn.addEventListener("click", guarded(function () {
      var nameVal = nameInp.value.trim();
      var phoneVal = phoneInp.value.trim().replace(/\s+/g, "");
      var pinVal = pinInp.value.trim();
      var roleVal = roleInp.value.trim() || "ካሸር";

      if (!nameVal) { showToast("እባክዎ የሰራተኛውን ስም ያስገቡ"); return; }
      if (!phoneVal) { showToast("እባክዎ የሰራተኛውን ስልክ ቁጥር ያስገቡ"); return; }
      if (!pinVal || pinVal.length < 4) { showToast("እባክዎ ቢያንስ 4 ዲጂት የመግቢያ ፒን ያስገቡ"); return; }

      // Default permissions based on role
      var perms = ["sales", "stock"];
      var lowerRole = roleVal.toLowerCase();
      if (lowerRole.includes("ማናጀር") || lowerRole.includes("manager") || lowerRole.includes("ኃላፊ") || lowerRole.includes("አስተዳዳሪ")) {
        perms = ["sales", "stock", "stock_edit", "shipments", "expenses", "reports"];
      } else if (lowerRole.includes("ስቶክ") || lowerRole.includes("መጋዘን") || lowerRole.includes("stock")) {
        perms = ["stock", "stock_edit", "shipments"];
      } else if (lowerRole.includes("ሒሳብ") || lowerRole.includes("accountant")) {
        perms = ["sales", "expenses", "reports"];
      }

      setData(function (data) {
        if (!Array.isArray(data.employees)) data.employees = [];
        if (existingEmp) {
          var target = data.employees.find(function (x) { return x.id === existingEmp.id; });
          if (target) {
            target.name = nameVal;
            target.phone = phoneVal;
            target.pin = pinVal;
            target.role = roleVal;
            target.jobTitle = roleVal;
            target.roleTitle = roleVal;
            target.permissions = perms;
            target.updatedAt = Date.now();
          }
        } else {
          data.employees.push({
            id: uid(),
            name: nameVal,
            phone: phoneVal,
            pin: pinVal,
            role: roleVal,
            jobTitle: roleVal,
            roleTitle: roleVal,
            permissions: perms,
            status: "active",
            createdAt: Date.now()
          });
        }
        return data;
      });

      showToast(existingEmp ? "✓ ሰራተኛ ተስተካክሏል" : "✓ አዲስ ሰራተኛ ተመዝግቧል");
      close();
      if (onSaved) onSaved();
    }));

    body.appendChild(submitBtn);
  }, null);
}

function openLocationManagementSheet(opts) {
  openSheet("🏛️ የሱቆችና መጋዘኖች ማስተዳደሪያ", function (body, close) {
    body.appendChild(el("div", {
      class: "helpmsg mb3",
      style: { fontSize: "13px", lineHeight: "1.5", color: "#475569" }
    }, "እዚህ አዳዲስ ሱቆችን (ቅርንጫፎች) ወይም መጋዘኖችን ማከል እና ማስተዳደር ይችላሉ።"));

    var locations = Array.isArray(state.data.locations) ? state.data.locations : [];

    var listWrap = el("div", { class: "flex flex-col gap2 mb4" });

    if (locations.length === 0) {
      listWrap.appendChild(el("div", {
        class: "muted p3",
        style: { textAlign: "center", background: "#f8fafc", borderRadius: "10px" }
      }, "ምንም የተመዘገበ ሱቅ ወይም መጋዘን የለም"));
    } else {
      locations.forEach(function (loc, idx) {
        var isPrimary = idx === 0;
        var icon = loc.type === "warehouse" ? "🏢" : "🏪";
        var typeBadge = loc.type === "warehouse" ? "መጋዘን" : "ሱቅ / ቅርንጫፍ";

        var card = el("div", {
          class: "card flex items-center justify-between p3",
          style: {
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
          }
        }, [
          el("div", { class: "flex items-center gap2" }, [
            el("span", { style: { fontSize: "24px" } }, icon),
            el("div", {}, [
              el("div", { class: "flex items-center gap1" }, [
                el("strong", { style: { fontSize: "14px", color: "#1e293b" } }, loc.name || "ያልተሰየመ"),
                isPrimary ? el("span", {
                  class: "badge",
                  style: { background: "#dbeafe", color: "#1e40af", fontSize: "10.5px", padding: "2px 6px" }
                }, "ዋና") : null
              ]),
              el("div", {
                style: { fontSize: "12px", color: "#64748b", marginTop: "2px" }
              }, typeBadge + (loc.address ? " • " + loc.address : "") + (loc.manager ? " • ኃላፊ፦ " + loc.manager : ""))
            ])
          ]),
          el("div", { class: "flex items-center gap2" }, [
            (function () {
              var editBtn = el("button", {
                class: "btn btn-outline btn-sm",
                style: { padding: "4px 8px", fontSize: "12px" },
                onclick: function () {
                  openLocationFormModal(loc, function () {
                    close();
                    openLocationManagementSheet();
                  });
                }
              }, "✏️");
              return editBtn;
            })(),
            (!isPrimary) ? (function () {
              var delBtn = el("button", {
                class: "btn btn-outline btn-sm",
                style: { padding: "4px 8px", fontSize: "12px", color: "#dc2626", borderColor: "#fecaca" },
                onclick: function () {
                  confirmModal("እርግጠኛ ነዎት '" + (loc.name || "ይህንን") + "' ከዝርዝሩ መሰረዝ ይፈልጋሉ?", function () {
                    setData(function (data) {
                      data.locations = (data.locations || []).filter(function (x) { return x.id !== loc.id; });
                      return data;
                    });
                    showToast("✓ ተሰርዟል");
                    close();
                    openLocationManagementSheet();
                  });
                }
              }, "🗑️");
              return delBtn;
            })() : null
          ])
        ]);

        listWrap.appendChild(card);
      });
    }

    body.appendChild(listWrap);

    var addBtn = el("button", {
      class: "btn btn-primary w-full",
      style: { padding: "12px", borderRadius: "10px", fontWeight: "700" },
      onclick: function () {
        openLocationFormModal(null, function () {
          close();
          openLocationManagementSheet();
        });
      }
    }, "➕ አዲስ ሱቅ ወይም መጋዘን ያክሉ");
    body.appendChild(addBtn);
  }, null, false, opts);
}

function openLocationFormModal(existingLoc, onSaved) {
  openSheet(existingLoc ? "✏️ ሱቅ / መጋዘን ማስተካከያ" : "➕ አዲስ ሱቅ / መጋዘን ማከል", function (body, close) {
    var typeSelect = el("select", { class: "input mb3" }, [
      el("option", { value: "shop", selected: !existingLoc || existingLoc.type === "shop" }, "🏪 ሱቅ (ቅርንጫፍ)"),
      el("option", { value: "warehouse", selected: existingLoc && existingLoc.type === "warehouse" }, "🏢 መጋዘን")
    ]);

    var nameInput = el("input", {
      class: "input mb3",
      type: "text",
      placeholder: "ስም ያስገቡ (ምሳሌ፦ ሱቅ 02 ወይም ቦሌ መጋዘን)",
      value: existingLoc ? (existingLoc.name || "") : ""
    });

    var managerInput = el("input", {
      class: "input mb3",
      type: "text",
      placeholder: "የኃላፊ / ማናጀር ስም (አማራጭ)",
      value: existingLoc ? (existingLoc.manager || "") : ""
    });

    var addressInput = el("input", {
      class: "input mb3",
      type: "text",
      placeholder: "አድራሻ / አካባቢ (አማራጭ)",
      value: existingLoc ? (existingLoc.address || "") : ""
    });

    body.appendChild(Field("አይነት", true, typeSelect));
    body.appendChild(Field("የቦታው ስም", true, nameInput));
    body.appendChild(Field("ማናጀር / ኃላፊ", false, managerInput));
    body.appendChild(Field("አድራሻ", false, addressInput));

    var saveBtn = el("button", {
      class: "btn btn-primary w-full mt4",
      style: { padding: "12px", borderRadius: "10px", fontWeight: "700" },
      onclick: function () {
        var nameVal = nameInput.value.trim();
        if (!nameVal) {
          showToast("እባክዎ የቦታውን ስም ያስገቡ");
          return;
        }

        setData(function (data) {
          if (!Array.isArray(data.locations)) data.locations = [];
          if (existingLoc) {
            data.locations = data.locations.map(function (x) {
              if (x.id === existingLoc.id) {
                return Object.assign({}, x, {
                  type: typeSelect.value,
                  name: nameVal,
                  manager: managerInput.value.trim(),
                  address: addressInput.value.trim()
                });
              }
              return x;
            });
          } else {
            var newId = (typeSelect.value === "warehouse" ? "wh_" : "shop_") + Date.now().toString(36);
            data.locations.push({
              id: newId,
              type: typeSelect.value,
              name: nameVal,
              manager: managerInput.value.trim(),
              address: addressInput.value.trim(),
              note: ""
            });
          }
          return data;
        });

        showToast(existingLoc ? "✓ ተስተካክሏል" : "✓ አዲስ ተመዝግቧል");
        close();
        if (onSaved) onSaved();
      }
    }, "አስቀምጥ");

    body.appendChild(saveBtn);
  });
}

function openTimeReportSheet(opts) {
  openSheet("📅 የሽያጭና ወጪ የጊዜ ሪፖርት", function (body, close) {
    body.appendChild(el("div", { class: "helpmsg" }, "የሽያጭ፣ ወጪ እና የተጣራ ትርፍ ማጠቃለያዎችን በጊዜ ሰሌዳ ይምረጡ።"));

    var items = [
      { em: "🗓️", title: "የዕለት (የቀን) ዝርዝር", sub: "የዛሬ እና የትናንት ዝርዝር", fn: function () { close(); openHistoryPicker(); } },
      { em: "📅", title: "ሳምንታዊ ዝርዝር", sub: "የዚህ ሳምንት 7ቱ ቀናት በስማቸው", fn: function () { close(); openWeeklyReport(); } },
      { em: "🗓️", title: "ወርሃዊ ዝርዝር", sub: "13ቱ የኢትዮጵያ ወራት", fn: function () { close(); openMonthlyReport(); } },
      { em: "📆", title: "ዓመታዊ ዝርዝር", sub: "በኢትዮጵያ ዓ.ም ማጠቃለያ", fn: function () { close(); openYearlyReport(); } }
    ];

    items.forEach(function (it) {
      var b = el("button", { class: "menu-item" }, [
        el("span", { class: "em" }, it.em),
        el("div", {}, [
          el("div", {}, it.title),
          el("div", { class: "sub" }, it.sub)
        ])
      ]);
      b.addEventListener("click", it.fn);
      body.appendChild(b);
    });
  }, null, false, opts);
}

function openHelpAndSupportSheet(opts) {
  openSheet("❓ Help & Support — የዕርዳታ ማዕከል", function (body) {
    body.appendChild(el("div", { class: "card section", style: { background: "#eff6ff", borderColor: "#bfdbfe" } }, [
      el("div", { style: { fontWeight: "800", color: "#1e40af", fontSize: "15px", marginBottom: "6px" } }, "የሱቅ መቆጣጠሪያ ሲስተም አጠቃቀም"),
      el("div", { style: { fontSize: "12.5px", color: "#334155", lineHeight: "1.6" } },
        "ይህ መተግበሪያ ያለ ኢንተርኔት (Offline) በቀጥታ በስልክዎ ላይ ይሰራል፤ መረጃዎ ሙሉ በሙሉ ሚስጥራዊ እና አስተማማኝ ነው።")
    ]));

    var faqs = [
      { q: "📦 አዲስ ዕቃ እንዴት ይጨመራል?", a: "ከግራ ሜኑ '🏛️ የዕቃ ክምችት' ውስጥ ገብተው ወይም '🚚 አዲስ የዕቃ ጭነት መመዝገቢያ' በመጫን አዲስ ዕቃ እና የመጣውን ስቶክ መመዝገብ ይችላሉ።" },
      { q: "🧾 የዱቤ ሽያጭ እንዴት ይከታተላል?", a: "በሽያጭ ጊዜ የክፍያ አማራጭን 'ዱቤ' አድርገው ይመዝግቡ። በግራ ሜኑ 'የደበኞች ዴቢ መረጃ' ስር ደንበኞችን፣ ቀሪ ብር እና ቀን ገደብ ያገኛሉ።" },
      { q: "🖨️ የባንክ ሪፖርትና አባሪዎች እንዴት ይታተማል?", a: "ከግራ ሜኑ '📄 የባንክ ሪፖርት ማውጫ' የሚለውን በመንካት የተሟላ ባለ 19-20 ገጽ ሪፖርትና አባሪ ሰነዶችን በPDF ማውረድ ወይም ማተም ይችላሉ።" },
      { q: "🔒 መተግበሪያውን በPIN መቆለፍ እችላለሁ?", a: "አዎ፤ በ'ቅንብሮች' ስር '🔒 ደህንነት' የሚለውን ከፍተው የ4-አሃዝ PIN ኮድ ያዘጋጁ።" }
    ];

    faqs.forEach(function (f) {
      var item = el("div", { class: "item-row mb2" }, [
        el("div", { style: { fontWeight: "700", color: "#1e293b", marginBottom: "4px" } }, f.q),
        el("div", { style: { fontSize: "12px", color: "#64748b", lineHeight: "1.5" } }, f.a)
      ]);
      body.appendChild(item);
    });

    body.appendChild(el("div", { class: "card section mt3", style: { textAlign: "center" } }, [
      el("div", { style: { fontWeight: "800", fontSize: "14px", marginBottom: "4px" } }, "የድጋፍ መስመር / Gurage Hub"),
      el("div", { style: { fontSize: "12px", color: "#64748b" } }, "ቴሌግራም ድጋፍ: @GrposBot | @GurageHub"),
      el("div", { style: { fontSize: "11px", color: "#94a3b8", marginTop: "4px" } }, "አዲስ አበባ፣ ኢትዮጵያ")
    ]));
  }, null, false, opts);
}

function openRatingModal() {
  openSheet("⭐ አፑን ደረጃ ይስጡ", function (body, close) {
    var starsWrap = el("div", { style: { display: "flex", justifyContent: "center", gap: "10px", fontSize: "34px", cursor: "pointer", margin: "16px 0" } });
    var selectedStars = 5;
    var starSpans = [];

    function updateStars(num) {
      selectedStars = num;
      starSpans.forEach(function (s, idx) {
        s.style.opacity = idx < num ? "1" : "0.25";
        s.style.transform = idx < num ? "scale(1.1)" : "scale(1)";
      });
    }

    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var sp = el("span", { style: { transition: "transform .15s, opacity .15s" } }, "⭐");
        sp.addEventListener("click", function () { updateStars(n); });
        starSpans.push(sp);
        starsWrap.appendChild(sp);
      })(i);
    }
    updateStars(5);

    body.appendChild(el("div", { style: { textAlign: "center", fontWeight: "700", fontSize: "15px", color: "#1e293b" } }, "የሱቅ መቆጣጠሪያ ሲስተምን ወደዱት?"));
    body.appendChild(el("div", { style: { textAlign: "center", fontSize: "12px", color: "#94a3b8", marginTop: "4px" } }, "እባክዎ 5 ኮከብ በመስጠት አስተያየትዎን ያጋሩ"));
    body.appendChild(starsWrap);

    var noteInp = el("textarea", { class: "input", rows: "3", placeholder: "አስተያየትዎን እዚህ ይጻፉ (አስፈላጊ ከሆነ)..." });
    body.appendChild(noteInp);

    var submitBtn = el("button", { class: "btn btn-primary btn-block mt3" }, "⭐ ደረጃውን አስቀምጥ");
    submitBtn.addEventListener("click", function () {
      showToast("🎉 እናመሰግናለን! " + selectedStars + " ኮከብ ደረጃ ሰጥተዋል።");
      close();
    });
    body.appendChild(submitBtn);
  }, null);
}

function openAboutModal() {
  openSheet("ℹ️ ስለ አፑ እና ስሪት መረጃ", function (body) {
    body.appendChild(el("div", { style: { textAlign: "center", padding: "20px 0" } }, [
      el("div", { style: { fontSize: "44px", marginBottom: "8px" } }, "🏪"),
      el("div", { style: { fontSize: "18px", fontWeight: "800", color: "#1e293b" } }, "የሱቅ መቆጣጠሪያ ሲስተም"),
      el("div", { style: { fontSize: "13px", fontWeight: "700", color: "#2563eb", marginTop: "2px" } }, "ስሪት 1.00"),
      el("div", { style: { fontSize: "12px", color: "#94a3b8", marginTop: "8px", lineHeight: "1.6" } },
        "ለኢትዮጵያ አነስተኛና መካከለኛ ነጋዴዎች፣ ሱቆች፣ እና ጅምላ አከፋፋዮች የተዘጋጀ ከመስመር ውጭ (Offline) የሚሰራ የሂሳብና ቁጥጥር ሲስተም።"),
      el("div", { style: { marginTop: "18px", padding: "12px", background: "#f8fafc", borderRadius: "12px", fontSize: "12px", color: "#64748b" } },
        "የተዘጋጀው በ: Gurage Hub Technologies\nየኢትዮጵያ ዘመን አቆጣጠር እና የባንክ ኦዲት ደንብን መሰረት ያደረገ።")
    ]));
  }, null);
}

function openBackupRestoreSheet() {
  openSheet("☁️ መረጃ ምትክ አስቀምጥ / መልስ", function (body) {
    body.appendChild(el("div", { class: "helpmsg" }, "የስልክዎን የሱቅ መረጃ ወደ ፋይል ማስቀመጥ (Backup) ወይም ቀደም ሲል ያስቀመጡትን ፋይል መልሰው መጫን (Restore) ይችላሉ።"));

    var backupCard = el("div", { class: "card section" }, [
      el("div", { class: "card-label mb1" }, "📥 መረጃ ወደ ስልክህ አስቀምጥ (Backup)"),
      el("div", { style: { fontSize: "12px", color: "#64748b", marginBottom: "12px" } }, "ሁሉንም የሽያጭ፣ ዕቃዎች፣ እና ወጪ መረጃዎች በJSON ፋይል ያወርዳል።"),
      (function () {
        var b = el("button", { class: "btn btn-primary btn-block" }, "📥 Backup ፋይል አውርድ");
        b.addEventListener("click", function () {
          var jsonStr = JSON.stringify(state.data, null, 2);
          var blob = new Blob([jsonStr], { type: "application/json" });
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url;
          a.download = "shop-control-backup-" + todayISO() + ".json";
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          showToast("✓ የBackup ፋይል ተቀምጧል");
        });
        return b;
      })()
    ]);
    body.appendChild(backupCard);

    var restoreCard = el("div", { class: "card section", style: { borderColor: "#f59e0b" } }, [
      el("div", { class: "card-label mb1", style: { color: "#d97706" } }, "📤 ያስቀመጡትን Backup ፋይል መልስ (Restore)"),
      el("div", { style: { fontSize: "12px", color: "#64748b", marginBottom: "12px" } }, "ቀደም ሲል ያወረዱትን JSON ፋይል በመምረጥ ውሂቡን ይመልሱ።"),
      (function () {
        var fileInp = el("input", { type: "file", accept: ".json", style: { display: "none" } });
        var b = el("button", { class: "btn btn-outline btn-block", style: { borderColor: "#f59e0b", color: "#d97706" } }, "📤 ፋይል ምረጥና Restore አድርግ");
        fileInp.addEventListener("change", function (ev) {
          var file = ev.target.files && ev.target.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function (e) {
            try {
              var parsed = JSON.parse(e.target.result);
              if (parsed && Array.isArray(parsed.items) && Array.isArray(parsed.sales)) {
                if (confirm("ይህ ፋይል አሁን ያለውን መረጃ ይተካዋል። እርግጠኛ ነዎት?")) {
                  state.data = parsed;
                  saveLocal(state.data);
                  renderApp();
                  showToast("✓ መረጃው በተሳካ ሁኔታ ተመልሷል (Restored)!");
                }
              } else {
                showToast("❌ የተሳሳተ Backup ፋይል ነው");
              }
            } catch (err) {
              showToast("❌ ፋይሉን ማንበብ አልተቻለም");
            }
          };
          reader.readAsText(file);
        });
        b.addEventListener("click", function () { fileInp.click(); });
        var wrap = el("div", {}, [fileInp, b]);
        return wrap;
      })()
    ]);
    body.appendChild(restoreCard);
  }, null);
}

function shareAppLink() {
  var shareData = { title: document.title || "የሱቅ መቆጣጠሪያ ሲስተም", text: "የሱቅ መቆጣጠሪያ ሲስተም", url: location.href };
  if (navigator.share) {
    navigator.share(shareData).catch(function (err) { if (!err || err.name !== "AbortError") showToast("ማጋራት አልተቻለም"); });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(location.href).then(function () { showToast("✓ ሊንኩ ተቀድቷል (Copied)"); }).catch(function () { showToast("ማጋራት አልተቻለም"); });
  } else {
    showToast("ማጋራት በዚህ አሳሽ አይደገፍም");
  }
}

function openHistoryPicker() {
  openSheet("📅 ታሪክ / ማህደር", function (body) {
    body.appendChild(el("div", { class: "helpmsg" }, "የዛሬው ዝርዝር ከፊት ለፊት ገጹ ላይ ብቻ ይታያል። ያለፉትን ቀናት፣ ሳምንት፣ ወር ወይም አመት ለማየት ከታች ይምረጡ።"));
    var d = new Date(); d.setDate(d.getDate() - 1);
    var y = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    var dayBtn = el("button", { class: "menu-item" }, [el("span", { class: "em" }, "🗓️"), el("div", {}, [el("div", {}, "ትናንት"), el("div", { class: "sub" }, y)])]);
    dayBtn.addEventListener("click", function () { openDayDetailSheet(y, "ትናንት (" + y + ")"); });
    var weekBtn = el("button", { class: "menu-item" }, [el("span", { class: "em" }, "📅"), el("div", {}, [el("div", {}, "ይህ ሳምንት"), el("div", { class: "sub" }, "የ7ቱ ቀናት ማጠቃለያ")])]);
    weekBtn.addEventListener("click", function () { openWeeklyReport(); });
    var monthBtn = el("button", { class: "menu-item" }, [el("span", { class: "em" }, "🗓️"), el("div", {}, [el("div", {}, "ይህ ወር"), el("div", { class: "sub" }, "13ቱ የኢትዮጵያ ወራት")])]);
    monthBtn.addEventListener("click", function () { openMonthlyReport(); });
    var yearBtn = el("button", { class: "menu-item" }, [el("span", { class: "em" }, "📆"), el("div", {}, [el("div", {}, "ይህ አመት"), el("div", { class: "sub" }, "በኢትዮጵያ ዓ.ም")])]);
    yearBtn.addEventListener("click", function () { openYearlyReport(); });
    body.appendChild(dayBtn); body.appendChild(weekBtn); body.appendChild(monthBtn); body.appendChild(yearBtn);
  }, null);
}

function openDayDetailSheet(iso, label) {
  openSheet("🗓️ " + (label || iso), function (body) {
    var st = dayStats(state.data, iso);
    body.appendChild(el("div", { class: "grid2 mb3" }, [
      el("div", { class: "card-compact green" }, [el("div", { class: "card-label" }, "ሽያጭ"), el("div", { class: "card-value" }, fmt(st.revenue))]),
      el("div", { class: "card-compact red" }, [el("div", { class: "card-label" }, "ወጪ"), el("div", { class: "card-value" }, fmt(st.expenseTotal))])
    ]));
    body.appendChild(el("div", { class: "card-compact teal mb3" }, [el("div", { class: "card-label" }, "የተጣራ ትርፍ"), el("div", { class: "card-value", style: { color: st.profit >= 0 ? "#0f766e" : "#dc2626" } }, fmt(st.profit))]));

    body.appendChild(el("div", { class: "eyebrow mb2" }, "🧾 ሽያጮች"));
    var salesForDay = state.data.sales.filter(function (s) { return s.date === iso; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    var salesWrap = el("div", { class: "list-scroll", style: { maxHeight: "220px" } });
    if (salesForDay.length === 0) { salesWrap.appendChild(el("div", { class: "empty" }, "📭 ምንም ሽያጭ የለም")); }
    salesForDay.forEach(function (s) {
      var payLabel = s.paymentMethod === "bank" ? ("ባንክ · " + s.bankName) : s.paymentMethod === "credit" ? ("ዱቤ · " + (s.paid ? "ተከፍሏል" : "አልተከፈለም")) : "ካሽ";
      salesWrap.appendChild(el("div", { class: "item-row" }, [
        el("div", { class: "flex items-center justify-between" }, [
          el("div", {}, [el("div", { class: "item-name" }, s.itemName + " × " + s.qty), el("div", { class: "item-sub" }, s.customer + " · " + payLabel)]),
          el("div", { style: { fontWeight: "800" } }, fmt(s.totalCents))
        ])
      ]));
    });
    body.appendChild(salesWrap);

    body.appendChild(el("div", { class: "eyebrow mt3 mb2" }, "💸 ወጪዎች"));
    var expensesForDay = state.data.expenses.filter(function (e) { return e.date === iso; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    var expWrap = el("div", { class: "list-scroll", style: { maxHeight: "220px" } });
    if (expensesForDay.length === 0) { expWrap.appendChild(el("div", { class: "empty" }, "📭 ምንም ወጪ የለም")); }
    expensesForDay.forEach(function (e) {
      expWrap.appendChild(el("div", { class: "item-row" }, [
        el("div", { class: "flex items-center justify-between" }, [
          el("div", {}, [el("div", { class: "item-name" }, e.category || "ሌላ"), el("div", { class: "item-sub" }, e.title || "")]),
          el("div", { style: { fontWeight: "800", color: "#dc2626" } }, fmt(e.amountCents))
        ])
      ]));
    });
    body.appendChild(expWrap);
  }, null);
}

function openWeeklyReport() {
  openSheet("📅 ሳምንታዊ ሪፖርት", function (body) {
    var now = new Date();
    var day = now.getDay(), diffToMonday = (day + 6) % 7;
    var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
    var isoList = [];
    for (var j = 0; j < 7; j++) {
      var dd = new Date(monday); dd.setDate(monday.getDate() + j);
      var iso = dd.getFullYear() + "-" + String(dd.getMonth() + 1).padStart(2, "0") + "-" + String(dd.getDate()).padStart(2, "0");
      isoList.push({ iso: iso, label: ETH_WEEKDAYS[j] });
    }
    var weekSales = state.data.sales.filter(function (s) { return isoList.some(function (x) { return x.iso === s.date; }); });
    var weekExpenses = state.data.expenses.filter(function (e) { return isoList.some(function (x) { return x.iso === e.date; }); });
    var weekTotals = {
      revenue: weekSales.reduce(function (s, x) { return s + x.totalCents; }, 0),
      expenseTotal: weekExpenses.reduce(function (s, x) { return s + x.amountCents; }, 0),
      profit: weekSales.reduce(function (s, x) { return s + (x.unitPriceCents - x.unitCostCents) * x.qty; }, 0) - weekExpenses.reduce(function (s, x) { return s + x.amountCents; }, 0)
    };
    body.appendChild(el("div", { class: "card violet section" }, [el("div", { class: "card-label" }, "የሳምንቱ ጠቅላላ ትርፍ"), el("div", { class: "card-value" }, fmt(weekTotals.profit))]));
    body.appendChild(renderAllocationBlock(weekTotals.profit, state.data.allocations, "የሳምንቱ"));
    body.appendChild(el("div", { class: "eyebrow mt3 mb2" }, "በቀናት"));
    isoList.forEach(function (x) {
      var st = dayStats(state.data, x.iso);
      body.appendChild(el("div", { class: "day-card" }, [
        el("div", { class: "dname" }, x.label + " (" + x.iso + ")"),
        el("div", { class: "row" }, [el("span", {}, "ሽያጭ"), el("b", {}, fmt(st.revenue))]),
        el("div", { class: "row" }, [el("span", {}, "ወጪ"), el("b", {}, fmt(st.expenseTotal))]),
        el("div", { class: "row" }, [el("span", {}, "ትርፍ"), el("b", { style: { color: st.profit >= 0 ? "#16a34a" : "#dc2626" } }, fmt(st.profit))])
      ]));
    });
  }, null);
}

function openMonthlyReport() {
  openSheet("🗓️ ወርሃዊ ሪፖርት", function (body) {
    var todayEth = { year: 2018 };
    body.appendChild(el("div", { class: "eyebrow mb2" }, todayEth.year + " ዓ.ም — 13ቱ ወራት"));
    for (var m = 1; m <= 13; m++) {
      body.appendChild(el("div", { class: "day-card" }, [
        el("div", { class: "dname" }, ETH_MONTHS[m - 1]),
        el("div", { class: "row" }, [el("span", {}, "ሽያጭ"), el("b", {}, "0.00 ብር")]),
        el("div", { class: "row" }, [el("span", {}, "ወጪ"), el("b", {}, "0.00 ብር")]),
        el("div", { class: "row" }, [el("span", {}, "ትርፍ"), el("b", {}, "0.00 ብር")])
      ]));
    }
  }, null);
}

function openYearlyReport() {
  openSheet("📆 አመታዊ ሪፖርት", function (body) {
    body.appendChild(el("div", { class: "day-card" }, [
      el("div", { class: "dname" }, "2018 ዓ.ም"),
      el("div", { class: "row" }, [el("span", {}, "ሽያጭ"), el("b", {}, "0.00 ብር")]),
      el("div", { class: "row" }, [el("span", {}, "ወጪ"), el("b", {}, "0.00 ብር")]),
      el("div", { class: "row" }, [el("span", {}, "ትርፍ"), el("b", {}, "0.00 ብር")])
    ]));
  }, null);
}

function buildLockScreen() {
  var entered = "";
  var wrap = el("div", { class: "lock-screen" });
  
  var iconBadge = el("div", { class: "lock-icon-badge" }, "🔒");
  wrap.appendChild(iconBadge);
  wrap.appendChild(el("div", { class: "lock-title" }, "የሱቅ መቆጣጠሪያ ተቆልፏል"));
  wrap.appendChild(el("div", { class: "lock-subtitle" }, "የ4-አሃዝ PIN ያስገቡ"));

  var dotsRow = el("div", { class: "pin-dots" });
  var dots = [];
  for (var i = 0; i < 4; i++) {
    var d = el("div", { class: "pin-dot" });
    dots.push(d);
    dotsRow.appendChild(d);
  }
  wrap.appendChild(dotsRow);

  var errBox = el("div", { class: "lock-err-box" });
  wrap.appendChild(errBox);

  function updateDots() {
    dots.forEach(function (d, idx) {
      d.classList.toggle("filled", idx < entered.length);
    });
  }

  function tryUnlock() {
    var isOwner = (simpleHash(entered) === prefs.pinHash) || (state.data.ownerPin && entered === state.data.ownerPin);
    var matchedEmployee = null;
    if (!isOwner && Array.isArray(state.data.employees)) {
      matchedEmployee = state.data.employees.find(function (e) {
        return (e.status !== "inactive" && e.status !== "የቀነሰ") && (e.pin === entered || simpleHash(entered) === e.pinHash);
      });
    }

    if (isOwner) {
      state.locked = false;
      state.currentUser = {
        role: "admin",
        isOwner: true,
        name: (state.data.profile && state.data.profile.ownerName) || "የሱቅ ባለቤት",
        permissions: ["all"]
      };
      try {
        sessionStorage.setItem("currentUser", JSON.stringify(state.currentUser));
        sessionStorage.setItem("role", "admin");
        sessionStorage.setItem("authUser", JSON.stringify(state.currentUser));
        localStorage.setItem("currentUser", JSON.stringify(state.currentUser));
        localStorage.setItem("role", "admin");
      } catch (e) {}
      entered = "";
      renderApp();
      showToast("እንኳን ደህና መጡ (ባለቤት)");
    } else if (matchedEmployee) {
      state.locked = false;
      var empJobTitle = matchedEmployee.jobTitle || matchedEmployee.roleTitle || matchedEmployee.role || "ሰራተኛ";
      state.currentUser = {
        id: matchedEmployee.id,
        name: matchedEmployee.name,
        role: "employee",
        employeeRole: empJobTitle,
        jobTitle: empJobTitle,
        roleTitle: empJobTitle,
        isOwner: false,
        phone: matchedEmployee.phone,
        permissions: matchedEmployee.permissions || ["sales"]
      };
      try {
        sessionStorage.setItem("currentUser", JSON.stringify(state.currentUser));
        sessionStorage.setItem("role", "employee");
        sessionStorage.setItem("authUser", JSON.stringify(state.currentUser));
        localStorage.setItem("currentUser", JSON.stringify(state.currentUser));
        localStorage.setItem("role", "employee");
      } catch (e) {}
      entered = "";
      renderApp();
      showToast("እንኳን ደህና መጡ: " + matchedEmployee.name + " (" + (matchedEmployee.role || "ሰራተኛ") + ")");
    } else {
      errBox.textContent = "❌ ትክክል አይደለም — እንደገና ይሞክሩ";
      wrap.classList.add("shake");
      setTimeout(function () { wrap.classList.remove("shake"); }, 400);
      entered = "";
      updateDots();
      setTimeout(function () { errBox.textContent = ""; }, 1500);
    }
  }

  var keypad = el("div", { class: "pin-keypad" });
  var keys = [
    { k: "1", sub: "" },
    { k: "2", sub: "ABC" },
    { k: "3", sub: "DEF" },
    { k: "4", sub: "GHI" },
    { k: "5", sub: "JKL" },
    { k: "6", sub: "MNO" },
    { k: "7", sub: "PQRS" },
    { k: "8", sub: "TUV" },
    { k: "9", sub: "WXYZ" },
    { k: "⌫", action: true },
    { k: "0", sub: "+" },
    { k: "✓", action: true }
  ];

  keys.forEach(function (item) {
    var k = item.k;
    var btn = el("button", {
      class: "pin-key" + (item.action ? " pin-key-action" : ""),
      type: "button"
    });

    if (item.action) {
      btn.appendChild(el("span", { class: "pin-key-num pin-key-icon" }, k));
    } else {
      btn.appendChild(el("span", { class: "pin-key-num" }, k));
      if (item.sub) {
        btn.appendChild(el("span", { class: "pin-key-sub" }, item.sub));
      }
    }

    btn.addEventListener("click", function () {
      if (k === "⌫") {
        if (entered.length > 0) {
          entered = entered.slice(0, -1);
          updateDots();
        }
        return;
      }
      if (k === "✓") {
        if (entered.length === 4) tryUnlock();
        return;
      }
      if (entered.length < 4) {
        entered += k;
        updateDots();
        if (entered.length === 4) setTimeout(tryUnlock, 120);
      }
    });
    keypad.appendChild(btn);
  });
  wrap.appendChild(keypad);

  var forgotBtn = el("button", { class: "lock-forgot-btn", type: "button" }, "PIN ረሳሁ?");
  forgotBtn.addEventListener("click", function () {
    if (confirm("PIN ከረሱ፣ የመተግበሪያ ቁልፍ (App Lock) ማጥፋት ይፈልጋሉ?")) {
      prefs.appLockEnabled = false;
      prefs.pinHash = "";
      savePrefs(prefs);
      state.locked = false;
      renderApp();
      showToast("የመተግበሪያ ቁልፍ ጠፍቷል");
    }
  });
  wrap.appendChild(forgotBtn);
  return wrap;
}

function openPinSetupModal(mode) {
  var stage = mode === "change" ? "old" : "new";
  var oldPin = "", newPin = "", confirmPin = "";
  openSheet(mode === "change" ? "PIN ቀይር" : "PIN ይፍጠሩ", function (body, close) {
    var msg = el("div", { class: "helpmsg", style: { textAlign: "center", fontSize: "13px", fontWeight: "600", marginBottom: "8px" } });
    var dotsRow = el("div", { class: "pin-dots" });
    var dots = [];
    for (var i = 0; i < 4; i++) {
      var d = el("div", { class: "pin-dot" });
      dots.push(d);
      dotsRow.appendChild(d);
    }
    var errBox = el("div", { class: "errmsg", style: { textAlign: "center", minHeight: "20px" } });
    var keypad = el("div", { class: "pin-keypad mt3" });
    body.appendChild(msg);
    body.appendChild(dotsRow);
    body.appendChild(errBox);
    body.appendChild(keypad);

    function current() { return stage === "old" ? oldPin : stage === "new" ? newPin : confirmPin; }
    function setCurrent(v) { if (stage === "old") oldPin = v; else if (stage === "new") newPin = v; else confirmPin = v; }
    function updateMsg() {
      msg.textContent = stage === "old" ? "የቆየ PIN ያስገቡ" : stage === "new" ? "አዲስ የ4-አሃዝ PIN ያስገቡ" : "አዲሱን PIN ደግመው ያረጋግጡ";
    }
    function updateDots() {
      var v = current();
      dots.forEach(function (d, idx) { d.classList.toggle("filled", idx < v.length); });
    }
    updateMsg();
    updateDots();

    var setupKeys = [
      { k: "1", sub: "" },
      { k: "2", sub: "ABC" },
      { k: "3", sub: "DEF" },
      { k: "4", sub: "GHI" },
      { k: "5", sub: "JKL" },
      { k: "6", sub: "MNO" },
      { k: "7", sub: "PQRS" },
      { k: "8", sub: "TUV" },
      { k: "9", sub: "WXYZ" },
      { k: "⌫", action: true },
      { k: "0", sub: "+" },
      { k: "✓", action: true }
    ];

    setupKeys.forEach(function (item) {
      var k = item.k;
      var btn = el("button", {
        class: "pin-key" + (item.action ? " pin-key-action" : ""),
        type: "button"
      });
      if (item.action) {
        btn.appendChild(el("span", { class: "pin-key-num pin-key-icon" }, k));
      } else {
        btn.appendChild(el("span", { class: "pin-key-num" }, k));
        if (item.sub) {
          btn.appendChild(el("span", { class: "pin-key-sub" }, item.sub));
        }
      }
      btn.addEventListener("click", function () {
        var v = current();
        if (k === "⌫") {
          setCurrent(v.slice(0, -1));
          updateDots();
          return;
        }
        if (k === "✓") {
          advance();
          return;
        }
        if (v.length < 4) {
          v += k;
          setCurrent(v);
          updateDots();
          if (v.length === 4) setTimeout(advance, 100);
        }
      });
      keypad.appendChild(btn);
    });

    function advance() {
      if (current().length !== 4) return;
      if (stage === "old") {
        if (simpleHash(oldPin) !== prefs.pinHash) {
          errBox.textContent = "የቆየው PIN ትክክል አይደለም";
          oldPin = "";
          updateDots();
          return;
        }
        stage = "new";
        updateMsg();
        updateDots();
        errBox.textContent = "";
      } else if (stage === "new") {
        stage = "confirm";
        updateMsg();
        updateDots();
        errBox.textContent = "";
      } else {
        if (newPin !== confirmPin) {
          errBox.textContent = "PIN አልተመሳሰለም — እንደገና ይሞክሩ";
          newPin = "";
          confirmPin = "";
          stage = "new";
          updateMsg();
          updateDots();
          return;
        }
        prefs.pinHash = simpleHash(newPin);
        prefs.appLockEnabled = true;
        savePrefs(prefs);
        showToast("✓ PIN ተቀምጧል");
        close();
        renderApp();
      }
    }
  }, null);
}

function renderSettings(container) {
  container.appendChild(el("div", { class: "eyebrow section" }, "⚙️ ቅንብሮች"));

  var appearanceCard = el("div", { class: "card section" });
  appearanceCard.appendChild(el("div", { class: "card-label mb2" }, "🎨 መልክ (Appearance)"));
  var darkRow = el("div", { class: "settings-row" }, [
    el("div", {}, [el("div", { class: "label" }, "ጨለማ ገጽታ (Dark Mode)"), el("div", { class: "sub" }, "ለአይን ምቹ የሆነ ጨለማ ቀለም")]),
    (function () {
      var lbl = el("label", { class: "switch" });
      var input = el("input", { type: "checkbox" }); input.checked = !!prefs.darkMode;
      input.addEventListener("change", function () { prefs.darkMode = input.checked; savePrefs(prefs); applyPrefs(prefs); });
      lbl.appendChild(input); lbl.appendChild(el("span", { class: "track" }));
      return lbl;
    })()
  ]);
  appearanceCard.appendChild(darkRow);

  var fontRow = el("div", { class: "settings-row" });
  fontRow.appendChild(el("div", {}, [el("div", { class: "label" }, "የፊደል መጠን (Font Size)"), el("div", { class: "sub" }, Math.round((prefs.fontZoom || 1) * 100) + "%")]));
  var fontBtns = el("div", { class: "flex gap2" });
  [["A-", -0.1], ["A", "reset"], ["A+", 0.1]].forEach(function (f) {
    var b = el("button", { class: "btn btn-outline btn-sm" }, f[0]);
    b.addEventListener("click", function () {
      prefs.fontZoom = f[1] === "reset" ? 1 : Math.max(0.8, Math.min(1.4, (prefs.fontZoom || 1) + f[1]));
      savePrefs(prefs); applyPrefs(prefs); renderApp();
    });
    fontBtns.appendChild(b);
  });
  fontRow.appendChild(fontBtns);
  appearanceCard.appendChild(fontRow);

  appearanceCard.appendChild(el("div", { class: "label", style: { marginTop: "10px" } }, "የገጽታ ቀለም (Theme Color)"));
  var swatchRow = el("div", { class: "color-swatch-row" });
  ACCENT_PRESETS.forEach(function (c) {
    var sw = el("button", { class: "color-swatch" + (prefs.accent === c ? " active" : ""), style: { background: c } });
    sw.addEventListener("click", function () { prefs.accent = c; savePrefs(prefs); applyPrefs(prefs); renderApp(); });
    swatchRow.appendChild(sw);
  });
  appearanceCard.appendChild(swatchRow);
  container.appendChild(appearanceCard);

  var secCard = el("div", { class: "card section", style: { borderColor: "#8b5cf6" } });
  secCard.appendChild(el("div", { class: "card-label mb2", style: { color: "#6d28d9" } }, "🔐 ደህንነት (Security)"));
  var lockRow = el("div", { class: "settings-row" }, [
    el("div", {}, [el("div", { class: "label" }, "የመተግበሪያ ቁልፍ (App Lock)"), el("div", { class: "sub" }, "መተግበሪያውን በPIN መክፈት")]),
    (function () {
      var lbl = el("label", { class: "switch" });
      var input = el("input", { type: "checkbox" }); input.checked = !!prefs.appLockEnabled;
      input.addEventListener("change", function () {
        if (input.checked) { input.checked = false; openPinSetupModal("set"); }
        else { prefs.appLockEnabled = false; prefs.pinHash = ""; savePrefs(prefs); renderApp(); }
      });
      lbl.appendChild(input); lbl.appendChild(el("span", { class: "track" }));
      return lbl;
    })()
  ]);
  secCard.appendChild(lockRow);
  if (prefs.appLockEnabled) {
    var changePinBtn = el("button", { class: "btn btn-outline btn-sm", style: { marginTop: "8px" } }, "🔑 PIN ቀይር");
    changePinBtn.addEventListener("click", function () { openPinSetupModal("change"); });
    secCard.appendChild(changePinBtn);
  }
  container.appendChild(secCard);
}

function BottomNav() {
  var items = [
    { key: "dashboard", label: "ዋና ገጽ", em: "🏠" },
    { key: "sales", label: "POS / ሽያጭ", em: "🛒" },
    { key: "expenses", label: "ወጪ መዝገብ", em: "🧾" },
    { key: "items", label: "ዕቃ / ክምችት", em: "📦" },
    { key: "reports", label: "ሪፖርት", em: "📊" }
  ];
  var nav = el("nav", { class: "nav", id: "bottomNav", "aria-label": "Bottom Navigation" });
  items.forEach(function (it) {
    var active = state.tab === it.key;
    var b = el("button", {
      id: "bottomNavBtn-" + it.key,
      class: "navbtn" + (active ? " active" : ""),
      type: "button",
      "aria-label": it.label,
      "aria-current": active ? "page" : null
    }, [
      el("span", { class: "em", "aria-hidden": "true" }, it.em),
      el("span", { class: "lbl" }, it.label)
    ]);
    b.addEventListener("click", function () { navigateToTab(it.key); });
    nav.appendChild(b);
  });
  return el("div", { class: "navwrap", id: "bottomNavWrap" }, [nav]);
}

export function renderApp() {
  var root = document.getElementById("root");
  clear(root);
  if (state.locked) {
    root.appendChild(buildLockScreen());
    return;
  }
  if (state.tab === "auth") {
    var authView = buildAuthContainer({
      onComplete: function (info) {
        showToast("✓ እንኳን ደህና መጡ! " + (info.ownerName || info.orgName || ""));
        var activePhone = (info && info.phone) || getActiveSessionPhone();
        if (activePhone) {
          try {
            sessionStorage.setItem("user_phone", activePhone);
            sessionStorage.setItem("active_phone", activePhone);
            localStorage.setItem("user_phone", activePhone);
            localStorage.setItem("active_phone", activePhone);
          } catch (e) {}
        }
        var p = loadPrefs();
        if (p && p.authUser) {
          state.currentUser = p.authUser;
          if (typeof window !== "undefined") window.currentUser = p.authUser;
        }
        state.data = loadData(activePhone);
        state.tab = "dashboard";
        renderApp();
        if (activePhone) {
          fetchRemoteUserDataIfAvailable(activePhone);
        }
      },
      onBack: function () {
        state.tab = "dashboard";
        renderApp();
      }
    });
    root.appendChild(authView);
    applyPrefs(prefs);
    return;
  }
  var app = el("div", { class: "app" });

  var subPageTitles = {
    sales: "🛍️ የዕለታዊ ሽያጭ",
    items: "📦 የዕቃ ክምችት (መጋዘን/ሱቅ)",
    expenses: "💸 የወጪዎች መዝገብ",
    reports: "📊 የፋይናንስ ሪፖርት",
    allocgoal: "💰 የትርፍ ክፍፍል",
    profile: "🏪 የንግድ መረጃ",
    profile_edit: "👤 ፕሮፋይል ማስተካከያ",
    settings: "⚙️ ቅንብሮች",
    loancenter: "🏦 የብድር ማዕከል"
  };

  if (state.tab === "items") {
    var isDetail = !!state.selectedLocation;
    var locations = getLocationsList(state.data);
    var curLoc = isDetail ? locations.find(function (l) { return l.id === state.selectedLocation; }) : null;
    var titleText = isDetail && curLoc ? ((curLoc.type === "warehouse" ? "🏢 " : "🏪 ") + curLoc.name) : "የዕቃ ክምችት (መጋዘን/ሱቅ)";

    var backBtn = el("button", {
      class: "inv-back-btn",
      title: isDetail ? "ወደ ሱቆችና መጋዘኖች ዝርዝር ተመለስ" : "ወደ ኋላ ተመለስ",
      "aria-label": "ወደ ኋላ ተመለስ"
    }, "←");

    backBtn.addEventListener("click", function () {
      if (isDetail) {
        state.selectedLocation = null;
        renderApp();
      } else {
        navigateBack();
      }
    });

    var onOpenSyncDetails = function () {
      openSyncDetailsSheet(function () { return state; }, function (newData) { state.data = newData; renderApp(); }, showToast, openSheet);
    };

    var itemsSyncBadge = createSyncStatusBadge(state.data, onOpenSyncDetails);
    var hamBtn = el("button", { class: "hamburger", style: { color: "#ffffff", marginLeft: "6px" } }, "☰");
    hamBtn.addEventListener("click", openMainMenu);

    var topBarChildren = [backBtn, el("h1", { class: "inv-title", style: { flex: 1 } }, titleText), itemsSyncBadge, hamBtn];
    app.appendChild(el("div", { class: "inv-top-bar" }, topBarChildren));
  } else if (subPageTitles[state.tab]) {
    var subBackBtn = el("button", {
      class: "inv-back-btn",
      title: "ወደ ኋላ ተመለስ",
      "aria-label": "ወደ ኋላ ተመለስ"
    }, "←");

    subBackBtn.addEventListener("click", function () {
      navigateBack();
    });

    var onOpenSyncDetailsSub = function () {
      openSyncDetailsSheet(function () { return state; }, function (newData) { state.data = newData; renderApp(); }, showToast, openSheet);
    };

    var subSyncBadge = createSyncStatusBadge(state.data, onOpenSyncDetailsSub);
    var subHamBtn = el("button", { class: "hamburger", style: { color: "#ffffff", marginLeft: "6px" } }, "☰");
    subHamBtn.addEventListener("click", openMainMenu);

    var subTopBar = el("div", { class: "inv-top-bar" }, [
      subBackBtn,
      el("h1", { class: "inv-title", style: { flex: 1 } }, subPageTitles[state.tab]),
      subSyncBadge,
      subHamBtn
    ]);
    app.appendChild(subTopBar);
  } else {
    var mainHamBtn = el("button", { class: "hamburger" }, "☰");
    mainHamBtn.addEventListener("click", openMainMenu);
    var onOpenSyncDetailsMain = function () {
      openSyncDetailsSheet(function () { return state; }, function (newData) { state.data = newData; renderApp(); }, showToast, openSheet);
    };
    var mainSyncBadge = createSyncStatusBadge(state.data, onOpenSyncDetailsMain);
    app.appendChild(el("div", { class: "header" }, [mainHamBtn, el("h1", { style: { flex: 1 } }, "የሱቅ መቆጣጠሪያ ሲስተም"), mainSyncBadge]));
  }
  if (!storageAvailable) {
    app.appendChild(el("div", { style: { background: "#fff4e5", color: "#92400e", fontSize: "11px", padding: "8px 16px", textAlign: "center" } },
      "ማሳሰቢያ: ውሂብ በዚህ ስልክ ላይ በራስ-ሰር መቀመጥ አልቻለም (" + (storageErrorDetail || "unknown") + ")።"));
  }
  var content = el("div", { class: "content" });
  if (state.tab === "dashboard") renderDashboard(content);
  else if (state.tab === "sales") renderSales(content);
  else if (state.tab === "items") renderItems(content);
  else if (state.tab === "expenses") renderExpenses(content);
  else if (state.tab === "reports") renderReports(content);
  else if (state.tab === "profile") renderProfile(content);
  else if (state.tab === "profile_edit") renderUserProfileEdit(content);
  else if (state.tab === "loancenter") renderLoanCenter(content);
  else if (state.tab === "allocgoal") renderAllocationAndGoalPage(content);
  else if (state.tab === "settings") renderSettings(content);
  else renderDashboard(content);
  app.appendChild(content);

  // Hide BottomNav on inventory and store detail sub-pages as requested
  if (state.tab !== "items") {
    app.appendChild(BottomNav());
  }

  root.appendChild(app);
  applyPrefs(prefs);
}

async function fetchRemoteUserDataIfAvailable(phone) {
  var p = (phone || getActiveSessionPhone() || "").trim().replace(/\s+/g, "");
  if (!p || p === "0911000000") return;

  var currentStoreId = getCurrentStoreId();

  // If no currentStoreId, lookup user profile from Firestore users/{phone} to get their assigned store_id
  if (!currentStoreId) {
    try {
      var userProf = await fetchUserFromFirestore(p);
      if (userProf && (userProf.store_id || userProf.storeId)) {
        currentStoreId = String(userProf.store_id || userProf.storeId).trim();
        try {
          sessionStorage.setItem("current_store_id", currentStoreId);
          localStorage.setItem("current_store_id", currentStoreId);
        } catch (e) {}
        state.currentStoreId = currentStoreId;
      }
    } catch (err) {
      console.warn("[Firestore] Error resolving user store_id:", err);
    }
  }

  // Multi-Tenant Isolation: Query Firestore strictly by store_id
  if (currentStoreId) {
    try {
      var results = await Promise.all([
        fetchSalesByStoreId(currentStoreId),
        fetchInventoryByStoreId(currentStoreId),
        fetchExpensesByStoreId(currentStoreId),
        fetchShopFromFirestore(currentStoreId)
      ]);
      var remoteSales = results[0];
      var remoteInventory = results[1];
      var remoteExpenses = results[2];
      var shopDoc = results[3];

      var storeModified = false;
      state.data.store_id = currentStoreId;
      state.data.storeId = currentStoreId;
      state.data.shopId = currentStoreId;

      if (Array.isArray(remoteInventory)) {
        state.data.items = remoteInventory.filter(function (it) { return !it.store_id || it.store_id === currentStoreId; });
        storeModified = true;
      }
      if (Array.isArray(remoteSales)) {
        state.data.sales = remoteSales.filter(function (s) { return !s.store_id || s.store_id === currentStoreId; });
        storeModified = true;
      }
      if (Array.isArray(remoteExpenses)) {
        state.data.expenses = remoteExpenses.filter(function (e) { return !e.store_id || e.store_id === currentStoreId; });
        storeModified = true;
      }
      if (shopDoc) {
        if (shopDoc.name) {
          state.data.profile = state.data.profile || {};
          state.data.profile.shopName = shopDoc.name;
          storeModified = true;
        }
        if (shopDoc.profile && typeof shopDoc.profile === "object") {
          state.data.profile = Object.assign({}, state.data.profile || {}, shopDoc.profile);
          storeModified = true;
        }
      }
      if (storeModified) {
        saveLocal(state.data, p, currentStoreId);
        renderApp();
      }
    } catch (e) {
      console.warn("[Firestore] Direct store sync fallback:", e);
    }
  }

  // Fallback endpoint fetch
  fetch("/api/users/" + encodeURIComponent(p))
    .then(function (res) { return res.json(); })
    .then(function (resData) {
      if (resData && resData.ok && resData.data) {
        var storeDoc = resData.data;
        var sId = currentStoreId || storeDoc.store_id || storeDoc.storeId || storeDoc.shopId;
        var modified = false;
        if (Array.isArray(storeDoc.inventory)) {
          state.data.items = storeDoc.inventory.filter(function (it) { return !sId || !it.store_id || it.store_id === sId; });
          modified = true;
        }
        if (Array.isArray(storeDoc.sales)) {
          state.data.sales = storeDoc.sales.filter(function (s) { return !s.store_id || s.store_id === sId; });
          modified = true;
        }
        if (Array.isArray(storeDoc.expenses)) {
          state.data.expenses = storeDoc.expenses.filter(function (e) { return !sId || !e.store_id || e.store_id === sId; });
          modified = true;
        }
        if (Array.isArray(storeDoc.shipments)) {
          state.data.shipments = storeDoc.shipments;
          modified = true;
        }
        if (Array.isArray(storeDoc.customers)) {
          state.data.customers = storeDoc.customers;
          modified = true;
        }
        if (storeDoc.profile && typeof storeDoc.profile === "object") {
          state.data.profile = Object.assign({}, state.data.profile || {}, storeDoc.profile);
          modified = true;
        }
        if (modified) {
          saveLocal(state.data, p, sId);
          renderApp();
        }
      }
    })
    .catch(function (err) {
      console.warn("User data remote fetch fallback:", err);
    });
}

// Initial mount
renderApp();

initOfflineSyncEngine(
  function () { return state; },
  function (newData) { state.data = newData; renderApp(); },
  showToast
);

if (initialSessionPhone) {
  fetchRemoteUserDataIfAvailable(initialSessionPhone);
}

// Service Worker registration for offline use
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js").catch(function (err) {
      console.warn("Service worker registration:", err);
    });
  });
}
