// Firebase Firestore Integration Module
// Handles direct persistence to users/{phone} and shops/{store_id}
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  setLogLevel,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  FieldValue
} from "firebase/firestore";

// Firebase configuration: seniy-624d6 production project
const firebaseConfig = {
  apiKey: "AIzaSyCmAI1Op2i-HD7Qy66ZqHoxjpr9UTt4vPM",
  authDomain: "seniy-624d6.firebaseapp.com",
  databaseURL: "https://seniy-624d6-default-rtdb.firebaseio.com",
  projectId: "seniy-624d6",
  storageBucket: "seniy-624d6.firebasestorage.app",
  messagingSenderId: "631207328604",
  appId: "1:631207328604:web:7867624bd48cbc0baa5f99",
  measurementId: "G-JXLBQ2FH06"
};

export function isFirestoreConfigured() {
  const key = firebaseConfig.apiKey || "";
  const proj = firebaseConfig.projectId || "";
  if (!key || key.includes("DummyKey") || !proj || proj === "shop-control-system") {
    return false;
  }
  return true;
}

let app = null;
let db = null;

try {
  setLogLevel("error");
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  try {
    db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true
    });
  } catch (initErr) {
    db = getFirestore(app);
  }
} catch (err) {
  console.warn("[Firebase] Initialization notice:", err);
}

/**
 * Wraps a promise with a timeout safeguard.
 * If the network or Firestore request takes more than specified ms, breaks the promise
 * and rejects with the exact error: "Network timeout. Please check your connection or Firestore configuration."
 */
