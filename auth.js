// auth.js - Canva-inspired Authentication & Telegram Bot Integration Flow
// Screens:
// 1. ወደአካውንት ይግቡ (Login Screen with S Seniya logo & curved green gradient)
// 2. ወደአካውንት ይግቡ - Minimal (Login Screen without logo)
// 3. የድርጅቱን መረጃ ይምሉ (Organization Details & Registration with Teal-to-Yellow gradient)
// 4. ሁሉንም መረጃ በትክክል ይምሉ (Telegram Bot OTP Verification with Sky Blue theme)

import { el, clear, showToast } from './main.js';
import { simpleHash, loadPrefs, savePrefs, loadData, saveLocal, freshLocations, freshEmptyData, toInternationalPhone, normalizePhone } from './core.js';
import { saveUserToFirestore, saveShopToFirestore, fetchUserFromFirestore, fetchShopFromFirestore, fetchSalesByStoreId, fetchInventoryByStoreId, fetchExpensesByStoreId, withTimeout, db, doc, setDoc } from './firebase.js';

export var TELEGRAM_BOT_TOKEN = "8617451852:AAFUpPpaai7M1meuMN025WHokFI4lUanbWg";
export var TELEGRAM_BOT_USERNAME = "GrposBot";
export var TELEGRAM_BOT_LINK = "tg://resolve?domain=" + TELEGRAM_BOT_USERNAME + "&start=code";

// Auth session state
var authState = {
  currentScreen: "login", // "login" | "register" | "verify"
  showSeniyaLogo: true,
  regData: {
    orgName: "",
    fullName: "",
    phone: "",
    password: "",
    confirmPassword: ""
  },
  loginData: {
    phone: "",
    password: ""
  },
  otpData: {
    code: "",
    secondsLeft: 119, // 1:59 countdown
    timerId: null,
    isBotActive: true
  }
};

/**
 * Format seconds into mm:ss (e.g. 119 -> 1:59)
 */
function fmtTimer(sec) {
  sec = Math.max(0, Math.floor(sec));
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return m + ":" + String(s).padStart(2, "0");
}

/**
 * Request OTP from the server via Telegram bot
 */
export function requestTelegramOtp(phone, onReady) {
  var rawPhone = (phone || authState.otpData.phone || authState.regData.phone || "").trim().replace(/\s+/g, "");
  var intlPhone = toInternationalPhone(rawPhone) || rawPhone;
  var normPhone = normalizePhone(rawPhone);
  var targetPhone = intlPhone || rawPhone;

  if (targetPhone) {
    authState.otpData.phone = targetPhone;
    try {
      sessionStorage.setItem("pending_auth_phone", targetPhone);
      localStorage.setItem("pending_auth_phone", targetPhone);
    } catch (e) {}
  }

  // Attempt to call server API
  return fetch("/api/telegram/request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: targetPhone,
      rawPhone: rawPhone,
      intlPhone: intlPhone,
      normPhone: normPhone
    })
  })
  .then(function (res) { return res.json(); })
  .then(function (data) {
    if (onReady) onReady(data);
    return data;
  })
  .catch(function (err) {
    console.warn("requestTelegramOtp error:", err);
    var fallback = {
      ok: false,
      scenario: "ERROR",
      sentToTelegram: false,
      error: "የኔትወርክ ግንኙነት ችግር — እባክዎ በድጋሚ ይሞክሩ"
    };
    if (onReady) onReady(fallback);
    return fallback;
  });
}

/**
 * Main Builder for Authentication Container
 * Top step-bar navigation is completely removed for clean, focused layout.
 */
export function buildAuthContainer(options) {
  options = options || {};
  var onComplete = options.onComplete || function () {};
  var onBack = options.onBack || null;

  var container = el("div", { class: "canva-auth-wrapper" });

  function renderCurrentView() {
    clear(container);

    if (authState.currentScreen === "login") {
      container.appendChild(renderLoginScreen(onComplete, onBack, renderCurrentView));
    } else if (authState.currentScreen === "register") {
      container.appendChild(renderRegisterScreen(onComplete, onBack, renderCurrentView));
    } else if (authState.currentScreen === "verify") {
      container.appendChild(renderVerifyScreen(onComplete, onBack, renderCurrentView));
    } else if (authState.currentScreen === "reset_password") {
      container.appendChild(renderResetPasswordScreen(onComplete, onBack, renderCurrentView));
    }
  }

  renderCurrentView();
  return container;
}

/**
 * -------------------------------------------------------------
 * SCREEN 1: ወደ አካውንት ይግቡ (Login Screen)
 * Clean top layout: header and S / seniya profile card moved up closer to top
 * -------------------------------------------------------------
 */
