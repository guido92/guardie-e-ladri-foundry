/**
 * Arbitro indipendente: gioca partite casuali di Guardie & Ladri e, dopo ogni mossa,
 * ricontrolla le regole del manuale con calcoli propri (non usa la valutazione del motore).
 * Si usa sia da Node (simulazione) sia da Foundry (stessa logica, motore vero nella pagina).
 */

// ---- carte e Poker, implementazione indipendente -----------------------------
const V = "23456789TJQKA";
const SEMI = "CQFP";
export const val = (c) => V.indexOf(c.split(":")[1][0]) + 2;
export const seme = (c) => c.split(":")[1][1];
const isJ = (c) => c.startsWith("j:");
const FORZA = { C: 4, Q: 3, F: 2, P: 1 };

/** Punteggio di 5 carte {v,s}: array confrontabile. */
function punti5(cs) {
  const vs = cs.map((c) => c.v).sort((a, b) => b - a);
  const cnt = {};
  for (const v of vs) cnt[v] = (cnt[v] ?? 0) + 1;
  const gruppi = Object.entries(cnt).map(([v, n]) => [n, +v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const flush = new Set(cs.map((c) => c.s)).size === 1;
  const uniq = [...new Set(vs)];
  let scala = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) scala = uniq[0];
    if (uniq.join() === "14,5,4,3,2") scala = 5;
  }
  const forma = gruppi.map((g) => g[0]).join("");
  const ord = gruppi.map((g) => g[1]);
  if (scala && flush) return [8, scala];
  if (forma === "41") return [7, ...ord];
  if (forma === "32") return [6, ...ord];
  if (flush) return [5, ...vs];
  if (scala) return [4, scala];
  if (forma === "311") return [3, ...ord];
  if (forma === "221") return [2, ...ord];
  if (forma === "2111") return [1, ...ord];
  return [0, ...vs];
}
const cmp = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
};
function* comb(a, k, s = 0, acc = []) {
  if (acc.length === k) return yield [...acc];
  for (let i = s; i < a.length; i++) {
    acc.push(a[i]);
    yield* comb(a, k, i + 1, acc);
    acc.pop();
  }
}
/** Miglior punteggio: carte identiche contano una volta, i Jolly valgono tutto. */
export function miglior(ids) {
  const reali = [];
  const visti = new Set();
  let j = 0;
  for (const id of ids) {
    if (isJ(id)) {
      j++;
      continue;
    }
    const k = id.split(":")[1];
    if (visti.has(k)) continue;
    visti.add(k);
    reali.push({ v: val(id), s: seme(id) });
  }
  const tutte = [];
  for (const s of SEMI) for (let v = 2; v <= 14; v++) tutte.push({ v, s });
  let best = null;
  const prova = (cs) => {
    if (cs.length < 5) return;
    for (const f of comb(cs, 5)) {
      const p = punti5(f);
      if (!best || cmp(p, best) > 0) best = p;
    }
  };
  const rec = (n, base) => {
    if (n === 0) return prova(base);
    for (const c of tutte) if (!base.some((b) => b.v === c.v && b.s === c.s)) rec(n - 1, [...base, c]);
  };
  if (!j) prova(reali);
  else for (const sub of comb(reali, Math.max(0, Math.min(reali.length, 5 - j)))) rec(Math.min(j, 5 - sub.length), sub);
  return best;
}

