#!/usr/bin/env node
/**
 * setup.mjs — one-time setup for the notify script.
 *
 * What it does:
 *   1. asks for your Telegram bot token, verifies it and finds your chat_id,
 *   2. optionally configures WhatsApp (Green API) as a backup channel,
 *   3. writes the credentials to .env (secrets never leave your machine),
 *   4. generates skill/notify/SKILL.md with the correct absolute path,
 *   5. sends a real test notification through notify.mjs.
 *
 * Usage:
 *   setup.cmd                                  (interactive)
 *   node setup.mjs --telegram-token 123:ABC    (non-interactive)
 *   node setup.mjs --help
 *
 * Non-interactive flags:
 *   --telegram-token <token>        bot token from @BotFather
 *   --no-telegram                   skip Telegram
 *   --whatsapp                      enable WhatsApp (Green API)
 *   --whatsapp-instance <id>        Green API idInstance
 *   --whatsapp-token <token>        Green API apiToken
 *   --whatsapp-phone <number>       your number with country code, e.g. 421900000000
 *   --no-whatsapp                   skip WhatsApp
 *
 * Debug/test only: TELEGRAM_BASE_URL, GREENAPI_BASE_URL, NOTIFY_ENV_FILE,
 * SETUP_WAIT_SECONDS, SETUP_SKILL_OUT.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(HERE, process.env.NOTIFY_ENV_FILE || ".env");
const TELEGRAM_BASE = (process.env.TELEGRAM_BASE_URL || "https://api.telegram.org").replace(/\/+$/, "");
const GREENAPI_BASE = (process.env.GREENAPI_BASE_URL || "https://api.green-api.com").replace(/\/+$/, "");
const SKILL_TEMPLATE = resolve(HERE, "skill", "notify", "SKILL.template.md");
const SKILL_OUT = process.env.SETUP_SKILL_OUT
  ? resolve(process.env.SETUP_SKILL_OUT)
  : resolve(HERE, "skill", "notify", "SKILL.md");
const NOTIFY_CMD = resolve(HERE, "notify.cmd");
const NOTIFY_MJS = resolve(HERE, "notify.mjs");
const TOKEN_RE = /^\d{6,}:[A-Za-z0-9_-]{30,}$/;
const HTTP_TIMEOUT = 15000;
const WAIT_SECONDS = Number(process.env.SETUP_WAIT_SECONDS || 180);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const USAGE = `notify setup

  setup.cmd                        interactive setup (recommended)
  node setup.mjs --telegram-token <token>
  node setup.mjs --whatsapp --whatsapp-instance <id> --whatsapp-token <token> --whatsapp-phone <number>

Flags:
  --telegram-token <token>     Telegram bot token from @BotFather
  --no-telegram                skip Telegram
  --whatsapp                   enable WhatsApp backup (Green API)
  --whatsapp-instance <id>     Green API idInstance
  --whatsapp-token <token>     Green API apiToken
  --whatsapp-phone <number>    your number with country code (421900000000)
  --whatsapp-only              only configure WhatsApp, keep existing Telegram
  --no-whatsapp                skip WhatsApp
  --help                       this help

Re-running setup keeps the Telegram credentials you already have:
press Enter to keep them and add WhatsApp, or type n to set them up again.`;

function parseArgs(argv) {
  const args = { whatsapp: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--telegram-token") args.telegramToken = String(argv[++i] ?? "").trim();
    else if (arg === "--no-telegram") args.noTelegram = true;
    else if (arg === "--whatsapp-only") args.whatsappOnly = true;
    else if (arg === "--whatsapp" || arg === "-w") args.whatsapp = true;
    else if (arg === "--no-whatsapp") args.noWhatsapp = true;
    else if (arg === "--whatsapp-instance") args.waInstance = String(argv[++i] ?? "").trim();
    else if (arg === "--whatsapp-token") args.waToken = String(argv[++i] ?? "").trim();
    else if (arg === "--whatsapp-phone") args.waPhone = String(argv[++i] ?? "").trim();
    else if (arg === "--help" || arg === "-h") args.help = true;
  }
  return args;
}

async function httpJson(url, payload) {
  const init = payload === undefined
    ? { signal: AbortSignal.timeout(HTTP_TIMEOUT) }
    : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(HTTP_TIMEOUT),
      };
  try {
    const response = await fetch(url, init);
    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      /* some responses are not JSON */
    }
    return { ok: response.ok, status: response.status, data, raw };
  } catch (error) {
    return { ok: false, status: 0, data: null, raw: String(error?.message ?? error) };
  }
}

async function telegram(token, method, payload) {
  const result = await httpJson(`${TELEGRAM_BASE}/bot${token}/${method}`, payload);
  return { ...result, ok: result.ok && result.data?.ok === true };
}

function describe(result) {
  const text = result?.data?.description || result?.data?.message || result?.raw || "";
  return String(text).replace(/\s+/g, " ").trim().slice(0, 180) || "no response";
}