export function withTimeout(promise, ms = 5000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Network timeout. Please check your connection or Firestore configuration."));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// Ensure window.firebase compatibility bridge for legacy scripts
if (typeof window !== "undefined") {
  if (!window.firebase) {
    window.firebase = {};
  }
  window.firebase.app = app;
  window.firebase.firestore = function () {
    return {
      collection: function (collName) {
        return {
          doc: function (docId) {
            return {
              set: function (data, opts) {
                if (db) {
                  return setDoc(doc(db, collName, docId), data, opts || {});
                }
                return Promise.resolve();
              },
              get: function () {
                if (db) {
                  return getDoc(doc(db, collName, docId));
                }
                return Promise.resolve({ exists: false, data: function () { return null; } });
              },
              update: function (data) {
                if (db) {
                  return updateDoc(doc(db, collName, docId), data);
                }
                return Promise.resolve();
              }
            };
          },
          where: function (field, op, val) {
            return {
              get: function () {
                if (db) {
                  var q = query(collection(db, collName), where(field, op, val));
                  return getDocs(q);
                }
                return Promise.resolve({ empty: true, docs: [] });
              }
            };
          }
        };
      },
      FieldValue: {
        serverTimestamp: function () {
          try {
            return serverTimestamp();
          } catch (e) {
            return Date.now();
          }
        }
      }
    };
  };
  window.firebase.firestore.FieldValue = {
    serverTimestamp: function () {
      try {
        return serverTimestamp();
      } catch (e) {
        return Date.now();
      }
    }
  };
}

export function formatToInternationalPhone(rawPhone) {
  let p = String(rawPhone || "").trim().replace(/[\s\-()]/g, "");
  let digits = p.replace(/\D/g, "");
  if (digits.startsWith("2510") && digits.length === 13) {
    return "+251" + digits.slice(4);
  }
  if (digits.startsWith("251") && digits.length === 12) {
    return "+" + digits;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return "+251" + digits.slice(1);
  }
  if ((digits.startsWith("9") || digits.startsWith("7")) && digits.length === 9) {
    return "+251" + digits;
  }
  if (p.startsWith("+") && digits.length >= 9) {
    return "+" + digits;
  }
  if (digits.length >= 9) {
    return "+251" + (digits.startsWith("0") ? digits.slice(1) : digits);
  }
  return digits ? ("+" + digits) : "";
}

export function formatToLocalPhone(rawPhone) {
  let p = String(rawPhone || "").trim().replace(/[\s\-()]/g, "");
  let digits = p.replace(/\D/g, "");
  if (digits.startsWith("2510") && digits.length === 13) {
    return "0" + digits.slice(4);
  }
  if (digits.startsWith("251") && digits.length === 12) {
    return "0" + digits.slice(3);
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return digits;
  }
  if (digits.length === 9 && (digits.startsWith("9") || digits.startsWith("7"))) {
    return "0" + digits;
  }
  return digits;
}

export function getFirestorePhoneCandidates(phone) {
  const clean = String(phone || "").trim().replace(/[\s\-()]/g, "");
  if (!clean) return [];
  const intl = formatToInternationalPhone(clean);
  const local = formatToLocalPhone(clean);
  const digits = clean.replace(/\D/g, "");

  const candidates = [];
  // 1. Primary Document ID format in Firestore: +251XXXXXXXXX
  if (intl && candidates.indexOf(intl) === -1) candidates.push(intl);
  // 2. 09XXXXXXXX / 07XXXXXXXX (Local format)
  if (local && candidates.indexOf(local) === -1) candidates.push(local);
  // 3. Raw clean string
  if (clean && candidates.indexOf(clean) === -1) candidates.push(clean);
  // 4. Pure digits (251XXXXXXXXX)
  if (digits && candidates.indexOf(digits) === -1) candidates.push(digits);

  return candidates;
}

/**
 * 1. Persist New User Account directly to users/{phone}
 * Document ID format: users/+251XXXXXXXXX
 */
export async function saveUserToFirestore(params) {
  let rawPhone = String(params.phone || "").trim().replace(/\s+/g, "");
  if (!rawPhone) {
    console.error("[Firestore Registration Error] Missing phone number in saveUserToFirestore:", params);
    return { ok: false, error: "ስልክ ቁጥር አልተገኘም" };
  }

  // Ensure format +251XXXXXXXXX
  let phone = formatToInternationalPhone(rawPhone) || rawPhone;

  const fullName = String(params.full_name || params.fullName || params.name || "የሱቅ ባለቤት").trim();
  const password = String(params.password || "1234").trim();
  const role = String(params.role || "owner").trim();
  const digits = phone.replace(/\D/g, "");
  const storeId = String(params.store_id || params.storeId || ("store_" + digits)).trim();
  const isOwner = params.isOwner !== undefined ? Boolean(params.isOwner) : true;

  const userPayload = {
    full_name: fullName,
    fullName: fullName,
    name: fullName,
    phone: phone,
    password: password,
    role: role,
    isOwner: isOwner,
    store_id: storeId,
    storeId: storeId,
    created_at: (typeof serverTimestamp === "function") ? serverTimestamp() : Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  console.log(`[Firestore] Executing explicit write to users/${phone}:`, userPayload);

  let firestoreSuccess = false;
  if (db && isFirestoreConfigured()) {
    try {
      const userRef = doc(db, "users", phone);
      await withTimeout(setDoc(userRef, userPayload, { merge: true }), 3000);
      console.log(`[Firestore] ✓ Successfully persisted user account in users/${phone}`);
      firestoreSuccess = true;
    } catch (error) {
      console.warn("[Firestore] Direct write warning, falling back to backend persistence:", error?.message);
    }
  }

  // Dual-persistence via backend API for complete reliability
  let apiSuccess = false;
  let resData = null;
  try {
    const res = await fetch("/api/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userPayload)
    });
    resData = await res.json();
    if (resData && resData.ok) {
      apiSuccess = true;
      console.log(`[Backend API] Sync result for users/${phone}:`, resData);
    }
  } catch (apiErr) {
    console.warn(`[Backend API] Sync warning for users/${phone}:`, apiErr);
  }

  if (firestoreSuccess || apiSuccess) {
    return { ok: true, data: userPayload, firestoreSuccess, user: resData?.user || userPayload, shop: resData?.shop };
  }

  // If both failed and Firestore is unconfigured, ensure local cache fallback works
  try {
    const localUsers = JSON.parse(localStorage.getItem("scs_users_store") || "{}");
    localUsers[phone] = userPayload;
    localStorage.setItem("scs_users_store", JSON.stringify(localUsers));
    return { ok: true, data: userPayload, firestoreSuccess: false, user: userPayload };
  } catch (localErr) {
    return { ok: false, error: "የተጠቃሚ መለያ ማስቀመጥ አልተቻለም" };
  }
}

/**
 * 2. Persist Shop Document directly to shops/{store_id}
 * Document ID format: shops/{store_id}
 */
export async function saveShopToFirestore(params) {
  const storeId = String(params.store_id || params.storeId || params.shopId || "").trim();
  if (!storeId) {
    console.error("[Firestore] saveShopToFirestore error: Missing store_id");
    return { ok: false, error: "የሱቅ መለያ (store_id) አልተገኘም" };
  }

  const phone = String(params.owner_phone || params.ownerPhoneNumber || params.phone || "").trim();
  const shopName = String(params.name || (params.profile && params.profile.shopName) || "የእኔ ሱቅ").trim();

  const shopPayload = {
    store_id: storeId,
    shopId: storeId,
    name: shopName,
    owner_phone: phone,
    ownerPhoneNumber: phone,
    owner_id: phone,
    ownerPin: params.ownerPin || params.password || "",
    employees: Array.isArray(params.employees) ? params.employees : [],
    inventory: Array.isArray(params.inventory) ? params.inventory : (params.items || []),
    sales: Array.isArray(params.sales) ? params.sales : [],
    expenses: Array.isArray(params.expenses) ? params.expenses : [],
    shipments: Array.isArray(params.shipments) ? params.shipments : [],
    customers: Array.isArray(params.customers) ? params.customers : [],
    profile: params.profile || { shopName: shopName, ownerName: params.ownerName || "", phone: phone },
    created_at: (typeof serverTimestamp === "function") ? serverTimestamp() : Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  console.log(`[Firestore] Executing explicit write to shops/${storeId}:`, shopPayload);

  let firestoreSuccess = false;
  if (db && isFirestoreConfigured()) {
    try {
      const shopRef = doc(db, "shops", storeId);
      await withTimeout(setDoc(shopRef, shopPayload, { merge: true }), 3000);
      console.log(`[Firestore] ✓ Successfully persisted shop document in shops/${storeId}`);
      firestoreSuccess = true;
    } catch (error) {
      console.warn("[Firestore] Direct shop write warning:", error?.message);
    }
  }

  let apiSuccess = false;
  try {
    const res = await fetch("/api/users/" + encodeURIComponent(phone || storeId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(shopPayload)
    });
    const resData = await res.json();
    if (resData && resData.ok) {
      apiSuccess = true;
      console.log(`[Backend API] Sync result for shops/${storeId}:`, resData);
    }
  } catch (apiErr) {
    console.warn(`[Backend API] Sync warning for shops/${storeId}:`, apiErr);
  }

  if (firestoreSuccess || apiSuccess) {
    return { ok: true, data: shopPayload, firestoreSuccess };
  }

  try {
    const localShops = JSON.parse(localStorage.getItem("scs_shops_store") || "{}");
    localShops[storeId] = shopPayload;
    localStorage.setItem("scs_shops_store", JSON.stringify(localShops));
    return { ok: true, data: shopPayload, firestoreSuccess: false };
  } catch (e) {
    return { ok: true, data: shopPayload, firestoreSuccess: false };
  }
}

/**
 * 3. Fetch User Document from users/{phone}
 * Handles both "09..." and "+251..." string formats so login never fails due to country code formatting
 */
export async function fetchUserFromFirestore(phone) {
  const candidates = getFirestorePhoneCandidates(phone);
  if (!candidates || candidates.length === 0) return null;

  console.log(`[Firestore] Fetching user for "${phone}" across candidate keys:`, candidates);

  // 1. Direct Document ID check in users/{candidate} (e.g. users/+251XXXXXXXXX, then users/09XXXXXXXX, etc.)
  if (db && isFirestoreConfigured()) {
    for (const docKey of candidates) {
      try {
        const userRef = doc(db, "users", docKey);
        const snap = await withTimeout(getDoc(userRef), 2500);
        if (snap.exists()) {
          const uData = snap.data();
          console.log(`[Firestore] ✓ Retrieved user document from users/${docKey}:`, uData);
          return uData;
        }
      } catch (err) {
        console.warn(`[Firestore] Could not fetch users/${docKey}:`, err?.message);
      }
    }

    // 2. Query collection where phone field matches any candidate
    try {
      for (const cand of candidates) {
        const q = query(collection(db, "users"), where("phone", "==", cand));
        const querySnap = await withTimeout(getDocs(q), 2500);
        if (!querySnap.empty) {
          const docData = querySnap.docs[0].data();
          console.log(`[Firestore] ✓ Found user via phone field query (phone == "${cand}"):`, docData);
          return docData;
        }
      }
    } catch (queryErr) {
      console.warn("[Firestore] Query fallback warning on users collection:", queryErr?.message);
    }
  }

  // 3. Fallback: Query backend API /api/users/:phone across candidates
  for (const cand of candidates) {
    try {
      const res = await fetch("/api/users/" + encodeURIComponent(cand));
      const json = await res.json();
      if (json.ok && json.user) {
        console.log(`[Backend API] ✓ Retrieved user for "${cand}"`);
        return json.user;
      }
    } catch (e) {}
  }

  // 4. Local storage fallback
  try {
    const localUsers = JSON.parse(localStorage.getItem("scs_users_store") || "{}");
    for (const cand of candidates) {
      if (localUsers[cand]) {
        return localUsers[cand];
      }
    }
  } catch (e) {}

  return null;
}

/**
 * 4. Update "ሙሉ ስም" directly targeting users/{phone}.full_name in Firestore
 */
export async function updateUserFullNameInFirestore(phone, fullName) {
  const candidates = getFirestorePhoneCandidates(phone);
  const newName = String(fullName || "").trim();
  if (candidates.length === 0 || !newName) {
    console.error("[Firestore] updateUserFullNameInFirestore missing phone or fullName");
    return { ok: false, error: "ስልክ እና ሙሉ ስም ያስፈልጋል" };
  }

  const updatePayload = {
    full_name: newName,
    fullName: newName,
    name: newName,
    updated_at: (typeof serverTimestamp === "function") ? serverTimestamp() : Date.now(),
    updatedAt: Date.now()
  };

  console.log(`[Firestore] Updating user profile name across candidates (${candidates.join(", ")}) -> "${newName}"`);

  let firestoreSuccess = false;
  if (db) {
    for (const cand of candidates) {
      try {
        const userRef = doc(db, "users", cand);
        await setDoc(userRef, updatePayload, { merge: true });
        console.log(`[Firestore] ✓ users/${cand}.full_name updated successfully!`);
        firestoreSuccess = true;
      } catch (err) {
        console.error(`[Firestore] Failed updating users/${cand}.full_name:`, err);
      }
    }
  }

  // Also sync with backend endpoint
  for (const cand of candidates) {
    try {
      await fetch("/api/users/" + encodeURIComponent(cand) + "/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload)
      });
    } catch (e) {}
  }

  return { ok: true, full_name: newName, firestoreSuccess: firestoreSuccess };
}

/**
 * 5. Query any collection strictly by store_id (.where('store_id', '==', storeId))
 */
export async function queryByStoreId(collName, storeId) {
  const sId = String(storeId || "").trim();
  if (!sId) return [];
  try {
    if (db) {
      const q = query(collection(db, collName), where("store_id", "==", sId));
      const querySnap = await getDocs(q);
      const results = [];
      querySnap.forEach((docItem) => {
        results.push({ id: docItem.id, ...docItem.data() });
      });
      console.log(`[Firestore] Query ${collName} by store_id=${sId} returned ${results.length} records`);
      return results;
    }
  } catch (err) {
    console.error(`[Firestore] Query ${collName} by store_id failed:`, err);
  }
  return [];
}

/**
 * 6. Fetch shop document directly from shops/{store_id}
 */
export async function fetchShopFromFirestore(storeId) {
  const sId = String(storeId || "").trim();
  if (!sId) return null;
  try {
    if (db) {
      const shopRef = doc(db, "shops", sId);
      const snap = await getDoc(shopRef);
      if (snap.exists()) {
        console.log(`[Firestore] ✓ Retrieved shops/${sId}:`, snap.data());
        return snap.data();
      }
    }
  } catch (err) {
    console.warn(`[Firestore] Fetch shops/${sId} warning:`, err);
  }

  try {
    const res = await fetch("/api/shops/" + encodeURIComponent(sId));
    const json = await res.json();
    if (json && json.ok && json.shop) {
      return json.shop;
    }
  } catch (e) {}

  return null;
}

/**
 * 7. Fetch Sales strictly filtered by store_id:
 *    Queries collection("sales") with .where('store_id', '==', storeId)
 */
export async function fetchSalesByStoreId(storeId) {
  const sId = String(storeId || "").trim();
  if (!sId) return [];
  try {
    if (db) {
      const q = query(collection(db, "sales"), where("store_id", "==", sId));
      const snap = await getDocs(q);
      const list = [];
      snap.forEach((docItem) => {
        list.push({ id: docItem.id, ...docItem.data() });
      });
      if (list.length > 0) {
        console.log(`[Firestore] Retrieved ${list.length} sales where store_id == ${sId}`);
        return list;
      }
    }
  } catch (err) {
    console.warn(`[Firestore] Query sales by store_id=${sId} warning:`, err);
  }

  // Fallback: check embedded sales inside shops/{store_id}
  try {
    const shop = await fetchShopFromFirestore(sId);
    if (shop && Array.isArray(shop.sales)) {
      return shop.sales.filter((s) => !s.store_id || s.store_id === sId);
    }
  } catch (err) {}

  return [];
}

/**
 * 8. Fetch Inventory strictly filtered by store_id:
 *    Queries collection("inventory") with .where('store_id', '==', storeId)
 */
export async function fetchInventoryByStoreId(storeId) {
  const sId = String(storeId || "").trim();
  if (!sId) return [];
  try {
    if (db) {
      const q = query(collection(db, "inventory"), where("store_id", "==", sId));
      const snap = await getDocs(q);
      const list = [];
      snap.forEach((docItem) => {
        list.push({ id: docItem.id, ...docItem.data() });
      });
      if (list.length > 0) {
        console.log(`[Firestore] Retrieved ${list.length} inventory items where store_id == ${sId}`);
        return list;
      }
    }
  } catch (err) {
    console.warn(`[Firestore] Query inventory by store_id=${sId} warning:`, err);
  }

  // Fallback: check embedded inventory inside shops/{store_id}
  try {
    const shop = await fetchShopFromFirestore(sId);
    if (shop && Array.isArray(shop.inventory)) {
      return shop.inventory.filter((it) => !it.store_id || it.store_id === sId);
    }
  } catch (err) {}

  return [];
}

/**
 * 9. Fetch Expenses strictly filtered by store_id:
 *    Queries collection("expenses") with .where('store_id', '==', storeId)
 */
export async function fetchExpensesByStoreId(storeId) {
  const sId = String(storeId || "").trim();
  if (!sId) return [];
  try {
    if (db) {
      const q = query(collection(db, "expenses"), where("store_id", "==", sId));
      const snap = await getDocs(q);
      const list = [];
      snap.forEach((docItem) => {
        list.push({ id: docItem.id, ...docItem.data() });
      });
      if (list.length > 0) {
        console.log(`[Firestore] Retrieved ${list.length} expenses where store_id == ${sId}`);
        return list;
      }
    }
  } catch (err) {
    console.warn(`[Firestore] Query expenses by store_id=${sId} warning:`, err);
  }

  // Fallback: check embedded expenses inside shops/{store_id}
  try {
    const shop = await fetchShopFromFirestore(sId);
    if (shop && Array.isArray(shop.expenses)) {
      return shop.expenses.filter((e) => !e.store_id || e.store_id === sId);
    }
  } catch (err) {}

  return [];
}

/**
 * 10. Direct writes with store_id attached
 */
export async function saveSaleToFirestore(sale, storeId) {
  if (!sale) return;
  const sId = String(storeId || sale.store_id || sale.storeId || "").trim();
  const record = Object.assign({}, sale, {
    store_id: sId,
    storeId: sId,
    created_at: (typeof serverTimestamp === "function") ? serverTimestamp() : Date.now()
  });
  if (db && sId) {
    try {
      const saleId = String(record.id || ("sale_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)));
      await setDoc(doc(db, "sales", saleId), record, { merge: true });
    } catch (e) {
      console.warn("[Firestore] saveSaleToFirestore error:", e);
    }
  }
}

export async function saveExpenseToFirestore(expense, storeId) {
  if (!expense) return;
  const sId = String(storeId || expense.store_id || expense.storeId || "").trim();
  const record = Object.assign({}, expense, {
    store_id: sId,
    storeId: sId,
    created_at: (typeof serverTimestamp === "function") ? serverTimestamp() : Date.now()
  });
  if (db && sId) {
    try {
      const expId = String(record.id || ("exp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)));
      await setDoc(doc(db, "expenses", expId), record, { merge: true });
    } catch (e) {
      console.warn("[Firestore] saveExpenseToFirestore error:", e);
    }
  }
}

export async function saveInventoryItemToFirestore(item, storeId) {
  if (!item) return;
  const sId = String(storeId || item.store_id || item.storeId || "").trim();
  const record = Object.assign({}, item, {
    store_id: sId,
    storeId: sId,
    updated_at: (typeof serverTimestamp === "function") ? serverTimestamp() : Date.now()
  });
  if (db && sId) {
    try {
      const itemId = String(record.id || ("item_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)));
      await setDoc(doc(db, "inventory", itemId), record, { merge: true });
    } catch (e) {
      console.warn("[Firestore] saveInventoryItemToFirestore error:", e);
    }
  }
}

export { db, app, doc, setDoc, getDoc };
export default app;
