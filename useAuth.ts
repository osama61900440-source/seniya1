import { useState, useCallback, useEffect } from "react";
import {
  saveUserToFirestore,
  saveShopToFirestore,
  fetchUserFromFirestore,
  isFirestoreConfigured,
  withTimeout
} from "../firebase";

export interface UserProfile {
  phone: string;
  full_name: string;
  fullName?: string;
  name?: string;
  role: string;
  store_id: string;
  storeId?: string;
  isOwner: boolean;
  password?: string;
  created_at?: any;
  createdAt?: number;
  updatedAt?: number;
}

export interface ShopData {
  store_id: string;
  shopId: string;
  name: string;
  owner_phone: string;
  owner_id: string;
  employees: any[];
  inventory: any[];
  sales: any[];
  expenses: any[];
  shipments: any[];
  customers: any[];
  profile: {
    shopName: string;
    ownerName: string;
    phone: string;
  };
  created_at?: any;
  createdAt?: number;
  updatedAt?: number;
}

export interface RegisterParams {
  phone: string;
  password: string;
  full_name: string;
  shop_name?: string;
  role?: string;
}

export interface LoginParams {
  phone: string;
  password: string;
}

export interface AuthResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

const AUTH_STORAGE_KEY = "scs_active_user";
const NETWORK_TIMEOUT_MS = 6000;
const TIMEOUT_ERROR_MESSAGE = "Network timeout. Please check your connection or Firestore configuration.";

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state to local storage when changed
  useEffect(() => {
    if (currentUser) {
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentUser));
      } catch (e) {
        console.error("[useAuth] Failed to cache user in localStorage:", e);
      }
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [currentUser]);

  /**
   * Helper to normalize Ethiopian and international phone numbers
   */
  const normalizePhone = useCallback((rawPhone: string): string => {
    let p = String(rawPhone || "").trim().replace(/[\s\-()]/g, "");
    if (!p) return "";
    if (p.startsWith("09") || p.startsWith("07")) {
      return "+251" + p.slice(1);
    }
    if (p.startsWith("251")) {
      return "+" + p;
    }
    if (!p.startsWith("+") && /^\d+$/.test(p)) {
      return "+251" + (p.startsWith("0") ? p.slice(1) : p);
    }
    return p;
  }, []);

  /**
   * Generates a unique store_id
   */
  const generateStoreId = useCallback((phone: string): string => {
    const cleanDigits = phone.replace(/\D/g, "");
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const timestamp = Date.now().toString(36);
    return `store_${cleanDigits.slice(-6) || "main"}_${timestamp}_${randomSuffix}`;
  }, []);

  /**
   * Register / Signup logic with timeout and try-catch-finally
   */
  const register = useCallback(
    async (params: RegisterParams): Promise<AuthResponse<{ user: UserProfile; store_id: string }>> => {
      setLoading(true);
      setError(null);

      try {
        const phone = normalizePhone(params.phone);
        const password = String(params.password || "").trim();
        const fullName = String(params.full_name || "").trim();
        const shopName = String(params.shop_name || "የእኔ ሱቅ").trim();
        const role = String(params.role || "owner").trim();

        if (!phone) {
          throw new Error("ስልክ ቁጥር በትክክል አልተሞላም");
        }

        if (!password || password.length < 4) {
          throw new Error("የይለፍ ቃል ቢያንስ 4 ፊደላት ወይም አሃዞች መሆን አለበት");
        }

        if (!fullName) {
          throw new Error("እባክዎ ሙሉ ስምዎን ያስገቡ");
        }

        const registrationTask = async () => {
          console.log(`[useAuth] Starting registration for phone: ${phone}`);

          // 1. Check if user already exists
          const existingUser = await fetchUserFromFirestore(phone);
          if (existingUser) {
            throw new Error("በዚህ ስልክ ቁጥር ቀደም ሲል የተመዘገበ መለያ አለ። እባክዎ ይግቡ።");
          }

          // 2. Generate unique store_id
          const uniqueStoreId = generateStoreId(phone);
          console.log(`[useAuth] Generated unique store_id: ${uniqueStoreId}`);

          // 3. User profile payload for users/{phone}
          const userPayload: UserProfile = {
            phone: phone,
            password: password,
            role: role,
            store_id: uniqueStoreId,
            storeId: uniqueStoreId,
            full_name: fullName,
            fullName: fullName,
            name: fullName,
            isOwner: role === "owner",
            createdAt: Date.now(),
            updatedAt: Date.now()
          };

          // 4. Shop payload
          const shopPayload: ShopData = {
            store_id: uniqueStoreId,
            shopId: uniqueStoreId,
            name: shopName,
            owner_phone: phone,
            owner_id: phone,
            employees: [],
            inventory: [],
            sales: [],
            expenses: [],
            shipments: [],
            customers: [],
            profile: {
              shopName: shopName,
              ownerName: fullName,
              phone: phone
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
          };

          // Save user & shop
          const userRes = await saveUserToFirestore(userPayload);
          if (!userRes.ok) {
            throw new Error(userRes.error || "የተጠቃሚ መለያ ማስቀመጥ አልተቻለም");
          }

          const shopRes = await saveShopToFirestore(shopPayload);
          if (!shopRes.ok) {
            console.warn("[useAuth] Shop saving warning:", shopRes.error);
          }

          setCurrentUser(userPayload);
          return {
            user: userPayload,
            store_id: uniqueStoreId
          };
        };

        const result = await withTimeout(registrationTask(), NETWORK_TIMEOUT_MS);
        return {
          success: true,
          data: result
        };
      } catch (error: any) {
        console.error("Firebase Registration Error:", error);
        const errMsg = error?.message || "የመለያ ምዝገባ ወቅት ያልታሰበ ስህተት አጋጥሟል";
        alert("የምዝገባ ስህተት አጋጥሟል፡ " + errMsg);
        setError(errMsg);
        return { success: false, error: errMsg };
      } finally {
        setLoading(false);
      }
    },
    [normalizePhone, generateStoreId]
  );

  /**
   * Login logic with timeout and try-catch-finally
   */
  const login = useCallback(
    async (params: LoginParams): Promise<AuthResponse<UserProfile>> => {
      setLoading(true);
      setError(null);

      try {
        const phone = normalizePhone(params.phone);
        const password = String(params.password || "").trim();

        if (!phone) {
          throw new Error("እባክዎ ትክክለኛ ስልክ ቁጥር ያስገቡ");
        }

        if (!password) {
          throw new Error("እባክዎ የይለፍ ቃል ያስገቡ");
        }

        const loginTask = async () => {
          console.log(`[useAuth] Attempting login for phone: ${phone}`);
          const userData = await fetchUserFromFirestore(phone);

          if (!userData) {
            throw new Error("ይህ ስልክ ቁጥር በስርዓቱ ውስጥ አልተገኘም። እባክዎ መጀመሪያ ይመዝገቡ።");
          }

          if (userData.password && userData.password !== password) {
            throw new Error("የተሳሳተ የይለፍ ቃል አስገብተዋል። እባክዎ እንደገና ይሞክሩ።");
          }

          console.log(`[useAuth] ✓ Login successful for ${phone}`);
          const profile: UserProfile = {
            phone: userData.phone || phone,
            full_name: userData.full_name || userData.fullName || userData.name || "",
            fullName: userData.full_name || userData.fullName || userData.name || "",
            name: userData.name || userData.full_name || "",
            role: userData.role || "owner",
            store_id: userData.store_id || userData.storeId || ("store_" + phone.replace(/\D/g, "")),
            storeId: userData.store_id || userData.storeId || ("store_" + phone.replace(/\D/g, "")),
            isOwner: userData.isOwner !== undefined ? Boolean(userData.isOwner) : true,
            createdAt: userData.createdAt || Date.now(),
            updatedAt: userData.updatedAt || Date.now()
          };

          setCurrentUser(profile);
          return profile;
        };

        const result = await withTimeout(loginTask(), NETWORK_TIMEOUT_MS);
        return { success: true, data: result };
      } catch (error: any) {
        console.error("Auth Error:", error);
        const errMsg = error?.message || "ወደ ስርዓቱ መግባት አልተቻለም። እባክዎ እንደገና ይሞክሩ።";
        alert("የመግባት/የምዝገባ ስህተት፦ " + errMsg);
        setError(errMsg);
        return { success: false, error: errMsg };
      } finally {
        setLoading(false);
      }
    },
    [normalizePhone]
  );

  /**
   * Logout logic
   */
  const logout = useCallback(() => {
    console.log("[useAuth] Logging out current user");
    setCurrentUser(null);
    setError(null);
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {}
  }, []);

  return {
    currentUser,
    loading,
    error,
    register,
    signup: register,
    login,
    logout,
    isAuthenticated: !!currentUser
  };
}
