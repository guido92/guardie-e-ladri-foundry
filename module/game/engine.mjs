/**
 * Macchina a stati pura di Guardie & Ladri.
 *   apply(state, action) -> { state, effects }
 * Lo stato è JSON e non viene mutato (si lavora su una copia). Gli effetti sono messaggi
 * per la chat che esegue chi chiama. La casualità viene da un seme nello stato.
 * I permessi (chi può mandare quale azione) li controlla il collante con Foundry.
 */
import {
  mazzo,
  mescola,
  rnd,
  isJolly,
  parse,
  etichetta,
  migliorMano,
  confronta,
  formaCombinazione,
  COMBINAZIONI,
} from "../core/carte.mjs";
import {
  CLASSI,
  GRADI,
  LISTINO,
  ACCESSI,
  SCASSI,
  costoAccesso,
  guardieAccesso,
  costoScasso,
  guardieScasso,
  CARTE_PER_GUARDIA,
} from "../core/regole.mjs";

export class EngineError extends Error {}
const fail = (msg) => {
  throw new EngineError(msg);
};

const JOLLY = ["j:1", "j:2", "j:3", "j:4"];

/** Gruppo di fase per il limite di 1 Jolly di interpretazione per fase. */
export function gruppoFase(fase) {
  return fase === "colpo" ? 2 : fase === "fuga" ? 3 : 1;
}

// ---------------------------------------------------------------------------
// Nuova partita

/**
 * @param {object} config
 * @param {{id:string,nome:string,classe:string,ricercato?:boolean,userId?:string}[]} config.ladri
 * @param {number} [config.seed]
 * @param {{semi?:boolean, fixerElimina?:boolean, allIn?:boolean}} [config.opzioni]
 */
export function newGame(config = {}) {
  const ladri = config.ladri ?? [];
  if (ladri.length < 1 || ladri.length > 4) fail("La Banda deve avere da 1 a 4 Ladri (3-5 giocatori col Croupier).");
  const ids = new Set();
  for (const l of ladri) {
    if (!l.id) fail("Ogni Ladro deve avere un id.");
    if (ids.has(l.id)) fail("Lo stesso Ladro non può sedere due volte.");
    ids.add(l.id);
    if (!CLASSI[l.classe]) fail(`Classe sconosciuta: ${l.classe}`);
  }
  let seed = Number.isFinite(config.seed) ? config.seed >>> 0 : (Math.random() * 2 ** 32) >>> 0;
  let b, c;
  [b, seed] = mescola(mazzo("b"), seed);
  [c, seed] = mescola(mazzo("c"), seed);
  const state = {
    versione: 1,
    rng: seed,
    opzioni: { semi: false, fixerElimina: false, allIn: true, ...(config.opzioni ?? {}) },
    fase: "setup",
    mazzi: { b: { pesca: b, scarti: [] }, c: { pesca: c, scarti: [] } },
    jolly: [...JOLLY],
    eliminate: [],
    ladri: ladri.map((l) => ({
      id: l.id,
      nome: String(l.nome ?? "Ladro"),
      classe: l.classe,
      userId: l.userId ?? null,
      ricercato: !!l.ricercato,
      mano: [],
      lavoretto: false,
      pentito: false,
      mostra: false,
      jollyFasi: [],
      coppiaPronta: l.classe !== "gangster",
    })),
    acquisti: [],
    confronto: null,
    bottino: null,
    colpo: { accesso: null, scasso: null, diversivo: [], guardie: 0 },
    mazzetto: [],
    bottinoFinale: null,
    esito: null,
    storico: [],
  };
  return { state, effects: [{ tipo: "inizio", testo: `Nuova partita: la Banda è formata da ${state.ladri.map((l) => l.nome).join(", ")}.` }] };
}

// ---------------------------------------------------------------------------
// Utilità sullo stato (lavorano sulla copia)

function ladro(s, id) {
  return s.ladri.find((l) => l.id === id) ?? fail("Ladro sconosciuto.");
}

function random(s) {
  const [x, n] = rnd(s.rng);
  s.rng = n;
  return x;
}

function mescolaMazzo(s, m) {
  [s.mazzi[m].pesca, s.rng] = mescola(s.mazzi[m].pesca, s.rng);
}

/** Pesca n carte dal mazzo m ("b" o "c"); se finisce, rimescola gli scarti. */
function pesca(s, m, n, effects) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!s.mazzi[m].pesca.length) {
      if (!s.mazzi[m].scarti.length) break;
      s.mazzi[m].pesca = s.mazzi[m].scarti;
      s.mazzi[m].scarti = [];
      mescolaMazzo(s, m);
      effects?.push({ tipo: "info", testo: `Il ${m === "b" ? "Mazzo della Banda" : "Mazzo del Croupier"} è finito: si rimescolano gli scarti.` });
    }
    out.push(s.mazzi[m].pesca.shift());
  }
  return out;
}

/** Scarta le carte accanto al loro mazzo; i Jolly tornano al Croupier. */
function scarta(s, ids) {
  for (const id of ids) {
    if (isJolly(id)) s.jolly.push(id);
    else s.mazzi[parse(id).mazzo].scarti.push(id);
  }
}

/** Rimette le carte nel loro mazzo di pesca (poi va rimescolato). */
function rimetti(s, ids) {
  for (const id of ids) {
    if (isJolly(id)) s.jolly.push(id);
    else s.mazzi[parse(id).mazzo].pesca.push(id);
  }
}

function proprietario(s, id) {
  return s.ladri.find((l) => l.mano.includes(id));
}

/** Toglie le carte dalle mani dei Ladri (tutte devono esserci). */
function togliDalleMani(s, ids, soloDi) {
  if (new Set(ids).size !== ids.length) fail("Hai indicato due volte la stessa Carta.");
  for (const id of ids) {
    const l = proprietario(s, id);
    if (!l) fail(`La Carta ${etichetta(id)} non è nella mano della Banda.`);
    if (soloDi && l.id !== soloDi) fail(`La Carta ${etichetta(id)} non è nella tua mano.`);
  }
  for (const id of ids) {
    const l = proprietario(s, id);
    l.mano = l.mano.filter((c) => c !== id);
  }
}

