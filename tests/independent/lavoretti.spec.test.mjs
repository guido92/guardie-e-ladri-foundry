// Test indipendenti: Lavoretti, Confronto, Bottino, Rilancio, Baciamano (manuale pag. 17, 23-28, 30, 38).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as H from './_helpers.mjs';
const { apply, EngineError, carteDaGiocare } = H;

// Tavolo "neutro": nessuna scala né colore possibile con carte basse/medie fuori dal tavolo.
const T = ['b:2F', 'b:5Q', 'b:9P', 'b:JC', 'b:KQ'];
const NUM = { banale: 2, discreto: 3, tosto: 4, esagerato: 5 };
const CR = ['c:3C', 'c:4P', 'c:6F', 'c:8Q', 'c:TQ']; // carte deboli del Croupier

function prepara({ classi = ['meccanico', 'lady', 'intellettuale'], opzioni, mani, tavolo = T, croupier, grado = 'banale' } = {}) {
  let s = H.distribuita(classi, { opzioni });
  return H.metti(s, { mani, topB: tavolo, topC: croupier ?? CR.slice(0, NUM[grado]) });
}

/** Lavoretto da solo che finisce all'esito. */
function soloAllEsito({ grado = 'banale', manoA, gioca, croupier, croupierGioca, classi, opzioni, tavolo }) {
  let s = prepara({ classi, opzioni, grado, mani: { a: manoA }, croupier, tavolo });
  s = H.finoAlRiver(s, grado, ['a']);
  s = apply(s, { type: 'gioca', ladro: 'a', carte: gioca }).state;
  s = apply(s, { type: 'croupierGioca', carte: croupierGioca ?? s.confronto.croupierMano.slice(0, 2) }).state;
  return s;
}

const fine = (s) => (s.confronto && s.confronto.step === 'esito' && s.confronto.esito === 'fallimento' ? apply(s, { type: 'accetta' }).state : s);