/** Read current .env into a plain object (values are never printed). */
function readEnvFile() {
  const out = {};
  if (!existsSync(ENV_FILE)) return out;
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Write keys into .env without touching unrelated lines. */
function upsertEnv(values) {
  const raw = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const seen = new Set();
  const lines = [];

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
    if (!match || !(match[1] in values)) {
      lines.push(line);
      continue;
    }
    const key = match[1];
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`${key}=${values[key]}`);
  }

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) lines.push(`${key}=${value}`);
  }

  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  writeFileSync(ENV_FILE, `${lines.join("\n")}\n`, "utf8");
}

function phoneToChatId(phone) {
  let digits = String(phone).replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits ? `${digits}@c.us` : "";
}

function generateSkill() {
  if (!existsSync(SKILL_TEMPLATE)) return null;
  const template = readFileSync(SKILL_TEMPLATE, "utf8");
  // Forward slashes only: some Skills editors strip backslashes and silently
  // break the stored command path (the agent then calls a nonexistent file).
  const content = template.split("{{NOTIFY_CMD}}").join(NOTIFY_CMD.replace(/\\/g, "/"));
  writeFileSync(SKILL_OUT, content, "utf8");
  return SKILL_OUT;
}

async function setupTelegram(rl, args) {
  console.log("\n=== Telegram (primary channel) ===");
  console.log("No bot yet?");
  console.log("  1. Open Telegram and search for @BotFather.");
  console.log("  2. Send /newbot, pick a name and a username ending with 'bot'.");
  console.log("  3. Copy the token it replies with (looks like 123456789:AA...).\n");

  let token = (args.telegramToken || "").trim();
  if (!token && rl) token = (await rl.question("Bot token: ")).trim();
  token = token.replace(/^bot/i, "").replace(/\s+/g, "");

  if (!TOKEN_RE.test(token)) {
    console.log("X That does not look like a bot token (expected digits:letters).");
    return null;
  }

  const me = await telegram(token, "getMe");
  if (!me.ok) {
    console.log(`X Token rejected (HTTP ${me.status}): ${describe(me)}`);
    console.log("  Copy the whole token, and make sure it belongs to the bot you just created.");
    return null;
  }
  const username = me.data?.result?.username || "your_bot";
  console.log(`OK Bot found: @${username}`);

  // A webhook would block getUpdates; on a fresh bot this changes nothing.
  await telegram(token, "deleteWebhook", { drop_pending_updates: false });

  // Skip old updates so a previous conversation does not confuse us.
  let offset = 1;
  const last = await telegram(token, "getUpdates", { offset: -1, timeout: 0 });
  if (last.ok && Array.isArray(last.data?.result) && last.data.result.length) {
    offset = last.data.result[last.data.result.length - 1].update_id + 1;
  }

  console.log(`\nOpen @${username} in Telegram and press Start (or send any message).`);
  console.log(`Waiting up to ${WAIT_SECONDS}s...`);

  const deadline = Date.now() + WAIT_SECONDS * 1000;
  let chat = null;
  while (Date.now() < deadline && !chat) {
    const updates = await telegram(token, "getUpdates", {
      offset,
      timeout: 0,
      allowed_updates: ["message", "channel_post"],
    });
    if (updates.ok && Array.isArray(updates.data?.result)) {
      for (const update of updates.data.result) {
        offset = Math.max(offset, Number(update.update_id) + 1);
        const message = update.message || update.channel_post || null;
        if (message?.chat?.id != null) chat = message.chat;
      }
    }
    if (chat) break;
    process.stdout.write(".");
    await sleep(2000);
  }
  console.log("");

  if (!chat) {
    console.log("X Nothing arrived at the bot.");
    console.log(`  Make sure you opened @${username} and pressed Start, then run setup again.`);
    return null;
  }

  const chatId = String(chat.id);
  const who = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || "chat";
  console.log(`OK chat_id: ${chatId} (${chat.type}${who ? `, ${who}` : ""})`);

  const sent = await telegram(token, "sendMessage", {
    chat_id: chatId,
    text: "Telegram is connected - notifications will arrive here.",
    disable_web_page_preview: true,
  });
  if (!sent.ok) {
    console.log(`X Test message failed (HTTP ${sent.status}): ${describe(sent)}`);
    return null;
  }
  console.log(`OK test message sent (message_id ${sent.data?.result?.message_id ?? "?"})`);

  return { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId };
}

