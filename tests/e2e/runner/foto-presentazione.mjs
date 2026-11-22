// Scatta gli screenshot del Tavolo per la presentazione (Croupier da solo: comanda tutti i Ladri).
//   node foto-presentazione.mjs <cartella di uscita>
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "foto";
mkdirSync(OUT, { recursive: true });
const URL = "http://localhost:30000";
const b = await chromium.launch({ channel: "chrome", headless: true });

// schermata d'ingresso
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(`${URL}/join`);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: join(OUT, "ingresso.png") });
  await ctx.close();
}

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(`${URL}/join`);
await p.waitForSelector('select[name="userId"]');
await p.$eval('select[name="userId"]', (s) => {
  const o = [...s.options].find((x) => x.textContent.trim() === "Gamemaster");
  o.disabled = false; // il GM può risultare "già collegato" dall'app desktop
  s.value = o.value;
});
await p.click('button[name="join"]');
await p.waitForURL(/game/);
await p.waitForFunction(() => window.game?.ready, null, { timeout: 60000 });
await p.waitForTimeout(2500);
await p.evaluate(() => {
  document.querySelectorAll(".tour, .tour-overlay, .tour-fadeout").forEach((e) => e.remove());
  ui.notifications?.clear?.();
});

const ev = (fn, arg) => p.evaluate(fn, arg);
const pausa = (ms = 700) => p.waitForTimeout(ms);
const st = () => ev(() => game.gl.state);
const d = async (a) => {
  await ev((a) => game.gl.dispatch(a), a);
  await pausa(600);
};
const tavolo = async (nome) => {
  await ev(() => {
    game.gl.openTable();
    document.querySelectorAll("#notifications li, .notification").forEach((e) => e.remove());
  });
  await pausa(900);
  await p.locator("#guardie-e-ladri-tavolo").screenshot({ path: join(OUT, `${nome}.png`) });
  console.log("foto", nome);
};

// nuova partita
await d({ type: "reset" });
const ladri = await ev(() =>
  game.actors
    .filter((a) => a.type === "ladro")
    .map((a) => ({ id: a.id, nome: a.name, classe: a.system.classe, ricercato: a.system.ricercato, userId: game.users.find((u) => !u.isGM && a.testUserPermission(u, "OWNER"))?.id ?? null })),
);
const id = (n) => ladri.find((l) => l.nome === n).id;
await d({ type: "newGame", config: { ladri, seed: 20261122 } });
await d({ type: "coppiaGangster", ladro: id("Gino"), valore: "9", semi: ["C", "P"] });
await d({ type: "distribuisci" });

/** Gioca un Lavoretto fino all'esito, scegliendo le carte migliori. */
async function lavoretto(grado, nomi, { fotoFlop, fotoEsito, croupierPeggio = false } = {}) {
  await d({ type: "lavorettoInizia", grado, partecipanti: nomi.map(id), descrizione: grado === "tosto" ? "un quadro dalla Galleria Civica" : "una Lancia Aurelia al mercato" });
  if (fotoFlop) await tavolo(fotoFlop);
  for (let k = 0; k < 2; k++) for (const n of nomi) await d({ type: "decidi", ladro: id(n), scelta: "continua" });
  const s = await st();
  for (const n of nomi) {
    const carte = await ev(
      ({ ladro, tav, nCarte }) => {
        const l = game.gl.state.ladri.find((x) => x.id === ladro);
        if (nCarte === 2) return game.gl.carte.migliorCoppia(l.mano, tav).carte;
        let best = null;
        for (const c of l.mano) {
          const m = game.gl.carte.migliorMano([c, ...tav]);
          if (!best || m.punti.join() > best.m.punti.join()) best = { c, m };
        }
        return [best.c];
      },
      { ladro: id(n), tav: s.confronto.tavolo, nCarte: nomi.length === 1 ? 2 : 1 },
    );
    await d({ type: "gioca", ladro: id(n), carte });
  }
  const s2 = await st();
  const cm = s2.confronto.croupierMano;
  const crou = croupierPeggio ? cm.slice(0, 2) : await ev(({ cm, tav }) => game.gl.carte.migliorCoppia(cm, tav).carte, { cm, tav: s2.confronto.tavolo });
  await d({ type: "croupierGioca", carte: crou });
  if (fotoEsito) await tavolo(fotoEsito);
  return (await st()).confronto?.esito;
}