/** Combinazione esatta (costi del Fixer, Accesso, Scasso). */
export function combo(tipo, ids) {
  const n = { coppia: 2, coppiaFigure: 2, doppiaCoppia: 4, tris: 3, trisFigure: 3, poker: 4, pokerFigure: 4, scala: 5, full: 5, colore: 5 }[tipo];
  if (ids.length !== n) return false;
  const reali = ids.filter((c) => !isJ(c)).map((c) => ({ v: val(c), s: seme(c) }));
  const j = ids.length - reali.length;
  const ok = (cs) => {
    if (new Set(cs.map((c) => `${c.v}${c.s}`)).size !== cs.length) return false;
    const cnt = {};
    for (const c of cs) cnt[c.v] = (cnt[c.v] ?? 0) + 1;
    const f = Object.values(cnt).sort((a, b) => b - a).join("");
    const fig = cs.every((c) => c.v >= 11 && c.v <= 13);
    const vs = Object.keys(cnt).map(Number).sort((a, b) => a - b);
    return {
      coppia: f === "2",
      coppiaFigure: f === "2" && fig,
      doppiaCoppia: f === "22",
      tris: f === "3",
      trisFigure: f === "3" && fig,
      poker: f === "4",
      pokerFigure: f === "4" && fig,
      full: f === "32",
      colore: new Set(cs.map((c) => c.s)).size === 1,
      scala: vs.length === 5 && (vs[4] - vs[0] === 4 || vs.join() === "2,3,4,5,14"),
    }[tipo];
  };
  const tutte = [];
  for (const s of SEMI) for (let v = 2; v <= 14; v++) tutte.push({ v, s });
  const rec = (k, base) => (k === 0 ? ok(base) : tutte.some((c) => rec(k - 1, [...base, c])));
  return rec(j, reali);
}
function trova(tipo, ids) {
  const n = { coppia: 2, coppiaFigure: 2, doppiaCoppia: 4, tris: 3, trisFigure: 3, poker: 4, pokerFigure: 4, scala: 5, full: 5, colore: 5 }[tipo];
  if (ids.length < n || ids.length > 16) return null;
  for (const s of comb(ids, n)) if (combo(tipo, s)) return s;
  return null;
}

// ---- tabelle del manuale (trascritte qui, non importate dal sistema) -----------
const GRADO = {
  banale: { cr: 2, bot: 3, sc: false, bon: 2 },
  discreto: { cr: 3, bot: 4, sc: false, bon: 3 },
  tosto: { cr: 4, bot: 2, sc: true, bon: 2 },
  esagerato: { cr: 5, bot: 3, sc: true, bon: 3 },
};
const LISTINO = {
  fumogeni: ["coppia"],
  attrezzi: ["coppiaFigure"],
  mappa: ["tris"],
  documenti: ["trisFigure"],
  personale: ["full", "colore"],
  combinazione: ["poker", "scala"],
  auto: ["poker", "scala"],
};

/** Impronta dello stato (chiavi ordinate, così non dipende dall'ordine di salvataggio). */
export function impronta(x) {
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  const str = JSON.stringify(canon(x));
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return `${h.toString(16)}:${str.length}`;
}

