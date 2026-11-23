/** HTML di una carta da Poker disegnata in CSS (nessuna immagine). */
import { isJolly, parse, VALORI, SIMBOLI_SEME, NOMI_SEME } from "../core/carte.mjs";

const NOME_VALORE = { T: "10" };

export function cartaHTML(id, { coperta = false, mini = false, sel = false, azione = null, dorso = "b", extra = "" } = {}) {
  const cls = ["gl-carta"];
  if (mini) cls.push("gl-mini");
  if (sel) cls.push("gl-sel");
  const act = azione ? ` data-action="${azione}" data-carta="${id ?? ""}"` : "";
  if (coperta || !id || id.startsWith("h:")) {
    // "h:b3" = Carta coperta del Mazzo della Banda (segnaposto della vista privata)
    const m = !id ? dorso : id.startsWith("h:") ? id[2] : isJolly(id) ? dorso : parse(id).mazzo;
    return `<div class="${cls.join(" ")} gl-dorso gl-dorso-${m}"${act}${extra}></div>`;
  }
  if (isJolly(id)) {
    return `<div class="${cls.join(" ")} gl-jolly" title="Jolly: vale qualsiasi carta"${act}${extra}><span class="gl-v">J</span><span class="gl-s">★</span><span class="gl-jw">JOLLY</span></div>`;
  }
  const c = parse(id);
  const k = VALORI[c.v - 2];
  const v = NOME_VALORE[k] ?? k;
  const rosso = c.s === "C" || c.s === "Q";
  cls.push(rosso ? "gl-rosso" : "gl-nero", `gl-m-${c.mazzo}`);
  const title = `${v} di ${NOMI_SEME[c.s]} (${c.mazzo === "b" ? "Mazzo della Banda" : "Mazzo del Croupier"})`;
  return `<div class="${cls.join(" ")}" title="${title}"${act}${extra}><span class="gl-v">${v}</span><span class="gl-s">${SIMBOLI_SEME[c.s]}</span><span class="gl-big">${SIMBOLI_SEME[c.s]}</span></div>`;
}
