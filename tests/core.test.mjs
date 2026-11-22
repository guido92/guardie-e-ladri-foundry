import { test } from "node:test";
import assert from "node:assert/strict";
import { migliorMano, confronta, formaCombinazione, trovaCombinazione, mescola, mazzo, migliorCoppia } from "../module/core/carte.mjs";
import { guardieAccesso, guardieScasso, costoScasso } from "../module/core/regole.mjs";

const nome = (ids) => migliorMano(ids).nome;

test("categorie di base", () => {
  assert.equal(nome(["b:2C", "b:2Q", "b:5F", "b:9P", "b:JC", "b:KQ", "b:AF"]), "Coppia");
  assert.equal(nome(["b:2C", "b:2Q", "b:5F", "b:5P", "b:JC", "b:KQ", "b:AF"]), "Doppia coppia");
  assert.equal(nome(["b:2C", "b:3Q", "b:4F", "b:5P", "b:6C", "b:KQ", "b:AF"]), "Scala");
  assert.equal(nome(["b:AC", "b:2Q", "b:3F", "b:4P", "b:5C", "b:KQ", "b:9F"]), "Scala");
  assert.equal(nome(["b:2C", "b:7C", "b:9C", "b:JC", "b:KC", "b:KQ", "b:AF"]), "Colore");
  assert.equal(nome(["b:KC", "b:KQ", "b:KF", "b:2P", "b:2C", "b:3Q", "b:AF"]), "Full");
  assert.equal(nome(["b:9C", "b:9Q", "b:9F", "b:9P", "b:2C", "b:3Q", "b:AF"]), "Poker");
  assert.equal(nome(["b:9C", "b:TC", "b:JC", "b:QC", "b:KC", "b:3Q", "b:AF"]), "Scala colore");
});

test("carte identiche da mazzi diversi non fanno coppia", () => {
  assert.equal(nome(["b:JQ", "c:JQ", "b:2C", "b:5F", "b:9P", "b:KC", "b:AF"]), "Carta alta");
  assert.equal(nome(["b:JQ", "c:JC", "b:2C", "b:5F", "b:9P", "b:KC", "b:AF"]), "Coppia");
});

test("il Jolly vale qualsiasi carta", () => {
  assert.equal(nome(["j:1", "b:AC", "b:2C", "b:5F", "b:9P", "b:KC", "b:7Q"]), "Coppia");
  assert.equal(nome(["j:1", "j:2", "b:AC", "b:AQ", "b:5F", "b:9P", "b:KC"]), "Poker");
  assert.equal(nome(["j:1", "b:9C", "b:TC", "b:JC", "b:QC", "b:3Q", "b:2F"]), "Scala colore");
});

test("parità: vince il Croupier, salvo la regola dei semi", () => {
  const tavolo = ["b:2P", "b:5F", "b:9P", "b:JC", "b:3Q"];
  const ladri = migliorMano(["b:KC", "b:7C", ...tavolo]);
  const crou = migliorMano(["c:KP", "c:7P", ...tavolo]);
  assert.equal(confronta(ladri, crou), 0);
  assert.ok(confronta(ladri, crou, { semi: true }) > 0); // re di cuori > re di picche
  assert.ok(confronta(crou, ladri, { semi: true }) < 0);
});

test("spareggi corretti", () => {
  const t = ["b:2P", "b:5F", "b:9P", "b:JC", "b:3Q"];
  assert.ok(confronta(migliorMano(["b:AC", "b:4C", ...t]), migliorMano(["c:KC", "c:KQ", ...t])) > 0); // scala > coppia
  assert.ok(confronta(migliorMano(["b:9C", "b:4C", ...t]), migliorMano(["c:JQ", "c:4Q", ...t])) < 0); // coppia di 9 < coppia di J
});

test("combinazioni del Fixer", () => {
  assert.ok(formaCombinazione("coppia", ["b:7C", "b:7P"]));
  assert.ok(!formaCombinazione("coppia", ["b:7C", "b:8P"]));
  assert.ok(formaCombinazione("coppiaFigure", ["b:QC", "j:1"]));
  assert.ok(!formaCombinazione("coppiaFigure", ["b:AC", "b:AP"])); // l'asso non è una figura
  assert.ok(formaCombinazione("trisFigure", ["b:KC", "b:KP", "b:KQ"]));
  assert.ok(formaCombinazione(["poker", "scala"], ["b:AC", "b:2P", "b:3Q", "b:4F", "b:5C"]));
  assert.ok(formaCombinazione(["full", "colore"], ["b:2C", "b:6C", "b:9C", "b:JC", "b:AC"]));
  assert.ok(!formaCombinazione("tris", ["b:7C", "b:7P", "b:7Q", "b:7F"])); // numero di carte esatto
  assert.ok(formaCombinazione("doppiaCoppia", ["b:3C", "b:3P", "b:9Q", "j:2"]));
  assert.deepEqual(trovaCombinazione("coppia", ["b:2C", "b:9P", "b:2Q"]).sort(), ["b:2C", "b:2Q"]);
});

test("mescolata deterministica", () => {
  const [a] = mescola(mazzo("b"), 42);
  const [b] = mescola(mazzo("b"), 42);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 52);
});

test("migliorCoppia aiuta il Croupier", () => {
  const r = migliorCoppia(["c:2C", "c:KC", "c:KQ", "c:7P"], ["b:KF", "b:5P", "b:9Q", "b:3C", "b:JP"]);
  assert.deepEqual(r.carte.sort(), ["c:KC", "c:KQ"]);
  assert.equal(r.mano.nome, "Tris");
});

test("Guardie dell'Accesso e dello Scasso", () => {
  assert.equal(guardieAccesso("teatrale", { nLadri: 3, nRicercati: 1, acquisti: [] }), 3);
  assert.equal(guardieAccesso("teatrale", { nLadri: 3, nRicercati: 1, acquisti: ["personale"] }), 1);
  assert.equal(guardieAccesso("incognito", { nLadri: 3, nRicercati: 2, acquisti: [] }), 2);
  assert.equal(guardieAccesso("incognito", { nLadri: 3, nRicercati: 2, acquisti: ["documenti"] }), 0);
  assert.equal(guardieScasso("tecnico", { nLadri: 4, nRicercati: 3, intellettuale: true }), 1);
  assert.deepEqual(costoScasso("brutale", { intellettuale: true }), ["pokerFigure", "doppiaCoppia"]);
});
