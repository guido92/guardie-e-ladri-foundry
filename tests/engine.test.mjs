import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame, apply, EngineError, carteDaGiocare } from "../module/game/engine.mjs";
import { migliorCoppia } from "../module/core/carte.mjs";

const banda = (n = 3) =>
  [
    { id: "g", nome: "Gino", classe: "gangster", ricercato: false },
    { id: "l", nome: "Lola", classe: "lady", ricercato: true },
    { id: "m", nome: "Mario", classe: "meccanico" },
    { id: "i", nome: "Ivo", classe: "intellettuale" },
  ].slice(0, n);

function run(state, ...azioni) {
  let s = state;
  const effects = [];
  for (const a of azioni) {
    const r = apply(s, a);
    s = r.state;
    effects.push(...r.effects);
  }
  return { state: s, effects };
}

/** Conta tutte le carte per verificare che non se ne perda nessuna. */
function conta(s) {
  const tutte = [
    ...s.mazzi.b.pesca,
    ...s.mazzi.b.scarti,
    ...s.mazzi.c.pesca,
    ...s.mazzi.c.scarti,
    ...s.jolly,
    ...s.eliminate,
    ...s.mazzetto,
    ...s.ladri.flatMap((l) => l.mano),
    ...(s.confronto ? [...s.confronto.tavolo, ...Object.values(s.confronto.giocate).flat(), ...(s.confronto.croupierGioca ?? []), ...s.confronto.croupierMano] : []),
    ...(s.bottino?.carte ?? []),
  ];
  assert.equal(new Set(tutte).size, tutte.length, "carta duplicata");
  return tutte.length;
}

function avvio(n = 3, seed = 7) {
  let { state } = newGame({ ladri: banda(n), seed });
  state = run(state, { type: "coppiaGangster", ladro: "g", valore: "7", semi: ["F", "P"] }, { type: "distribuisci" }).state;
  return state;
}

test("preparazione: Coppia del Gangster, mani iniziali, Ricercati", () => {
  const s = avvio();
  assert.equal(s.fase, "lavoretti");
  const g = s.ladri.find((l) => l.id === "g");
  assert.ok(g.mano.includes("b:7F") && g.mano.includes("b:7P"));
  assert.equal(g.mano.length, 4);
  assert.equal(s.ladri.find((l) => l.id === "l").mano.length, 3); // ricercata
  assert.equal(s.ladri.find((l) => l.id === "m").mano.length, 2);
  assert.equal(conta(s), 108);
});

test("in 3 giocatori (2 Ladri) ognuno riceve anche un Jolly", () => {
  const s = avvio(2);
  for (const l of s.ladri) assert.ok(l.mano.some((c) => c.startsWith("j:")));
  assert.equal(s.jolly.length, 2);
});

test("non si distribuisce prima della Coppia del Gangster", () => {
  const { state } = newGame({ ladri: banda(3), seed: 1 });
  assert.throws(() => apply(state, { type: "distribuisci" }), EngineError);
});

function finoAlRiver(s, partecipanti, grado = "banale") {
  s = run(s, { type: "lavorettoInizia", grado, partecipanti }).state;
  assert.equal(s.confronto.tavolo.length, 3);
  s = run(s, ...partecipanti.map((id) => ({ type: "decidi", ladro: id, scelta: "continua" }))).state;
  assert.equal(s.confronto.step, "turn");
  s = run(s, ...partecipanti.map((id) => ({ type: "decidi", ladro: id, scelta: "continua" }))).state;
  assert.equal(s.confronto.step, "river");
  return s;
}

test("Lavoretto da solo: si giocano 2 Carte, il Croupier ne pesca quante dice il Grado", () => {
  let s = avvio();
  s = finoAlRiver(s, ["g"], "discreto");
  assert.equal(s.confronto.croupierMano.length, 3);
  assert.equal(carteDaGiocare(s, "g"), 2);
  const g = s.ladri.find((l) => l.id === "g");
  assert.throws(() => apply(s, { type: "gioca", ladro: "g", carte: [g.mano[0]] }), EngineError);
  s = run(s, { type: "gioca", ladro: "g", carte: g.mano.slice(0, 2) }).state;
  const best = migliorCoppia(s.confronto.croupierMano, s.confronto.tavolo);
  s = run(s, { type: "croupierGioca", carte: best.carte }).state;
  assert.equal(s.confronto.step, "esito");
  assert.ok(["successo", "fallimento"].includes(s.confronto.esito));
  assert.equal(conta(s), 108);
});

