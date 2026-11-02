#!/usr/bin/env node
/**
 * notify.mjs — pošle krátku notifikáciu na WhatsApp (Green API) a Telegram.
 *
 * Správa je vždy jedna hotová veta podľa stavu — žiadne opisy práce.
 *
 * Použitie:
 *   node notify.mjs done        ✅ Práca je dokončená.
 *   node notify.mjs blocked     ⏸️ Potrebujem tvoje rozhodnutie.
 *   node notify.mjs approval    🔐 Potrebujem schválenie administrátora.
 *   node notify.mjs error       ❌ Práca zlyhala — potrebujem tvoj zásah.
 *   node notify.mjs info        ℹ️ Na vedomie.
 *   node notify.mjs tests --ok 42 --fail 0   🧪 Testy sú dokončené — bez chýb (42 prešlo).
 *   node notify.mjs tests --fail 3           🧪 Testy sú dokončené — nájdené 3 chyby.
 *
 * Prepínače:
 *   --detail            priloží aj vlastný text za vetu (default sa neposiela)
 *   --dry-run, -n       nič nepošle, len vypíše, čo by odoslal
 *   --test              pošle reálnu testovaciu správu
 *   --channel <tg|wsp|all>
 *                       tg (default) = Telegram, pri zlyhaní WhatsApp
 *                       wsp = len WhatsApp, all = oba naraz
 *   --strict            pri neodoslaní vráti exit kód 1 (default: vždy 0)
 *   --help, -h          pomoc
 *
 * Zásada: skript NIKDY nezhodí volajúci proces — defaultne vždy končí s exit 0.
 * Kredencie sa čítajú z .env vedľa tohto súboru (alebo z premenných prostredia,
 * tie majú prednosť). Tajomstvá sa nikdy nevypisujú.
 */

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(HERE, ".env");
const LOG_FILE = resolve(HERE, "notify.log");
const TIMEOUT_MS = 8000;
const MAX_DETAIL = 400;

/** Hotové vety — jedna správa má byť zrozumiteľná na prvý pohľad. */
const STATUS = {
  done: { emoji: "✅", line: "Práca je dokončená." },
  blocked: { emoji: "⏸️", line: "Potrebujem tvoje rozhodnutie." },
  approval: { emoji: "🔐", line: "Potrebujem schválenie administrátora." },
  error: { emoji: "❌", line: "Práca zlyhala — potrebujem tvoj zásah." },
  info: { emoji: "ℹ️", line: "Na vedomie." },
  tests: { emoji: "🧪", line: "Testy sú dokončené." },
};

// ---------- konfigurácia ----------

