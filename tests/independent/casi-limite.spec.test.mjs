// Test indipendenti: casi limite e ordine delle Fasi.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as H from './_helpers.mjs';
const { apply, EngineError, carteDaGiocare } = H;

const T = ['b:2F', 'b:5Q', 'b:9P', 'b:JC', 'b:KQ'];
const TRE = ['meccanico', 'lady', 'intellettuale'];

describe('Ordine delle Fasi', () => {
  test('niente Lavoretti dopo l\'incontro con il Fixer', () => {
    let s = apply(H.distribuita(TRE), { type: 'faseFixer' }).state;
    assert.throws(() => apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a'] }), EngineError);
  });
  test('il Grande Colpo viene dopo il Fixer', () => {
    assert.throws(() => apply(H.distribuita(TRE), { type: 'faseColpo' }), EngineError);
  });
  test('la Grande Fuga viene dopo lo Scasso', () => {
    let s = H.seq(H.distribuita(TRE), [{ type: 'faseFixer' }, { type: 'faseColpo' }, { type: 'accesso', tipo: 'teatrale', carte: [] }]).state;
    assert.throws(() => apply(s, { type: 'faseFuga' }), EngineError);
  });
  test('non si passa al Fixer con un Lavoretto in corso', () => {
    let s = apply(H.distribuita(TRE), { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a'] }).state;
    assert.throws(() => apply(s, { type: 'faseFixer' }), EngineError);
  });
});

describe('Coppia: chi si ritira rinuncia al Bottino (pag. 24)', () => {
  test('a si ritira al flop, b vince da solo: tutto il Bottino va a b', () => {
    let s = H.distribuita(TRE);
    s = H.metti(s, { mani: { a: ['b:7F', 'b:8F'], b: ['b:AC', 'b:AQ'] }, topB: T, topC: ['c:3C', 'c:4P'] });
    s = apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a', 'b'] }).state;
    s = apply(s, { type: 'decidi', ladro: 'a', scelta: 'ritira' }).state;
    s = apply(s, { type: 'avanza' }).state;
    s = apply(s, { type: 'avanza' }).state;
    s = apply(s, { type: 'gioca', ladro: 'b', carte: ['b:AC', 'b:AQ'] }).state;
    s = apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:4P'] }).state;
    assert.equal(s.confronto.esito, 'successo');
    s = apply(s, { type: 'vota', ladro: 'b', scelta: 'incassa' }).state;
    if (s.bottino) s = apply(s, { type: 'bottinoDividi' }).state;
    assert.deepEqual([...H.ladro(s, 'a').mano].sort(), ['b:7F', 'b:8F']);
    assert.equal(H.ladro(s, 'b').mano.length, 3);
    H.verificaConservazione(s);
  });
  test('chi resta da solo con 1 sola Carta ne posa 1 (API.md scelta 2)', () => {
    let s = H.distribuita(TRE);
    s = H.metti(s, { mani: { a: ['b:7F', 'b:8F'], b: ['b:AC'] }, topB: T, topC: ['c:3C', 'c:4P'] });
    s = apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a', 'b'] }).state;
    s = apply(s, { type: 'decidi', ladro: 'a', scelta: 'ritira' }).state;
    s = apply(s, { type: 'avanza' }).state;
    s = apply(s, { type: 'avanza' }).state;
    assert.equal(carteDaGiocare(s, 'b'), 1);
  });
  test('entrambi si ritirano al flop: il Lavoretto finisce senza perdite', () => {
    let s = H.distribuita(TRE);
    s = H.metti(s, { mani: { a: ['b:7F', 'b:8F'], b: ['b:AC', 'b:AQ'] }, topB: T });
    s = apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a', 'b'] }).state;
    s = apply(s, { type: 'decidi', ladro: 'a', scelta: 'ritira' }).state;
    s = apply(s, { type: 'decidi', ladro: 'b', scelta: 'ritira' }).state;
    assert.equal(s.confronto, null);
    assert.equal(H.ladro(s, 'a').mano.length + H.ladro(s, 'b').mano.length, 4);
    assert.throws(() => apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a'] }), EngineError);
    assert.throws(() => apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['b'] }), EngineError);
  });
});

describe('Baciamano: limiti (API.md scelta 8)', () => {
  test('una sola volta per Confronto', () => {
    let s = H.distribuita(['lady', 'meccanico', 'intellettuale']);
    s = H.metti(s, { mani: { a: ['b:AC', 'b:3F', 'b:4P', 'b:6P'] }, topB: T, topC: ['c:KC', 'c:KP'] });
    s = H.finoAlRiver(s, 'banale', ['a']);
    s = apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC', 'b:3F'] }).state;
    s = apply(s, { type: 'croupierGioca', carte: ['c:KC', 'c:KP'] }).state;
    s = apply(s, { type: 'baciamano', ladro: 'a', mano: 'b:4P', giocata: 'b:3F' }).state;
    assert.equal(s.confronto.esito, 'fallimento');
    assert.throws(() => apply(s, { type: 'baciamano', ladro: 'a', mano: 'b:6P', giocata: 'b:4P' }), EngineError);
  });
});

describe('Bottino a scelta: Mazzo rimescolato (pag. 28)', () => {
  test('dopo la scelta l\'ordine del Mazzo della Banda cambia', () => {
    let cambiato = 0;
    for (let seed = 1; seed <= 4; seed++) {
      let s = H.distribuita(TRE, { seed });
      s = H.metti(s, { mani: { a: ['b:AC', 'b:AQ'] }, topB: T, topC: ['c:3C', 'c:4P', 'c:6F', 'c:8Q'] });
      s = H.finoAlRiver(s, 'tosto', ['a']);
      s = apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC', 'b:AQ'] }).state;
      s = apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:4P'] }).state;
      s = apply(s, { type: 'vota', ladro: 'a', scelta: 'incassa' }).state;
      const scelte = s.mazzi.b.pesca.slice(3, 5);
      const atteso = s.mazzi.b.pesca.filter((c) => !scelte.includes(c));
      s = apply(s, { type: 'bottinoScegli', ladro: 'a', carte: scelte }).state;
      if (JSON.stringify(s.mazzi.b.pesca) !== JSON.stringify(atteso)) cambiato++;
    }
    assert.ok(cambiato >= 3);
  });
});

describe('Jolly: Fixer e interpretazione sono indipendenti (pag. 30)', () => {
  test('un Jolly per interpretazione non impedisce di ricevere quello dei Fumogeni', () => {
    let s = H.distribuita(TRE);
    s = apply(s, { type: 'daiJolly', ladro: 'a' }).state;
    s = H.metti(s, { mani: { b: ['b:7F', 'b:7P'] } });
    s = apply(s, { type: 'faseFixer' }).state;
    s = apply(s, { type: 'compra', oggetto: 'fumogeni', carte: ['b:7F', 'b:7P'], destinatario: 'a' }).state;
    assert.equal(H.ladro(s, 'a').mano.filter((c) => c.startsWith('j:')).length, 2);
  });
});

describe('Fuga: casi limite', () => {
  function vigilia(spec, { mani, mazzetto, topB = T, acquisti = [], scasso = 'nessuno' }) {
    let s = H.distribuita(spec);
    s = apply(s, { type: 'faseFixer' }).state;
    s = H.clone(s);
    s.acquisti = acquisti;
    s = H.seq(s, [{ type: 'faseColpo' }, { type: 'accesso', tipo: 'teatrale', carte: [] }, { type: 'scasso', tipo: scasso, carte: [] }]).state;
    return H.metti(s, { mani, mazzetto, topB });
  }
  test('il Meccanico pesca prima del controllo delle 2 Carte: 1 Carta + Versatile = Confronto', () => {
    let s = vigilia(['meccanico', 'lady', 'intellettuale'], { mani: { a: ['b:AC'], b: [], c: [] }, mazzetto: ['c:3C', 'c:4P'], topB: ['b:7F', ...T] });
    s = apply(s, { type: 'faseFuga' }).state;
    assert.ok(s.confronto, 'la Banda ha 2 Carte: si gioca');
    assert.notEqual(s.esito?.tipo, 'arrestati');
  });
  test('Successo nella Fuga con il Bottino Finale: la Banda se lo gode', () => {
    let s = vigilia(['lady', 'lady', 'intellettuale'], {
      mani: { a: ['b:AC'], b: ['b:AQ'], c: [] }, mazzetto: ['c:3C', 'c:4P'], acquisti: ['combinazione'], scasso: 'professionale',
    });
    s = apply(s, { type: 'faseFuga' }).state;
    s = apply(s, { type: 'avanza' }).state;
    s = apply(s, { type: 'gioca', carte: ['b:AC', 'b:AQ'] }).state;
    s = apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:4P'] }).state;
    if (s.confronto) s = apply(s, { type: 'accetta' }).state;
    assert.ok(s.esito);
    assert.ok(!['arrestati', 'penaDura', 'fuggitiManiVuote'].includes(s.esito.tipo), s.esito.tipo);
    assert.equal(s.bottinoFinale, true);
  });
});

describe('Jolly usati nel Grande Colpo tornano al Croupier (pag. 30)', () => {
  test('Tris dell\'Ingresso Secondario pagato con un Jolly', () => {
    let s = H.distribuita(['meccanico', 'lady']); // 3 giocatori: 1 Jolly a testa
    const j = H.ladro(s, 'a').mano.find((c) => c.startsWith('j:'));
    s = H.metti(s, { mani: { a: ['b:3C', 'b:3Q', j] } });
    s = apply(s, { type: 'faseFixer' }).state;
    s = H.clone(s);
    s.acquisti = ['mappa'];
    s = apply(s, { type: 'faseColpo' }).state;
    s = apply(s, { type: 'accesso', tipo: 'secondario', carte: ['b:3C', 'b:3Q', j] }).state;
    assert.equal(s.colpo.guardie, 0);
    assert.ok(s.jolly.includes(j));
    assert.ok(!s.mazzi.b.scarti.includes(j));
    H.verificaConservazione(s);
  });
});

describe('Mazzo finito (API.md scelta 12)', () => {
  test('se il Mazzo della Banda finisce si rimescolano gli scarti', () => {
    let s = H.clone(H.distribuita(TRE));
    s.mazzi.b.scarti = s.mazzi.b.pesca.splice(0, s.mazzi.b.pesca.length - 2);
    s = apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a'] }).state;
    assert.equal(s.confronto.tavolo.length, 3);
    H.verificaConservazione(s);
  });
});