describe('Svolgimento del Confronto (pag. 24-25)', () => {
  test('flop: 3 Carte dalla cima del Mazzo della Banda; poi 4ª e 5ª una alla volta', () => {
    let s = prepara({ mani: { a: ['b:AC', 'b:AQ'] } });
    s = apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a'] }).state;
    assert.equal(s.confronto.step, 'flop');
    assert.deepEqual(s.confronto.tavolo, T.slice(0, 3));
    s = apply(s, { type: 'decidi', ladro: 'a', scelta: 'continua' }).state;
    assert.equal(s.confronto.step, 'turn');
    assert.deepEqual(s.confronto.tavolo, T.slice(0, 4));
    s = apply(s, { type: 'decidi', ladro: 'a', scelta: 'continua' }).state;
    assert.equal(s.confronto.step, 'river');
    assert.deepEqual(s.confronto.tavolo, T);
  });

  for (const [grado, n] of Object.entries(NUM)) {
    test(`Grado ${grado}: il Croupier pesca ${n} Carte dal proprio Mazzo`, () => {
      let s = prepara({ grado, mani: { a: ['b:AC', 'b:AQ'] } });
      const cima = s.mazzi.c.pesca.slice(0, n);
      s = H.finoAlRiver(s, grado, ['a']);
      assert.equal(s.confronto.croupierMano.length, n);
      assert.deepEqual([...s.confronto.croupierMano].sort(), [...cima].sort());
      assert.ok(cima.every((c) => !s.mazzi.c.pesca.includes(c)));
    });
  }

  test('ritiro al flop: nessuna Carta persa, niente Bottino, niente altri Lavoretti', () => {
    let s = prepara({ mani: { a: ['b:AC', 'b:AQ', 'b:7F'] } });
    s = apply(s, { type: 'lavorettoInizia', grado: 'discreto', partecipanti: ['a'] }).state;
    s = apply(s, { type: 'decidi', ladro: 'a', scelta: 'ritira' }).state;
    assert.equal(s.confronto, null);
    assert.equal(s.bottino, null);
    assert.deepEqual([...H.ladro(s, 'a').mano].sort(), ['b:7F', 'b:AC', 'b:AQ']);
    assert.throws(() => apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a'] }), EngineError);
    H.verificaConservazione(s);
  });

  test('ritiro al turn: si perde 1 Carta a scelta, niente altri Lavoretti', () => {
    let s = prepara({ mani: { a: ['b:AC', 'b:AQ', 'b:7F'] } });
    s = apply(s, { type: 'lavorettoInizia', grado: 'discreto', partecipanti: ['a'] }).state;
    s = apply(s, { type: 'avanza' }).state;
    assert.equal(s.confronto.step, 'turn');
    s = apply(s, { type: 'decidi', ladro: 'a', scelta: 'ritira', carta: 'b:7F' }).state;
    assert.equal(s.confronto, null);
    assert.deepEqual([...H.ladro(s, 'a').mano].sort(), ['b:AC', 'b:AQ']);
    assert.ok(s.mazzi.b.scarti.includes('b:7F'));
    assert.throws(() => apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a'] }), EngineError);
    H.verificaConservazione(s);
  });

  test('dopo la 5ª Carta non è più possibile ritirarsi', () => {
    let s = prepara({ mani: { a: ['b:AC', 'b:AQ', 'b:7F'] } });
    s = H.finoAlRiver(s, 'banale', ['a']);
    assert.throws(() => apply(s, { type: 'decidi', ladro: 'a', scelta: 'ritira', carta: 'b:7F' }), EngineError);
  });

  test('da solo il Ladro gioca 2 Carte', () => {
    let s = prepara({ mani: { a: ['b:AC', 'b:AQ', 'b:7F'] } });
    s = H.finoAlRiver(s, 'banale', ['a']);
    assert.equal(carteDaGiocare(s, 'a'), 2);
    assert.throws(() => apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC'] }), EngineError);
    assert.throws(() => apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC', 'b:AQ', 'b:7F'] }), EngineError);
  });

  test('non si possono giocare Carte che non si hanno in mano', () => {
    let s = prepara({ mani: { a: ['b:AC', 'b:AQ'] } });
    s = H.finoAlRiver(s, 'banale', ['a']);
    const altra = s.mazzi.b.pesca[0];
    assert.throws(() => apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC', altra] }), EngineError);
  });

  test('in coppia ogni Ladro gioca 1 Carta e la mano è valutata con entrambe', () => {
    let s = prepara({ mani: { a: ['b:AC', 'b:7F'], b: ['b:AQ', 'b:8F'] } });
    s = H.finoAlRiver(s, 'banale', ['a', 'b']);
    assert.equal(carteDaGiocare(s, 'a'), 1);
    assert.equal(carteDaGiocare(s, 'b'), 1);
    assert.throws(() => apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC', 'b:7F'] }), EngineError);
    s = apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC'] }).state;
    s = apply(s, { type: 'gioca', ladro: 'b', carte: ['b:AQ'] }).state;
    s = apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:4P'] }).state;
    assert.equal(s.confronto.esito, 'successo');
    assert.equal(s.confronto.manoLadri.nome, 'Coppia');
  });

  test('in coppia uno si ritira al flop: l\'altro continua (e posa 2 Carte, API.md scelta 2)', () => {
    let s = prepara({ mani: { a: ['b:AC', 'b:7F'], b: ['b:AQ', 'b:8F'] } });
    s = apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a', 'b'] }).state;
    s = apply(s, { type: 'decidi', ladro: 'b', scelta: 'ritira' }).state;
    s = apply(s, { type: 'decidi', ladro: 'a', scelta: 'continua' }).state;
    assert.ok(s.confronto, 'il Confronto continua');
    assert.deepEqual(s.confronto.attivi, ['a']);
    assert.deepEqual([...H.ladro(s, 'b').mano].sort(), ['b:8F', 'b:AQ'], 'chi si ritira al flop non perde nulla');
    s = apply(s, { type: 'avanza' }).state;
    assert.equal(s.confronto.step, 'river');
    assert.equal(carteDaGiocare(s, 'a'), 2);
  });

  test('in coppia uno si ritira al turn: perde 1 Carta, l\'altro continua', () => {
    let s = prepara({ mani: { a: ['b:AC', 'b:7F'], b: ['b:AQ', 'b:8F'] } });
    s = apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a', 'b'] }).state;
    s = apply(s, { type: 'avanza' }).state;
    s = apply(s, { type: 'decidi', ladro: 'b', scelta: 'ritira', carta: 'b:8F' }).state;
    assert.ok(s.confronto);
    assert.deepEqual(H.ladro(s, 'b').mano, ['b:AQ']);
  });

  test('chi si è ritirato da una coppia non può fare altri Lavoretti', () => {
    let s = prepara({ mani: { a: ['b:AC', 'b:7F'], b: ['b:AQ', 'b:8F'] } });
    s = apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a', 'b'] }).state;
    s = apply(s, { type: 'decidi', ladro: 'b', scelta: 'ritira' }).state;
    s = apply(s, { type: 'avanza' }).state;
    s = apply(s, { type: 'avanza' }).state;
    s = apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC', 'b:7F'] }).state;
    s = fine(apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:4P'] }).state);
    if (s.confronto?.step === 'esito') s = apply(s, { type: 'vota', ladro: 'a', scelta: 'incassa' }).state;
    assert.equal(s.confronto, null);
    assert.throws(() => apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['b'] }), EngineError);
  });
});

describe('Lavoretti: limiti (pag. 23)', () => {
  test('al massimo 2 partecipanti', () => {
    const s = prepara({ mani: {} });
    assert.throws(() => apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a', 'b', 'c'] }), EngineError);
    assert.throws(() => apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: [] }), EngineError);
  });
  test('un solo Lavoretto a testa (anche cambiando compagno)', () => {
    let s = soloAllEsito({ manoA: ['b:AC', 'b:AQ'], gioca: ['b:AC', 'b:AQ'], croupierGioca: ['c:3C', 'c:4P'] });
    s = apply(s, { type: 'vota', ladro: 'a', scelta: 'incassa' }).state;
    assert.throws(() => apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a'] }), EngineError);
    assert.throws(() => apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a', 'b'] }), EngineError);
    // gli altri possono ancora farlo
    apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['b', 'c'] });
  });
  test('grado inesistente rifiutato', () => {
    const s = prepara({ mani: {} });
    assert.throws(() => apply(s, { type: 'lavorettoInizia', grado: 'leggendario', partecipanti: ['a'] }), EngineError);
  });
});

describe('Esito del Confronto (pag. 26-28, 38)', () => {
  test('Successo: le Carte dei Ladri superano quelle del Croupier', () => {
    const s = soloAllEsito({ manoA: ['b:AC', 'b:AQ'], gioca: ['b:AC', 'b:AQ'], croupierGioca: ['c:3C', 'c:4P'] });
    assert.equal(s.confronto.esito, 'successo');
  });
  test('Fallimento: il Croupier ha la mano migliore', () => {
    const s = soloAllEsito({ manoA: ['b:3F', 'b:4C'], gioca: ['b:3F', 'b:4C'], croupier: ['c:KC', 'c:KP'], croupierGioca: ['c:KC', 'c:KP'] });
    assert.equal(s.confronto.esito, 'fallimento');
  });
  test('Parità: è un Fallimento', () => {
    // Ladri K-J-9-5-4 contro Croupier K-J-9-5-4
    const s = soloAllEsito({ manoA: ['b:3F', 'b:4C'], gioca: ['b:3F', 'b:4C'], croupier: ['c:3C', 'c:4P'], croupierGioca: ['c:3C', 'c:4P'] });
    assert.equal(s.confronto.esito, 'fallimento');
  });
  test('Regola opzionale dei semi: la stessa parità con il 4 di cuori contro il 4 di picche è un Successo', () => {
    const s = soloAllEsito({
      opzioni: { semi: true, fixerElimina: false, allIn: true },
      manoA: ['b:3F', 'b:4C'], gioca: ['b:3F', 'b:4C'], croupier: ['c:3C', 'c:4P'], croupierGioca: ['c:3C', 'c:4P'],
    });
    assert.equal(s.confronto.esito, 'successo');
  });
  test('Regola dei semi: picche contro cuori resta Fallimento', () => {
    const s = soloAllEsito({
      opzioni: { semi: true, fixerElimina: false, allIn: true },
      manoA: ['b:3F', 'b:4P'], gioca: ['b:3F', 'b:4P'], croupier: ['c:3C', 'c:4C'], croupierGioca: ['c:3C', 'c:4C'],
    });
    assert.equal(s.confronto.esito, 'fallimento');
  });
  test('il K di quadri del Croupier non fa coppia con il K di quadri del tavolo', () => {
    // Ladri: A alta. Croupier: K♦ (c) + K♦ (b a terra) -> NON coppia, solo K alta.
    const s = soloAllEsito({ manoA: ['b:AC', 'b:3F'], gioca: ['b:AC', 'b:3F'], croupier: ['c:KQ', 'c:4P'], croupierGioca: ['c:KQ', 'c:4P'] });
    assert.equal(s.confronto.manoCroupier.nome, 'Carta alta');
    assert.equal(s.confronto.esito, 'successo');
  });
  test('il Croupier sceglie solo tra le Carte che ha pescato', () => {
    let s = prepara({ mani: { a: ['b:AC', 'b:AQ'] } });
    s = H.finoAlRiver(s, 'banale', ['a']);
    s = apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC', 'b:AQ'] }).state;
    assert.throws(() => apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:KC'] }), EngineError);
    assert.throws(() => apply(s, { type: 'croupierGioca', carte: ['c:3C'] }), EngineError);
  });
  test('il Jolly giocato vale come carta qualsiasi e poi torna al Croupier (pag. 30)', () => {
    // 2 Ladri = 3 giocatori: ogni Ladro ha un Jolly
    let s = prepara({ classi: ['meccanico', 'lady'], mani: {} });
    const jolly = H.ladro(s, 'a').mano.find((c) => c.startsWith('j:'));
    assert.ok(jolly);
    s = H.metti(s, { mani: { a: ['b:AC', jolly] } });
    s = H.finoAlRiver(s, 'banale', ['a']);
    s = apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC', jolly] }).state;
    s = apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:4P'] }).state;
    assert.equal(s.confronto.esito, 'successo');
    assert.ok(['Coppia', 'Tris', 'Doppia coppia'].includes(s.confronto.manoLadri.nome) || s.confronto.manoLadri.categoria >= 1);
    s = apply(s, { type: 'vota', ladro: 'a', scelta: 'incassa' }).state;
    assert.ok(s.jolly.includes(jolly), 'il Jolly torna al Croupier');
    assert.ok(!s.mazzi.b.scarti.includes(jolly));
    assert.ok(!H.ladro(s, 'a').mano.includes(jolly));
    H.verificaConservazione(s);
  });
});

describe('Bottino (pag. 26, 28)', () => {
  for (const [grado, n] of [['banale', 3], ['discreto', 4]]) {
    test(`Successo ${grado}: si pescano ${n} Carte dal Mazzo della Banda`, () => {
      let s = soloAllEsito({ grado, manoA: ['b:AC', 'b:AQ', 'b:7F'], gioca: ['b:AC', 'b:AQ'], croupierGioca: ['c:3C', 'c:4P'] });
      const cima = s.mazzi.b.pesca.slice(0, n);
      s = apply(s, { type: 'vota', ladro: 'a', scelta: 'incassa' }).state;
      const m = H.ladro(s, 'a').mano;
      assert.equal(m.length, 1 + n);
      assert.deepEqual(m.filter((c) => c !== 'b:7F').sort(), [...cima].sort());
      H.verificaConservazione(s);
    });
  }
  for (const [grado, n] of [['tosto', 2], ['esagerato', 3]]) {
    test(`Successo ${grado}: ${n} Carte a scelta dal Mazzo della Banda`, () => {
      let s = soloAllEsito({ grado, manoA: ['b:AC', 'b:AQ'], gioca: ['b:AC', 'b:AQ'], croupierGioca: ['c:3C', 'c:4P'] });
      s = apply(s, { type: 'vota', ladro: 'a', scelta: 'incassa' }).state;
      assert.equal(s.bottino.daScegliere, n);
      const scelte = s.mazzi.b.pesca.slice(10, 10 + n);
      assert.throws(() => apply(s, { type: 'bottinoScegli', ladro: 'a', carte: s.mazzi.b.pesca.slice(10, 11 + n) }), EngineError, 'una di troppo');
      assert.throws(() => apply(s, { type: 'bottinoScegli', ladro: 'a', carte: [...scelte.slice(1), 'b:AC'] }), EngineError, 'carta non nel Mazzo');
      s = apply(s, { type: 'bottinoScegli', ladro: 'a', carte: scelte }).state;
      assert.deepEqual([...H.ladro(s, 'a').mano].sort(), [...scelte].sort());
      assert.ok(scelte.every((c) => !s.mazzi.b.pesca.includes(c)));
      H.verificaConservazione(s);
    });
  }
  test('a fine Lavoretto: Carte giocate e tavolo negli scarti della Banda, Carte del Croupier nei suoi scarti', () => {
    let s = soloAllEsito({ grado: 'discreto', manoA: ['b:AC', 'b:AQ'], gioca: ['b:AC', 'b:AQ'], croupierGioca: ['c:3C', 'c:4P'] });
    s = apply(s, { type: 'vota', ladro: 'a', scelta: 'incassa' }).state;
    for (const c of ['b:AC', 'b:AQ', ...T]) assert.ok(s.mazzi.b.scarti.includes(c), c);
    for (const c of ['c:3C', 'c:4P']) assert.ok(s.mazzi.c.scarti.includes(c), c);
    // API.md scelta 4: le non giocate del Croupier vanno nei suoi scarti
    assert.ok(s.mazzi.c.scarti.includes('c:6F'));
    H.verificaConservazione(s);
  });
  test('in coppia il Bottino si divide tra i partecipanti', () => {
    let s = prepara({ mani: { a: ['b:AC'], b: ['b:AQ'] } });
    s = H.finoAlRiver(s, 'banale', ['a', 'b']);
    s = apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC'] }).state;
    s = apply(s, { type: 'gioca', ladro: 'b', carte: ['b:AQ'] }).state;
    s = apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:4P'] }).state;
    s = apply(s, { type: 'vota', ladro: 'a', scelta: 'incassa' }).state;
    s = apply(s, { type: 'vota', ladro: 'b', scelta: 'incassa' }).state;
    if (s.bottino) s = apply(s, { type: 'bottinoDividi' }).state;
    const na = H.ladro(s, 'a').mano.length;
    const nb = H.ladro(s, 'b').mano.length;
    assert.equal(na + nb, 3);
    assert.ok(Math.abs(na - nb) <= 1, 'divisione equa');
    assert.equal(s.bottino, null);
    H.verificaConservazione(s);
  });
  test('in coppia si può assegnare a mano ogni Carta del Bottino', () => {
    let s = prepara({ mani: { a: ['b:AC'], b: ['b:AQ'] } });
    s = H.finoAlRiver(s, 'banale', ['a', 'b']);
    s = apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC'] }).state;
    s = apply(s, { type: 'gioca', ladro: 'b', carte: ['b:AQ'] }).state;
    s = apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:4P'] }).state;
    s = apply(s, { type: 'vota', ladro: 'a', scelta: 'incassa' }).state;
    s = apply(s, { type: 'vota', ladro: 'b', scelta: 'incassa' }).state;
    const carte = [...s.bottino.carte];
    assert.equal(carte.length, 3);
    s = apply(s, { type: 'bottinoAssegna', carta: carte[0], a: 'b' }).state;
    s = apply(s, { type: 'bottinoAssegna', carta: carte[1], a: 'a' }).state;
    s = apply(s, { type: 'bottinoAssegna', carta: carte[2], a: 'a' }).state;
    assert.ok(H.ladro(s, 'b').mano.includes(carte[0]));
    assert.ok(H.ladro(s, 'a').mano.includes(carte[1]) && H.ladro(s, 'a').mano.includes(carte[2]));
    H.verificaConservazione(s);
  });
  test('Fallimento: i Ladri perdono le Carte giocate, niente Bottino', () => {
    let s = soloAllEsito({ manoA: ['b:3F', 'b:4C', 'b:7F'], gioca: ['b:3F', 'b:4C'], croupier: ['c:KC', 'c:KP'], croupierGioca: ['c:KC', 'c:KP'] });
    s = fine(s);
    assert.equal(s.confronto, null);
    assert.equal(s.bottino, null);
    assert.deepEqual(H.ladro(s, 'a').mano, ['b:7F']);
    assert.ok(s.mazzi.b.scarti.includes('b:3F') && s.mazzi.b.scarti.includes('b:4C'));
    assert.throws(() => apply(s, { type: 'lavorettoInizia', grado: 'banale', partecipanti: ['a'] }), EngineError);
    H.verificaConservazione(s);
  });
  test('non si può votare il Rilancio dopo un Fallimento', () => {
    const s = soloAllEsito({ manoA: ['b:3F', 'b:4C'], gioca: ['b:3F', 'b:4C'], croupier: ['c:KC', 'c:KP'], croupierGioca: ['c:KC', 'c:KP'] });
    assert.throws(() => apply(s, { type: 'vota', ladro: 'a', scelta: 'rilancia' }), EngineError);
  });
});

describe('Rilancio (pag. 26-27)', () => {
  function rilancio(grado = 'banale') {
    let s = soloAllEsito({ grado, manoA: ['b:AC', 'b:AQ', 'b:7F'], gioca: ['b:AC', 'b:AQ'], croupierGioca: ['c:3C', 'c:4P'] });
    assert.equal(s.confronto.esito, 'successo');
    return apply(s, { type: 'vota', ladro: 'a', scelta: 'rilancia' }).state;
  }

  test('le Carte dei Ladri restano a terra, le 5 del tavolo tornano nel Mazzo della Banda', () => {
    const s = rilancio();
    assert.deepEqual([...s.confronto.giocate.a].sort(), ['b:AC', 'b:AQ']);
    assert.deepEqual(H.ladro(s, 'a').mano, ['b:7F']);
    for (const c of T) {
      assert.ok(!s.mazzi.b.scarti.includes(c), c + ' non negli scarti');
      assert.ok(s.mazzi.b.pesca.includes(c) || s.confronto.tavolo.includes(c), c + ' rimescolata nel Mazzo');
    }
    assert.equal(s.confronto.round, 2);
    assert.equal(s.confronto.step, 'flop');
    assert.equal(s.confronto.tavolo.length, 3);
    H.verificaConservazione(s);
  });
  test('il Croupier rimescola nel proprio Mazzo le 2 Carte giocate', () => {
    const s = rilancio();
    for (const c of ['c:3C', 'c:4P']) {
      assert.ok(!s.mazzi.c.scarti.includes(c));
      assert.ok(s.mazzi.c.pesca.includes(c) || s.confronto.croupierMano.includes(c));
    }
  });
  for (const [grado, n] of Object.entries(NUM)) {
    test(`il Croupier torna a ${n} Carte (Grado ${grado})`, () => {
      const s = rilancio(grado);
      assert.equal(s.confronto.croupierMano.length, n);
      // tiene le Carte non giocate
      for (const c of CR.slice(2, n)) assert.ok(s.confronto.croupierMano.includes(c), c);
    });
  }
  test('dopo il flop del Rilancio escono insieme 4ª e 5ª Carta, poi non ci si ritira più', () => {
    let s = rilancio();
    s = apply(s, { type: 'avanza' }).state;
    assert.equal(s.confronto.step, 'river');
    assert.equal(s.confronto.tavolo.length, 5);
    assert.throws(() => apply(s, { type: 'decidi', ladro: 'a', scelta: 'ritira' }), EngineError);
  });
  test('nel Rilancio i Ladri non giocano nuove Carte', () => {
    let s = rilancio();
    s = apply(s, { type: 'avanza' }).state;
    assert.throws(() => apply(s, { type: 'gioca', ladro: 'a', carte: ['b:7F'] }), EngineError);
  });

  function rilancioAlRiver(grado, { ladriVincono }) {
    let s = rilancio(grado);
    // tavolo e mano del Croupier imposti a mano per avere un esito certo
    s = H.forzaTavolo(s, ['b:2C', 'b:6Q', 'b:9F'], ['b:JP', 'b:KF']);
    const cr = ladriVincono ? ['c:3Q', 'c:5P', 'c:7C', 'c:8C', 'c:TC'] : ['c:KC', 'c:KP', 'c:7C', 'c:8C', 'c:TC'];
    s = H.forzaCroupier(s, cr.slice(0, NUM[grado]));
    s = apply(s, { type: 'avanza' }).state;
    assert.deepEqual(s.confronto.tavolo, ['b:2C', 'b:6Q', 'b:9F', 'b:JP', 'b:KF']);
    s = apply(s, { type: 'croupierGioca', carte: cr.slice(0, 2) }).state;
    return s;
  }

  test('Successo nel Rilancio (Banale): Bottino + Bonus = 3 + 2 Carte pescate', () => {
    let s = rilancio('banale');
    s = H.forzaTavolo(s, ['b:2C', 'b:6Q', 'b:9F'], ['b:JP', 'b:KF']);
    s = H.forzaCroupier(s, ['c:3Q', 'c:5P']);
    s = apply(s, { type: 'avanza' }).state;
    const cima = s.mazzi.b.pesca.slice(0, 5);
    const r = apply(s, { type: 'croupierGioca', carte: ['c:3Q', 'c:5P'] });
    s = r.state;
    assert.ok(r.effects.some((e) => e.esito === 'successo'));
    if (s.confronto?.step === 'esito') s = apply(s, { type: 'vota', ladro: 'a', scelta: 'incassa' }).state;
    const m = H.ladro(s, 'a').mano;
    assert.equal(m.length, 1 + 5);
    assert.deepEqual(m.filter((c) => c !== 'b:7F').sort(), [...cima].sort());
    assert.ok(s.mazzi.b.scarti.includes('b:AC') && s.mazzi.b.scarti.includes('b:AQ'), 'Carte giocate scartate');
    H.verificaConservazione(s);
  });
  test('Successo nel Rilancio (Discreto): 4 + 3 Carte', () => {
    let s = rilancioAlRiver('discreto', { ladriVincono: true });
    if (s.confronto?.step === 'esito') s = apply(s, { type: 'vota', ladro: 'a', scelta: 'incassa' }).state;
    assert.equal(H.ladro(s, 'a').mano.length, 1 + 7);
  });
  test('Successo nel Rilancio (Tosto): 2 + 2 Carte a scelta', () => {
    let s = rilancioAlRiver('tosto', { ladriVincono: true });
    if (s.confronto?.step === 'esito') s = apply(s, { type: 'vota', ladro: 'a', scelta: 'incassa' }).state;
    assert.ok(s.bottino);
    assert.equal(s.bottino.daScegliere, 4);
  });
  test('Successo nel Rilancio (Esagerato): 3 + 3 Carte a scelta', () => {
    let s = rilancioAlRiver('esagerato', { ladriVincono: true });
    if (s.confronto?.step === 'esito') s = apply(s, { type: 'vota', ladro: 'a', scelta: 'incassa' }).state;
    assert.ok(s.bottino);
    assert.equal(s.bottino.daScegliere, 6);
  });
  test('si rilancia una volta sola', () => {
    let s = rilancioAlRiver('banale', { ladriVincono: true });
    assert.throws(() => apply(s, { type: 'vota', ladro: 'a', scelta: 'rilancia' }), EngineError);
  });
  test('Fallimento nel Rilancio: si perdono Bottino e Carte giocate', () => {
    let s = fine(rilancioAlRiver('banale', { ladriVincono: false }));
    assert.equal(s.confronto, null);
    assert.equal(s.bottino, null);
    assert.deepEqual(H.ladro(s, 'a').mano, ['b:7F']);
    H.verificaConservazione(s);
  });
  test('ritiro dal Rilancio: non si perdono le Carte giocate ma si rinuncia al Bottino', () => {
    let s = rilancio('discreto');
    const pesca = s.mazzi.b.pesca.length;
    s = apply(s, { type: 'decidi', ladro: 'a', scelta: 'ritira' }).state;
    assert.equal(s.confronto, null);
    assert.equal(s.bottino, null);
    assert.deepEqual([...H.ladro(s, 'a').mano].sort(), ['b:7F', 'b:AC', 'b:AQ']);
    assert.equal(s.mazzi.b.pesca.length, pesca, 'nessun Bottino pescato');
    H.verificaConservazione(s);
  });
  test('in coppia si rilancia solo se entrambi vogliono (API.md scelta 3)', () => {
    let s = prepara({ mani: { a: ['b:AC'], b: ['b:AQ'] } });
    s = H.finoAlRiver(s, 'banale', ['a', 'b']);
    s = apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC'] }).state;
    s = apply(s, { type: 'gioca', ladro: 'b', carte: ['b:AQ'] }).state;
    s = apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:4P'] }).state;
    s = apply(s, { type: 'vota', ladro: 'a', scelta: 'rilancia' }).state;
    s = apply(s, { type: 'vota', ladro: 'b', scelta: 'incassa' }).state;
    assert.ok(!s.confronto || s.confronto.round !== 2, 'niente Rilancio');
  });
  test('in coppia ci si ritira dal Rilancio solo se entrambi sono d\'accordo (pag. 27)', () => {
    let s = prepara({ mani: { a: ['b:AC'], b: ['b:AQ'] } });
    s = H.finoAlRiver(s, 'banale', ['a', 'b']);
    s = apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC'] }).state;
    s = apply(s, { type: 'gioca', ladro: 'b', carte: ['b:AQ'] }).state;
    s = apply(s, { type: 'croupierGioca', carte: ['c:3C', 'c:4P'] }).state;
    s = apply(s, { type: 'vota', ladro: 'a', scelta: 'rilancia' }).state;
    s = apply(s, { type: 'vota', ladro: 'b', scelta: 'rilancia' }).state;
    assert.equal(s.confronto.round, 2);
    const s1 = apply(apply(s, { type: 'decidi', ladro: 'a', scelta: 'ritira' }).state, { type: 'decidi', ladro: 'b', scelta: 'continua' }).state;
    assert.ok(s1.confronto, 'uno solo non basta: si continua');
    const s2 = apply(apply(s, { type: 'decidi', ladro: 'a', scelta: 'ritira' }).state, { type: 'decidi', ladro: 'b', scelta: 'ritira' }).state;
    assert.equal(s2.confronto, null);
    assert.equal(H.ladro(s2, 'a').mano.length + H.ladro(s2, 'b').mano.length, 2, 'tengono le Carte giocate');
  });
});

describe('Lady - Il Baciamano (pag. 17)', () => {
  function fallimentoLady({ classi = ['lady', 'meccanico', 'intellettuale'] } = {}) {
    // Lady gioca A♥ 3♣ (A alta), tiene A♦; il Croupier ha coppia di J.
    return soloAllEsito({ classi, manoA: ['b:AC', 'b:3F', 'b:AQ'], gioca: ['b:AC', 'b:3F'], croupier: ['c:JQ', 'c:4P'], croupierGioca: ['c:JQ', 'c:4P'] });
  }
  test('in caso di Fallimento la Lady scambia una Carta della mano con una rivelata e ribalta l\'esito', () => {
    let s = fallimentoLady();
    assert.equal(s.confronto.esito, 'fallimento');
    s = apply(s, { type: 'baciamano', ladro: 'a', mano: 'b:AQ', giocata: 'b:3F' }).state;
    assert.equal(s.confronto.esito, 'successo');
    assert.ok(H.ladro(s, 'a').mano.includes('b:3F'));
    assert.ok(!H.ladro(s, 'a').mano.includes('b:AQ'));
    H.verificaConservazione(s);
  });
  test('solo la Lady ha il Baciamano', () => {
    const s = fallimentoLady({ classi: ['meccanico', 'lady', 'intellettuale'] });
    assert.throws(() => apply(s, { type: 'baciamano', ladro: 'a', mano: 'b:AQ', giocata: 'b:3F' }), EngineError);
  });
  test('il Baciamano non si usa in caso di Successo', () => {
    const s = soloAllEsito({ classi: ['lady', 'meccanico', 'intellettuale'], manoA: ['b:AC', 'b:AQ', 'b:3F'], gioca: ['b:AC', 'b:AQ'], croupierGioca: ['c:3C', 'c:4P'] });
    assert.equal(s.confronto.esito, 'successo');
    assert.throws(() => apply(s, { type: 'baciamano', ladro: 'a', mano: 'b:3F', giocata: 'b:AQ' }), EngineError);
  });
  test('il Baciamano si usa solo dopo che il Croupier ha giocato', () => {
    let s = prepara({ classi: ['lady', 'meccanico', 'intellettuale'], mani: { a: ['b:AC', 'b:3F', 'b:AQ'] } });
    s = H.finoAlRiver(s, 'banale', ['a']);
    s = apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC', 'b:3F'] }).state;
    assert.throws(() => apply(s, { type: 'baciamano', ladro: 'a', mano: 'b:AQ', giocata: 'b:3F' }), EngineError);
  });
  test('la Lady può scambiare con la Carta rivelata dal complice', () => {
    let s = prepara({ classi: ['lady', 'meccanico', 'intellettuale'], mani: { a: ['b:AC', 'b:AQ'], b: ['b:3F'] }, croupier: ['c:JQ', 'c:4P'] });
    s = H.finoAlRiver(s, 'banale', ['a', 'b']);
    s = apply(s, { type: 'gioca', ladro: 'a', carte: ['b:AC'] }).state;
    s = apply(s, { type: 'gioca', ladro: 'b', carte: ['b:3F'] }).state;
    s = apply(s, { type: 'croupierGioca', carte: ['c:JQ', 'c:4P'] }).state;
    assert.equal(s.confronto.esito, 'fallimento');
    s = apply(s, { type: 'baciamano', ladro: 'a', mano: 'b:AQ', giocata: 'b:3F' }).state;
    assert.equal(s.confronto.esito, 'successo');
    H.verificaConservazione(s);
  });
  test('non si può scambiare con una Carta non rivelata dalla Banda', () => {
    const s = fallimentoLady();
    assert.throws(() => apply(s, { type: 'baciamano', ladro: 'a', mano: 'b:AQ', giocata: 'b:9P' }), EngineError, 'carta del tavolo');
    assert.throws(() => apply(s, { type: 'baciamano', ladro: 'a', mano: 'b:AQ', giocata: 'c:JQ' }), EngineError, 'carta del Croupier');
  });
  test('accettare il Fallimento chiude il Lavoretto', () => {
    let s = fallimentoLady();
    s = apply(s, { type: 'accetta' }).state;
    assert.equal(s.confronto, null);
    assert.deepEqual(H.ladro(s, 'a').mano, ['b:AQ']);
  });
});
