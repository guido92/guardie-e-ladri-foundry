// Test indipendenti: il Fixer e i Jolly (manuale pag. 29-30).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as H from './_helpers.mjs';
const { apply, EngineError } = H;

/** Partita in fase Fixer con le mani indicate. */
function alFixer(spec, mani, opt = {}) {
  let s = H.distribuita(spec, opt);
  s = H.metti(s, { mani });
  return apply(s, { type: 'faseFixer' }).state;
}

const TRE = ['meccanico', 'lady', 'intellettuale'];

describe('Regola dei meno di 2 Carte (pag. 29)', () => {
  test('se la Banda ha meno di 2 Carte in totale tutti diventano Ricercati e pescano 1 Carta', () => {
    let s = H.distribuita(TRE);
    s = H.metti(s, { mani: { a: ['b:7F'], b: [], c: [] } });
    s = apply(s, { type: 'faseFixer' }).state;
    assert.ok(s.ladri.every((l) => l.ricercato));
    assert.deepEqual(s.ladri.map((l) => l.mano.length), [2, 1, 1]);
    H.verificaConservazione(s);
  });
  test('chi era già Ricercato non pesca', () => {
    let s = H.distribuita(['meccanico', { classe: 'lady', ricercato: true }, 'intellettuale']);
    s = H.metti(s, { mani: { a: [], b: [], c: [] } });
    s = apply(s, { type: 'faseFixer' }).state;
    assert.ok(s.ladri.every((l) => l.ricercato));
    assert.deepEqual(s.ladri.map((l) => l.mano.length), [1, 0, 1]);
  });
  test('con 2 o più Carte in totale non succede nulla', () => {
    let s = H.distribuita(TRE);
    s = H.metti(s, { mani: { a: ['b:7F'], b: ['b:8F'], c: [] } });
    s = apply(s, { type: 'faseFixer' }).state;
    assert.ok(s.ladri.every((l) => !l.ricercato));
    assert.deepEqual(s.ladri.map((l) => l.mano.length), [1, 1, 0]);
  });
});