let esito = await lavoretto("discreto", ["Gino", "Lola"], { fotoFlop: "lavoretto_flop", fotoEsito: "lavoretto_esito", croupierPeggio: true });
if (esito === "successo") {
  for (const n of ["Gino", "Lola"]) await d({ type: "vota", ladro: id(n), scelta: "rilancia" });
  await tavolo("rilancio");
  await d({ type: "avanza" });
  const s = await st();
  await d({ type: "croupierGioca", carte: s.confronto.croupierMano.slice(0, 2) });
  if ((await st()).confronto?.esito === "fallimento") await d({ type: "accetta" });
  if ((await st()).bottino) await d({ type: "bottinoDividi" });
} else {
  await d({ type: "accetta" });
}
esito = await lavoretto("tosto", ["Mario"], { croupierPeggio: true });
if (esito === "successo") {
  await d({ type: "vota", ladro: id("Mario"), scelta: "incassa" });
  await tavolo("bottino");
  const pesca = (await st()).mazzi.b.pesca;
  const figure = pesca.filter((c) => /[JQK]/.test(c.split(":")[1][0]));
  await d({ type: "bottinoScegli", ladro: id("Mario"), carte: (figure.length >= 2 ? figure : pesca).slice(0, 2) });
} else await d({ type: "accetta" });
if ((await st()).fase !== "lavoretti" || (await st()).confronto || (await st()).bottino) throw new Error("Lavoretti non chiusi");

// Fixer
await d({ type: "faseFixer" });
await d({ type: "compra", oggetto: "mappa", gratis: true });
await d({ type: "compra", oggetto: "attrezzi", gratis: true, destinatario: id("Ivo") });
// seleziona una coppia, se c'è, per mostrare il pulsante attivo
await ev(() => {
  const st = game.gl.state;
  const tutte = st.ladri.flatMap((l) => l.mano);
  const c = game.gl.carte.trovaCombinazione("coppia", tutte);
  if (c) game.gl.GLTavolo.instance.sel = new Set(c);
});
await tavolo("fixer");
await ev(() => game.gl.GLTavolo.instance.sel.clear());

// Grande Colpo
await d({ type: "faseColpo" });
await tavolo("colpo_accesso");
await d({ type: "accesso", tipo: "teatrale" });
await d({ type: "diversivo", ladro: id("Lola") });
await tavolo("colpo");
const tutte = (await st()).ladri.flatMap((l) => l.mano);
const tris = await ev((t) => game.gl.carte.trovaCombinazione("trisFigure", t), tutte);
if (tris) await d({ type: "scasso", tipo: "tecnico", carte: tris });
else await d({ type: "scasso", tipo: "nessuno" });

// Grande Fuga
await d({ type: "faseFuga" });
let s = await st();
if (s.confronto) {
  await tavolo("fuga_flop");
  await d({ type: "avanza" });
  s = await st();
  const mano = s.ladri.flatMap((l) => l.mano);
  const due = await ev(({ mano, tav }) => game.gl.carte.migliorCoppia(mano, tav).carte, { mano, tav: s.confronto.tavolo });
  await d({ type: "gioca", carte: due });
  s = await st();
  if (s.confronto) {
    const cr = s.mazzetto.length > 2 ? await ev(({ m, tav }) => game.gl.carte.migliorCoppia(m, tav).carte, { m: s.mazzetto, tav: s.confronto.tavolo }) : s.mazzetto.slice(0, 2);
    await d({ type: "croupierGioca", carte: cr });
    await tavolo("fuga");
  }
  s = await st();
  if (s.confronto?.esito === "fallimento") {
    await d({ type: "allIn" });
    s = await st();
    await d({ type: "croupierGioca", carte: s.mazzetto.slice(0, 2) });
    if ((await st()).confronto) await d({ type: "accetta" });
  }
}
await tavolo("epilogo");

// Guida e scheda
await ev(() => game.gl.GLTavolo.instance?.minimize());
for (const pag of ["intro", "regole", "classi", "crediti"]) {
  await ev((pag) => game.gl.openGuida(pag), pag);
  await pausa(900);
  await p.locator("#guardie-e-ladri-guida").screenshot({ path: join(OUT, `guida_${pag}.png`) });
  console.log("foto guida", pag);
}
await ev(() => game.gl.GLGuida?.instance?.close?.() ?? document.querySelector("#guardie-e-ladri-guida [data-action=close]")?.click());
await ev(() => game.actors.getName("Lola").sheet.render(true));
await pausa(1200);
await p.locator(".gl-sheet").first().screenshot({ path: join(OUT, "scheda.png") });
await ev(() => ui.sidebar.changeTab?.("chat", "primary"));
await pausa(500);
await p.screenshot({ path: join(OUT, "schermo.png") });
await d({ type: "reset" });
await b.close();
console.log("fatto");