function loadEnvFile() {
  const out = {};
  if (!existsSync(ENV_FILE)) return out;
  let raw = "";
  try {
    raw = readFileSync(ENV_FILE, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

const fileEnv = loadEnvFile();

/** Premenná prostredia má prednosť pred .env (umožňuje override pri ladení). */
function cfg(key) {
  const fromProcess = process.env[key];
  if (fromProcess !== undefined && fromProcess !== "") return fromProcess;
  return fileEnv[key] ?? "";
}

/** Kanál je pripravený, len ak má vyplnené všetky potrebné údaje. */
function whatsappReady() {
  return Boolean(cfg("GREENAPI_ID_INSTANCE") && cfg("GREENAPI_API_TOKEN") && cfg("GREENAPI_CHAT_ID"));
}

function telegramReady() {
  return Boolean(cfg("TELEGRAM_BOT_TOKEN") && cfg("TELEGRAM_CHAT_ID"));
}

// ---------- argumenty ----------

const USAGE = `Použitie: node notify.mjs <done|blocked|approval|error|info|tests> [prepínače]

Stavy:
  done       ✅ Práca je dokončená.
  blocked    ⏸️ Potrebujem tvoje rozhodnutie.
  approval   🔐 Potrebujem schválenie administrátora.
  error      ❌ Práca zlyhala — potrebujem tvoj zásah.
  info       ℹ️ Na vedomie.
  tests      🧪 Testy sú dokončené — podľa --ok / --fail.

Prepínače:
  --ok N                   počet prešlých testov (stav tests)
  --fail N                 počet zlyhaných testov (stav tests)
  --detail                 priloží aj vlastný text za vetu (default sa neposiela)
  --dry-run, -n            nič nepošle, len vypíše plán
  --test                   pošle reálnu testovaciu správu
  --channel <tg|wsp|all>   tg (default, s WhatsApp fallbackom) | wsp | all
  --strict                 pri neodoslaní exit kód 1
  --help, -h               táto pomoc

Príklady:
  node notify.mjs done
  node notify.mjs blocked
  node notify.mjs tests --ok 42 --fail 0
  node notify.mjs tests --ok 39 --fail 3
  node notify.mjs --dry-run approval`;

/** Počet testov z argumentu; nezmysel → null (správa ostane všeobecná). */
function toCount(value) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Slovenské skloňovanie pre počet chýb. */
function chybyPhrase(n) {
  if (n === 1) return "nájdená 1 chyba";
  if (n >= 2 && n <= 4) return `nájdené ${n} chyby`;
  return `nájdených ${n} chýb`;
}

function parseArgs(argv) {
  const flags = {
    dryRun: false,
    test: false,
    strict: false,
    help: false,
    detail: false,
    channel: null,
    ok: null,
    fail: null,
  };
  const words = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run" || arg === "-n") {
      flags.dryRun = true;
    } else if (arg === "--test") {
      flags.test = true;
    } else if (arg === "--strict") {
      flags.strict = true;
    } else if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--detail") {
      flags.detail = true;
    } else if (arg === "--ok" || arg === "--passed") {
      flags.ok = toCount(argv[++i]);
    } else if (arg === "--fail" || arg === "--failed") {
      flags.fail = toCount(argv[++i]);
    } else if (arg.startsWith("--ok=")) {
      flags.ok = toCount(arg.slice("--ok=".length));
    } else if (arg.startsWith("--fail=")) {
      flags.fail = toCount(arg.slice("--fail=".length));
    } else if (arg === "--channel" || arg === "-c") {
      flags.channel = String(argv[++i] ?? "").toLowerCase();
    } else if (arg.startsWith("--channel=")) {
      flags.channel = arg.slice("--channel=".length).toLowerCase();
    } else {
      words.push(arg);
    }
  }
  if (flags.channel && !["wsp", "tg", "all"].includes(flags.channel)) {
    flags.channel = null;
    flags.badChannel = true;
  }
  return { flags, words };
}

// ---------- správa ----------

function buildMessage(status, detail, counts = {}) {
  const meta = STATUS[status] ?? STATUS.info;
  const project = cfg("NOTIFY_PROJECT") || basename(process.cwd()) || "projekt";
  const now = new Date().toLocaleString("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  let head = `${meta.emoji} ${meta.line}`;
  if (status === "tests") {
    const ok = counts.ok;
    const fail = counts.fail;
    const total = (ok ?? 0) + (fail ?? 0);
    if (typeof fail === "number" && fail > 0) {
      head = `${meta.emoji} Testy sú dokončené — ${chybyPhrase(fail)}${total ? ` z ${total}` : ""}.`;
    } else if (fail === 0) {
      head = `${meta.emoji} Testy sú dokončené — bez chýb${ok ? ` (${ok} prešlo)` : ""}.`;
    }
  }

  const lines = [head];
  if (detail) {
    const trimmed = detail.trim();
    if (trimmed) {
      const body = trimmed.length > MAX_DETAIL ? `${trimmed.slice(0, MAX_DETAIL - 1).trimEnd()}…` : trimmed;
      lines.push("", body);
    }
  }
  lines.push("", `${project} · ${now}`);
  return lines.join("\n");
}

// ---------- odosielanie ----------

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    /* odpoveď nemusí byť JSON */
  }
  return { response, data, raw };
}

function describeError(error) {
  const name = error?.name ?? "";
  if (name === "TimeoutError" || name === "AbortError") return "timeout";
  return `network: ${String(error?.message ?? error).slice(0, 200)}`;
}

/**
 * Green API prijme správu aj vtedy, keď inštancia nie je prepojená s WhatsAppom —
 * vráti ID, ale nič nedoručí. Preto sa stav overuje dopredu; pri inom stave než
 * "authorized" sa nepokúšame posielať a správu prevezme Telegram.
 */
