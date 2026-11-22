// Test indipendenti: la Grande Fuga, Pentiti, All-in, Meccanico, Auto da corsa (manuale pag. 19, 29, 36-38).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as H from './_helpers.mjs';
const { apply, EngineError } = H;

const T = ['b:2F', 'b:5Q', 'b:9P', 'b:JC', 'b:KQ'];

/**
 * Porta la partita alla vigilia della Fuga (Colpo concluso), con mani, Mazzetto,
 * cima del Mazzo della Banda e acquisti impostati a mano.
 */
function vigilia(spec, { mani = {}, mazzetto, topB = T, topC = [], acquisti = [], opzioni, accesso = 'teatrale', scasso = 'nessuno' } = {}) {
  let s = H.distribuita(spec, { opzioni });
  s = apply(s, { type: 'faseFixer' }).state;
  s = H.clone(s);
  s.acquisti = [...acquisti];
  s = apply(s, { type: 'faseColpo' }).state;
  s = apply(s, { type: 'accesso', tipo: accesso, carte: [] }).state;
  if (scasso) s = apply(s, { type: 'scasso', tipo: scasso, carte: [] }).state;
  return H.metti(s, { mani, mazzetto, topB, topC });
}

const vuote = (spec) => Object.fromEntries(spec.map((_, i) => [String.fromCharCode(97 + i), []]));
const totaleBanda = (s) => s.ladri.reduce((n, l) => n + l.mano.length, 0);

describe('Inizio della Grande Fuga (pag. 19, 36)', () => {
  test('il Croupier aggiunge al Mazzetto 1 Carta per ogni membro della Banda', () => {
    const spec = ['lady', 'intellettuale', 'lady'];
    let s = vigilia(spec, { mani: { a: ['b:AC', 'b:AQ'], b: ['b:3C'], c: [] }, mazzetto: ['c:3C', 'c:4P', 'c:KC'], topC: ['c:9C', 'c:9Q', 'c:9F'] });
    s = apply(s, { type: 'faseFuga' }).state;
    assert.equal(s.fase, 'fuga');
    assert.equal(s.mazzetto.length, 6);
    assert.ok(['c:9C', 'c:9Q', 'c:9F'].every((c) => s.mazzetto.includes(c)));
    H.verificaConservazione(s);
  });
  test('Meccanico (Versatile): pesca 1 Carta dal Mazzo della Banda all\'inizio della Fuga', () => {
    const spec = ['meccanico', 'lady', 'intellettuale'];
    let s = vigilia(spec, { mani: { a: ['b:AC'], b: ['b:3C'], c: [] }, mazzetto: ['c:3C', 'c:4P', 'c:KC'], topB: ['b:7F', ...T] });
    s = apply(s, { type: 'faseFuga' }).state;
    assert.deepEqual([...H.ladro(s, 'a').mano].sort(), ['b:7F', 'b:AC']);
    assert.deepEqual(s.confronto.tavolo, T.slice(0, 3), 'il flop arriva dopo la pesca del Meccanico');
  });
  test('senza Meccanico nessuno pesca', () => {
    const spec = ['lady', 'lady', 'intellettuale'];
    let s = vigilia(spec, { mani: { a: ['b:AC'], b: ['b:3C'], c: [] }, mazzetto: ['c:3C', 'c:4P', 'c:KC'] });
    s = apply(s, { type: 'faseFuga' }).state;
    assert.equal(totaleBanda(s), 2);
  });
  test('Auto da corsa: il Croupier scarta a caso 1 Carta per Ladro dal Mazzetto', () => {
    const spec = ['lady', 'intellettuale', 'lady'];
    let s = vigilia(spec, { mani: { a: ['b:AC', 'b:AQ'], b: ['b:3C'] }, mazzetto: ['c:3C', 'c:4P', 'c:KC', 'c:KP', 'c:6F', 'c:8Q'], acquisti: ['auto'] });
    s = apply(s, { type: 'faseFuga' }).state;
    assert.equal(s.mazzetto.length, 6 + 3 - 3);
    assert.equal(s.mazzi.c.scarti.length >= 3, true, 'le Carte scartate finiscono negli scarti');
    H.verificaConservazione(s);
  });
  test('se il Mazzetto resta con meno di 2 Carte la Banda fugge senza Confronto', () => {
    // Nessuna Guardia (Ingresso Secondario + Scasso Professionale) e Auto da corsa: Mazzetto = 3 - 3 = 0
    const spec = ['lady', 'intellettuale', 'lady'];
    let s = vigilia(spec, { mani: { a: ['b:AC', 'b:AQ'] }, acquisti: ['auto', 'mappa', 'fumogeni', 'combinazione'], accesso: 'secondario', scasso: 'professionale' });
    assert.equal(s.mazzetto.length, 0);
    s = apply(s, { type: 'faseFuga' }).state;
    assert.equal(s.confronto, null);
    assert.ok(s.esito);
    assert.notEqual(s.esito.tipo, 'arrestati');
    assert.equal(s.bottinoFinale, true);
  });
  test('se la Banda resta con meno di 2 Carte viene arrestata senza Confronto', () => {
    const spec = ['lady', 'intellettuale', 'lady'];
    let s = vigilia(spec, { mani: { a: ['b:AC'], b: [], c: [] }, mazzetto: ['c:3C', 'c:4P', 'c:KC'] });
    s = apply(s, { type: 'faseFuga' }).state;
    assert.equal(s.confronto, null);
    assert.equal(s.esito?.tipo, 'arrestati');
  });
  test('con almeno 2 Carte a testa scatta il Confronto: flop di 3 Carte dal Mazzo della Banda', () => {
    const spec = ['lady', 'intellettuale', 'lady'];
    let s = vigilia(spec, { mani: { a: ['b:AC'], b: ['b:AQ'], c: [] }, mazzetto: ['c:3C', 'c:4P'] });
    s = apply(s, { type: 'faseFuga' }).state;
    assert.equal(s.confronto?.tipo, 'fuga');
    assert.equal(s.confronto.step, 'flop');
    assert.deepEqual(s.confronto.tavolo, T.slice(0, 3));
  });
});