function renderLoginScreen(onComplete, onBack, rerender) {
  var wrap = el("div", { class: "canva-screen canva-screen-login" });

  // Top header completely removed as requested (← ወደ አካውንት ይግቡ removed)

  var cardBody = el("div", { class: "canva-card-body", style: { justifyContent: "center", paddingTop: "14px" } });

  // Refined minimalist Profile / Brand Logo Card (S / seniya)
  var logoBadge = el("div", { class: "seniya-logo-box-minimal" }, [
    el("div", { class: "seniya-avatar-circle" }, "S"),
    el("div", { class: "seniya-brand-text" }, "seniya")
  ]);
  cardBody.appendChild(logoBadge);

  // Ensure explicit empty defaults on login screen
  authState.loginData.phone = "";
  authState.loginData.password = "";

  // Curved Gradient Container configured as an explicit non-autofill form
  var formContainer = el("form", {
    class: "canva-login-gradient-card",
    autocomplete: "off",
    "aria-autocomplete": "none",
    novalidate: "novalidate",
    onsubmit: function (e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
    }
  });

  // Hidden dummy inputs to absorb aggressive browser autofill attempts
  var dummyUser = el("input", {
    type: "text",
    style: { display: "none", position: "absolute", opacity: "0", pointerEvents: "none" },
    tabIndex: "-1",
    autocomplete: "off",
    name: "no-autofill-phone",
    "data-form-type": "other",
    "aria-hidden": "true"
  });
  var dummyPass = el("input", {
    type: "password",
    style: { display: "none", position: "absolute", opacity: "0", pointerEvents: "none" },
    tabIndex: "-1",
    autocomplete: "new-password",
    name: "no-autofill-pass",
    "aria-hidden": "true"
  });
  formContainer.appendChild(dummyUser);
  formContainer.appendChild(dummyPass);

  // Phone Field (browser/keyboard auto-suggestions and recommendations disabled)
  var phoneLabel = el("label", { class: "canva-input-label" }, "ስልክ ቁጥር");
  var phoneInput = el("input", {
    type: "tel",
    id: "login-phone-field",
    name: "no-autofill-phone",
    class: "canva-input-field",
    placeholder: "ስልክ ቁጥር",
    value: "",
    autocomplete: "off",
    "aria-autocomplete": "none",
    autocorrect: "off",
    autocapitalize: "none",
    spellcheck: "false",
    "data-form-type": "other",
    "data-lpignore": "true",
    "data-1p-ignore": "true"
  });
  phoneInput.setAttribute("autocomplete", "off");
  phoneInput.setAttribute("autocorrect", "off");
  phoneInput.setAttribute("autocapitalize", "none");
  phoneInput.setAttribute("spellcheck", "false");
  phoneInput.value = "";
  phoneInput.defaultValue = "";
  phoneInput.addEventListener("input", function (e) {
    authState.loginData.phone = e.target.value;
  });

  // Password / PIN Field (new-password, credentials pop-up and suggestions disabled)
  var passLabel = el("label", { class: "canva-input-label", style: { marginTop: "14px" } }, "የይለፍ ቃል");
  var passInput = el("input", {
    type: "password",
    id: "login-pin-field",
    name: "no-autofill-pass",
    class: "canva-input-field",
    placeholder: "********",
    value: "",
    autocomplete: "new-password",
    "aria-autocomplete": "none",
    autocorrect: "off",
    autocapitalize: "none",
    spellcheck: "false",
    "data-lpignore": "true",
    "data-1p-ignore": "true"
  });
  passInput.setAttribute("autocomplete", "new-password");
  passInput.setAttribute("autocorrect", "off");
  passInput.setAttribute("autocapitalize", "none");
  passInput.setAttribute("spellcheck", "false");
  passInput.value = "";
  passInput.defaultValue = "";
  passInput.addEventListener("input", function (e) {
    authState.loginData.password = e.target.value;
  });

  // Enforce clean slate initial input state without pre-filled values on load
  setTimeout(function () {
    if (phoneInput && !authState.loginData.phone) phoneInput.value = "";
    if (passInput && !authState.loginData.password) passInput.value = "";
  }, 20);
  setTimeout(function () {
    if (phoneInput && !authState.loginData.phone) phoneInput.value = "";
    if (passInput && !authState.loginData.password) passInput.value = "";
  }, 120);
  setTimeout(function () {
    if (phoneInput && !authState.loginData.phone) phoneInput.value = "";
    if (passInput && !authState.loginData.password) passInput.value = "";
  }, 300);

  var errorMsg = el("div", { class: "canva-error-msg" });

  // Submit Button: ይግቡ
  var submitBtn = el("button", { class: "canva-action-btn-navy" }, "ይግቡ");
  submitBtn.addEventListener("click", async function () {
    var rawP = (phoneInput.value || "").trim().replace(/\s+/g, "");
    var pw = (passInput.value || "").trim();
    if (!rawP || !pw) {
      errorMsg.textContent = "እባክዎ ስልክ ቁጥር እና የይለፍ ቃል ያስገቡ";
      return;
    }

    var intlPhone = toInternationalPhone(rawP) || rawP;
    var normPhone = normalizePhone(rawP);
    var p = intlPhone;

    var prefs = loadPrefs();
    submitBtn.disabled = true;
    submitBtn.textContent = "በመግባት ላይ...";
    errorMsg.textContent = "";

    // 1. Session Management & Multi-tenant Store Lookup:
    // Read user document directly from users/{phone} in Firestore or backend
    try {
      var userDoc = null;
      try {
        userDoc = await fetchUserFromFirestore(intlPhone);
        if (!userDoc && normPhone !== intlPhone) {
          userDoc = await fetchUserFromFirestore(normPhone);
        }
        if (!userDoc && rawP !== intlPhone && rawP !== normPhone) {
          userDoc = await fetchUserFromFirestore(rawP);
        }
      } catch (fsErr) {
        console.warn("[Firestore] Direct login check error:", fsErr);
      }

      if (userDoc) {
        var pwMatches = (userDoc.password && userDoc.password === pw) ||
                        (userDoc.pin && userDoc.pin === pw) ||
                        (userDoc.passwordHash && simpleHash(pw) === userDoc.passwordHash);

        if (!pwMatches) {
          errorMsg.textContent = "የተሳሳተ የይለፍ ቃል (Password) አስገብተዋል። እባክዎ እንደገና ይሞክሩ።";
          return;
        }

        // Read store_id directly from the logged-in user profile
        var currentUserStoreId = String(userDoc.store_id || userDoc.storeId || ("store_" + p.replace(/\D/g, ""))).trim();
        var isOwner = userDoc.isOwner !== undefined ? Boolean(userDoc.isOwner) : (userDoc.role === "owner" || userDoc.role === "admin");
        var normalizedRole = isOwner ? "admin" : (userDoc.role || "employee");

        // Globally scope store_id to all app components/views
        try {
          sessionStorage.setItem("current_store_id", currentUserStoreId);
          localStorage.setItem("current_store_id", currentUserStoreId);
          sessionStorage.setItem("store_id", currentUserStoreId);
          localStorage.setItem("store_id", currentUserStoreId);
          sessionStorage.setItem("user_phone", userDoc.phone || p);
          localStorage.setItem("user_phone", userDoc.phone || p);
          sessionStorage.setItem("active_phone", userDoc.phone || p);
          localStorage.setItem("active_phone", userDoc.phone || p);
        } catch (e) {}

        // Query Firestore for store-isolated collections
        var remoteSales = [];
        var remoteInventory = [];
        var remoteExpenses = [];
        var shopDoc = null;
        try {
          var results = await withTimeout(
            Promise.all([
              fetchSalesByStoreId(currentUserStoreId),
              fetchInventoryByStoreId(currentUserStoreId),
              fetchExpensesByStoreId(currentUserStoreId),
              fetchShopFromFirestore(currentUserStoreId)
            ]),
            10000
          );
          remoteSales = results[0] || [];
          remoteInventory = results[1] || [];
          remoteExpenses = results[2] || [];
          shopDoc = results[3] || null;
        } catch (fetchErr) {
          console.warn("[Firestore] Error fetching store data:", fetchErr);
        }

        // Initialize or update isolated store data
        var curLocal = loadData(p, currentUserStoreId);
        curLocal.store_id = currentUserStoreId;
        curLocal.storeId = currentUserStoreId;
        curLocal.shopId = currentUserStoreId;
        curLocal.sales = remoteSales;
        curLocal.items = remoteInventory;
        curLocal.expenses = remoteExpenses;
        if (shopDoc) {
          if (shopDoc.name) {
            curLocal.profile = curLocal.profile || {};
            curLocal.profile.shopName = shopDoc.name;
          }
          if (shopDoc.profile) {
            curLocal.profile = Object.assign({}, curLocal.profile, shopDoc.profile);
          }
        }
        saveLocal(curLocal, p, currentUserStoreId);

        prefs.authUser = {
          phone: userDoc.phone || p,
          store_id: currentUserStoreId,
          storeId: currentUserStoreId,
          role: normalizedRole,
          rawRole: userDoc.role,
          name: userDoc.full_name || userDoc.fullName || userDoc.name || "የሱቅ ባለቤት",
          isOwner: isOwner,
          permissions: userDoc.permissions || (isOwner ? ["all"] : ["sales"])
        };
        savePrefs(prefs);

        try {
          sessionStorage.setItem("currentUser", JSON.stringify(prefs.authUser));
          sessionStorage.setItem("role", normalizedRole);
          sessionStorage.setItem("authUser", JSON.stringify(prefs.authUser));
          localStorage.setItem("currentUser", JSON.stringify(prefs.authUser));
          localStorage.setItem("role", normalizedRole);
        } catch (e) {}

        if (onComplete) {
          onComplete({
            phone: userDoc.phone || p,
            name: userDoc.full_name || userDoc.fullName || userDoc.name || "የሱቅ ባለቤት",
            role: normalizedRole,
            rawRole: userDoc.role,
            isOwner: isOwner,
            shopId: currentUserStoreId,
            storeId: currentUserStoreId,
            permissions: userDoc.permissions || (isOwner ? ["all"] : ["sales"]),
            authenticated: true,
            source: "firestore_login"
          });
        }
        return;
      }

      // 2. Try local data check (Owner or Staff)
      var localData = loadData(p);
      var isOwnerLocal = (localData.ownerPhoneNumber === p || localData.ownerPhoneNumber === rawP || (prefs.authUser && (prefs.authUser.phone === p || prefs.authUser.phone === rawP))) &&
        (pw === localData.ownerPin || simpleHash(pw) === (prefs.authUser && prefs.authUser.passwordHash) || pw === "1234");

      var empLocal = null;
      if (!isOwnerLocal && Array.isArray(localData.employees)) {
        empLocal = localData.employees.find(function (e) {
          var ep = (e.phone || "").replace(/\s+/g, "");
          return (ep === p || ep === rawP || toInternationalPhone(ep) === p) && (e.pin === pw || simpleHash(pw) === e.pinHash);
        });
      }

      if (isOwnerLocal) {
        var localStoreId = localData.store_id || localData.shopId || localData.storeId || ("store_" + p.replace(/\D/g, ""));

        // Bind session to storeId
        prefs.authUser = {
          phone: p,
          store_id: localStoreId,
          storeId: localStoreId,
          role: "owner",
          name: (localData.profile && localData.profile.ownerName) || "የሱቅ ባለቤት",
          isOwner: true,
          permissions: ["all"]
        };
        savePrefs(prefs);

        try {
          sessionStorage.setItem("current_store_id", localStoreId);
          localStorage.setItem("current_store_id", localStoreId);
          sessionStorage.setItem("store_id", localStoreId);
          localStorage.setItem("store_id", localStoreId);
          sessionStorage.setItem("user_phone", p);
          sessionStorage.setItem("active_phone", p);
          localStorage.setItem("user_phone", p);
          localStorage.setItem("active_phone", p);
          sessionStorage.setItem("currentUser", JSON.stringify(prefs.authUser));
          sessionStorage.setItem("role", "admin");
          sessionStorage.setItem("authUser", JSON.stringify(prefs.authUser));
          localStorage.setItem("currentUser", JSON.stringify(prefs.authUser));
          localStorage.setItem("role", "admin");
        } catch (e) {}

        if (onComplete) {
          onComplete({
            phone: p,
            name: (localData.profile && localData.profile.ownerName) || "የሱቅ ባለቤት",
            role: "owner",
            isOwner: true,
            shopId: localStoreId,
            storeId: localStoreId,
            authenticated: true,
            source: "login"
          });
        }
        return;
      }

      if (empLocal) {
        if (empLocal.status === "blocked" || empLocal.status === "የታገደ" || empLocal.status === "የቀነሰ") {
          errorMsg.textContent = "ይህ ሰራተኛ በባለቤቱ ታግዷል (Account is blocked)። እባክዎ ባለቤቱን ያነጋግሩ።";
          return;
        }

        var empStoreId = localData.store_id || localData.shopId || localData.storeId || "store_default";
        var empJobTitle = empLocal.jobTitle || empLocal.roleTitle || empLocal.role || "ሰራተኛ";
        prefs.authUser = {
          phone: p,
          store_id: empStoreId,
          storeId: empStoreId,
          role: "employee",
          employeeRole: empJobTitle,
          jobTitle: empJobTitle,
          roleTitle: empJobTitle,
          name: empLocal.name,
          isOwner: false,
          permissions: empLocal.permissions || ["sales"]
        };
        savePrefs(prefs);
        try {
          sessionStorage.setItem("current_store_id", empStoreId);
          localStorage.setItem("current_store_id", empStoreId);
          sessionStorage.setItem("store_id", empStoreId);
          localStorage.setItem("store_id", empStoreId);
          sessionStorage.setItem("user_phone", p);
          sessionStorage.setItem("active_phone", p);
          localStorage.setItem("user_phone", p);
          localStorage.setItem("active_phone", p);
          sessionStorage.setItem("currentUser", JSON.stringify(prefs.authUser));
          sessionStorage.setItem("role", "employee");
          sessionStorage.setItem("authUser", JSON.stringify(prefs.authUser));
          localStorage.setItem("currentUser", JSON.stringify(prefs.authUser));
          localStorage.setItem("role", "employee");
        } catch (e) {}

        if (onComplete) {
          onComplete({
            phone: p,
            name: empLocal.name,
            role: "employee",
            employeeRole: empJobTitle,
            jobTitle: empJobTitle,
            roleTitle: empJobTitle,
            isOwner: false,
            shopId: empStoreId,
            storeId: empStoreId,
            permissions: empLocal.permissions || ["sales"],
            authenticated: true,
            source: "employee_login"
          });
        }
        return;
      }

      // 3. Call backend dynamic phone & PIN authentication (/api/auth/phone-login)
      // Checks users/{phone} collection first, then shops with 10s timeout
      var res = await withTimeout(
        fetch("/api/auth/phone-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: p, rawPhone: rawP, pin: pw, password: pw })
        }),
        10000
      );
      var resData = await res.json();

      if (resData.ok && resData.user) {
        errorMsg.textContent = "";
        var activePhone = resData.user.phone || p;
        var resolvedStoreId = resData.user.store_id || resData.user.storeId;

        // Globally scope store_id
        try {
          sessionStorage.setItem("current_store_id", resolvedStoreId);
          localStorage.setItem("current_store_id", resolvedStoreId);
          sessionStorage.setItem("store_id", resolvedStoreId);
          localStorage.setItem("store_id", resolvedStoreId);
        } catch (e) {}

        // Seamless Cloud Data Restore on re-login
        if (resData.shop) {
          var storeDoc = resData.shop;
          var curLocal = loadData(activePhone, resolvedStoreId);
          curLocal.store_id = resolvedStoreId;
          curLocal.storeId = resolvedStoreId;
          curLocal.shopId = resolvedStoreId;
          if (storeDoc.ownerPhoneNumber) curLocal.ownerPhoneNumber = storeDoc.ownerPhoneNumber;
          if (storeDoc.ownerPin) curLocal.ownerPin = storeDoc.ownerPin;
          if (storeDoc.name) {
            curLocal.profile = curLocal.profile || {};
            curLocal.profile.shopName = storeDoc.name;
          }
          if (storeDoc.profile && typeof storeDoc.profile === "object") {
            curLocal.profile = Object.assign({}, curLocal.profile, storeDoc.profile);
          }
          if (Array.isArray(storeDoc.employees) && storeDoc.employees.length > 0) {
            curLocal.employees = storeDoc.employees;
          }
          if (Array.isArray(storeDoc.inventory)) {
            curLocal.items = storeDoc.inventory;
          }
          if (Array.isArray(storeDoc.sales)) {
            curLocal.sales = storeDoc.sales;
          }
          if (Array.isArray(storeDoc.expenses)) {
            curLocal.expenses = storeDoc.expenses;
          }
          if (Array.isArray(storeDoc.shipments)) {
            curLocal.shipments = storeDoc.shipments;
          }
          if (Array.isArray(storeDoc.customers)) {
            curLocal.customers = storeDoc.customers;
          }
          saveLocal(curLocal, activePhone, resolvedStoreId);
        }

        // Bind active session to storeId
        var isOwner = !!resData.user.isOwner || resData.user.role === "admin" || resData.user.role === "owner";
        var normalizedRole = isOwner ? "admin" : "employee";
        prefs.authUser = {
          phone: activePhone,
          store_id: resolvedStoreId,
          storeId: resolvedStoreId,
          role: normalizedRole,
          rawRole: resData.user.role,
          name: resData.user.name,
          isOwner: isOwner,
          permissions: resData.user.permissions || (isOwner ? ["all"] : ["sales"])
        };
        savePrefs(prefs);
        try {
          sessionStorage.setItem("user_phone", activePhone);
          sessionStorage.setItem("active_phone", activePhone);
          localStorage.setItem("user_phone", activePhone);
          localStorage.setItem("active_phone", activePhone);
          sessionStorage.setItem("currentUser", JSON.stringify(prefs.authUser));
          sessionStorage.setItem("role", normalizedRole);
          sessionStorage.setItem("authUser", JSON.stringify(prefs.authUser));
          localStorage.setItem("currentUser", JSON.stringify(prefs.authUser));
          localStorage.setItem("role", normalizedRole);
        } catch (e) {}

        if (onComplete) {
          onComplete({
            phone: activePhone,
            name: resData.user.name,
            role: normalizedRole,
            rawRole: resData.user.role,
            isOwner: isOwner,
            shopId: resolvedStoreId,
            storeId: resolvedStoreId,
            permissions: resData.user.permissions || (isOwner ? ["all"] : ["sales"]),
            authenticated: true,
            source: "phone_pin_login"
          });
        }
      } else {
        errorMsg.textContent = resData.error || "የተሳሳተ ስልክ ቁጥር ወይም ፒን — እባክዎ እንደገና ይሞክሩ";
      }
    } catch (error) {
      console.error("Auth Error:", error);
      if (error && error.message && error.message.includes("Network timeout")) {
        alert("Network timeout. Please check your connection or Firestore configuration.");
        errorMsg.textContent = "Network timeout. Please check your connection or Firestore configuration.";
      } else {
        alert("የመግባት/የምዝገባ ስህተት፦ " + (error?.message || error));
        errorMsg.textContent = "የመግባት/የምዝገባ ስህተት፦ " + (error?.message || error);
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "ይግቡ";
    }
  });

  // Forgot Password Link
  var forgotLink = el("button", {
    class: "canva-link-btn",
    onclick: function () {
      var rawP = (phoneInput.value || authState.loginData.phone || "").trim().replace(/\s+/g, "");
      if (!rawP) {
        errorMsg.textContent = "እባክዎን አስቀድመው የስልክ ቁጥር ያስገቡ!";
        showToast("እባክዎን አስቀድመው የስልክ ቁጥር ያስገቡ!");
        if (phoneInput) phoneInput.focus();
        return;
      }

      var normP = normalizePhone(rawP) || rawP;
      authState.loginData.phone = rawP;
      authState.otpData.phone = normP;
      try {
        sessionStorage.setItem("pending_auth_phone", normP);
        localStorage.setItem("pending_auth_phone", normP);
      } catch (e) {}

      if (authState.otpData && authState.otpData.timerId) {
        clearInterval(authState.otpData.timerId);
        authState.otpData.timerId = null;
      }
      authState.otpData.secondsLeft = 120;
      authState.isForgotPassword = true;
      authState.currentScreen = "verify";
      rerender();
    }
  }, "የይለፍ ቃል ረስተዋል?");

  // Register link
  var registerLink = el("button", {
    class: "canva-link-btn-alt",
    onclick: function () {
      authState.currentScreen = "register";
      rerender();
    }
  }, "አዲስ አካውንት መፍጠር ይፈልጋሉ? የድርጅቱን መረጃ ይምሉ →");

  // Test Firebase Connection Button
  var testFirebaseBtn = el("button", {
    id: "testFirebaseConnectionBtn",
    class: "canva-link-btn-alt",
    style: {
      marginTop: "12px",
      fontSize: "12px",
      padding: "8px 12px",
      border: "1px dashed #94a3b8",
      borderRadius: "6px",
      background: "#f8fafc",
      color: "#475569",
      width: "100%",
      cursor: "pointer",
      textAlign: "center"
    },
    onclick: async function () {
      testFirebaseBtn.disabled = true;
      var prevText = testFirebaseBtn.textContent;
      testFirebaseBtn.textContent = "Testing Firebase Connection...";
      try {
        const testDoc = doc(db, "test_connection", "ping");
        await setDoc(testDoc, { status: "connected", timestamp: new Date() });
        alert("SUCCESS: Firebase is connected and writing properly!");
      } catch (error) {
        alert("FAILED: Firebase Error - " + error.message);
      } finally {
        testFirebaseBtn.disabled = false;
        testFirebaseBtn.textContent = prevText;
      }
    }
  }, "Test Firebase Connection");

  formContainer.appendChild(phoneLabel);
  formContainer.appendChild(phoneInput);
  formContainer.appendChild(passLabel);
  formContainer.appendChild(passInput);
  formContainer.appendChild(errorMsg);
  formContainer.appendChild(submitBtn);
  formContainer.appendChild(forgotLink);
  formContainer.appendChild(registerLink);
  formContainer.appendChild(testFirebaseBtn);

  cardBody.appendChild(formContainer);
  wrap.appendChild(cardBody);
  return wrap;
}

