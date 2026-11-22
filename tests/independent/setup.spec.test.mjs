// Test indipendenti: tabelle del manuale e mani iniziali (pag. 15, 22, 28, 29, 32, 35).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GRADI, LISTINO, CARTE_PER_GUARDIA } from '../../module/core/regole.mjs';
import * as H from './_helpers.mjs';
const { apply, EngineError } = H;

describe('Tabelle verificate contro il manuale', () => {
  test('Tabella del Grado di Rischio (pag. 28)', () => {
    const atteso = {
      banale: [2, 3, false, 2, false],
      discreto: [3, 4, false, 3, false],
      tosto: [4, 2, true, 2, true],
      esagerato: [5, 3, true, 3, true],
    };
    for (const [g, [cr, b, bs, bo, bos]] of Object.entries(atteso)) {
      assert.equal(GRADI[g].croupier, cr, g + ' carte pescate dal Croupier');
      assert.equal(GRADI[g].bottino.n, b, g + ' bottino');
      assert.equal(GRADI[g].bottino.scelta, bs, g + ' bottino a scelta');
      assert.equal(GRADI[g].bonus.n, bo, g + ' bonus');
      assert.equal(GRADI[g].bonus.scelta, bos, g + ' bonus a scelta');
    }
  });
  test('Listino del Fixer (pag. 29)', () => {
    assert.deepEqual(LISTINO.fumogeni.costo, ['coppia']);
    assert.deepEqual(LISTINO.attrezzi.costo, ['coppiaFigure']);
    assert.deepEqual(LISTINO.mappa.costo, ['tris']);
    assert.deepEqual(LISTINO.documenti.costo, ['trisFigure']);
    assert.deepEqual([...LISTINO.personale.costo].sort(), ['colore', 'full']);
    assert.deepEqual([...LISTINO.combinazione.costo].sort(), ['poker', 'scala']);
    assert.deepEqual([...LISTINO.auto.costo].sort(), ['poker', 'scala']);
    assert.equal(Object.keys(LISTINO).length, 7);
  });
  test('3 Carte per Guardia nel Mazzetto (pag. 33)', () => {
    assert.equal(CARTE_PER_GUARDIA, 3);
  });
});

describe('Mani iniziali (pag. 22)', () => {
  test('4 Ladri (5 giocatori): 2 Carte a testa dalla cima del Mazzo della Banda, nessun Jolly', () => {
    let s = H.partita(['lady', 'meccanico', 'intellettuale', 'lady']);
    const cima = s.mazzi.b.pesca.slice(0, 8);
    s = apply(s, { type: 'distribuisci' }).state;
    for (const l of s.ladri) {
      assert.equal(l.mano.length, 2, l.id);
      assert.ok(l.mano.every((c) => c.startsWith('b:')));
    }
    assert.deepEqual(s.ladri.flatMap((l) => l.mano).sort(), [...cima].sort());
    assert.equal(s.jolly.length, 4);
    assert.equal(s.fase, 'lavoretti');
    H.verificaConservazione(s);
  });
  test('i Ricercati pescano 1 Carta in più', () => {
    let s = H.partita(['lady', { classe: 'meccanico', ricercato: true }, 'intellettuale']);
    s = apply(s, { type: 'distribuisci' }).state;
    assert.deepEqual(s.ladri.map((l) => l.mano.length), [2, 3, 2]);
  });
  test('3 Ladri (4 giocatori): nessun Jolly', () => {
    let s = H.partita(['lady', 'meccanico', 'intellettuale']);
    s = apply(s, { type: 'distribuisci' }).state;
    assert.ok(s.ladri.every((l) => l.mano.length === 2 && !l.mano.some((c) => c.startsWith('j:'))));
    assert.equal(s.jolly.length, 4);
  });
  test('3 giocatori (2 Ladri + Croupier): 2 Carte + 1 Jolly a testa', () => {
    let s = H.partita(['lady', { classe: 'meccanico', ricercato: true }]);
    s = apply(s, { type: 'distribuisci' }).state;
    const [a, b] = s.ladri;
    assert.equal(a.mano.filter((c) => c.startsWith('b:')).length, 2);
    assert.equal(a.mano.filter((c) => c.startsWith('j:')).length, 1);
    assert.equal(b.mano.filter((c) => c.startsWith('b:')).length, 3, 'Ricercato: 2+1');
    assert.equal(b.mano.filter((c) => c.startsWith('j:')).length, 1);
    assert.equal(s.jolly.length, 2);
    H.verificaConservazione(s);
  });
  test('non si può distribuire due volte', () => {
    let s = H.distribuita(['lady', 'meccanico', 'intellettuale']);
    assert.throws(() => apply(s, { type: 'distribuisci' }), EngineError);
  });
});

