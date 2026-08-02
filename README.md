# BoostMail — SK rezervácia (custom Calendly)

Booking stránka pro SK kampaň (video → rezervace hovoru) + děkovná stránka.
Bez buildu — statické HTML/JS/CSS, backend Supabase (`dbnpjqsnzzuoeehlqref`).

## Soubory
- `index.html` — výběr termínu + kvalifikační formulář (SK)
- `dakujeme.html` — potvrzení: „zostáva posledný krok" + video + social proof
- `config.js` — **jediný soubor na editaci**: dostupnost, horizont, telefon
- `styles.css` — design tokens 1:1 z barber.boostmail.cz LP
- `supabase/functions/gcal-booking/` — edge function: rezervace → událost ve Vojtově Google kalendáři + pozvánka klientovi + Meet link

## Backend (hotovo, v produkci)
- Tabulka `sk_bookings` — RLS, anon bez přímého přístupu
- RPC `sk_create_booking` — validace + unique slot (žádný double-booking)
- RPC `sk_taken_slots` — vrací jen obsazené časy
- UTM/fbclid/referrer se ukládají ke každé rezervaci → atribuce kampaní

## Flow potvrzení a připomínek (plán)
1. **Potvrzení = Google pozvánka** (edge function výše): klient dostane nativní Google invite s Meet linkem, Vojtovi vznikne událost v kalendáři. Standard, co používá Cal.com/Calendly.
2. **Připomínky T-24h a T-2h** = SmartEmailing API šablona + Supabase cron (pg_cron → edge function projde nadcházející rezervace). SK texty, dynamická pole.

## GDPR
- **Žádný souhlasový checkbox u formuláře** — právní základ je čl. 6 odst. 1 písm. b) GDPR (opatření před uzavřením smlouvy na žádost subjektu). Souhlas by byl právně chybný: nesmí být podmínkou poskytnutí služby.
- Informační povinnost (čl. 13) plní text pod tlačítkem + `zasady-ochrany-udajov.html`.
- Doložitelnost (čl. 5 odst. 2): ke každé rezervaci se ukládá `privacy_version` + `privacy_accepted_at`.
- **Při úpravě zásad zvyš `PRIVACY_VERSION` v `config.js`.**

### Cookie lišta — OPT-OUT model (rozhodnutí Vojty 2. 8. 2026)
| Stav | Pixel + Clarity |
|---|---|
| před volbou | **měří** |
| „Rozumiem" | měří dál, lišta zmizí |
| „Nechcem" | okamžitě `fbq consent revoke` + `clarity stop`, smaže `_fbp/_fbc/_clck/_clsk`, při dalších návštěvách se skripty vůbec nenačtou |

Volba v `localStorage` pod `bm_consent_v1`. Zásady deklarují právní základ čl. 6 odst. 1 písm. f) (oprávněný zájem) + právo namítat.

⚠️ **Právní riziko, o kterém Vojta ví:** ePrivacy směrnice (a slovenský zákon o elektronických komunikáciách) vyžaduje pro marketingové/analytické cookies **předchozí** souhlas, ne opt-out. Vědomé obchodní rozhodnutí — reálné riziko je nízké (dozor typicky řeší po stížnosti, prvním krokem bývá výzva ke zjednání nápravy), ale existuje. Přepnutí na opt-in = 3 řádky v `consent.js` (přesunout `loadTracking()` do `close(true)`).

## Google kalendář — nastavení (jednorázově, ~10 min)

Edge function `gcal-booking` je **nasazená**. Chybí jí jen 3 secrets. Postup:

### 1) Google Cloud konzole (5 min)
1. [console.cloud.google.com](https://console.cloud.google.com) → nahoře **vybrat projekt → Nový projekt** → název `Boostmail` → *Vytvořit*
2. Vyhledat nahoře **„Google Calendar API"** → *Povolit*
3. Levé menu **APIs & Services → OAuth consent screen**
   - User type: **External** → *Create*
   - App name `Boostmail`, support e-mail i developer e-mail: `nerad@boostmail.cz` → uložit
   - Sekce **Audience → Test users → Add users** → přidat `nerad@boostmail.cz`
     *(stačí testovací režim, appku nemusíš publikovat)*
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs → *Add URI* → `http://localhost:8080/callback`
   - *Create* → zkopírovat **Client ID** a **Client Secret**

### 2) Vytáhnout refresh token (2 min)
```bash
node get-google-token.mjs
```
Skript se zeptá na Client ID a Secret, otevře prohlížeč (odklikni souhlas — u testovací
appky Google varuje „Google hasn't verified this app", dej *Advanced → Go to Boostmail*)
a do terminálu vypíše tři řádky `GOOGLE_*`.

### 3) Vložit secrets (1 min)
Supabase → **Edge Functions → gcal-booking → Secrets** → přidat všechny tři řádky.
Ověření: `curl https://dbnpjqsnzzuoeehlqref.supabase.co/functions/v1/gcal-booking -H "Authorization: Bearer <anon key>"`
→ musí vrátit `{"ok":true,"status":"připraveno"}`.

### 4) Zapnout webhook (1 min)
Supabase → **Database → Webhooks → Create a new hook**
- Table `sk_bookings`, Events **Insert**
- Type **Supabase Edge Functions** → `gcal-booking`
- HTTP Headers: `Authorization: Bearer <service_role key>`

Pak už každá rezervace: událost v tvém kalendáři + pozvánka klientovi + Meet link.

## Zbývá k ostrému spuštění
- [ ] Google secrets + webhook (návod výše)
- [ ] Připomínky T-24 h / T-2 h — **řeší Vojta ručně**
- [x] Video na děkovačku — Loom embed (`82dd929b...`)
- [x] Screenshot přehledu MNB (7 788 € / 90 dní) → `assets/proof-mnb.png`
- [x] Meta pixel `1914435695755760` (PageView + Schedule) — ověřeno reálnými requesty na `facebook.com/tr`
- [x] Clarity `xw8crd0abw` — ověřeno requestem na `h.clarity.ms/collect`
- [ ] Doména (návrh: `rezervacia.boostmail.cz`) + Vercel deploy