describe('Listino del Fixer (pag. 29)', () => {
  const casi = [
    ['fumogeni', ['b:7F', 'b:7P'], ['b:7F', 'b:8P']],
    ['attrezzi', ['b:QF', 'b:QP'], ['b:7F', 'b:7P']],
    ['mappa', ['b:3C', 'b:3Q', 'b:3F'], ['b:3C', 'b:3Q', 'b:4F']],
    ['documenti', ['b:KC', 'b:KQ', 'b:KF'], ['b:3C', 'b:3Q', 'b:3F']],
    ['personale', ['b:2C', 'b:2Q', 'b:2F', 'b:9P', 'b:9C'], ['b:2C', 'b:2Q', 'b:2F', 'b:9P', 'b:8C']],
    ['personale', ['b:2C', 'b:5C', 'b:7C', 'b:9C', 'b:JC'], ['b:2C', 'b:5C', 'b:7C', 'b:9C', 'b:JP']], // [AMBIGUO] colore: vedi carte.spec
    ['combinazione', ['b:4C', 'b:4Q', 'b:4F', 'b:4P'], ['b:4C', 'b:4Q', 'b:4F', 'b:5P']],
    ['combinazione', ['b:5C', 'b:6Q', 'b:7F', 'b:8P', 'b:9C'], ['b:5C', 'b:6Q', 'b:7F', 'b:8P', 'b:TC']],
    ['auto', ['b:4C', 'b:4Q', 'b:4F', 'b:4P'], ['b:4C', 'b:4Q', 'b:4F']],
    ['auto', ['b:TC', 'b:JQ', 'b:QF', 'b:KP', 'b:AC'], ['b:TC', 'b:JQ', 'b:QF', 'b:KP', 'b:2C']],
  ];
  for (const [oggetto, ok, ko] of casi) {
    test(`${oggetto}: ${ok.join(' ')} va bene, ${ko.join(' ')} no`, () => {
      const tutte = [...new Set([...ok, ...ko])];
      const s = alFixer(TRE, { a: tutte, b: [], c: [] });
      assert.throws(() => apply(s, { type: 'compra', oggetto, carte: ko, destinatario: 'a' }), EngineError);
      const s2 = apply(s, { type: 'compra', oggetto, carte: ok, destinatario: 'a' }).state;
      assert.ok(s2.acquisti.includes(oggetto));
      assert.ok(ok.every((c) => !H.ladro(s2, 'a').mano.includes(c)), 'Carte pagate tolte dalla mano');
      H.verificaConservazione(s2);
    });
  }
  test('l\'Asso non è una figura: niente Attrezzi con una coppia di Assi (API.md scelta 6)', () => {
    const s = alFixer(TRE, { a: ['b:AF', 'b:AP'], b: [], c: [] });
    assert.throws(() => apply(s, { type: 'compra', oggetto: 'attrezzi', carte: ['b:AF', 'b:AP'], destinatario: 'a' }), EngineError);
  });
  test('non è possibile acquistare più elementi dello stesso tipo', () => {
    let s = alFixer(TRE, { a: ['b:7F', 'b:7P', 'b:8F', 'b:8P'], b: [], c: [] });
    s = apply(s, { type: 'compra', oggetto: 'fumogeni', carte: ['b:7F', 'b:7P'], destinatario: 'a' }).state;
    assert.throws(() => apply(s, { type: 'compra', oggetto: 'fumogeni', carte: ['b:8F', 'b:8P'], destinatario: 'a' }), EngineError);
  });
  test('Combinazione e Auto da corsa sono elementi distinti: si possono comprare entrambi', () => {
    let s = alFixer(TRE, { a: ['b:4C', 'b:4Q', 'b:4F', 'b:4P', 'b:5C', 'b:6Q', 'b:7F', 'b:8P', 'b:9C'], b: [], c: [] });
    s = apply(s, { type: 'compra', oggetto: 'combinazione', carte: ['b:4C', 'b:4Q', 'b:4F', 'b:4P'] }).state;
    s = apply(s, { type: 'compra', oggetto: 'auto', carte: ['b:5C', 'b:6Q', 'b:7F', 'b:8P', 'b:9C'] }).state;
    assert.deepEqual([...s.acquisti].sort(), ['auto', 'combinazione']);
  });
  test('il pagamento può unire Carte di Ladri diversi (API.md scelta 5)', () => {
    let s = alFixer(TRE, { a: ['b:7F'], b: ['b:7P'], c: [] });
    s = apply(s, { type: 'compra', oggetto: 'fumogeni', carte: ['b:7F', 'b:7P'], destinatario: 'c' }).state;
    assert.ok(s.acquisti.includes('fumogeni'));
    assert.equal(H.ladro(s, 'a').mano.length, 0);
    assert.equal(H.ladro(s, 'b').mano.length, 0);
  });
  test('non si paga con Carte che la Banda non possiede', () => {
    const s = alFixer(TRE, { a: ['b:7F'], b: [], c: [] });
    assert.throws(() => apply(s, { type: 'compra', oggetto: 'fumogeni', carte: ['b:7F', 'b:7P'] }), EngineError);
  });
  test('le Carte del Fixer tornano nel Mazzo della Banda', () => {
    let s = alFixer(TRE, { a: ['b:7F', 'b:7P'], b: [], c: [] });
    s = apply(s, { type: 'compra', oggetto: 'fumogeni', carte: ['b:7F', 'b:7P'], destinatario: 'a' }).state;
    assert.ok(s.mazzi.b.pesca.includes('b:7F') && s.mazzi.b.pesca.includes('b:7P'));
    assert.ok(!s.eliminate.includes('b:7F'));
  });
  test('opzione: le Carte del Fixer vengono eliminate dal gioco (pag. 30)', () => {
    let s = alFixer(TRE, { a: ['b:7F', 'b:7P'], b: [], c: [] }, { opzioni: { semi: false, fixerElimina: true, allIn: true } });
    s = apply(s, { type: 'compra', oggetto: 'fumogeni', carte: ['b:7F', 'b:7P'], destinatario: 'a' }).state;
    assert.ok(s.eliminate.includes('b:7F') && s.eliminate.includes('b:7P'));
    assert.ok(!s.mazzi.b.pesca.includes('b:7F') && !s.mazzi.b.scarti.includes('b:7F'));
    H.verificaConservazione(s);
  });
  for (const [oggetto, carte] of [['fumogeni', ['b:7F', 'b:7P']], ['attrezzi', ['b:JF', 'b:JP']]]) {
    test(`${oggetto}: il destinatario riceve 1 Jolly`, () => {
      let s = alFixer(TRE, { a: carte, b: [], c: [] });
      s = apply(s, { type: 'compra', oggetto, carte, destinatario: 'b' }).state;
      assert.equal(H.ladro(s, 'b').mano.filter((c) => c.startsWith('j:')).length, 1);
      assert.equal(s.jolly.length, 3);
    });
  }
  for (const oggetto of ['mappa', 'documenti', 'personale', 'combinazione', 'auto']) {
    test(`${oggetto}: nessun Jolly`, () => {
      const carte = {
        mappa: ['b:3C', 'b:3Q', 'b:3F'],
        documenti: ['b:KC', 'b:KQ', 'b:KF'],
        personale: ['b:2C', 'b:2Q', 'b:2F', 'b:9P', 'b:9C'],
        combinazione: ['b:4C', 'b:4Q', 'b:4F', 'b:4P'],
        auto: ['b:4C', 'b:4Q', 'b:4F', 'b:4P'],
      }[oggetto];
      let s = alFixer(TRE, { a: carte, b: [], c: [] });
      s = apply(s, { type: 'compra', oggetto, carte, destinatario: 'b' }).state;
      assert.equal(s.jolly.length, 4);
      assert.ok(s.ladri.every((l) => !l.mano.some((c) => c.startsWith('j:'))));
    });
  }
  test('Documenti falsi: annullano lo status di Ricercato per tutta la Banda', () => {
    let s = H.distribuita(['meccanico', { classe: 'lady', ricercato: true }, { classe: 'intellettuale', ricercato: true }]);
    s = H.metti(s, { mani: { a: ['b:KC', 'b:KQ', 'b:KF'] } });
    s = apply(s, { type: 'faseFixer' }).state;
    s = apply(s, { type: 'compra', oggetto: 'documenti', carte: ['b:KC', 'b:KQ', 'b:KF'] }).state;
    assert.ok(s.ladri.every((l) => !l.ricercato));
  });
  test('un Jolly in mano vale come carta qualsiasi per pagare il Fixer', () => {
    // 2 Ladri: ognuno ha un Jolly
    let s = H.distribuita(['meccanico', 'lady']);
    const j = H.ladro(s, 'a').mano.find((c) => c.startsWith('j:'));
    s = H.metti(s, { mani: { a: ['b:KC', 'b:KQ', j] } });
    s = apply(s, { type: 'faseFixer' }).state;
    s = apply(s, { type: 'compra', oggetto: 'documenti', carte: ['b:KC', 'b:KQ', j] }).state;
    assert.ok(s.acquisti.includes('documenti'));
    assert.ok(s.jolly.includes(j), 'il Jolly usato torna al Croupier');
    H.verificaConservazione(s);
  });
  test('non si compra dal Fixer durante i Lavoretti', () => {
    let s = H.distribuita(TRE);
    s = H.metti(s, { mani: { a: ['b:7F', 'b:7P'] } });
    assert.throws(() => apply(s, { type: 'compra', oggetto: 'fumogeni', carte: ['b:7F', 'b:7P'] }), EngineError);
  });
});