// ---- arbitro ------------------------------------------------------------------
export function creaArbitro({ apply, newGame }) {
  function tutteLeCarte(s) {
    const cf = s.confronto;
    return [
      ...s.mazzi.b.pesca, ...s.mazzi.b.scarti, ...s.mazzi.c.pesca, ...s.mazzi.c.scarti,
      ...s.jolly, ...s.eliminate, ...s.mazzetto, ...s.ladri.flatMap((l) => l.mano),
      ...(cf ? [...cf.tavolo, ...Object.values(cf.giocate).flat(), ...(cf.croupierGioca ?? []), ...cf.croupierMano] : []),
      ...(s.bottino?.carte ?? []),
    ];
  }

  return function gioca(seed, { log = () => {} } = {}) {
    let r = seed >>> 0;
    const rand = () => ((r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296);
    const pick = (a) => a[Math.floor(rand() * a.length)];
    const prob = (p) => rand() < p;
    const problemi = [];
    const regole = new Map(); // regola -> volte verificata
    const ok = (cond, regola, dettaglio = "") => {
      regole.set(regola, (regole.get(regola) ?? 0) + 1);
      if (!cond) problemi.push(`${regola}${dettaglio ? ` — ${dettaglio}` : ""}`);
      return cond;
    };
    let s;
    const eventi = [];
    const mosse = []; // mosse riuscite, con l'impronta dello stato dopo ciascuna (per rigiocarle in Foundry)
    const passo = (azione, controlla) => {
      const prima = s;
      let res;
      try {
        res = apply(prima, azione);
      } catch (e) {
        problemi.push(`mossa legale rifiutata: ${JSON.stringify(azione)} → ${e.message}`);
        return false;
      }
      s = res.state;
      mosse.push({ azione, impronta: impronta(s) });
      const tutte = tutteLeCarte(s);
      ok(tutte.length === 108 && new Set(tutte).size === 108, "108 carte, nessuna duplicata", `${tutte.length}/${new Set(tutte).size}`);
      ok(tutte.filter(isJ).length === 4, "4 Jolly in gioco");
      controlla?.(prima, s, res.effects);
      return true;
    };
    const rifiuta = (azione, regola) => {
      try {
        apply(s, azione);
        ok(false, regola, `accettata: ${JSON.stringify(azione)}`);
      } catch {
        ok(true, regola);
      }
    };
    const L = (id) => s.ladri.find((l) => l.id === id);
    const tot = (x = s) => x.ladri.reduce((n, l) => n + l.mano.length, 0);

    // --- la Banda: 2-4 Ladri, classi e Ricercati a caso ---
    const n = 2 + Math.floor(rand() * 3);
    const classi = ["gangster", "lady", "meccanico", "intellettuale"].sort(() => rand() - 0.5).slice(0, n);
    const ladri = classi.map((c, i) => ({ id: `L${i}`, nome: `${c}-${i}`, classe: c, ricercato: prob(0.35) }));
    const opzioni = { semi: prob(0.3), fixerElimina: prob(0.3), allIn: prob(0.8) };
    const config = { ladri, seed: seed * 7 + 1, opzioni };
    s = newGame(config).state;
    mosse.push({ azione: { type: "newGame", config }, impronta: impronta(s) });
    eventi.push(`Banda di ${n}: ${ladri.map((l) => `${l.classe}${l.ricercato ? "*" : ""}`).join(", ")}; opzioni ${JSON.stringify(opzioni)}`);

    // --- Preparazione ---
    if (ladri.some((l) => l.classe === "gangster")) rifiuta({ type: "distribuisci" }, "niente carte prima della Coppia del Gangster");
    for (const l of ladri.filter((x) => x.classe === "gangster")) {
      rifiuta({ type: "coppiaGangster", ladro: l.id, valore: "J", semi: ["C", "Q"] }, "Coppia del Gangster solo di numeri 2-10");
      const v = pick("23456789T".split(""));
      const semi = [...SEMI].sort(() => rand() - 0.5).slice(0, 2);
      passo({ type: "coppiaGangster", ladro: l.id, valore: v, semi }, (a, b) => ok(L(l.id).mano.length === 2 && L(l.id).mano.every((c) => val(c) === "23456789T".indexOf(v) + 2), "Coppia del Gangster presa dal Mazzo"));
    }
    passo({ type: "distribuisci" }, (a, b) => {
      for (const l of b.ladri) {
        const atteso = 2 + (l.ricercato ? 1 : 0) + (l.classe === "gangster" ? 2 : 0) + (n === 2 ? 1 : 0);
        ok(l.mano.length === atteso, "mani iniziali (2, +1 Ricercato, +Coppia Gangster, +Jolly in 3 giocatori)", `${l.classe}: ${l.mano.length} invece di ${atteso}`);
        if (n === 2) ok(l.mano.some(isJ), "in 3 giocatori un Jolly a testa");
      }
    });

    // --- Lavoretti ---
    const liberi = () => s.ladri.filter((l) => !l.lavoretto);
    let nLav = 0;
    while (liberi().length && nLav < 4) {
      const lib = liberi();
      const coppia = lib.length >= 2 && prob(0.5) && lib.filter((l) => l.mano.length).length >= 2;
      const part = coppia ? lib.filter((l) => l.mano.length).sort(() => rand() - 0.5).slice(0, 2) : lib.filter((l) => l.mano.length >= 2).slice(0, 1);
      if (!part.length) break;
      const grado = pick(Object.keys(GRADO));
      const G = GRADO[grado];
      const ids = part.map((l) => l.id);
      nLav++;
      const cima = s.mazzi.b.pesca.slice(0, 3);
      if (!passo({ type: "lavorettoInizia", grado, partecipanti: ids }, (a, b) => ok(b.confronto.tavolo.length === 3 && (a.mazzi.b.pesca.length < 3 || cima.every((c, i) => b.confronto.tavolo[i] === c)), "flop: 3 Carte dalla cima del Mazzo della Banda"))) break;
      let ev = `Lavoretto ${grado} (${part.map((l) => l.classe).join("+")})`;
      const ritirati = new Set();
      // flop e turn
      for (const fase of ["flop", "turn"]) {
        if (!s.confronto) break;
        for (const id of [...s.confronto.attivi]) {
          if (!s.confronto || s.confronto.step !== fase) break;
          const ritira = prob(fase === "flop" ? 0.12 : 0.1);
          const manoPrima = L(id).mano.length;
          if (ritira && fase === "turn") {
            const c = pick(L(id).mano);
            passo({ type: "decidi", ladro: id, scelta: "ritira", carta: c }, (a, b) => {
              ok(L(id).mano.length === manoPrima - 1 && b.mazzi.b.scarti.includes(c) || isJ(c), "ritiro al turn: si perde 1 Carta a scelta");
              ritirati.add(id);
            });
            ev += `, ${L(id).classe} si ritira al turn`;
          } else if (ritira) {
            passo({ type: "decidi", ladro: id, scelta: "ritira" }, () => ok(L(id).mano.length === manoPrima, "ritiro al flop: non si perde nulla"));
            ritirati.add(id);
            ev += `, ${L(id).classe} si ritira al flop`;
          } else {
            passo({ type: "decidi", ladro: id, scelta: "continua" }, (a, b) => {
              if (b.confronto?.step === "turn" && a.confronto.step === "flop") ok(b.confronto.tavolo.length === 4, "4ª Carta dopo il flop");
              if (b.confronto?.step === "river" && a.confronto.step === "turn") {
                ok(b.confronto.tavolo.length === 5, "5ª Carta");
                ok(b.confronto.croupierMano.length === G.cr, "il Croupier pesca le Carte della Tabella del Grado di Rischio", `${b.confronto.croupierMano.length} invece di ${G.cr}`);
              }
            });
          }
        }
      }
      if (!s.confronto) {
        for (const id of ids) ok(L(id).lavoretto, "chi si ritira non fa altri Lavoretti");
        eventi.push(`${ev}: tutti ritirati`);
        continue;
      }
      for (const id of ritirati) ok(!s.confronto.attivi.includes(id), "chi si ritira esce dal Confronto e dal Bottino");
      rifiuta({ type: "decidi", ladro: s.confronto.attivi[0], scelta: "ritira" }, "dopo la 5ª Carta non ci si ritira più");
      const attivi = [...s.confronto.attivi];
      const quante = attivi.length === 1 ? 2 : 1;
      for (const id of attivi) {
        const m = L(id).mano;
        const carte = m.length <= quante ? [...m] : [...m].sort(() => rand() - 0.5).slice(0, quante);
        passo({ type: "gioca", ladro: id, carte }, () => ok(carte.length === Math.min(quante, m.length), "da soli si giocano 2 Carte, in coppia 1 a testa"));
      }
      const scegliCroupier = (mano, tav) => {
        if (mano.length <= 2) return [...mano];
        let best = null;
        for (const due of comb(mano, 2)) {
          const p = miglior([...due, ...tav]);
          if (!best || cmp(p, best.p) > 0) best = { due, p };
        }
        return prob(0.7) ? best.due : [...mano].sort(() => rand() - 0.5).slice(0, 2);
      };
      const verificaEsito = (a, b) => {
        const cf = b.confronto ?? null;
        // dopo un Rilancio riuscito le Carte giocate sono già state scartate: si leggono da prima della mossa
        let giocate = Object.values((cf ?? a.confronto).giocate).flat();
        if (!giocate.length) giocate = Object.values(a.confronto.giocate).flat();
        const tav = (cf ?? a.confronto).tavolo;
        const crou = (cf ?? a.confronto).croupierGioca ?? [];
        if (!cf || !crou.length) return null;
        const d = cmp(miglior([...giocate, ...tav]), miglior([...crou, ...tav]));
        let atteso = d > 0;
        if (d === 0 && s.opzioni.semi) atteso = null; // spareggio sui semi: non lo ricalcolo
        if (atteso !== null) ok((cf.esito === "successo") === atteso, "esito del Confronto (Poker, parità al Croupier)", `${cf.esito} con mani ${miglior([...giocate, ...tav])} vs ${miglior([...crou, ...tav])}`);
        return cf.esito;
      };
      passo({ type: "croupierGioca", carte: scegliCroupier(s.confronto.croupierMano, s.confronto.tavolo) }, verificaEsito);
      let cf = s.confronto;
      // baciamano
      const lady = attivi.find((id) => L(id).classe === "lady");
      if (cf?.esito === "fallimento" && lady && L(lady).mano.length && prob(0.7)) {
        const m = pick(L(lady).mano);
        const g = pick(Object.values(cf.giocate).flat());
        passo({ type: "baciamano", ladro: lady, mano: m, giocata: g }, (a, b) => {
          ok(L(lady).mano.includes(g) && Object.values(b.confronto.giocate).flat().includes(m), "baciamano: scambio Carta in mano / Carta rivelata");
          verificaEsito(a, b);
        });
        ev += ", baciamano";
        cf = s.confronto;
        if (cf?.esito === "fallimento") rifiuta({ type: "baciamano", ladro: lady, mano: L(lady).mano[0], giocata: Object.values(cf.giocate).flat()[0] }, "baciamano una volta per Confronto");
      }
      if (cf?.esito === "fallimento") {
        const prima = s.ladri.map((l) => l.mano.length);
        passo({ type: "accetta" }, (a, b) => ok(b.ladri.every((l, i) => l.mano.length === prima[i]), "Fallimento: si perdono solo le Carte giocate"));
        eventi.push(`${ev}: Fallimento`);
        continue;
      }
      // successo: incassa o rilancia
      const rilancia = prob(0.4);
      const manoPrima = tot();
      for (const id of attivi) if (s.confronto) passo({ type: "vota", ladro: id, scelta: rilancia ? "rilancia" : "incassa" });
      let bonus = false;
      if (rilancia && s.confronto?.round === 2) {
        const giocatePrima = JSON.stringify(cf.giocate);
        ok(JSON.stringify(s.confronto.giocate) === giocatePrima, "Rilancio: le Carte dei Ladri restano a terra");
        ok(s.confronto.croupierMano.length === G.cr, "Rilancio: il Croupier torna al numero della Tabella");
        ok(s.confronto.tavolo.length === 3, "Rilancio: 3 nuove Carte sul tavolo");
        const ritira = prob(0.2);
        for (const id of attivi) if (s.confronto?.step === "flop") passo({ type: "decidi", ladro: id, scelta: ritira ? "ritira" : "continua" });
        if (ritira) {
          ok(!s.confronto && tot() === manoPrima + attivi.reduce((n0, id) => n0 + JSON.parse(giocatePrima)[id].length, 0), "ritiro dal Rilancio: si riprendono le Carte giocate, niente Bottino");
          eventi.push(`${ev}: Successo, Rilancio, ritiro`);
          continue;
        }
        ok(s.confronto.tavolo.length === 5, "Rilancio: 4ª e 5ª Carta insieme");
        passo({ type: "croupierGioca", carte: scegliCroupier(s.confronto.croupierMano, s.confronto.tavolo) }, verificaEsito);
        if (s.confronto?.esito === "fallimento") {
          passo({ type: "accetta" });
          ok(tot() === manoPrima, "Rilancio fallito: si perdono Bottino e Carte giocate");
          eventi.push(`${ev}: Successo, Rilancio fallito`);
          continue;
        }
        bonus = true;
      }
      // Bottino
      const atteso = G.bot + (bonus ? G.bon : 0);
      if (s.bottino?.daScegliere) {
        ok(G.sc && s.bottino.daScegliere === atteso, "Bottino a scelta per Tosto/Esagerato", `${s.bottino.daScegliere} invece di ${atteso}`);
        const scelte = [...s.mazzi.b.pesca].sort(() => rand() - 0.5).slice(0, s.bottino.daScegliere);
        passo({ type: "bottinoScegli", ladro: attivi[0], carte: scelte });
      } else if (s.bottino) ok(!G.sc && s.bottino.carte.length === atteso, "Bottino pescato per Banale/Discreto", `${s.bottino.carte.length} invece di ${atteso}`);
      if (s.bottino) {
        if (prob(0.5)) passo({ type: "bottinoDividi" });
        else for (const c of [...s.bottino.carte]) if (s.bottino) passo({ type: "bottinoAssegna", carta: c, a: pick(attivi) });
      }
      ok(!s.confronto && !s.bottino && tot() === manoPrima + atteso, "il Bottino finisce nelle mani della Banda", `${tot()} invece di ${manoPrima + atteso}`);
      eventi.push(`${ev}: Successo${bonus ? " con Rilancio" : ""}, Bottino ${atteso}`);
    }
    for (const l of s.ladri.filter((x) => x.lavoretto)) rifiuta({ type: "lavorettoInizia", grado: "banale", partecipanti: [l.id] }, "un solo Lavoretto a testa");

    // --- Fixer ---
    const ricercatiPrima = s.ladri.map((l) => l.ricercato);
    const totPrima = tot();
    passo({ type: "faseFixer" }, (a, b) => {
      if (totPrima < 2) b.ladri.forEach((l, i) => ok(l.ricercato && l.mano.length === a.ladri[i].mano.length + (ricercatiPrima[i] ? 0 : 1), "meno di 2 Carte al Fixer: tutti Ricercati, pesca chi non lo era"));
    });
    const comprati = [];
    for (const ogg of Object.keys(LISTINO).sort(() => rand() - 0.5)) {
      const mani = s.ladri.flatMap((l) => l.mano);
      const pagamento = LISTINO[ogg].map((t) => trova(t, mani)).find(Boolean);
      if (pagamento && prob(0.8)) {
        const jolly = s.jolly.length;
        passo({ type: "compra", oggetto: ogg, carte: pagamento, destinatario: pick(s.ladri).id }, (a, b) => {
          ok(b.acquisti.includes(ogg), "acquisto dal Fixer con la combinazione del listino");
          if (ogg === "fumogeni" || ogg === "attrezzi") ok(b.jolly.length === Math.max(0, jolly - 1) + pagamento.filter(isJ).length, "Fumogeni e Attrezzi danno 1 Jolly");
          if (ogg === "documenti") ok(b.ladri.every((l) => !l.ricercato), "Documenti falsi annullano i Ricercati");
          if (!s.opzioni.fixerElimina) ok(pagamento.filter((c) => !isJ(c)).every((c) => b.mazzi.b.pesca.includes(c)), "le Carte del Fixer tornano nel Mazzo della Banda");
          else ok(pagamento.filter((c) => !isJ(c)).every((c) => b.eliminate.includes(c)), "opzione: le Carte del Fixer escono dal gioco");
        });
        comprati.push(ogg);
        rifiuta({ type: "compra", oggetto: ogg, gratis: true }, "non si compra due volte lo stesso articolo");
      } else if (!pagamento) {
        const sbagliate = mani.slice(0, { coppia: 2, coppiaFigure: 2, tris: 3, trisFigure: 3, full: 5, colore: 5, poker: 4, scala: 5 }[LISTINO[ogg][0]]);
        if (sbagliate.length && !LISTINO[ogg].some((t) => combo(t, sbagliate))) rifiuta({ type: "compra", oggetto: ogg, carte: sbagliate }, "il Fixer rifiuta un pagamento sbagliato");
      }
    }
    eventi.push(`Fixer: ${comprati.join(", ") || "niente"}`);

    // --- Grande Colpo ---
    passo({ type: "faseColpo" });
    const nR = () => s.ladri.filter((l) => l.ricercato).length;
    const acq = (k) => s.acquisti.includes(k);
    const mani = () => s.ladri.flatMap((l) => l.mano);
    if (!acq("mappa")) rifiuta({ type: "accesso", tipo: "secondario", carte: [] }, "Ingresso Secondario solo con la Mappa");
    const accessi = [];
    if (acq("mappa") && (acq("fumogeni") || trova("tris", mani()))) accessi.push("secondario");
    if (acq("personale") || trova("poker", mani())) accessi.push("incognito");
    accessi.push("teatrale");
    const acc = pick(accessi);
    const costoA = acc === "secondario" ? (acq("fumogeni") ? [] : trova("tris", mani())) : acc === "incognito" ? (acq("personale") ? [] : trova("poker", mani())) : [];
    const guardieA = acc === "secondario" ? 0 : acc === "incognito" ? (acq("documenti") ? 0 : nR()) : acq("personale") ? Math.floor(n / 2) : n;
    passo({ type: "accesso", tipo: acc, carte: costoA }, (a, b) => {
      ok(b.colpo.guardie === guardieA, `Guardie Allertate dall'Ingresso ${acc}`, `${b.colpo.guardie} invece di ${guardieA}`);
      ok(b.mazzetto.length === 3 * guardieA, "3 Carte del Croupier per ogni Guardia Allertata");
    });
    let ev = `Colpo: Ingresso ${acc} (${guardieA} Guardie)`;
    for (const l of s.ladri) {
      if (!s.colpo.guardie || !s.mazzetto.length || !l.mano.length || !prob(0.4)) continue;
      const mz = s.mazzetto.length;
      const m = l.mano.length;
      passo({ type: "diversivo", ladro: l.id }, (a, b) => {
        ok(L(l.id).mano.length === m - 1, "Diversivo: il Ladro perde 1 Carta");
        ok(b.mazzetto.length === Math.max(0, mz - b.colpo.guardie), "Diversivo: tolte tante Carte quante le Guardie Allertate");
      });
      ev += `, Diversivo`;
    }
    const intel = s.ladri.some((l) => l.classe === "intellettuale");
    const scassi = ["nessuno"];
    if (acq("combinazione")) scassi.push("professionale");
    const tec = acq("attrezzi") && trova("trisFigure", mani());
    if (tec) scassi.push("tecnico");
    const bru = trova("pokerFigure", mani()) ?? (intel ? trova("doppiaCoppia", mani()) : null);
    if (bru) scassi.push("brutale");
    if (!acq("combinazione")) rifiuta({ type: "scasso", tipo: "professionale" }, "Scasso Professionale solo con la Combinazione");
    const sc = scassi.length > 1 && prob(0.85) ? pick(scassi.filter((x) => x !== "nessuno")) : "nessuno";
    const g0 = s.colpo.guardie;
    const mz0 = s.mazzetto.length;
    const guardieS = sc === "professionale" ? 0 : sc === "tecnico" ? (intel ? Math.floor(nR() / 2) : nR()) : n;
    passo({ type: "scasso", tipo: sc, carte: sc === "tecnico" ? tec : sc === "brutale" ? bru : [] }, (a, b) => {
      ok(b.colpo.guardie - g0 === guardieS, `Guardie dello Scasso ${sc}${intel ? " (Eureka)" : ""}`, `${b.colpo.guardie - g0} invece di ${guardieS}`);
      ok(b.mazzetto.length - mz0 === 3 * guardieS, "Scasso: 3 Carte per Guardia");
      ok(b.bottinoFinale === (sc !== "nessuno"), "Bottino Finale solo se lo Scasso riesce");
    });
    eventi.push(`${ev}; Scasso ${sc}`);

    // --- Grande Fuga ---
    const mec = s.ladri.filter((l) => l.classe === "meccanico").map((l) => [l.id, l.mano.length]);
    const mzF = s.mazzetto.length;
    passo({ type: "faseFuga" }, (a, b) => {
      for (const [id, m] of mec) ok(L(id).mano.length === m + 1 || b.fase === "epilogo", "Meccanico: 1 Carta all'inizio della Fuga");
      const dopo = mzF + n - (acq("auto") ? Math.min(n, mzF + n) : 0);
      if (b.confronto || b.esito?.tipo !== "arrestati") ok(b.mazzetto.length === dopo || b.fase === "epilogo", "Fuga: +1 Carta per Ladro al Mazzetto (meno con l'Auto da corsa)", `${b.mazzetto.length} invece di ${dopo}`);
      if (b.fase === "epilogo" && b.esito.tipo !== "arrestati") ok(dopo < 2, "fuga senza Confronto solo con meno di 2 Carte nel Mazzetto");
      if (b.esito?.tipo === "arrestati") ok(tot(b) < 2, "arresto immediato solo con meno di 2 Carte nella Banda");
    });
    if (s.confronto) {
      for (const l of [...s.ladri]) {
        if (s.confronto?.step !== "flop") break;
        if (prob(0.15)) {
          const t = tot();
          passo({ type: "decidi", ladro: l.id, scelta: "ritira" }, (a, b) => ok(L(l.id).pentito && tot(b) === Math.max(0, t - 1), "Pentito: la Banda scarta 1 Carta a caso"));
        } else passo({ type: "decidi", ladro: l.id, scelta: "continua" });
      }
      if (s.confronto?.step === "river") {
        ok(s.confronto.tavolo.length === 5, "Fuga: 4ª e 5ª Carta insieme");
        const mano = mani();
        let best = null;
        for (const due of comb(mano.slice(0, 14), 2)) {
          const p = miglior([...due, ...s.confronto.tavolo]);
          if (!best || cmp(p, best.p) > 0) best = { due, p };
        }
        passo({ type: "gioca", carte: best.due });
        const mz = s.mazzetto;
        let bc = null;
        for (const due of comb(mz.slice(0, 16), 2)) {
          const p = miglior([...due, ...s.confronto.tavolo]);
          if (!bc || cmp(p, bc.p) > 0) bc = { due, p };
        }
        const tav = s.confronto.tavolo;
        const dLadri = miglior([...best.due, ...tav]);
        passo({ type: "croupierGioca", carte: bc ? bc.due : mz.slice(0, 2) }, (a, b) => {
          const d = cmp(dLadri, miglior([...(bc ? bc.due : mz.slice(0, 2)), ...tav]));
          const vinto = b.fase === "epilogo";
          if (!(d === 0 && s.opzioni.semi)) ok(vinto === d > 0, "esito della Fuga");
        });
        if (s.confronto?.esito === "fallimento") {
          if (s.opzioni.allIn && s.confronto.attivi.length && prob(0.6)) {
            const pent = s.ladri.filter((l) => l.pentito).length;
            const mzA = s.mazzetto.length;
            passo({ type: "allIn" }, (a, b) => {
              ok(b.confronto.tavolo.length === 5 && b.mazzetto.length === mzA + 2 * pent && b.bottinoFinale === false, "All-in: 5 nuove Carte, 2 Carte per Pentito, si perde il Bottino");
            });
            passo({ type: "croupierGioca", carte: s.mazzetto.slice(0, 2) });
            if (s.confronto) passo({ type: "accetta" }, (a, b) => ok(b.esito.tipo === "penaDura", "All-in fallito: pena dura"));
            else ok(s.esito.tipo === "fuggitiManiVuote", "All-in riuscito: liberi a mani vuote");
          } else {
            if (!s.opzioni.allIn) rifiuta({ type: "allIn" }, "All-in disattivato dalle opzioni");
            passo({ type: "accetta" }, (a, b) => ok(b.esito.tipo === "arrestati", "Fuga fallita: arrestati"));
          }
        }
      }
    }
    ok(s.fase === "epilogo" && !!s.esito, "la partita arriva all'Epilogo");
    rifiuta({ type: "faseFixer" }, "a partita finita non si gioca più");
    eventi.push(`Epilogo: ${s.esito?.tipo}${s.ladri.some((l) => l.pentito) ? ` (pentiti ${s.ladri.filter((l) => l.pentito).length})` : ""}`);
    log(eventi);
    return { seed, eventi, problemi, regole: Object.fromEntries(regole), stato: s, mosse };
  };
}
