/**
 * Dati di regolamento di Guardie & Ladri (tabelle del manuale), in forma di dati puri.
 */

export const CLASSI = {
  gangster: {
    nome: "Gangster",
    speciale: "Asso nella manica",
    testo: "Inizia la partita con 1 Coppia di numeri (dal 2 al 10) di semi a sua scelta, presa dal Mazzo della Banda.",
  },
  lady: {
    nome: "Lady",
    speciale: "Il baciamano",
    testo:
      "In caso di Fallimento può scambiare una Carta della sua mano con una di quelle rivelate da lei o dai complici, dopo che il Croupier ha giocato.",
  },
  meccanico: {
    nome: "Meccanico",
    speciale: "Versatile",
    testo: "Pesca una Carta dal Mazzo della Banda all'inizio della Grande Fuga.",
  },
  intellettuale: {
    nome: "Intellettuale",
    speciale: "Eureka",
    testo: "Durante il Grande Colpo fornisce un vantaggio negli approcci Brutale e Tecnico dello Scasso.",
  },
};

export const DOMANDE = [
  "Perché ti sei dato alla carriera criminale?",
  "Cosa ne farai della tua parte di bottino?",
  "Sei Ricercato? Per quale motivo?",
];

/** Tabella del Grado di Rischio. */
export const GRADI = {
  banale: { nome: "Banale", croupier: 2, bottino: { n: 3, scelta: false }, bonus: { n: 2, scelta: false }, esempio: "rapinare uno studente in un vicolo" },
  discreto: { nome: "Discreto", croupier: 3, bottino: { n: 4, scelta: false }, bonus: { n: 3, scelta: false }, esempio: "rubare un'automobile" },
  tosto: { nome: "Tosto", croupier: 4, bottino: { n: 2, scelta: true }, bonus: { n: 2, scelta: true }, esempio: "trafugare un quadro da un museo" },
  esagerato: { nome: "Esagerato", croupier: 5, bottino: { n: 3, scelta: true }, bonus: { n: 3, scelta: true }, esempio: "assaltare un portavalori" },
};

/** Listino del Fixer: non si può comprare due volte lo stesso elemento. */
export const LISTINO = {
  fumogeni: { nome: "Fumogeni", costo: ["coppia"], costoTesto: "1 Coppia", jolly: true, vantaggio: "1 Jolly; Ingresso Secondario senza Carte" },
  attrezzi: { nome: "Attrezzi da Scasso", costo: ["coppiaFigure"], costoTesto: "1 Coppia di figure", jolly: true, vantaggio: "1 Jolly; permette lo Scasso Tecnico" },
  mappa: { nome: "Mappa dello stabile", costo: ["tris"], costoTesto: "1 Tris", vantaggio: "Permette l'Ingresso Secondario" },
  documenti: { nome: "Documenti falsi", costo: ["trisFigure"], costoTesto: "1 Tris di figure", vantaggio: "Annulla lo status di Ricercato per tutta la Banda" },
  personale: { nome: "Personale corrotto", costo: ["full", "colore"], costoTesto: "1 Full o 5 Carte dello stesso colore", vantaggio: "Meno Guardie Allertate all'Accesso" },
  combinazione: { nome: "Combinazione", costo: ["poker", "scala"], costoTesto: "1 Poker o una Scala", vantaggio: "Permette lo Scasso Professionale (successo automatico)" },
  auto: { nome: "Auto da corsa", costo: ["poker", "scala"], costoTesto: "1 Poker o una Scala", vantaggio: "Nella Fuga il Croupier scarta 1 Carta per Ladro dal Mazzetto delle Guardie" },
};

export const ACCESSI = {
  secondario: { nome: "Ingresso Secondario", costoTesto: "1 Tris (nessuna Carta con i Fumogeni)", richiede: "mappa" },
  incognito: { nome: "Ingresso in Incognito", costoTesto: "1 Poker (nessuna Carta con il Personale corrotto)" },
  teatrale: { nome: "Ingresso Teatrale", costoTesto: "Nessuna Carta" },
};

export const SCASSI = {
  professionale: { nome: "Professionale", costoTesto: "Nessuna Carta", richiede: "combinazione" },
  tecnico: { nome: "Tecnico", costoTesto: "1 Tris di figure", richiede: "attrezzi" },
  brutale: { nome: "Brutale", costoTesto: "1 Poker di figure (Doppia coppia con l'Intellettuale)" },
  nessuno: { nome: "A mani vuote", costoTesto: "—" },
};

/** Costo in Carte dell'Accesso, dati gli acquisti ([] = gratis). */
export function costoAccesso(tipo, acquisti) {
  if (tipo === "secondario") return acquisti.includes("fumogeni") ? [] : ["tris"];
  if (tipo === "incognito") return acquisti.includes("personale") ? [] : ["poker"];
  return [];
}

/** Guardie Allertate dall'Accesso. */
export function guardieAccesso(tipo, { nLadri, nRicercati, acquisti }) {
  if (tipo === "secondario") return 0;
  if (tipo === "incognito") return acquisti.includes("documenti") ? 0 : nRicercati;
  return acquisti.includes("personale") ? Math.floor(nLadri / 2) : nLadri;
}

export function costoScasso(tipo, { intellettuale }) {
  if (tipo === "tecnico") return ["trisFigure"];
  if (tipo === "brutale") return intellettuale ? ["pokerFigure", "doppiaCoppia"] : ["pokerFigure"];
  return [];
}

export function guardieScasso(tipo, { nLadri, nRicercati, intellettuale }) {
  if (tipo === "professionale") return 0;
  if (tipo === "tecnico") return intellettuale ? Math.floor(nRicercati / 2) : nRicercati;
  return nLadri; // brutale, oppure a mani vuote
}

/** Carte del Croupier per ogni Guardia Allertata. */
export const CARTE_PER_GUARDIA = 3;
