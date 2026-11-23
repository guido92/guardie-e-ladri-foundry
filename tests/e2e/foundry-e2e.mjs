/**
 * Test E2E multi-client di "Guardie & Ladri" su Foundry VTT.
 *
 * Un contesto Chromium per utente (Gamemaster, Alice, Bob, Carla), ognuno fa le SUE mosse
 * cliccando il SUO Tavolo. Dopo ogni passo: asserzioni sullo stato (fase, step, numero di
 * carte, 108 carte senza duplicati), controlli di visibilità/permessi, screenshot, errori di console.
 *
 * Uso:
 *   cd tests/e2e/runner && npm install          (una volta: installa playwright-core)
 *   node tests/e2e/foundry-e2e.mjs              (dalla radice del repo)
 * Variabili: FOUNDRY_URL (default http://localhost:30000), HEADLESS=0 per vedere i browser,
 *            CHROME_PATH per usare un eseguibile invece del canale "chrome".
 * Esito: tests/e2e/screenshots/*.png e tests/e2e/screenshots/risultati.json; exit code 1 se ci sono fallimenti.
 * A fine corsa la partita viene chiusa (reset) dal GM. Utenti e attori non vengono toccati.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, "runner", "package.json"));
const { chromium } = require("playwright-core");

const URL = process.env.FOUNDRY_URL ?? "http://localhost:30000";
const SHOTS = path.join(HERE, "screenshots");
mkdirSync(SHOTS, { recursive: true });
for (const f of readdirSync(SHOTS)) if (f.endsWith(".png")) rmSync(path.join(SHOTS, f));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = "#guardie-e-ladri-tavolo";

// ---------------------------------------------------------------------------
// registro dei risultati

const results = { passi: [], fallimenti: [], note: [], console: [], layout: [], screenshot: [] };
let passo = "avvio";
function step(nome) {
  passo = nome;
  results.passi.push(nome);
  console.log(`\n== ${nome}`);
}
function check(cond, msg, extra) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    console.log(`  FAIL ${msg}${extra ? ` — ${typeof extra === "string" ? extra : JSON.stringify(extra)}` : ""}`);
    results.fallimenti.push({ passo, msg, extra });
  }
  return !!cond;
}
function nota(msg, extra) {
  console.log(`  nota ${msg}${extra ? ` — ${JSON.stringify(extra)}` : ""}`);
  results.note.push({ passo, msg, extra });
}

// ---------------------------------------------------------------------------
// carte

const NOMI_SEME = { C: "cuori", Q: "quadri", F: "fiori", P: "picche" };
const titolo = (id) => {
  if (!id || id.startsWith("j:")) return null;
  const [m, r] = id.split(":");
  return `${r[0] === "T" ? "10" : r[0]} di ${NOMI_SEME[r[1]]} (${m === "b" ? "Mazzo della Banda" : "Mazzo del Croupier"})`;
};
const VAL = "23456789TJQKA";
const valore = (id) => (id.startsWith("j:") ? 99 : VAL.indexOf(id.split(":")[1][0]));

/** Tutte le carte dello stato, in ogni zona. */
function tutteLeCarte(st) {
  const z = {
    bPesca: st.mazzi.b.pesca,
    bScarti: st.mazzi.b.scarti,
    cPesca: st.mazzi.c.pesca,
    cScarti: st.mazzi.c.scarti,
    jolly: st.jolly,
    eliminate: st.eliminate ?? [],
    mazzetto: st.mazzetto ?? [],
    tavolo: st.confronto?.tavolo ?? [],
    giocate: Object.values(st.confronto?.giocate ?? {}).flat(),
    croupierMano: st.confronto?.croupierMano ?? [],
    croupierGioca: st.confronto?.croupierGioca ?? [],
    bottino: st.bottino?.carte ?? [],
  };
  for (const l of st.ladri) z[`mano:${l.nome}`] = l.mano;
  return z;
}
function checkCarte(st, label) {
  const z = tutteLeCarte(st);
  const all = Object.values(z).flat();
  const dup = all.filter((c, i) => all.indexOf(c) !== i);
  const ok = check(all.length === 108 && dup.length === 0, `${label}: 108 carte, nessun duplicato`, { totale: all.length, duplicati: dup });
  if (!ok) {
    // dove sono i duplicati?
    for (const d of dup) nota(`duplicato ${d}`, Object.entries(z).filter(([, v]) => v.includes(d)).map(([k]) => k));
  }
  return ok;
}

// ---------------------------------------------------------------------------
// client

const clients = {};
let browser;
let T0 = 0; // timestamp del messaggio "Nuova partita"

async function login(nome) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const c = { nome, ctx, page, isGM: nome === "Gamemaster" };
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      const t = m.text();
      results.console.push({ client: nome, passo, tipo: m.type(), testo: t.slice(0, 500) });
    }
  });
  page.on("crash", () => console.log(`  !! CRASH della pagina di ${nome} durante: ${passo}`));
  page.on("pageerror", (e) => results.console.push({ client: nome, passo, tipo: "pageerror", testo: String(e?.stack ?? e).slice(0, 800) }));
  await page.goto(`${URL}/join`);
  await page.waitForSelector('select[name="userId"]');
  c.userId = await page.$eval(
    'select[name="userId"]',
    (s, n) => {
      const o = [...s.options].find((x) => x.textContent.trim() === n);
      if (!o) return null;
      o.disabled = false; // il GM può risultare "già collegato" dall'app desktop
      s.value = o.value;
      return o.value;
    },
    nome,
  );
  if (!c.userId) throw new Error(`Utente ${nome} non trovato in /join`);
  await page.click('button[name="join"]');
  await page.waitForURL(/\/game/, { timeout: 30000 });
  await page.waitForFunction(() => window.game?.ready && window.game.gl, null, { timeout: 90000 });
  await page.evaluate(() => {
    window.__socketLog = [];
    game.socket.on("system.guardie-e-ladri", (m) => window.__socketLog.push(JSON.stringify(m)));
  });
  await page.evaluate(() => {
    window.__notes = [];
    const N = ui.notifications;
    for (const k of ["info", "warn", "error"]) {
      const o = N[k].bind(N);
      N[k] = (m, ...r) => {
        window.__notes.push({ k, m: String(m) });
        return o(m, ...r);
      };
    }
    try {
      game.tours?.activeTour?.exit?.();
    } catch {}
    document.querySelectorAll(".tour, .tour-overlay, .tour-fadeout, .tour-center-step").forEach((e) => e.remove());
  });
  await page.evaluate((t) => (window.__t0 = t), T0);
  await page.waitForTimeout(800);
  await apriTavolo(c);
  clients[nome] = c;
  console.log(`  login ${nome} (${c.userId})`);
  return c;
}

async function apriTavolo(c) {
  await c.page.evaluate(() => {
    document.querySelectorAll(".tour, .tour-overlay, .tour-fadeout").forEach((e) => e.remove());
    if (!document.querySelector("#guardie-e-ladri-tavolo")) game.gl.openTable();
  });
  await c.page.waitForSelector(T, { timeout: 15000 });
}

const stateOf = (c) => c.page.evaluate(() => (game.gl.state ? JSON.parse(JSON.stringify(game.gl.state)) : null));
const gm = () => clients.Gamemaster;
const gmState = () => stateOf(gm());

/** Attende che lo stato (visto dal GM) soddisfi pred. */
async function until(pred, desc, timeout = 12000) {
  const t0 = Date.now();
  let st;
  while (Date.now() - t0 < timeout) {
    st = await gmState();
    try {
      if (pred(st)) return st;
    } catch {}
    await sleep(150);
  }
  check(false, `timeout: ${desc}`, st ? { fase: st.fase, step: st.confronto?.step } : null);
  throw new Error(`Timeout: ${desc}`);
}

/**
 * Attende che tutti i client siano alla stessa versione dello stato del GM e che il Tavolo sia ridisegnato.
 * (I giocatori ricevono solo la loro vista, con le Carte altrui coperte: si confronta il numero di versione.)
 */
async function sync() {
  const pieno = await gmState();
  const ref = JSON.stringify(pieno?.seq ?? null);
  for (const c of Object.values(clients)) {
    if (c.page.isClosed()) continue;
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const s = await c.page.evaluate(() => JSON.stringify(game.gl.state?.seq ?? null));
      if (s === ref) break;
      await sleep(120);
    }
  }
  const ref2 = JSON.stringify(pieno);
  await sleep(450);
  return JSON.parse(ref2);
}

function sel(cmd, data = {}) {
  return `${T} [data-action="cmd"][data-cmd="${cmd}"]` + Object.entries(data).map(([k, v]) => `[data-${k}="${v}"]`).join("");
}
async function clickCmd(c, cmd, data = {}, { allowMissing = false } = {}) {
  const loc = c.page.locator(sel(cmd, data));
  const n = await loc.count();
  if (!n) {
    if (allowMissing) return false;
    check(false, `${c.nome}: pulsante ${cmd} ${JSON.stringify(data)} presente`);
    throw new Error(`Pulsante mancante ${cmd}`);
  }
  if (await loc.first().isDisabled()) {
    check(false, `${c.nome}: pulsante ${cmd} ${JSON.stringify(data)} abilitato`);
    throw new Error(`Pulsante disabilitato ${cmd}`);
  }
  await loc.first().click();
  return true;
}
async function hasCmd(c, cmd, data = {}) {
  return (await c.page.locator(sel(cmd, data)).count()) > 0;
}
async function isDisabled(c, cmd, data = {}) {
  return c.page.locator(sel(cmd, data)).first().isDisabled();
}
async function selCarta(c, id, zona = "") {
  const s = `${T} ${zona} [data-action="sel"][data-carta="${id}"]`;
  const loc = c.page.locator(s);
  if (!(await loc.count())) {
    check(false, `${c.nome}: carta ${id} selezionabile`);
    throw new Error(`Carta non selezionabile ${id}`);
  }
  await loc.first().click();
  await c.page.waitForSelector(`${T} ${zona} .gl-sel[data-carta="${id}"]`, { timeout: 5000 });
}
async function selezionate(c) {
  return c.page.$$eval(`${T} .gl-sel[data-carta]`, (es) => [...new Set(es.map((e) => e.dataset.carta))]);
}

