# Pravidlá projektu

## Notifikácie používateľovi (Telegram)

Používateľ nesedí pri Rasdesk a chce vedieť, keď je práca hotová alebo keď ho potrebujem.
Po takomto ťahu mu pošli **jednu** krátku správu cez `notify.cmd` — stačí stav, netreba popisovať prácu.
Telegram je primárny kanál (na telefóne naozaj cinkne), WhatsApp je záloha.

### Stavy

| Stav | Správa, ktorú používateľ dostane |
|---|---|
| `done` | ✅ Práca je dokončená. |
| `blocked` | ⏸️ Potrebujem tvoje rozhodnutie. |
| `approval` | 🔐 Potrebujem schválenie administrátora. |
| `error` | ❌ Práca zlyhala — potrebujem tvoj zásah. |
| `info` | ℹ️ Na vedomie. |
| `tests` | 🧪 Testy sú dokončené — bez chýb / nájdené X chyby. |

### Kedy poslať

- **`done`** — dokončil si plán alebo kód: úpravy súborov, build, testy, refactor,
  alebo hotový plán (aj keď sa ešte nič neimplementovalo) — nie je na čo čakať.
- **`blocked`** — čakáš na jeho rozhodnutie: Freebuff poll „čo si vybrať“, zoznam
  možností, výber z variantov, nejasné zadanie. **Ak ťah končí otázkou alebo výberom
  možností, patrí sem `blocked`, nikdy `done`.**
- **`approval`** — niečo vyžaduje administrátorské/systémové oprávnenie alebo potvrdenie s dopadom
  (deploy, mazanie dát, platba) — na rozdiel od `blocked`, kde stačí jeho voľba.
- **`error`** — build/test zlyhal, alebo sa úloha nedá dokončiť.
- **`info`** — čokoľvek iné, čo ho má zastihnúť.

### Testy

Po spustení testov pošli jednu správu namiesto `done`/`error` — podľa počtov:

```bash
"C:\Users\PC\Desktop\Projects\message bot\notify.cmd" tests --ok 42 --fail 0
"C:\Users\PC\Desktop\Projects\message bot\notify.cmd" tests --ok 39 --fail 3
```

- bez chýb → „🧪 Testy sú dokončené — bez chýb (42 prešlo)“
- s chybami → „🧪 Testy sú dokončené — nájdené 3 chyby z 42“
- vždy vs. len pri chybách: `NOTIFY_TESTS=failures` v `.env` (default = posiela vždy)

### Kedy neposielať

- Jednoriadková odpoveď na otázku, vysvetlenie, „ahoj".
- Keď už v tomto ťahu notifikácia odišla — **max. 1 správa na ťah**.
- Keď je `NOTIFY_DISABLED=1` alebo používateľ povie, že nechce pingy.

### Ako

```bash
"C:\Users\PC\Desktop\Projects\message bot\notify.cmd" done
"C:\Users\PC\Desktop\Projects\message bot\notify.cmd" blocked
"C:\Users\PC\Desktop\Projects\message bot\notify.cmd" approval
"C:\Users\PC\Desktop\Projects\message bot\notify.cmd" error
```

Cesta má medzeru — **vždy ju obal úvodzovkami** a vždy volaj `notify.cmd`, nie `notify.mjs`.
Text za stav sa **neposiela** (používateľ nechce popisy). Iba ak o detail výslovne požiada,
pridaj `--detail "krátka veta"`.

### Spoľahlivosť

- Skript nikdy nezhodí ťah (default `exit 0`, timeout 8 s). Pri zlyhaní notifikácie
  **pokračuj v odpovedi** — nerob retry a nespomínaj to používateľovi ako chybu.
- Skúška bez odoslania: `"...\notify.cmd" --dry-run done`.
- Reálne odoslania sa logujú do `notify.log` v priečinku `message bot`.
