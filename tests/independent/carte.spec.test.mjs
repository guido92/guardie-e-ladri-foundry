// Test indipendenti: valutazione delle mani di Poker e confronti (manuale pag. 24-28, 30, 38).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { migliorMano, confronta, formaCombinazione, trovaCombinazione, migliorCoppia, mazzo } from '../../module/core/carte.mjs';
import * as H from './_helpers.mjs';

const cat = (ids) => migliorMano(ids).nome;
const vince = (ladri, croupier, semi = false) => confronta(migliorMano(ladri), migliorMano(croupier), { semi });

describe('Mazzi', () => {
  test('ogni mazzo ha 52 carte distinte (Jolly estratti, pag. 12)', () => {
    for (const m of ['b', 'c']) {
      const d = mazzo(m);
      assert.equal(d.length, 52);
      assert.equal(new Set(d).size, 52);
      assert.ok(d.every((c) => c.startsWith(m + ':')));
    }
  });
  test('una partita nuova contiene 52+52 carte e 4 Jolly, senza doppioni', () => {
    const s = H.partita(['gangster', 'lady', 'meccanico']);
    assert.equal(H.verificaConservazione(s), 108);
    assert.equal(s.jolly.length, 4);
  });
});

describe('Categorie del Poker (regole del Texas hold\'em, pag. 24)', () => {
  test('carta alta', () => assert.equal(cat(['b:2C', 'b:5Q', 'b:9F', 'b:JP', 'b:KC']), 'Carta alta'));
  test('coppia', () => assert.equal(cat(['b:2C', 'b:2Q', 'b:9F', 'b:JP', 'b:KC']), 'Coppia'));
  test('doppia coppia', () => assert.equal(cat(['b:2C', 'b:2Q', 'b:9F', 'b:9P', 'b:KC']), 'Doppia coppia'));
  test('tris', () => assert.equal(cat(['b:2C', 'b:2Q', 'b:2F', 'b:9P', 'b:KC']), 'Tris'));
  test('scala', () => assert.equal(cat(['b:5C', 'b:6Q', 'b:7F', 'b:8P', 'b:9C']), 'Scala'));
  test('scala all\'asso (10-J-Q-K-A)', () => assert.equal(cat(['b:TC', 'b:JQ', 'b:QF', 'b:KP', 'b:AC']), 'Scala'));
  test('scala minima con l\'asso basso (A-2-3-4-5)', () => assert.equal(cat(['b:AC', 'b:2Q', 'b:3F', 'b:4P', 'b:5C']), 'Scala'));
  test('colore', () => assert.equal(cat(['b:2C', 'b:5C', 'b:9C', 'b:JC', 'b:KC']), 'Colore'));
  test('full', () => assert.equal(cat(['b:2C', 'b:2Q', 'b:2F', 'b:9P', 'b:9C']), 'Full'));
  test('poker', () => assert.equal(cat(['b:2C', 'b:2Q', 'b:2F', 'b:2P', 'b:9C']), 'Poker'));
  test('scala colore', () => assert.equal(cat(['b:5C', 'b:6C', 'b:7C', 'b:8C', 'b:9C']), 'Scala colore'));
  test('la migliore mano di 5 su 7 carte', () => {
    assert.equal(cat(['b:2C', 'b:7Q', 'b:7F', 'b:KP', 'b:KC', 'b:KQ', 'b:4F']), 'Full');
    // colore (2-3-4-5-9 di cuori) batte la scala 2-6
    assert.equal(cat(['b:2C', 'b:3C', 'b:4C', 'b:5C', 'b:9C', 'b:6Q', 'b:AF']), 'Colore');
  });
  test('ordine delle categorie', () => {
    const mani = [
      ['b:2C', 'b:5Q', 'b:9F', 'b:JP', 'b:KC'],
      ['b:2C', 'b:2Q', 'b:9F', 'b:JP', 'b:KC'],
      ['b:2C', 'b:2Q', 'b:9F', 'b:9P', 'b:KC'],
      ['b:2C', 'b:2Q', 'b:2F', 'b:9P', 'b:KC'],
      ['b:5C', 'b:6Q', 'b:7F', 'b:8P', 'b:9C'],
      ['b:2C', 'b:5C', 'b:9C', 'b:JC', 'b:KC'],
      ['b:2C', 'b:2Q', 'b:2F', 'b:9P', 'b:9C'],
      ['b:2C', 'b:2Q', 'b:2F', 'b:2P', 'b:9C'],
      ['b:5C', 'b:6C', 'b:7C', 'b:8C', 'b:9C'],
    ];
    for (let i = 1; i < mani.length; i++) {
      assert.ok(vince(mani[i], mani[i - 1]) > 0, `${cat(mani[i])} batte ${cat(mani[i - 1])}`);
      assert.ok(vince(mani[i - 1], mani[i]) < 0);
    }
  });
});

