// ============================================================
// BoostMail — SK rezervačný systém (custom Calendly)
// Konfigurácia — TOHLE je jediný soubor, který Vojta edituje
// ============================================================

export const SUPABASE_URL = "https://dbnpjqsnzzuoeehlqref.supabase.co";
export const SUPABASE_KEY = "sb_publishable_qYVR_vi2Utwy3rjoy-Y_gg_4P2i_UGP";

// Délka hovoru (min) — jen informativní, slot_end počítá backend (15 min)
export const CALL_MINUTES = 15;

// Kolik dní dopředu jde rezervovat
export const HORIZON_DAYS = 14;

// Minimální předstih rezervace (hodiny) — backend vynucuje 2 h, tady UX limit
export const MIN_NOTICE_HOURS = 4;

// Krok slotů v minutách
export const SLOT_STEP_MIN = 30;

// ⚠️ DOSTUPNOST — dle Vojty 2.8.: dopoledne do 12:00, odpoledne od 15:00
// dows: 0=Ne, 1=Po, 2=Út, 3=St, 4=Čt, 5=Pá, 6=So · časy = Europe/Bratislava
export const AVAILABILITY = [
  { dows: [1, 2, 3, 4, 5], from: "09:00", to: "12:00" }, // dopoledne do 12
  { dows: [1, 2, 3, 4, 5], from: "15:00", to: "21:30" }, // od 15:00 dál (Calendly clone taky bez víkendů)
];

// Ručně blokované dny (dovolená atd.) — formát "YYYY-MM-DD"
export const BLOCKED_DAYS = [];

// Telefon, ze kterého Vojta volá (děkovná stránka + ICS)
export const VOJTA_PHONE = "+420 739 192 790";

// Verze zásad ochrany údajů — ukládá se ke každé rezervaci (GDPR čl. 5 odst. 2, doložitelnost).
// ⚠️ Při každé úpravě zasady-ochrany-udajov.html zvyš datum.
export const PRIVACY_VERSION = "2026-08-02";

// ---- Měření (načte se AŽ po souhlasu v cookie liště) ----
// Meta Pixel — stejný, jaký běží na barber.boostmail.cz LP (vč. Calendly varianty).
export const META_PIXEL_ID = "1914435695755760";

// Microsoft Clarity — projekt pro SK rezervační stránku
export const CLARITY_ID = "xw8crd0abw";