async function whatsappState() {
  const base = (cfg("GREENAPI_BASE_URL") || "https://api.green-api.com").replace(/\/+$/, "");
  const instance = encodeURIComponent(cfg("GREENAPI_ID_INSTANCE"));
  const token = encodeURIComponent(cfg("GREENAPI_API_TOKEN"));
  try {
    const response = await fetch(`${base}/waInstance${instance}/getStateInstance/${token}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null; // stav nezistíme — skúsime poslať
    const data = await response.json().catch(() => null);
    return data?.stateInstance ?? null;
  } catch {
    return null;
  }
}

async function sendWhatsApp(message) {
  if (!whatsappReady()) {
    return {
      ok: false,
      code: "not_configured",
      detail: "chýba GREENAPI_ID_INSTANCE / GREENAPI_API_TOKEN / GREENAPI_CHAT_ID",
    };
  }
  const state = await whatsappState();
  if (state && state !== "authorized") {
    return {
      ok: false,
      code: `state_${state}`,
      detail: "inštancia nie je prepojená s WhatsAppom — naskenuj QR v Green API",
    };
  }
  const base = (cfg("GREENAPI_BASE_URL") || "https://api.green-api.com").replace(/\/+$/, "");
  const instance = encodeURIComponent(cfg("GREENAPI_ID_INSTANCE"));
  const token = encodeURIComponent(cfg("GREENAPI_API_TOKEN"));
  const url = `${base}/waInstance${instance}/sendMessage/${token}`;
  try {
    const { response, data, raw } = await postJson(url, {
      chatId: cfg("GREENAPI_CHAT_ID"),
      message,
    });
    if (!response.ok) return { ok: false, code: `http_${response.status}`, detail: raw.slice(0, 300) };
    if (!data?.idMessage) return { ok: false, code: "unexpected_response", detail: raw.slice(0, 300) };
    return { ok: true, code: "sent", detail: String(data.idMessage) };
  } catch (error) {
    return { ok: false, code: describeError(error), detail: "" };
  }
}

async function sendTelegram(message) {
  if (!telegramReady()) {
    return { ok: false, code: "not_configured", detail: "chýba TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID" };
  }
  const base = (cfg("TELEGRAM_BASE_URL") || "https://api.telegram.org").replace(/\/+$/, "");
  const url = `${base}/bot${cfg("TELEGRAM_BOT_TOKEN")}/sendMessage`;
  try {
    const { response, data, raw } = await postJson(url, {
      chat_id: cfg("TELEGRAM_CHAT_ID"),
      text: message,
      disable_web_page_preview: true,
    });
    if (!response.ok || data?.ok !== true) {
      return { ok: false, code: `http_${response.status}`, detail: raw.slice(0, 300) };
    }
    return { ok: true, code: "sent", detail: String(data?.result?.message_id ?? "") };
  } catch (error) {
    return { ok: false, code: describeError(error), detail: "" };
  }
}

async function dispatch(message, channel) {
  const results = {};
  if (channel === "all") {
    const [tg, wsp] = await Promise.all([sendTelegram(message), sendWhatsApp(message)]);
    results.tg = tg;
    results.wsp = wsp;
    return results;
  }
  if (channel === "tg" || channel === "wsp") {
    const result = channel === "tg" ? await sendTelegram(message) : await sendWhatsApp(message);
    results[channel] = result;
    return results;
  }
  // Bez --channel: Telegram (na telefóne naozaj cinkne), pri zlyhaní WhatsApp.
  // NOTIFY_PRIMARY=wsp poradie otočí.
  const order = cfg("NOTIFY_PRIMARY") === "wsp" ? ["wsp", "tg"] : ["tg", "wsp"];
  for (const name of order) {
    const result = name === "tg" ? await sendTelegram(message) : await sendWhatsApp(message);
    results[name] = result;
    if (result.ok) break; // druhý kanál skúšame len vtedy, keď prvý zlyhal
  }
  return results;
}

// ---------- log ----------

function writeLog(entry) {
  try {
    appendFileSync(LOG_FILE, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, "utf8");
  } catch {
    /* log nesmie zabiť notifikáciu */
  }
}

// ---------- main ----------

async function main() {
  const { flags, words } = parseArgs(process.argv.slice(2));

  if (flags.help) {
    console.log(USAGE);
    return 0;
  }

  if (flags.badChannel) {
    console.log(`⚠️  Neznámy kanál v --channel. Povolené: wsp, tg, all.\n\n${USAGE}`);
    return 1;
  }

  if (cfg("NOTIFY_DISABLED") === "1") {
    console.log("ℹ️  Notifikácie sú vypnuté (NOTIFY_DISABLED=1).");
    return 0;
  }

  // Bez argumentov a bez prepínača nemá zmysel nič posielať.
  if (!words.length && !flags.test && !flags.dryRun) {
    console.log(USAGE);
    return 0;
  }

  let status = "info";
  if (words.length && STATUS[words[0]]) status = words.shift();
  const extraText = words.join(" ").trim();

  let detail = flags.detail ? extraText : "";
  if (flags.test) {
    status = "info";
    detail = extraText || "Test notifikácie — ak toto vidíš, kanál funguje.";
  }

  const counts = { ok: flags.ok, fail: flags.fail };
  const message = buildMessage(status, detail, counts);
  const channel = flags.channel || null;

  // NOTIFY_TESTS=failures → zelené testy sa neposielajú, aby to nezvonilo zbytočne.
  if (status === "tests" && cfg("NOTIFY_TESTS") === "failures" && counts.fail === 0) {
    console.log("ℹ️  Testy bez chýb — notifikácia preskočená (NOTIFY_TESTS=failures).");
    writeLog({ status, skipped: "tests_ok" });
    return 0;
  }

  if (flags.dryRun) {
    const primary = cfg("NOTIFY_PRIMARY") === "wsp" ? "WhatsApp" : "Telegram";
    const backup = primary === "Telegram" ? "WhatsApp" : "Telegram";
    const plan =
      channel === "all"
        ? "Telegram + WhatsApp"
        : channel === "tg"
          ? "len Telegram"
          : channel === "wsp"
            ? "len WhatsApp"
            : `${primary} (pri zlyhaní ${backup})`;
    console.log("— DRY RUN, nič sa neposiela —");
    console.log(`kanál: ${plan}`);
    console.log(`WhatsApp nakonfigurovaný: ${whatsappReady() ? "áno" : "NIE"}`);
    console.log(`Telegram nakonfigurovaný: ${telegramReady() ? "áno" : "NIE"}`);
    console.log(`.env: ${existsSync(ENV_FILE) ? ENV_FILE : `chýba (${ENV_FILE})`}`);
    console.log("— správa —");
    console.log(message);
    return 0;
  }

  if (!whatsappReady() && !telegramReady()) {
    console.log("⚠️  Notifikácia neodoslaná: nie je nastavený žiadny kanál.");
    console.log(`   Doplň údaje do ${ENV_FILE} (vzor: .env.example).`);
    writeLog({ status, channels: {}, skipped: "not_configured" });
    return 0;
  }

  const results = await dispatch(message, channel);
  const sent = Object.entries(results)
    .filter(([, result]) => result.ok)
    .map(([name]) => name);
  const failed = Object.entries(results).filter(([, result]) => !result.ok);

  if (sent.length) {
    console.log(`✅ odoslané (${sent.join(", ")}): ${status}`);
    writeLog({ status, channels: results, sent });
  } else {
    console.log(`⚠️  Notifikácia neodoslaná (${failed.map(([name, r]) => `${name}: ${r.code}`).join(", ")}).`);
    for (const [name, result] of failed) {
      if (result.detail) console.log(`   ${name}: ${String(result.detail).slice(0, 200)}`);
    }
    writeLog({ status, channels: results, error: "all_failed" });
  }

  // Stačí, keď prešiel aspoň jeden kanál — aj keď WhatsApp padol a Telegram to zachránil.
  const anyOk = sent.length > 0;
  if (!anyOk && flags.strict) return 1;
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((error) => {
    // Sem by sa kód nemal dostať; aj tak nesmieme zhodiť volajúci proces.
    console.log(`⚠️  Notifikácia zlyhala: ${String(error?.message ?? error).slice(0, 200)}`);
    writeLog({ error: "crash", detail: String(error?.message ?? error).slice(0, 300) });
    process.exitCode = 0;
  });