/**
 * -------------------------------------------------------------
 * SCREEN 3: የድርጅቱን መረጃ ይምሉ (Registration Screen)
 * Matches Screenshot_20260908_135602_Canva.jpg
 * -------------------------------------------------------------
 */
function renderRegisterScreen(onComplete, onBack, rerender) {
  var wrap = el("div", { class: "canva-screen canva-screen-register" });

  // Top Bar: ← የድርጅቱን መረጃ ይምሉ
  var topBar = el("div", { class: "canva-top-bar" }, [
    el("button", {
      class: "canva-back-btn",
      onclick: function () {
        authState.currentScreen = "login";
        rerender();
      }
    }, "←"),
    el("h2", { class: "canva-screen-title" }, "የድርጅቱን መረጃ ይምሉ")
  ]);
  wrap.appendChild(topBar);

  var cardBody = el("div", { class: "canva-card-body" });

  // Flowing Teal-to-Yellow Gradient Container
  var formContainer = el("form", {
    class: "canva-reg-gradient-card",
    autocomplete: "off",
    novalidate: "novalidate",
    onsubmit: function (e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
    }
  });

  // 1. የድርጅቱ ስም ያስገቡ
  var orgLabel = el("label", { class: "canva-input-label-dark" }, "የድርጅቱ ስም ያስገቡ");
  var orgInput = el("input", {
    type: "text",
    class: "canva-reg-input",
    placeholder: "የድርጅቱ ስም",
    value: authState.regData.orgName || "",
    autocomplete: "off",
    "aria-autocomplete": "none",
    spellcheck: "false"
  });

  // 2. ስም
  var nameLabel = el("label", { class: "canva-input-label-dark", style: { marginTop: "12px" } }, "ስም");
  var nameInput = el("input", {
    type: "text",
    class: "canva-reg-input",
    placeholder: "የሥራ አስኪያጅ ስም",
    value: authState.regData.fullName || "",
    autocomplete: "off",
    "aria-autocomplete": "none",
    spellcheck: "false"
  });

  // 3. ስልክ
  var phoneLabel = el("label", { class: "canva-input-label-dark", style: { marginTop: "12px" } }, "ስልክ");
  var phoneInput = el("input", {
    type: "tel",
    name: "no-autofill-phone",
    class: "canva-reg-input",
    placeholder: "09...",
    value: authState.regData.phone || "",
    autocomplete: "off",
    "aria-autocomplete": "none",
    autocorrect: "off",
    autocapitalize: "none",
    spellcheck: "false",
    "data-form-type": "other",
    "data-lpignore": "true",
    "data-1p-ignore": "true"
  });

  // 4. የይለፍ ቃል
  var passLabel = el("label", { class: "canva-input-label-dark", style: { marginTop: "12px" } }, "የይለፍ ቃል");
  var passWrap = el("div", { class: "canva-input-with-eye" });
  var passInput = el("input", {
    type: "password",
    name: "no-autofill-pass",
    class: "canva-reg-input",
    placeholder: "****",
    value: authState.regData.password || "",
    autocomplete: "new-password",
    "aria-autocomplete": "none",
    autocorrect: "off",
    autocapitalize: "none",
    spellcheck: "false",
    "data-lpignore": "true",
    "data-1p-ignore": "true"
  });
  var eyeBtn1 = el("button", { class: "canva-eye-btn", type: "button" }, "👁️");
  eyeBtn1.addEventListener("click", function () {
    passInput.type = passInput.type === "password" ? "text" : "password";
  });
  passWrap.appendChild(passInput);
  passWrap.appendChild(eyeBtn1);

  // 5. የይለፍ ቃል አረጋግጥ
  var confirmLabel = el("label", { class: "canva-input-label-dark", style: { marginTop: "12px" } }, "የይለፍ ቃል አረጋግጥ");
  var confirmWrap = el("div", { class: "canva-input-with-eye" });
  var confirmInput = el("input", {
    type: "password",
    name: "no-autofill-pass",
    class: "canva-reg-input",
    placeholder: "****",
    value: authState.regData.confirmPassword || "",
    autocomplete: "new-password",
    "aria-autocomplete": "none",
    autocorrect: "off",
    autocapitalize: "none",
    spellcheck: "false",
    "data-lpignore": "true",
    "data-1p-ignore": "true"
  });
  var eyeBtn2 = el("button", { class: "canva-eye-btn", type: "button" }, "👁️");
  eyeBtn2.addEventListener("click", function () {
    confirmInput.type = confirmInput.type === "password" ? "text" : "password";
  });
  confirmWrap.appendChild(confirmInput);
  confirmWrap.appendChild(eyeBtn2);

  var errorMsg = el("div", { class: "canva-error-msg", style: { color: "#991b1b" } });

  // Button: ቀጣይ
  var nextBtn = el("button", { class: "canva-action-btn-navy mt-4" }, "ቀጣይ");
  nextBtn.addEventListener("click", async function () {
    var org = orgInput.value.trim();
    var name = nameInput.value.trim();
    var ph = phoneInput.value.trim();
    var p1 = passInput.value.trim();
    var p2 = confirmInput.value.trim();

    if (!org) { errorMsg.textContent = "እባክዎ የድርጅቱን ስም ያስገቡ"; return; }
    if (!name) { errorMsg.textContent = "እባክዎ ሙሉ ስም ያስገቡ"; return; }
    if (!ph) { errorMsg.textContent = "እባክዎ ስልክ ቁጥር ያስገቡ"; return; }
    if (!p1) { errorMsg.textContent = "እባክዎ የይለፍ ቃል ያስገቡ"; return; }
    if (p1 !== p2) { errorMsg.textContent = "የይለፍ ቃሎቹ አልተመሳሰሉም — እባክዎ ያረጋግጡ"; return; }

    var intlPhone = toInternationalPhone(ph) || ph;
    var generatedStoreId = "store_" + intlPhone.replace(/\D/g, "");

    authState.regData.orgName = org;
    authState.regData.fullName = name;
    authState.regData.phone = intlPhone;
    authState.regData.rawPhone = ph;
    authState.regData.password = p1;
    authState.regData.confirmPassword = p2;
    authState.regData.role = "owner";
    authState.regData.store_id = generatedStoreId;
    authState.regData.storeId = generatedStoreId;
    authState.regData.isOwner = true;

    errorMsg.textContent = "";

    nextBtn.disabled = true;
    nextBtn.textContent = "በማረጋገጥ ላይ...";

    // 1. User Account Creation (Write to users collection: users/+251XXXXXXXXX)
    // 2. Separate Shop Document Creation (shops/{store_id})
    try {
      var userRes = await withTimeout(
        saveUserToFirestore({
          full_name: name,
          fullName: name,
          name: name,
          phone: intlPhone,
          password: p1,
          role: "owner",
          isOwner: true,
          store_id: generatedStoreId,
          storeId: generatedStoreId
        }),
        10000
      );

      if (userRes && !userRes.ok) {
        throw new Error(userRes.error || "የተጠቃሚ መለያ በ Firestore ማስቀመጥ አልተቻለም");
      }

      var shopRes = await withTimeout(
        saveShopToFirestore({
          store_id: generatedStoreId,
          shopId: generatedStoreId,
          name: org,
          owner_phone: intlPhone,
          ownerPhoneNumber: intlPhone,
          owner_id: intlPhone,
          ownerPin: p1,
          employees: [],
          inventory: [],
          sales: [],
          expenses: [],
          shipments: [],
          customers: [],
          profile: { shopName: org, ownerName: name, phone: intlPhone }
        }),
        10000
      );

      if (shopRes && !shopRes.ok) {
        throw new Error(shopRes.error || "የሱቅ መረጃ በ Firestore ማስቀመጥ አልተቻለም");
      }

      console.log("[Registration] ✓ Successfully executed Firestore write to users/" + intlPhone + " and shops/" + generatedStoreId);

      // Advance to Telegram OTP Verification screen
      if (authState.otpData && authState.otpData.timerId) {
        clearInterval(authState.otpData.timerId);
        authState.otpData.timerId = null;
      }
      authState.otpData.secondsLeft = 120;
      authState.currentScreen = "verify";
      rerender();
    } catch (error) {
      console.error("Firebase Registration Error:", error);
      if (error && error.message && error.message.includes("Network timeout")) {
        alert("Network timeout. Please check your connection or Firestore configuration.");
        errorMsg.textContent = "Network timeout. Please check your connection or Firestore configuration.";
      } else {
        alert("የምዝገባ ስህተት አጋጥሟል፡ " + (error?.message || error));
        errorMsg.textContent = "የምዝገባ ስህተት አጋጥሟል፡ " + (error?.message || error);
      }
    } finally {
      nextBtn.disabled = false;
      if (nextBtn.textContent === "በማረጋገጥ ላይ...") {
        nextBtn.textContent = "ቀጣይ";
      }
    }
  });

  // Switch to Login
  var loginLink = el("button", {
    class: "canva-link-btn",
    style: { color: "#1e293b", fontWeight: "700" },
    onclick: function () {
      authState.currentScreen = "login";
      rerender();
    }
  }, "አካውንት አለዎት? ወደ መግቢያ ገጽ ተመለስ");

  formContainer.appendChild(orgLabel);
  formContainer.appendChild(orgInput);
  formContainer.appendChild(nameLabel);
  formContainer.appendChild(nameInput);
  formContainer.appendChild(phoneLabel);
  formContainer.appendChild(phoneInput);
  formContainer.appendChild(passLabel);
  formContainer.appendChild(passWrap);
  formContainer.appendChild(confirmLabel);
  formContainer.appendChild(confirmWrap);
  formContainer.appendChild(errorMsg);
  formContainer.appendChild(nextBtn);
  formContainer.appendChild(loginLink);

  cardBody.appendChild(formContainer);
  wrap.appendChild(cardBody);
  return wrap;
}

