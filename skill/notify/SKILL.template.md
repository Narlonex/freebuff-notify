---
name: notify
description: Send the user a one-line Telegram ping when a task or plan is finished, when tests finish, when you need their decision or admin approval, or when something fails, so they do not have to watch the app.
---

# Notifikácie používateľovi

Používateľ nesedí pri počítači a chce vedieť, keď je práca hotová, keď potrebuje
rozhodnúť, alebo keď niečo zlyhalo. Pošli mu **jednu** krátku správu — stav a nič viac.

Platí to v **každom projekte**: skript aj prihlasovacie údaje sú mimo aktuálneho
projektu, takže nezáleží, v akom priečinku práve pracuješ.

## Príkaz

```bash
"{{NOTIFY_CMD}}" <done|blocked|approval|error|info|tests> [--channel tg|wsp|all]
```

- Cesta má medzeru → **vždy ju obal úvodzovkami**.
- Vždy `notify.cmd`, nikdy `notify.mjs` — cmd si správny priečinok nájde sám.
- Volaj ho z aktuálneho projektu; cesta je absolútna, takže funguje odkiaľkoľvek.
- `--channel` je voliteľný. Bez neho ide Telegram a pri jeho zlyhaní WhatsApp.
- Ak `notify.cmd` na tejto ceste neexistuje, priečinok sa presunul — nájdi
  `notify.cmd` s `notify.mjs` vedľa seba. Ak ho nenájdeš, notifikáciu vynechaj
  a v odpovedi to spomeň; nezakladaj nový projekt ani iný kanál.

### Kanál v príkaze

| Chceš | Príkaz |
|---|---|
| Telegram, pri zlyhaní WhatsApp (default) | `"{{NOTIFY_CMD}}" done` |
| len Telegram | `"{{NOTIFY_CMD}}" done --channel tg` |
| len WhatsApp | `"{{NOTIFY_CMD}}" done --channel wsp` |
| oba kanály naraz | `"{{NOTIFY_CMD}}" done --channel all` |

- `--channel` funguje pri **každom** stave rovnako:
  `blocked --channel wsp`, `info --channel all`,
  `tests --ok 42 --fail 0 --channel tg`, `--test --channel all`.
- Poradie defaultu sa dá otočiť cez `NOTIFY_PRIMARY=wsp` v `.env` — potom je
  primárny WhatsApp a záloha Telegram.
- Neznáma hodnota (napr. `--channel mail`) skončí `exit 1` a nič neodošle.

## Stavy

| Stav | Správa, ktorú používateľ dostane |
|---|---|
| `done` | ✅ Práca je dokončená. |
| `blocked` | ⏸️ Potrebujem tvoje rozhodnutie. |
| `approval` | 🔐 Potrebujem schválenie administrátora. |
| `error` | ❌ Práca zlyhala — potrebujem tvoj zásah. |
| `info` | ℹ️ Na vedomie. |
| `tests` | 🧪 Testy sú dokončené — bez chýb / nájdené X chyby. |

## Kedy poslať `done`

Ťah skončil a **nie je na čo čakať** — on nemá čo rozhodnúť. Patrí sem:

- **hotový plán** — rozbil si úlohu, navrhol postup a odovzdal ho. Aj keď sa ešte
  nič neimplementovalo, plán je dokončený → `done`.
- **hotový kód** — úpravy súborov, nová funkcia, refactor, oprava bugu.
- build/testy prešli, kontrola alebo analýza je hotová.

## Kedy poslať `blocked`

Ťah skončil, ale **ďalej sa nedá ísť bez toho, aby si on niečo vybral**:

- Freebuff zobrazí **poll / otázku „čo si vyberieme?“** — potrebuješ jeho hlas.
- Vypíšeš **viac možností** (2–3 varianty postupu, knižnice, dizajnu) a čakáš,
  ktorú máš zobrať.