function elenco(ids) {
  return ids.map(etichetta).join(", ");
}

function totaleCarte(s, filtro = () => true) {
  return s.ladri.filter(filtro).reduce((n, l) => n + l.mano.length, 0);
}

function nRicercati(s) {
  return s.ladri.filter((l) => l.ricercato).length;
}

function haClasse(s, classe, filtro = (l) => !l.pentito) {
  return s.ladri.some((l) => l.classe === classe && filtro(l));
}

/** Paga una combinazione con carte dalle mani della Banda. */
function paga(s, tipi, carte, cosa) {
  if (!tipi.length) {
    if (carte?.length) fail(`${cosa} non costa Carte.`);
    return [];
  }
  if (!carte?.length) fail(`${cosa} costa ${tipi.map((t) => COMBINAZIONI[t].nome).join(" o ")}.`);
  if (!formaCombinazione(tipi, carte))
    fail(`Le Carte ${elenco(carte)} non formano ${tipi.map((t) => COMBINAZIONI[t].nome).join(" o ")}.`);
  togliDalleMani(s, carte);
  return carte;
}

// ---------------------------------------------------------------------------
// Il Confronto (Lavoretti e Grande Fuga)

function nuovoConfronto(s, tipo, extra, effects) {
  const tavolo = pesca(s, "b", 3, effects);
  s.confronto = {
    tipo,
    round: 1,
    step: "flop",
    tavolo,
    decisioni: {},
    giocate: {},
    croupierMano: [],
    croupierGioca: null,
    scoperte: false,
    esito: null,
    manoLadri: null,
    manoCroupier: null,
    ladyUsata: false,
    voti: {},
    ...extra,
  };
  effects.push({ tipo: "tavolo", testo: `Il Croupier rivela 3 Carte: ${elenco(tavolo)}.`, carte: tavolo });
}

/** Quante carte deve giocare ciascun Ladro nel Lavoretto. */
export function carteDaGiocare(s, id) {
  const cf = s.confronto;
  if (!cf || cf.tipo !== "lavoretto") return 0;
  const l = s.ladri.find((x) => x.id === id);
  return cf.attivi.length === 1 ? Math.min(2, l?.mano.length ?? 0) : 1;
}

function carteGiocate(cf) {
  return Object.values(cf.giocate).flat();
}

function avanzaLavoretto(s, effects) {
  const cf = s.confronto;
  const g = GRADI[cf.grado];
  if (cf.round === 1) {
    if (cf.step === "flop") {
      const [c4] = pesca(s, "b", 1, effects);
      cf.tavolo.push(c4);
      cf.step = "turn";
      cf.decisioni = {};
      effects.push({ tipo: "tavolo", testo: `Il Croupier rivela la 4ª Carta: ${etichetta(c4)}.`, carte: cf.tavolo });
    } else if (cf.step === "turn") {
      const [c5] = pesca(s, "b", 1, effects);
      cf.tavolo.push(c5);
      cf.step = "river";
      cf.decisioni = {};
      cf.croupierMano = pesca(s, "c", g.croupier, effects);
      effects.push({
        tipo: "tavolo",
        testo: `Il Croupier rivela la 5ª Carta: ${etichetta(c5)}. Non è più possibile ritirarsi. Il Croupier pesca ${g.croupier} Carte dal suo Mazzo.`,
        carte: cf.tavolo,
      });
    }
  } else if (cf.step === "flop") {
    // Rilancio: niente ritiro dopo la decisione, si girano 4ª e 5ª insieme
    const due = pesca(s, "b", 2, effects);
    cf.tavolo.push(...due);
    cf.step = "river";
    cf.decisioni = {};
    effects.push({ tipo: "tavolo", testo: `Il Croupier rivela la 4ª e la 5ª Carta: ${elenco(due)}.`, carte: cf.tavolo });
  }
}

function avanzaFuga(s, effects) {
  const cf = s.confronto;
  if (cf.step !== "flop") return;
  const due = pesca(s, "b", 2, effects);
  cf.tavolo.push(...due);
  cf.step = "river";
  cf.decisioni = {};
  effects.push({ tipo: "tavolo", testo: `Il Croupier rivela la 4ª e la 5ª Carta: ${elenco(due)}. Non è più possibile ritirarsi.`, carte: cf.tavolo });
  if (totaleCarte(s) < 2) {
    effects.push({ tipo: "info", testo: "Alla Banda restano meno di 2 Carte: non può giocare il Confronto." });
    chiudiFuga(s, "arrestati", effects);
  }
}

/** Tutti i Ladri attivi hanno deciso? Allora si va avanti. */
function controllaDecisioni(s, effects) {
  const cf = s.confronto;
  if (!cf.attivi.every((id) => cf.decisioni[id])) return;
  if (cf.tipo === "lavoretto" && cf.round === 2) {
    // durante il Rilancio ci si ritira solo se tutti sono d'accordo
    if (cf.attivi.every((id) => cf.decisioni[id] === "ritira")) {
      for (const id of cf.attivi) ladro(s, id).mano.push(...(cf.giocate[id] ?? []));
      cf.giocate = {};
      effects.push({ tipo: "info", testo: "La Banda si ritira dal Rilancio: tiene le Carte giocate ma rinuncia al Bottino." });
      return chiudiLavoretto(s, effects, "ritirati");
    }
    if (cf.attivi.some((id) => cf.decisioni[id] === "ritira"))
      effects.push({ tipo: "info", testo: "Non tutti vogliono ritirarsi: il Rilancio continua." });
    return avanzaLavoretto(s, effects);
  }
  if (!cf.attivi.length) {
    if (cf.tipo === "lavoretto") return chiudiLavoretto(s, effects, "ritirati");
    return chiudiFuga(s, "pentiti", effects);
  }
  if (cf.tipo === "lavoretto") avanzaLavoretto(s, effects);
  else avanzaFuga(s, effects);
}