async function shot(c, nome) {
  const file = `${String(results.screenshot.length + 1).padStart(2, "0")}-${nome}-${c.nome}.png`;
  await c.page.screenshot({ path: path.join(SHOTS, file) });
  results.screenshot.push(file);
}
async function shotAll(nome) {
  for (const c of Object.values(clients)) if (!c.page.isClosed()) await shot(c, nome);
}

async function notes(c) {
  return c.page.evaluate(() => window.__notes.splice(0));
}

/** Un giocatore prova una mossa vietata con game.gl.dispatch: lo stato non deve cambiare e deve comparire un avviso. */
async function vietata(c, action, label, re) {
  await notes(c);
  const prima = JSON.stringify(await gmState());
  await c.page.evaluate((a) => game.gl.dispatch(a), action);
  await sleep(1500);
  const dopo = JSON.stringify(await gmState());
  const n = await notes(c);
  check(prima === dopo, `${label}: lo stato non cambia`);
  check(n.some((x) => (re ? re.test(x.m) : true)), `${label}: avviso al giocatore`, n);
  return n;
}

// ---------------------------------------------------------------------------
// visibilità

async function utentiAttivi() {
  return gm().page.evaluate(() => game.users.filter((u) => u.active).map((u) => u.id));
}

function modello(c, st, attivi) {
  const controlla = (l) => (l.userId ? l.userId === c.userId : c.isGM);
  const comando = (l) => controlla(l) || (c.isGM && !(l.userId && attivi.includes(l.userId)));
  // il Croupier (GM) non fa parte della Banda: non vede le mani mostrate né quelle della Fuga
  const seduto = !c.isGM && st.ladri.some(controlla);
  const vede = (l) => st.fase === "epilogo" || comando(l) || (seduto && (l.mostra || st.fase === "fuga"));
  return { controlla, comando, seduto, vede };
}

let ultimoVis = 0; // i messaggi di chat già controllati (una carta può tornare nel mazzo dopo essere stata rivelata)
async function domVis(c, since = 0) {
  return c.page.evaluate((since) => {
    const root = document.querySelector("#guardie-e-ladri-tavolo");
    if (!root) return null;
    const conta = (el) => ({
      up: el ? el.querySelectorAll(".gl-carta:not(.gl-dorso):not(.gl-vuota)").length : 0,
      down: el ? el.querySelectorAll(".gl-dorso").length : 0,
    });
    return {
      titoli: [...root.querySelectorAll(".gl-carta[title]:not(.gl-jolly)")].map((e) => e.getAttribute("title")),
      // solo i messaggi di questa partita (la chat conserva quelli delle partite precedenti)
      chat: game.messages.contents
        .filter((m) => m.timestamp >= Math.max(window.__t0 ?? 0, since))
        // l'esito rivela le carte per regola; col Rilancio quelle del Croupier tornano nel suo Mazzo e possono essere ripescate
        .filter((m) => m.flags?.["guardie-e-ladri"]?.effect !== "esito")
        .flatMap((m) => [...document.querySelectorAll(`.chat-message[data-message-id="${m.id}"] .gl-carta[title]`)])
        .map((e) => e.getAttribute("title")),
      ladri: [...root.querySelectorAll(".gl-side .gl-ladro")].map((e) => ({ nome: e.querySelector(".gl-ladro-head strong")?.textContent, ...conta(e.querySelector(".gl-mano")) })),
      crou: root.querySelector(".gl-crou-mano") ? conta(root.querySelector(".gl-crou-mano")) : null,
      crouGioca: conta(root.querySelector(".gl-zona-croupier > .gl-carte")),
      giocate: [...root.querySelectorAll(".gl-zona-ladri .gl-giocata:not(.gl-attesa)")].map((e) => ({ nome: e.querySelector(".gl-lbl")?.textContent, ...conta(e) })),
    };
  }, since);
}

/** Confronta quello che il client mostra con quello che dovrebbe mostrare. */
async function visCheck(label, { chat = true } = {}) {
  const st = await gmState();
  const attivi = await utentiAttivi();
  const since = ultimoVis;
  ultimoVis = Date.now();
  for (const c of Object.values(clients)) {
    if (c.page.isClosed()) continue;
    const m = modello(c, st, attivi);
    const d = await domVis(c, since);
    if (!check(!!d, `${label} [${c.nome}]: Tavolo aperto`)) continue;
    const vietate = new Set();
    for (const l of st.ladri) {
      const dl = d.ladri.find((x) => x.nome === l.nome);
      const v = m.vede(l);
      check(
        dl && (v ? dl.up === l.mano.length && dl.down === 0 : dl.up === 0 && dl.down === l.mano.length),
        `${label} [${c.nome}]: mano di ${l.nome} ${v ? "scoperta" : "coperta"} (${l.mano.length})`,
        dl,
      );
      if (!v) l.mano.forEach((x) => vietate.add(x));
    }
    const cf = st.confronto;
    const vietateChat = new Set();
    if (cf) {
      const scoperte = cf.step === "esito" || cf.scoperte || cf.round === 2 || cf.round === "allin";
      const manoC = cf.tipo === "fuga" ? st.mazzetto : cf.croupierMano;
      if (manoC.length) {
        check(
          d.crou && (c.isGM ? d.crou.down === 0 && d.crou.up === manoC.length : d.crou.up === 0 && d.crou.down === manoC.length),
          `${label} [${c.nome}]: ${cf.tipo === "fuga" ? "Mazzetto" : "mano del Croupier"} ${c.isGM ? "visibile al GM" : "coperta"}`,
          d.crou,
        );
        if (!c.isGM) manoC.forEach((x) => (vietate.add(x), vietateChat.add(x)));
      }
      if (cf.croupierGioca && !scoperte && !c.isGM) cf.croupierGioca.forEach((x) => (vietate.add(x), vietateChat.add(x)));
      for (const [k, carte] of Object.entries(cf.giocate)) {
        const l = st.ladri.find((x) => x.id === k);
        const mie = k === "banda" ? m.seduto : m.comando(l);
        const vis = scoperte || mie;
        const dg = d.giocate.find((x) => x.nome === (k === "banda" ? "La Banda" : l.nome));
        check(dg && (vis ? dg.up === carte.length : dg.down === carte.length && dg.up === 0), `${label} [${c.nome}]: giocata di ${k === "banda" ? "la Banda" : l.nome} ${vis ? "scoperta" : "coperta"}`, dg);
        if (!vis) carte.forEach((x) => (vietate.add(x), vietateChat.add(x)));
        if (k === "banda" && c.isGM && !scoperte && mie)
          nota(`${label}: il Croupier (GM) vede le 2 Carte coperte della Banda prima di scegliere le sue, perché comanda un Ladro senza giocatore`);
      }
    }
    // anche i dati che arrivano al client (impostazioni del mondo, socket, stato in memoria)
    if (!c.isGM) {
      const nascoste = (x) => {
        const mm = modello(c, x, attivi);
        const out = new Set();
        for (const l of x.ladri) if (!mm.vede(l)) l.mano.forEach((k) => out.add(k));
        x.mazzetto.forEach((k) => out.add(k));
        x.mazzi.c.pesca.forEach((k) => out.add(k));
        const sceglie = x.bottino?.daScegliere && x.bottino.partecipanti.some((id) => mm.controlla(x.ladri.find((l) => l.id === id)));
        if (!sceglie) x.mazzi.b.pesca.forEach((k) => out.add(k));
        const f = x.confronto;
        if (f) {
          const sc = f.step === "esito" || f.step === "bottino" || f.scoperte || f.round === 2 || f.round === "allin";
          f.croupierMano.forEach((k) => out.add(k));
          if (!sc) (f.croupierGioca ?? []).forEach((k) => out.add(k));
          for (const [k, carte] of Object.entries(f.giocate)) if (!sc && !(k === "banda" ? mm.seduto : mm.comando(x.ladri.find((l) => l.id === k)))) carte.forEach((q) => out.add(q));
        }
        return out;
      };
      const dati = await c.page.evaluate(() => {
        const out = [["stato", JSON.stringify(game.gl.state ?? null)]];
        for (const v of game.settings.storage.get("world")?.contents ?? []) if (v.key?.startsWith("guardie-e-ladri.")) out.push([v.key, String(v.value)]);
        const log = (window.__socketLog ?? []).splice(0);
        const ultimaVista = log.filter((m) => JSON.parse(m).type === "vista").at(-1);
        for (const m of log) if (JSON.parse(m).type !== "vista" || m === ultimaVista) out.push([`socket:${JSON.parse(m).type}`, m]);
        return out;
      });
      // una Carta conta come trapelata solo se era nascosta prima e dopo la lettura (niente falsi allarmi a metà mossa)
      const dopo = nascoste(await gmState());
      const dove = (x) => dati.filter(([, t]) => t.includes(`"${x}"`) || t.includes(`\\"${x}\\"`)).map(([k]) => k);
      const fuori = [...nascoste(st)].filter((x) => dopo.has(x) && dove(x).length).map((x) => `${x}@${dove(x).join("+")}`);
      check(!fuori.length, `${label} [${c.nome}]: nessuna carta nascosta nei dati ricevuti (impostazioni, socket, stato)`, fuori.slice(0, 6));
    }
    const leak = d.titoli.filter((t) => [...vietate].some((x) => titolo(x) === t));
    check(!leak.length, `${label} [${c.nome}]: nessuna carta nascosta visibile nel Tavolo`, leak);
    if (chat) {
      const leakC = d.chat.filter((t) => [...vietateChat].some((x) => titolo(x) === t));
      check(!leakC.length, `${label} [${c.nome}]: nessuna carta nascosta in chat`, leakC);
    }
  }
}

