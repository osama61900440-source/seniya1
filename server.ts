import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8617451852:AAFUpPpaai7M1meuMN025WHokFI4lUanbWg";
const TELEGRAM_BOT_USERNAME = "GrposBot";
const SESSIONS_FILE = path.join(process.cwd(), "telegram_sessions.json");

// In-memory OTP storage and verified Telegram contact mapping
interface OtpSession {
  phone: string;
  code: string;
  createdAt: number;
  expiresAt: number;
  verified: boolean;
  telegramChatId?: number | string;
}

const otpStore: Record<string, OtpSession> = {};
// Strictly verified mappings: Only populated when user shares verified Telegram contact
const verifiedPhoneToTelegramChat: Record<string, number | string> = {};
const telegramChatToVerifiedPhone: Record<string, string> = {};

// Track pending verification requests from the web app or /start payload
const chatPendingRequestedPhone: Record<string, { phone: string; timestamp: number }> = {};
const appPendingPhoneRequests: Record<string, { timestamp: number }> = {};
let lastPendingPhone = "";
let latestTelegramChatId: number | string | null = null;

// Normalize phone numbers to standard Ethiopian 10-digit format (09... or 07...)
function normalizePhone(phone: string): string {
  if (!phone) return "";
  const raw = String(phone).trim().replace(/[\s\-()]/g, "");
  let digits = raw.replace(/\D/g, "");

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

// Convert phone numbers to exact international format (+2519XXXXXXXX)
function toInternationalPhone(phone: string): string {
  if (!phone) return "";
  const raw = String(phone).trim().replace(/[\s\-()]/g, "");
  const digits = raw.replace(/\D/g, "");

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
  // 9 digits starting with 9 or 7
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

// Check if two phone numbers match (considering local and international formats)
function phonesMatch(phone1: string, phone2: string): boolean {
  if (!phone1 || !phone2) return false;
  const p1 = normalizePhone(phone1);
  const p2 = normalizePhone(phone2);
  if (p1 && p2 && p1 === p2) return true;
  const intl1 = toInternationalPhone(phone1);
  const intl2 = toInternationalPhone(phone2);
  if (intl1 && intl2 && intl1 === intl2) return true;
  const raw1 = String(phone1).replace(/\D/g, "");
  const raw2 = String(phone2).replace(/\D/g, "");
  if (raw1 && raw2 && raw1 === raw2) return true;
  if (raw1.length >= 9 && raw2.length >= 9) {
    if (raw1.slice(-9) === raw2.slice(-9)) return true;
  }
  return false;
}

// Load persisted Telegram sessions if available
function loadPersistedTelegramSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const content = fs.readFileSync(SESSIONS_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        if (parsed.verifiedPhoneToChat) {
          Object.assign(verifiedPhoneToTelegramChat, parsed.verifiedPhoneToChat);
        } else if (parsed.phoneToChat) {
          Object.assign(verifiedPhoneToTelegramChat, parsed.phoneToChat);
        }
        if (parsed.chatToVerifiedPhone) {
          Object.assign(telegramChatToVerifiedPhone, parsed.chatToVerifiedPhone);
        } else if (parsed.chatToPhone) {
          Object.assign(telegramChatToVerifiedPhone, parsed.chatToPhone);
        }
      }
    }
  } catch (err: any) {
    console.warn("Could not load persisted telegram sessions:", err?.message);
  }
}

// Persist Telegram sessions to disk
function persistTelegramSessions() {
  try {
    fs.writeFileSync(
      SESSIONS_FILE,
      JSON.stringify(
        {
          verifiedPhoneToChat: verifiedPhoneToTelegramChat,
          chatToVerifiedPhone: telegramChatToVerifiedPhone,
          updatedAt: Date.now(),
        },
        null,
        2
      )
    );
  } catch (err: any) {
    console.warn("Could not persist telegram sessions:", err?.message);
  }
}

loadPersistedTelegramSessions();

// Link verified phone with Telegram Chat ID
function saveVerifiedPhoneChatMapping(phone: string, chatId: number | string) {
  if (!phone || !chatId) return;
  const raw = String(phone).trim().replace(/[\s\-()]/g, "");
  const intl = toInternationalPhone(raw);
  const norm = normalizePhone(raw);
  const digits = raw.replace(/\D/g, "");

  if (intl) verifiedPhoneToTelegramChat[intl] = chatId;
  if (norm) verifiedPhoneToTelegramChat[norm] = chatId;
  if (digits) verifiedPhoneToTelegramChat[digits] = chatId;
  verifiedPhoneToTelegramChat[raw] = chatId;

  telegramChatToVerifiedPhone[String(chatId)] = intl || norm || raw;
  latestTelegramChatId = chatId;
  persistTelegramSessions();
}

// Lookup Chat ID for a verified phone number
function findVerifiedChatIdForPhone(phone: string): number | string | null {
  if (!phone) return null;
  const raw = String(phone).trim().replace(/[\s\-()]/g, "");
  const intl = toInternationalPhone(raw);
  const norm = normalizePhone(raw);
  const digits = raw.replace(/\D/g, "");

  if (intl && verifiedPhoneToTelegramChat[intl]) return verifiedPhoneToTelegramChat[intl];
  if (norm && verifiedPhoneToTelegramChat[norm]) return verifiedPhoneToTelegramChat[norm];
  if (digits && verifiedPhoneToTelegramChat[digits]) return verifiedPhoneToTelegramChat[digits];
  if (verifiedPhoneToTelegramChat[raw]) return verifiedPhoneToTelegramChat[raw];

  // Try matching against any key using phonesMatch
  for (const k in verifiedPhoneToTelegramChat) {
    if (phonesMatch(k, phone)) {
      return verifiedPhoneToTelegramChat[k];
    }
  }
  return null;
}

// Send rejection message when Telegram account phone doesn't match
async function sendTelegramRejectMessage(chatId: number | string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "ይህ የስልክ ቁጥር ከእርስዎ የቴሌግራም አካውንት ጋር አይመሳሰልም! እባክዎን በአፑ ላይ ያስገቡትን ስልክ ቁጥር ይጠቀሙ።",
        disable_notification: false,
        reply_markup: { remove_keyboard: true },
      }),
    });
    const data = await res.json();
    return !!data.ok;
  } catch (err: any) {
    console.warn("sendTelegramRejectMessage error:", err?.message);
    return false;
  }
}

// Send native Telegram Contact Request prompt
async function askUserToShareContact(chatId: number | string, firstName?: string): Promise<boolean> {
  const greeting = firstName ? `ሰላም <b>${firstName}</b>!` : "ሰላም!";
  const html =
    `👋 ${greeting}\n\n` +
    `🔐 <b>የ Gr/POS (seniya) ደህንነት ማረጋገጫ</b>\n\n` +
    `የማረጋገጫ ኮድ (OTP) ለመቀበል እባክዎ ከታች ያለውን <b>"📱 ስልክ ቁጥርዎን ያጋሩ"</b> የሚለውን ቁልፍ በመጫን የቴሌግራም ስልክ ቁጥርዎን ያረጋግጡ።`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        reply_markup: {
          keyboard: [
            [
              {
                text: "📱 ስልክ ቁጥርዎን ያጋሩ",
                request_contact: true,
              },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }),
    });
    const data = await res.json();
    return !!data.ok;
  } catch (err: any) {
    console.warn("askUserToShareContact error:", err?.message);
    return false;
  }
}

