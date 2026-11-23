/**
 * Illustrazioni del manuale usate dall'interfaccia (Luca Erbetta, grafica di Carolina Fiandri,
 * Officina Meningi). Si estraggono dal PDF con tools/extract-art.py in assets/gl-art/.
 */
const BASE = "systems/guardie-e-ladri/assets/gl-art";

export const arte = (nome, ext = null) => {
  const png = ["logo", "gangster", "lady", "meccanico", "intellettuale", "recluta", "jolly", "sbarre", "bomba", "borsetta", "cannello", "manganello"];
  return `${BASE}/${nome}.${ext ?? (png.includes(nome) ? "png" : "jpg")}`;
};

/** Ritratto di Classe (anche come immagine predefinita dell'Attore). */
export const ritratto = (classe) => arte(["gangster", "lady", "meccanico", "intellettuale"].includes(classe) ? classe : "recluta");

/** Illustrazione per la Fase in corso. */
export const ARTE_FASE = {
  setup: "copertina",
  lavoretti: "borsetta",
  fixer: "piano",
  colpo: "caveau",
  fuga: "fuga",
  epilogo: "berretto",
};