// ---------------------------------------------------------------------------
// layout

async function layoutCheck(label) {
  for (const c of Object.values(clients)) {
    if (c.page.isClosed()) continue;
    const probs = await c.page.evaluate(() => {
      const out = [];
      const root = document.querySelector("#guardie-e-ladri-tavolo");
      if (!root) return ["Tavolo non aperto"];
      const r = root.getBoundingClientRect();
      if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1) out.push(`finestra fuori dallo schermo ${JSON.stringify([r.left, r.top, r.right, r.bottom].map(Math.round))}`);
      const fel = root.querySelector(".gl-feltro");
      if (fel) {
        const f = fel.getBoundingClientRect();
        for (const card of fel.querySelectorAll(".gl-carta")) {
          const k = card.getBoundingClientRect();
          if (k.left < f.left - 1 || k.right > f.right + 1 || k.top < f.top - 1 || k.bottom > f.bottom + 1) {
            out.push(`carta fuori dal feltro (${card.title || card.className}) ${JSON.stringify([k.left, k.top, k.right, k.bottom].map(Math.round))} feltro ${JSON.stringify([f.left, f.top, f.right, f.bottom].map(Math.round))}`);
            break;
          }
        }
        for (const z of fel.querySelectorAll(".gl-carte")) if (z.scrollWidth > z.clientWidth + 2) out.push(`riga di carte che trabocca nel feltro (${z.parentElement.className})`);
      }
      for (const s of root.querySelectorAll(".gl-main, .gl-side, .gl-azioni")) if (s.scrollWidth > s.clientWidth + 2) out.push(`scroll orizzontale in ${s.className} (${s.scrollWidth}>${s.clientWidth})`);
      for (const b of root.querySelectorAll("button")) {
        const k = b.getBoundingClientRect();
        if (b.offsetParent && (k.width < 10 || k.height < 10)) out.push(`pulsante schiacciato: ${b.textContent.trim()}`);
        const box = b.closest(".gl-box, .gl-row");
        if (box) {
          const q = box.getBoundingClientRect();
          if (k.right > q.right + 2) out.push(`pulsante che esce dal riquadro: ${b.textContent.trim()}`);
        }
      }
      for (const g of root.querySelectorAll(".gl-mano")) if (g.scrollWidth > g.clientWidth + 2) out.push("mano che trabocca nella colonna laterale");
      return [...new Set(out)];
    });
    if (probs.length) {
      results.layout.push({ passo: label, client: c.nome, problemi: probs });
      console.log(`  layout [${c.nome}] ${label}: ${probs.join(" | ")}`);
    }
  }
}

// ---------------------------------------------------------------------------
// combinazioni (calcolate nel browser con le funzioni del sistema)

async function trova(tipi, pool) {
  return gm().page.evaluate(({ tipi, pool }) => game.gl.carte.trovaCombinazione(tipi, pool), { tipi, pool });
}

// ---------------------------------------------------------------------------
// Lavoretto generico guidato dai client

/** Ritorna il client che comanda il ladro (giocatore se collegato, altrimenti GM). */
function chi(st, id) {
  const l = st.ladri.find((x) => x.id === id);
  const c = Object.values(clients).find((x) => !x.isGM && x.userId === l.userId && !x.page.isClosed());
  return c ?? gm();
}

async function giocaRiver(st, ids) {
  for (const id of ids) {
    const c = chi(st, id);
    const l = st.ladri.find((x) => x.id === id);
    await clickCmd(c, "suggerisci", { ladro: id });
    await sleep(300);
    const s = await selezionate(c);
    check(s.length >= 1 && s.every((x) => l.mano.includes(x)), `${c.nome}: "Suggerisci" seleziona Carte della mano di ${l.nome}`, s);
    await clickCmd(c, "gioca", { ladro: id });
    st = await until((x) => x.confronto?.giocate?.[id]?.length || x.confronto?.step === "esito" || x.confronto?.step === "bottino" || !x.confronto, `${l.nome} gioca`);
    await sync();
    checkCarte(st, `${l.nome} ha giocato`);
  }
  return st;
}

async function croupierGioca() {
  await clickCmd(gm(), "suggerisciCroupier");
  await sleep(300);
  await clickCmd(gm(), "croupierGioca");
  const st = await until((x) => !x.confronto || x.confronto.croupierGioca || x.fase === "epilogo", "il Croupier gioca");
  await sync();
  return st;
}

// ---------------------------------------------------------------------------

