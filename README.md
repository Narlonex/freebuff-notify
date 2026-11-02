# notify — phone notifications from your AI agent

One short message to your phone when the agent finishes work, needs a decision,
approval, or when tests finish. **Telegram is the primary channel** (it really
rings in the notification bar), **WhatsApp is an automatic backup**.

Works from any project: the script and credentials live in one folder, and the
included skill tells your AI agent when and how to call it.

- Zero dependencies: Node.js built-in `fetch` only.
- One message per turn by design — no spam.
- Never breaks your build: always exits 0 (unless you pass `--strict`).
- Secrets stay in `.env`, which is ignored by git.

---

## Requirements

- **Windows** (the `.cmd` wrappers and double-click setup are Windows only).
  On macOS/Linux call `node notify.mjs …` directly.
- **Node.js 18+** — check with `node -v`.

---

## Quick start (3 steps)

1. Clone the repo (or download the ZIP):
   `git clone https://github.com/Narlonex/freebuff-notify.git`
2. Double-click **`setup.cmd`**.
3. Open the generated **`skill/notify/SKILL.md`** and paste its contents into **Freebuff → Skills** (or your client’s Skills panel).

That is the whole setup. The wizard configures Telegram, optionally WhatsApp,
writes `.env`, generates the skill file with your real path and sends a test
notification.

---

## Step 1 — Telegram bot (required)

The setup wizard guides you, but here is what happens:

1. In Telegram search for **@BotFather** (official account, blue checkmark).
2. Send `/newbot`, choose a display name, then a username ending with `bot`
   (e.g. `my_notify_bot`).
3. BotFather replies with a token like `7123456789:AAH...`. Copy it.
4. Run `setup.cmd` and paste the token.
5. Open your new bot in Telegram and press **Start** — a bot cannot message you first.
6. The wizard detects your `chat_id`, saves it and sends a test message.

> Why a bot? A message from your own WhatsApp account never shows a banner
> (you are the sender). A bot is a different account, so the notification
> actually pops up. That is why Telegram is primary.

---

## Step 2 — WhatsApp backup (optional)

Only needed if you want a fallback when Telegram is unreachable.

