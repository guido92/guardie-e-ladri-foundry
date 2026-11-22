/**
 * Carte da Poker: identificativi, mazzi, mescolata con seme, valutazione delle mani
 * (Texas hold'em, Jolly jolly) e combinazioni richieste da Fixer, Accesso e Scasso.
 * Funzioni pure: nessun riferimento a Foundry.
 *
 * Una carta è una stringa "<mazzo>:<valore><seme>":
 *   mazzo  b = Mazzo della Banda, c = Mazzo del Croupier
 *   valore 2..9, T (10), J, Q, K, A
 *   seme   C cuori, Q quadri, F fiori, P picche
 * I Jolly sono "j:1".."j:4" e valgono come qualsiasi carta.
 */

export const VALORI = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
export const SEMI = ["C", "Q", "F", "P"];
/** "Come Quando Fuori Piove": Cuori > Quadri > Fiori > Picche. */
const FORZA_SEME = { C: 4, Q: 3, F: 2, P: 1 };
const NOMI_VALORE = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };
export const SIMBOLI_SEME = { C: "♥", Q: "♦", F: "♣", P: "♠" };
export const NOMI_SEME = { C: "cuori", Q: "quadri", F: "fiori", P: "picche" };

export const CATEGORIE = [
  "Carta alta",
  "Coppia",
  "Doppia coppia",
  "Tris",
  "Scala",
  "Colore",
  "Full",
  "Poker",
  "Scala colore",
];

export function isJolly(id) {
  return typeof id === "string" && id.startsWith("j:");
}

/** { mazzo, v (2..14), s } oppure { mazzo:"j", jolly:true }. */
export function parse(id) {
  if (isJolly(id)) return { id, mazzo: "j", jolly: true };
  const m = /^([bc]):([2-9TJQKA])([CQFP])$/.exec(id ?? "");
  if (!m) throw new Error(`Carta non valida: ${id}`);
  return { id, mazzo: m[1], v: VALORI.indexOf(m[2]) + 2, s: m[3] };
}

export function etichetta(id) {
  if (isJolly(id)) return "Jolly";
  const c = parse(id);
  const k = VALORI[c.v - 2];
  return `${NOMI_VALORE[k] ?? k}${SIMBOLI_SEME[c.s]}`;
}

export function isFigura(v) {
  return v >= 11 && v <= 13; // J, Q, K
}

/** Mazzo completo da 52 carte (senza Jolly). */
export function mazzo(prefisso) {
  const out = [];
  for (const s of SEMI) for (const v of VALORI) out.push(`${prefisso}:${v}${s}`);
  return out;
}

