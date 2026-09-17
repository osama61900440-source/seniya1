// core.js - Data models, calculations, and Ethiopian calendar math
import { ensureDataSyncFlags, saveToIndexedDB } from "./offlineSync.js";

export var STORAGE_KEY = "shop-control-data-v5";
export var OLD_V4_KEY = "shop-control-data-v4";
export var OLD_V3_KEY = "shop-control-data-v3";
export var OLD_V2_KEY = "shop-control-data-v2";
export var FIREBASE_CFG_KEY = "shop-control-firebase-cfg";
export var PREFS_KEY = "shop-control-prefs-v1";
export var PERIOD_LABEL = { day: "የቀን", week: "የሳምንት", month: "የወር", year: "የአመት" };
export var ETH_MONTHS = ["መስከረም","ጥቅምት","ኅዳር","ታኅሳስ","ጥር","የካቲት","መጋቢት","ሚያዝያ","ግንቦት","ሰኔ","ሐምሌ","ነሐሴ","ጳጉሜን"];
export var ETH_WEEKDAYS = ["ሰኞ","ማክሰኞ","ረቡዕ","ሐሙስ","ዓርብ","ቅዳሜ","እሁድ"];
export var DEFAULT_EXPENSE_CATEGORIES = ["የቤት ኪራይ", "ደሞዝ", "መብራት/ውሃ", "ጥቃቅን ወጪዎች", "ለትምህርት ቤት", "ሌላ"];
export var EXPENSE_CATEGORIES = DEFAULT_EXPENSE_CATEGORIES;
export var BANK_NAMES = ["CBE (ንግድ ባንክ)", "አዋሽ ባንክ", "ዳሸን ባንክ", "አቢሲኒያ ባንክ", "ኦሮሚያ ባንክ", "ሌላ"];
export var GOAL_MONTHLY_CENTS_DEFAULT = 21000000;
export var ACCENT_PRESETS = ["#2563eb", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#0f766e"];

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export function escapeHtml(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function todayISO() {
  var d = new Date();
  var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

export function parseVaultAmount(str) {
  if (str === null || str === undefined) return 0;
  if (typeof str === "number") return isNaN(str) ? 0 : str;
  var s = String(str).trim();
  if (!s) return 0;

  // Handle strings with both commas and dots: e.g. "1,500.50" or "1.500,50"
  if (s.indexOf(",") !== -1 && s.indexOf(".") !== -1) {
    if (s.lastIndexOf(".") > s.lastIndexOf(",")) {
      // "1,500.50" -> standard comma thousands, dot decimal
      s = s.replace(/,/g, "");
    } else {
      // "1.500,50" -> dot thousands, comma decimal
      s = s.replace(/\./g, "").replace(",", ".");
    }
  } else if (s.indexOf(",") !== -1) {
    // Only comma(s): e.g. "1,500" or "1,500,000" or "500,50"
    var parts = s.split(",");
    if (parts.length === 2 && parts[1].length !== 3) {
      // Single comma followed by 1 or 2 digits (e.g. 500,50) -> decimal
      s = parts[0] + "." + parts[1];
    } else {
      // Thousand separators (e.g. 1,500 or 1,500,000)
      s = s.replace(/,/g, "");
    }
  }
  s = s.replace(/[^\d.-]/g, "");
  var val = parseFloat(s);
  return isNaN(val) ? 0 : val;
}

export function toCents(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : Math.round(v * 100);
  var n = parseVaultAmount(v);
  return Math.round(n * 100);
}

export function fmt(cents) {
  cents = Math.round(Number(cents) || 0);
  var neg = cents < 0; cents = Math.abs(cents);
  var whole = Math.floor(cents / 100), frac = cents % 100;
  return (neg ? "-" : "") + whole.toLocaleString("en-US") + "." + String(frac).padStart(2, "0") + " ብር";
}

export function fmtNum(cents) {
  cents = Math.round(Number(cents) || 0);
  var neg = cents < 0; cents = Math.abs(cents);
  var whole = Math.floor(cents / 100);
  return (neg ? "-" : "") + whole.toLocaleString("en-US");
}

export function daysBetween(iso1, iso2) {
  var a = new Date(iso1 + "T00:00:00"), b = new Date(iso2 + "T00:00:00");
  return Math.max(0, Math.round((b - a) / 86400000));
}

export var submitLock = false;
export function guarded(fn) {
  return function () {
    if (submitLock) return;
    submitLock = true;
    try { fn.apply(null, arguments); } finally { setTimeout(function () { submitLock = false; }, 600); }
  };
}

export function isGregLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

export function ethNewYearGregorianDate(gYear) {
  var day = isGregLeap(gYear + 1) ? 12 : 11;
  return new Date(gYear, 8, day);
}

export function gregorianToEthiopian(gDate) {
  var gYear = gDate.getFullYear();
  var nyThisG = ethNewYearGregorianDate(gYear);
  var startGYear = gDate >= nyThisG ? gYear : gYear - 1;
  var newYear = ethNewYearGregorianDate(startGYear);
  var diffDays = Math.floor((gDate - newYear) / 86400000);
  var ethYear = startGYear - 7;
  var month = Math.floor(diffDays / 30) + 1;
  var day = (diffDays % 30) + 1;
  return { year: ethYear, month: month, day: day };
}

export function ethLabel(y, m) { return ETH_MONTHS[m - 1] + " " + y + " ዓ.ም"; }

export function ethMonthStartGregorianISO(ethYear, ethMonth) {
  var startGYear = ethYear + 7;
  var newYear = ethNewYearGregorianDate(startGYear);
  var d = new Date(newYear);
  d.setDate(d.getDate() + (ethMonth - 1) * 30);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function ethiopianYearStartGregorianISO(ethYear) {
  var startGYear = ethYear + 7;
  var d = ethNewYearGregorianDate(startGYear);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function periodRange(period) {
  var now = new Date(), start;
  if (period === "day") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  else if (period === "week") { var day = now.getDay(); var diffToMonday = (day + 6) % 7; start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday); }
  else if (period === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
  else start = new Date(now.getFullYear(), 0, 1);
  return { start: start.getTime(), end: now.getTime() + 1 };
}

export function inPeriod(iso, range) { var t = new Date(iso + "T00:00:00").getTime(); return t >= range.start && t <= range.end; }

export function freshAllocations() {
  return [
    { id: "cap", name: "ለስራ ካፒታል", percent: 60 },
    { id: "equb", name: "እቁብ", percent: 20 },
    { id: "rebi", name: "ረቢ", percent: 10 },
    { id: "sav", name: "ቁጠባ", percent: 10 }
  ];
}

export function saleCogsCents(sale) {
  if (!sale) return 0;
  if (Array.isArray(sale.items) && sale.items.length > 0) {
    return sale.items.reduce(function (sum, it) {
      var cost = typeof it.costPriceCents === "number" ? it.costPriceCents : (typeof it.unitCostCents === "number" ? it.unitCostCents : 0);
      return sum + (cost * (Number(it.qty) || 0));
    }, 0);
  }
  var uCost = typeof sale.unitCostCents === "number" ? sale.unitCostCents : (typeof sale.costPriceCents === "number" ? sale.costPriceCents : 0);
  return uCost * (Number(sale.qty) || 0);
}

export function cumulativeSoldProductCostCents(data) {
  if (!data || !Array.isArray(data.sales)) return 0;
  return data.sales.reduce(function (sum, s) {
    return sum + saleCogsCents(s);
  }, 0);
}

export function syncAndGetDailyAllocations(data) {
  if (!data) data = {};
  if (!Array.isArray(data.allocations)) {
    data.allocations = freshAllocations();
  }
  // Automatically filter out any legacy "exp" id category so old exp item is cleaned up
  data.allocations = data.allocations.filter(function (a) {
    return a.id !== "exp";
  });
  if (!data.dailyAllocations || typeof data.dailyAllocations !== "object") {
    data.dailyAllocations = {};
  }

  var sales = Array.isArray(data.sales) ? data.sales : [];
  var expenses = Array.isArray(data.expenses) ? data.expenses : [];
  var today = todayISO();

  // Group sales by date
  var salesByDate = {};
  sales.forEach(function (s) {
    var d = s.date || today;
    if (!salesByDate[d]) salesByDate[d] = [];
    salesByDate[d].push(s);
  });

  // Group operational expenses by date (excluding goods purchase & freight)
  var expensesByDate = {};
  expenses.forEach(function (e) {
    if (e.category === "የዕቃ ግዢ" || e.category === "ዕቃ መግዣ" || e.isPurchase === true || e.isShipmentFreight) return;
    var d = e.date || today;
    if (!expensesByDate[d]) expensesByDate[d] = [];
    expensesByDate[d].push(e);
  });

  var allDates = {};
  Object.keys(salesByDate).forEach(function (d) { allDates[d] = true; });
  Object.keys(expensesByDate).forEach(function (d) { allDates[d] = true; });
  allDates[today] = true;

  Object.keys(allDates).forEach(function (d) {
    var daySales = salesByDate[d] || [];
    var dayExpenses = expensesByDate[d] || [];

    var dayRev = daySales.reduce(function (sum, s) { return sum + (Number(s.totalCents) || 0); }, 0);
    var dayCogs = daySales.reduce(function (sum, s) { return sum + saleCogsCents(s); }, 0);
    var dayGrossProfit = Math.max(0, dayRev - dayCogs);

    // Expense Deduction First: calculate and subtract expense percentage from gross daily profit
    var expPct = Number(data.expensePercent) || 0;
    var dayExpFromPct = Math.round(dayGrossProfit * (expPct / 100));
    var dayExpLogged = dayExpenses.reduce(function (sum, e) { return sum + (Number(e.amountCents) || 0); }, 0);
    var dayExpTotal = expPct > 0 ? (dayExpFromPct + dayExpLogged) : dayExpLogged;
    var dayNetProfit = Math.max(0, dayGrossProfit - dayExpTotal);

    var makeAllocList = function() {
      var list = [{
        id: "exp_deduction",
        name: "📉 የወጪ ተቀናሽ",
        percent: expPct,
        amountCents: dayExpFromPct
      }];
      (data.allocations || []).forEach(function (a) {
        var pct = Number(a.percent) || 0;
        list.push({
          id: a.id,
          name: a.name,
          percent: pct,
          amountCents: Math.round(dayGrossProfit * (pct / 100))
        });
      });
      return list;
    };

    if (d === today) {
      // Today always reflects current live settings in data.allocations
      var currentAlloc = makeAllocList();
      data.dailyAllocations[d] = {
        date: d,
        revenueCents: dayRev,
        cogsCents: dayCogs,
        grossProfitCents: dayGrossProfit,
        expenseCents: dayExpTotal,
        netProfitCents: dayNetProfit,
        allocations: currentAlloc,
        locked: false,
        updatedAt: Date.now()
      };
    } else {
      // Past day: if already saved and locked, keep or update allocation percentages
      var existing = data.dailyAllocations[d];
      if (existing && existing.locked && Array.isArray(existing.allocations) && existing.allocations.length > 0) {
        existing.revenueCents = dayRev;
        existing.cogsCents = dayCogs;
        existing.grossProfitCents = dayGrossProfit;
        existing.expenseCents = dayExpTotal;
        existing.netProfitCents = dayNetProfit;
        existing.allocations = makeAllocList();
      } else {
        // Lock this past day permanently with snapshot
        var pastAlloc = makeAllocList();
        data.dailyAllocations[d] = {
          date: d,
          revenueCents: dayRev,
          cogsCents: dayCogs,
          grossProfitCents: dayGrossProfit,
          expenseCents: dayExpTotal,
          netProfitCents: dayNetProfit,
          allocations: pastAlloc,
          locked: true,
          lockedAt: Date.now()
        };
      }
    }
  });

  return data.dailyAllocations;
}

export function getAllocatedFundBalances(data) {
  if (!data) data = {};
  var daily = syncAndGetDailyAllocations(data);
  var shipments = Array.isArray(data.shipments) ? data.shipments : [];
  var expPct = Number(data.expensePercent) || 0;
  var expenseVaultCat = { id: "exp_deduction", name: "📉 የወጪ ተቀናሽ", percent: expPct };
  var baseAllocations = Array.isArray(data.allocations) && data.allocations.length > 0
    ? data.allocations
    : freshAllocations();
  var currentAllocations = [expenseVaultCat].concat(baseAllocations);

  var cumCogs = cumulativeSoldProductCostCents(data);

  // Compute total COGS deductions from shipments
  var totalDeductedCogs = 0;
  shipments.forEach(function (sh) {
    if (sh.vaultDeductions && typeof sh.vaultDeductions["cogs_returned"] === "number") {
      totalDeductedCogs += (Number(sh.vaultDeductions["cogs_returned"]) || 0);
    } else if (sh.capitalDeduction && typeof sh.capitalDeduction.fromReturnedCents === "number") {
      totalDeductedCogs += (Number(sh.capitalDeduction.fromReturnedCents) || 0);
    } else if (sh.selectedFundId === "cogs_returned" || sh.capitalSource === "returned_capital") {
      totalDeductedCogs += (Number(sh.capitalDeduction && sh.capitalDeduction.deductedAmountCents) || Number(sh.totalCostCents) || 0);
    }
  });
  var netCumCogs = Math.max(0, cumCogs - totalDeductedCogs);

  var categoryBalances = currentAllocations.map(function (cat) {
    var catId = cat.id;
    var catName = cat.name;

    var totalAllocatedCents = 0;
    Object.keys(daily).forEach(function (d) {
      var dayRecord = daily[d];
      if (dayRecord && Array.isArray(dayRecord.allocations)) {
        var match = dayRecord.allocations.find(function (a) {
          return a.id === catId || a.name === catName;
        });
        if (match) {
          totalAllocatedCents += (Number(match.amountCents) || 0);
        }
      }
    });

    var todayRecord = daily[todayISO()];
    var todayAllocatedCents = 0;
    if (todayRecord && Array.isArray(todayRecord.allocations)) {
      var tMatch = todayRecord.allocations.find(function (a) {
        return a.id === catId || a.name === catName;
      });
      if (tMatch) todayAllocatedCents = Number(tMatch.amountCents) || 0;
    }

    var totalDeductedCents = 0;
    shipments.forEach(function (sh) {
      var cost = Number(sh.totalCostCents) || 0;
      if (cost <= 0) return;

      if (sh.vaultDeductions && typeof sh.vaultDeductions[catId] === "number") {
        totalDeductedCents += (Number(sh.vaultDeductions[catId]) || 0);
      } else if (sh.capitalDeduction && sh.capitalDeduction.vaultDeductions && typeof sh.capitalDeduction.vaultDeductions[catId] === "number") {
        totalDeductedCents += (Number(sh.capitalDeduction.vaultDeductions[catId]) || 0);
      } else if (sh.selectedFundId === catId || sh.selectedFundName === catName) {
        totalDeductedCents += (Number(sh.capitalDeduction && sh.capitalDeduction.deductedAmountCents) || cost);
      } else if (sh.capitalDeduction && (sh.capitalDeduction.fundId === catId || sh.capitalDeduction.fundName === catName)) {
        totalDeductedCents += (Number(sh.capitalDeduction.deductedAmountCents) || cost);
      } else if (catName && (catName.indexOf("ካፒታል") !== -1 || catName.indexOf("ስራ") !== -1)) {
        if (sh.capitalSource === "profit_capital") {
          totalDeductedCents += (Number(sh.capitalDeduction && sh.capitalDeduction.deductedAmountCents) || cost);
        } else if (sh.capitalDeduction && typeof sh.capitalDeduction.fromProfitCents === "number") {
          totalDeductedCents += Number(sh.capitalDeduction.fromProfitCents) || 0;
        }
      }
    });

    // Support direct withdrawals from vaults across time until withdrawn
    if (Array.isArray(data.vaultWithdrawals)) {
      data.vaultWithdrawals.forEach(function (w) {
        if (w.vaultId === catId || w.vaultName === catName) {
          totalDeductedCents += (Number(w.amountCents) || 0);
        }
      });
    }

    var netBalanceCents = Math.max(0, totalAllocatedCents - totalDeductedCents);

    return {
      id: catId,
      name: catName,
      percent: Number(cat.percent) || 0,
      todayAllocatedCents: todayAllocatedCents,
      totalAllocatedCents: totalAllocatedCents,
      totalDeductedCents: totalDeductedCents,
      balanceCents: netBalanceCents
    };
  });

  var sumCategoryBalancesCents = categoryBalances.reduce(function (sum, c) {
    return sum + c.balanceCents;
  }, 0);

  // Dynamically compute each vault's percentage relative to the TOTAL accumulated pool
  categoryBalances.forEach(function (c) {
    if (sumCategoryBalancesCents > 0) {
      c.poolPercent = Math.round((c.balanceCents / sumCategoryBalancesCents) * 1000) / 10;
    } else {
      c.poolPercent = 0;
    }
  });

  // Set Total Cash = (Net Cumulative Sold Product Cost) + (Sum of All Accumulated Allocation Category Balances)
  var totalCashCents = netCumCogs + sumCategoryBalancesCents;

  var todayRec = daily[todayISO()] || {};

  return {
    cumulativeSoldCogsCents: netCumCogs,
    grossSoldCogsCents: cumCogs,
    deductedSoldCogsCents: totalDeductedCogs,
    categoryBalances: categoryBalances,
    sumCategoryBalancesCents: sumCategoryBalancesCents,
    totalPoolCents: sumCategoryBalancesCents,
    totalCashCents: totalCashCents,
    expensePercent: Number(data.expensePercent) || 0,
    todayNetProfitCents: todayRec.netProfitCents || 0,
    todayGrossProfitCents: todayRec.grossProfitCents || 0,
    todayExpenseCents: todayRec.expenseCents || 0,
    todayRevenueCents: todayRec.revenueCents || 0,
    todayCogsCents: todayRec.cogsCents || 0
  };
}

export function getExpenseCategories(data) {
  if (data && Array.isArray(data.expenseCategories) && data.expenseCategories.length > 0) {
    return data.expenseCategories;
  }
  return DEFAULT_EXPENSE_CATEGORIES.slice();
}

export function freshProfile() {
  return {
    shopName: "",
    ownerName: "",
    email: "",
    phone: "",
    tin: "",
    license: "",
    businessSector: "",
    digitalId: "",
    businessRegistration: "",
    address: "",
    managerPhoto: "",
    trademarkLogo: "",
    trademarkLogoName: "",
    businessLicenseDoc: "",
    businessLicenseDocName: "",
    registrationDoc: "",
    registrationDocName: "",
    tinDoc: "",
    tinDocName: "",
    taxClearanceDoc: "",
    taxClearanceDocName: "",
    leaseContractDoc: "",
    leaseContractDocName: "",
    leaseContractDocPage2: "",
    leaseContractDocPage2Name: "",
    leaseContractDocPage3: "",
    leaseContractDocPage3Name: "",
    idCardDoc: "",
    idCardDocName: "",
    maritalStatusDoc: "",
    maritalStatusDocName: ""
  };
}

export function freshLoanCenter() {
  return {
    bankName: "የኢትዮጵያ ንግድ ባንክ",
    requestedAmountCents: 0,
    usageAllocations: [{ id: uid(), purpose: "አዲስ ዕቃ ግዢ", percent: 60 }, { id: uid(), purpose: "ኢንቬንቶሪ ማስፋፊያ", percent: 20 }, { id: uid(), purpose: "ሌላ", percent: 20 }],
    proformaInvoices: [],
    cashFlowProjection: [],
    suppliers: [],
    customers: [],
    marketAnalysis: ""
  };
}

export function freshEmployees() {
  return [
    { id: "emp_1", name: "ሰለሞን ታደሰ", phone: "+251911223344", role: "ካሸር / ሽያጭ", pin: "1234", status: "active", createdAt: Date.now() - 86400000 * 10 },
    { id: "emp_2", name: "ዮናታን በቀለ", phone: "+251922556677", role: "ማናጀር", pin: "2345", status: "active", createdAt: Date.now() - 86400000 * 8 },
    { id: "emp_3", name: "ረቢ አፈሯ", phone: "+251712615522", role: "የስቶክ/መጋዘን ኃላፊ", pin: "3456", status: "active", createdAt: Date.now() - 86400000 * 6 },
    { id: "emp_4", name: "ወ/ዘመለሰች", phone: "+251987653311", role: "ካሸር / ሽያጭ", pin: "4567", status: "active", createdAt: Date.now() - 86400000 * 4 },
    { id: "emp_5", name: "ከድር መሀመድ", phone: "+251933112244", role: "ሒሳብ ሹም", pin: "5678", status: "active", createdAt: Date.now() - 86400000 * 2 },
    { id: "emp_6", name: "መሀመድ ከድር", phone: "+251973828899", role: "ካሸር / ሽያጭ", pin: "6789", status: "active", createdAt: Date.now() - 86400000 }
  ];
}

export function freshLocations(primaryName) {
  return [
    { id: "shop01", name: primaryName || "ሱቅ 01 (ዋና)", type: "shop", manager: "ዋና ማናጀር", address: "ዋና ገበያ", note: "ዋና ሱቅ" }
  ];
}

export function freshCustomers() {
  return [
    { id: "cust_1", name: "ረቢ ሰራጅ", phone: "0712615908", address: "ፍጬ", notes: "መደበኛ ደንበኛ", createdAt: Date.now() - 86400000 * 5 },
    { id: "cust_2", name: "ሰለሞን ታደሰ", phone: "0911223344", address: "አዲስ አበባ", notes: "", createdAt: Date.now() - 86400000 * 3 },
    { id: "cust_3", name: "ዮናታን በቀለ", phone: "0922556677", address: "ሀዋሳ", notes: "", createdAt: Date.now() - 86400000 * 2 }
  ];
}

export function freshSuppliers() {
  return [];
}

export function freshShipmentsSample() {
  return [
    {
      id: "ship_sample_rebi",
      date: "2024-09-15",
      ethDateDisplay: "መስከረም 2017",
      ethYear: 2017,
      ethMonth: 1,
      option: "full",
      location: "ዋና መጋዘን",
      truckPlate: "3-B12345 አ.አ",
      driver: "ረቢ ሰራጅ",
      supplier: "ረቢ ሰራጅ",
      supplierPhone: "0712615908",
      freightCostCents: 200000,
      offloadingCostCents: 50000,
      miscCostCents: 20000,
      totalFreightCents: 270000,
      overheadPerUnitCents: 1500,
      itemsCount: 5,
      totalPieces: 160,
      damagedPieces: 5,
      totalCostCents: 95000000,
      totalPaidCents: 71088000,
      expectedProfitCents: 35000000,
      isCreditPurchase: true,
      creditAmountCents: 23912000,
      supplierCreditId: "cred_rebi_1",
      creditDueDate: "2026-10-15",
      items: [
        {
          day: "5",
          name: "ሱሪ",
          code: "ሀ1",
          supplier: "ረቢ ሰራጅ",
          qty: 150,
          damaged: 0,
          netQty: 150,
          costPriceCents: 750000,
          landedCostCents: 750000,
          sellPriceCents: 6000000,
          soldTotalCents: 6000000,
          profitCents: 1500000,
          paymentStatus: "ዱቤ ከፈሉ"
        },
        {
          day: "5",
          name: "ቀሚስ",
          code: "መ2",
          supplier: "ረቢ ሰራጅ",
          qty: 70,
          damaged: 0,
          netQty: 70,
          costPriceCents: 750000,
          landedCostCents: 750000,
          sellPriceCents: 3500000,
          soldTotalCents: 3500000,
          profitCents: 600000,
          paymentStatus: "ዱቤ ከፈለ"
        },
        {
          day: "15",
          name: "ሻርፕ",
          code: "ሀ2",
          supplier: "ረቢ ሰራጅ",
          qty: 53,
          damaged: 0,
          netQty: 53,
          costPriceCents: 750000,
          landedCostCents: 750000,
          sellPriceCents: 1590000,
          soldTotalCents: 1590000,
          profitCents: 300000,
          paymentStatus: "የተከፈለ"
        },
        {
          day: "16",
          name: "ሸሚዝ",
          code: "መ3",
          supplier: "ረቢ ሰራጅ",
          qty: 25,
          damaged: 0,
          netQty: 25,
          costPriceCents: 750000,
          landedCostCents: 750000,
          sellPriceCents: 750000,
          soldTotalCents: 750000,
          profitCents: 200000,
          paymentStatus: "የተከፈለ"
        },
        {
          day: "30",
          name: "ካፖርት",
          code: "መ1",
          supplier: "ረቢ ሰራጅ",
          qty: 15,
          damaged: 2,
          netQty: 13,
          costPriceCents: 750000,
          landedCostCents: 750000,
          sellPriceCents: 600000,
          soldTotalCents: 600000,
          profitCents: 100000,
          paymentStatus: "የተከፈለ"
        }
      ],
      createdAt: Date.now() - 86400000 * 3
    }
  ];
}

export function freshItemsSample() {
  return [
    { id: "item_tasa", name: "ጣሳ", code: "TS-01", sellPriceCents: 100000, costPriceCents: 80000, openingStock: 50, dateAdded: todayISO(), createdAt: Date.now() - 86400000 * 10 },
    { id: "item_jebena", name: "ጀበና", code: "JB-02", sellPriceCents: 75000, costPriceCents: 50000, openingStock: 40, dateAdded: todayISO(), createdAt: Date.now() - 86400000 * 10 },
    { id: "item_sefed", name: "ሰፌድ", code: "SF-03", sellPriceCents: 75000, costPriceCents: 50000, openingStock: 30, dateAdded: todayISO(), createdAt: Date.now() - 86400000 * 10 }
  ];
}

export function freshSalesSample() {
  return [
    {
      id: "sale_rebi_sample",
      orderId: "ORD-1001",
      orderNumber: 1,
      customer: "ረቢ ሰራጅ",
      customerPhone: "0712615908",
      paymentMethod: "credit",
      bankName: "",
      items: [
        { itemId: "item_tasa", name: "ጣሳ", itemName: "ጣሳ", code: "TS-01", qty: 5, unitPriceCents: 100000, costPriceCents: 80000, totalCents: 500000 },
        { itemId: "item_jebena", name: "ጀበና", itemName: "ጀበና", code: "JB-02", qty: 4, unitPriceCents: 75000, costPriceCents: 50000, totalCents: 300000 },
        { itemId: "item_sefed", name: "ሰፌድ", itemName: "ሰፌድ", code: "SF-03", qty: 6, unitPriceCents: 75000, costPriceCents: 50000, totalCents: 450000 }
      ],
      itemId: "item_tasa",
      itemName: "ጣሳ (5) እና ሌሎች 2 ዕቃዎች",
      qty: 15,
      unitPriceCents: 0,
      costPriceCents: 0,
      totalCents: 1250000,
      advanceCents: 200000,
      creditRemainingCents: 1050000,
      paid: false,
      date: todayISO(),
      createdAt: Date.now() - 1000 * 60 * 30
    }
  ];
}

export function freshEmptyData(storeId, phone, orgName, ownerName) {
  var digits = phone ? String(phone).replace(/\D/g, "") : "";
  var sId = storeId || (digits ? ("store_" + digits) : ("store_" + Math.random().toString(36).slice(2, 9)));
  return {
    store_id: sId,
    storeId: sId,
    shopId: sId,
    ownerPhoneNumber: phone || "",
    ownerPin: "",
    baseCapitalCents: 0,
    capitalInjections: [],
    items: [],
    sales: [],
    expenses: [],
    purchases: [],
    customers: [],
    allocations: freshAllocations(),
    dailyAllocations: {},
    profile: {
      shopName: orgName || "የእኔ ሱቅ",
      ownerName: ownerName || "የሱቅ ባለቤት",
      phone: phone || "",
      currency: "ETB",
      tinNumber: "",
      vatRegistered: false,
      vatNumber: "",
      address: "",
      email: "",
      managerPhoto: "",
      trademarkLogo: ""
    },
    loanCenter: freshLoanCenter(),
    capitalGoalMonthlyCents: GOAL_MONTHLY_CENTS_DEFAULT,
    suppliers: [],
    shipments: [],
    accountsPayable: [],
    employees: [],
    locations: freshLocations(orgName || "ዋና ሱቅ")
  };
}

export function freshData() {
  return {
    shopId: "shop_" + Math.random().toString(36).slice(2, 9),
    ownerPhoneNumber: "",
    ownerPin: "",
    baseCapitalCents: 5000000,
    capitalInjections: [],
    items: freshItemsSample(),
    sales: freshSalesSample(),
    expenses: [],
    purchases: [],
    customers: freshCustomers(),
    allocations: freshAllocations(),
    dailyAllocations: {},
    profile: freshProfile(),
    loanCenter: freshLoanCenter(),
    capitalGoalMonthlyCents: GOAL_MONTHLY_CENTS_DEFAULT,
    suppliers: freshSuppliers(),
    shipments: freshShipmentsSample(),
    accountsPayable: [],
    employees: freshEmployees(),
    locations: freshLocations()
  };
}

export function toInternationalPhone(phone) {
  if (!phone) return "";
  var raw = String(phone).trim().replace(/[\s\-()]/g, "");
  var digits = raw.replace(/\D/g, "");

  // Handle +251 09... or 25109... (13 digits)
  if (digits.startsWith("2510") && digits.length === 13) {
    return "+251" + digits.slice(4);
  }
  // Standard 2519... or 2517... (12 digits)
  if (digits.startsWith("251") && digits.length === 12) {
    return "+" + digits;
  }
  // Standard 09... or 07... (10 digits)
  if (digits.startsWith("0") && digits.length === 10) {
    return "+251" + digits.slice(1);
  }
  // 9 digits starting with 9 or 7 (e.g. 911223344 or 711223344)
  if ((digits.startsWith("9") || digits.startsWith("7")) && digits.length === 9) {
    return "+251" + digits;
  }
  if (raw.startsWith("+") && digits.length >= 9) {
    return "+" + digits;
  }
  if (digits.length >= 9) {
    return "+251" + (digits.startsWith("0") ? digits.slice(1) : digits);
  }
  return digits ? ("+" + digits) : "";
}

export function normalizePhone(phone) {
  if (!phone) return "";
  var raw = String(phone).trim().replace(/[\s\-()]/g, "");
  var digits = raw.replace(/\D/g, "");

  // Handle +251 09... or 25109... (13 digits)
  if (digits.startsWith("2510") && digits.length === 13) {
    return "0" + digits.slice(4);
  }
  // Standard 2519... or 2517... (12 digits)
  if (digits.startsWith("251") && digits.length === 12) {
    return "0" + digits.slice(3);
  }
  // Standard 09... or 07... (10 digits)
  if (digits.startsWith("0") && digits.length === 10) {
    return digits;
  }
  // 9 digits starting with 9 or 7
  if (digits.length === 9 && (digits.startsWith("9") || digits.startsWith("7"))) {
    return "0" + digits;
  }
  return digits;
}

export function getPhoneLookupCandidates(phone) {
  if (!phone) return [];
  var clean = String(phone).trim().replace(/[\s\-()]/g, "");
  if (!clean) return [];

  var intl = toInternationalPhone(clean);
  var local = normalizePhone(clean);
  var digits = clean.replace(/\D/g, "");

  var candidates = [];
  // 1. +251XXXXXXXXX (Primary Firestore users collection Document ID format)
  if (intl && candidates.indexOf(intl) === -1) candidates.push(intl);
  // 2. 09XXXXXXXX / 07XXXXXXXX (Local format)
  if (local && candidates.indexOf(local) === -1) candidates.push(local);
  // 3. Raw clean string
  if (clean && candidates.indexOf(clean) === -1) candidates.push(clean);
  // 4. Pure digits (e.g. 2519XXXXXXXX)
  if (digits && candidates.indexOf(digits) === -1) candidates.push(digits);

  return candidates;
}

export function getActiveUserPhone() {
  if (typeof window === "undefined") return "";
  try {
    var p = sessionStorage.getItem("user_phone") || sessionStorage.getItem("active_phone");
    if (p && p.trim() && p !== "0911000000") return p.trim();
    p = localStorage.getItem("user_phone") || localStorage.getItem("active_phone");
    if (p && p.trim() && p !== "0911000000") return p.trim();
    var sCur = sessionStorage.getItem("currentUser") || sessionStorage.getItem("authUser");
    if (sCur) {
      var parsedS = JSON.parse(sCur);
      if (parsedS && parsedS.phone && parsedS.phone !== "0911000000") return String(parsedS.phone).trim();
    }
    var lCur = localStorage.getItem("currentUser") || localStorage.getItem("authUser");
    if (lCur) {
      var parsedL = JSON.parse(lCur);
      if (parsedL && parsedL.phone && parsedL.phone !== "0911000000") return String(parsedL.phone).trim();
    }
  } catch (e) {}
  return "";
}

export function getActiveStoreId() {
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
  } catch (e) {}
  return "";
}

export function getUserStorageKey(phone, explicitStoreId) {
  var sId = (explicitStoreId || getActiveStoreId() || "").trim();
  if (sId) {
    return "shop-control-data-store-" + sId;
  }
  var p = (phone || getActiveUserPhone() || "").trim().replace(/\s+/g, "");
  if (!p) return STORAGE_KEY;
  var intl = toInternationalPhone(p);
  var safeIntl = intl ? intl.replace("+", "plus_") : "";
  return "shop-control-data-user-" + (safeIntl || p);
}

export function loadData(explicitPhone, explicitStoreId) {
  var activePhone = (explicitPhone || getActiveUserPhone() || "").trim().replace(/\s+/g, "");
  var activeStoreId = (explicitStoreId || getActiveStoreId() || "").trim();
  var isSpecificUser = !!(activeStoreId || (activePhone && activePhone !== "0911000000"));

  var storeKey = activeStoreId ? ("shop-control-data-store-" + activeStoreId) : "";
  var userKey = getUserStorageKey(activePhone, activeStoreId);

  try {
    var v = storeKey ? localStorage.getItem(storeKey) : null;
    if (!v) {
      v = localStorage.getItem(userKey);
    }
    if (!v && activePhone) {
      v = localStorage.getItem("shop-control-data-user-" + activePhone) ||
          localStorage.getItem("shop-control-data-user-" + normalizePhone(activePhone));
    }
    if (!v && !isSpecificUser) {
      v = localStorage.getItem(STORAGE_KEY);
    }
    if (v) {
      var d = JSON.parse(v);
      if (d && typeof d === "object") {
        if (!d.store_id) d.store_id = activeStoreId || d.storeId || d.shopId || (activePhone ? ("store_" + activePhone.replace(/\D/g, "")) : "store_default");
        if (!d.storeId) d.storeId = d.store_id;
        if (!d.shopId) d.shopId = d.store_id;

        if (d.ownerPhoneNumber === "0911000000") d.ownerPhoneNumber = activePhone || "";
        if (d.profile && d.profile.phone === "0911000000") d.profile.phone = activePhone || "";
        if (activePhone) {
          if (!d.ownerPhoneNumber) d.ownerPhoneNumber = activePhone;
          if (d.profile && !d.profile.phone) d.profile.phone = activePhone;
        }
        if (typeof d.ownerPhoneNumber !== "string") d.ownerPhoneNumber = (d.profile && d.profile.phone) || activePhone || "";
        if (typeof d.ownerPin !== "string") d.ownerPin = "";
        if (!Array.isArray(d.purchases)) d.purchases = [];
        if (!Array.isArray(d.allocations)) d.allocations = freshAllocations();
        if (!d.dailyAllocations || typeof d.dailyAllocations !== "object") d.dailyAllocations = {};
        if (!Array.isArray(d.expenseCategories) || d.expenseCategories.length === 0) d.expenseCategories = DEFAULT_EXPENSE_CATEGORIES.slice();

        var isSpecificUserStore = isSpecificUser || !!(d.ownerPhoneNumber || d.store_id || d.storeId || d.shopId);
        if (!Array.isArray(d.customers)) d.customers = isSpecificUserStore ? [] : freshCustomers();
        if (!Array.isArray(d.suppliers)) d.suppliers = isSpecificUserStore ? [] : freshSuppliers();
        if (!Array.isArray(d.items)) d.items = isSpecificUserStore ? [] : freshItemsSample();
        if (!Array.isArray(d.sales)) d.sales = isSpecificUserStore ? [] : freshSalesSample();
        if (!Array.isArray(d.expenses)) d.expenses = [];
        if (typeof d.baseCapitalCents !== "number") d.baseCapitalCents = isSpecificUserStore ? 0 : 5000000;
        if (!Array.isArray(d.capitalInjections)) d.capitalInjections = [];
        if (typeof d.capitalGoalMonthlyCents !== "number" || d.capitalGoalMonthlyCents <= 0) d.capitalGoalMonthlyCents = GOAL_MONTHLY_CENTS_DEFAULT;
        if (!Array.isArray(d.shipments)) d.shipments = isSpecificUserStore ? [] : freshShipmentsSample();
        if (!Array.isArray(d.accountsPayable)) d.accountsPayable = [];
        if (!Array.isArray(d.employees)) d.employees = isSpecificUserStore ? [] : freshEmployees();
        if (!Array.isArray(d.locations) || d.locations.length === 0) d.locations = freshLocations();

        // Strictly filter to store_id if activeStoreId is provided
        if (activeStoreId) {
          d.sales = (d.sales || []).filter(function (s) { return !s.store_id || s.store_id === activeStoreId; });
          d.items = (d.items || []).filter(function (i) { return !i.store_id || i.store_id === activeStoreId; });
          d.expenses = (d.expenses || []).filter(function (e) { return !e.store_id || e.store_id === activeStoreId; });
        }

        if (!d.profile || typeof d.profile !== "object") d.profile = freshProfile();
        else { var fp = freshProfile(); for (var pk in fp) if (!(pk in d.profile)) d.profile[pk] = fp[pk]; }
        if (!d.loanCenter || typeof d.loanCenter !== "object") d.loanCenter = freshLoanCenter();
        else {
          var fl = freshLoanCenter();
          if (typeof d.loanCenter.requestedAmountCents !== "number") d.loanCenter.requestedAmountCents = 0;
          if (!Array.isArray(d.loanCenter.usageAllocations) || d.loanCenter.usageAllocations.length === 0) d.loanCenter.usageAllocations = fl.usageAllocations;
          if (!Array.isArray(d.loanCenter.proformaInvoices)) d.loanCenter.proformaInvoices = [];
          if (!Array.isArray(d.loanCenter.cashFlowProjection)) d.loanCenter.cashFlowProjection = [];
          if (!Array.isArray(d.loanCenter.suppliers)) d.loanCenter.suppliers = [];
          if (!Array.isArray(d.loanCenter.customers)) d.loanCenter.customers = [];
          if (typeof d.loanCenter.bankName !== "string" || !d.loanCenter.bankName) d.loanCenter.bankName = "የኢትዮጵያ ንግድ ባንክ";
          if (typeof d.loanCenter.marketAnalysis !== "string") d.loanCenter.marketAnalysis = "";
        }
        return ensureDataSyncFlags(d);
      }
    }
  } catch (e) {}

  // If this is a specific user account / registered store, DO NOT fallback to global demo samples!
  // Initialize cleanly with isolated empty state (0.00 Birr)
  if (isSpecificUser) {
    return ensureDataSyncFlags(freshEmptyData(activeStoreId, activePhone));
  }

  // Legacy local migration chain for old unauthenticated local applet sessions ONLY
  var chain = [OLD_V4_KEY, OLD_V3_KEY];
  for (var i = 0; i < chain.length; i++) {
    try {
      var raw = localStorage.getItem(chain[i]);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && Array.isArray(o.items)) {
          return ensureDataSyncFlags({
            baseCapitalCents: Number(o.baseCapitalCents || o.openingCapitalCents) || 0,
            items: o.items || [], sales: o.sales || [], expenses: o.expenses || [],
            allocations: (Array.isArray(o.allocations) && o.allocations.length) ? o.allocations : freshAllocations(),
            profile: freshProfile(), loanCenter: freshLoanCenter(), capitalGoalMonthlyCents: GOAL_MONTHLY_CENTS_DEFAULT
          });
        }
      }
    } catch (e) {}
  }

  return ensureDataSyncFlags(freshData());
}

export var storageAvailable = true;
export var storageErrorDetail = "";
export function saveLocal(d, explicitPhone, explicitStoreId) {
  var activePhone = (explicitPhone || (d && d.ownerPhoneNumber) || (d && d.profile && d.profile.phone) || getActiveUserPhone() || "").trim().replace(/\s+/g, "");
  if (activePhone === "0911000000") activePhone = "";
  var activeStoreId = (explicitStoreId || (d && (d.store_id || d.storeId || d.shopId)) || getActiveStoreId() || "").trim();

  try {
    var json = JSON.stringify(d);
    if (activeStoreId) {
      localStorage.setItem("shop-control-data-store-" + activeStoreId, json);
    }
    if (activePhone) {
      var userKey = getUserStorageKey(activePhone, activeStoreId);
      localStorage.setItem(userKey, json);
    }
    // Only save to global generic key if no user phone and no storeId
    if (!activePhone && !activeStoreId) {
      localStorage.setItem(STORAGE_KEY, json);
    }
    storageAvailable = true;
    saveToIndexedDB(activeStoreId || activePhone || STORAGE_KEY, d).catch(function () {});
  }
  catch (e) { storageAvailable = false; storageErrorDetail = (e && e.message) ? e.message : String(e); }
}

export function itemStock(data, itemId) {
  var item = data.items.find(function (i) { return i.id === itemId; });
  if (!item) return 0;
  var sold = 0;
  (data.sales || []).forEach(function (s) {
    if (Array.isArray(s.items) && s.items.length > 0) {
      s.items.forEach(function (it) {
        if (it.itemId === itemId) sold += (Number(it.qty) || 0);
      });
    } else if (s.itemId === itemId) {
      sold += (Number(s.qty) || 0);
    }
  });
  return item.openingStock - sold;
}

export function itemSoldOutInfo(data, item) {
  var stock = itemStock(data, item.id);
  if (stock > 0) return { soldOut: false, daysSoFar: daysBetween(item.dateAdded, todayISO()) };
  var salesForItem = [];
  (data.sales || []).forEach(function (s) {
    if (Array.isArray(s.items) && s.items.length > 0) {
      s.items.forEach(function (it) {
        if (it.itemId === item.id) {
          salesForItem.push({ qty: Number(it.qty) || 0, date: s.date, createdAt: s.createdAt });
        }
      });
    } else if (s.itemId === item.id) {
      salesForItem.push({ qty: Number(s.qty) || 0, date: s.date, createdAt: s.createdAt });
    }
  });
  salesForItem.sort(function (a, b) { return a.createdAt - b.createdAt; });
  var cum = 0, soldOutDate = null;
  for (var i = 0; i < salesForItem.length; i++) {
    cum += salesForItem[i].qty;
    if (cum >= item.openingStock) { soldOutDate = salesForItem[i].date; break; }
  }
  if (!soldOutDate) return { soldOut: false, daysSoFar: daysBetween(item.dateAdded, todayISO()) };
  return { soldOut: true, soldOutDate: soldOutDate, days: daysBetween(item.dateAdded, soldOutDate) };
}

export function lineProfitCents(sale) {
  if (Array.isArray(sale.items) && sale.items.length > 0) {
    return sale.items.reduce(function (sum, it) {
      var sell = typeof it.unitPriceCents === "number" ? it.unitPriceCents : 0;
      var cost = typeof it.costPriceCents === "number" ? it.costPriceCents : (typeof it.unitCostCents === "number" ? it.unitCostCents : 0);
      return sum + ((sell - cost) * (Number(it.qty) || 0));
    }, 0);
  }
  return ((sale.unitPriceCents || 0) - (sale.unitCostCents || 0)) * (Number(sale.qty) || 0);
}

export function inventoryValueCents(data) {
  if (!data || !Array.isArray(data.items)) return 0;
  return data.items.reduce(function (s, it) {
    var stock = Math.max(0, itemStock(data, it.id));
    var sellPrice = (typeof it.sellPriceCents === "number" && it.sellPriceCents > 0)
      ? it.sellPriceCents
      : (it.costPriceCents || 0);
    return s + (stock * sellPrice);
  }, 0);
}

export function inventoryCostCapitalCents(data) {
  if (!data || !Array.isArray(data.items)) return 0;
  return data.items.reduce(function (s, it) {
    var stock = Math.max(0, itemStock(data, it.id));
    var costPrice = typeof it.costPriceCents === "number" ? it.costPriceCents : 0;
    return s + (stock * costPrice);
  }, 0);
}

export function inventoryExpectedProfitCents(data) {
  if (!data || !Array.isArray(data.items)) return 0;
  return data.items.reduce(function (s, it) {
    var stock = Math.max(0, itemStock(data, it.id));
    var costPrice = typeof it.costPriceCents === "number" ? it.costPriceCents : 0;
    var sellPrice = (typeof it.sellPriceCents === "number" && it.sellPriceCents > 0)
      ? it.sellPriceCents
      : costPrice;
    return s + (stock * Math.max(0, sellPrice - costPrice));
  }, 0);
}

/**
 * Merge or add inventory stock with Market Price replacement logic:
 * 1. Matches existing item by code or name (case-insensitive)
 * 2. Merges total quantity: New Total Stock = Existing Stock + Incoming Stock
 * 3. Replaces old cost details and selling price with new incoming values
 */
export function mergeOrAddItem(data, incoming) {
  if (!data.items) data.items = [];
  var incomingCode = (incoming.code || "").trim().toLowerCase();
  var incomingName = (incoming.name || "").trim().toLowerCase();

  var matched = null;
  if (incomingCode) {
    matched = data.items.find(function (i) {
      return i.code && i.code.trim().toLowerCase() === incomingCode;
    });
  }
  if (!matched && incomingName) {
    matched = data.items.find(function (i) {
      return i.name && i.name.trim().toLowerCase() === incomingName;
    });
  }

  var incomingQty = Number(incoming.qty) || 0;
  var landedCostCents = typeof incoming.landedCostCents === "number" ? incoming.landedCostCents : 0;
  var sellPriceCents = typeof incoming.sellPriceCents === "number" ? incoming.sellPriceCents : 0;

  if (matched) {
    // 1. Merge total quantity: New Total Stock = Existing Stock + Incoming Stock
    matched.openingStock = (matched.openingStock || 0) + incomingQty;

    // 2. Market Price Update: Replace old cost details entirely with updated unit price
    if (landedCostCents > 0) {
      matched.costPriceCents = landedCostCents;
    }
    if (sellPriceCents > 0) {
      matched.sellPriceCents = sellPriceCents;
    }
    if (incoming.code) matched.code = incoming.code.trim();
    if (incoming.expiry) matched.expiry = incoming.expiry;
    if (incoming.dateAdded) matched.dateAdded = incoming.dateAdded;
    if (incoming.locationId) {
      matched.locationId = incoming.locationId;
      matched.locationType = incoming.locationType;
      matched.locationName = incoming.locationName;
      matched.location = incoming.locationName;
    }
    return matched;
  } else {
    var newItem = {
      id: incoming.id || uid(),
      name: (incoming.name || "").trim(),
      code: incoming.code ? incoming.code.trim() : "",
      locationId: incoming.locationId || "",
      locationType: incoming.locationType || "shop",
      locationName: incoming.locationName || "",
      location: incoming.locationName || "",
      costPriceCents: landedCostCents,
      sellPriceCents: sellPriceCents,
      openingStock: incomingQty,
      dateAdded: incoming.dateAdded || todayISO(),
      expiry: incoming.expiry || "",
      createdAt: Date.now()
    };
    data.items.unshift(newItem);
    return newItem;
  }
}

/**
 * Calculates the three distinct sub-balances of capital available for inventory purchases:
 * 1. returned_capital: Cost of goods sold recovered from sales
 * 2. profit_capital: 70% (or allocated percent) portion of net profit
 * 3. external_capital: Manually injected/added outside capital
 *
 * Deducts all completed shipments/purchases sequentially:
 * returned_capital -> profit_capital -> external_capital
 */
export function getCapitalPool(data) {
  if (!data) data = {};

  var sales = Array.isArray(data.sales) ? data.sales : [];
  var expenses = Array.isArray(data.expenses) ? data.expenses : [];
  var injections = Array.isArray(data.capitalInjections) ? data.capitalInjections : [];
  var shipments = Array.isArray(data.shipments) ? data.shipments : [];

  // 1. Gross Returned Capital (COGS recovered from sales)
  var grossReturnedCapital = sales.reduce(function (sum, s) {
    if (Array.isArray(s.items) && s.items.length > 0) {
      return sum + s.items.reduce(function (iSum, it) {
        var uCost = typeof it.costPriceCents === "number" ? it.costPriceCents : (typeof it.unitCostCents === "number" ? it.unitCostCents : 0);
        return iSum + (uCost * (Number(it.qty) || 0));
      }, 0);
    }
    var unitCost = typeof s.unitCostCents === "number" ? s.unitCostCents : 0;
    var qty = Number(s.qty) || 0;
    return sum + (unitCost * qty);
  }, 0);

  // 2. Gross Profit Capital (70% allocated profit portion)
  var grossProfit = sales.reduce(function (sum, s) {
    return sum + lineProfitCents(s);
  }, 0);
  var opExpenses = expenses.filter(function (e) {
    return !(e.category === "የዕቃ ግዢ" || e.category === "ዕቃ መግዣ" || e.isPurchase === true);
  }).reduce(function (sum, e) {
    return sum + (Number(e.amountCents) || 0);
  }, 0);
  var netProfit = Math.max(0, grossProfit - opExpenses);
  var capitalPct = capitalAllocationPercent(data);
  var grossProfitCapital = Math.round(netProfit * (capitalPct / 100));

  // 3. Gross External Capital (Manually injected/added outside capital)
  var totalInjections = injections.reduce(function (sum, inj) {
    return sum + (Number(inj.amountCents) || 0);
  }, 0);
  var grossExternalCapital = (Number(data.baseCapitalCents) || 0) + totalInjections;

  // Running balances
  var curReturned = grossReturnedCapital;
  var curProfit = grossProfitCapital;
  var curExternal = grossExternalCapital;

  var totalDeductedReturned = 0;
  var totalDeductedProfit = 0;
  var totalDeductedExternal = 0;

  // Sort shipments chronologically to apply sequential deductions
  var sortedShipments = shipments.slice().sort(function (a, b) {
    return (a.createdAt || 0) - (b.createdAt || 0);
  });

  sortedShipments.forEach(function (sh) {
    var cost = Number(sh.totalCostCents) || 0;
    if (cost <= 0) return;

    if (sh.capitalDeduction && (typeof sh.capitalDeduction.fromReturnedCents === "number" || typeof sh.capitalDeduction.fromProfitCents === "number" || typeof sh.capitalDeduction.fromExternalCents === "number")) {
      var dRet = Number(sh.capitalDeduction.fromReturnedCents) || 0;
      var dProf = Number(sh.capitalDeduction.fromProfitCents) || 0;
      var dExt = Number(sh.capitalDeduction.fromExternalCents) || 0;

      curReturned = Math.max(0, curReturned - dRet);
      curProfit = Math.max(0, curProfit - dProf);
      curExternal = curExternal - dExt;

      totalDeductedReturned += dRet;
      totalDeductedProfit += dProf;
      totalDeductedExternal += dExt;
    } else if (sh.capitalSource === "returned_capital") {
      curReturned = Math.max(0, curReturned - cost);
      totalDeductedReturned += cost;
    } else if (sh.capitalSource === "profit_capital") {
      curProfit = Math.max(0, curProfit - cost);
      totalDeductedProfit += cost;
    } else if (sh.capitalSource === "external_capital") {
      curExternal = curExternal - cost;
      totalDeductedExternal += cost;
    } else {
      // Legacy sequential deduction fallback
      var fromRet = Math.min(curReturned, cost);
      var rem1 = cost - fromRet;
      var fromProf = Math.min(curProfit, rem1);
      var rem2 = rem1 - fromProf;
      var fromExt = rem2;

      curReturned = Math.max(0, curReturned - fromRet);
      curProfit = Math.max(0, curProfit - fromProf);
      curExternal = curExternal - fromExt;

      totalDeductedReturned += fromRet;
      totalDeductedProfit += fromProf;
      totalDeductedExternal += fromExt;
    }
  });

  var totalAvailable = curReturned + curProfit + Math.max(0, curExternal);

  return {
    returned_capital: curReturned,
    profit_capital: curProfit,
    external_capital: curExternal,
    total_available: totalAvailable,

    gross_returned: grossReturnedCapital,
    gross_profit_cap: grossProfitCapital,
    gross_external: grossExternalCapital,
    total_injections: totalInjections,

    deducted_returned: totalDeductedReturned,
    deducted_profit: totalDeductedProfit,
    deducted_external: totalDeductedExternal,
    capital_percent: capitalPct
  };
}

/**
 * Deducts purchase cost directly from a single chosen capital pool:
 * source: 'returned_capital' | 'profit_capital' | 'external_capital'
 */
export function calculateDirectDeduction(pool, purchaseCostCents, source) {
  var cost = Math.max(0, Number(purchaseCostCents) || 0);
  var retAvail = Math.max(0, (pool && pool.returned_capital) || 0);
  var profAvail = Math.max(0, (pool && pool.profit_capital) || 0);
  var extAvail = (pool && typeof pool.external_capital === "number") ? pool.external_capital : 0;

  var selectedSource = source || "returned_capital";
  var available = 0;
  var fromReturned = 0;
  var fromProfit = 0;
  var fromExternal = 0;

  if (selectedSource === "returned_capital") {
    available = retAvail;
    fromReturned = cost;
  } else if (selectedSource === "profit_capital") {
    available = profAvail;
    fromProfit = cost;
  } else {
    selectedSource = "external_capital";
    available = extAvail;
    fromExternal = cost;
  }

  var remReturned = Math.max(0, retAvail - fromReturned);
  var remProfit = Math.max(0, profAvail - fromProfit);
  var remExternal = extAvail - fromExternal;

  return {
    source: selectedSource,
    costCents: cost,
    availableCents: available,
    sufficient: available >= cost,
    fromReturnedCents: fromReturned,
    fromProfitCents: fromProfit,
    fromExternalCents: fromExternal,
    remainingReturnedCents: remReturned,
    remainingProfitCents: remProfit,
    remainingExternalCents: remExternal,
    totalRemainingCents: remReturned + remProfit + Math.max(0, remExternal)
  };
}

/**
 * Sequentially deducts a purchase cost from the 3 capital pools:
 * 1. returned_capital -> 2. profit_capital -> 3. external_capital
 */
export function calculateSequentialDeduction(pool, purchaseCostCents) {
  var cost = Math.max(0, Number(purchaseCostCents) || 0);
  var retAvail = Math.max(0, (pool && pool.returned_capital) || 0);
  var profAvail = Math.max(0, (pool && pool.profit_capital) || 0);
  var extAvail = (pool && typeof pool.external_capital === "number") ? pool.external_capital : 0;

  var fromReturned = Math.min(retAvail, cost);
  var rem1 = cost - fromReturned;

  var fromProfit = Math.min(profAvail, rem1);
  var rem2 = rem1 - fromProfit;

  var fromExternal = rem2;

  var remReturned = Math.max(0, retAvail - fromReturned);
  var remProfit = Math.max(0, profAvail - fromProfit);
  var remExternal = extAvail - fromExternal;

  return {
    costCents: cost,
    fromReturnedCents: fromReturned,
    fromProfitCents: fromProfit,
    fromExternalCents: fromExternal,
    remainingReturnedCents: remReturned,
    remainingProfitCents: remProfit,
    remainingExternalCents: remExternal,
    totalRemainingCents: remReturned + remProfit + Math.max(0, remExternal)
  };
}

/**
 * Record injected capital from outside source
 */
export function recordCapitalInjection(data, amountCents, date, source, paymentMethod, bankName, note) {
  if (!data) return data;
  if (!Array.isArray(data.capitalInjections)) data.capitalInjections = [];
  var amt = Math.max(0, Number(amountCents) || 0);
  var record = {
    id: "inj_" + Math.random().toString(36).slice(2, 9),
    amountCents: amt,
    date: date || todayISO(),
    source: source || "ውጫዊ ካፒታል (External)",
    paymentMethod: paymentMethod || "cash",
    bankName: bankName || "",
    note: note || "",
    createdAt: Date.now()
  };
  data.capitalInjections.unshift(record);
  return record;
}

export function totalCapitalCents(data) {
  var pool = getCapitalPool(data);
  return pool.total_available + inventoryValueCents(data);
}

export function itemStockAsOf(data, itemId, cutoffISO) {
  var item = data.items.find(function (i) { return i.id === itemId; });
  if (!item) return 0;
  var sold = 0;
  (data.sales || []).forEach(function (s) {
    if (s.date <= cutoffISO) {
      if (Array.isArray(s.items) && s.items.length > 0) {
        s.items.forEach(function (it) {
          if (it.itemId === itemId) sold += (Number(it.qty) || 0);
        });
      } else if (s.itemId === itemId) {
        sold += (Number(s.qty) || 0);
      }
    }
  });
  return item.openingStock - sold;
}

export function inventoryValueAsOf(data, cutoffISO) {
  return data.items.filter(function (it) { return it.dateAdded <= cutoffISO; })
    .reduce(function (s, it) { return s + Math.max(0, itemStockAsOf(data, it.id, cutoffISO)) * it.costPriceCents; }, 0);
}

export function capitalAsOf(data, cutoffISO) { return data.baseCapitalCents + inventoryValueAsOf(data, cutoffISO); }

export function statsFor(sales, expenses) {
  var revenue = sales.reduce(function (s, x) { return s + x.totalCents; }, 0);
  var expenseTotal = expenses.reduce(function (s, x) { return s + x.amountCents; }, 0);
  var profit = sales.reduce(function (s, x) { return s + lineProfitCents(x); }, 0) - expenseTotal;
  var counts = {};
  sales.forEach(function (s) {
    if (Array.isArray(s.items) && s.items.length > 0) {
      s.items.forEach(function (it) {
        var n = it.name || it.itemName;
        if (n) counts[n] = (counts[n] || 0) + (Number(it.qty) || 0);
      });
    } else if (s.itemName) {
      counts[s.itemName] = (counts[s.itemName] || 0) + (Number(s.qty) || 0);
    }
  });
  var topName = null, topQty = 0;
  Object.keys(counts).forEach(function (n) { if (counts[n] > topQty) { topQty = counts[n]; topName = n; } });
  return { revenue: revenue, expenseTotal: expenseTotal, profit: profit, topName: topName, topQty: topQty };
}

export function paymentBreakdown(sales) {
  var cash = 0, bank = 0, credit = 0, creditOutstanding = 0, creditCollected = 0;
  sales.forEach(function (s) {
    var m = s.paymentMethod || "cash";
    if (m === "bank") bank += s.totalCents;
    else if (m === "credit") {
      credit += s.totalCents;
      var adv = s.advanceCents || 0;
      var rem = s.paid ? 0 : (s.creditRemainingCents !== undefined ? s.creditRemainingCents : Math.max(0, s.totalCents - adv));
      creditOutstanding += rem;
      creditCollected += (s.totalCents - rem);
    }
    else cash += s.totalCents;
  });
  return { cash: cash, bank: bank, credit: credit, creditOutstanding: creditOutstanding, creditCollected: creditCollected };
}

export function expenseByCategory(expenses) {
  var map = {};
  expenses.forEach(function (e) { var c = e.category || "ሌላ"; map[c] = (map[c] || 0) + e.amountCents; });
  return map;
}

export function transactionCount(sales) { return sales.length; }

export function verifyPaymentReconciliation(sales) {
  var pay = paymentBreakdown(sales);
  var total = sales.reduce(function (s, x) { return s + x.totalCents; }, 0);
  var sumOfMethods = pay.cash + pay.bank + pay.credit;
  return { ok: sumOfMethods === total, total: total, sumOfMethods: sumOfMethods, pay: pay };
}

export function periodStats(data, period) {
  var range = periodRange(period);
  var sales = data.sales.filter(function (s) { return inPeriod(s.date, range); });
  var expenses = data.expenses.filter(function (e) { return inPeriod(e.date, range); });
  var st = statsFor(sales, expenses);
  st.salesInPeriod = sales; st.expensesInPeriod = expenses;
  return st;
}

export function dayStats(data, iso) {
  return statsFor(data.sales.filter(function (s) { return s.date === iso; }), data.expenses.filter(function (e) { return e.date === iso; }));
}

export function ethiopianBuckets(data) {
  var map = {};
  function bucketFor(iso) {
    var e = gregorianToEthiopian(new Date(iso + "T00:00:00"));
    var key = e.year + "-" + e.month;
    if (!map[key]) map[key] = { year: e.year, month: e.month, sales: [], expenses: [] };
    return map[key];
  }
  data.sales.forEach(function (s) { bucketFor(s.date).sales.push(s); });
  data.expenses.forEach(function (e) { bucketFor(e.date).expenses.push(e); });
  return map;
}

export function daysInEthMonth(ethYear, ethMonth) {
  if (ethMonth <= 12) return 30;
  return isGregLeap(ethYear + 8) ? 6 : 5;
}

export function capitalAllocationPercent(data) {
  var row = (data.allocations || []).find(function (a) { return a.name && (a.name.indexOf("ካፒታል") !== -1 || a.name.indexOf("ስራ") !== -1); });
  if (row) return Number(row.percent) || 0;
  if (Array.isArray(data.allocations) && data.allocations.length > 0) {
    return Number(data.allocations[0].percent) || 0;
  }
  return 0;
}

export function goalTrackerStats(data) {
  var todayEth = gregorianToEthiopian(new Date());
  var buckets = ethiopianBuckets(data);
  var key = todayEth.year + "-" + todayEth.month;
  var bucket = buckets[key];
  var monthStats = bucket ? statsFor(bucket.sales, bucket.expenses) : { revenue: 0, expenseTotal: 0, profit: 0 };
  var capitalPct = capitalAllocationPercent(data);
  var actualCapitalAllocatedCents = monthStats.profit > 0 ? Math.round(monthStats.profit * (capitalPct / 100)) : 0;
  var monthlyGoalCents = (data.capitalGoalMonthlyCents && data.capitalGoalMonthlyCents > 0) ? data.capitalGoalMonthlyCents : GOAL_MONTHLY_CENTS_DEFAULT;
  var totalDaysInMonth = daysInEthMonth(todayEth.year, todayEth.month);
  var daysElapsed = Math.min(todayEth.day, totalDaysInMonth);
  var paceToDateCents = Math.round(monthlyGoalCents * (daysElapsed / totalDaysInMonth));
  var shortfallCents = paceToDateCents - actualCapitalAllocatedCents;
  var pctOfMonthlyGoal = monthlyGoalCents > 0 ? Math.min(100, Math.max(0, Math.round((actualCapitalAllocatedCents / monthlyGoalCents) * 100))) : 0;
  return {
    ethYear: todayEth.year, ethMonth: todayEth.month, daysElapsed: daysElapsed, totalDaysInMonth: totalDaysInMonth,
    capitalPct: capitalPct, monthProfitCents: monthStats.profit,
    monthlyGoalCents: monthlyGoalCents, paceToDateCents: paceToDateCents,
    actualCents: actualCapitalAllocatedCents, shortfallCents: shortfallCents,
    onTrack: shortfallCents <= 0, pctOfMonthlyGoal: pctOfMonthlyGoal
  };
}

export function capitalUtilizationStats(data, period) {
  var todayEth = gregorianToEthiopian(new Date());
  var buckets = ethiopianBuckets(data);
  var capitalPct = capitalAllocationPercent(data);
  var profitCents, startISO, label;

  if (period === "year") {
    var yearSales = [], yearExpenses = [];
    for (var m = 1; m <= 13; m++) {
      var b = buckets[todayEth.year + "-" + m];
      if (b) { yearSales = yearSales.concat(b.sales); yearExpenses = yearExpenses.concat(b.expenses); }
    }
    profitCents = statsFor(yearSales, yearExpenses).profit;
    startISO = ethiopianYearStartGregorianISO(todayEth.year);
    label = todayEth.year + " ዓ.ም (አመታዊ)";
  } else {
    var bucket = buckets[todayEth.year + "-" + todayEth.month];
    profitCents = bucket ? statsFor(bucket.sales, bucket.expenses).profit : 0;
    startISO = ethMonthStartGregorianISO(todayEth.year, todayEth.month);
    label = ethLabel(todayEth.year, todayEth.month) + " (ወርሃዊ)";
  }

  // የተመደበ ትርፍ (Allocated Profit)
  var allocatedCents = profitCents > 0 ? Math.round(profitCents * (capitalPct / 100)) : 0;

  // Differentiate payment sources for stock purchases during the period:
  var internalPurchasesCents = 0;
  var externalPurchasesCents = 0;
  var returnedCogsPurchasesCents = 0;
  var purchaseCount = 0;

  // 1. የዕቃ ጭነት ደረሰኞች (Shipment Receipts)
  if (Array.isArray(data.shipments)) {
    data.shipments.forEach(function (s) {
      var sDate = s.date || s.shipmentDate || (s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : "");
      if (sDate >= startISO) {
        purchaseCount++;
        var cost = Number(s.totalCostCents) || 0;
        var paid = Number(s.totalPaidCents) || cost;

        var fromExt = 0;
        var fromRet = 0;
        var fromProf = 0;

        if (s.capitalDeduction && (typeof s.capitalDeduction.fromReturnedCents === "number" || typeof s.capitalDeduction.fromProfitCents === "number" || typeof s.capitalDeduction.fromExternalCents === "number")) {
          fromRet = Number(s.capitalDeduction.fromReturnedCents) || 0;
          fromProf = Number(s.capitalDeduction.fromProfitCents) || 0;
          fromExt = Number(s.capitalDeduction.fromExternalCents) || 0;
        } else if (s.vaultDeductions && typeof s.vaultDeductions === "object") {
          Object.keys(s.vaultDeductions).forEach(function (k) {
            var val = Number(s.vaultDeductions[k]) || 0;
            if (k === "external_capital") fromExt += val;
            else if (k === "cogs_returned") fromRet += val;
            else fromProf += val;
          });
        } else if (s.capitalSource === "external_capital") {
          fromExt = paid;
        } else if (s.capitalSource === "returned_capital") {
          fromRet = paid;
        } else if (s.capitalSource === "profit_capital") {
          fromProf = paid;
        } else {
          fromProf = paid;
        }

        internalPurchasesCents += fromProf;
        externalPurchasesCents += fromExt;
        returnedCogsPurchasesCents += fromRet;
      }
    });
  }

  // 2. ቀጥታ የዕቃ ግዢ ደረሰኞች (Direct Inventory Purchase Receipts)
  if (Array.isArray(data.purchases)) {
    data.purchases.forEach(function (p) {
      var pDate = p.date || (p.createdAt ? new Date(p.createdAt).toISOString().slice(0, 10) : "");
      if (pDate >= startISO) {
        purchaseCount++;
        var amt = Number(p.amountCents) || 0;
        if (p.paymentSource === "external_capital" || p.vaultId === "external_capital" || p.isExternal === true) {
          externalPurchasesCents += amt;
        } else if (p.paymentSource === "returned_capital" || p.vaultId === "cogs_returned") {
          returnedCogsPurchasesCents += amt;
        } else {
          internalPurchasesCents += amt;
        }
      }
    });
  }

  // 3. በወጪ የተመዘገቡ የዕቃ ግዢዎች (Purchase Expenses)
  if (Array.isArray(data.expenses)) {
    data.expenses.forEach(function (e) {
      var isPurch = (e.category === "የዕቃ ግዢ" || e.category === "ዕቃ መግዣ" || e.isPurchase === true);
      if (isPurch && e.date >= startISO) {
        purchaseCount++;
        var amt = Number(e.amountCents) || 0;
        if (e.paymentSource === "external_capital" || e.vaultId === "external_capital" || e.isExternal === true) {
          externalPurchasesCents += amt;
        } else if (e.paymentSource === "returned_capital" || e.vaultId === "cogs_returned") {
          returnedCogsPurchasesCents += amt;
        } else {
          internalPurchasesCents += amt;
        }
      }
    });
  }

  // Requirement 2: "ለስራ/ለዕቃ መግዣ የዋለ" MUST ONLY include amounts paid directly from internal allocated vaults.
  var usedCents = internalPurchasesCents;

  // Requirement 3: Unused Capital = (Total Internal Vault Allocations) - (Total Spent from Internal Vaults Only).
  var idleCents = Math.max(0, allocatedCents - usedCents);

  // Overage warning ONLY if internal vault spending exceeds internal allocated profit
  var overageCents = Math.max(0, usedCents - allocatedCents);

  var usedPct = allocatedCents > 0 ? Math.min(100, Math.round((usedCents / allocatedCents) * 100)) : 0;

  return {
    label: label,
    capitalPct: capitalPct,
    allocatedCents: allocatedCents,
    utilizedCents: usedCents,
    usedCents: usedCents,
    externalUsedCents: externalPurchasesCents,
    returnedCogsUsedCents: returnedCogsPurchasesCents,
    idleCents: idleCents,
    overageCents: overageCents,
    usedPct: usedPct,
    purchaseCount: purchaseCount
  };
}

export function freshPrefs() {
  return { darkMode: false, fontZoom: 1, accent: ACCENT_PRESETS[0], appLockEnabled: false, pinHash: "", lockOnResume: true, popupBlocker: false, jsEnabledPref: true };
}

export function loadPrefs() {
  try {
    var v = localStorage.getItem(PREFS_KEY);
    if (v) { var p = JSON.parse(v); var fp = freshPrefs(); for (var k in fp) if (!(k in p)) p[k] = fp[k]; return p; }
  } catch (e) {}
  return freshPrefs();
}

export function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} }