describe('Confronto e parità (pag. 28, 38)', () => {
  test('a parità di categoria contano i valori e poi i kicker', () => {
    assert.ok(vince(['b:AC', 'b:AQ', 'b:KF', 'b:5P', 'b:3C'], ['c:AC', 'c:AQ', 'c:QF', 'c:5P', 'c:3C']) > 0);
    assert.ok(vince(['b:KC', 'b:KQ', 'b:AF', 'b:5P', 'b:3C'], ['c:AC', 'c:AQ', 'c:2F', 'c:5P', 'c:3C']) < 0);
  });
  test('parità perfetta: il risultato non è favorevole ai Ladri (vince il Croupier)', () => {
    const l = ['b:AC', 'b:KQ', 'b:9F', 'b:5P', 'b:3C'];
    const c = ['c:AQ', 'c:KC', 'c:9P', 'c:5F', 'c:3Q'];
    assert.ok(vince(l, c, false) <= 0);
  });
  test('regola dei semi: Cuori > Quadri > Fiori > Picche rompe la parità', () => {
    const resto = ['b:2F', 'b:5Q', 'b:9P', 'b:JC', 'b:KQ'];
    // A di cuori contro A di quadri (stesso resto)
    assert.ok(vince(['b:AC', ...resto], ['c:AQ', ...resto], true) > 0);
    assert.ok(vince(['b:AQ', ...resto], ['c:AC', ...resto], true) < 0);
    assert.ok(vince(['b:AQ', ...resto], ['c:AF', ...resto], true) > 0);
    assert.ok(vince(['b:AF', ...resto], ['c:AP', ...resto], true) > 0);
    assert.ok(vince(['b:AP', ...resto], ['c:AF', ...resto], true) < 0);
  });
  test('senza la regola dei semi la stessa parità resta del Croupier', () => {
    const resto = ['b:2F', 'b:5Q', 'b:9P', 'b:JC', 'b:KQ'];
    assert.ok(vince(['b:AC', ...resto], ['c:AQ', ...resto], false) <= 0);
  });
  test('la regola dei semi non ribalta una mano di valore inferiore', () => {
    assert.ok(vince(['b:KC', 'b:QC', 'b:9F', 'b:5P', 'b:3C'], ['c:AP', 'c:2P', 'c:9P', 'c:5F', 'c:3Q'], true) < 0);
  });
});

describe('Carte identiche di mazzi diversi (Note sul Confronto 2, pag. 38)', () => {
  test('J di quadri del Croupier + J di quadri della Banda non fanno coppia', () => {
    assert.equal(cat(['c:JQ', 'b:JQ', 'b:2C', 'b:5F', 'b:9P']), 'Carta alta');
  });
  test('carte di pari valore ma semi diversi, da mazzi diversi, fanno coppia', () => {
    assert.equal(cat(['c:JQ', 'b:JC', 'b:2C', 'b:5F', 'b:9P']), 'Coppia');
  });
  test('su 7 carte la copia identica non conta come coppia', () => {
    assert.equal(cat(['c:KQ', 'c:4C', 'b:2F', 'b:5Q', 'b:9P', 'b:JC', 'b:KQ']), 'Carta alta');
  });
  test('tre carte "uguali" (due identiche + una di altro seme) fanno solo coppia', () => {
    assert.equal(cat(['c:KQ', 'b:KQ', 'b:KC', 'b:2F', 'b:9P']), 'Coppia');
  });
});