test("ritiro al flop gratis, al turn costa una Carta", () => {
  let s = avvio();
  s = run(s, { type: "lavorettoInizia", grado: "banale", partecipanti: ["g", "m"] }, { type: "decidi", ladro: "m", scelta: "ritira" }).state;
  assert.equal(s.ladri.find((l) => l.id === "m").mano.length, 2);
  assert.deepEqual(s.confronto.attivi, ["g"]);
  s = run(s, { type: "decidi", ladro: "g", scelta: "continua" }).state;
  assert.equal(s.confronto.step, "turn");
  const g = s.ladri.find((l) => l.id === "g");
  assert.throws(() => apply(s, { type: "decidi", ladro: "g", scelta: "ritira" }), /perdi una Carta/);
  s = run(s, { type: "decidi", ladro: "g", scelta: "ritira", carta: g.mano[0] }).state;
  assert.equal(s.confronto, null);
  assert.equal(s.ladri.find((l) => l.id === "g").mano.length, 3);
  assert.ok(s.ladri.find((l) => l.id === "m").lavoretto, "chi si ritira non può fare altri Lavoretti");
  assert.throws(() => apply(s, { type: "lavorettoInizia", grado: "banale", partecipanti: ["m"] }), /già fatto/);
  assert.equal(conta(s), 108);
});

/** Cerca un seme con cui il primo Confronto del Gangster finisce con l'esito voluto. */
function trovaEsito(voluto, grado = "banale", croupierPeggio = true) {
  for (let seed = 1; seed < 500; seed++) {
    let s = finoAlRiver(avvio(3, seed), ["g"], grado);
    const g = s.ladri.find((l) => l.id === "g");
    const mie = migliorCoppia(g.mano, s.confronto.tavolo).carte;
    s = run(s, { type: "gioca", ladro: "g", carte: mie }).state;
    const cm = s.confronto.croupierMano;
    const crou = croupierPeggio ? cm.slice(0, 2) : migliorCoppia(cm, s.confronto.tavolo).carte;
    s = run(s, { type: "croupierGioca", carte: crou }).state;
    if (s.confronto.esito === voluto) return s;
  }
  throw new Error("nessun seme trovato");
}

test("Successo e incasso: Bottino pescato e tenuto da chi agisce da solo", () => {
  let s = trovaEsito("successo");
  const prima = s.ladri.find((l) => l.id === "g").mano.length;
  s = run(s, { type: "vota", ladro: "g", scelta: "incassa" }).state;
  assert.equal(s.confronto, null);
  assert.equal(s.bottino, null);
  assert.equal(s.ladri.find((l) => l.id === "g").mano.length, prima + 3);
  assert.equal(s.storico[0].esito, "successo");
  assert.equal(conta(s), 108);
});

test("Rilancio: le Carte restano, il Croupier ritorna al numero del Grado, poi Bottino + Bonus", () => {
  let s = trovaEsito("successo");
  const giocate = s.confronto.giocate.g;
  s = run(s, { type: "vota", ladro: "g", scelta: "rilancia" }).state;
  assert.equal(s.confronto.round, 2);
  assert.deepEqual(s.confronto.giocate.g, giocate);
  assert.equal(s.confronto.croupierMano.length, 2);
  assert.equal(s.confronto.tavolo.length, 3);
  assert.throws(() => apply(s, { type: "gioca", ladro: "g", carte: [] }), EngineError);
  s = run(s, { type: "decidi", ladro: "g", scelta: "continua" }).state;
  assert.equal(s.confronto.step, "river");
  assert.equal(s.confronto.tavolo.length, 5);
  const prima = s.ladri.find((l) => l.id === "g").mano.length;
  s = run(s, { type: "croupierGioca", carte: s.confronto.croupierMano }).state;
  if (s.confronto) {
    assert.equal(s.confronto.esito, "fallimento");
    s = run(s, { type: "accetta" }).state;
    assert.equal(s.ladri.find((l) => l.id === "g").mano.length, prima);
  } else {
    assert.equal(s.ladri.find((l) => l.id === "g").mano.length, prima + 5); // 3 + 2 bonus
  }
  assert.equal(conta(s), 108);
});

test("ritirarsi dal Rilancio restituisce le Carte giocate", () => {
  let s = trovaEsito("successo");
  const prima = s.ladri.find((l) => l.id === "g").mano.length;
  s = run(s, { type: "vota", ladro: "g", scelta: "rilancia" }, { type: "decidi", ladro: "g", scelta: "ritira" }).state;
  assert.equal(s.confronto, null);
  assert.equal(s.ladri.find((l) => l.id === "g").mano.length, prima + 2);
});

