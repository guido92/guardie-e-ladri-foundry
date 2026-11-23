import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame, apply } from "../module/game/engine.mjs";
import { vistaPer, isCoperta } from "../module/game/vista.mjs";

const ladri = [
  { id: "a", nome: "A", classe: "lady" },
  { id: "b", nome: "B", classe: "meccanico" },
];

function partita() {
  let { state } = newGame({ ladri, seed: 5 });
  state = apply(state, { type: "distribuisci" }).state;
  return state;
}

/** Tutte le Carte vere che compaiono nella vista. */
function vere(v) {
  const cf = v.confronto;
  return [
    ...v.ladri.flatMap((l) => l.mano),
    ...v.mazzi.b.pesca,
    ...v.mazzi.c.pesca,
    ...v.mazzetto,
    ...(cf ? [...cf.croupierMano, ...(cf.croupierGioca ?? []), ...Object.values(cf.giocate).flat()] : []),
    ...(v.bottino?.carte ?? []),
  ].filter((c) => !isCoperta(c));
}

test("ogni giocatore vede solo la propria mano, mai i mazzi né la mano del Croupier", () => {
  let s = partita();
  s = apply(s, { type: "lavorettoInizia", grado: "esagerato", partecipanti: ["a"] }).state;
  s = apply(s, { type: "decidi", ladro: "a", scelta: "continua" }).state;
  s = apply(s, { type: "decidi", ladro: "a", scelta: "continua" }).state;
  const va = vistaPer(s, { comandati: ["a"], banda: true });
  const manoB = s.ladri.find((l) => l.id === "b").mano;
  assert.deepEqual(va.ladri.find((l) => l.id === "a").mano, s.ladri.find((l) => l.id === "a").mano);
  assert.ok(va.ladri.find((l) => l.id === "b").mano.every(isCoperta));
  assert.equal(va.ladri.find((l) => l.id === "b").mano.length, manoB.length);
  assert.ok(va.mazzi.b.pesca.every(isCoperta) && va.mazzi.c.pesca.every(isCoperta));
  assert.ok(va.confronto.croupierMano.every(isCoperta));
  assert.equal(va.rng, 0);
  // solo la propria mano, il tavolo e gli scarti
  const permesse = new Set([...s.ladri.find((l) => l.id === "a").mano, ...s.confronto.tavolo]);
  for (const c of vere(va)) assert.ok(permesse.has(c), `${c} non dovrebbe essere visibile`);
});

test("carte giocate coperte fino all'esito; Mostra alla Banda; Fuga; spettatore", () => {
  let s = partita();
  s = apply(s, { type: "lavorettoInizia", grado: "banale", partecipanti: ["a", "b"] }).state;
  for (let i = 0; i < 2; i++) for (const id of ["a", "b"]) s = apply(s, { type: "decidi", ladro: id, scelta: "continua" }).state;
  s = apply(s, { type: "gioca", ladro: "a", carte: [s.ladri[0].mano[0]] }).state;
  const vb = vistaPer(s, { comandati: ["b"], banda: true });
  assert.ok(vb.confronto.giocate.a.every(isCoperta));
  const va = vistaPer(s, { comandati: ["a"], banda: true });
  assert.ok(!va.confronto.giocate.a.some(isCoperta));
  // mostra
  const m = structuredClone(s);
  m.ladri[1].mostra = true;
  assert.ok(!vistaPer(m, { comandati: ["a"], banda: true }).ladri[1].mano.some(isCoperta));
  assert.ok(vistaPer(m, {}).ladri[1].mano.every(isCoperta), "lo spettatore (e il Croupier) non vede le mani mostrate");
  // fuga
  const f = structuredClone(s);
  f.fase = "fuga";
  assert.ok(!vistaPer(f, { comandati: ["a"], banda: true }).ladri[1].mano.some(isCoperta));
  assert.ok(vistaPer(f, {}).ladri.every((l) => l.mano.every(isCoperta)));
});

test("il Mazzo della Banda si vede solo per scegliere il Bottino", () => {
  const s = partita();
  s.bottino = { carte: [], daScegliere: 2, partecipanti: ["a"] };
  assert.ok(!vistaPer(s, { comandati: ["a"], banda: true }).mazzi.b.pesca.some(isCoperta));
  assert.ok(vistaPer(s, { comandati: ["b"], banda: true }).mazzi.b.pesca.every(isCoperta));
});