describe('Jolly come carta qualsiasi (pag. 30)', () => {
  test('Jolly + coppia = tris', () => assert.equal(cat(['j:1', 'b:AC', 'b:AQ', 'b:2F', 'b:9P']), 'Tris'));
  test('due Jolly + coppia = poker', () => assert.equal(cat(['j:1', 'j:2', 'b:AC', 'b:AQ', 'b:5F']), 'Poker'));
  test('Jolly che completa una scala', () => assert.equal(cat(['j:1', 'b:5C', 'b:6Q', 'b:8F', 'b:9P']), 'Scala'));
  test('Jolly che completa un colore', () => assert.equal(cat(['j:1', 'b:2C', 'b:5C', 'b:9C', 'b:KC']), 'Colore'));
  test('Jolly + tris = poker (meglio del full)', () => assert.equal(cat(['j:1', 'b:7C', 'b:7Q', 'b:7F', 'b:2P']), 'Poker'));
  test('Jolly con carta alta diventa almeno una coppia', () => assert.equal(cat(['j:1', 'b:2C', 'b:5Q', 'b:9F', 'b:KP']), 'Coppia'));
});

describe('Combinazioni di pagamento (Fixer, Accesso, Scasso)', () => {
  test('coppia', () => {
    assert.equal(formaCombinazione(['coppia'], ['b:7F', 'b:7P']), true);
    assert.equal(formaCombinazione(['coppia'], ['b:7F', 'b:8P']), false);
  });
  test('coppia di figure: J, Q, K; non l\'Asso (API.md scelta 6)', () => {
    assert.equal(formaCombinazione(['coppiaFigure'], ['b:QF', 'b:QP']), true);
    assert.equal(formaCombinazione(['coppiaFigure'], ['b:JF', 'b:JP']), true);
    assert.equal(formaCombinazione(['coppiaFigure'], ['b:KF', 'b:KP']), true);
    assert.equal(formaCombinazione(['coppiaFigure'], ['b:7F', 'b:7P']), false);
    assert.equal(formaCombinazione(['coppiaFigure'], ['b:AF', 'b:AP']), false);
  });
  test('tris e tris di figure', () => {
    assert.equal(formaCombinazione(['tris'], ['b:3C', 'b:3Q', 'b:3F']), true);
    assert.equal(formaCombinazione(['tris'], ['b:3C', 'b:3Q', 'b:4F']), false);
    assert.equal(formaCombinazione(['trisFigure'], ['b:KC', 'b:KQ', 'b:KF']), true);
    assert.equal(formaCombinazione(['trisFigure'], ['b:9C', 'b:9Q', 'b:9F']), false);
  });
  test('full o 5 carte dello stesso colore', () => {
    assert.equal(formaCombinazione(['full', 'colore'], ['b:2C', 'b:2Q', 'b:2F', 'b:9P', 'b:9C']), true);
    assert.equal(formaCombinazione(['full', 'colore'], ['b:2C', 'b:5C', 'b:7C', 'b:9C', 'b:JC']), true);
    // [AMBIGUO] "5 Carte dello stesso colore": seme (colore del Poker) o rosso/nero? Si verifica solo un caso
    // invalido in entrambe le letture (4 cuori + 1 picche).
    assert.equal(formaCombinazione(['full', 'colore'], ['b:2C', 'b:5C', 'b:7C', 'b:9C', 'b:JP']), false);
  });
  test('poker o scala', () => {
    assert.equal(formaCombinazione(['poker', 'scala'], ['b:2C', 'b:2Q', 'b:2F', 'b:2P']), true);
    assert.equal(formaCombinazione(['poker', 'scala'], ['b:5C', 'b:6Q', 'b:7F', 'b:8P', 'b:9C']), true);
    assert.equal(formaCombinazione(['poker', 'scala'], ['b:2C', 'b:2Q', 'b:2F', 'b:9P']), false);
  });
  test('poker di figure e doppia coppia', () => {
    assert.equal(formaCombinazione(['pokerFigure'], ['b:QC', 'b:QQ', 'b:QF', 'b:QP']), true);
    assert.equal(formaCombinazione(['pokerFigure'], ['b:9C', 'b:9Q', 'b:9F', 'b:9P']), false);
    assert.equal(formaCombinazione(['doppiaCoppia'], ['b:9C', 'b:9Q', 'b:4F', 'b:4P']), true);
    assert.equal(formaCombinazione(['doppiaCoppia'], ['b:9C', 'b:9Q', 'b:4F', 'b:5P']), false);
  });
  test('il Jolly vale come carta qualsiasi anche nei pagamenti (API.md scelta 5)', () => {
    assert.equal(formaCombinazione(['coppia'], ['b:7F', 'j:1']), true);
    assert.equal(formaCombinazione(['trisFigure'], ['b:KC', 'b:KQ', 'j:2']), true);
  });
  test('servono esattamente le Carte della combinazione (API.md scelta 5)', () => {
    assert.equal(formaCombinazione(['coppia'], ['b:7F', 'b:7P', 'b:2C']), false);
  });
  test('trovaCombinazione trova la coppia dentro una mano', () => {
    const r = trovaCombinazione('coppia', ['b:7F', 'b:2Q', 'b:7P', 'b:9C']);
    assert.deepEqual([...r].sort(), ['b:7F', 'b:7P']);
  });
  test('migliorCoppia sceglie le 2 carte migliori con il tavolo', () => {
    const r = migliorCoppia(['b:7F', 'b:7P', 'b:2C', 'b:KQ'], ['b:7C', 'b:3Q', 'b:9P', 'b:KC', 'b:4F']);
    assert.equal(r.mano.nome, 'Tris'); // 7-7 in mano + 7 a terra
    assert.deepEqual([...r.carte].sort(), ['b:7F', 'b:7P']);
  });
});

