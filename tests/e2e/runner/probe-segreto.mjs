import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome", headless: true });
async function login(nome) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:30000/join");
  await p.waitForSelector('select[name="userId"]');
  await p.$eval('select[name="userId"]', (s, n) => { const o = [...s.options].find((x) => x.textContent.trim() === n); o.disabled = false; s.value = o.value; }, nome);
  await p.click('button[name="join"]');
  await p.waitForURL(/game/);
  await p.waitForFunction(() => window.game?.ready, null, { timeout: 60000 });
  return p;
}
const gm = await login("Gamemaster");
const r = await gm.evaluate(async () => {
  const ex = game.settings.storage.get("user")?.find?.((s) => s.key === "guardie-e-ladri.probe");
  if (ex) await ex.delete();
  const d = await Setting.create({ key: "guardie-e-ladri.probe", value: JSON.stringify("SEGRETO-GM"), user: game.user.id });
  return { id: d?.id, user: d?.user };
});
console.log("creato", r);
const alice = await login("Alice");
const vede = await alice.evaluate(() => {
  const all = [...(game.settings.storage.get("world") ?? []), ...(game.settings.storage.get("user") ?? [])];
  return all.filter((s) => s.key === "guardie-e-ladri.probe").map((s) => [s.value, s.user]);
});
console.log("Alice vede:", vede);
// socket con destinatari
await alice.evaluate(() => { window.__ricevuti = []; game.socket.on("system.guardie-e-ladri", (m) => m?.probe && window.__ricevuti.push(m.probe)); });
const bob = await login("Bob");
await bob.evaluate(() => { window.__ricevuti = []; game.socket.on("system.guardie-e-ladri", (m) => m?.probe && window.__ricevuti.push(m.probe)); });
await gm.evaluate(() => { const a = game.users.getName("Alice").id; game.socket.emit("system.guardie-e-ladri", { probe: "solo-alice" }, { recipients: [a] }); });
await gm.waitForTimeout(1500);
console.log("Alice riceve:", await alice.evaluate(() => window.__ricevuti), "Bob riceve:", await bob.evaluate(() => window.__ricevuti));
await gm.evaluate(async () => { for (const s of game.settings.storage.get("user") ?? []) if (s.key === "guardie-e-ladri.probe") await s.delete(); });
await b.close();
