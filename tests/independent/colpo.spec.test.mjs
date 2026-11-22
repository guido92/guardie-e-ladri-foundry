// Test indipendenti: il Grande Colpo - Accesso, Diversivo, Scasso (manuale pag. 21, 32-35).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as H from './_helpers.mjs';
const { apply, EngineError } = H;

/** Partita in fase Colpo, con mani e acquisti impostati a mano. */
function alColpo(spec, { mani = {}, acquisti = [] } = {}) {
  let s = H.distribuita(spec);
  s = apply(s, { type: 'faseFixer' }).state;
  s = H.metti(s, { mani });
  s = H.clone(s);
  s.acquisti = [...acquisti];
  return apply(s, { type: 'faseColpo' }).state;
}

const vuote = (ids) => Object.fromEntries(ids.map((id) => [id, []]));

describe('Accesso (pag. 32-33)', () => {
  test('Ingresso Secondario: serve la Mappa dello stabile', () => {
    const s = alColpo(['meccanico', 'lady', 'intellettuale'], { mani: { a: ['b:3C', 'b:3Q', 'b:3F'] } });
    assert.throws(() => apply(s, { type: 'accesso', tipo: 'secondario', carte: ['b:3C', 'b:3Q', 'b:3F'] }), EngineError);
  });
  test('Ingresso Secondario con la Mappa: costa 1 Tris, nessuna Guardia', () => {
    const s0 = alColpo(['meccanico', 'lady', 'intellettuale'], { mani: { a: ['b:3C', 'b:3Q', 'b:3F', 'b:4F'] }, acquisti: ['mappa'] });
    assert.throws(() => apply(s0, { type: 'accesso', tipo: 'secondario', carte: [] }), EngineError, 'senza Fumogeni serve il Tris');
    assert.throws(() => apply(s0, { type: 'accesso', tipo: 'secondario', carte: ['b:3C', 'b:3Q', 'b:4F'] }), EngineError);
    const s = apply(s0, { type: 'accesso', tipo: 'secondario', carte: ['b:3C', 'b:3Q', 'b:3F'] }).state;
    assert.equal(s.colpo.guardie, 0);
    assert.equal(s.mazzetto.length, 0);
    assert.deepEqual(H.ladro(s, 'a').mano, ['b:4F']);
    H.verificaConservazione(s);
  });
  test('Ingresso Secondario con Mappa e Fumogeni: nessuna Carta', () => {
    const s0 = alColpo(['meccanico', 'lady', 'intellettuale'], { acquisti: ['mappa', 'fumogeni'] });
    const s = apply(s0, { type: 'accesso', tipo: 'secondario', carte: [] }).state;
    assert.equal(s.colpo.guardie, 0);
    assert.equal(s.mazzetto.length, 0);
  });
  test('Ingresso in Incognito: costa 1 Poker, 1 Guardia per ogni Ricercato', () => {
    const spec = ['meccanico', { classe: 'lady', ricercato: true }, { classe: 'intellettuale', ricercato: true }];
    const s0 = alColpo(spec, { mani: { a: ['b:4C', 'b:4Q', 'b:4F', 'b:4P', 'b:5P'] } });
    assert.throws(() => apply(s0, { type: 'accesso', tipo: 'incognito', carte: ['b:4C', 'b:4Q', 'b:4F', 'b:5P'] }), EngineError);
    assert.throws(() => apply(s0, { type: 'accesso', tipo: 'incognito', carte: [] }), EngineError);
    const cima = s0.mazzi.c.pesca.slice(0, 6);
    const s = apply(s0, { type: 'accesso', tipo: 'incognito', carte: ['b:4C', 'b:4Q', 'b:4F', 'b:4P'] }).state;
    assert.equal(s.colpo.guardie, 2);
    assert.equal(s.mazzetto.length, 6, '3 Carte per Guardia');
    assert.deepEqual([...s.mazzetto].sort(), [...cima].sort(), 'pescate dal Mazzo del Croupier');
    H.verificaConservazione(s);
  });
  test('Ingresso in Incognito con Personale corrotto: nessuna Carta', () => {
    const s0 = alColpo(['meccanico', { classe: 'lady', ricercato: true }, 'intellettuale'], { acquisti: ['personale'] });
    const s = apply(s0, { type: 'accesso', tipo: 'incognito', carte: [] }).state;
    assert.equal(s.colpo.guardie, 1);
    assert.equal(s.mazzetto.length, 3);
  });
  test('Ingresso in Incognito con Documenti falsi: nessuna Guardia', () => {
    const s0 = alColpo(['meccanico', { classe: 'lady', ricercato: true }, 'intellettuale'], {
      mani: { a: ['b:4C', 'b:4Q', 'b:4F', 'b:4P'] }, acquisti: ['documenti'],
    });
    const s = apply(s0, { type: 'accesso', tipo: 'incognito', carte: ['b:4C', 'b:4Q', 'b:4F', 'b:4P'] }).state;
    assert.equal(s.colpo.guardie, 0);
    assert.equal(s.mazzetto.length, 0);
  });
  for (const n of [2, 3, 4]) {
    test(`Ingresso Teatrale: nessuna Carta, 1 Guardia per ogni Ladro (${n} Ladri)`, () => {
      const spec = ['meccanico', 'lady', 'intellettuale', 'lady'].slice(0, n);
      const s = apply(alColpo(spec), { type: 'accesso', tipo: 'teatrale', carte: [] }).state;
      assert.equal(s.colpo.guardie, n);
      assert.equal(s.mazzetto.length, 3 * n);
    });
    test(`Ingresso Teatrale con Personale corrotto: Guardie dimezzate per difetto (${n} Ladri)`, () => {
      const spec = ['meccanico', 'lady', 'intellettuale', 'lady'].slice(0, n);
      const s = apply(alColpo(spec, { acquisti: ['personale'] }), { type: 'accesso', tipo: 'teatrale', carte: [] }).state;
      assert.equal(s.colpo.guardie, Math.floor(n / 2));
      assert.equal(s.mazzetto.length, 3 * Math.floor(n / 2));
    });
  }
  test('l\'Accesso si fa una volta sola', () => {
    const s = apply(alColpo(['meccanico', 'lady', 'intellettuale']), { type: 'accesso', tipo: 'teatrale', carte: [] }).state;
    assert.throws(() => apply(s, { type: 'accesso', tipo: 'teatrale', carte: [] }), EngineError);
  });
  test('le Carte pagate per l\'Accesso vanno negli scarti (API.md scelta 5)', () => {
    const s0 = alColpo(['meccanico', 'lady', 'intellettuale'], { mani: { a: ['b:3C', 'b:3Q', 'b:3F'] }, acquisti: ['mappa'] });
    const s = apply(s0, { type: 'accesso', tipo: 'secondario', carte: ['b:3C', 'b:3Q', 'b:3F'] }).state;
    assert.ok(['b:3C', 'b:3Q', 'b:3F'].every((c) => s.mazzi.b.scarti.includes(c)));
  });
  test('il Ricercato "comporta maggiori Rischi": Teatrale non dipende dai Ricercati', () => {
    const s = apply(alColpo(['meccanico', { classe: 'lady', ricercato: true }, 'intellettuale']), { type: 'accesso', tipo: 'teatrale', carte: [] }).state;
    assert.equal(s.colpo.guardie, 3);
  });
});

