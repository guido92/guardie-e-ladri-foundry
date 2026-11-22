/** Testo in chat per gli effetti del motore. */
import { cartaHTML } from "../apps/carte-html.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const TITOLI = {
  inizio: "Nuova partita",
  fase: "Fase di gioco",
  lavoretto: "Lavoretto",
  esito: "Confronto",
  bottino: "Bottino",
  acquisto: "Fixer",
  jolly: "Jolly",
  colpo: "Grande Colpo",
  guardie: "Guardie",
  epilogo: "Epilogo",
};

export function chatForEffect(e) {
  const titolo = TITOLI[e.tipo];
  let carte = "";
  if (e.tipo === "esito") {
    carte =
      `<div class="gl-chat-row"><span>Tavolo</span>${(e.tavolo ?? []).map((c) => cartaHTML(c, { mini: true })).join("")}</div>` +
      `<div class="gl-chat-row"><span>Ladri</span>${(e.ladri ?? []).map((c) => cartaHTML(c, { mini: true })).join("")}</div>` +
      `<div class="gl-chat-row"><span>Croupier</span>${(e.croupier ?? []).map((c) => cartaHTML(c, { mini: true })).join("")}</div>`;
  } else if ((e.tipo === "tavolo" || e.tipo === "bottino") && e.carte?.length) {
    carte = `<div class="gl-chat-row">${e.carte.map((c) => cartaHTML(c, { mini: true })).join("")}</div>`;
  }
  const cls = e.tipo === "esito" || e.tipo === "epilogo" ? ` gl-chat-${e.esito}` : "";
  return `<div class="gl-chat gl-chat-${e.tipo}${cls}">${titolo ? `<h4>${titolo}</h4>` : ""}<p>${esc(e.testo)}</p>${carte}</div>`;
}