describe('Gangster - Asso nella manica (pag. 15)', () => {
  for (const v of ['2', '5', '9', 'T']) {
    test(`coppia di ${v} (numeri dal 2 al 10) di semi a scelta, presa dal Mazzo della Banda`, () => {
      let s = H.partita(['gangster', 'lady', 'meccanico']);
      s = apply(s, { type: 'coppiaGangster', ladro: 'a', valore: v, semi: ['C', 'P'] }).state;
      const coppia = [`b:${v}C`, `b:${v}P`];
      assert.ok(coppia.every((c) => H.ladro(s, 'a').mano.includes(c)));
      assert.ok(coppia.every((c) => !s.mazzi.b.pesca.includes(c)), 'tolta dal Mazzo della Banda');
      s = apply(s, { type: 'distribuisci' }).state;
      const m = H.ladro(s, 'a').mano;
      assert.ok(coppia.every((c) => m.includes(c)), 'la coppia resta in mano');
      // Lettura (vedi rapporto): la coppia si aggiunge alle 2 Carte iniziali.
      assert.equal(m.length, 4);
      H.verificaConservazione(s);
    });
  }
  for (const v of ['J', 'Q', 'K', 'A']) {
    test(`coppia di ${v} non ammessa (solo numeri dal 2 al 10)`, () => {
      const s = H.partita(['gangster', 'lady', 'meccanico']);
      assert.throws(() => apply(s, { type: 'coppiaGangster', ladro: 'a', valore: v, semi: ['C', 'P'] }), EngineError);
    });
  }
  test('due carte dello stesso seme non sono una coppia valida', () => {
    const s = H.partita(['gangster', 'lady', 'meccanico']);
    assert.throws(() => apply(s, { type: 'coppiaGangster', ladro: 'a', valore: '7', semi: ['C', 'C'] }), EngineError);
  });
  test('solo il Gangster ha l\'Asso nella manica', () => {
    const s = H.partita(['gangster', 'lady', 'meccanico']);
    assert.throws(() => apply(s, { type: 'coppiaGangster', ladro: 'b', valore: '7', semi: ['C', 'P'] }), EngineError);
  });
  test('il Mazzo della Banda viene rimescolato dopo l\'estrazione della coppia', () => {
    // Controllo statistico debole: su 5 seed l'ordine delle carte rimaste non deve coincidere
    // con l'ordine precedente all'estrazione in tutti i casi.
    let rimescolato = 0;
    for (let seed = 1; seed <= 5; seed++) {
      let s = H.partita(['gangster', 'lady', 'meccanico'], { seed });
      const prima = s.mazzi.b.pesca.filter((c) => c !== 'b:7C' && c !== 'b:7P');
      s = apply(s, { type: 'coppiaGangster', ladro: 'a', valore: '7', semi: ['C', 'P'] }).state;
      if (JSON.stringify(prima) !== JSON.stringify(s.mazzi.b.pesca)) rimescolato++;
    }
    assert.ok(rimescolato >= 4);
  });
});

describe('Mostrare la mano (pag. 22)', () => {
  test('i Ladri possono mostrarsi la mano in qualunque momento', () => {
    let s = H.distribuita(['lady', 'meccanico', 'intellettuale']);
    s = apply(s, { type: 'mostra', ladro: 'a', mostra: true }).state;
    assert.equal(H.ladro(s, 'a').mostra, true);
  });
});