test("Bottino a scelta (Tosto) e Fallimento che fa perdere le Carte", () => {
  let s = trovaEsito("successo", "tosto");
  s = run(s, { type: "vota", ladro: "g", scelta: "incassa" }).state;
  assert.equal(s.bottino.daScegliere, 2);
  const due = s.mazzi.b.pesca.slice(0, 2);
  s = run(s, { type: "bottinoScegli", ladro: "g", carte: due }).state;
  assert.ok(due.every((c) => s.ladri.find((l) => l.id === "g").mano.includes(c)));
  assert.equal(conta(s), 108);

  let f = trovaEsito("fallimento");
  const prima = f.ladri.find((l) => l.id === "g").mano.length;
  f = run(f, { type: "accetta" }).state;
  assert.equal(f.ladri.find((l) => l.id === "g").mano.length, prima);
  assert.equal(conta(f), 108);
});

test("la Lady scambia una Carta in caso di Fallimento", () => {
  for (let seed = 1; seed < 300; seed++) {
    let s = finoAlRiver(avvio(3, seed), ["l"]);
    const lady = s.ladri.find((l) => l.id === "l");
    s = run(s, { type: "gioca", ladro: "l", carte: lady.mano.slice(0, 2) }).state;
    s = run(s, { type: "croupierGioca", carte: migliorCoppia(s.confronto.croupierMano, s.confronto.tavolo).carte }).state;
    if (s.confronto.esito !== "fallimento") continue;
    const mano = s.ladri.find((l) => l.id === "l").mano[0];
    const giocata = s.confronto.giocate.l[0];
    s = run(s, { type: "baciamano", ladro: "l", mano, giocata }).state;
    assert.ok(s.confronto.giocate.l.includes(mano));
    assert.ok(s.ladri.find((l) => l.id === "l").mano.includes(giocata));
    assert.ok(s.confronto.ladyUsata);
    if (s.confronto.esito === "fallimento") assert.throws(() => apply(s, { type: "baciamano", ladro: "l", mano: giocata, giocata: mano }), /già/);
    return;
  }
  assert.fail("nessun fallimento trovato");
});

test("Fixer: paga con una combinazione, Jolly ai Fumogeni, niente doppioni", () => {
  let s = avvio();
  s = run(s, { type: "faseFixer" }).state;
  const g = s.ladri.find((l) => l.id === "g");
  assert.throws(() => apply(s, { type: "compra", oggetto: "fumogeni", carte: [g.mano[0], g.mano[2]] }), /non formano/);
  s = run(s, { type: "compra", oggetto: "fumogeni", carte: ["b:7F", "b:7P"], destinatario: "m" }).state;
  assert.ok(s.acquisti.includes("fumogeni"));
  assert.ok(s.ladri.find((l) => l.id === "m").mano.some((c) => c.startsWith("j:")));
  assert.ok(s.mazzi.b.pesca.includes("b:7F"), "le Carte del Fixer tornano nel Mazzo");
  assert.throws(() => apply(s, { type: "compra", oggetto: "fumogeni", gratis: true }), /già/);
  s = run(s, { type: "compra", oggetto: "documenti", gratis: true }).state;
  assert.ok(s.ladri.every((l) => !l.ricercato));
  assert.equal(conta(s), 108);
});

test("meno di 2 Carte al Fixer: tutti Ricercati", () => {
  let s = avvio();
  for (const l of s.ladri) {
    s.mazzi.b.scarti.push(...l.mano.filter((c) => !c.startsWith("j:")));
    l.mano = [];
  }
  s = run(s, { type: "faseFixer" }).state;
  assert.ok(s.ladri.every((l) => l.ricercato));
  assert.equal(s.ladri.find((l) => l.id === "l").mano.length, 0); // era già Ricercata
  assert.equal(s.ladri.find((l) => l.id === "g").mano.length, 1);
});

test("Jolly per interpretazione: 1 per Ladro per Fase, in 3 giocatori solo nelle Fasi 2 e 3", () => {
  let s = avvio();
  s = run(s, { type: "daiJolly", ladro: "m" }).state;
  assert.throws(() => apply(s, { type: "daiJolly", ladro: "m" }), /già ricevuto/);
  let t = avvio(2);
  assert.throws(() => apply(t, { type: "daiJolly", ladro: "g" }), /Fasi 2 e 3/);
});

function alColpo(seed = 7) {
  let s = avvio(3, seed);
  s = run(s, { type: "faseFixer" }, { type: "faseColpo" }).state;
  return s;
}