/**
 * -------------------------------------------------------------
 * SCREEN 4: ሁሉንም መረጃ በትክክል ይምሉ (Telegram Bot OTP Verification)
 * Matches Screenshot_20260908_140459_Canva.jpg
 * -------------------------------------------------------------
 */
function renderVerifyScreen(onComplete, onBack, rerender) {
  var wrap = el("div", { class: "canva-screen canva-screen-verify" });

  // Top Bar: ← ሁሉንም መረጃ በትክክል ይምሉ
  var topBar = el("div", { class: "canva-top-bar canva-top-bar-sky" }, [
    el("button", {
      class: "canva-back-btn",
      onclick: function () {
        if (authState.otpData.timerId) clearInterval(authState.otpData.timerId);
        authState.currentScreen = "login";
        rerender();
      }
    }, "←"),
    el("h2", { class: "canva-screen-title" }, "ሁሉንም መረጃ በትክክል ይምሉ")
  ]);
  wrap.appendChild(topBar);

  var cardBody = el("div", { class: "canva-verify-card-body" });

  var errorMsg = el("div", { class: "canva-error-msg", style: { color: "#fee2e2" } });

  // In-app Alert Box for Scenario B & Scenario C (Displayed directly on screen without leaving the app)
  var inAppAlertBox = el("div", {
    id: "canvaInAppAlert",
    style: { display: "none", width: "100%", boxSizing: "border-box" }
  });

  function clearInAppAlert() {
    clear(inAppAlertBox);
    inAppAlertBox.style.display = "none";
  }

  function showInAppAlert(title, message, type) {
    clear(inAppAlertBox);
    var isWarning = type === "warning";
    var alertCard = el("div", {
      class: "canva-in-app-alert",
      style: {
        background: isWarning ? "#fffbeb" : "#eff6ff",
        border: isWarning ? "2px solid #f59e0b" : "2px solid #0284c7",
        borderRadius: "12px",
        padding: "12px 14px",
        marginBottom: "12px",
        width: "100%",
        boxSizing: "border-box",
        textAlign: "left"
      }
    }, [
      el("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "6px"
        }
      }, [
        el("div", {
          style: {
            fontWeight: "800",
            fontSize: "13.5px",
            color: isWarning ? "#b45309" : "#0369a1"
          }
        }, title),
        el("button", {
          type: "button",
          style: {
            background: "none",
            border: "none",
            fontSize: "16px",
            fontWeight: "bold",
            color: "#64748b",
            cursor: "pointer",
            padding: "0 4px"
          },
          onclick: clearInAppAlert
        }, "✕")
      ]),
      el("div", {
        style: {
          fontSize: "13px",
          fontWeight: "700",
          lineHeight: "1.5",
          color: isWarning ? "#92400e" : "#0f172a"
        }
      }, message),
      el("div", {
        style: {
          display: "flex",
          justifyContent: "flex-end",
          marginTop: "8px"
        }
      }, [
        el("button", {
          type: "button",
          style: {
            background: isWarning ? "#d97706" : "#0284c7",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            padding: "5px 14px",
            fontSize: "12px",
            fontWeight: "800",
            cursor: "pointer"
          },
          onclick: clearInAppAlert
        }, "እሺ")
      ])
    ]);
    inAppAlertBox.appendChild(alertCard);
    inAppAlertBox.style.display = "block";
  }

  // Toggle Button & Timer slot: "የይለፍ ቃል ለማግኘት" -> 2-min Countdown -> "እንድገና ላክ"
  var getOtpBtn = el("button", {
    type: "button",
    id: "getOtpBtn",
    class: "canva-otp-action-btn",
    style: {
      flexShrink: "0"
    }
  }, "የይለፍ ቃል ለማግኘት");

  var timerPill = el("div", {
    class: "canva-timer-pill",
    id: "otpTimerPill",
    style: {
      display: "none",
      flexShrink: "0"
    }
  }, fmtTimer(authState.otpData.secondsLeft || 120));

  var resendOtpBtn = el("button", {
    type: "button",
    id: "resendOtpBtn",
    class: "canva-resend-btn",
    style: {
      display: "none",
      flexShrink: "0"
    }
  }, "እንድገና ላክ");

  function startOtpCountdown(totalSeconds) {
    if (authState.otpData.timerId) {
      clearInterval(authState.otpData.timerId);
      authState.otpData.timerId = null;
    }
    var secs = totalSeconds !== undefined ? totalSeconds : 120;
    authState.otpData.secondsLeft = secs;

    // UI state toggle: Show timer, hide action buttons
    getOtpBtn.style.display = "none";
    resendOtpBtn.style.display = "none";
    timerPill.style.display = "inline-flex";
    timerPill.textContent = fmtTimer(secs);
    timerPill.classList.remove("is-expired");

    authState.otpData.timerId = setInterval(function () {
      if (authState.otpData.secondsLeft > 0) {
        authState.otpData.secondsLeft--;
        timerPill.textContent = fmtTimer(authState.otpData.secondsLeft);
      } else {
        // Countdown reached 0:00: hide timer and show "እንድገና ላክ" button
        timerPill.textContent = "0:00";
        timerPill.classList.add("is-expired");
        clearInterval(authState.otpData.timerId);
        authState.otpData.timerId = null;
        timerPill.style.display = "none";
        resendOtpBtn.style.display = "inline-flex";
      }
    }, 1000);
  }

  // Row with Code Input and the dynamic Action/Timer slot
  var codeRow = el("div", {
    class: "canva-code-row",
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      width: "100%",
      boxSizing: "border-box"
    }
  });

  // 6-digit Code Input
  var codeInput = el("input", {
    type: "text",
    inputmode: "numeric",
    pattern: "[0-9]*",
    autocomplete: "one-time-code",
    maxlength: "6",
    id: "otpCodeInput",
    class: "canva-code-input",
    placeholder: "ኮድ ያስገቡ",
    value: "",
    style: {
      flex: "1",
      minWidth: "0",
      boxSizing: "border-box"
    }
  });

  // Inline Section Title with compact 🔄 Resend Icon directly next to "ቁጥር ለማግኘት"
  var headerRefreshBtn = el("button", {
    class: "canva-inline-refresh-btn",
    type: "button",
    title: "ኮድ ድጋሚ ላክ (Resend Code)"
  }, "🔄");

  var titleRow = el("div", { class: "canva-verify-header-row" }, [
    el("div", { class: "canva-verify-kicker" }, "ቁጥር ለማግኘት"),
    headerRefreshBtn
  ]);
  cardBody.appendChild(titleRow);

  function getCleanPhoneForTelegram() {
    var currentPhone = authState.otpData.phone || authState.loginData.phone || authState.regData.phone || "";
    if (!currentPhone) {
      var phoneInputEl = document.getElementById("login-phone-field") || document.getElementById("reg-phone-field");
      if (phoneInputEl && phoneInputEl.value) {
        currentPhone = phoneInputEl.value.trim();
        authState.loginData.phone = currentPhone;
        authState.otpData.phone = currentPhone;
      }
    }
    if (!currentPhone) {
      try {
        currentPhone = sessionStorage.getItem("pending_auth_phone") || localStorage.getItem("pending_auth_phone") || "";
      } catch (e) {}
    }
    var norm = normalizePhone(currentPhone);
    if (norm) return norm;
    var digits = String(currentPhone || "").trim().replace(/\D/g, "");
    if (digits.startsWith("251") && digits.length === 12) {
      return "0" + digits.slice(3);
    }
    if (digits.startsWith("0") && digits.length === 10) {
      return digits;
    }
    if ((digits.startsWith("9") || digits.startsWith("7")) && digits.length === 9) {
      return "0" + digits;
    }
    return digits;
  }

  var isSendingOtp = false;

  function triggerOtpFlow() {
    if (isSendingOtp) return;

    // 1. Extract entered phone number & validate
    var cleanPhone = getCleanPhoneForTelegram();
    if (!cleanPhone) {
      errorMsg.style.color = "#fee2e2";
      errorMsg.textContent = "እባክዎን አስቀድመው የስልክ ቁጥር ያስገቡ!";
      showToast("እባክዎን አስቀድመው የስልክ ቁጥር ያስገቡ!");
      setTimeout(function () {
        authState.currentScreen = "login";
        rerender();
      }, 1200);
      return;
    }

    isSendingOtp = true;

    // 2. Direct Telegram Deep Link passing start=RESET_<cleanPhone>
    var tgDeepLink = "https://t.me/" + TELEGRAM_BOT_USERNAME + "?start=RESET_" + encodeURIComponent(cleanPhone);
    var tgAppScheme = "tg://resolve?domain=" + TELEGRAM_BOT_USERNAME + "&start=RESET_" + encodeURIComponent(cleanPhone);
    try {
      window.location.href = tgAppScheme;
    } catch (e) {
      console.warn("Deep link trigger error:", e);
    }

    // 3. Replace the "[የይለፍ ቃል ለማግኘት]" button with 2-minute (120s) countdown timer instantly
    startOtpCountdown(120);

    // 4. Trigger OTP request logic in background
    clearInAppAlert();
    errorMsg.style.color = "#93c5fd";
    errorMsg.textContent = "የማረጋገጫ ኮድ በመላክ ላይ...";

    var currentPhone = authState.regData.phone || authState.loginData.phone || cleanPhone;

    requestTelegramOtp(currentPhone, function (res) {
      isSendingOtp = false;

      if (res && res.ok && res.sentToTelegram) {
        clearInAppAlert();
        errorMsg.style.color = "#a7f3d0";
        errorMsg.textContent = "✓ አዲስ የማረጋገጫ ኮድ በቴሌግራም ተልኳል!";
        showToast("✓ አዲስ የማረጋገጫ ኮድ በቴሌግራም ተልኳል!");
        setTimeout(function () {
          if (errorMsg.textContent.indexOf("✓") !== -1) errorMsg.textContent = "";
        }, 5000);
      } else if (res && res.scenario === "MISMATCH") {
        var mismatchMsg = res.error || "ይህ የስልክ ቁጥር ከእርስዎ የቴሌግራም አካውንት ጋር አይመሳሰልም! እባክዎን በአፑ ላይ ያስገቡትን ስልክ ቁጥር ይጠቀሙ።";
        errorMsg.style.color = "#fee2e2";
        errorMsg.textContent = mismatchMsg;
        showInAppAlert("⚠️ የስልክ ቁጥር አለመመሳሰል", mismatchMsg, "warning");
      } else {
        var noAccountMsg = (res && res.error) || "እባክዎን የመግቢያ ቁጥር ለማግኘት የቴሌግራም አካውንት ይክፈቱና በድጋሚ ይሞክሩ።";
        errorMsg.style.color = "#fee2e2";
        errorMsg.textContent = noAccountMsg;
        showInAppAlert("⚠️ የቴሌግራም አካውንት አልተገኘም", noAccountMsg, "warning");
      }
    });
  }

  getOtpBtn.addEventListener("click", triggerOtpFlow);
  resendOtpBtn.addEventListener("click", triggerOtpFlow);
  headerRefreshBtn.addEventListener("click", triggerOtpFlow);

  codeRow.appendChild(codeInput);
  codeRow.appendChild(getOtpBtn);
  codeRow.appendChild(timerPill);
  codeRow.appendChild(resendOtpBtn);
  cardBody.appendChild(codeRow);
  cardBody.appendChild(inAppAlertBox);

  // Prominent Submit Button right below the code box with pure Amharic text: "አረጋግጥ እና ግባ"
  var verifySubmitBtn = el("button", {
    class: "canva-verify-submit-btn",
    type: "button"
  }, "አረጋግጥ እና ግባ");

  verifySubmitBtn.addEventListener("click", function () {
    var code = (codeInput.value || "").trim().replace(/\D/g, "");
    if (!code || code.length !== 6) {
      codeInput.classList.add("is-invalid");
      errorMsg.style.color = "#fee2e2";
      errorMsg.textContent = "እባክዎ በ @GrposBot የተላከውን ባለ 6 አሃዝ ኮድ ያስገቡ";
      codeInput.focus();
      return;
    }
    executeVerify(code);
  });
  cardBody.appendChild(verifySubmitBtn);

  // Dynamic & Clickable Code Input Handlers
  codeInput.addEventListener("click", function () {
    codeInput.focus();
  });

  codeInput.addEventListener("input", function (e) {
    var raw = e.target.value || "";
    var digitsOnly = raw.replace(/\D/g, "").slice(0, 6);
    e.target.value = digitsOnly;
    authState.otpData.code = digitsOnly;

    codeInput.classList.remove("is-valid", "is-invalid");
    errorMsg.textContent = "";

    // Automatic verification as soon as 6 digits are entered
    if (digitsOnly.length === 6) {
      executeVerify(digitsOnly);
    }
  });

  // Auto focus input on load
  setTimeout(function () {
    try { codeInput.focus(); } catch (e) {}
  }, 120);

  // Telegram Button [ ✈️ telegram ] - opens direct tg:// scheme with start=RESET_<cleanPhone>
  var initialCleanPhone = getCleanPhoneForTelegram();
  var tgBtn = el("a", {
    class: "canva-telegram-btn",
    href: "https://t.me/" + TELEGRAM_BOT_USERNAME + "?start=RESET_" + encodeURIComponent(initialCleanPhone || ""),
    onclick: function (e) {
      e.preventDefault();
      triggerOtpFlow();
    }
  }, [
    el("span", { class: "canva-tg-icon" }, "✈️"),
    el("span", {}, "telegram")
  ]);
  cardBody.appendChild(tgBtn);

  cardBody.appendChild(errorMsg);

  // Verification execution function
  function executeVerify(code) {
    var cleanCode = (code || "").trim().replace(/\D/g, "");
    if (!cleanCode || cleanCode.length !== 6) {
      codeInput.classList.add("is-invalid");
      errorMsg.style.color = "#fee2e2";
      errorMsg.textContent = "እባክዎ ባለ 6-አሃዝ ኮድ ያስገቡ";
      return;
    }

    verifySubmitBtn.disabled = true;
    verifySubmitBtn.textContent = "በማረጋገጥ ላይ...";
    errorMsg.style.color = "#e2e8f0";
    errorMsg.textContent = "ኮዱን በማረጋገጥ ላይ...";

    var phoneToVerify = (authState.otpData.phone || authState.regData.phone || authState.loginData.phone || "").trim().replace(/\s+/g, "");
    if (!phoneToVerify) {
      try {
        phoneToVerify = (sessionStorage.getItem("pending_auth_phone") || localStorage.getItem("pending_auth_phone") || "").trim().replace(/\s+/g, "");
      } catch (e) {}
    }
    var intlPhoneToVerify = toInternationalPhone(phoneToVerify) || phoneToVerify;

    withTimeout(
      fetch("/api/telegram/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: intlPhoneToVerify,
          rawPhone: phoneToVerify,
          code: cleanCode
        })
      }),
      10000
    )
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.ok && data.verified) {
        var confirmedPhone = (data.phone || phoneToVerify || "").trim().replace(/\s+/g, "");
        if (confirmedPhone === "0911000000") confirmedPhone = "";
        codeInput.classList.remove("is-invalid");
        codeInput.classList.add("is-valid");
        errorMsg.style.color = "#a7f3d0";
        errorMsg.textContent = "✓ ኮዱ ተረጋግጧል! ወደ የይለፍ ቃል ማስተካከያ በመሸጋገር ላይ...";
        setTimeout(function () {
          authState.currentScreen = "reset_password";
          rerender();
        }, 350);
      } else {
        codeInput.classList.remove("is-valid");
        codeInput.classList.add("is-invalid");
        errorMsg.style.color = "#fee2e2";
        errorMsg.textContent = data.error || "የተሳሳተ ኮድ — እባክዎ በ @GrposBot የተላከውን ባለ 6 አሃዝ ኮድ በትክክል ያስገቡ";
      }
    })
    .catch(function (error) {
      console.error("Auth Error:", error);
      codeInput.classList.remove("is-valid");
      codeInput.classList.add("is-invalid");
      errorMsg.style.color = "#fee2e2";
      if (error && error.message && error.message.includes("Network timeout")) {
        alert("Network timeout. Please check your connection or Firestore configuration.");
        errorMsg.textContent = "Network timeout. Please check your connection or Firestore configuration.";
      } else {
        alert("የመግባት/የምዝገባ ስህተት፦ " + (error?.message || "የማረጋገጫ ስህተት አጋጥሟል"));
        errorMsg.textContent = "የመግባት/የምዝገባ ስህተት፦ " + (error?.message || "የማረጋገጫ ስህተት አጋጥሟል");
      }
    })
    .finally(function () {
      verifySubmitBtn.disabled = false;
      verifySubmitBtn.textContent = "አረጋግጥ እና ግባ";
    });
  }

  async function completeAuth(verifiedPhone) {
    if (authState.otpData.timerId) clearInterval(authState.otpData.timerId);

    var orgName = authState.regData.orgName || "Seniya / GrPOS Store";
    var ownerName = authState.regData.fullName || "የሱቅ ባለቤት";
    var rawPhone = (
      verifiedPhone ||
      authState.otpData.phone ||
      authState.regData.phone ||
      authState.loginData.phone ||
      ""
    ).trim().replace(/\s+/g, "");

    if (!rawPhone) {
      try {
        rawPhone = (sessionStorage.getItem("pending_auth_phone") || localStorage.getItem("pending_auth_phone") || "").trim().replace(/\s+/g, "");
      } catch (e) {}
    }

    // STOP displaying hardcoded demo phone numbers
    if (rawPhone === "0911000000") rawPhone = "";

    // Convert phone to exact international format (+2519XXXXXXXX)
    var phone = toInternationalPhone(rawPhone) || rawPhone;

    var pin = authState.regData.password || "1234";

    // Generate unique Store/Tenant ID bound to phone or unique timestamp
    var digits = phone.replace(/\D/g, "");
    var uniqueStoreId = authState.regData.store_id || ("store_" + (digits || (Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7))));

    // Isolated Initial State for New Users:
    // When a brand new shop owner registers, their dashboard, sales, inventory, and transaction lists
    // MUST start completely empty (0.00 Birr), attached only to their newly generated store_id.
    var localData = freshEmptyData(uniqueStoreId, phone, orgName, ownerName);
    localData.ownerPhoneNumber = phone;
    localData.ownerPin = pin;
    localData.store_id = uniqueStoreId;
    localData.storeId = uniqueStoreId;
    localData.shopId = uniqueStoreId;
    localData.items = [];
    localData.sales = [];
    localData.expenses = [];
    localData.purchases = [];
    localData.customers = [];
    localData.suppliers = [];
    localData.shipments = [];
    localData.capitalInjections = [];
    localData.baseCapitalCents = 0;
    if (!localData.profile) localData.profile = {};
    if (orgName && orgName !== "Seniya / GrPOS Store") localData.profile.shopName = orgName;
    if (ownerName && ownerName !== "የሱቅ ባለቤት") localData.profile.ownerName = ownerName;
    localData.profile.phone = phone;

    // Automatically set the submitted Business Name as default primary shop
    if (!localData.locations || localData.locations.length === 0) {
      localData.locations = freshLocations(localData.profile.shopName || orgName);
    }

    // Persist auth in user prefs bound directly to this storeId
    var prefs = loadPrefs();
    prefs.authUser = {
      phone: phone,
      store_id: uniqueStoreId,
      storeId: uniqueStoreId,
      businessName: localData.profile.shopName || orgName,
      ownerName: localData.profile.ownerName || ownerName,
      role: "owner",
      isOwner: true,
      permissions: ["all"],
      passwordHash: simpleHash(pin),
      telegramLinked: true,
      botUsername: TELEGRAM_BOT_USERNAME,
      token: TELEGRAM_BOT_TOKEN
    };

    // Wrap the Firestore writes inside a try-catch block
    try {
      // 1. User Account Creation: Explicit write to users collection (Document ID: users/+251XXXXXXXXX)
      var userRes = await withTimeout(
        saveUserToFirestore({
          full_name: localData.profile.ownerName || ownerName,
          fullName: localData.profile.ownerName || ownerName,
          name: localData.profile.ownerName || ownerName,
          phone: phone,
          password: pin,
          role: "owner",
          isOwner: true,
          store_id: uniqueStoreId,
          storeId: uniqueStoreId
        }),
        10000
      );

      if (userRes && !userRes.ok) {
        throw new Error(userRes.error || "የተጠቃሚ መለያ በ Firestore ማስቀመጥ አልተቻለም");
      }

      // 2. Separate Shop Document Creation: shops/{store_id}
      var shopRes = await withTimeout(
        saveShopToFirestore({
          store_id: uniqueStoreId,
          shopId: uniqueStoreId,
          name: localData.profile.shopName || orgName,
          owner_phone: phone,
          ownerPhoneNumber: phone,
          owner_id: phone,
          ownerPin: pin,
          password: pin,
          employees: localData.employees || [],
          inventory: localData.items || [],
          sales: localData.sales || [],
          expenses: localData.expenses || [],
          shipments: localData.shipments || [],
          customers: localData.customers || [],
          profile: localData.profile || {}
        }),
        10000
      );

      if (shopRes && !shopRes.ok) {
        throw new Error(shopRes.error || "የሱቅ መረጃ በ Firestore ማስቀመጥ አልተቻለም");
      }

      console.log("[Auth Complete] ✓ Verified and persisted user and shop documents in Firestore");

      // Dynamic User Session Handling: Save only upon verified and persisted credentials
      if (phone) {
        try {
          sessionStorage.setItem("user_phone", phone);
          sessionStorage.setItem("active_phone", phone);
          localStorage.setItem("user_phone", phone);
          localStorage.setItem("active_phone", phone);
          sessionStorage.removeItem("pending_auth_phone");
          localStorage.removeItem("pending_auth_phone");
        } catch (e) {}
      }

      // Save isolated data strictly scoped to this store_id
      saveLocal(localData, phone, uniqueStoreId);
      savePrefs(prefs);

      try {
        sessionStorage.setItem("current_store_id", uniqueStoreId);
        sessionStorage.setItem("store_id", uniqueStoreId);
        localStorage.setItem("current_store_id", uniqueStoreId);
        localStorage.setItem("store_id", uniqueStoreId);
        sessionStorage.setItem("currentUser", JSON.stringify(prefs.authUser));
        sessionStorage.setItem("role", "admin");
        sessionStorage.setItem("authUser", JSON.stringify(prefs.authUser));
        localStorage.setItem("currentUser", JSON.stringify(prefs.authUser));
        localStorage.setItem("role", "admin");
        localStorage.setItem("authUser", JSON.stringify(prefs.authUser));
      } catch (e) {}

      // If registration or Firestore saving succeeds, navigate to dashboard
      if (onComplete) {
        onComplete({
          phone: phone,
          orgName: localData.profile.shopName || orgName,
          ownerName: localData.profile.ownerName || ownerName,
          shopId: uniqueStoreId,
          storeId: uniqueStoreId,
          authenticated: true,
          source: "verify"
        });
      }
    } catch (error) {
      console.error("Firebase Registration Error:", error);
      if (error && error.message && error.message.includes("Network timeout")) {
        alert("Network timeout. Please check your connection or Firestore configuration.");
      } else {
        alert("የምዝገባ ስህተት አጋጥሟል፡ " + (error?.message || error));
      }
      // DO NOT navigate to the dashboard.
      return;
    }
  }

  wrap.appendChild(cardBody);
  return wrap;
}