describe('Diversivo (pag. 33)', () => {
  test('non si fa prima dell\'Accesso', () => {
    const s = alColpo(['meccanico', 'lady', 'intellettuale']);
    assert.throws(() => apply(s, { type: 'diversivo', ladro: 'a' }), EngineError);
  });
  test('il Ladro perde 1 Carta presa dal Croupier e toglie dal Mazzetto tante Carte quante Guardie', () => {
    let s = alColpo(['meccanico', 'lady', 'intellettuale'], { mani: { a: ['b:7F', 'b:8F', 'b:9F'] } });
    s = apply(s, { type: 'accesso', tipo: 'teatrale', carte: [] }).state; // 3 Guardie, 9 Carte
    assert.equal(s.mazzetto.length, 9);
    const prima = [...s.mazzetto];
    s = apply(s, { type: 'diversivo', ladro: 'a' }).state;
    assert.equal(H.ladro(s, 'a').mano.length, 2);
    assert.equal(s.mazzetto.length, 6);
    assert.ok(s.mazzetto.every((c) => prima.includes(c)));
    H.verificaConservazione(s);
  });
  test('Esempio del manuale: 2 Guardie Allertate, 2 Carte tolte dal Mazzetto', () => {
    let s = alColpo(['meccanico', { classe: 'lady', ricercato: true }, { classe: 'intellettuale', ricercato: true }], {
      mani: { a: ['b:4C', 'b:4Q', 'b:4F', 'b:4P', 'b:7F'] },
    });
    s = apply(s, { type: 'accesso', tipo: 'incognito', carte: ['b:4C', 'b:4Q', 'b:4F', 'b:4P'] }).state;
    assert.equal(s.colpo.guardie, 2);
    s = apply(s, { type: 'diversivo', ladro: 'a' }).state;
    assert.equal(s.mazzetto.length, 4);
    assert.deepEqual(H.ladro(s, 'a').mano, []);
  });
  test('ogni Ladro partecipa una volta sola, ma più Ladri possono partecipare', () => {
    let s = alColpo(['meccanico', 'lady', 'intellettuale'], { mani: { a: ['b:7F', 'b:8F'], b: ['b:7Q', 'b:8Q'] } });
    s = apply(s, { type: 'accesso', tipo: 'teatrale', carte: [] }).state;
    s = apply(s, { type: 'diversivo', ladro: 'a' }).state;
    assert.throws(() => apply(s, { type: 'diversivo', ladro: 'a' }), EngineError);
    s = apply(s, { type: 'diversivo', ladro: 'b' }).state;
    assert.equal(s.mazzetto.length, 3);
    assert.deepEqual([H.ladro(s, 'a').mano.length, H.ladro(s, 'b').mano.length], [1, 1]);
  });
  test('senza Carte in mano non si partecipa al Diversivo', () => {
    let s = alColpo(['meccanico', 'lady', 'intellettuale'], { mani: { a: [] } });
    s = apply(s, { type: 'accesso', tipo: 'teatrale', carte: [] }).state;
    assert.throws(() => apply(s, { type: 'diversivo', ladro: 'a' }), EngineError);
  });
});