describe('Jolly per l\'interpretazione (pag. 30)', () => {
  test('al massimo 1 Jolly per fase allo stesso Ladro (Fase 1 = Lavoretti + Fixer)', () => {
    let s = H.distribuita(TRE);
    s = apply(s, { type: 'daiJolly', ladro: 'a' }).state;
    assert.equal(H.ladro(s, 'a').mano.filter((c) => c.startsWith('j:')).length, 1);
    assert.throws(() => apply(s, { type: 'daiJolly', ladro: 'a' }), EngineError, 'secondo Jolly nei Lavoretti');
    s = apply(s, { type: 'faseFixer' }).state;
    assert.throws(() => apply(s, { type: 'daiJolly', ladro: 'a' }), EngineError, 'al Fixer è ancora la Fase 1');
    s = apply(s, { type: 'faseColpo' }).state;
    s = apply(s, { type: 'daiJolly', ladro: 'a' }).state;
    assert.equal(H.ladro(s, 'a').mano.filter((c) => c.startsWith('j:')).length, 2);
    H.verificaConservazione(s);
  });
  test('in 3 giocatori i Jolly per l\'interpretazione si ottengono solo nelle Fasi 2 e 3', () => {
    let s = H.distribuita(['meccanico', 'lady']);
    assert.throws(() => apply(s, { type: 'daiJolly', ladro: 'a' }), EngineError);
    s = apply(s, { type: 'faseFixer' }).state;
    assert.throws(() => apply(s, { type: 'daiJolly', ladro: 'a' }), EngineError);
    s = apply(s, { type: 'faseColpo' }).state;
    s = apply(s, { type: 'daiJolly', ladro: 'a' }).state;
    assert.equal(H.ladro(s, 'a').mano.filter((c) => c.startsWith('j:')).length, 2);
  });
  test('i Jolly sono solo 4: finiti quelli disponibili non se ne danno altri', () => {
    let s = H.distribuita(['meccanico', 'lady', 'intellettuale', 'lady']);
    for (const id of ['a', 'b', 'c', 'd']) s = apply(s, { type: 'daiJolly', ladro: id }).state;
    assert.equal(s.jolly.length, 0);
    s = apply(s, { type: 'faseFixer' }).state;
    s = apply(s, { type: 'faseColpo' }).state;
    assert.throws(() => apply(s, { type: 'daiJolly', ladro: 'a' }), EngineError);
  });
});