async function setupWhatsApp(rl, args) {
  console.log("\n=== WhatsApp backup (Green API, optional) ===");
  console.log("You need a Green API account: https://green-api.com");
  console.log("In the console you will find idInstance and apiToken; scan the QR code");
  console.log("with WhatsApp > Linked devices first, otherwise sending fails.\n");

  let instance = (args.waInstance || "").trim();
  let apiToken = (args.waToken || "").trim();
  let phone = (args.waPhone || "").trim();

  if (rl) {
    if (!instance) instance = (await rl.question("idInstance: ")).trim();
    if (!apiToken) apiToken = (await rl.question("apiToken: ")).trim();
    if (!phone) phone = (await rl.question("Your phone number with country code: ")).trim();
  }

  const chatId = phoneToChatId(phone);
  if (!instance || !apiToken || !chatId) {
    console.log("X WhatsApp skipped: instance, token and phone number are all required.");
    return null;
  }

  const state = await httpJson(
    `${GREENAPI_BASE}/waInstance${encodeURIComponent(instance)}/getStateInstance/${encodeURIComponent(apiToken)}`,
  );
  const stateName = state.data?.stateInstance;
  if (stateName && stateName !== "authorized") {
    console.log(`! Instance state is "${stateName}" - scan the QR code in Green API first.`);
    console.log("  Credentials will still be saved; the script reports this state at send time.");
  } else if (stateName === "authorized") {
    console.log("OK instance is authorized");
  } else {
    console.log(`! Could not read state (HTTP ${state.status}); continuing anyway.`);
  }

  const test = await httpJson(
    `${GREENAPI_BASE}/waInstance${encodeURIComponent(instance)}/sendMessage/${encodeURIComponent(apiToken)}`,
    { chatId, message: "WhatsApp backup is connected - notifications will fall back here." },
  );
  if (!test.ok || !test.data?.idMessage) {
    console.log(`! Test message did not go through (HTTP ${test.status}): ${describe(test)}`);
    console.log("  Credentials will be saved anyway; fix the instance and run notify.cmd --test.");
  } else {
    console.log(`OK test message sent (id ${test.data.idMessage})`);
  }

  return {
    GREENAPI_ID_INSTANCE: instance,
    GREENAPI_API_TOKEN: apiToken,
    GREENAPI_CHAT_ID: chatId,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  console.log("=== notify setup ===");
  console.log("This writes credentials to:");
  console.log(`  ${ENV_FILE}`);
  console.log("The file stays on your machine and is ignored by git.\n");

  if (args.whatsappOnly) args.noTelegram = true;

  const existing = readEnvFile();
  const hasTelegram = Boolean(existing.TELEGRAM_BOT_TOKEN && existing.TELEGRAM_CHAT_ID);

  const rl = stdin.isTTY ? createInterface({ input: stdin, output: stdout }) : null;
  const values = {};

  try {
    let doTelegram = !args.noTelegram;
    if (doTelegram && hasTelegram && !args.telegramToken) {
      if (rl) {
        const answer = (
          await rl.question(
            `Telegram is already configured (chat_id ${existing.TELEGRAM_CHAT_ID}).\nPress Enter to keep it, or type n to set it up again: `,
          )
        ).trim();
        if (!/^n/i.test(answer)) {
          doTelegram = false;
          console.log("OK keeping the existing Telegram settings.");
        }
      } else {
        doTelegram = false;
        console.log(`OK Telegram already configured (chat_id ${existing.TELEGRAM_CHAT_ID}) - keeping it.`);
      }
    }

    if (doTelegram) {
      const telegramValues = await setupTelegram(rl, args);
      if (telegramValues) Object.assign(values, telegramValues);
      else if (!args.noWhatsapp && !hasTelegram) {
        console.log("\nTelegram was not configured. You can fix it and run setup again.");
        return 1;
      }
    }

    const wantsWhatsApp =
      args.whatsapp ||
      Boolean(args.waInstance || args.waToken || args.waPhone) ||
      (Boolean(rl) && !args.noWhatsapp
        ? /^y/i.test(
            (
              await rl.question(
                "\nWhatsApp is optional - it is only a backup when Telegram fails.\nPress Enter to skip, or type y to add it: ",
              )
            ).trim(),
          )
        : false);

    if (wantsWhatsApp) {
      const waValues = await setupWhatsApp(rl, args);
      if (waValues) Object.assign(values, waValues);
    }

    const configured =
      Object.keys(values).length > 0 || Boolean(existing.TELEGRAM_BOT_TOKEN || existing.GREENAPI_API_TOKEN);
    if (!configured) {
      console.log("\nX Nothing is configured yet. Run setup again and add Telegram.");
      return 1;
    }

    if (Object.keys(values).length) {
      upsertEnv(values);
      console.log(`\nOK credentials saved to ${ENV_FILE}`);
    } else {
      console.log("\nOK nothing to change - using the credentials already in .env");
    }

    const skillPath = generateSkill();
    if (skillPath) {
      console.log(`OK skill generated: ${skillPath}`);
      console.log("   Add that file to your AI client's Skills so every project can use it.");
      console.log("   Restart the client after adding it so the skill gets loaded.");
    }

    console.log("\nSending a real test notification...");
    const test = spawnSync(process.execPath, [NOTIFY_MJS, "--test"], { encoding: "utf8" });
    const output = `${test.stdout || ""}${test.stderr || ""}`.trim();
    if (output) console.log(output);

    console.log(`\nDone. Try it yourself:\n  "${NOTIFY_CMD}" --test`);
    return 0;
  } finally {
    if (rl) rl.close();
  }
}

main()
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((error) => {
    console.log(`X Setup failed: ${String(error?.message ?? error).slice(0, 200)}`);
    process.exitCode = 1;
  });
