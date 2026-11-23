// Rigioca in Foundry, mossa per mossa e con il Tavolo aperto, le partite registrate da tests/sim/esporta.mjs,
// e controlla che lo stato salvato da Foundry coincida con quello atteso dopo ogni mossa.
//   node rigioca-in-foundry.mjs ../../sim/partite.json
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const partite = JSON.parse(readFileSync(process.argv[2] ?? "../../sim/partite.json", "utf8"));
const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errori = [];
p.on("pageerror", (e) => errori.push(String(e)));
p.on("console", (m) => m.type() === "error" && errori.push(m.text()));
await p.goto("http://localhost:30000/join");
await p.waitForSelector('select[name="userId"]');
await p.$eval('select[name="userId"]', (s) => {
  const o = [...s.options].find((x) => x.textContent.trim() === "Gamemaster");
  o.disabled = false;
  s.value = o.value;
});
await p.click('button[name="join"]');
await p.waitForURL(/game/);
await p.waitForFunction(() => window.game?.ready, null, { timeout: 60000 });
await p.waitForTimeout(2000);
await p.evaluate(async () => {
  const { impronta } = await import("/systems/guardie-e-ladri/tests/sim/arbitro.mjs");
  window.__impronta = impronta;
  game.gl.openTable();
});

let totale = 0;
let diverse = 0;
for (const [i, partita] of partite.entries()) {
  await p.evaluate(() => game.gl.dispatch({ type: "reset" }));
  await p.waitForFunction(() => !game.gl.state);
  const msg0 = await p.evaluate(() => game.messages.size);
  const errPrima = errori.length;
  let ok = 0;
  for (const [k, m] of partita.mosse.entries()) {
    const r = await p.evaluate(
      async ({ azione, impronta }) => {
        const senzaSeq = (s) => { if (!s) return s; const { seq, ...x } = s; return x; };
        await game.gl.dispatch(azione);
        const t0 = Date.now();
        while (Date.now() - t0 < 5000) {
          if (window.__impronta(senzaSeq(game.gl.state)) === impronta) break;
          await new Promise((r) => setTimeout(r, 25));
        }
        await new Promise((r) => setTimeout(r, 30));
        const tav = document.querySelector("#guardie-e-ladri-tavolo .gl-root");
        return { uguale: window.__impronta(senzaSeq(game.gl.state)) === impronta, tavolo: !!tav && tav.innerHTML.length > 200 };
      },
      m,
    );
    totale++;
    if (r.uguale && r.tavolo) ok++;
    else {
      diverse++;
      console.log(`  partita ${partita.seed}, mossa ${k + 1} ${JSON.stringify(m.azione).slice(0, 120)}: ${r.uguale ? "" : "STATO DIVERSO "}${r.tavolo ? "" : "TAVOLO NON DISEGNATO"}`);
      break;
    }
  }
  const msg = (await p.evaluate(() => game.messages.size)) - msg0;
  const esito = await p.evaluate(() => game.gl.state?.esito?.tipo ?? game.gl.state?.fase);
  console.log(`Partita ${i + 1} (seme ${partita.seed}): ${ok}/${partita.mosse.length} mosse identiche al motore, ${msg} messaggi in chat, errori console ${errori.length - errPrima}, finale: ${esito}`);
}
await p.evaluate(() => game.gl.dispatch({ type: "reset" }));
await p.waitForTimeout(500);
console.log(`\nTotale: ${totale} mosse, differenze ${diverse}, errori console ${errori.length}`);
if (errori.length) console.log(errori.slice(0, 5));
await b.close();
process.exitCode = diverse || errori.length ? 1 : 0;