describe('Confronti delicati', () => {
  test('la scala A-2-3-4-5 è la più bassa: perde contro 2-3-4-5-6', () => {
    assert.ok(vince(['b:2C', 'b:3Q', 'b:4F', 'b:5P', 'b:6C'], ['c:AC', 'c:2Q', 'c:3F', 'c:4P', 'c:5C']) > 0);
  });
  test('scala all\'asso batte scala al K', () => {
    assert.ok(vince(['b:TC', 'b:JQ', 'b:QF', 'b:KP', 'b:AC'], ['c:9C', 'c:TQ', 'c:JF', 'c:QP', 'c:KC']) > 0);
  });
  test('full: conta prima il tris (777-22 batte 555-AA)', () => {
    assert.ok(vince(['b:7C', 'b:7Q', 'b:7F', 'b:2P', 'b:2C'], ['c:5C', 'c:5Q', 'c:5F', 'c:AP', 'c:AC']) > 0);
  });
  test('doppia coppia: a parità di coppie decide il kicker', () => {
    assert.ok(vince(['b:AC', 'b:AQ', 'b:KF', 'b:KP', 'b:QC'], ['c:AC', 'c:AQ', 'c:KF', 'c:KP', 'c:JC']) > 0);
  });
  test('colore: si confrontano le carte dalla più alta', () => {
    assert.ok(vince(['b:AC', 'b:9C', 'b:7C', 'b:4C', 'b:2C'], ['c:KQ', 'c:QQ', 'c:JQ', 'c:9Q', 'c:7Q']) > 0);
  });
  test('il Jolly sceglie il valore migliore: J-Q-K-10 + Jolly = scala all\'asso', () => {
    assert.ok(vince(['j:1', 'b:TC', 'b:JQ', 'b:QF', 'b:KP'], ['c:9C', 'c:TQ', 'c:JF', 'c:QP', 'c:KC']) > 0);
  });
  test('il Jolly completa una scala colore', () => {
    assert.equal(cat(['j:1', 'b:2C', 'b:3C', 'b:4C', 'b:5C']), 'Scala colore');
    assert.equal(cat(['j:1', 'j:2', 'b:AC', 'b:KC', 'b:QC']), 'Scala colore');
  });
  test('7 carte con Jolly: sceglie la combinazione migliore', () => {
    assert.equal(cat(['j:1', 'b:9C', 'b:9Q', 'b:2F', 'b:5P', 'b:JC', 'b:KQ']), 'Tris');
  });
});