test("Grande Colpo: Ingresso Teatrale, Diversivo, Scasso a mani vuote", () => {
  let s = alColpo();
  assert.throws(() => apply(s, { type: "accesso", tipo: "secondario", carte: [] }), /Mappa/);
  s = run(s, { type: "accesso", tipo: "teatrale" }).state;
  assert.equal(s.colpo.guardie, 3);
  assert.equal(s.mazzetto.length, 9);
  const manoM = s.ladri.find((l) => l.id === "m").mano.length;
  s = run(s, { type: "diversivo", ladro: "m" }).state;
  assert.equal(s.ladri.find((l) => l.id === "m").mano.length, manoM - 1);
  assert.equal(s.mazzetto.length, 6);
  assert.throws(() => apply(s, { type: "diversivo", ladro: "m" }), /già/);
  s = run(s, { type: "scasso", tipo: "nessuno" }).state;
  assert.equal(s.bottinoFinale, false);
  assert.equal(s.colpo.guardie, 6);
  assert.equal(s.mazzetto.length, 15);
  assert.equal(conta(s), 108);
});

test("Scasso Brutale con l'Intellettuale accetta una Doppia coppia", () => {
  let { state: s } = newGame({ ladri: banda(4), seed: 3 });
  s = run(s, { type: "coppiaGangster", ladro: "g", valore: "4", semi: ["C", "Q"] }, { type: "distribuisci" }, { type: "faseFixer" }, { type: "faseColpo" }, { type: "accesso", tipo: "teatrale" }).state;
  // procura una doppia coppia al Gangster
  const prendi = (id) => {
    for (const k of ["pesca", "scarti"]) {
      const i = s.mazzi.b[k].indexOf(id);
      if (i >= 0) return s.mazzi.b[k].splice(i, 1)[0];
    }
    return s.ladri.find((l) => l.mano.includes(id)) && (s.ladri.find((l) => l.mano.includes(id)).mano = s.ladri.find((l) => l.mano.includes(id)).mano.filter((c) => c !== id), id);
  };
  s.ladri[0].mano.push(prendi("b:9C"), prendi("b:9F"));
  s = run(s, { type: "scasso", tipo: "brutale", carte: ["b:4C", "b:4Q", "b:9C", "b:9F"] }).state;
  assert.equal(s.bottinoFinale, true);
});

test("Grande Fuga fino all'epilogo", () => {
  let s = alColpo(11);
  s = run(s, { type: "accesso", tipo: "teatrale" }, { type: "scasso", tipo: "nessuno" }, { type: "faseFuga" }).state;
  assert.equal(s.fase, "fuga");
  const mecc = s.ladri.find((l) => l.id === "m");
  assert.equal(mecc.mano.length, 3, "il Meccanico pesca una Carta");
  assert.equal(s.confronto.tipo, "fuga");
  s = run(s, { type: "decidi", ladro: "l", scelta: "ritira" }).state;
  assert.ok(s.ladri.find((l) => l.id === "l").pentito);
  s = run(s, { type: "avanza" }).state;
  assert.equal(s.confronto.step, "river");
  const tutte = s.ladri.flatMap((l) => l.mano);
  s = run(s, { type: "gioca", carte: tutte.slice(0, 2) }, { type: "croupierGioca", carte: migliorCoppia(s.mazzetto, s.confronto.tavolo).carte }).state;
  if (s.fase === "epilogo") {
    assert.equal(s.esito.tipo, "fuggitiManiVuote");
  } else {
    assert.equal(s.confronto.esito, "fallimento");
    s = run(s, { type: "allIn" }).state;
    assert.equal(s.confronto.tavolo.length, 5);
    assert.ok(s.confronto.giocate.banda.length === 2);
    s = run(s, { type: "croupierGioca", carte: s.mazzetto.slice(0, 2) }).state;
    if (s.fase !== "epilogo") s = run(s, { type: "accetta" }).state;
    assert.ok(["fuggitiManiVuote", "penaDura"].includes(s.esito.tipo));
  }
  assert.throws(() => apply(s, { type: "faseFuga" }), /finita/);
});

test("Auto da corsa e fuga senza Confronto con meno di 2 Carte nel Mazzetto", () => {
  let s = alColpo();
  s.acquisti.push("auto", "mappa", "fumogeni");
  s = run(s, { type: "accesso", tipo: "secondario" }).state;
  assert.equal(s.colpo.guardie, 0);
  s.acquisti.push("combinazione");
  s = run(s, { type: "scasso", tipo: "professionale" }, { type: "faseFuga" }).state;
  assert.equal(s.fase, "epilogo");
  assert.equal(s.esito.tipo, "fuggiti");
});