async function main() {
  const exe = process.env.CHROME_PATH;
  browser = await chromium.launch(exe ? { executablePath: exe, headless: process.env.HEADLESS !== "0" } : { channel: "chrome", headless: process.env.HEADLESS !== "0" });

  step("Login GM e chiusura della partita esistente");
  await login("Gamemaster");
  let st = await gmState();
  if (st) {
    await gm().page.evaluate(() => game.gl.dispatch({ type: "reset" }));
    st = await until((x) => x === null, "reset");
  }
  check(st === null, "nessuna partita in corso dopo il reset");

  step("Login dei giocatori");
  for (const n of ["Alice", "Bob", "Carla"]) await login(n);
  await sync();
  const attivi = await utentiAttivi();
  check(["Alice", "Bob", "Carla"].every((n) => attivi.includes(clients[n].userId)), "tutti i giocatori risultano collegati");
  for (const n of ["Alice", "Bob", "Carla"]) {
    const txt = await clients[n].page.locator(T).innerText();
    check(/In attesa che il Croupier apra il tavolo/.test(txt), `${n}: Tavolo in attesa del Croupier`);
  }
  await shotAll("attesa");

  // permessi senza partita
  await vietata(clients.Bob, { type: "newGame", config: { ladri: [] } }, "Bob prova ad aprire una partita", /Croupier/);

  step("Nuova partita dal Tavolo del GM");
  const g = gm();
  const righe = await g.page.$$eval(`${T} input[name="siede"]`, (es) => es.map((e) => ({ id: e.value, checked: e.checked, txt: e.closest("label").textContent.replace(/\s+/g, " ").trim() })));
  console.log("  ladri disponibili:", righe.map((r) => `${r.txt}${r.checked ? " [x]" : ""}`).join(" | "));
  check(righe.length >= 4, "il GM vede almeno 4 Ladri da far sedere");
  const ivoRiga = righe.find((r) => /Ivo/.test(r.txt));
  check(ivoRiga && !ivoRiga.checked && /nessun giocatore/.test(ivoRiga.txt), "Ivo (senza giocatore) non è spuntato di default");
  for (const r of righe) if (/^(Gino|Lola|Mario|Ivo)\b/.test(r.txt) && !r.checked) await g.page.check(`${T} input[name="siede"][value="${r.id}"]`);
  await clickCmd(g, "newGame");
  st = await until((x) => x?.fase === "setup", "fase setup");
  await sync();
  const L = Object.fromEntries(st.ladri.map((l) => [l.nome, l]));
  check(st.ladri.length === 4, "4 Ladri seduti", st.ladri.map((l) => l.nome));
  check(L.Gino.userId === clients.Alice.userId && L.Lola.userId === clients.Bob.userId && L.Mario.userId === clients.Carla.userId && L.Ivo.userId === null, "Ladri assegnati ai giocatori giusti (Ivo senza giocatore)");
  check(L.Lola.ricercato, "Lola è Ricercata");
  check(!L.Gino.coppiaPronta && L.Lola.coppiaPronta, "solo il Gangster deve scegliere la Coppia");
  checkCarte(st, "nuova partita");
  const inizi = await g.page.evaluate(() => game.messages.contents.filter((m) => m.flags?.["guardie-e-ladri"]?.effect === "inizio").map((m) => m.timestamp));
  check(inizi.length >= 1, "messaggio 'Nuova partita' in chat");
  T0 = Math.max(...inizi) - 1;
  for (const c of Object.values(clients)) await c.page.evaluate((t) => (window.__t0 = t), T0);
  check(await isDisabled(g, "distribuisci"), "Distribuisci disabilitato finché il Gangster non sceglie la Coppia");
  for (const n of ["Bob", "Carla"]) check(!(await hasCmd(clients[n], "coppiaGangster")), `${n} non vede il pulsante della Coppia del Gangster`);
  check(await hasCmd(clients.Alice, "coppiaGangster", { ladro: L.Gino.id }), "Alice vede il pulsante 'Prendi la Coppia'");
  await shotAll("setup");
  await layoutCheck("setup");

  step("Permessi in preparazione");
  await vietata(clients.Bob, { type: "coppiaGangster", ladro: L.Gino.id, valore: "5", semi: ["C", "Q"] }, "Bob sceglie la Coppia per Gino", /altro Ladro/);
  await vietata(clients.Bob, { type: "distribuisci" }, "Bob distribuisce le carte", /Croupier/);
  await vietata(clients.Carla, { type: "mostra", ladro: L.Lola.id, mostra: true }, "Carla mostra la mano di Lola", /altro Ladro/);
  await vietata(clients.Alice, { type: "reset" }, "Alice chiude la partita", /Croupier/);
  await vietata(clients.Alice, { type: "annulla" }, "Alice annulla l'ultima mossa", /Croupier/);

  step("Alice sceglie la Coppia del Gangster");
  const A = clients.Alice;
  const B = clients.Bob;
  const C = clients.Carla;
  // il modulo della Coppia sopravvive a una mossa di un altro giocatore?
  await A.page.selectOption(`${T} select[name="valoreG-${L.Gino.id}"]`, "9");
  await A.page.check(`${T} input[name="semeG-${L.Gino.id}"][value="Q"]`);
  await B.page.click(sel("mostra", { ladro: L.Lola.id }));
  await until((x) => x.ladri.find((l) => l.nome === "Lola").mostra, "Lola mostra (setup)");
  await sync();
  {
    const f = await A.page.evaluate((id) => ({ valore: document.querySelector(`#guardie-e-ladri-tavolo select[name="valoreG-${id}"]`)?.value, quadri: document.querySelector(`#guardie-e-ladri-tavolo input[name="semeG-${id}"][value="Q"]`)?.checked }), L.Gino.id);
    if (!check(f.valore === "9" && f.quadri, "la scelta della Coppia in corso resta dopo una mossa di Bob", f)) await shot(A, "coppia-azzerata");
  }
  await B.page.click(sel("mostra", { ladro: L.Lola.id }));
  await until((x) => !x.ladri.find((l) => l.nome === "Lola").mostra, "Lola nasconde (setup)");
  await sync();
  if (await A.page.isChecked(`${T} input[name="semeG-${L.Gino.id}"][value="Q"]`)) await A.page.uncheck(`${T} input[name="semeG-${L.Gino.id}"][value="Q"]`);
  // coppia con un solo seme: deve dare un avviso
  await notes(A);
  await A.page.selectOption(`${T} select[name="valoreG-${L.Gino.id}"]`, "7");
  await A.page.check(`${T} input[name="semeG-${L.Gino.id}"][value="C"]`);
  await clickCmd(A, "coppiaGangster", { ladro: L.Gino.id });
  await sleep(1200);
  let n = await notes(A);
  check(n.some((x) => /due semi/.test(x.m)), "con un solo seme compare l'avviso 'Scegli due semi diversi'", n);
  await A.page.selectOption(`${T} select[name="valoreG-${L.Gino.id}"]`, "7");
  if (!(await A.page.isChecked(`${T} input[name="semeG-${L.Gino.id}"][value="C"]`))) await A.page.check(`${T} input[name="semeG-${L.Gino.id}"][value="C"]`);
  await A.page.check(`${T} input[name="semeG-${L.Gino.id}"][value="P"]`);
  await clickCmd(A, "coppiaGangster", { ladro: L.Gino.id });
  st = await until((x) => x.ladri.find((l) => l.nome === "Gino").coppiaPronta, "coppia del Gangster");
  await sync();
  const gino = () => st.ladri.find((l) => l.nome === "Gino");
  check(gino().mano.includes("b:7C") && gino().mano.includes("b:7P"), "Gino ha 7♥ e 7♠", gino().mano);
  checkCarte(st, "coppia del Gangster");
  check(!(await isDisabled(g, "distribuisci")), "ora Distribuisci è abilitato");

  step("Distribuzione (GM)");
  await clickCmd(g, "distribuisci");
  st = await until((x) => x.fase === "lavoretti", "fase lavoretti");
  await sync();
  const mani = Object.fromEntries(st.ladri.map((l) => [l.nome, l.mano.length]));
  check(mani.Gino === 4 && mani.Lola === 3 && mani.Mario === 2 && mani.Ivo === 2, "carte in mano: Gino 4, Lola 3 (Ricercata), Mario 2, Ivo 2", mani);
  checkCarte(st, "distribuzione");
  await visCheck("dopo la distribuzione");
  await shotAll("distribuzione");
  await layoutCheck("distribuzione");

  step("Mostra alla Banda (Bob mostra la mano di Lola)");
  await B.page.click(`${sel("mostra", { ladro: L.Lola.id })}`);
  st = await until((x) => x.ladri.find((l) => l.nome === "Lola").mostra, "Lola mostra");
  await sync();
  await visCheck("Lola mostra la mano");
  await shot(A, "lola-mostra");
  await B.page.click(`${sel("mostra", { ladro: L.Lola.id })}`);
  st = await until((x) => !x.ladri.find((l) => l.nome === "Lola").mostra, "Lola nasconde");
  await sync();
  await visCheck("Lola nasconde di nuovo");

  step("Due azioni arrivate insieme al GM (stesso client, nessun socket)");
  {
    // il GM manda due mosse senza attendere la prima: entrambe devono essere applicate
    await g.page.evaluate(({ a, b }) => {
      game.gl.dispatch({ type: "mostra", ladro: a, mostra: true });
      game.gl.dispatch({ type: "mostra", ladro: b, mostra: true });
    }, { a: L.Ivo.id, b: L.Mario.id });
    await sleep(2500);
    st = await gmState();
    const m = Object.fromEntries(st.ladri.map((l) => [l.nome, l.mostra]));
    if (!check(m.Ivo && m.Mario, "due mosse consecutive del GM ('Mostra' di Ivo e di Mario) vengono applicate entrambe", m)) results.bugConcorrenzaGM = m;
    for (const id of [L.Ivo.id, L.Mario.id]) {
      await g.page.evaluate((id) => game.gl.dispatch({ type: "mostra", ladro: id, mostra: false }), id);
      await until((x) => !x.ladri.find((l) => l.id === id).mostra, "nascondi");
    }
    await sync();
  }

  // ---------------------------------------------------------------- Lavoretto 1
  step("Lavoretto 1: Gino e Mario in coppia (Banale)");
  for (const p of ["Alice", "Bob", "Carla"]) check(!(await hasCmd(clients[p], "lavorettoInizia")), `${p} non vede 'Inizia il Confronto'`);
  await g.page.selectOption(`${T} select[name="grado"]`, "banale");
  await g.page.fill(`${T} input[name="descrizione"]`, "Rapina nel vicolo");
  await g.page.check(`${T} input[name="partecipa"][value="${L.Gino.id}"]`);
  await g.page.check(`${T} input[name="partecipa"][value="${L.Mario.id}"]`);
  await clickCmd(g, "lavorettoInizia");
  st = await until((x) => x.confronto?.step === "flop", "flop L1");
  await sync();
  check(st.confronto.tavolo.length === 3 && st.confronto.attivi.length === 2, "flop: 3 carte sul tavolo, 2 Ladri attivi");
  checkCarte(st, "flop L1");
  await visCheck("flop L1");
  check(await hasCmd(A, "decidi", { ladro: L.Gino.id, scelta: "continua" }) && !(await hasCmd(A, "decidi", { ladro: L.Mario.id, scelta: "continua" })), "Alice ha i pulsanti solo per Gino");
  check(!(await hasCmd(B, "decidi")), "Bob (non partecipa) non ha pulsanti di decisione");
  check(!(await hasCmd(A, "avanza")), "Alice non ha 'Avanti' (solo GM)");
  await shotAll("L1-flop");
  await layoutCheck("L1 flop");

  await vietata(C, { type: "decidi", ladro: L.Gino.id, scelta: "ritira" }, "Carla ritira Gino", /altro Ladro/);
  await vietata(B, { type: "avanza" }, "Bob forza 'Avanti'", /Croupier/);
  await vietata(B, { type: "lavorettoInizia", grado: "banale", partecipanti: [L.Lola.id] }, "Bob inizia un Lavoretto", /Croupier/);

  // decisioni simultanee: Alice e Carla cliccano "Continuo" nello stesso istante
  {
    const at = Date.now() + 1500;
    const go = (cl, a) => cl.page.evaluate(({ at, a }) => new Promise((r) => setTimeout(() => (game.gl.dispatch(a), r()), Math.max(0, at - Date.now()))), { at, a });
    await Promise.all([notes(A), notes(C)]);
    await Promise.all([go(A, { type: "decidi", ladro: L.Gino.id, scelta: "continua" }), go(C, { type: "decidi", ladro: L.Mario.id, scelta: "continua" })]);
  }
  await sleep(3000);
  st = await gmState();
  if (!check(st.confronto.step === "turn", "dopo due 'Continuo' simultanei si passa al turn", { step: st.confronto.step, decisioni: st.confronto.decisioni })) {
    nota("decisione persa con click simultanei: la rifaccio", st.confronto.decisioni);
    results.bugConcorrenza = { passo, decisioni: st.confronto.decisioni };
    await shotAll("L1-decisione-persa");
    for (const [cl, id] of [[A, L.Gino.id], [C, L.Mario.id]]) if (!st.confronto.decisioni[id] && st.confronto.step === "flop") await clickCmd(cl, "decidi", { ladro: id, scelta: "continua" }, { allowMissing: true });
    st = await until((x) => x.confronto.step === "turn", "turn L1");
  }
  {
    const nA = await notes(A);
    const nC = await notes(C);
    check(!nA.length && !nC.length, "nessun avviso spurio dopo le decisioni simultanee", { Alice: nA, Carla: nC });
  }
  await sync();
  check(st.confronto.tavolo.length === 4, "turn: 4 carte sul tavolo");
  checkCarte(st, "turn L1");
  await clickCmd(A, "decidi", { ladro: L.Gino.id, scelta: "continua" });
  st = await until((x) => x.confronto.decisioni[L.Gino.id], "Gino continua al turn");
  await sync();
  check(!(await hasCmd(A, "decidi", { ladro: L.Gino.id })), "dopo la decisione Alice non ha più i pulsanti");
  await clickCmd(C, "decidi", { ladro: L.Mario.id, scelta: "continua" });
  st = await until((x) => x.confronto.step === "river", "river L1");
  await sync();
  check(st.confronto.tavolo.length === 5 && st.confronto.croupierMano.length === 2, "river: 5 carte, il Croupier ha 2 carte (Banale)");
  checkCarte(st, "river L1");
  await visCheck("river L1");
  await shotAll("L1-river");

  // Alice gioca: il pulsante è disabilitato finché non seleziona 1 carta
  check(await isDisabled(A, "gioca", { ladro: L.Gino.id }), "'Gioca 0/1' disabilitato senza selezione");
  st = await giocaRiver(st, [L.Gino.id]);
  await visCheck("L1 Gino ha giocato coperto");
  await shot(B, "L1-giocata-coperta");
  await shot(g, "L1-giocata-coperta");
  st = await giocaRiver(st, [L.Mario.id]);
  await vietata(C, { type: "croupierGioca", carte: st.confronto.croupierMano }, "Carla gioca per il Croupier", /Croupier/);
  await vietata(B, { type: "gioca", ladro: L.Mario.id, carte: [] }, "Bob gioca per Mario", /altro Ladro/);
  st = await croupierGioca();
  check(["esito", "bottino"].includes(st.confronto?.step) || !st.confronto, "Confronto risolto");
  checkCarte(st, "esito L1");
  await visCheck("esito L1");
  await shotAll("L1-esito");
  await layoutCheck("L1 esito");
  console.log(`  esito L1: ${st.confronto?.esito} (${st.confronto?.manoLadri?.nome} vs ${st.confronto?.manoCroupier?.nome})`);

  if (st.confronto?.esito === "successo") {
    step("L1: voto incassa/rilancia e divisione del Bottino");
    await clickCmd(A, "vota", { ladro: L.Gino.id, scelta: "rilancia" });
    st = await until((x) => x.confronto.voti[L.Gino.id] === "rilancia", "voto di Alice");
    await sync();
    check(st.confronto.step === "esito", "con un solo voto si aspetta il compagno");
    await clickCmd(C, "vota", { ladro: L.Mario.id, scelta: "incassa" });
    st = await until((x) => x.bottino || !x.confronto, "bottino L1");
    await sync();
    check(st.bottino?.carte.length === 3 && st.bottino.daScegliere === 0, "voti discordi: si incassa il Bottino Banale (3 carte)", st.bottino);
    checkCarte(st, "bottino L1");
    await shotAll("L1-bottino");
    await layoutCheck("L1 bottino");
    check(!(await hasCmd(B, "bottinoAssegna")), "Bob (non partecipante) non ha i pulsanti per dividere il Bottino");
    await vietata(B, { type: "bottinoAssegna", carta: st.bottino.carte[0], a: L.Gino.id }, "Bob divide il Bottino altrui", /altro Ladro|non puoi/i);
    const [b1, b2, b3] = st.bottino.carte;
    await clickCmd(A, "bottinoAssegna", { carta: b1, a: L.Gino.id });
    st = await until((x) => !x.bottino?.carte.includes(b1), "assegna 1");
    await sync();
    await clickCmd(C, "bottinoAssegna", { carta: b2, a: L.Mario.id });
    st = await until((x) => !x.bottino?.carte.includes(b2), "assegna 2");
    await sync();
    await clickCmd(C, "bottinoAssegna", { carta: b3, a: L.Mario.id });
    st = await until((x) => !x.bottino && !x.confronto, "fine L1");
    await sync();
    check(st.ladri.find((l) => l.nome === "Gino").mano.includes(b1) && st.ladri.find((l) => l.nome === "Mario").mano.includes(b3), "Bottino diviso come scelto");
  } else if (st.confronto?.esito === "fallimento") {
    step("L1: Fallimento accettato");
    check(!(await hasCmd(B, "accetta")), "Bob (non partecipa) non ha 'Accettare il Fallimento'");
    await clickCmd(A, "accetta");
    st = await until((x) => !x.confronto, "fine L1");
    await sync();
    nota("L1 fallito: voto incassa/rilancia e divisione del Bottino non provati in L1");
  }
  checkCarte(st, "fine L1");
  check(st.ladri.find((l) => l.nome === "Gino").lavoretto && st.ladri.find((l) => l.nome === "Mario").lavoretto, "Gino e Mario hanno fatto il Lavoretto");

  // ---------------------------------------------------------------- Lavoretto 2
  step("Lavoretto 2: Lola da sola (Tosto) — ritiro al turn, annulla, poi si gioca");
  const righeP = await g.page.$$eval(`${T} input[name="partecipa"]`, (es) => es.map((e) => e.value));
  check(!righeP.includes(L.Gino.id) && righeP.includes(L.Lola.id), "nella lista dei partecipanti restano solo i Ladri senza Lavoretto");
  await g.page.selectOption(`${T} select[name="grado"]`, "esagerato");
  await g.page.fill(`${T} input[name="descrizione"]`, "Furto al museo");
  await g.page.check(`${T} input[name="partecipa"][value="${L.Lola.id}"]`);
  await A.page.click(sel("mostra", { ladro: L.Gino.id }));
  await until((x) => x.ladri.find((l) => l.nome === "Gino").mostra, "Gino mostra");
  await sync();
  {
    const f = await g.page.evaluate((id) => {
      const q = (s) => document.querySelector(`#guardie-e-ladri-tavolo ${s}`);
      return { grado: q('select[name="grado"]')?.value, descrizione: q('input[name="descrizione"]')?.value, lola: q(`input[name="partecipa"][value="${id}"]`)?.checked };
    }, L.Lola.id);
    if (!check(f.grado === "esagerato" && f.descrizione === "Furto al museo" && f.lola, "il modulo del nuovo Lavoretto del GM resta compilato dopo una mossa di Alice", f)) await shot(g, "modulo-lavoretto-azzerato");
  }
  await A.page.click(sel("mostra", { ladro: L.Gino.id }));
  await until((x) => !x.ladri.find((l) => l.nome === "Gino").mostra, "Gino nasconde");
  await sync();
  await g.page.fill(`${T} input[name="descrizione"]`, "");
  if (await g.page.isChecked(`${T} input[name="partecipa"][value="${L.Lola.id}"]`)) await g.page.uncheck(`${T} input[name="partecipa"][value="${L.Lola.id}"]`);
  await g.page.selectOption(`${T} select[name="grado"]`, "tosto");
  await g.page.check(`${T} input[name="partecipa"][value="${L.Lola.id}"]`);
  await clickCmd(g, "lavorettoInizia");
  st = await until((x) => x.confronto?.step === "flop", "flop L2");
  await sync();
  await clickCmd(B, "decidi", { ladro: L.Lola.id, scelta: "continua" });
  st = await until((x) => x.confronto?.step === "turn", "turn L2");
  await sync();
  const manoLola = st.ladri.find((l) => l.nome === "Lola").mano;
  // ritiro senza aver selezionato la carta
  await notes(B);
  await clickCmd(B, "decidi", { ladro: L.Lola.id, scelta: "ritira" });
  await sleep(800);
  n = await notes(B);
  check(n.some((x) => /Seleziona la Carta/.test(x.m)), "ritiro al turn senza carta selezionata: avviso", n);
  check((await gmState()).confronto?.step === "turn", "lo stato non cambia");
  const persa = [...manoLola].sort((a, b) => valore(a) - valore(b))[0];
  await selCarta(B, persa, ".gl-side");
  await shot(B, "L2-ritiro-selezione");
  await clickCmd(B, "decidi", { ladro: L.Lola.id, scelta: "ritira" });
  st = await until((x) => !x.confronto, "Lola si ritira");
  await sync();
  const lolaR = st.ladri.find((l) => l.nome === "Lola");
  check(lolaR.mano.length === manoLola.length - 1 && !lolaR.mano.includes(persa) && st.mazzi.b.scarti.includes(persa), `ritiro al turn: Lola perde ${persa} (negli scarti)`);
  check(lolaR.lavoretto, "Lola ha consumato il suo Lavoretto");
  checkCarte(st, "ritiro al turn");
  const ultima = await B.page.evaluate(() => game.messages.contents.slice(-3).map((m) => m.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()));
  check(ultima.some((t) => /si ritira e perde una Carta/.test(t)), "messaggio in chat del ritiro", ultima);
  // il GM annulla: si torna al turn con la carta
  await clickCmd(g, "annulla");
  st = await until((x) => x.confronto?.step === "turn", "annulla");
  await sync();
  check(st.ladri.find((l) => l.nome === "Lola").mano.includes(persa) && !st.ladri.find((l) => l.nome === "Lola").lavoretto, "Annulla ultima mossa: Lola riavrà la carta e il Lavoretto");
  checkCarte(st, "dopo annulla");
  await notes(g);
  await clickCmd(g, "annulla");
  await sleep(1000);
  n = await notes(g);
  check(n.some((x) => /niente da annullare/.test(x.m)), "secondo Annulla: 'Non c'è niente da annullare'", n);
  await clickCmd(B, "decidi", { ladro: L.Lola.id, scelta: "continua" });
  st = await until((x) => x.confronto?.step === "river", "river L2");
  await sync();
  check(st.confronto.croupierMano.length === 4, "Tosto: il Croupier pesca 4 carte");
  await visCheck("river L2");
  st = await giocaRiver(st, [L.Lola.id]);
  check(st.confronto.giocate[L.Lola.id]?.length === 2 || st.confronto.step !== "river", "da sola Lola gioca 2 carte");
  st = await croupierGioca();
  await visCheck("esito L2");
  await shotAll("L2-esito");
  console.log(`  esito L2: ${st.confronto?.esito} (${st.confronto?.manoLadri?.nome} vs ${st.confronto?.manoCroupier?.nome})`);
  if (st.confronto?.esito === "fallimento") {
    step("L2: il baciamano di Lola");
    check(await hasCmd(B, "baciamano", { ladro: L.Lola.id }), "Bob vede il pulsante del baciamano");
    for (const p of ["Alice", "Carla"]) check(!(await hasCmd(clients[p], "baciamano")), `${p} non vede il baciamano`);
    const lola = st.ladri.find((l) => l.nome === "Lola");
    const gioc = st.confronto.giocate[L.Lola.id];
    if (lola.mano.length) {
      const migliore = [...lola.mano].sort((a, b) => valore(b) - valore(a))[0];
      const peggiore = [...gioc].sort((a, b) => valore(a) - valore(b))[0];
      await selCarta(B, migliore, ".gl-side");
      await selCarta(B, peggiore, ".gl-zona-ladri");
      await clickCmd(B, "baciamano", { ladro: L.Lola.id });
      st = await until((x) => x.confronto?.ladyUsata || !x.confronto, "baciamano");
      await sync();
      check(st.ladri.find((l) => l.nome === "Lola").mano.includes(peggiore), "baciamano: la carta giocata torna in mano");
      checkCarte(st, "baciamano");
      await shotAll("L2-baciamano");
      check(!(await hasCmd(B, "baciamano")), "il baciamano non è più disponibile");
    } else nota("Lola non ha carte in mano: baciamano non provato");
  }
  if (st.confronto?.esito === "fallimento") {
    await clickCmd(B, "accetta");
    st = await until((x) => !x.confronto, "fine L2");
  } else if (st.confronto?.esito === "successo") {
    step("L2: Successo, Bottino a scelta");
    await clickCmd(B, "vota", { ladro: L.Lola.id, scelta: "incassa" });
    st = await until((x) => x.bottino?.daScegliere === 2, "bottino a scelta");
    await sync();
    check(!(await hasCmd(A, "bottinoScegli")), "Alice non può scegliere il Bottino di Lola");
    const deck = st.mazzi.b.pesca;
    const lola = st.ladri.find((l) => l.nome === "Lola");
    // sceglie carte dello stesso valore di quelle in mano (per avere combinazioni dopo)
    const scelte = [];
    for (const m of lola.mano) for (const d of deck) if (scelte.length < 2 && valore(d) === valore(m) && !scelte.includes(d)) scelte.push(d);
    for (const d of deck) if (scelte.length < 2 && !scelte.includes(d)) scelte.push(d);
    await shot(B, "L2-scelta-bottino");
    await layoutCheck("L2 bottino a scelta");
    for (const x of scelte) await selCarta(B, x, ".gl-scelta");
    await clickCmd(B, "bottinoScegli", { ladro: L.Lola.id });
    st = await until((x) => !x.bottino && !x.confronto, "fine L2");
    check(scelte.every((x) => st.ladri.find((l) => l.nome === "Lola").mano.includes(x)), "Lola riceve le carte scelte", scelte);
  }
  await sync();
  checkCarte(st, "fine L2");

  // ---------------------------------------------------------------- Lavoretto 3 (GM per Ivo)
  step("Lavoretto 3: Ivo (senza giocatore, comandato dal GM)");
  await g.page.selectOption(`${T} select[name="grado"]`, "banale");
  await g.page.check(`${T} input[name="partecipa"][value="${L.Ivo.id}"]`);
  await clickCmd(g, "lavorettoInizia");
  st = await until((x) => x.confronto?.step === "flop", "flop L3");
  await sync();
  check(await hasCmd(g, "decidi", { ladro: L.Ivo.id, scelta: "continua" }), "il GM ha i pulsanti di Ivo");
  for (const p of ["Alice", "Bob", "Carla"]) check(!(await hasCmd(clients[p], "decidi")), `${p} non ha i pulsanti di Ivo`);
  await vietata(A, { type: "decidi", ladro: L.Ivo.id, scelta: "continua" }, "Alice decide per Ivo", /altro Ladro/);
  await clickCmd(g, "avanza");
  st = await until((x) => x.confronto?.step === "turn", "avanza turn L3");
  await clickCmd(g, "avanza");
  st = await until((x) => x.confronto?.step === "river", "avanza river L3");
  await sync();
  await visCheck("river L3");
  st = await giocaRiver(st, [L.Ivo.id]);
  st = await croupierGioca();
  console.log(`  esito L3: ${st.confronto?.esito}`);
  if (st.confronto?.esito === "successo") {
    step("L3: Rilancio (GM per Ivo)");
    await clickCmd(g, "vota", { ladro: L.Ivo.id, scelta: "rilancia" });
    st = await until((x) => x.confronto?.round === 2 || !x.confronto, "rilancio");
    await sync();
    check(st.confronto?.round === 2 && st.confronto.step === "flop" && st.confronto.tavolo.length === 3 && st.confronto.giocate[L.Ivo.id]?.length === 2, "Rilancio: nuovo flop, le carte di Ivo restano giocate");
    checkCarte(st, "rilancio");
    await visCheck("rilancio L3");
    await shotAll("L3-rilancio");
    await clickCmd(g, "decidi", { ladro: L.Ivo.id, scelta: "continua" });
    st = await until((x) => x.confronto?.step === "river", "river rilancio");
    await sync();
    check(st.confronto.tavolo.length === 5, "nel Rilancio 4ª e 5ª carta escono insieme");
    check(!(await hasCmd(g, "gioca", { ladro: L.Ivo.id })), "nel Rilancio non si rigiocano carte");
    st = await croupierGioca();
    console.log(`  esito rilancio: ${st.confronto?.esito ?? "chiuso"}`);
    if (st.bottino?.daScegliere === 0 && st.bottino.carte.length) {
      // solo: il Bottino va a Ivo da sé
    }
  }
  if (st.confronto?.esito === "fallimento") {
    await clickCmd(g, "accetta");
    st = await until((x) => !x.confronto, "fine L3");
  }
  st = await until((x) => !x.confronto && !x.bottino, "fine L3");
  await sync();
  checkCarte(st, "fine L3");
  check(st.storico.length === 3, "3 Lavoretti nello storico", st.storico);
  await shotAll("lavoretti-fatti");

  // ---------------------------------------------------------------- Fixer
  step("Il Fixer");
  await vietata(A, { type: "faseFixer" }, "Alice passa al Fixer", /Croupier/);
  await clickCmd(g, "faseFixer");
  st = await until((x) => x.fase === "fixer", "fase fixer");
  await sync();
  checkCarte(st, "fixer");
  await shotAll("fixer");
  await layoutCheck("fixer");
  for (const p of ["Alice", "Bob", "Carla"]) check(!(await hasCmd(clients[p], "compra", { gratis: 1 })) && !(await hasCmd(clients[p], "faseColpo")), `${p} non vede 'Regala' né 'Passa al Grande Colpo'`);
  await vietata(B, { type: "compra", oggetto: "mappa", carte: [], gratis: true }, "Bob si fa regalare un articolo", /altro Ladro|Croupier|non puoi/i);

  // Bob prova a pagare con le carte NASCOSTE di Alice (via console)
  {
    const gm1 = st.ladri.find((l) => l.nome === "Gino");
    const coppiaGino = await trova(["coppia"], gm1.mano.filter((x) => !x.startsWith("j:")));
    if (coppiaGino && !gm1.mostra) {
      const prima = JSON.stringify(st);
      await notes(B);
      await B.page.evaluate((a) => game.gl.dispatch(a), { type: "compra", oggetto: "fumogeni", carte: coppiaGino, destinatario: L.Lola.id });
      await sleep(1500);
      const dopo = await gmState();
      if (!check(JSON.stringify(dopo) === prima, "Bob NON può pagare il Fixer con le carte nascoste di Gino (Alice)", { pagato: coppiaGino, acquisti: dopo.acquisti })) {
        results.bugPagaAltri = { carte: coppiaGino };
        await shotAll("bob-paga-con-carte-di-alice");
        await clickCmd(g, "annulla");
        st = await until((x) => !x.acquisti.includes("fumogeni"), "annulla acquisto abusivo");
        await sync();
      }
    } else nota("Gino non ha una coppia: test 'pagare con carte altrui' saltato");
  }

  // acquisti pagati dai giocatori, ognuno con la propria mano
  const ordine = [
    ["attrezzi", ["coppiaFigure"]],
    ["fumogeni", ["coppia"]],
    ["mappa", ["tris"]],
    ["documenti", ["trisFigure"]],
    ["personale", ["full", "colore"]],
    ["combinazione", ["poker", "scala"]],
    ["auto", ["poker", "scala"]],
  ];
  let acquistati = 0;
  for (const p of ["Alice", "Bob", "Carla"]) {
    if (acquistati >= 2) break;
    st = await gmState();
    const cl = clients[p];
    const mio = st.ladri.find((l) => l.userId === cl.userId);
    for (const [k, tipi] of ordine) {
      if (st.acquisti.includes(k)) continue;
      const carte = await trova(tipi, mio.mano);
      if (!carte) continue;
      step(`Fixer: ${p} compra ${k} con ${carte.join(", ")}`);
      check(await isDisabled(cl, "compra", { oggetto: k }), "'Paga' disabilitato senza selezione");
      for (const x of carte) await selCarta(cl, x, ".gl-side");
      check(!(await isDisabled(cl, "compra", { oggetto: k })), "'Paga' abilitato con la combinazione giusta");
      if (await cl.page.locator(`${T} select[name="dest-${k}"]`).count()) await cl.page.selectOption(`${T} select[name="dest-${k}"]`, mio.id);
      const jollyPrima = mio.mano.filter((x) => x.startsWith("j:")).length;
      await shot(cl, `fixer-${k}`);
      await clickCmd(cl, "compra", { oggetto: k });
      st = await until((x) => x.acquisti.includes(k), `acquisto ${k}`);
      await sync();
      const dopo = st.ladri.find((l) => l.id === mio.id);
      check(carte.every((x) => !dopo.mano.includes(x) || x.startsWith("j:")), `${k}: carte pagate tolte dalla mano`);
      if (["fumogeni", "attrezzi"].includes(k)) check(dopo.mano.filter((x) => x.startsWith("j:")).length >= jollyPrima + (carte.some((x) => x.startsWith("j:")) ? 0 : 1), `${k}: ${mio.nome} riceve il Jolly`);
      checkCarte(st, `acquisto ${k}`);
      acquistati++;
      break;
    }
  }
  if (!acquistati) {
    step("Fixer: nessun giocatore ha una combinazione, il GM regala i Fumogeni");
    nota("nessun acquisto pagabile con le mani dei giocatori: uso 'Regala'");
  }
  if (!st.acquisti.includes("fumogeni")) {
    await g.page.selectOption(`${T} select[name="dest-fumogeni"]`, L.Ivo.id);
    await clickCmd(g, "compra", { oggetto: "fumogeni", gratis: 1 });
    st = await until((x) => x.acquisti.includes("fumogeni"), "regala fumogeni");
    await sync();
    checkCarte(st, "regalo fumogeni");
  }
  await shotAll("fixer-acquisti");

  // un giocatore si scollega: il GM deve vedere la sua mano
  step("Carla si scollega: il GM comanda e vede Mario");
  await C.page.close();
  await C.ctx.close();
  await sleep(2500);
  await sync();
  st = await gmState();
  {
    const d = await domVis(g);
    const mario = st.ladri.find((l) => l.nome === "Mario");
    const dm = d.ladri.find((x) => x.nome === "Mario");
    check(dm && dm.up === mario.mano.length, "il GM vede la mano di Mario mentre Carla è scollegata", dm);
    check(await hasCmd(g, "mostra", { ladro: mario.id }), "il GM può comandare Mario (Mostra alla Banda)");
    await shot(g, "carla-scollegata");
  }
  delete clients.Carla;
  const C2 = await login("Carla");
  clients.Carla = C2;
  await sync();
  await visCheck("Carla rientra");

  // ---------------------------------------------------------------- Grande Colpo
  step("Grande Colpo: Accesso");
  await clickCmd(g, "faseColpo");
  st = await until((x) => x.fase === "colpo", "fase colpo");
  await sync();
  await shotAll("colpo");
  await layoutCheck("colpo");
  // Accesso Teatrale (gratis, allerta le Guardie) dal client di Carla
  await clickCmd(C2, "accesso", { tipo: "teatrale" });
  st = await until((x) => x.colpo.accesso, "accesso");
  await sync();
  const attesoG = st.acquisti.includes("personale") ? 2 : 4;
  check(st.colpo.accesso === "teatrale" && st.colpo.guardie === attesoG && st.mazzetto.length === attesoG * 3, `Accesso Teatrale: ${attesoG} Guardie, Mazzetto ${attesoG * 3}`, { guardie: st.colpo.guardie, mazzetto: st.mazzetto.length });
  checkCarte(st, "accesso");
  await visCheck("dopo l'Accesso");

  {
    // il Diversivo lo fa il primo Ladro di un giocatore che ha ancora carte
    const cand = [["Lola", B, C2], ["Gino", A, B], ["Mario", C2, A]].find(([nm]) => st.ladri.find((l) => l.nome === nm).mano.length);
    for (const [nm, cl] of [["Lola", B], ["Gino", A], ["Mario", C2]])
      if (!st.ladri.find((l) => l.nome === nm).mano.length) check(!(await hasCmd(cl, "diversivo", { ladro: L[nm].id })), `${nm} senza carte: niente pulsante Diversivo`);
    if (!cand) nota("nessun Ladro dei giocatori ha carte: Diversivo non provato");
    else {
      const [nm, cl, altro] = cand;
      const id = L[nm].id;
      step(`Grande Colpo: Diversivo di ${nm} (${cl.nome})`);
      const altriId = Object.values(L).filter((l) => l.id !== id).map((l) => l.id);
      check(await hasCmd(cl, "diversivo", { ladro: id }) && !(await Promise.all(altriId.map((x) => hasCmd(cl, "diversivo", { ladro: x })))).some(Boolean), `${cl.nome} ha solo il Diversivo di ${nm}`);
      await vietata(altro, { type: "diversivo", ladro: id }, `${altro.nome} fa il Diversivo di ${nm}`, /altro Ladro/);
      const prima = st;
      await clickCmd(cl, "diversivo", { ladro: id });
      st = await until((x) => x.colpo.diversivo.includes(id), "diversivo");
      await sync();
      check(st.ladri.find((l) => l.id === id).mano.length === prima.ladri.find((l) => l.id === id).mano.length - 1, `Diversivo: ${nm} perde 1 carta`);
      check(st.mazzetto.length === Math.max(0, prima.mazzetto.length - prima.colpo.guardie), "Diversivo: il Mazzetto perde tante carte quante le Guardie", { prima: prima.mazzetto.length, dopo: st.mazzetto.length });
      checkCarte(st, "diversivo");
      check(!(await hasCmd(cl, "diversivo", { ladro: id })), `${nm} non può rifare il Diversivo`);
      await shotAll("diversivo");
    }
  }

  step("GM: Jolly per l'interpretazione a Ivo");
  await g.page.selectOption(`${T} select[name="jollyA"]`, L.Ivo.id);
  const jPrima = st.jolly.length;
  if (jPrima) {
    await clickCmd(g, "daiJolly");
    st = await until((x) => x.jolly.length === jPrima - 1, "jolly a Ivo");
    await sync();
    check(st.ladri.find((l) => l.nome === "Ivo").mano.some((x) => x.startsWith("j:")), "Ivo riceve un Jolly");
    checkCarte(st, "jolly");
    const vJ = await g.page.$eval(`${T} select[name="jollyA"]`, (e) => e.value);
    if (!check(vJ === L.Ivo.id, "dopo 'Dai un Jolly' il menu resta sul Ladro scelto (Ivo)", { selezionato: st.ladri.find((l) => l.id === vJ)?.nome })) await shot(g, "menu-jolly-azzerato");
    await g.page.selectOption(`${T} select[name="jollyA"]`, L.Ivo.id);
    await notes(g);
    await clickCmd(g, "daiJolly");
    await sleep(1000);
    n = await notes(g);
    check(n.some((x) => /già ricevuto/.test(x.m)), "secondo Jolly nella stessa Fase: avviso", n);
  }
  await vietata(A, { type: "daiJolly", ladro: L.Gino.id }, "Alice si dà un Jolly", /Croupier/);

  step("Grande Colpo: Scasso");
  // tutti mostrano la mano, così chi paga può usare carte di mani diverse
  for (const [cl, id] of [[A, L.Gino.id], [B, L.Lola.id], [C2, L.Mario.id], [g, L.Ivo.id]]) {
    await cl.page.click(sel("mostra", { ladro: id }));
    await until((x) => x.ladri.find((l) => l.id === id).mostra, `mostra ${id}`);
  }
  st = await sync();
  await visCheck("tutti mostrano");
  const tutte = st.ladri.flatMap((l) => l.mano);
  let tipoScasso = "nessuno";
  let carteScasso = null;
  if (st.acquisti.includes("attrezzi")) {
    carteScasso = await trova(["trisFigure"], tutte);
    if (carteScasso) tipoScasso = "tecnico";
  }
  if (!carteScasso) {
    carteScasso = await trova(["pokerFigure", "doppiaCoppia"], tutte);
    if (carteScasso) tipoScasso = "brutale";
  }
  if (carteScasso && tutte.length - carteScasso.length < 2) {
    nota(`Scasso ${tipoScasso} possibile ma lascerebbe la Banda senza carte per la Fuga: si rinuncia`);
    tipoScasso = "nessuno";
    carteScasso = null;
  }
  console.log(`  scasso scelto: ${tipoScasso} ${carteScasso ?? ""}`);
  if (tipoScasso !== "nessuno") {
    for (const x of carteScasso) await selCarta(A, x, ".gl-side");
    await shot(A, "scasso-selezione");
    await clickCmd(A, "scasso", { tipo: tipoScasso });
  } else {
    nota("nessuna combinazione per lo Scasso: la Banda rinuncia (a mani vuote)");
    await clickCmd(A, "scasso", { tipo: "nessuno" });
  }
  st = await until((x) => x.colpo.scasso, "scasso");
  await sync();
  check(st.bottinoFinale === (tipoScasso !== "nessuno"), `Scasso ${tipoScasso}: Bottino Finale ${st.bottinoFinale}`);
  checkCarte(st, "scasso");
  await shotAll("scasso");
  for (const [cl, id] of [[A, L.Gino.id], [B, L.Lola.id], [C2, L.Mario.id], [g, L.Ivo.id]]) {
    await cl.page.click(sel("mostra", { ladro: id }));
    await until((x) => !x.ladri.find((l) => l.id === id).mostra, `nascondi ${id}`);
  }
  await sync();
  check(!(await hasCmd(A, "faseFuga")), "Alice non ha 'Inizia la Grande Fuga'");
  await vietata(A, { type: "faseFuga" }, "Alice avvia la Fuga", /Croupier/);

  // ---------------------------------------------------------------- Grande Fuga
  step("Grande Fuga");
  const manoMario = st.ladri.find((l) => l.nome === "Mario").mano.length;
  const mz = st.mazzetto.length;
  await clickCmd(g, "faseFuga");
  st = await until((x) => x.fase === "fuga" || x.fase === "epilogo", "fase fuga");
  await sync();
  check(st.ladri.find((l) => l.nome === "Mario").mano.length === manoMario + 1, "Meccanico: Mario pesca 1 carta");
  checkCarte(st, "inizio fuga");
  if (st.fase === "fuga") {
    check(st.mazzetto.length === mz + 4 - (st.acquisti.includes("auto") ? 4 : 0), "il Mazzetto riceve 1 carta per Ladro", { prima: mz, dopo: st.mazzetto.length });
    await visCheck("flop della Fuga (la Banda vede tutte le mani)");
    await shotAll("fuga-flop");
    await layoutCheck("fuga flop");
    // tre giocatori decidono insieme
    await Promise.all([
      clickCmd(A, "decidi", { ladro: L.Gino.id, scelta: "continua" }),
      clickCmd(B, "decidi", { ladro: L.Lola.id, scelta: "continua" }),
      clickCmd(C2, "decidi", { ladro: L.Mario.id, scelta: "continua" }),
    ]);
    await sleep(3000);
    st = await gmState();
    const dec = st.confronto?.decisioni ?? {};
    const mancano = [L.Gino.id, L.Lola.id, L.Mario.id].filter((id) => !dec[id]);
    if (!check(!mancano.length, "tre 'Continuo' simultanei nella Fuga: nessuna decisione persa", { decisioni: dec })) {
      results.bugConcorrenza2 = { decisioni: dec };
      for (const id of mancano) await clickCmd(chi(st, id), "decidi", { ladro: id, scelta: "continua" }, { allowMissing: true });
    }
    await clickCmd(g, "decidi", { ladro: L.Ivo.id, scelta: "continua" });
    st = await until((x) => x.confronto?.step === "river" || x.fase === "epilogo", "river fuga");
    await sync();
  }
  if (st.fase === "fuga") {
    check(st.confronto.tavolo.length === 5, "Fuga: 4ª e 5ª carta insieme");
    await vietata(C2, { type: "croupierGioca", carte: st.mazzetto.slice(0, 2) }, "Carla gioca per il Croupier", /Croupier/);
    // Bob gioca per la Banda con 2 carte da mani diverse (Suggerisci)
    await clickCmd(B, "suggerisci", { ladro: "banda" });
    await sleep(300);
    const s = await selezionate(B);
    check(s.length === 2, "Suggerisci della Banda: 2 carte", s);
    await clickCmd(B, "gioca");
    st = await until((x) => x.confronto?.giocate?.banda, "la Banda gioca");
    await sync();
    checkCarte(st, "banda gioca");
    await visCheck("la Banda ha giocato");
    await shotAll("fuga-banda-gioca");
    st = await croupierGioca();
    checkCarte(st, "esito fuga");
    await shotAll("fuga-esito");
    console.log(`  esito Fuga: ${st.fase === "epilogo" ? st.esito.tipo : st.confronto.esito}`);
    if (st.fase === "fuga" && st.confronto?.esito === "fallimento") {
      step("Fuga: Fallimento");
      const lola = st.ladri.find((l) => l.nome === "Lola");
      if (st.confronto.attivi.includes(lola.id) && !st.confronto.ladyUsata) {
        const tutteB = st.ladri.flatMap((l) => l.mano);
        if (tutteB.length) {
          const m = [...tutteB].sort((a, b) => valore(b) - valore(a))[0];
          const gc = [...st.confronto.giocate.banda].sort((a, b) => valore(a) - valore(b))[0];
          await selCarta(B, m, ".gl-side");
          await selCarta(B, gc, ".gl-zona-ladri");
          await clickCmd(B, "baciamano", { ladro: lola.id });
          st = await until((x) => x.confronto?.ladyUsata || x.fase === "epilogo", "baciamano fuga");
          await sync();
          checkCarte(st, "baciamano fuga");
        }
      }
      if (st.fase === "fuga" && st.confronto?.esito === "fallimento") {
        if (await hasCmd(A, "allIn")) {
          step("Fuga: All-in");
          await clickCmd(A, "allIn");
          st = await until((x) => x.confronto?.round === "allin", "all-in");
          await sync();
          check(st.confronto.step === "river" && st.confronto.tavolo.length === 5 && st.bottinoFinale === false, "All-in: 5 nuove carte, si rinuncia al Bottino");
          checkCarte(st, "all-in");
          await visCheck("all-in");
          await shotAll("fuga-allin");
          st = await croupierGioca();
          checkCarte(st, "esito all-in");
        }
        if (st.fase === "fuga" && st.confronto?.esito === "fallimento") {
          await clickCmd(A, "accetta");
          st = await until((x) => x.fase === "epilogo", "arresto");
        }
      }
    }
  }
  st = await until((x) => x.fase === "epilogo", "epilogo");
  await sync();
  step("Epilogo");
  {
    // la chat della partita (testo), per il rapporto
    results.chat = await A.page.evaluate((t0) => game.messages.contents.filter((m) => m.timestamp >= t0).map((m) => m.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()), T0);
  }
  check(!!st.esito?.tipo && !st.confronto, `Epilogo: ${st.esito?.tipo}`);
  checkCarte(st, "epilogo");
  for (const c of Object.values(clients)) {
    const txt = await c.page.locator(T).innerText();
    check(/Al termine dell'avventura/.test(txt) && txt.includes(st.esito.testo), `${c.nome}: Tavolo mostra l'Epilogo`);
  }
  await shotAll("epilogo");
  await layoutCheck("epilogo");
  await vietata(A, { type: "decidi", ladro: L.Gino.id, scelta: "continua" }, "mossa a partita finita", /finita|Confronto/);

  // chat: nessun messaggio duplicato (p.es. due client GM che eseguono la stessa azione)
  const msgs = await g.page.evaluate((t0) => game.messages.contents.filter((m) => m.timestamp >= t0).map((m) => ({ t: m.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), at: m.timestamp })), T0);
  const dup = msgs.filter((m, i) => i && msgs[i - 1].t === m.t && Math.abs(m.at - msgs[i - 1].at) < 2000 && !/posa una Carta coperta|vota/.test(m.t));
  check(!dup.length, "nessun messaggio di chat duplicato", dup.slice(0, 5));
}

async function fine() {
  step("Pulizia: chiusura della partita dal Tavolo del GM");
  try {
    const g = gm();
    if (g && (await gmState())) {
      if (await hasCmd(g, "reset")) {
        await clickCmd(g, "reset");
        const dlg = g.page.locator('.application.dialog button[data-action="yes"], dialog button[data-action="yes"]');
        await dlg.first().waitFor({ timeout: 5000 });
        await shot(g, "conferma-chiusura");
        await dlg.first().click();
      } else await g.page.evaluate(() => game.gl.dispatch({ type: "reset" }));
      await until((x) => x === null, "reset finale", 8000).catch(async () => {
        await g.page.evaluate(() => game.gl.dispatch({ type: "reset" }));
        await until((x) => x === null, "reset finale (dispatch)");
      });
      check(true, "partita chiusa");
    }
  } catch (e) {
    check(false, "pulizia finale", String(e));
  }
  await browser?.close();
  const out = path.join(SHOTS, "risultati.json");
  writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`\nFallimenti: ${results.fallimenti.length} · errori/avvisi console: ${results.console.length} · problemi di layout: ${results.layout.length}`);
  console.log(`Risultati: ${out}`);
}

try {
  await main();
} catch (e) {
  console.error("\nINTERROTTO:", e);
  results.interrotto = { passo, errore: String(e?.stack ?? e) };
  for (const c of Object.values(clients)) if (!c.page.isClosed()) await shot(c, "interrotto").catch(() => {});
} finally {
  await fine();
  process.exitCode = results.fallimenti.length || results.interrotto ? 1 : 0;
}