- **Nejasné zadanie** — chýba informácia, ktorú vieš získať len od neho.
- Dve rovnocenné cesty a rozhodnutie má dopad, ktorý nechceš robiť sám.

> **Ak ťah končí otázkou alebo výberom možností, posielaj `blocked`, nikdy `done`.**
> Poslať `done` a zároveň sa pýtať je najčastejšia chyba — on z notifikácie
> nevidí, že na niečo čakáš.

### `blocked` vs `approval`

- `blocked` = stačí jeho **voľba** alebo názor (poll, variant, chýbajúca informácia).
- `approval` = treba **povolenie s dopadom** — deploy, mazanie dát, administrátorské
  oprávnenie, platba, zmena systému.

## Testy

Po spustení testov pošli jednu správu namiesto `done`/`error` — podľa počtov:

```bash
"{{NOTIFY_CMD}}" tests --ok 42 --fail 0
"{{NOTIFY_CMD}}" tests --ok 39 --fail 3
```

- bez chýb → „🧪 Testy sú dokončené — bez chýb (42 prešlo)“
- s chybami → „🧪 Testy sú dokončené — nájdené 3 chyby z 42“
- vždy vs. len pri chybách: `NOTIFY_TESTS=failures` v `.env` (default = posiela vždy)
- kanál sa dá vybrať aj tu: `"{{NOTIFY_CMD}}" tests --ok 42 --fail 0 --channel all`

## Kedy neposielať

- Jednoriadková odpoveď na otázku, vysvetlenie, pozdrav.
- Keď už v tomto ťahu notifikácia odišla — **max. 1 správa na ťah**.
- Keď je `NOTIFY_DISABLED=1` alebo používateľ povie, že pingy nechce.

## Detaily

Text za stav sa **neposiela** — používateľ nechce popisy. Iba ak o detail výslovne
požiada, pridaj krátku vetu:

```bash
"{{NOTIFY_CMD}}" blocked --detail "Mám dve možnosti, ktorú chceš?"
```

## Kanály

- **Telegram je primárny** — správa príde od bota, takže na telefóne naozaj
  cinkne v notifikačnom pásiku.
- **WhatsApp je automatická záloha** — použije sa len vtedy, keď Telegram zlyhá.
  (WhatsApp správa na vlastné číslo banner nikdy nezobrazí — preto je záloha.)
- Kombinácie kanálov sú v tabuľke vyššie: `--channel tg` = len Telegram,
  `--channel wsp` = len WhatsApp, `--channel all` = oba naraz.
- `NOTIFY_PRIMARY=wsp` v `.env` otočí poradie (primárny WhatsApp, záloha Telegram).

## Spoľahlivosť

- Skript **nikdy nezhodí ťah**: default `exit 0`, timeout 8 s na kanál.
- Pri zlyhaní **pokračuj v práci** — nerob retry a nespomínaj to používateľovi
  ako chybu.
- Skúška bez odoslania: `"{{NOTIFY_CMD}}" --dry-run done`.
- Reálna testovacia správa: `"{{NOTIFY_CMD}}" --test`.
- Každý pokus sa loguje do `notify.log` vedľa skriptu (bez tajomstiev).

## Bezpečnosť

- Token ani `chat_id` nikdy nevypisuj, neposielaj do chatu a nedávaj do projektu.
  Sú v `.env` v priečinku so skriptom a odtiaľ ich skript číta.
- Ak kanál nie je nastavený, neupravuj `.env` sám — povedz používateľovi,
  nech spustí `setup.cmd`.

## Nastavenie kanála

```bash
"{{NOTIFY_CMD}}" …  ← bežné používanie
```

Setup (Telegram + voliteľne WhatsApp):

```bash
setup.cmd
```

Skript si vypýta bot token, cez `getUpdates` zistí `chat_id`, voliteľne pridá
WhatsApp cez Green API, zapíše `.env`, vygeneruje tento skill s tvojou cestou
a pošle testovaciu správu. Bota vytvoríš v Telegrame cez `@BotFather` → `/newbot`.
