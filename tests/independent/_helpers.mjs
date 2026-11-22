// Helper per i test indipendenti (black-box): costruiscono situazioni precise
// manipolando una copia dello stato JSON, senza duplicare carte.
import { newGame, apply, EngineError, carteDaGiocare } from '../../module/game/engine.mjs';

export { newGame, apply, EngineError, carteDaGiocare };

export const clone = (s) => JSON.parse(JSON.stringify(s));

const CLASSI = ['gangster', 'lady', 'meccanico', 'intellettuale'];

/** Crea i Ladri: spec = array di classi o di oggetti parziali. */
export function ladri(spec) {
  return spec.map((x, i) => {
    const o = typeof x === 'string' ? { classe: x } : { ...x };
    const id = o.id ?? String.fromCharCode(97 + i); // a, b, c, d
    return { id, nome: o.nome ?? id.toUpperCase(), classe: o.classe ?? 'meccanico', ricercato: !!o.ricercato, ...o, id };
  });
}

/** Partita nuova (fase setup). */
export function partita(spec, { seed = 7, opzioni } = {}) {
  return newGame({ ladri: ladri(spec), seed, opzioni }).state;
}

/** Partita già distribuita (fase lavoretti). Il Gangster sceglie una coppia di 2. */
export function distribuita(spec, opt = {}) {
  let s = partita(spec, opt);
  for (const l of s.ladri) {
    if (l.classe === 'gangster' && !l.coppiaPronta) {
      s = apply(s, { type: 'coppiaGangster', ladro: l.id, valore: opt.coppiaValore ?? '2', semi: opt.coppiaSemi ?? ['F', 'P'] }).state;
    }
  }
  return apply(s, { type: 'distribuisci' }).state;
}

/** Tutte le "liste" di carte note nello stato. */
function liste(s) {
  const L = [s.mazzi.b.pesca, s.mazzi.b.scarti, s.mazzi.c.pesca, s.mazzi.c.scarti, s.jolly, s.eliminate, s.mazzetto];
  for (const l of s.ladri) L.push(l.mano);
  if (s.confronto) {
    for (const k of ['tavolo', 'croupierMano', 'croupierGioca']) if (Array.isArray(s.confronto[k])) L.push(s.confronto[k]);
    for (const v of Object.values(s.confronto.giocate ?? {})) if (Array.isArray(v)) L.push(v);
  }
  if (s.bottino && Array.isArray(s.bottino.carte)) L.push(s.bottino.carte);
  return L.filter(Array.isArray);
}

/** Rimuove una carta da ovunque si trovi. */
function togli(s, id) {
  for (const arr of liste(s)) {
    const i = arr.indexOf(id);
    if (i >= 0) { arr.splice(i, 1); return true; }
  }
  return false;
}

/**
 * Sistema le carte:
 *  mani: { ladroId: [carte] }  (le carte che il Ladro aveva e non sono elencate tornano in fondo al mazzo)
 *  topB / topC: carte da mettere in cima (indice 0 = prima pescata)
 *  mazzetto: carte del Mazzetto delle Guardie
 */
export function metti(s0, { mani = {}, topB = [], topC = [], mazzetto } = {}) {
  const s = clone(s0);
  // svuota le mani ridefinite
  for (const [id, carte] of Object.entries(mani)) {
    const l = s.ladri.find((x) => x.id === id);
    const vecchie = l.mano.filter((c) => !carte.includes(c));
    l.mano = l.mano.filter((c) => carte.includes(c));
    for (const c of vecchie) rimettiInFondo(s, c);
  }
  if (mazzetto) {
    const vecchie = s.mazzetto.filter((c) => !mazzetto.includes(c));
    s.mazzetto = s.mazzetto.filter((c) => mazzetto.includes(c));
    for (const c of vecchie) rimettiInFondo(s, c);
  }
  const tutte = [...Object.values(mani).flat(), ...topB, ...topC, ...(mazzetto ?? [])];
  for (const c of tutte) {
    if (!togli(s, c)) throw new Error('carta non trovata nello stato: ' + c);
  }
  for (const [id, carte] of Object.entries(mani)) s.ladri.find((x) => x.id === id).mano = [...carte];
  s.mazzi.b.pesca.unshift(...topB);
  s.mazzi.c.pesca.unshift(...topC);
  if (mazzetto) s.mazzetto = [...mazzetto];
  verificaConservazione(s);
  return s;
}

function rimettiInFondo(s, c) {
  if (c.startsWith('j:')) s.jolly.push(c);
  else if (c.startsWith('b:')) s.mazzi.b.pesca.push(c);
  else s.mazzi.c.pesca.push(c);
}

/** Tutte le carte presenti (con molteplicità). */
export function tutteLeCarte(s) {
  return liste(s).flat();
}

/** 52 + 52 + 4 Jolly, nessun doppione. */
export function verificaConservazione(s) {
  const all = tutteLeCarte(s);
  const set = new Set(all);
  if (set.size !== all.length) {
    const dup = all.filter((c, i) => all.indexOf(c) !== i);
    throw new Error('carte duplicate: ' + dup.join(','));
  }
  return all.length;
}

export const ladro = (s, id) => s.ladri.find((l) => l.id === id);

/** Esegue una sequenza di azioni, restituendo stato e tutti gli effetti. */
export function seq(s, azioni) {
  let effects = [];
  for (const a of azioni) {
    const r = apply(s, a);
    s = r.state;
    effects = effects.concat(r.effects ?? []);
  }
  return { state: s, effects };
}

/** Porta un Lavoretto fino al river (tutti continuano). */
export function finoAlRiver(s, grado, partecipanti) {
  s = apply(s, { type: 'lavorettoInizia', grado, partecipanti }).state;
  s = apply(s, { type: 'avanza' }).state; // flop -> turn
  s = apply(s, { type: 'avanza' }).state; // turn -> river
  return s;
}

export const ricercati = (s) => s.ladri.filter((l) => l.ricercato).length;

/** Carte filler (basse, senza combinazioni utili) prese dal mazzo della Banda. */
export const isB = (c) => c.startsWith('b:');

/**
 * Durante un Confronto già avviato: impone le carte sul tavolo (prese dal Mazzo della Banda),
 * rimettendo in fondo al mazzo quelle che c'erano, e mette `prossime` in cima al Mazzo della Banda.
 */
export function forzaTavolo(s0, tavolo, prossime = []) {
  const s = clone(s0);
  const vecchie = s.confronto.tavolo.filter((c) => !tavolo.includes(c));
  s.confronto.tavolo = s.confronto.tavolo.filter((c) => tavolo.includes(c));
  for (const c of [...tavolo, ...prossime]) {
    if (!togli(s, c)) throw new Error('carta non trovata: ' + c);
  }
  s.mazzi.b.pesca.push(...vecchie);
  s.confronto.tavolo = [...tavolo];
  s.mazzi.b.pesca.unshift(...prossime);
  verificaConservazione(s);
  return s;
}

/** Durante un Confronto: impone la mano del Croupier (carte prese dal suo mazzo). */
export function forzaCroupier(s0, mano) {
  const s = clone(s0);
  const vecchie = s.confronto.croupierMano.filter((c) => !mano.includes(c));
  s.confronto.croupierMano = s.confronto.croupierMano.filter((c) => mano.includes(c));
  for (const c of mano) if (!togli(s, c)) throw new Error('carta non trovata: ' + c);
  s.mazzi.c.pesca.push(...vecchie);
  s.confronto.croupierMano = [...mano];
  verificaConservazione(s);
  return s;
}