function pronti(s) {
  const cf = s.confronto;
  const ladriPronti = cf.tipo === "fuga" ? !!cf.giocate.banda : cf.attivi.every((id) => cf.giocate[id]?.length);
  return ladriPronti && !!cf.croupierGioca;
}

function risolvi(s, effects) {
  const cf = s.confronto;
  const giocate = carteGiocate(cf);
  cf.manoLadri = migliorMano([...giocate, ...cf.tavolo]);
  cf.manoCroupier = migliorMano([...cf.croupierGioca, ...cf.tavolo]);
  const d = confronta(cf.manoLadri, cf.manoCroupier, { semi: s.opzioni.semi });
  cf.esito = d > 0 ? "successo" : "fallimento";
  cf.step = "esito";
  cf.scoperte = true;
  cf.voti = {};
  effects.push({
    tipo: "esito",
    esito: cf.esito,
    testo:
      `Carte dei Ladri: ${elenco(giocate)} → ${cf.manoLadri.nome}. Carte del Croupier: ${elenco(cf.croupierGioca)} → ${cf.manoCroupier.nome}. ` +
      (cf.esito === "successo" ? "SUCCESSO!" : d === 0 ? "Parità: vince il Croupier. FALLIMENTO." : "FALLIMENTO."),
    ladri: giocate,
    croupier: cf.croupierGioca,
    tavolo: cf.tavolo,
  });
  // dopo un Rilancio riuscito non c'è altro da decidere: Bottino + Bonus
  if (cf.esito === "successo" && cf.tipo === "lavoretto" && cf.round === 2) incassa(s, effects);
  if (cf.esito === "successo" && cf.tipo === "fuga") chiudiFuga(s, cf.round === "allin" ? "fuggitiManiVuote" : s.bottinoFinale ? "fuggiti" : "fuggitiManiVuote", effects);
}

function chiudiLavoretto(s, effects, esito) {
  const cf = s.confronto;
  scarta(s, cf.tavolo);
  scarta(s, carteGiocate(cf));
  scarta(s, cf.croupierGioca ?? []);
  scarta(s, cf.croupierMano ?? []);
  for (const id of cf.partecipanti) ladro(s, id).lavoretto = true;
  s.storico.push({ grado: cf.grado, partecipanti: cf.partecipanti, esito, rilancio: cf.round === 2 });
  s.confronto = null;
  effects.push({ tipo: "fine-lavoretto", testo: `Il Lavoretto ${GRADI[cf.grado].nome} è concluso (${esito}).` });
}

function chiudiFuga(s, esito, effects) {
  const cf = s.confronto;
  if (cf) {
    scarta(s, cf.tavolo);
    scarta(s, carteGiocate(cf));
    scarta(s, cf.croupierGioca ?? []);
  }
  s.confronto = null;
  s.fase = "epilogo";
  const testi = {
    fuggiti: "La Banda semina le Guardie e si gode il Bottino!",
    fuggitiManiVuote: "La Banda la fa franca, ma a mani vuote.",
    arrestati: "I Ladri vengono arrestati e gettati in gattabuia!",
    penaDura: "All-in fallito: la pena sarà dura!",
    pentiti: "Tutti i Ladri si sono ritirati: arrestati, ma con uno sconto di pena per aver collaborato.",
  };
  s.esito = { tipo: esito, testo: testi[esito], pentiti: s.ladri.filter((l) => l.pentito).map((l) => l.id) };
  effects.push({ tipo: "epilogo", esito, testo: testi[esito] });
}

/** Il Lavoretto ha avuto successo: si incassa il Bottino (con Bonus se era un Rilancio). */
function incassa(s, effects) {
  const cf = s.confronto;
  const g = GRADI[cf.grado];
  scarta(s, carteGiocate(cf));
  cf.giocate = {};
  const parti = [g.bottino];
  if (cf.round === 2) parti.push(g.bonus);
  const daPescare = parti.filter((p) => !p.scelta).reduce((n, p) => n + p.n, 0);
  const daScegliere = parti.filter((p) => p.scelta).reduce((n, p) => n + p.n, 0);
  const carte = pesca(s, "b", daPescare, effects);
  s.bottino = { carte, daScegliere, partecipanti: [...cf.attivi] };
  cf.step = "bottino";
  effects.push({
    tipo: "bottino",
    testo:
      daScegliere > 0
        ? `Bottino: ${daScegliere} Carte a scelta dal Mazzo della Banda.`
        : `Bottino: ${carte.length} Carte pescate dal Mazzo della Banda.`,
  });
  if (!daScegliere) dividiSeSolo(s, effects);
}

function dividiSeSolo(s, effects) {
  const b = s.bottino;
  if (b.partecipanti.length === 1 && b.carte.length) {
    const l = ladro(s, b.partecipanti[0]);
    l.mano.push(...b.carte);
    effects.push({ tipo: "info", testo: `${l.nome} si tiene il Bottino.` });
    b.carte = [];
  }
  if (!b.carte.length && !b.daScegliere) {
    s.bottino = null;
    chiudiLavoretto(s, effects, s.confronto.round === 2 ? "successo con rilancio" : "successo");
  }
}

function allerta(s, n, effects, perche) {
  if (n <= 0) {
    effects.push({ tipo: "guardie", testo: `${perche}: nessuna Guardia Allertata.` });
    return;
  }
  s.colpo.guardie += n;
  const carte = pesca(s, "c", n * CARTE_PER_GUARDIA, effects);
  s.mazzetto.push(...carte);
  effects.push({
    tipo: "guardie",
    testo: `${perche}: ${n} Guardi${n === 1 ? "a Allertata" : "e Allertate"}. Il Croupier aggiunge ${carte.length} Carte al Mazzetto delle Guardie (${s.mazzetto.length}).`,
  });
}