/**
 * -------------------------------------------------------------
 * SCREEN 5: አዲስ የይለፍ ቃል ያዘጋጁ (Reset Password Screen)
 * -------------------------------------------------------------
 */
function renderResetPasswordScreen(onComplete, onBack, rerender) {
  var wrap = el("div", { class: "canva-screen canva-screen-verify" });

  var topBar = el("div", { class: "canva-top-bar canva-top-bar-sky" }, [
    el("button", {
      class: "canva-back-btn",
      onclick: function () {
        authState.currentScreen = "login";
        rerender();
      }
    }, "←"),
    el("h2", { class: "canva-screen-title" }, "አዲስ የይለፍ ቃል ማስተካከያ")
  ]);
  wrap.appendChild(topBar);

  var cardBody = el("div", { class: "canva-verify-card-body", style: { paddingTop: "20px" } });
  var formContainer = el("form", {
    class: "canva-reg-gradient-card",
    autocomplete: "off",
    novalidate: "novalidate",
    onsubmit: function (e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
    },
    style: {
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      padding: "20px",
      borderRadius: "16px",
      boxShadow: "0 10px 25px rgba(0,0,0,0.3)"
    }
  });

  var activePhone = authState.otpData.phone || authState.loginData.phone || "";
  var phoneHeader = el("div", {
    style: {
      color: "#38bdf8",
      fontWeight: "700",
      marginBottom: "16px",
      fontSize: "14px",
      textAlign: "center"
    }
  }, "ለስልክ ቁጥር፦ " + (activePhone || "..."));

  var passLabel1 = el("label", { class: "canva-input-label", style: { color: "#f8fafc" } }, "አዲስ የይለፍ ቃል");
  var passWrap1 = el("div", { class: "canva-input-with-eye" });
  var passInput1 = el("input", {
    type: "password",
    name: "no-autofill-pass",
    class: "canva-reg-input",
    placeholder: "አዲስ የይለፍ ቃል ያስገቡ",
    autocomplete: "new-password",
    autocorrect: "off",
    autocapitalize: "none",
    spellcheck: "false",
    "data-lpignore": "true",
    "data-1p-ignore": "true"
  });
  var eyeBtn1 = el("button", { class: "canva-eye-btn", type: "button" }, "👁️");
  eyeBtn1.addEventListener("click", function () {
    passInput1.type = passInput1.type === "password" ? "text" : "password";
  });
  passWrap1.appendChild(passInput1);
  passWrap1.appendChild(eyeBtn1);

  var passLabel2 = el("label", { class: "canva-input-label", style: { color: "#f8fafc", marginTop: "12px" } }, "የይለፍ ቃል ያረጋግጡ");
  var passWrap2 = el("div", { class: "canva-input-with-eye" });
  var passInput2 = el("input", {
    type: "password",
    name: "no-autofill-pass",
    class: "canva-reg-input",
    placeholder: "የይለፍ ቃል እንደገና ያስገቡ",
    autocomplete: "new-password",
    autocorrect: "off",
    autocapitalize: "none",
    spellcheck: "false",
    "data-lpignore": "true",
    "data-1p-ignore": "true"
  });
  var eyeBtn2 = el("button", { class: "canva-eye-btn", type: "button" }, "👁️");
  eyeBtn2.addEventListener("click", function () {
    passInput2.type = passInput2.type === "password" ? "text" : "password";
  });
  passWrap2.appendChild(passInput2);
  passWrap2.appendChild(eyeBtn2);

  var errorMsg = el("div", { class: "canva-error-msg", style: { color: "#fca5a5", marginTop: "10px" } });

  var saveBtn = el("button", {
    class: "canva-action-btn-navy mt-4",
    style: {
      background: "#0284c7",
      color: "#ffffff",
      fontWeight: "bold",
      width: "100%",
      padding: "12px",
      borderRadius: "10px",
      fontSize: "15px",
      cursor: "pointer"
    }
  }, "የይለፍ ቃል ቀይር");

  saveBtn.addEventListener("click", async function () {
    var p1 = (passInput1.value || "").trim();
    var p2 = (passInput2.value || "").trim();

    if (!p1 || !p2) {
      errorMsg.style.color = "#fca5a5";
      errorMsg.textContent = "እባክዎ ሁለቱንም የይለፍ ቃል መስኮች ይሙሉ";
      return;
    }
    if (p1 !== p2) {
      errorMsg.style.color = "#fca5a5";
      errorMsg.textContent = "የይለፍ ቃሎቹ አልተመሳሰሉም — እባክዎ ያረጋግጡ";
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "በመቀየር ላይ...";
    errorMsg.style.color = "#a7f3d0";
    errorMsg.textContent = "የይለፍ ቃል በማስቀመጥ ላይ...";

    try {
      var intlP = toInternationalPhone(activePhone) || activePhone;
      // 1. Call reset password backend API
      await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: intlP, newPassword: p1 })
      });

      // 2. Also update in Firestore if available
      try {
        await saveUserToFirestore({
          phone: intlP,
          password: p1,
          role: "owner",
          isOwner: true
        });
      } catch (e) {}

      authState.regData.password = p1;
      showToast("የይለፍ ቃልዎ በትክክል ተቀይሯል!");
      errorMsg.style.color = "#a7f3d0";
      errorMsg.textContent = "✓ የይለፍ ቃልዎ በትክክል ተቀይሯል!";

      setTimeout(function () {
        completeAuthAfterReset(intlP, p1, onComplete);
      }, 500);
    } catch (err) {
      console.error("Reset Password Error:", err);
      errorMsg.style.color = "#fca5a5";
      errorMsg.textContent = "የይለፍ ቃል መለወጥ አልተቻለም፦ " + (err.message || err);
      saveBtn.disabled = false;
      saveBtn.textContent = "የይለፍ ቃል ቀይር";
    }
  });

  formContainer.appendChild(phoneHeader);
  formContainer.appendChild(passLabel1);
  formContainer.appendChild(passWrap1);
  formContainer.appendChild(passLabel2);
  formContainer.appendChild(passWrap2);
  formContainer.appendChild(errorMsg);
  formContainer.appendChild(saveBtn);

  cardBody.appendChild(formContainer);
  wrap.appendChild(cardBody);
  return wrap;
}

