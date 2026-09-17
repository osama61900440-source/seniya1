// @ts-nocheck
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  setLogLevel,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";

import {
  saveUserToFirestore,
  saveShopToFirestore,
  fetchUserFromFirestore,
  fetchShopFromFirestore,
  fetchSalesByStoreId,
  fetchInventoryByStoreId,
  fetchExpensesByStoreId,
  saveSaleToFirestore,
  saveExpenseToFirestore,
  saveInventoryItemToFirestore,
  isFirestoreConfigured,
  withTimeout,
  formatToInternationalPhone
} from "./firebase.js";

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

try {
  setLogLevel("error");
} catch (e) {}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    ignoreUndefinedProperties: true
  });
} catch (e) {
  dbInstance = getFirestore(app);
}

export const db = dbInstance;
export { app };
export default app;

export {
  saveUserToFirestore,
  saveShopToFirestore,
  fetchUserFromFirestore,
  fetchShopFromFirestore,
  fetchSalesByStoreId,
  fetchInventoryByStoreId,
  fetchExpensesByStoreId,
  saveSaleToFirestore,
  saveExpenseToFirestore,
  saveInventoryItemToFirestore,
  isFirestoreConfigured,
  withTimeout,
  formatToInternationalPhone,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  serverTimestamp
};