describe('Scasso (pag. 21, 35)', () => {
  const dopoAccesso = (spec, opt) => apply(alColpo(spec, opt), { type: 'accesso', tipo: 'teatrale', carte: [] }).state;

  test('non si scassina prima dell\'Accesso', () => {
    const s = alColpo(['meccanico', 'lady', 'intellettuale'], { acquisti: ['combinazione'] });
    assert.throws(() => apply(s, { type: 'scasso', tipo: 'professionale', carte: [] }), EngineError);
  });
  test('Professionale: serve la Combinazione; nessuna Carta, nessuna Guardia, Bottino Finale preso', () => {
    const s0 = dopoAccesso(['meccanico', 'lady', 'intellettuale']);
    assert.throws(() => apply(s0, { type: 'scasso', tipo: 'professionale', carte: [] }), EngineError);
    const s1 = dopoAccesso(['meccanico', 'lady', 'intellettuale'], { acquisti: ['combinazione'] });
    const g = s1.colpo.guardie;
    const m = s1.mazzetto.length;
    const s = apply(s1, { type: 'scasso', tipo: 'professionale', carte: [] }).state;
    assert.equal(s.colpo.guardie, g);
    assert.equal(s.mazzetto.length, m);
    assert.equal(s.bottinoFinale, true);
  });
  test('Tecnico: servono gli Attrezzi da Scasso', () => {
    const s = dopoAccesso(['meccanico', 'lady', 'meccanico'], { mani: { a: ['b:KC', 'b:KQ', 'b:KF'] } });
    assert.throws(() => apply(s, { type: 'scasso', tipo: 'tecnico', carte: ['b:KC', 'b:KQ', 'b:KF'] }), EngineError);
  });
  test('Tecnico: 1 Tris di figure, 1 Guardia per ogni Ricercato', () => {
    const spec = [{ classe: 'meccanico', ricercato: true }, { classe: 'lady', ricercato: true }, { classe: 'meccanico', ricercato: true }];
    const s0 = dopoAccesso(spec, { mani: { a: ['b:KC', 'b:KQ', 'b:KF', 'b:9C', 'b:9Q', 'b:9F'] }, acquisti: ['attrezzi'] });
    assert.throws(() => apply(s0, { type: 'scasso', tipo: 'tecnico', carte: ['b:9C', 'b:9Q', 'b:9F'] }), EngineError, 'tris non di figure');
    const g = s0.colpo.guardie;
    const m = s0.mazzetto.length;
    const s = apply(s0, { type: 'scasso', tipo: 'tecnico', carte: ['b:KC', 'b:KQ', 'b:KF'] }).state;
    assert.equal(s.colpo.guardie - g, 3);
    assert.equal(s.mazzetto.length - m, 9);
    assert.equal(s.bottinoFinale, true);
    assert.ok(['b:KC', 'b:KQ', 'b:KF'].every((c) => s.mazzi.b.scarti.includes(c)));
    H.verificaConservazione(s);
  });
  test('Tecnico con l\'Intellettuale (Eureka): Guardie dimezzate per difetto', () => {
    const spec = [{ classe: 'meccanico', ricercato: true }, { classe: 'lady', ricercato: true }, { classe: 'intellettuale', ricercato: true }];
    const s0 = dopoAccesso(spec, { mani: { a: ['b:KC', 'b:KQ', 'b:KF'] }, acquisti: ['attrezzi'] });
    const g = s0.colpo.guardie;
    const s = apply(s0, { type: 'scasso', tipo: 'tecnico', carte: ['b:KC', 'b:KQ', 'b:KF'] }).state;
    assert.equal(s.colpo.guardie - g, 1, 'floor(3/2) = 1');
  });
  test('Brutale: 1 Poker di figure, 1 Guardia per ogni membro della Banda', () => {
    const s0 = dopoAccesso(['meccanico', 'lady', 'meccanico'], {
      mani: { a: ['b:QC', 'b:QQ', 'b:QF', 'b:QP', 'b:9C', 'b:9Q', 'b:5F', 'b:5P', 'b:9F', 'b:9P'] },
    });
    assert.throws(() => apply(s0, { type: 'scasso', tipo: 'brutale', carte: ['b:9C', 'b:9Q', 'b:9F', 'b:9P'] }), EngineError, 'poker non di figure');
    assert.throws(() => apply(s0, { type: 'scasso', tipo: 'brutale', carte: ['b:9C', 'b:9Q', 'b:5F', 'b:5P'] }), EngineError, 'doppia coppia senza Intellettuale');
    const g = s0.colpo.guardie;
    const s = apply(s0, { type: 'scasso', tipo: 'brutale', carte: ['b:QC', 'b:QQ', 'b:QF', 'b:QP'] }).state;
    assert.equal(s.colpo.guardie - g, 3);
    assert.equal(s.bottinoFinale, true);
  });
  test('Brutale con l\'Intellettuale (Eureka): basta una Doppia Coppia', () => {
    const s0 = dopoAccesso(['meccanico', 'lady', 'intellettuale', 'lady'], { mani: { a: ['b:9C', 'b:9Q', 'b:5F', 'b:5P'] } });
    const g = s0.colpo.guardie;
    const s = apply(s0, { type: 'scasso', tipo: 'brutale', carte: ['b:9C', 'b:9Q', 'b:5F', 'b:5P'] }).state;
    assert.equal(s.colpo.guardie - g, 4, 'le Guardie del Brutale non cambiano con l\'Intellettuale');
    assert.equal(s.bottinoFinale, true);
  });
  test('Brutale con l\'Intellettuale: anche il Poker di figure resta valido', () => {
    const s0 = dopoAccesso(['meccanico', 'lady', 'intellettuale'], { mani: { a: ['b:QC', 'b:QQ', 'b:QF', 'b:QP'] } });
    const s = apply(s0, { type: 'scasso', tipo: 'brutale', carte: ['b:QC', 'b:QQ', 'b:QF', 'b:QP'] }).state;
    assert.equal(s.bottinoFinale, true);
  });
  test('a mani vuote: 1 Guardia per ogni membro della Banda e niente Bottino Finale', () => {
    const s0 = dopoAccesso(['meccanico', 'lady', 'intellettuale', 'lady']);
    const g = s0.colpo.guardie;
    const m = s0.mazzetto.length;
    const s = apply(s0, { type: 'scasso', tipo: 'nessuno', carte: [] }).state;
    assert.equal(s.colpo.guardie - g, 4);
    assert.equal(s.mazzetto.length - m, 12);
    assert.equal(s.bottinoFinale, false);
  });
  test('lo Scasso si fa una volta sola', () => {
    const s = apply(dopoAccesso(['meccanico', 'lady', 'intellettuale']), { type: 'scasso', tipo: 'nessuno', carte: [] }).state;
    assert.throws(() => apply(s, { type: 'scasso', tipo: 'nessuno', carte: [] }), EngineError);
  });
  test('le Guardie dello Scasso si sommano a quelle dell\'Accesso nel Mazzetto (3 Carte ciascuna)', () => {
    let s = dopoAccesso(['meccanico', 'lady']); // 2 Guardie
    s = apply(s, { type: 'scasso', tipo: 'nessuno', carte: [] }).state; // +2
    assert.equal(s.colpo.guardie, 4);
    assert.equal(s.mazzetto.length, 12);
    H.verificaConservazione(s);
  });
});

describe('Diversivo: quando ha senso (pag. 33)', () => {
  test('senza Guardie Allertate non c\'è Diversivo', () => {
    let s = alColpo(['meccanico', 'lady', 'intellettuale'], { acquisti: ['mappa', 'fumogeni'] });
    s = apply(s, { type: 'accesso', tipo: 'secondario', carte: [] }).state;
    assert.throws(() => apply(s, { type: 'diversivo', ladro: 'a' }), EngineError);
  });
  test('il Diversivo si tenta mentre la Banda va verso il Bottino (prima dello Scasso)', () => {
    let s = alColpo(['meccanico', 'lady', 'intellettuale']);
    s = apply(s, { type: 'accesso', tipo: 'teatrale', carte: [] }).state;
    s = apply(s, { type: 'scasso', tipo: 'nessuno', carte: [] }).state;
    assert.throws(() => apply(s, { type: 'diversivo', ladro: 'a' }), EngineError);
  });
});
