/**
 * Vista della partita per un utente: lo stato completo con le Carte che quell'utente non deve
 * conoscere sostituite da segnaposto ("h:b0", "h:c3", ...). Funzione pura, testabile con Node.
 * Le Carte coperte conservano solo il mazzo di provenienza (per il colore del dorso).
 *
 * @param {object} st stato completo
 * @param {{comandati?: Iterable<string>, banda?: boolean}} chi
 *   comandati: id dei Ladri che l'utente controlla; banda: l'utente siede al Tavolo come membro della Banda
 */
export function vistaPer(st, { comandati = [], banda = false } = {}) {
  if (!st) return st;
  const miei = new Set(comandati);
  const v = structuredClone(st);
  let n = 0;
  const copri = (ids) => ids.map((id) => `h:${id.startsWith("c:") ? "c" : "b"}${n++}`);
  const epilogo = v.fase === "epilogo";

  for (const l of v.ladri) {
    const vede = epilogo || miei.has(l.id) || (banda && (l.mostra || v.fase === "fuga"));
    if (!vede) l.mano = copri(l.mano);
  }
  const sceglieBottino = !!v.bottino?.daScegliere && v.bottino.partecipanti.some((id) => miei.has(id));
  if (!sceglieBottino) v.mazzi.b.pesca = copri(v.mazzi.b.pesca);
  v.mazzi.c.pesca = copri(v.mazzi.c.pesca);
  v.mazzetto = copri(v.mazzetto);
  if (v.bottino && !v.bottino.partecipanti.some((id) => miei.has(id))) v.bottino.carte = copri(v.bottino.carte);

  const cf = v.confronto;
  if (cf) {
    const scoperte = cf.step === "esito" || cf.step === "bottino" || cf.scoperte || cf.round === 2 || cf.round === "allin";
    cf.croupierMano = copri(cf.croupierMano);
    if (cf.croupierGioca && !scoperte) cf.croupierGioca = copri(cf.croupierGioca);
    for (const k of Object.keys(cf.giocate)) {
      const vede = scoperte || miei.has(k) || (k === "banda" && banda);
      if (!vede) cf.giocate[k] = copri(cf.giocate[k]);
    }
  }
  v.rng = 0;
  v.vista = true;
  return v;
}

export const isCoperta = (id) => typeof id === "string" && id.startsWith("h:");