// Send Telegram OTP message via Bot API
async function sendTelegramOtpMessage(
  chatId: number | string,
  phone: string,
  code: string,
  firstName?: string,
  options?: { removeKeyboard?: boolean }
): Promise<boolean> {
  const greeting = firstName ? `ሰላም <b>${firstName}</b>!` : "ሰላም!";
  const html =
    `🔐 ${greeting} የ Gr/POS (seniya) ማረጋገጫ ኮድዎ፦\n\n` +
    `👉 <code><b>${code}</b></code>\n\n` +
    `📱 ለስልክ ቁጥር፦ <b>${phone}</b>\n` +
    `⏱ ይህ ኮድ ለ <b>2 ደቂቃዎች</b> ያገለግላል።\n\n` +
    `እባክዎ ይህን ባለ 6 አሃዝ ኮድ በመተግበሪያው ላይ አስገብተው <b>"አረጋግጥ እና ግባ"</b> የሚለውን ይጫኑ።`;

  try {
    const payload: any = {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_notification: false,
    };
    if (options?.removeKeyboard) {
      payload.reply_markup = { remove_keyboard: true };
    }
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return !!data.ok;
  } catch (err: any) {
    console.warn("Telegram sendMessage error:", err?.message);
    return false;
  }
}

// Background Telegram Poller with Mandatory Contact Verification
let lastTelegramUpdateId = 0;
let isPollingActive = false;

async function pollTelegramUpdates() {
  if (isPollingActive) return;
  isPollingActive = true;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastTelegramUpdateId + 1}&timeout=5`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        if (update.update_id >= lastTelegramUpdateId) {
          lastTelegramUpdateId = update.update_id;
        }

        const msg = update.message || update.edited_message;
        if (!msg || !msg.chat) continue;

        const chatId = msg.chat.id;
        latestTelegramChatId = chatId;
        const text = (msg.text || "").trim();
        const firstName = msg.from?.first_name || "";

        // Check if message has start parameter: e.g. /start RESET_0961900440, /start pass_0961900440 or /start VERIFY_STORE_09...
        const matchVerify = text.match(/(?:pass|RESET|VERIFY(?:_STORE)?)_?(\d+)/i);
        if (matchVerify && matchVerify[1]) {
          const reqPhone = normalizePhone(matchVerify[1]) || matchVerify[1];
          chatPendingRequestedPhone[String(chatId)] = { phone: reqPhone, timestamp: Date.now() };
        }

        // 1. Mandatory Telegram Contact Verification Check:
        // Do NOT send OTP codes to any user who simply sends "/start" or plain text!
        if (!msg.contact) {
          // If the user hasn't shared their contact, require them to share contact first
          const verifiedPhone = telegramChatToVerifiedPhone[String(chatId)];
          const targetPhone = chatPendingRequestedPhone[String(chatId)]?.phone || (lastPendingPhone ? normalizePhone(lastPendingPhone) : "");

          if (verifiedPhone && targetPhone) {
            // If previously verified, check if verified phone matches the requested phone
            if (!phonesMatch(verifiedPhone, targetPhone)) {
              await sendTelegramRejectMessage(chatId);
            } else {
              // Verified and matching: generate and send OTP
              const code = Math.floor(100000 + Math.random() * 900000).toString();
              const now = Date.now();
              const expiresAt = now + 2 * 60 * 1000;
              otpStore[verifiedPhone] = {
                phone: verifiedPhone,
                code,
                createdAt: now,
                expiresAt,
                verified: false,
                telegramChatId: chatId,
              };
              await sendTelegramOtpMessage(chatId, verifiedPhone, code, firstName, { removeKeyboard: true });
            }
          } else {
            // Not verified or fresh request: prompt with native Telegram "Share Contact" button
            await askUserToShareContact(chatId, firstName);
          }
          continue;
        }

        // 2. User shared contact: securely fetch real phone number
        const contact = msg.contact;
        const contactPhone = contact.phone_number ? String(contact.phone_number).trim() : "";

        // Security check: ensure user didn't forward someone else's contact card
        if (contact.user_id && msg.from?.id && String(contact.user_id) !== String(msg.from.id)) {
          await askUserToShareContact(chatId, firstName);
          continue;
        }

        const verifiedTgPhone = normalizePhone(contactPhone) || contactPhone.replace(/\D/g, "");
        if (!verifiedTgPhone) {
          await askUserToShareContact(chatId, firstName);
          continue;
        }

        const intlTgPhone = toInternationalPhone(contactPhone) || verifiedTgPhone;
        const normTgPhone = normalizePhone(contactPhone) || verifiedTgPhone;

        // 3. Phone Number Matching Check:
        // Compare user's verified Telegram phone against the specific phone number that initiated the request inside the app
        let expectedAppPhone = chatPendingRequestedPhone[String(chatId)]?.phone || "";
        if (!expectedAppPhone && lastPendingPhone) {
          expectedAppPhone = lastPendingPhone;
        }

        if (expectedAppPhone && !phonesMatch(verifiedTgPhone, expectedAppPhone)) {
          // 4. Reject Unauthorized Requests:
          // If a different Telegram account or number requests the code, reject it
          await sendTelegramRejectMessage(chatId);
          continue;
        }

        // Both phone numbers match perfectly (or verified user established)
        saveVerifiedPhoneChatMapping(verifiedTgPhone, chatId);
        saveVerifiedPhoneChatMapping(intlTgPhone, chatId);
        saveVerifiedPhoneChatMapping(normTgPhone, chatId);
        delete chatPendingRequestedPhone[String(chatId)];

        // Generate dynamic 6-digit OTP
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const now = Date.now();
        const expiresAt = now + 2 * 60 * 1000;
        const newSession: OtpSession = {
          phone: intlTgPhone || normTgPhone || verifiedTgPhone,
          code,
          createdAt: now,
          expiresAt,
          verified: false,
          telegramChatId: chatId,
        };
        otpStore[verifiedTgPhone] = newSession;
        otpStore[intlTgPhone] = newSession;
        otpStore[normTgPhone] = newSession;

        // Send the OTP code only now that verification is complete
        await sendTelegramOtpMessage(chatId, intlTgPhone || verifiedTgPhone, code, firstName, { removeKeyboard: true });
      }
    }
  } catch (err: any) {
    // Non-blocking network errors
  } finally {
    isPollingActive = false;
    setTimeout(pollTelegramUpdates, 2000);
  }
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Telegram Bot status and info
app.get("/api/telegram/bot-info", async (_req, res) => {
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
    const data = await tgRes.json();
    if (data.ok) {
      res.json({
        ok: true,
        bot: data.result,
        botUrl: `https://t.me/${data.result.username || TELEGRAM_BOT_USERNAME}?start=VERIFY_STORE`,
      });
    } else {
      res.json({
        ok: false,
        error: data.description || "Failed to fetch bot info",
        fallbackUsername: TELEGRAM_BOT_USERNAME,
        botUrl: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=VERIFY_STORE`,
      });
    }
  } catch (err: any) {
    res.json({
      ok: false,
      error: err.message,
      fallbackUsername: TELEGRAM_BOT_USERNAME,
      botUrl: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=VERIFY_STORE`,
    });
  }
});