1. Create an account at [green-api.com](https://green-api.com).
2. Create an instance, copy **idInstance** and **apiToken**.
3. In the instance, scan the QR code with WhatsApp → **Linked devices**.
4. Run `setup.cmd` again (or answer `y` when asked) and enter the instance id,
   token and your phone number with country code, e.g. `421900000000`.

The wizard derives the chat id (`421900000000@c.us`), checks the instance state
and sends a test message. If the instance is not authorized yet, the state is
reported at send time and Telegram still covers you.

### Adding WhatsApp later

You do not have to configure WhatsApp now. Run `setup.cmd` again at any time:

- it shows your existing Telegram chat id — press **Enter** to keep it,
- then it asks about WhatsApp — press **Enter** to skip, or `y` to add it.

Non-interactive equivalent:

```bat
setup.cmd --whatsapp-only --whatsapp-instance 1101XXXX --whatsapp-token TOKEN --whatsapp-phone 421900000000
```

`--whatsapp-only` keeps the Telegram values already in `.env`.

---

## Usage

```bat
notify.cmd done
notify.cmd blocked
notify.cmd approval
notify.cmd error
notify.cmd info
notify.cmd tests --ok 42 --fail 0
```

| Status | Message you receive |
|---|---|
| `done` | ✅ Práca je dokončená. |
| `blocked` | ⏸️ Potrebujem tvoje rozhodnutie. |
| `approval` | 🔐 Potrebujem schválenie administrátora. |
| `error` | ❌ Práca zlyhala — potrebujem tvoj zásah. |
| `info` | ℹ️ Na vedomie. |
| `tests` | 🧪 Testy sú dokončené — bez chýb / nájdené X chyby. |

Messages are intentionally one fixed sentence per status, followed by the
project folder name and time. No work descriptions.

### Channels

| You want | Command |
|---|---|
| Telegram, WhatsApp only if Telegram fails (default) | `notify.cmd done` |
| Telegram only | `notify.cmd done --channel tg` |
| WhatsApp only | `notify.cmd done --channel wsp` |
| Both at once | `notify.cmd done --channel all` |

Set `NOTIFY_PRIMARY=wsp` in `.env` to swap the default order.

### Flags

| Flag | Effect |
|---|---|
| `--channel tg\|wsp\|all` | pick channel(s); works with every status |
| `--detail "short text"` | append your own sentence (off by default) |
| `--dry-run`, `-n` | print the message and plan, send nothing |
| `--test` | send a real test message |
| `--strict` | exit 1 when nothing was sent (default: always 0) |
| `--help`, `-h` | usage |

### Test results

```bat
notify.cmd tests --ok 42 --fail 0
notify.cmd tests --ok 39 --fail 3
```

| Input | Message |
|---|---|
| `--ok 42 --fail 0` | 🧪 Testy sú dokončené — bez chýb (42 prešlo). |
| `--ok 39 --fail 3` | 🧪 Testy sú dokončené — nájdené 3 chyby z 42. |
| `--fail 1` | 🧪 Testy sú dokončené — nájdená 1 chyba z 1. |
| `--fail 12` | 🧪 Testy sú dokončené — nájdených 12 chýb z 12. |
| no counts | 🧪 Testy sú dokončené. |

By default the test message is sent even when everything is green. Set
`NOTIFY_TESTS=failures` in `.env` to be notified only when something fails.

---

## Use it as an AI skill

`skill/notify/SKILL.template.md` is the source; `setup.cmd` generates
`skill/notify/SKILL.md` with your absolute path filled in.

1. Open your AI client's **Skills** panel.
2. Add the generated `skill/notify/SKILL.md` (paste its contents or import the file).
3. Done — from now on the agent uses it in **every project**: it knows the
   command, the statuses, when to send `done` vs `blocked`, and the test format.

The skill contains one important rule: if a turn ends with a question or a list
of options, it sends `blocked` (not `done`), so you know it is waiting for you.

If you regenerate the skill later (new folder), re-paste it — the path changed.

---

## Configuration (`.env`)

`.env` is created by the wizard and never committed.

| Variable | Meaning |
|---|---|
| `TELEGRAM_BOT_TOKEN` | bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | detected automatically |
| `GREENAPI_ID_INSTANCE` | Green API instance id (WhatsApp backup) |
| `GREENAPI_API_TOKEN` | Green API token |
| `GREENAPI_CHAT_ID` | your number, e.g. `421900000000@c.us` |
| `NOTIFY_PRIMARY` | `tg` (default) or `wsp` — order of the default channel |
| `NOTIFY_TESTS` | `always` (default) or `failures` |
| `NOTIFY_DISABLED` | `1` disables sending entirely |
| `NOTIFY_PROJECT` | override project name shown in the message |
| `TELEGRAM_BASE_URL`, `GREENAPI_BASE_URL` | debug only |

---

## How it works

| File | Purpose |
|---|---|
| `notify.mjs` | the notifier: builds the sentence, sends, logs |
| `notify.cmd` | wrapper so it can be called from any folder |
| `setup.mjs` / `setup.cmd` | interactive setup, writes `.env`, generates the skill |
| `skill/notify/SKILL.template.md` | skill template with `{{NOTIFY_CMD}}` |
| `skill/notify/SKILL.md` | generated, path filled in (ignored by git) |
| `.env` | your credentials (ignored by git) |
| `notify.log` | JSONL log of attempts (ignored by git) |

Each send is logged with channel results, e.g.
`{"status":"done","channels":{"tg":{"ok":true}},"sent":["tg"]}` — no tokens.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| nothing sent, `not_configured` | missing `.env` values | run `setup.cmd` |
| `tg: http_401` / `http_404` | wrong or revoked bot token | get a new token from @BotFather, run setup |
| `tg: http_400 … chat not found` | you never pressed Start | open the bot, press Start, run setup again |
| message arrives but no banner | chat muted | open the bot → chat settings → notifications |
| `wsp: state_notAuthorized` | WhatsApp instance not linked | Green API → scan QR (Linked devices) |
| `wsp: http_401` | wrong Green API token | copy `apiToken` again |
| `timeout` / `network` | no internet or API down | other channel takes over |
| exit 0 but nothing arrived | by design: notifications are best effort | check `notify.log` |

`notify.cmd --dry-run done` prints exactly what would be sent, including which
channels are configured.

---

## Security — publishing to GitHub

Nothing secret is tracked in this repository:

- `.env` is ignored by git — that is the only place tokens live.
- `notify.log` and the generated `skill/notify/SKILL.md` are ignored too.
- The script never prints tokens and never writes them to the log.

Before you push, verify:

```bat
git status --porcelain
git check-ignore -v .env
```

`git check-ignore` must print a match. If you ever committed a token by mistake:
revoke it (@BotFather → `/revoke`, or Green API console), then rotate `.env`
and rewrite history (`git filter-repo`) before pushing.

A friend who downloads the repo only needs to run `setup.cmd` and paste **his**
bot token (and optionally his phone number for WhatsApp) — nothing else.
