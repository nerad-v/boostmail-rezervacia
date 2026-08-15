# Nasazení

Stránka běží na **https://boostmail.cz/termin/**

Obsluhuje ji Vercel projekt **`boostmail-rezervacia` v týmu `boostmail`**
(NE stejnojmenný projekt v týmu `boostmail1` — ten nemá doménu a je slepý).

## Nasazení změn

```bash
cd ~/Projects/agency/boostmail-rezervacia
vercel --prod --yes --scope boostmail
```

Složka je propojená správně (`.vercel/project.json` → `prj_YbDhnH3I5phJO73pCcQkQJyENRG8`).

## Ověření, že se změna propsala

```bash
curl -s https://boostmail.cz/termin/ | grep -oE 'styles.css\?v=[0-9]+'
```

Číslo verze se zvyšuje s každou změnou CSS — když sedí s repem, je nasazeno.

## Pozor

- Deploy z GitHubu se **neděje automaticky** — projekt není propojený s repem.
  Ideálně propojit: Vercel → boostmail-rezervacia → Settings → Git.
- `.vercelignore` drží mimo deploy složku `supabase/`, `get-google-token.mjs` a README.
- Backend (Supabase) běží nezávisle — změny v RPC funkcích jsou živé okamžitě, bez deploye.