// Check status of a phone number in Telegram
app.get("/api/telegram/check-status", (req, res) => {
  const phone = String(req.query.phone || "").trim();
  const cleanPhone = phone.replace(/\s+/g, "");
  const intlPhone = toInternationalPhone(cleanPhone);
  const normPhone = normalizePhone(cleanPhone);
  const primaryPhone = intlPhone || normPhone || cleanPhone;
  const targetChatId =
    findVerifiedChatIdForPhone(primaryPhone) ||
    (intlPhone ? findVerifiedChatIdForPhone(intlPhone) : null) ||
    (normPhone ? findVerifiedChatIdForPhone(normPhone) : null) ||
    (cleanPhone ? findVerifiedChatIdForPhone(cleanPhone) : null);
  const session =
    (intlPhone ? otpStore[intlPhone] : null) ||
    (normPhone ? otpStore[normPhone] : null) ||
    (cleanPhone ? otpStore[cleanPhone] : null) ||
    otpStore[primaryPhone];

  res.json({
    ok: true,
    linked: !!targetChatId,
    phone: primaryPhone,
    hasSession: !!session,
    hasValidCode: session ? Date.now() < session.expiresAt && !session.verified : false,
    botUrl: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=VERIFY_STORE_${encodeURIComponent(primaryPhone)}`,
  });
});

// Request an OTP code
app.post("/api/telegram/request-otp", async (req, res) => {
  const { phone } = req.body;
  const cleanPhone = String(phone || "").trim().replace(/\s+/g, "");
  const intlPhone = toInternationalPhone(cleanPhone);
  const normPhone = normalizePhone(cleanPhone);
  const primaryPhone = intlPhone || normPhone || cleanPhone;

  if (!primaryPhone) {
    return res.status(400).json({
      ok: false,
      scenario: "NO_ACCOUNT",
      sentToTelegram: false,
      unlinked: true,
      error: "እባክዎን የመግቢያ ቁጥር ለማግኘት የቴሌግራም አካውንት ይክፈቱና በድጋሚ ይሞክሩ።",
      botUrl: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=VERIFY_STORE`,
    });
  }

  lastPendingPhone = primaryPhone;
  appPendingPhoneRequests[primaryPhone] = { timestamp: Date.now() };
  if (intlPhone) appPendingPhoneRequests[intlPhone] = { timestamp: Date.now() };
  if (normPhone) appPendingPhoneRequests[normPhone] = { timestamp: Date.now() };

  // Generate dynamic 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const now = Date.now();
  const expiresAt = now + 2 * 60 * 1000; // 2 minutes (1:59 countdown)

  const newSession: OtpSession = {
    phone: primaryPhone,
    code,
    createdAt: now,
    expiresAt,
    verified: false,
  };
  otpStore[primaryPhone] = newSession;
  if (intlPhone) otpStore[intlPhone] = newSession;
  if (normPhone) otpStore[normPhone] = newSession;
  if (cleanPhone && cleanPhone !== primaryPhone) {
    otpStore[cleanPhone] = newSession;
  }

  // Check if user's phone number is verified via Telegram contact sharing
  const targetChatId =
    findVerifiedChatIdForPhone(primaryPhone) ||
    (intlPhone ? findVerifiedChatIdForPhone(intlPhone) : null) ||
    (normPhone ? findVerifiedChatIdForPhone(normPhone) : null) ||
    (cleanPhone ? findVerifiedChatIdForPhone(cleanPhone) : null);

  if (targetChatId) {
    const chatVerifiedPhone = telegramChatToVerifiedPhone[String(targetChatId)];
    // Scenario B (Mismatching Phone Number):
    // Send Telegram message stating:
    // "ይህ የስልክ ቁጥር ከእርስዎ የቴሌግራም አካውንት ጋር አይመሳሰልም! እባክዎን በአፑ ላይ ያስገቡትን ስልክ ቁጥር ይጠቀሙ።"
    if (chatVerifiedPhone && !phonesMatch(chatVerifiedPhone, primaryPhone)) {
      await sendTelegramRejectMessage(targetChatId);
      return res.json({
        ok: false,
        scenario: "MISMATCH",
        sentToTelegram: false,
        unlinked: true,
        phone: primaryPhone,
        error: "ይህ የስልክ ቁጥር ከእርስዎ የቴሌግራም አካውንት ጋር አይመሳሰልም! እባክዎን በአፑ ላይ ያስገቡትን ስልክ ቁጥር ይጠቀሙ።",
        botUrl: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=VERIFY_STORE_${encodeURIComponent(primaryPhone)}`,
      });
    }

    // Scenario A (Valid Match):
    // Automatically send the OTP message directly to the user's Telegram chat as a top pop-up notification/message
    const sentToTelegram = await sendTelegramOtpMessage(targetChatId, primaryPhone, code, undefined, { removeKeyboard: true });
    if (!sentToTelegram) {
      return res.json({
        ok: false,
        scenario: "SEND_FAILED",
        sentToTelegram: false,
        unlinked: false,
        phone: primaryPhone,
        error: "ኮዱን በቴሌግራም መላክ አልተቻለም። እባክዎ በድጋሚ ይሞክሩ!",
        botUrl: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=VERIFY_STORE_${encodeURIComponent(primaryPhone)}`,
      });
    }

    newSession.telegramChatId = targetChatId;

    return res.json({
      ok: true,
      scenario: "MATCH",
      sentToTelegram: true,
      unlinked: false,
      phone: primaryPhone,
      expiresInSeconds: 120,
      telegramMessage: "ኮድ በቴሌግራም ቦት ተልኳል",
      botUrl: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=VERIFY_STORE_${encodeURIComponent(primaryPhone)}`,
    });
  }

  // If no targetChatId directly for primaryPhone, check if an active Telegram chat exists with a mismatching phone
  if (latestTelegramChatId) {
    const activePhone = telegramChatToVerifiedPhone[String(latestTelegramChatId)];
    if (activePhone && !phonesMatch(activePhone, primaryPhone)) {
      // Scenario B: Mismatching Phone Number - Send Telegram rejection message
      await sendTelegramRejectMessage(latestTelegramChatId);
      return res.json({
        ok: false,
        scenario: "MISMATCH",
        sentToTelegram: false,
        unlinked: true,
        phone: primaryPhone,
        error: "ይህ የስልክ ቁጥር ከእርስዎ የቴሌግራም አካውንት ጋር አይመሳሰልም! እባክዎን በአፑ ላይ ያስገቡትን ስልክ ቁጥር ይጠቀሙ።",
        botUrl: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=VERIFY_STORE_${encodeURIComponent(primaryPhone)}`,
      });
    }
  }

  // Scenario C (No Telegram Account Found):
  // Return response indicating no telegram account found, so app screen can display the alert directly without leaving the app:
  // "እባክዎን የመግቢያ ቁጥር ለማግኘት የቴሌግራም አካውንት ይክፈቱና በድጋሚ ይሞክሩ።"
  return res.json({
    ok: false,
    scenario: "NO_ACCOUNT",
    sentToTelegram: false,
    unlinked: true,
    phone: primaryPhone,
    error: "እባክዎን የመግቢያ ቁጥር ለማግኘት የቴሌግራም አካውንት ይክፈቱና በድጋሚ ይሞክሩ።",
    botUrl: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=VERIFY_STORE_${encodeURIComponent(primaryPhone)}`,
  });
});

// Verify entered OTP code
app.post("/api/telegram/verify-otp", (req, res) => {
  const { phone, code } = req.body;
  const cleanPhone = String(phone || "").trim().replace(/\s+/g, "");
  const intlPhone = toInternationalPhone(cleanPhone);
  const normPhone = normalizePhone(cleanPhone);
  const enteredCode = String(code || "").trim().replace(/\D/g, "");

  let session =
    (intlPhone ? otpStore[intlPhone] : null) ||
    (normPhone ? otpStore[normPhone] : null) ||
    otpStore[cleanPhone] ||
    (lastPendingPhone
      ? (otpStore[toInternationalPhone(lastPendingPhone)] ||
         otpStore[normalizePhone(lastPendingPhone)] ||
         otpStore[lastPendingPhone])
      : null);

  if (!session) {
    for (const p in otpStore) {
      if (phonesMatch(p, cleanPhone) || (lastPendingPhone && phonesMatch(p, lastPendingPhone))) {
        session = otpStore[p];
        break;
      }
    }
  }

  if (!session) {
    return res.status(400).json({
      ok: false,
      error: "የማረጋገጫ ኮድ አልተገኘም። እባክዎ በ @GrposBot አዲስ ኮድ ይጠይቁ።",
    });
  }

  if (Date.now() > session.expiresAt) {
    return res.status(400).json({
      ok: false,
      error: "የኮዱ ጊዜ አልቋል (Expired)። እባክዎ አዲስ ኮድ ይጠይቁ።",
    });
  }

  // Strict verification: only grant when entered OTP exactly matches real code sent by @GrposBot
  if (session.code === enteredCode) {
    session.verified = true;
    const rawVerified = session.phone || intlPhone || normPhone || cleanPhone || (latestTelegramChatId ? telegramChatToVerifiedPhone[String(latestTelegramChatId)] : "");
    const verifiedPhone = toInternationalPhone(rawVerified) || rawVerified;
    return res.json({
      ok: true,
      verified: true,
      phone: verifiedPhone,
      message: "ማረጋገጫው በተሳካ ሁኔታ ተጠናቋል",
    });
  }

  res.status(400).json({
    ok: false,
    error: "የተሳሳተ ኮድ — እባክዎ በ @GrposBot የተላከውን ባለ 6 አሃዝ ኮድ በትክክል ያስገቡ",
  });
});

// -------------------------------------------------------------
// In-App Shop & Staff (Employee) Database & Phone Mapping
// Architecture: stores/{shopId} & users/{phone}
// -------------------------------------------------------------
interface EmployeeRecord {
  id: string;
  name: string;
  phone: string;
  pin: string;
  role: string;
  permissions?: string[];
  status?: string;
  createdAt: number;
}

// User Account Structure: users/{phone} (e.g. users/+2519XXXXXXXX)
interface UserAccount {
  phone: string; // "+2519XXXXXXXX"
  password: string; // "user_entered_password"
  role: string; // "owner"
  store_id: string; // "generated_shop_id"
  storeId?: string;
  isOwner: boolean; // true
  full_name?: string; // Entered full name, e.g., "ሆሳም" or "ረቢ"
  name?: string;
  fullName?: string;
  created_at?: number | any;
  createdAt?: number;
  updatedAt?: number;
}

// Separate Shop Profile Structure: shops/{store_id}
interface ShopProfile {
  store_id: string;
  shopId: string;
  storeId?: string;
  name: string;
  owner_phone?: string;
  ownerPhoneNumber: string;
  owner_id?: string;
  ownerPin?: string;
  employees: EmployeeRecord[];
  inventory?: any[];
  sales?: any[];
  expenses?: any[];
  shipments?: any[];
  customers?: any[];
  profile?: any;
  createdAt?: number;
  updatedAt: number;
}

// Multi-tenant database collections: users/{phone} & shops/{store_id}
const USERS_DB_FILE = path.join(process.cwd(), "users_db.json");
const SHOPS_DB_FILE = path.join(process.cwd(), "shops_db.json");
const usersStore: Record<string, UserAccount> = {};
const shopsStore: Record<string, ShopProfile> = {};
const phoneToShopMap: Record<string, { shopId: string; role: string; name: string; pin: string; permissions?: string[]; status?: string }> = {};

function loadPersistedDatabase() {
  try {
    if (fs.existsSync(USERS_DB_FILE)) {
      const content = fs.readFileSync(USERS_DB_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        for (const k in parsed) {
          const u = parsed[k];
          if (u) {
            const intl = toInternationalPhone(u.phone || k) || u.phone || k;
            const userObj: UserAccount = {
              phone: intl,
              password: u.password || u.ownerPin || "",
              role: u.role || "owner",
              store_id: u.store_id || u.storeId || u.shopId || ("store_" + intl.replace(/\D/g, "")),
              storeId: u.store_id || u.storeId || u.shopId || ("store_" + intl.replace(/\D/g, "")),
              isOwner: u.isOwner !== undefined ? Boolean(u.isOwner) : true,
              name: u.name || u.fullName || "የሱቅ ባለቤት",
              fullName: u.fullName || u.name || "የሱቅ ባለቤት",
              createdAt: u.createdAt || Date.now(),
              updatedAt: u.updatedAt || Date.now(),
            };
            usersStore[intl] = userObj;
            const norm = normalizePhone(intl);
            if (norm && norm !== intl) {
              usersStore[norm] = userObj;
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.warn("Could not load users database:", err?.message);
  }

  try {
    if (fs.existsSync(SHOPS_DB_FILE)) {
      const content = fs.readFileSync(SHOPS_DB_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        for (const sId in parsed) {
          const s = parsed[sId];
          if (s) {
            shopsStore[sId] = {
              store_id: s.store_id || s.shopId || sId,
              shopId: s.shopId || s.store_id || sId,
              storeId: s.store_id || s.shopId || sId,
              name: s.name || "የእኔ ሱቅ",
              owner_phone: s.owner_phone || s.ownerPhoneNumber || "",
              ownerPhoneNumber: s.ownerPhoneNumber || s.owner_phone || "",
              owner_id: s.owner_id || s.owner_phone || s.ownerPhoneNumber || "",
              ownerPin: s.ownerPin || "",
              employees: Array.isArray(s.employees) ? s.employees : [],
              inventory: Array.isArray(s.inventory) ? s.inventory : (Array.isArray(s.items) ? s.items : []),
              sales: Array.isArray(s.sales) ? s.sales : [],
              expenses: Array.isArray(s.expenses) ? s.expenses : [],
              shipments: Array.isArray(s.shipments) ? s.shipments : [],
              customers: Array.isArray(s.customers) ? s.customers : [],
              profile: s.profile || {},
              createdAt: s.createdAt || Date.now(),
              updatedAt: s.updatedAt || Date.now(),
            };
          }
        }
      }
    }
  } catch (err: any) {
    console.warn("Could not load shops database:", err?.message);
  }

  // Populate phoneToShopMap
  for (const ph in usersStore) {
    const u = usersStore[ph];
    if (u && u.store_id) {
      phoneToShopMap[ph] = {
        shopId: u.store_id,
        role: u.role || "owner",
        name: (u.name || "የእኔ ሱቅ") + " (ባለቤት)",
        pin: u.password || "",
        permissions: ["all"],
        status: "active",
      };
    }
  }
  for (const sId in shopsStore) {
    const s = shopsStore[sId];
    if (s && s.employees && Array.isArray(s.employees)) {
      s.employees.forEach((emp) => {
        if (emp.phone) {
          const mapping = {
            shopId: sId,
            role: emp.role || "cashier",
            name: emp.name,
            pin: emp.pin,
            permissions: emp.permissions || ["sales"],
            status: emp.status || "active",
          };
          phoneToShopMap[emp.phone] = mapping;
          const intl = toInternationalPhone(emp.phone);
          if (intl) phoneToShopMap[intl] = mapping;
          const norm = normalizePhone(emp.phone);
          if (norm) phoneToShopMap[norm] = mapping;
        }
      });
    }
  }
}

function persistDatabase() {
  try {
    fs.writeFileSync(USERS_DB_FILE, JSON.stringify(usersStore, null, 2));
    fs.writeFileSync(SHOPS_DB_FILE, JSON.stringify(shopsStore, null, 2));
  } catch (err: any) {
    console.warn("Could not persist database:", err?.message);
  }
}

loadPersistedDatabase();

// Helper to look up a user by phone (supports international +251... or local formats)
function getUserByPhone(phone: string): UserAccount | null {
  if (!phone) return null;
  const intl = toInternationalPhone(phone);
  const norm = normalizePhone(phone);
  const raw = String(phone).trim().replace(/\s+/g, "");
  if (intl && usersStore[intl]) return usersStore[intl];
  if (norm && usersStore[norm]) return usersStore[norm];
  if (raw && usersStore[raw]) return usersStore[raw];
  for (const k in usersStore) {
    const u = usersStore[k];
    if (u && (u.phone === intl || u.phone === norm || u.phone === raw || phonesMatch(u.phone, phone))) {
      return u;
    }
  }
  return null;
}

// Helper to look up shop profile by store_id
function getShopByStoreId(storeId: string): ShopProfile | null {
  if (!storeId) return null;
  const sId = String(storeId).trim();
  if (shopsStore[sId]) return shopsStore[sId];
  for (const k in shopsStore) {
    const s = shopsStore[k];
    if (s && (s.store_id === sId || s.shopId === sId)) {
      return s;
    }
  }
  return null;
}

// -------------------------------------------------------------
// 1. User Account Creation & Registration (/api/users/register)
// Explicitly creates document inside `users` collection using phone as Document ID (users/+2519XXXXXXXX)
// Separately creates document inside `shops` collection using store_id as Document ID (shops/{store_id})
// -------------------------------------------------------------
app.post("/api/users/register", (req, res) => {
  const { phone, password, role, store_id, storeId, isOwner, orgName, name, fullName } = req.body || {};
  const cleanPhone = String(phone || "").trim().replace(/\s+/g, "");
  const intlPhone = toInternationalPhone(cleanPhone) || cleanPhone;
  if (!intlPhone) {
    return res.status(400).json({ ok: false, error: "ትክክለኛ ስልክ ቁጥር ያስገቡ" });
  }
  const cleanPassword = String(password || "").trim();
  if (!cleanPassword) {
    return res.status(400).json({ ok: false, error: "የይለፍ ቃል ያስፈልጋል" });
  }

  // Generate unique store_id if not provided
  const digits = intlPhone.replace(/\D/g, "");
  const generatedStoreId = String(store_id || storeId || ("store_" + digits)).trim();
  const shopName = String(orgName || "የእኔ ሱቅ").trim();
  const ownerName = String(fullName || name || "የሱቅ ባለቤት").trim();

  // 1. User Account Creation in users/{phone}
  const userAccount: UserAccount = {
    phone: intlPhone,
    password: cleanPassword,
    role: String(role || "owner"),
    store_id: generatedStoreId,
    storeId: generatedStoreId,
    isOwner: isOwner !== undefined ? Boolean(isOwner) : true,
    full_name: ownerName,
    name: ownerName,
    fullName: ownerName,
    created_at: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 2. Separate Shop Profile Creation in shops/{store_id}
  const prevShop: Partial<ShopProfile> = getShopByStoreId(generatedStoreId) || {};
  const shopProfile: ShopProfile = {
    store_id: generatedStoreId,
    shopId: generatedStoreId,
    name: shopName,
    owner_phone: intlPhone,
    ownerPhoneNumber: intlPhone,
    owner_id: intlPhone,
    ownerPin: cleanPassword,
    employees: prevShop.employees || [],
    inventory: prevShop.inventory || [],
    sales: prevShop.sales || [],
    expenses: prevShop.expenses || [],
    shipments: prevShop.shipments || [],
    customers: prevShop.customers || [],
    profile: prevShop.profile || {
      shopName: shopName,
      ownerName: ownerName,
      phone: intlPhone,
    },
    createdAt: prevShop.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  // Persist under users/{phone}
  usersStore[intlPhone] = userAccount;
  const normPhone = normalizePhone(cleanPhone);
  if (normPhone && normPhone !== intlPhone) {
    usersStore[normPhone] = userAccount;
  }

  // Persist under shops/{store_id}
  shopsStore[generatedStoreId] = shopProfile;

  // Phone to shop mapping
  phoneToShopMap[intlPhone] = {
    shopId: generatedStoreId,
    role: userAccount.role,
    name: ownerName + " (ባለቤት)",
    pin: cleanPassword,
    permissions: ["all"],
    status: "active",
  };
  if (normPhone) {
    phoneToShopMap[normPhone] = phoneToShopMap[intlPhone];
  }

  persistDatabase();

  res.json({
    ok: true,
    message: "ተጠቃሚ እና ሱቅ በተሳካ ሁኔታ ተመዝግቧል",
    user: userAccount,
    shop: shopProfile,
  });
});

// Fetch isolated user data under users/{phone}
app.get("/api/users/:phone", (req, res) => {
  const phone = String(req.params.phone || "").trim().replace(/\s+/g, "");
  const intlPhone = toInternationalPhone(phone) || phone;
  const user = getUserByPhone(intlPhone) || getUserByPhone(phone);
  if (user) {
    const shop = getShopByStoreId(user.store_id);
    return res.json({ ok: true, phone: user.phone, user, shop, data: shop });
  }
  const norm = normalizePhone(phone);
  const mapped = phoneToShopMap[intlPhone] || phoneToShopMap[norm] || phoneToShopMap[phone];
  if (mapped && shopsStore[mapped.shopId]) {
    const shop = shopsStore[mapped.shopId];
    return res.json({ ok: true, phone: intlPhone || norm || phone, shop, data: shop });
  }
  res.status(404).json({ ok: false, error: "ለዚህ ስልክ ቁጥር የተመዘገበ ተጠቃሚ አልተገኘም" });
});

// Save isolated user data under users/{phone}
app.post("/api/users/:phone", (req, res) => {
  const phone = String(req.params.phone || "").trim().replace(/\s+/g, "");
  const intlPhone = toInternationalPhone(phone) || phone;
  const normPhone = normalizePhone(phone);
  if (!intlPhone) {
    return res.status(400).json({ ok: false, error: "ስልክ ቁጥር ያስፈልጋል" });
  }

  const payload = req.body || {};
  const sId = String(payload.store_id || payload.storeId || payload.shopId || ("store_" + intlPhone.replace(/\D/g, ""))).trim();
  const cleanOwnerPin = String(payload.password || payload.ownerPin || "").trim();
  const shopName = String(payload.name || (payload.profile && payload.profile.shopName) || "የእኔ ሱቅ").trim();
  const ownerName = String(payload.fullName || payload.name || (payload.profile && payload.profile.ownerName) || "የሱቅ ባለቤት").trim();

  const prevUser: Partial<UserAccount> = getUserByPhone(intlPhone) || {};
  const userAccount: UserAccount = {
    phone: intlPhone,
    password: cleanOwnerPin || prevUser.password || "",
    role: String(payload.role || prevUser.role || "owner"),
    store_id: sId,
    storeId: sId,
    isOwner: payload.isOwner !== undefined ? Boolean(payload.isOwner) : true,
    name: ownerName,
    fullName: ownerName,
    createdAt: prevUser.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  usersStore[intlPhone] = userAccount;
  if (normPhone && normPhone !== intlPhone) {
    usersStore[normPhone] = userAccount;
  }

  const prevShop: Partial<ShopProfile> = getShopByStoreId(sId) || {};
  const shopProfile: ShopProfile = {
    store_id: sId,
    shopId: sId,
    name: shopName,
    owner_phone: intlPhone,
    ownerPhoneNumber: intlPhone,
    owner_id: intlPhone,
    ownerPin: cleanOwnerPin || prevShop.ownerPin || "",
    employees: Array.isArray(payload.employees) ? payload.employees : (prevShop.employees || []),
    inventory: Array.isArray(payload.inventory) ? payload.inventory : (Array.isArray(payload.items) ? payload.items : (prevShop.inventory || [])),
    sales: Array.isArray(payload.sales) ? payload.sales : (prevShop.sales || []),
    expenses: Array.isArray(payload.expenses) ? payload.expenses : (prevShop.expenses || []),
    shipments: Array.isArray(payload.shipments) ? payload.shipments : (prevShop.shipments || []),
    customers: Array.isArray(payload.customers) ? payload.customers : (prevShop.customers || []),
    profile: (payload.profile && typeof payload.profile === "object") ? payload.profile : (prevShop.profile || { phone: intlPhone, shopName, ownerName }),
    createdAt: prevShop.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  shopsStore[sId] = shopProfile;

  phoneToShopMap[intlPhone] = {
    shopId: sId,
    role: "owner",
    name: shopName + " (ባለቤት)",
    pin: shopProfile.ownerPin || cleanOwnerPin,
    permissions: ["all"],
    status: "active",
  };
  if (normPhone) {
    phoneToShopMap[normPhone] = phoneToShopMap[intlPhone];
  }

  persistDatabase();

  res.json({
    ok: true,
    message: "የተጠቃሚው መረጃ በ users/" + intlPhone + " እና shops/" + sId + " ስር ተቀምጧል",
    user: userAccount,
    shop: shopProfile,
  });
});

// Update user profile (e.g. full_name on "ፕሮፋይል ማስተካከያ" page) directly targeting users/{phone}.full_name
app.post("/api/users/:phone/profile", (req, res) => {
  const phone = String(req.params.phone || "").trim().replace(/\s+/g, "");
  const intlPhone = toInternationalPhone(phone) || phone;
  const normPhone = normalizePhone(phone);
  if (!intlPhone) {
    return res.status(400).json({ ok: false, error: "ስልክ ቁጥር ያስፈልጋል" });
  }

  const { full_name, fullName, name, avatar } = req.body || {};
  const newName = String(full_name || fullName || name || "").trim();
  if (!newName) {
    return res.status(400).json({ ok: false, error: "ሙሉ ስም ያስፈልጋል" });
  }

  let user = getUserByPhone(intlPhone) || getUserByPhone(phone);
  if (user) {
    user.full_name = newName;
    user.fullName = newName;
    user.name = newName;
    user.updatedAt = Date.now();
    usersStore[intlPhone] = user;
    if (normPhone && normPhone !== intlPhone) {
      usersStore[normPhone] = user;
    }
    // Also sync shop profile ownerName
    const shop = getShopByStoreId(user.store_id);
    if (shop) {
      if (!shop.profile) shop.profile = {};
      shop.profile.ownerName = newName;
      if (avatar) shop.profile.managerPhoto = avatar;
      shop.updatedAt = Date.now();
    }
    persistDatabase();
    return res.json({ ok: true, message: "ሙሉ ስም በተሳካ ሁኔታ ተስተካክሏል", user, shop });
  }

  res.status(404).json({ ok: false, error: "ተጠቃሚ አልተገኘም" });
});

// Fetch shop details by store_id: shops/{store_id}
app.get("/api/shops/:storeId", (req, res) => {
  const sId = String(req.params.storeId || "").trim();
  const shop = getShopByStoreId(sId);
  if (shop) {
    return res.json({ ok: true, store_id: sId, shop });
  }
  res.status(404).json({ ok: false, error: "ይህ ሱቅ አልተገኘም" });
});

// Store-specific sales endpoint (multi-tenant isolation)
app.get("/api/sales", (req, res) => {
  const storeId = String(req.query.store_id || req.query.storeId || "").trim();
  if (!storeId) {
    return res.status(400).json({ ok: false, error: "store_id parameter is required" });
  }
  const shop = getShopByStoreId(storeId);
  const sales = (shop && Array.isArray(shop.sales))
    ? shop.sales.filter((s: any) => !s.store_id || s.store_id === storeId)
    : [];
  res.json({ ok: true, store_id: storeId, sales });
});

// Store-specific inventory endpoint (multi-tenant isolation)
app.get("/api/inventory", (req, res) => {
  const storeId = String(req.query.store_id || req.query.storeId || "").trim();
  if (!storeId) {
    return res.status(400).json({ ok: false, error: "store_id parameter is required" });
  }
  const shop = getShopByStoreId(storeId);
  const inventory = (shop && Array.isArray(shop.inventory))
    ? shop.inventory.filter((i: any) => !i.store_id || i.store_id === storeId)
    : [];
  res.json({ ok: true, store_id: storeId, inventory });
});

// Store-specific expenses endpoint (multi-tenant isolation)
app.get("/api/expenses", (req, res) => {
  const storeId = String(req.query.store_id || req.query.storeId || "").trim();
  if (!storeId) {
    return res.status(400).json({ ok: false, error: "store_id parameter is required" });
  }
  const shop = getShopByStoreId(storeId);
  const expenses = (shop && Array.isArray(shop.expenses))
    ? shop.expenses.filter((e: any) => !e.store_id || e.store_id === storeId)
    : [];
  res.json({ ok: true, store_id: storeId, expenses });
});

// Save/Update Shop Document with Owner Phone, PIN, and Employees
app.post("/api/shop/save", (req, res) => {
  const { shopId, store_id, storeId, name, ownerPhoneNumber, owner_phone, ownerPin, password, employees, inventory, sales, expenses, shipments, customers, profile } = req.body || {};
  const sId = String(store_id || storeId || shopId || "store_default").trim();
  const cleanOwnerPhone = String(owner_phone || ownerPhoneNumber || "").trim().replace(/\s+/g, "");
  const intlOwnerPhone = toInternationalPhone(cleanOwnerPhone) || cleanOwnerPhone;
  const normOwnerPhone = normalizePhone(cleanOwnerPhone);
  const cleanOwnerPin = String(password || ownerPin || "").trim();
  const shopName = String(name || "የእኔ ሱቅ").trim();

  const empList: EmployeeRecord[] = Array.isArray(employees)
    ? employees.map((emp: any) => ({
        id: String(emp.id || Math.random().toString(36).slice(2)),
        name: String(emp.name || "").trim(),
        phone: String(emp.phone || "").trim().replace(/\s+/g, ""),
        pin: String(emp.pin || "").trim(),
        role: String(emp.role || "cashier").trim(),
        permissions: Array.isArray(emp.permissions) ? emp.permissions : ["sales", "stock"],
        status: String(emp.status || "active").trim(),
        createdAt: Number(emp.createdAt || Date.now()),
      }))
    : (shopsStore[sId]?.employees || []);

  const prevShop: Partial<ShopProfile> = getShopByStoreId(sId) || {};

  const shopDoc: ShopProfile = {
    store_id: sId,
    shopId: sId,
    name: shopName,
    owner_phone: intlOwnerPhone || prevShop.owner_phone || "",
    ownerPhoneNumber: intlOwnerPhone || normOwnerPhone || prevShop.ownerPhoneNumber || "",
    owner_id: intlOwnerPhone || prevShop.owner_id || "",
    ownerPin: cleanOwnerPin || prevShop.ownerPin || "",
    employees: empList,
    inventory: Array.isArray(inventory) ? inventory : (prevShop.inventory || []),
    sales: Array.isArray(sales) ? sales : (prevShop.sales || []),
    expenses: Array.isArray(expenses) ? expenses : (prevShop.expenses || []),
    shipments: Array.isArray(shipments) ? shipments : (prevShop.shipments || []),
    customers: Array.isArray(customers) ? customers : (prevShop.customers || []),
    profile: (profile && typeof profile === "object") ? profile : (prevShop.profile || {}),
    createdAt: prevShop.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  shopsStore[sId] = shopDoc;

  // Persist under users/{phone}
  if (intlOwnerPhone) {
    const prevUser: Partial<UserAccount> = getUserByPhone(intlOwnerPhone) || {};
    const userAccount: UserAccount = {
      phone: intlOwnerPhone,
      password: cleanOwnerPin || prevUser.password || "",
      role: prevUser.role || "owner",
      store_id: sId,
      storeId: sId,
      isOwner: true,
      name: (profile && profile.ownerName) || prevUser.name || "የሱቅ ባለቤት",
      fullName: (profile && profile.ownerName) || prevUser.fullName || "የሱቅ ባለቤት",
      createdAt: prevUser.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    usersStore[intlOwnerPhone] = userAccount;
    if (normOwnerPhone && normOwnerPhone !== intlOwnerPhone) {
      usersStore[normOwnerPhone] = userAccount;
    }

    phoneToShopMap[intlOwnerPhone] = {
      shopId: sId,
      role: "owner",
      name: shopName + " (ባለቤት)",
      pin: cleanOwnerPin,
      permissions: ["all"],
      status: "active",
    };
    if (normOwnerPhone) {
      phoneToShopMap[normOwnerPhone] = phoneToShopMap[intlOwnerPhone];
    }
  }

  // Map each Employee
  empList.forEach((emp) => {
    if (emp.phone) {
      const mapping = {
        shopId: sId,
        role: emp.role,
        name: emp.name,
        pin: emp.pin,
        permissions: emp.permissions,
        status: emp.status || "active",
      };
      phoneToShopMap[emp.phone] = mapping;
      const intlEmp = toInternationalPhone(emp.phone);
      if (intlEmp) phoneToShopMap[intlEmp] = mapping;
      const normEmp = normalizePhone(emp.phone);
      if (normEmp) phoneToShopMap[normEmp] = mapping;
    }
  });

  persistDatabase();

  res.json({
    ok: true,
    message: "የሱቁ መረጃ እና የሰራተኞች መለያ በተሳካ ሁኔታ ተቀምጧል",
    shop: shopDoc,
  });
});

// Toggle Employee Block Status
app.post("/api/shop/employee/toggle-block", (req, res) => {
  const { shopId, employeeId, blocked } = req.body;
  const sId = String(shopId || "store_default").trim();
  const shop = getShopByStoreId(sId);
  if (shop) {
    const emp = shop.employees.find((e) => e.id === employeeId);
    if (emp) {
      emp.status = blocked ? "blocked" : "active";
      if (emp.phone && phoneToShopMap[emp.phone]) {
        phoneToShopMap[emp.phone].status = emp.status;
      }
      persistDatabase();
      return res.json({ ok: true, status: emp.status });
    }
  }
  res.json({ ok: true });
});

// Delete Employee from Shop
app.post("/api/shop/employee/delete", (req, res) => {
  const { shopId, employeeId } = req.body;
  const sId = String(shopId || "store_default").trim();
  const shop = getShopByStoreId(sId);
  if (shop) {
    const emp = shop.employees.find((e) => e.id === employeeId);
    if (emp && emp.phone) {
      delete phoneToShopMap[emp.phone];
      const intl = toInternationalPhone(emp.phone);
      if (intl) delete phoneToShopMap[intl];
    }
    shop.employees = shop.employees.filter((e) => e.id !== employeeId);
    persistDatabase();
  }
  res.json({ ok: true });
});

// Get Shop details by shopId
app.get("/api/shop/:shopId", (req, res) => {
  const sId = req.params.shopId;
  const shop = getShopByStoreId(sId);
  if (shop) {
    res.json({ ok: true, shop });
  } else {
    res.status(404).json({ ok: false, error: "ሱቅ አልተገኘም" });
  }
});

// Get Shop details by Phone Number (Account Recovery & Cloud Sync)
app.get("/api/shop/get-by-phone/:phone", (req, res) => {
  const cleanPhone = String(req.params.phone || "").trim().replace(/\s+/g, "");
  const intlPhone = toInternationalPhone(cleanPhone) || cleanPhone;
  const normPhone = normalizePhone(cleanPhone);
  const user = getUserByPhone(intlPhone) || getUserByPhone(cleanPhone);
  if (user && user.store_id) {
    const shop = getShopByStoreId(user.store_id);
    if (shop) return res.json({ ok: true, shop });
  }
  const mapped = phoneToShopMap[intlPhone] || phoneToShopMap[normPhone] || phoneToShopMap[cleanPhone];
  if (mapped && shopsStore[mapped.shopId]) {
    return res.json({ ok: true, shop: shopsStore[mapped.shopId] });
  }
  for (const sId in shopsStore) {
    const s = shopsStore[sId];
    if (
      phonesMatch(s.ownerPhoneNumber, cleanPhone) ||
      phonesMatch(s.owner_phone, cleanPhone) ||
      s.employees.some((e) => phonesMatch(e.phone, cleanPhone))
    ) {
      return res.json({ ok: true, shop: s });
    }
  }
  res.status(404).json({ ok: false, error: "ሱቅ አልተገኘም" });
});

// -------------------------------------------------------------
// 3. Login Verification Endpoint (/api/auth/phone-login)
// Checks the `users` collection (e.g. `users/+2519XXXXXXXX`) using the exact phone format
// -------------------------------------------------------------
app.post("/api/auth/phone-login", (req, res) => {
  const { phone, pin, password } = req.body || {};
  const cleanPhone = String(phone || "").trim().replace(/\s+/g, "");
  const intlPhone = toInternationalPhone(cleanPhone) || cleanPhone;
  const enteredPass = String(password || pin || "").trim();

  // 1. Primary check: users collection users/{phone}
  const userDoc = getUserByPhone(intlPhone) || getUserByPhone(cleanPhone);
  if (userDoc) {
    if (userDoc.password && userDoc.password === enteredPass) {
      const storeId = userDoc.store_id || userDoc.storeId || "";
      const shopDoc = getShopByStoreId(storeId);
      return res.json({
        ok: true,
        user: {
          phone: userDoc.phone,
          name: userDoc.name || userDoc.fullName || (shopDoc && shopDoc.name) || "የሱቅ ባለቤት",
          role: userDoc.role || "owner",
          isOwner: userDoc.isOwner !== undefined ? Boolean(userDoc.isOwner) : true,
          store_id: storeId,
          storeId: storeId,
          shopName: (shopDoc && shopDoc.name) || "የእኔ ሱቅ",
          permissions: ["all"],
        },
        shop: shopDoc || null,
      });
    }
    // Password mismatch on user document
    if (userDoc.password && userDoc.password !== enteredPass) {
      return res.status(401).json({ ok: false, error: "የተሳሳተ የይለፍ ቃል (Password) አስገብተዋል። እባክዎ እንደገና ይሞክሩ።" });
    }
  }

  // 2. Staff / Cashier PIN Login via phoneToShopMap
  const normPhone = normalizePhone(cleanPhone);
  const mappedUser = phoneToShopMap[intlPhone] || phoneToShopMap[normPhone] || phoneToShopMap[cleanPhone];
  if (mappedUser) {
    if (mappedUser.pin && mappedUser.pin === enteredPass) {
      if (mappedUser.status === "blocked" || mappedUser.status === "የታገደ") {
        return res.status(403).json({
          ok: false,
          error: "ይህ ሰራተኛ በባለቤቱ ታግዷል (Account is blocked)። እባክዎ ባለቤቱን ያነጋግሩ።",
        });
      }
      const shop = getShopByStoreId(mappedUser.shopId);
      return res.json({
        ok: true,
        user: {
          phone: intlPhone || cleanPhone,
          name: mappedUser.name,
          role: mappedUser.role,
          isOwner: mappedUser.role === "owner",
          store_id: mappedUser.shopId,
          storeId: mappedUser.shopId,
          shopName: shop ? shop.name : "",
          permissions: mappedUser.permissions || ["sales"],
        },
        shop: shop || null,
      });
    }
    return res.status(401).json({ ok: false, error: "የተሳሳተ ፒን (PIN) ኮድ አስገብተዋል።" });
  }

  // 3. Fallback: check across all shops
  for (const sId in shopsStore) {
    const shop = shopsStore[sId];
    if (
      (phonesMatch(shop.ownerPhoneNumber, cleanPhone) || phonesMatch(shop.owner_phone, cleanPhone) || phonesMatch(shop.owner_id, cleanPhone)) &&
      shop.ownerPin === enteredPass
    ) {
      return res.json({
        ok: true,
        user: {
          phone: intlPhone || shop.owner_phone || shop.ownerPhoneNumber || cleanPhone,
          name: shop.name + " (ባለቤት)",
          role: "owner",
          isOwner: true,
          store_id: shop.store_id || shop.shopId,
          storeId: shop.store_id || shop.shopId,
          shopName: shop.name,
          permissions: ["all"],
        },
        shop: shop,
      });
    }
    const emp = shop.employees?.find(
      (e) => (phonesMatch(e.phone, cleanPhone) || phonesMatch(e.phone, intlPhone)) && e.pin === enteredPass
    );
    if (emp) {
      if (emp.status === "blocked" || emp.status === "የታገደ") {
        return res.status(403).json({
          ok: false,
          error: "ይህ ሰራተኛ በባለቤቱ ታግዷል (Account is blocked)። እባክዎ ባለቤቱን ያነጋግሩ።",
        });
      }
      return res.json({
        ok: true,
        user: {
          phone: intlPhone || cleanPhone,
          name: emp.name,
          role: emp.role,
          isOwner: false,
          store_id: shop.store_id || shop.shopId,
          storeId: shop.store_id || shop.shopId,
          shopName: shop.name,
          permissions: emp.permissions || ["sales"],
        },
        shop: shop,
      });
    }
  }

  res.status(404).json({
    ok: false,
    error: "ይህ ስልክ ቁጥር አልተመዘገበም። እባክዎ በባለቤቱ ስልክ ቁጥር ወይም በሰራተኛ መለያ ይግቡ።",
  });
});

// Reset Password Endpoint (/api/auth/reset-password)
app.post("/api/auth/reset-password", (req, res) => {
  const { phone, newPassword, password } = req.body || {};
  const cleanPhone = String(phone || "").trim().replace(/\s+/g, "");
  const intlPhone = toInternationalPhone(cleanPhone) || cleanPhone;
  const normPhone = normalizePhone(cleanPhone);
  const cleanPass = String(newPassword || password || "").trim();

  if (!intlPhone || !cleanPass) {
    return res.status(400).json({ ok: false, error: "ስልክ ቁጥር እና አዲስ የይለፍ ቃል ያስፈልጋል" });
  }

  // Update in memory usersStore
  let userDoc = getUserByPhone(intlPhone) || getUserByPhone(cleanPhone) || getUserByPhone(normPhone);
  if (userDoc) {
    userDoc.password = cleanPass;
    userDoc.updatedAt = Date.now();
    usersStore[userDoc.phone || intlPhone] = userDoc;
  } else {
    const sId = "store_" + (intlPhone.replace(/\D/g, "") || Date.now());
    userDoc = {
      phone: intlPhone,
      password: cleanPass,
      role: "owner",
      store_id: sId,
      storeId: sId,
      isOwner: true,
      name: "የሱቅ ባለቤት",
      fullName: "የሱቅ ባለቤት",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    usersStore[intlPhone] = userDoc;
  }

  // Also update shop ownerPin if shop exists
  if (userDoc.store_id) {
    const shop = getShopByStoreId(userDoc.store_id);
    if (shop) {
      shop.ownerPin = cleanPass;
      shop.updatedAt = Date.now();
      shopsStore[userDoc.store_id] = shop;
    }
  }

  return res.json({ ok: true, message: "የይለፍ ቃል በተሳካ ሁኔታ ተቀይሯል" });
});

// Handle payload too large and other request parsing errors gracefully
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === "entity.too.large" || err.status === 413)) {
    return res.status(413).json({
      ok: false,
      error: "የመረጃው መጠን በጣም ትልቅ ነው (Payload too large)",
    });
  }
  next(err);
});

async function startServer() {
  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Gr/POS server running on port ${PORT}`);
    // Start background Telegram poller
    pollTelegramUpdates();
  });
}

startServer();