describe('Confronto della Fuga (pag. 36-38)', () => {
  const spec = ['lady', 'intellettuale', 'lady'];
  const MZ = ['c:3C', 'c:4P', 'c:KC', 'c:KP', 'c:6F', 'c:8Q'];
  function inFuga(opt = {}) {
    let s = vigilia(spec, { mani: { a: ['b:AC', 'b:7F'], b: ['b:AQ', 'b:8P'], c: ['b:3F'] }, mazzetto: MZ, topB: [...T, 'b:6C', 'b:6P'], ...opt });
    return apply(s, { type: 'faseFuga' }).state;
  }

  test('dopo il flop escono insieme 4ª e 5ª Carta, poi non ci si ritira più', () => {
    let s = inFuga();
    s = apply(s, { type: 'avanza' }).state;
    assert.equal(s.confronto.step, 'river');
    assert.deepEqual(s.confronto.tavolo, T);
    assert.throws(() => apply(s, { type: 'decidi', ladro: 'c', scelta: 'ritira' }), EngineError);
  });
  test('un Pentito al flop: la Banda scarta a caso 1 Carta per ogni membro che abbandona', () => {
    let s = inFuga();
    const prima = totaleBanda(s);
    s = apply(s, { type: 'decidi', ladro: 'c', scelta: 'ritira' }).state;
    assert.equal(H.ladro(s, 'c').pentito, true);
    assert.equal(totaleBanda(s), prima - 1);
    assert.equal(s.confronto.attivi.includes('c'), false);
    H.verificaConservazione(s);
  });
  test('due Pentiti: 2 Carte scartate', () => {
    let s = inFuga();
    const prima = totaleBanda(s);
    s = apply(s, { type: 'decidi', ladro: 'c', scelta: 'ritira' }).state;
    s = apply(s, { type: 'decidi', ladro: 'b', scelta: 'ritira' }).state;
    assert.equal(totaleBanda(s), prima - 2);
  });
  test('la Banda gioca 2 Carte da mani diverse, il Croupier 2 dal Mazzetto: Successo', () => {
    let s = inFuga();
    s = apply(s, { type: 'avanza' }).state;
    assert.throws(() => apply(s, { type: 'gioca', carte: ['b:AC', 'b:AQ', 'b:7F'] }), EngineError);
    s = apply(s, { type: 'gioca', carte: ['b:AC', 'b:AQ'] }).state;
    assert.throws(() => apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:9C'] }), EngineError, 'carta fuori dal Mazzetto');
    s = apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:4P'] }).state;
    if (s.confronto?.step === 'esito') assert.equal(s.confronto.esito, 'successo');
    else assert.notEqual(s.esito?.tipo, 'arrestati');
  });
  test('Fallimento nella Fuga: i Ladri vengono arrestati', () => {
    let s = inFuga();
    s = apply(s, { type: 'avanza' }).state;
    s = apply(s, { type: 'gioca', carte: ['b:7F', 'b:8P'] }).state;
    s = apply(s, { type: 'croupierGioca', carte: ['c:KC', 'c:KP'] }).state;
    assert.equal(s.confronto.esito, 'fallimento');
    s = apply(s, { type: 'accetta' }).state;
    assert.equal(s.esito.tipo, 'arrestati');
  });
  test('parità nella Fuga: vince il Croupier', () => {
    let s = vigilia(spec, { mani: { a: ['b:3F'], b: ['b:4C'], c: [] }, mazzetto: ['c:3C', 'c:4P'] });
    s = apply(s, { type: 'faseFuga' }).state;
    s = apply(s, { type: 'avanza' }).state;
    s = apply(s, { type: 'gioca', carte: ['b:3F', 'b:4C'] }).state;
    s = apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:4P'] }).state;
    assert.equal(s.confronto.esito, 'fallimento');
  });
  test('la Lady può usare il Baciamano anche nella Fuga', () => {
    let s = inFuga();
    s = apply(s, { type: 'avanza' }).state;
    s = apply(s, { type: 'gioca', carte: ['b:AC', 'b:3F'] }).state; // A alta
    s = apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:KP'] }).state; // coppia di K (con K♦ a terra)
    assert.equal(s.confronto.esito, 'fallimento');
    s = apply(s, { type: 'baciamano', ladro: 'a', mano: 'b:7F', giocata: 'b:3F' }).state; // niente da fare: resta Fallimento
    assert.equal(s.confronto.esito, 'fallimento');
  });
  test('i Pentiti risultano nell\'esito finale', () => {
    let s = inFuga();
    s = apply(s, { type: 'decidi', ladro: 'c', scelta: 'ritira' }).state;
    s = apply(s, { type: 'avanza' }).state;
    const carte = s.ladri.flatMap((l) => l.mano).slice(0, 2);
    s = apply(s, { type: 'gioca', carte }).state;
    s = apply(s, { type: 'croupierGioca', carte: ['c:KC', 'c:KP'] }).state;
    if (s.confronto) s = apply(s, { type: 'accetta' }).state;
    assert.ok(s.esito);
    assert.deepEqual(s.esito.pentiti, ['c']);
  });
});

describe('All-in (pag. 38)', () => {
  const spec = ['lady', 'intellettuale', 'lady'];
  const MZ = ['c:3C', 'c:4P', 'c:KC', 'c:KP', 'c:6F', 'c:8Q'];
  function fallita({ pentito = false, opzioni, conBottino = false } = {}) {
    let s = vigilia(spec, { mani: { a: ['b:AC', 'b:7F'], b: ['b:AQ', 'b:8P'], c: ['b:3F'] }, mazzetto: MZ, topB: [...T, 'b:6C', 'b:6P'], opzioni, scasso: conBottino ? 'professionale' : 'nessuno', acquisti: conBottino ? ['combinazione'] : [] });
    s = apply(s, { type: 'faseFuga' }).state;
    if (pentito) s = apply(s, { type: 'decidi', ladro: 'c', scelta: 'ritira' }).state;
    s = apply(s, { type: 'avanza' }).state;
    const carte = pentito ? s.ladri.filter((l) => !l.pentito).flatMap((l) => l.mano).slice(0, 2) : ['b:7F', 'b:8P'];
    s = apply(s, { type: 'gioca', carte }).state;
    s = apply(s, { type: 'croupierGioca', carte: ['c:KC', 'c:KP'] }).state;
    assert.equal(s.confronto.esito, 'fallimento');
    return { s, carte };
  }

  test('dopo il Fallimento: le Carte della Banda restano, 5 nuove Carte sul tavolo, il Croupier rimette le 2 giocate', () => {
    const { s: s0, carte } = fallita();
    const mz = s0.mazzetto.filter((c) => !['c:KC', 'c:KP'].includes(c));
    const s = apply(s0, { type: 'allIn' }).state;
    assert.deepEqual([...s.confronto.giocate.banda].sort(), [...carte].sort());
    assert.equal(s.confronto.tavolo.length, 5);
    for (const c of T) assert.ok(!s.mazzi.b.scarti.includes(c), 'il vecchio tavolo è rimescolato nel Mazzo');
    assert.ok(!s.mazzetto.includes('c:KC') && !s.mazzetto.includes('c:KP'));
    assert.ok(s.mazzi.c.pesca.includes('c:KC') && s.mazzi.c.pesca.includes('c:KP'), 'rimescolate nel Mazzo del Croupier');
    assert.deepEqual([...s.mazzetto].sort(), [...mz].sort(), 'il Croupier mantiene le Carte della propria mano');
    H.verificaConservazione(s);
  });
  test('il Croupier pesca 2 Carte in più per ogni Pentito', () => {
    const { s: s0 } = fallita({ pentito: true });
    const n = s0.mazzetto.filter((c) => !['c:KC', 'c:KP'].includes(c)).length; // senza le 2 giocate
    const s = apply(s0, { type: 'allIn' }).state;
    assert.equal(s.mazzetto.length, n + 2);
  });
  test('nella mano finale non ci si ritira; vittoria = la fanno franca ma a mani vuote', () => {
    const { s: s0 } = fallita({ conBottino: true });
    assert.equal(s0.bottinoFinale, true);
    let s = apply(s0, { type: 'allIn' }).state;
    assert.throws(() => apply(s, { type: 'decidi', ladro: 'a', scelta: 'ritira' }), EngineError);
    // tavolo imposto: le Carte della Banda (7♣ 8♠) fanno scala 4-8; il Croupier gioca 6♣ 8♦ (doppia coppia)
    s = H.forzaTavolo(s, ['b:4C', 'b:5C', 'b:6Q', 'b:KF', 'b:KP']);
    s = apply(s, { type: 'croupierGioca', carte: ['c:6F', 'c:8Q'] }).state;
    if (s.confronto) {
      assert.equal(s.confronto.esito, 'successo');
      s = apply(s, { type: 'accetta' }).state;
    }
    assert.ok(s.esito);
    assert.ok(!['arrestati', 'penaDura'].includes(s.esito.tipo));
    assert.equal(s.bottinoFinale, false, 'a mani vuote: il Bottino Finale è perso');
  });
  test('sconfitta nell\'All-in: arrestati', () => {
    const { s: s0 } = fallita();
    let s = apply(s0, { type: 'allIn' }).state;
    s = H.forzaTavolo(s, ['b:2C', 'b:3Q', 'b:9C', 'b:TP', 'b:QQ']);
    s = apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:4P'] }).state; // coppia di 3 contro Q alta
    if (s.confronto) s = apply(s, { type: 'accetta' }).state;
    assert.ok(['arrestati', 'penaDura'].includes(s.esito?.tipo), s.esito?.tipo);
  });
  test('l\'All-in si gioca solo dopo un Fallimento', () => {
    const spec2 = ['lady', 'intellettuale', 'lady'];
    let s = vigilia(spec2, { mani: { a: ['b:AC', 'b:7F'], b: ['b:AQ', 'b:8P'] }, mazzetto: MZ });
    s = apply(s, { type: 'faseFuga' }).state;
    assert.throws(() => apply(s, { type: 'allIn' }), EngineError);
  });
  test('l\'All-in è opzionale: disattivato non si può giocare', () => {
    const { s } = fallita({ opzioni: { semi: false, fixerElimina: false, allIn: false } });
    assert.throws(() => apply(s, { type: 'allIn' }), EngineError);
  });
  test('l\'All-in si gioca una volta sola', () => {
    const { s: s0 } = fallita();
    let s = apply(s0, { type: 'allIn' }).state;
    s = H.forzaTavolo(s, ['b:2C', 'b:3Q', 'b:9C', 'b:TP', 'b:QQ']);
    s = apply(s, { type: 'croupierGioca', carte: s.mazzetto.slice(0, 2) }).state;
    if (s.confronto && s.confronto.esito === 'fallimento') assert.throws(() => apply(s, { type: 'allIn' }), EngineError);
  });
});