export function applyPrefs(p) {
  document.body.classList.toggle("dark", !!p.darkMode);
  document.documentElement.style.setProperty("--accent", p.accent || ACCENT_PRESETS[0]);
  var appEl = document.querySelector(".app");
  if (appEl) appEl.style.zoom = String(p.fontZoom || 1);
}

export function simpleHash(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) { h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; }
  return "h" + h;
}

export function getRegistrationHistoryInfo(data) {
  var dates = [];
  var activeYearsMap = {};

  function addDate(val) {
    if (!val) return;
    var dStr = "";
    if (typeof val === "string") {
      dStr = val.slice(0, 10);
    } else if (typeof val === "number") {
      try {
        dStr = new Date(val).toISOString().slice(0, 10);
      } catch (e) {}
    }
    if (dStr && /^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
      dates.push(dStr);
      try {
        var eth = gregorianToEthiopian(new Date(dStr + "T00:00:00"));
        if (eth && eth.year) {
          activeYearsMap[eth.year] = true;
        }
      } catch (e) {}
    }
  }

  var salesCount = 0;
  if (data && Array.isArray(data.sales)) {
    salesCount = data.sales.length;
    data.sales.forEach(function (s) {
      addDate(s.date);
      addDate(s.createdAt);
    });
  }

  var expensesCount = 0;
  if (data && Array.isArray(data.expenses)) {
    expensesCount = data.expenses.length;
    data.expenses.forEach(function (e) {
      addDate(e.date);
      addDate(e.createdAt);
    });
  }

  if (data && Array.isArray(data.purchases)) {
    data.purchases.forEach(function (p) {
      addDate(p.date);
      addDate(p.createdAt);
    });
  }

  if (data && Array.isArray(data.shipments)) {
    data.shipments.forEach(function (s) {
      addDate(s.date);
      addDate(s.shipmentDate);
      addDate(s.createdAt);
    });
  }

  if (data && Array.isArray(data.items)) {
    data.items.forEach(function (it) {
      addDate(it.dateAdded);
      addDate(it.createdAt);
    });
  }

  if (data && Array.isArray(data.capitalInjections)) {
    data.capitalInjections.forEach(function (c) {
      addDate(c.date);
      addDate(c.createdAt);
    });
  }

  if (data && data.profile && data.profile.createdAt) {
    addDate(data.profile.createdAt);
  }

  var today = todayISO();
  dates.sort();
  var firstDateISO = dates.length > 0 ? dates[0] : today;
  if (firstDateISO > today) firstDateISO = today;

  var firstEth = gregorianToEthiopian(new Date(firstDateISO + "T00:00:00"));
  var todayEth = gregorianToEthiopian(new Date());

  var firstDateEthStr = ETH_MONTHS[firstEth.month - 1] + " " + firstEth.day + " ቀን " + firstEth.year + " ዓ.ም";
  var todayDateEthStr = ETH_MONTHS[todayEth.month - 1] + " " + todayEth.day + " ቀን " + todayEth.year + " ዓ.ም";

  var diffMs = Math.max(0, new Date().getTime() - new Date(firstDateISO + "T00:00:00").getTime());
  var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  var durationText = "";
  if (diffDays <= 1) {
    durationText = "1 ቀን";
  } else if (diffDays < 30) {
    durationText = diffDays + " ቀናት";
  } else {
    var months = Math.floor(diffDays / 30);
    var remainingDays = diffDays % 30;
    if (months < 12) {
      durationText = months + " ወር" + (remainingDays > 0 ? " ከ " + remainingDays + " ቀን" : "");
    } else {
      var yCount = Math.floor(months / 12);
      var remMonths = months % 12;
      durationText = yCount + " ዓመት" + (remMonths > 0 ? " ከ " + remMonths + " ወር" : "");
    }
  }

  var activeYears = Object.keys(activeYearsMap).map(Number).sort(function (a, b) { return a - b; });
  if (activeYears.length === 0) {
    activeYears = [todayEth.year];
  }

  // Exact phrase: ሪፖርቱ የተሸፈነው ጊዜ፦ ከ [የመጀመሪያ ቀን] እስከ ዛሬ
  var coverageText = "ሪፖርቱ የተሸፈነው ጊዜ፦ ከ " + firstDateEthStr + " እስከ ዛሬ (" + todayDateEthStr + ")";

  return {
    firstDateISO: firstDateISO,
    firstEth: firstEth,
    firstDateEthStr: firstDateEthStr,
    todayEth: todayEth,
    todayDateEthStr: todayDateEthStr,
    diffDays: diffDays,
    durationText: durationText,
    coverageText: coverageText,
    activeYears: activeYears,
    totalTransactions: salesCount + expensesCount,
    salesCount: salesCount,
    expensesCount: expensesCount
  };
}
