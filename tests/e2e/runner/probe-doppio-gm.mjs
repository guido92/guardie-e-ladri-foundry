// Verifica: quanti client GM eseguono le azioni dei giocatori? (ognuno risponde con un avviso)
// Senza partita in corso, Alice manda un'azione: ogni GM che la esegue le rimanda "Nessuna partita in corso".
import { chromium } from "playwright-core";
const URL = "http://localhost:30000";
const browser = await chromium.launch({ channel: "chrome", headless: true });
async function login(nome) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${URL}/join`);
  await page.waitForSelector('select[name="userId"]');
  await page.$eval('select[name="userId"]', (s, n) => { const o = [...s.options].find((x) => x.textContent.trim() === n); o.disabled = false; s.value = o.value; }, nome);
  await page.click('button[name="join"]');
  await page.waitForURL(/\/game/);
  await page.waitForFunction(() => window.game?.ready);
  return page;
}
const conGM = process.argv[2] !== "senzaGM";
const gmPage = conGM ? await login("Gamemaster") : null;
const alice = await login("Alice");
await alice.evaluate(() => {
  window.__err = [];
  game.socket.on("system.guardie-e-ladri", (m) => { if (m.type === "error" && m.to === game.user.id) window.__err.push(m.message); });
});
console.log("stato:", await alice.evaluate(() => game.gl.state?.fase ?? null), "activeGM:", await alice.evaluate(() => game.users.activeGM?.name ?? null));
await alice.evaluate(() => game.socket.emit("system.guardie-e-ladri", { type: "action", userId: game.user.id, action: { type: "distribuisci" } }));
await alice.waitForTimeout(3000);
console.log(`Playwright GM collegato: ${conGM}. Risposte d'errore ricevute da Alice:`, await alice.evaluate(() => window.__err));
await browser.close();