function scartaACaso(s, lista, n) {
  const via = [];
  for (let i = 0; i < n && lista.length; i++) {
    const k = Math.floor(random(s) * lista.length);
    via.push(lista.splice(k, 1)[0]);
  }
  return via;
}

// ---------------------------------------------------------------------------
// Azioni

const AZIONI = {
  // --- Preparazione -----------------------------------------------------------
  coppiaGangster(s, a, effects) {
    if (s.fase !== "setup") fail("La Coppia del Gangster si sceglie all'inizio della partita.");
    const l = ladro(s, a.ladro);
    if (l.classe !== "gangster") fail("Solo il Gangster ha l'Asso nella manica.");
    if (l.coppiaPronta) fail("Il Gangster ha già scelto la sua Coppia.");
    if (!/^[2-9T]$/.test(a.valore ?? "")) fail("La Coppia dev'essere di numeri, dal 2 al 10.");
    const semi = a.semi ?? [];
    if (semi.length !== 2 || semi[0] === semi[1] || !semi.every((x) => "CQFP".includes(x) && x.length === 1))
      fail("Scegli due semi diversi.");
    const carte = semi.map((x) => `b:${a.valore}${x}`);
    for (const c of carte) if (!s.mazzi.b.pesca.includes(c)) fail(`${etichetta(c)} non è più nel Mazzo della Banda.`);
    s.mazzi.b.pesca = s.mazzi.b.pesca.filter((c) => !carte.includes(c));
    mescolaMazzo(s, "b");
    l.mano.push(...carte);
    l.coppiaPronta = true;
    effects.push({ tipo: "info", testo: `${l.nome} (Gangster) tiene un Asso nella manica: una Coppia scelta dal Mazzo della Banda.` });
  },

  distribuisci(s, a, effects) {
    if (s.fase !== "setup") fail("Le Carte sono già state distribuite.");
    const manca = s.ladri.find((l) => !l.coppiaPronta);
    if (manca) fail(`${manca.nome} (Gangster) deve ancora scegliere la sua Coppia.`);
    const tre = s.ladri.length === 2;
    for (const l of s.ladri) {
      const n = 2 + (l.ricercato ? 1 : 0);
      l.mano.push(...pesca(s, "b", n, effects));
      if (tre && s.jolly.length) l.mano.push(s.jolly.shift());
    }
    s.fase = "lavoretti";
    effects.push({
      tipo: "fase",
      testo:
        `Fase 1 - La Preparazione. Ogni Ladro pesca 2 Carte dal Mazzo della Banda` +
        (nRicercati(s) ? " (i Ricercati una in più)" : "") +
        (tre ? "; in 3 giocatori ciascun Ladro riceve anche 1 Jolly" : "") +
        ". Ora i Lavoretti!",
    });
  },

  mostra(s, a) {
    ladro(s, a.ladro).mostra = !!a.mostra;
  },

  // --- Lavoretti --------------------------------------------------------------
  lavorettoInizia(s, a, effects) {
    if (s.fase !== "lavoretti") fail("I Lavoretti si fanno nella Fase 1, prima del Fixer.");
    if (s.confronto || s.bottino) fail("C'è già un Confronto in corso.");
    if (!GRADI[a.grado]) fail("Grado di Rischio sconosciuto.");
    const p = [...new Set(a.partecipanti ?? [])];
    if (p.length < 1 || p.length > 2) fail("Un Lavoretto si fa da soli o in coppia.");
    for (const id of p) {
      const l = ladro(s, id);
      if (l.lavoretto) fail(`${l.nome} ha già fatto il suo Lavoretto.`);
    }
    if (p.length === 1 && ladro(s, p[0]).mano.length < 2) fail("Da soli servono almeno 2 Carte in mano.");
    if (p.length === 2 && p.some((id) => !ladro(s, id).mano.length)) fail("In coppia serve almeno 1 Carta a testa.");
    effects.push({
      tipo: "lavoretto",
      testo: `Lavoretto ${GRADI[a.grado].nome}${a.descrizione ? ` (${a.descrizione})` : ""}: ${p.map((id) => ladro(s, id).nome).join(" e ")}.`,
    });
    nuovoConfronto(s, "lavoretto", { grado: a.grado, partecipanti: p, attivi: [...p], descrizione: a.descrizione ?? "" }, effects);
  },

  decidi(s, a, effects) {
    const cf = s.confronto ?? fail("Nessun Confronto in corso.");
    const ritiroAperto = cf.tipo === "lavoretto" ? (cf.round === 1 ? ["flop", "turn"] : ["flop"]) : ["flop"];
    if (!ritiroAperto.includes(cf.step)) fail("Non è più possibile ritirarsi.");
    if (!cf.attivi.includes(a.ladro)) fail("Questo Ladro non partecipa al Confronto.");
    if (cf.decisioni[a.ladro]) fail("Hai già deciso.");
    if (a.scelta !== "continua" && a.scelta !== "ritira") fail("Scegli se continuare o ritirarti.");
    const l = ladro(s, a.ladro);
    cf.decisioni[a.ladro] = a.scelta;
    if (a.scelta === "ritira") {
      if (cf.tipo === "lavoretto" && cf.round === 1) {
        if (cf.step === "turn") {
          if (!a.carta || !l.mano.includes(a.carta)) fail("Ritirandoti adesso perdi una Carta a tua scelta: indicala.");
          togliDalleMani(s, [a.carta], l.id);
          scarta(s, [a.carta]);
          effects.push({ tipo: "info", testo: `${l.nome} si ritira e perde una Carta (${etichetta(a.carta)}).` });
        } else {
          effects.push({ tipo: "info", testo: `${l.nome} si ritira senza perdere nulla.` });
        }
        cf.attivi = cf.attivi.filter((id) => id !== l.id);
        delete cf.decisioni[l.id];
      } else if (cf.tipo === "fuga") {
        l.pentito = true;
        cf.attivi = cf.attivi.filter((id) => id !== l.id);
        delete cf.decisioni[l.id];
        const tutte = s.ladri.flatMap((x) => x.mano);
        const [via] = scartaACaso(s, tutte, 1);
        if (via) {
          togliDalleMani(s, [via]);
          scarta(s, [via]);
        }
        effects.push({
          tipo: "info",
          testo: `${l.nome} si pente e si consegna alle Guardie (sconto di pena).${via ? ` La Banda scarta a caso ${etichetta(via)}.` : ""}`,
        });
      }
    }
    controllaDecisioni(s, effects);
  },

  /** Il GM forza il passo successivo: chi non ha deciso continua. */
  avanza(s, a, effects) {
    const cf = s.confronto ?? fail("Nessun Confronto in corso.");
    if (cf.tipo === "lavoretto" && cf.step === "esito" && cf.esito === "successo") {
      // chi non ha votato incassa
      const manca = cf.attivi.filter((id) => !cf.voti[id]);
      if (!manca.length) fail("Hanno già votato tutti.");
      for (const id of manca.slice(0, -1)) cf.voti[id] = "incassa";
      return AZIONI.vota(s, { ladro: manca.at(-1), scelta: "incassa" }, effects);
    }
    if (cf.step !== "flop" && cf.step !== "turn") fail("Non c'è niente da far avanzare.");
    for (const id of cf.attivi) cf.decisioni[id] ??= "continua";
    controllaDecisioni(s, effects);
  },

  gioca(s, a, effects) {
    const cf = s.confronto ?? fail("Nessun Confronto in corso.");
    if (cf.step !== "river") fail("Le Carte si giocano dopo la 5ª Carta.");
    const carte = a.carte ?? [];
    if (cf.tipo === "fuga") {
      if (cf.giocate.banda) fail("La Banda ha già scelto le sue 2 Carte.");
      if (carte.length !== 2) fail("La Banda gioca 2 Carte.");
      togliDalleMani(s, carte);
      cf.giocate.banda = carte;
      effects.push({ tipo: "info", testo: "La Banda posa 2 Carte coperte sul tavolo." });
    } else {
      if (cf.round !== 1) fail("Durante il Rilancio le Carte restano quelle già giocate.");
      if (!cf.attivi.includes(a.ladro)) fail("Questo Ladro non partecipa al Confronto.");
      if (cf.giocate[a.ladro]) fail("Hai già giocato.");
      const n = carteDaGiocare(s, a.ladro);
      if (carte.length !== n) fail(`Devi giocare ${n} Cart${n === 1 ? "a" : "e"}.`);
      togliDalleMani(s, carte, a.ladro);
      cf.giocate[a.ladro] = carte;
      effects.push({ tipo: "info", testo: `${ladro(s, a.ladro).nome} posa ${n === 1 ? "una Carta coperta" : `${n} Carte coperte`}.` });
    }
    if (pronti(s)) risolvi(s, effects);
  },

  croupierGioca(s, a, effects) {
    const cf = s.confronto ?? fail("Nessun Confronto in corso.");
    if (cf.step !== "river") fail("Il Croupier gioca dopo la 5ª Carta.");
    if (cf.croupierGioca) fail("Il Croupier ha già giocato.");
    const mano = cf.tipo === "fuga" ? s.mazzetto : cf.croupierMano;
    const carte = a.carte ?? [];
    const n = Math.min(2, mano.length);
    if (carte.length !== n || new Set(carte).size !== n || !carte.every((c) => mano.includes(c)))
      fail(`Il Croupier deve scegliere ${n} Carte dalla sua mano.`);
    if (cf.tipo === "fuga") s.mazzetto = s.mazzetto.filter((c) => !carte.includes(c));
    else cf.croupierMano = cf.croupierMano.filter((c) => !carte.includes(c));
    cf.croupierGioca = carte;
    effects.push({ tipo: "info", testo: "Il Croupier sceglie le sue 2 Carte." });
    if (pronti(s)) risolvi(s, effects);
  },

  baciamano(s, a, effects) {
    const cf = s.confronto ?? fail("Nessun Confronto in corso.");
    if (cf.step !== "esito" || cf.esito !== "fallimento") fail("Il baciamano si usa in caso di Fallimento.");
    if (cf.ladyUsata) fail("Il baciamano è già stato usato in questo Confronto.");
    const l = ladro(s, a.ladro);
    if (l.classe !== "lady") fail("Solo la Lady conosce il baciamano.");
    if (!cf.attivi.includes(l.id)) fail("La Lady deve partecipare al Confronto.");
    const chiave = Object.keys(cf.giocate).find((k) => cf.giocate[k].includes(a.giocata));
    if (!chiave) fail("Scegli una delle Carte rivelate dalla Banda.");
    const da = cf.tipo === "fuga" ? proprietario(s, a.mano) : l.mano.includes(a.mano) ? l : null;
    if (!da) fail(cf.tipo === "fuga" ? "Scegli una Carta dalla mano della Banda." : "Scegli una Carta dalla tua mano.");
    da.mano = da.mano.map((c) => (c === a.mano ? a.giocata : c));
    cf.giocate[chiave] = cf.giocate[chiave].map((c) => (c === a.giocata ? a.mano : c));
    cf.ladyUsata = true;
    effects.push({ tipo: "info", testo: `${l.nome} usa il baciamano: scambia ${etichetta(a.giocata)} con ${etichetta(a.mano)}.` });
    risolvi(s, effects);
  },

  /** Dopo un Fallimento si accettano le conseguenze. */
  accetta(s, a, effects) {
    const cf = s.confronto ?? fail("Nessun Confronto in corso.");
    if (cf.step !== "esito" || cf.esito !== "fallimento") fail("Non c'è un Fallimento da accettare.");
    if (cf.tipo === "fuga") return chiudiFuga(s, cf.round === "allin" ? "penaDura" : "arrestati", effects);
    effects.push({
      tipo: "info",
      testo: cf.round === 2 ? "Fallimento nel Rilancio: i Ladri perdono il Bottino e le Carte giocate." : "Fallimento: i Ladri perdono le Carte giocate.",
    });
    chiudiLavoretto(s, effects, "fallimento");
  },

  vota(s, a, effects) {
    const cf = s.confronto ?? fail("Nessun Confronto in corso.");
    if (cf.tipo !== "lavoretto" || cf.step !== "esito" || cf.esito !== "successo") fail("Non c'è un Successo da incassare.");
    if (!cf.attivi.includes(a.ladro)) fail("Questo Ladro non partecipa al Lavoretto.");
    if (a.scelta !== "incassa" && a.scelta !== "rilancia") fail("Scegli se incassare o rilanciare.");
    if (cf.round === 2 && a.scelta === "rilancia") fail("Si può rilanciare una volta sola.");
    cf.voti[a.ladro] = a.scelta;
    if (!cf.attivi.every((id) => cf.voti[id])) {
      effects.push({ tipo: "info", testo: `${ladro(s, a.ladro).nome} vota: ${a.scelta === "incassa" ? "incassare" : "rilanciare"}.` });
      return;
    }
    if (cf.attivi.every((id) => cf.voti[id] === "rilancia")) {
      // Rilancio: le Carte giocate restano scoperte a terra, il tavolo torna nel Mazzo
      const g = GRADI[cf.grado];
      rimetti(s, cf.tavolo);
      mescolaMazzo(s, "b");
      rimetti(s, cf.croupierGioca);
      mescolaMazzo(s, "c");
      cf.croupierGioca = null;
      cf.croupierMano.push(...pesca(s, "c", Math.max(0, g.croupier - cf.croupierMano.length), effects));
      cf.round = 2;
      cf.esito = null;
      cf.manoLadri = cf.manoCroupier = null;
      cf.ladyUsata = false;
      cf.voti = {};
      cf.decisioni = {};
      cf.step = "flop";
      cf.tavolo = pesca(s, "b", 3, effects);
      effects.push({
        tipo: "tavolo",
        testo: `RILANCIO! Le Carte dei Ladri restano scoperte. Il Croupier torna a ${g.croupier} Carte e rivela 3 nuove Carte: ${elenco(cf.tavolo)}.`,
        carte: cf.tavolo,
      });
    } else {
      incassa(s, effects);
    }
  },

  bottinoScegli(s, a, effects) {
    const b = s.bottino ?? fail("Non c'è un Bottino da scegliere.");
    if (!b.daScegliere) fail("Il Bottino non è a scelta.");
    if (!b.partecipanti.includes(a.ladro)) fail("Solo chi ha fatto il Lavoretto sceglie il Bottino.");
    const carte = a.carte ?? [];
    if (carte.length !== b.daScegliere || new Set(carte).size !== carte.length) fail(`Scegli ${b.daScegliere} Carte.`);
    for (const c of carte) if (!s.mazzi.b.pesca.includes(c)) fail(`${etichetta(c)} non è nel Mazzo della Banda.`);
    s.mazzi.b.pesca = s.mazzi.b.pesca.filter((c) => !carte.includes(c));
    mescolaMazzo(s, "b");
    b.carte.push(...carte);
    b.daScegliere = 0;
    effects.push({ tipo: "bottino", testo: `Bottino scelto: ${carte.length} Carte dal Mazzo della Banda, che viene rimescolato.` });
    dividiSeSolo(s, effects);
  },

  bottinoAssegna(s, a, effects) {
    const b = s.bottino ?? fail("Non c'è un Bottino da dividere.");
    if (b.daScegliere) fail("Prima scegliete le Carte del Bottino.");
    if (!b.carte.includes(a.carta)) fail("Quella Carta non è nel Bottino.");
    if (!b.partecipanti.includes(a.a)) fail("Il Bottino va a chi ha fatto il Lavoretto.");
    b.carte = b.carte.filter((c) => c !== a.carta);
    ladro(s, a.a).mano.push(a.carta);
    if (!b.carte.length) {
      effects.push({ tipo: "info", testo: "Il Bottino è stato diviso." });
      dividiSeSolo(s, effects);
    }
  },

  /** In caso di disaccordo: carte mescolate e distribuite una a testa (dal più anziano). */
  bottinoDividi(s, a, effects) {
    const b = s.bottino ?? fail("Non c'è un Bottino da dividere.");
    if (b.daScegliere) fail("Prima scegliete le Carte del Bottino.");
    let carte;
    [carte, s.rng] = mescola(b.carte, s.rng);
    const ordine = a.ordine?.length ? a.ordine.filter((id) => b.partecipanti.includes(id)) : b.partecipanti;
    carte.forEach((c, i) => ladro(s, ordine[i % ordine.length]).mano.push(c));
    b.carte = [];
    effects.push({ tipo: "info", testo: "Il Bottino viene mescolato a faccia in giù e distribuito una Carta a testa." });
    dividiSeSolo(s, effects);
  },

  /** Il GM annulla il Lavoretto in corso (le carte giocate tornano in mano). */
  annullaConfronto(s, a, effects) {
    const cf = s.confronto ?? fail("Nessun Confronto in corso.");
    if (cf.tipo !== "lavoretto") fail("Si possono annullare solo i Lavoretti.");
    for (const [id, carte] of Object.entries(cf.giocate)) ladro(s, id).mano.push(...carte);
    if (s.bottino) {
      scarta(s, s.bottino.carte);
      s.bottino = null;
    }
    rimetti(s, cf.tavolo);
    mescolaMazzo(s, "b");
    rimetti(s, [...(cf.croupierGioca ?? []), ...cf.croupierMano]);
    mescolaMazzo(s, "c");
    s.confronto = null;
    effects.push({ tipo: "info", testo: "Il Croupier annulla il Lavoretto." });
  },

  // --- Fixer ------------------------------------------------------------------
  faseFixer(s, a, effects) {
    if (s.fase !== "lavoretti") fail("Il Fixer si incontra alla fine della giornata di Lavoretti.");
    if (s.confronto || s.bottino) fail("Prima chiudete il Lavoretto in corso.");
    s.fase = "fixer";
    effects.push({ tipo: "fase", testo: "Al termine della giornata di malaffare la Banda incontra il Fixer." });
    if (totaleCarte(s) < 2) {
      const nuovi = s.ladri.filter((l) => !l.ricercato);
      for (const l of nuovi) {
        l.ricercato = true;
        l.mano.push(...pesca(s, "b", 1, effects));
      }
      effects.push({
        tipo: "info",
        testo: `La Banda ha meno di 2 Carte: tutti diventano Ricercati${nuovi.length ? ` (${nuovi.map((l) => l.nome).join(", ")} pescano 1 Carta)` : ""}.`,
      });
    }
  },

  compra(s, a, effects) {
    if (s.fase !== "fixer") fail("Si compra dal Fixer solo durante l'incontro.");
    const voce = LISTINO[a.oggetto] ?? fail("Il Fixer non ha questo articolo.");
    if (s.acquisti.includes(a.oggetto)) fail(`La Banda ha già ${voce.nome}.`);
    const carte = paga(s, a.gratis ? [] : voce.costo, a.gratis ? [] : a.carte, voce.nome);
    if (carte.length) {
      if (s.opzioni.fixerElimina) {
        for (const c of carte) (isJolly(c) ? s.jolly : s.eliminate).push(c);
      } else {
        rimetti(s, carte);
        mescolaMazzo(s, "b");
      }
    }
    s.acquisti.push(a.oggetto);
    effects.push({
      tipo: "acquisto",
      testo: `La Banda compra ${voce.nome}${carte.length ? ` pagando ${elenco(carte)}` : a.gratis ? " (il Fixer chiude un occhio)" : ""}.`,
    });
    if (voce.jolly) {
      const dest = s.ladri.find((l) => l.id === a.destinatario) ?? s.ladri[0];
      if (s.jolly.length) {
        dest.mano.push(s.jolly.shift());
        effects.push({ tipo: "jolly", testo: `${dest.nome} riceve 1 Jolly.` });
      } else effects.push({ tipo: "info", testo: "Non ci sono più Jolly da assegnare." });
    }
    if (a.oggetto === "documenti") {
      for (const l of s.ladri) l.ricercato = false;
      effects.push({ tipo: "info", testo: "Con i Documenti falsi nessuno è più Ricercato." });
    }
  },

  /** Il Croupier premia l'interpretazione con un Jolly (max 1 per Ladro per Fase). */
  daiJolly(s, a, effects) {
    const l = ladro(s, a.ladro);
    if (s.fase === "setup" || s.fase === "epilogo") fail("I Jolly si assegnano durante le Fasi di gioco.");
    const g = gruppoFase(s.fase);
    if (s.ladri.length === 2 && g === 1 && !a.forza) fail("In 3 giocatori i Jolly per l'interpretazione si ottengono solo nelle Fasi 2 e 3.");
    if (l.jollyFasi.includes(g) && !a.forza) fail(`${l.nome} ha già ricevuto un Jolly in questa Fase.`);
    if (!s.jolly.length) fail("Non ci sono più Jolly da assegnare.");
    l.mano.push(s.jolly.shift());
    l.jollyFasi.push(g);
    effects.push({ tipo: "jolly", testo: `Il Croupier premia ${l.nome} con un Jolly${a.motivo ? `: ${a.motivo}` : ""}.` });
  },

  // --- Grande Colpo -----------------------------------------------------------
  faseColpo(s, a, effects) {
    if (s.fase !== "fixer") fail("Il Grande Colpo viene dopo l'incontro col Fixer.");
    s.fase = "colpo";
    effects.push({ tipo: "fase", testo: "Fase 2 - Il Grande Colpo. Il Croupier descrive lo stabile dov'è custodito il Bottino Finale." });
  },

  accesso(s, a, effects) {
    if (s.fase !== "colpo") fail("L'Accesso fa parte del Grande Colpo.");
    if (s.colpo.accesso) fail("La Banda è già dentro.");
    const voce = ACCESSI[a.tipo] ?? fail("Tipo di ingresso sconosciuto.");
    if (voce.richiede && !s.acquisti.includes(voce.richiede)) fail(`${voce.nome} richiede la ${LISTINO[voce.richiede].nome}.`);
    const carte = paga(s, costoAccesso(a.tipo, s.acquisti), a.carte ?? [], voce.nome);
    scarta(s, carte);
    s.colpo.accesso = a.tipo;
    effects.push({ tipo: "colpo", testo: `${voce.nome}${carte.length ? ` (pagato con ${elenco(carte)})` : ""}.` });
    allerta(s, guardieAccesso(a.tipo, { nLadri: s.ladri.length, nRicercati: nRicercati(s), acquisti: s.acquisti }), effects, "Accesso");
  },

  diversivo(s, a, effects) {
    if (s.fase !== "colpo" || !s.colpo.accesso || s.colpo.scasso) fail("Il Diversivo si tenta dopo l'Accesso e prima dello Scasso.");
    if (!s.colpo.guardie || !s.mazzetto.length) fail("Non ci sono Guardie Allertate da distrarre.");
    const l = ladro(s, a.ladro);
    if (s.colpo.diversivo.includes(l.id)) fail(`${l.nome} ha già partecipato al Diversivo.`);
    if (!l.mano.length) fail(`${l.nome} non ha Carte da sacrificare.`);
    s.colpo.diversivo.push(l.id);
    const mano = [...l.mano];
    const [persa] = scartaACaso(s, mano, 1);
    togliDalleMani(s, [persa], l.id);
    scarta(s, [persa]);
    const via = scartaACaso(s, s.mazzetto, s.colpo.guardie);
    scarta(s, via);
    effects.push({
      tipo: "colpo",
      testo: `Diversivo di ${l.nome}${a.descrizione ? ` (${a.descrizione})` : ""}: il Croupier toglie a caso ${etichetta(persa)} dalla sua mano, ${l.nome} toglie ${via.length} Carte dal Mazzetto delle Guardie (ne restano ${s.mazzetto.length}).`,
    });
  },

  scasso(s, a, effects) {
    if (s.fase !== "colpo" || !s.colpo.accesso) fail("Lo Scasso viene dopo l'Accesso.");
    if (s.colpo.scasso) fail("Lo Scasso è già stato tentato.");
    const voce = SCASSI[a.tipo] ?? fail("Approccio sconosciuto.");
    if (voce.richiede && !s.acquisti.includes(voce.richiede)) fail(`L'approccio ${voce.nome} richiede ${LISTINO[voce.richiede].nome}.`);
    const intellettuale = haClasse(s, "intellettuale");
    const carte = a.tipo === "nessuno" ? [] : paga(s, costoScasso(a.tipo, { intellettuale }), a.carte ?? [], `Lo Scasso ${voce.nome}`);
    scarta(s, carte);
    s.colpo.scasso = a.tipo;
    s.bottinoFinale = a.tipo !== "nessuno";
    effects.push({
      tipo: "colpo",
      testo:
        a.tipo === "nessuno"
          ? "La Banda non riesce a forzare la cassaforte: si fugge a mani vuote!"
          : `Scasso ${voce.nome}${carte.length ? ` (pagato con ${elenco(carte)})` : ""}: il Bottino Finale è della Banda!`,
    });
    allerta(s, guardieScasso(a.tipo, { nLadri: s.ladri.length, nRicercati: nRicercati(s), intellettuale }), effects, "Scasso");
  },

  // --- Grande Fuga ------------------------------------------------------------
  faseFuga(s, a, effects) {
    if (s.fase !== "colpo" || !s.colpo.scasso) fail("La Grande Fuga comincia dopo lo Scasso.");
    s.fase = "fuga";
    effects.push({ tipo: "fase", testo: "Fase 3 - La Grande Fuga. Arrivano le forze dell'ordine!" });
    for (const l of s.ladri.filter((x) => x.classe === "meccanico")) {
      const c = pesca(s, "b", 1, effects);
      l.mano.push(...c);
      effects.push({ tipo: "info", testo: `${l.nome} (Meccanico, Versatile) pesca una Carta.` });
    }
    const n = s.ladri.length;
    s.mazzetto.push(...pesca(s, "c", n, effects));
    effects.push({ tipo: "guardie", testo: `Il Croupier aggiunge ${n} Carte al Mazzetto delle Guardie (${s.mazzetto.length}).` });
    if (s.acquisti.includes("auto")) {
      const via = scartaACaso(s, s.mazzetto, n);
      scarta(s, via);
      effects.push({ tipo: "guardie", testo: `L'Auto da corsa semina ${via.length} Guardie: restano ${s.mazzetto.length} Carte nel Mazzetto.` });
    }
    if (s.mazzetto.length < 2) {
      effects.push({ tipo: "info", testo: "Al Mazzetto delle Guardie restano meno di 2 Carte: la Banda scappa senza ulteriori difficoltà." });
      return chiudiFuga(s, s.bottinoFinale ? "fuggiti" : "fuggitiManiVuote", effects);
    }
    if (totaleCarte(s) < 2) {
      effects.push({ tipo: "info", testo: "Alla Banda restano meno di 2 Carte in tutto: finisce in gattabuia senza opporre resistenza." });
      return chiudiFuga(s, "arrestati", effects);
    }
    nuovoConfronto(s, "fuga", { partecipanti: s.ladri.map((l) => l.id), attivi: s.ladri.map((l) => l.id) }, effects);
  },

  allIn(s, a, effects) {
    const cf = s.confronto ?? fail("Nessun Confronto in corso.");
    if (!s.opzioni.allIn) fail("La regola dell'All-in non è attiva.");
    if (cf.tipo !== "fuga" || cf.step !== "esito" || cf.esito !== "fallimento" || cf.round === "allin") fail("L'All-in si tenta dopo un Fallimento nella Fuga.");
    if (!cf.attivi.length) fail("Non ci sono Ladri rimasti.");
    s.bottinoFinale = false;
    rimetti(s, cf.tavolo);
    mescolaMazzo(s, "b");
    rimetti(s, cf.croupierGioca);
    mescolaMazzo(s, "c");
    cf.croupierGioca = null;
    const pentiti = s.ladri.filter((l) => l.pentito).length;
    s.mazzetto.push(...pesca(s, "c", 2 * pentiti, effects));
    cf.round = "allin";
    s.colpo.allIn = true;
    cf.esito = null;
    cf.manoLadri = cf.manoCroupier = null;
    cf.ladyUsata = false;
    cf.tavolo = pesca(s, "b", 5, effects);
    cf.step = "river";
    effects.push({
      tipo: "tavolo",
      testo: `ALL-IN! La Banda rinuncia al Bottino per aprirsi una via. ${pentiti ? `Il Croupier pesca ${2 * pentiti} Carte per i Pentiti. ` : ""}Mano finale: ${elenco(cf.tavolo)}.`,
      carte: cf.tavolo,
    });
  },
};

/**
 * Applica un'azione. `action.type` è il nome dell'azione; il resto sono i parametri.
 * @returns {{state:object, effects:object[]}}
 */
export function apply(state, action) {
  if (!state) fail("Nessuna partita in corso.");
  const fn = AZIONI[action?.type] ?? fail(`Azione sconosciuta: ${action?.type}`);
  if (state.fase === "epilogo" && action.type !== "mostra") fail("La partita è finita.");
  const s = structuredClone(state);
  const effects = [];
  fn(s, action, effects);
  return { state: s, effects };
}

export const AZIONI_NOTE = Object.keys(AZIONI);