/** PRNG deterministico (mulberry32): restituisce [numero in 0..1, nuovo stato]. */
export function rnd(seed) {
  let t = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

/** Fisher-Yates con seme: restituisce [copia mescolata, nuovo seme]. */
export function mescola(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    let x;
    [x, s] = rnd(s);
    const j = Math.floor(x * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return [a, s];
}

// ---------------------------------------------------------------------------
// Valutazione delle mani

/** Valuta esattamente 5 carte reali {v,s} distinte: [categoria, ...spareggi] + carte ordinate. */
function valuta5(cs) {
  const perValore = new Map();
  for (const c of cs) perValore.set(c.v, (perValore.get(c.v) ?? 0) + 1);
  const gruppi = [...perValore.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const colore = cs.every((c) => c.s === cs[0].s);
  const valori = [...new Set(cs.map((c) => c.v))].sort((a, b) => b - a);
  let alta = 0;
  if (valori.length === 5) {
    if (valori[0] - valori[4] === 4) alta = valori[0];
    else if (valori.join() === "14,5,4,3,2") alta = 5; // scala A-2-3-4-5
  }
  const ordina = (prima) => {
    // carte ordinate per importanza: prima i gruppi, poi per valore
    const peso = new Map(gruppi.map(([v, n], i) => [v, i]));
    return [...cs].sort((a, b) => (prima ? 0 : peso.get(a.v) - peso.get(b.v)) || b.v - a.v);
  };
  if (alta && colore) return { punti: [8, alta], carte: ordinaScala(cs, alta) };
  if (gruppi[0][1] === 4) return { punti: [7, gruppi[0][0], gruppi[1][0]], carte: ordina() };
  if (gruppi[0][1] === 3 && gruppi[1][1] === 2) return { punti: [6, gruppi[0][0], gruppi[1][0]], carte: ordina() };
  if (colore) return { punti: [5, ...valori], carte: ordina(true) };
  if (alta) return { punti: [4, alta], carte: ordinaScala(cs, alta) };
  if (gruppi[0][1] === 3) return { punti: [3, gruppi[0][0], ...gruppi.slice(1).map((g) => g[0])], carte: ordina() };
  if (gruppi[0][1] === 2 && gruppi[1][1] === 2)
    return { punti: [2, gruppi[0][0], gruppi[1][0], gruppi[2][0]], carte: ordina() };
  if (gruppi[0][1] === 2) return { punti: [1, gruppi[0][0], ...gruppi.slice(1).map((g) => g[0])], carte: ordina() };
  return { punti: [0, ...valori], carte: ordina(true) };
}

function ordinaScala(cs, alta) {
  const rango = (v) => (alta === 5 && v === 14 ? 1 : v);
  return [...cs].sort((a, b) => rango(b.v) - rango(a.v));
}

function confrontaPunti(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

function combinazioni(arr, k) {
  const out = [];
  const rec = (start, acc) => {
    if (acc.length === k) return out.push([...acc]);
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

const TUTTE = SEMI.flatMap((s) => VALORI.map((_, i) => ({ v: i + 2, s })));

/**
 * Miglior mano di 5 carte tra quelle date (di solito 2 giocate + 5 sul tavolo).
 * Due carte identiche (stesso valore e seme, da mazzi diversi) contano come una sola:
 * "non è possibile associare 2 carte dello stesso seme e valore".
 * I Jolly assumono il valore di qualsiasi carta.
 * @returns {{punti:number[], categoria:number, nome:string, carte:{v,s,id?,jolly?}[]}}
 */
export function migliorMano(ids) {
  const reali = [];
  const visti = new Set();
  let jolly = 0;
  for (const id of ids) {
    const c = parse(id);
    if (c.jolly) {
      jolly++;
      continue;
    }
    const k = `${c.v}${c.s}`;
    if (visti.has(k)) continue;
    visti.add(k);
    reali.push(c);
  }
  let best = null;
  const prova = (cs) => {
    if (cs.length < 5) {
      // meno di 5 carte: valutazione parziale (solo per completezza, il gioco ne usa sempre 7)
      const r = valutaParziale(cs);
      if (!best || confrontaPunti(r.punti, best.punti) > 0) best = r;
      return;
    }
    for (const five of combinazioni(cs, 5)) {
      const r = valuta5(five);
      if (!best || confrontaPunti(r.punti, best.punti) > 0) best = r;
    }
  };
  const sostituisci = (n, base) => {
    if (n === 0) return prova(base);
    const presenti = new Set(base.map((c) => `${c.v}${c.s}`));
    for (const c of TUTTE) {
      if (presenti.has(`${c.v}${c.s}`)) continue;
      sostituisci(n - 1, [...base, { ...c, jolly: true }]);
    }
  };
  // Con i Jolly basta considerare sottoinsiemi di carte reali di dimensione 5-jolly
  if (jolly > 0) {
    const k = Math.max(0, Math.min(reali.length, 5 - jolly));
    const subs = reali.length > k ? combinazioni(reali, k) : [reali];
    for (const sub of subs) sostituisci(Math.min(jolly, 5 - sub.length), sub);
  } else {
    prova(reali);
  }
  return { ...best, categoria: best.punti[0], nome: CATEGORIE[best.punti[0]] };
}

function valutaParziale(cs) {
  const perValore = new Map();
  for (const c of cs) perValore.set(c.v, (perValore.get(c.v) ?? 0) + 1);
  const gruppi = [...perValore.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const n = gruppi[0]?.[1] ?? 0;
  const cat = n === 4 ? 7 : n === 3 ? 3 : n === 2 ? (gruppi[1]?.[1] === 2 ? 2 : 1) : 0;
  return { punti: [cat, ...gruppi.map((g) => g[0])], carte: [...cs].sort((a, b) => b.v - a.v) };
}

/**
 * Confronto tra Ladri e Croupier: > 0 vincono i Ladri. In caso di parità vince il Croupier,
 * a meno di usare la regola opzionale dei semi ("Come Quando Fuori Piove").
 */
export function confronta(manoLadri, manoCroupier, { semi = false } = {}) {
  const d = confrontaPunti(manoLadri.punti, manoCroupier.punti);
  if (d !== 0 || !semi) return d;
  for (let i = 0; i < Math.min(manoLadri.carte.length, manoCroupier.carte.length); i++) {
    const s = (FORZA_SEME[manoLadri.carte[i].s] ?? 0) - (FORZA_SEME[manoCroupier.carte[i].s] ?? 0);
    if (s) return s;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Combinazioni da pagare (Fixer, Accesso, Scasso)

export const COMBINAZIONI = {
  coppia: { nome: "Coppia", n: 2 },
  coppiaFigure: { nome: "Coppia di figure", n: 2 },
  doppiaCoppia: { nome: "Doppia coppia", n: 4 },
  tris: { nome: "Tris", n: 3 },
  trisFigure: { nome: "Tris di figure", n: 3 },
  poker: { nome: "Poker", n: 4 },
  pokerFigure: { nome: "Poker di figure", n: 4 },
  scala: { nome: "Scala", n: 5 },
  full: { nome: "Full", n: 5 },
  colore: { nome: "5 carte dello stesso colore", n: 5 },
};

function soddisfa(tipo, cs) {
  const conta = new Map();
  for (const c of cs) conta.set(c.v, (conta.get(c.v) ?? 0) + 1);
  const n = [...conta.values()].sort((a, b) => b - a);
  const distinte = new Set(cs.map((c) => `${c.v}${c.s}`)).size === cs.length;
  if (!distinte) return false;
  const tutteFigure = cs.every((c) => isFigura(c.v));
  switch (tipo) {
    case "coppia":
      return n[0] === 2;
    case "coppiaFigure":
      return n[0] === 2 && tutteFigure;
    case "doppiaCoppia":
      return n[0] === 2 && n[1] === 2;
    case "tris":
      return n[0] === 3;
    case "trisFigure":
      return n[0] === 3 && tutteFigure;
    case "poker":
      return n[0] === 4;
    case "pokerFigure":
      return n[0] === 4 && tutteFigure;
    case "full":
      return n[0] === 3 && n[1] === 2;
    case "colore":
      return cs.every((c) => c.s === cs[0].s);
    case "scala": {
      const v = [...conta.keys()].sort((a, b) => a - b);
      if (v.length !== 5) return false;
      if (v[4] - v[0] === 4) return true;
      return v.join() === "2,3,4,5,14";
    }
    default:
      return false;
  }
}

/**
 * Le carte indicate formano esattamente la combinazione richiesta? I Jolly valgono come
 * qualsiasi carta. `tipi` può essere una stringa o un elenco di alternative ("1 Poker o una Scala").
 */
export function formaCombinazione(tipi, ids) {
  const elenco = Array.isArray(tipi) ? tipi : [tipi];
  const cs = ids.map(parse);
  const reali = cs.filter((c) => !c.jolly);
  const jolly = cs.length - reali.length;
  return elenco.some((tipo) => {
    if (!COMBINAZIONI[tipo] || ids.length !== COMBINAZIONI[tipo].n) return false;
    const rec = (k, base) => {
      if (k === 0) return soddisfa(tipo, base);
      return TUTTE.some((c) => rec(k - 1, [...base, c]));
    };
    return rec(jolly, reali);
  });
}

/** Cerca in un insieme di carte un sottoinsieme che formi la combinazione (suggerimento per l'interfaccia). */
export function trovaCombinazione(tipi, ids) {
  const elenco = Array.isArray(tipi) ? tipi : [tipi];
  for (const tipo of elenco) {
    const n = COMBINAZIONI[tipo]?.n;
    if (!n || ids.length < n) continue;
    // prima senza Jolly, poi con: un Jolly vale più di una carta qualsiasi
    const ordinate = [...ids].sort((a, b) => Number(isJolly(a)) - Number(isJolly(b)));
    for (const sub of combinazioni(ordinate, n)) if (formaCombinazione(tipo, sub)) return sub;
  }
  return null;
}

/** Le 2 carte migliori da giocare tra quelle in mano, dato il tavolo (aiuto per il Croupier). */
export function migliorCoppia(mano, tavolo) {
  let best = null;
  for (const due of combinazioni(mano, 2)) {
    const m = migliorMano([...due, ...tavolo]);
    if (!best || confrontaPunti(m.punti, best.mano.punti) > 0) best = { carte: due, mano: m };
  }
  return best;
}