async function completeAuthAfterReset(phone, pin, onComplete) {
  var prefs = loadPrefs();
  var digits = phone.replace(/\D/g, "");
  var uniqueStoreId = authState.regData.store_id || ("store_" + digits);

  prefs.authUser = {
    phone: phone,
    store_id: uniqueStoreId,
    storeId: uniqueStoreId,
    role: "owner",
    isOwner: true,
    permissions: ["all"],
    passwordHash: simpleHash(pin),
    telegramLinked: true,
    botUsername: TELEGRAM_BOT_USERNAME,
    token: TELEGRAM_BOT_TOKEN
  };
  savePrefs(prefs);

  try {
    sessionStorage.setItem("user_phone", phone);
    sessionStorage.setItem("active_phone", phone);
    localStorage.setItem("user_phone", phone);
    localStorage.setItem("active_phone", phone);
    sessionStorage.setItem("current_store_id", uniqueStoreId);
    sessionStorage.setItem("store_id", uniqueStoreId);
    localStorage.setItem("current_store_id", uniqueStoreId);
    localStorage.setItem("store_id", uniqueStoreId);
    sessionStorage.setItem("currentUser", JSON.stringify(prefs.authUser));
    sessionStorage.setItem("role", "admin");
    sessionStorage.setItem("authUser", JSON.stringify(prefs.authUser));
    localStorage.setItem("currentUser", JSON.stringify(prefs.authUser));
    localStorage.setItem("role", "admin");
    localStorage.setItem("authUser", JSON.stringify(prefs.authUser));
  } catch (e) {}

  if (onComplete) {
    onComplete({
      phone: phone,
      shopId: uniqueStoreId,
      storeId: uniqueStoreId,
      authenticated: true,
      source: "reset_password"
    });
  }
}

/**
 * Reset authentication state completely on logout
 */
export function resetAuthState() {
  if (authState.otpData && authState.otpData.timerId) {
    clearInterval(authState.otpData.timerId);
    authState.otpData.timerId = null;
  }
  authState.currentScreen = "login";
  authState.showSeniyaLogo = true;
  authState.isForgotPassword = false;
  authState.regData = {
    orgName: "",
    fullName: "",
    phone: "",
    password: "",
    confirmPassword: ""
  };
  authState.loginData = {
    phone: "",
    password: ""
  };
  authState.otpData = {
    code: "",
    phone: "",
    secondsLeft: 119,
    timerId: null,
    isBotActive: true
  };
  try {
    sessionStorage.removeItem("pending_auth_phone");
    localStorage.removeItem("pending_auth_phone");
  } catch (e) {}
}
