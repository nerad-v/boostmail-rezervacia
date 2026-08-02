// ============================================================
// Cookie lišta + měřicí skripty — OPT-OUT model (rozhodnutí Vojty 2. 8. 2026)
//
// Logika:
//   · žádná volba zatím → MĚŘÍME (pixel + Clarity běží hned)
//   · „Rozumiem"        → měříme dál, lišta zmizí
//   · „Nechcem"         → měření OKAMŽITĚ zastavíme, smažeme cookies,
//                          a při dalších návštěvách se už nenačte
//
// ⚠️ POUČENÍ Z CZ VLNY: stará lišta překrývala CTA a byla nejklikanější
// prvek stránky. Tahle je slim (~47 px, jeden řádek) a <body> dostane
// padding-bottom o její výšku → nepřekrývá NIC.
// ============================================================

import { META_PIXEL_ID, CLARITY_ID, PRIVACY_VERSION } from "./config.js";

const KEY = "bm_consent_v1";
const stored = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };

// ---------- měřicí skripty ----------
function loadTracking() {
  if (META_PIXEL_ID && !window.fbq) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq("init", META_PIXEL_ID);
    window.fbq("track", "PageView");
    if (window.BM_TRACK_SCHEDULE) window.fbq("track", "Schedule");
  }
  if (CLARITY_ID && !window.clarity) {
    /* eslint-disable */
    (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script",CLARITY_ID);
    /* eslint-enable */
  }
}

// ---------- zastavení měření po odmítnutí ----------
function stopTracking() {
  try { if (window.fbq) window.fbq("consent", "revoke"); } catch {}
  try { if (window.clarity) { window.clarity("consent", false); window.clarity("stop"); } } catch {}
  // smaž cookies, které už stihly vzniknout
  const host = location.hostname;
  const domains = [host, "." + host, "." + host.split(".").slice(-2).join(".")];
  for (const name of ["_fbp", "_fbc", "_clck", "_clsk", "CLID", "MUID"]) {
    for (const d of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${d}`;
    }
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

// veřejné API (děkovačka může volat bmTrack('Schedule'))
window.bmTrack = (event) => {
  const s = stored();
  if (s && s.granted === false) return;
  if (window.fbq) window.fbq("track", event);
};

// ---------- lišta ----------
function showBar() {
  const bar = document.createElement("div");
  bar.className = "ck";
  bar.innerHTML = `
    <span class="ck-t">Cookies na meranie reklám. <a href="zasady-ochrany-udajov.html" target="_blank" rel="noopener">Viac</a></span>
    <span class="ck-b">
      <button type="button" class="ck-no">Nechcem</button>
      <button type="button" class="ck-ok">Rozumiem</button>
    </span>`;
  document.body.appendChild(bar);

  // nic nepřekrývat: odsadit obsah o reálnou výšku lišty
  const pad = () => { document.body.style.paddingBottom = bar.offsetHeight + "px"; };
  pad();
  window.addEventListener("resize", pad);

  const close = (granted) => {
    localStorage.setItem(KEY, JSON.stringify({ granted, v: PRIVACY_VERSION, at: new Date().toISOString() }));
    bar.remove();
    document.body.style.paddingBottom = "";
    if (!granted) stopTracking();
  };
  bar.querySelector(".ck-ok").onclick = () => close(true);
  bar.querySelector(".ck-no").onclick = () => close(false);
}

// ---------- init ----------
const s = stored();
if (s && s.granted === false) {
  // dřív odmítl → neměříme vůbec, lištu neukazujeme
} else {
  loadTracking(); // měříme hned (i před volbou)
  if (s === null) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showBar);
    else showBar();
  }
}
