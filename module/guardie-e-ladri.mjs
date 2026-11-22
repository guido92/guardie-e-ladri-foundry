import { LadroData } from "./documents/data-models.mjs";
import { GLLadroSheet } from "./sheets/ladro-sheet.mjs";
import { GLGame, SYSTEM_ID } from "./game/gl-game.mjs";
import { GLTavolo } from "./apps/tavolo.mjs";
import * as carte from "./core/carte.mjs";
import { GLGuida } from "./apps/guida.mjs";
import { arte, ritratto } from "./data/arte.mjs";

Hooks.once("init", () => {
  console.log("Guardie & Ladri | inizializzazione del sistema");
  CONFIG.Actor.dataModels.ladro = LadroData;
  CONFIG.Actor.typeLabels ??= {};
  CONFIG.Actor.typeLabels.ladro = "Ladro"; // etichetta anche quando la lingua del client non è l'italiano
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, GLLadroSheet, {
    types: ["ladro"],
    makeDefault: true,
    label: "Scheda del Ladro",
  });
  GLGame.register();
  game.gl = {
    GLGame,
    GLTavolo,
    carte,
    get state() {
      return GLGame.state;
    },
    dispatch: (a) => GLGame.dispatch(a),
    openTable: () => GLTavolo.open(),
    openGuida: (p) => GLGuida.open(p),
  };
  game.keybindings.register(SYSTEM_ID, "openTable", {
    name: "Apri il Tavolo",
    editable: [{ key: "KeyT", modifiers: ["Alt"] }],
    onDown: () => {
      GLTavolo.open();
      return true;
    },
  });
});

Hooks.once("ready", () => {
  GLGame.activateSocket();
  Hooks.on("glStateChanged", () => GLTavolo.onState());
  Hooks.on("updateActor", () => GLTavolo.onState());
  Hooks.on("createActor", () => GLTavolo.onState());
  Hooks.on("userConnected", () => GLTavolo.onState());
  if (game.settings.get(SYSTEM_ID, "apriTavolo")) GLTavolo.open();
  if (game.user.isGM) preparaScena();
});

/** Una scena con l'illustrazione del manuale, così dietro al Tavolo non resta lo sfondo di Foundry. */
async function preparaScena() {
  // ritratto di Classe ai Ladri che hanno ancora l'icona generica
  for (const a of game.actors.filter((x) => x.type === "ladro" && (!x.img || x.img.includes("mystery-man")))) {
    await a.update({ img: ritratto(a.system.classe) });
  }
  if (game.scenes.some((s) => s.getFlag(SYSTEM_ID, "tavolo"))) return;
  const attiva = game.scenes.active;
  const v14 = !!foundry.utils.getProperty(CONFIG.Scene.documentClass.schema.fields, "levels");
  const scena = await Scene.create({
    // dalla v14 lo sfondo sta nel livello della scena
    ...(v14 ? { levels: [{ _id: "defaultLevel0000", name: "Tavolo", background: { src: arte("sfondo"), color: "#0b0b0b" } }] } : {}),
    flags: { [SYSTEM_ID]: { tavolo: true } },
    name: "Guardie & Ladri",
    background: { src: arte("sfondo") },
    width: 1920,
    height: 1080,
    padding: 0,
    backgroundColor: "#0b0b0b",
    grid: { type: 0 },
    tokenVision: false,
    fog: { exploration: false },
    initial: { x: 960, y: 540, scale: 0.6 },
  });
  // la attiviamo se quella attuale è vuota (la scena predefinita di un mondo nuovo)
  if (!attiva || !attiva.background?.src || attiva.background.src.includes("defaultscene") || attiva.background.src.includes("ui/")) await scena.activate();
}

// ritratto della Classe come immagine predefinita del Ladro
Hooks.on("preCreateActor", (actor, data) => {
  if (actor.type !== "ladro") return;
  if (!data.img || data.img.includes("mystery-man")) actor.updateSource({ img: ritratto(data.system?.classe ?? "gangster") });
});
Hooks.on("preUpdateActor", (actor, changes) => {
  const nuova = changes.system?.classe;
  if (actor.type !== "ladro" || !nuova || changes.img) return;
  const vecchio = actor.img ?? "";
  if (vecchio.includes("mystery-man") || vecchio === ritratto(actor.system.classe)) changes.img = ritratto(nuova);
});

Hooks.on("getSceneControlButtons", (controls) => {
  const group = controls.tokens ?? Object.values(controls)[0];
  if (!group) return;
  group.tools ??= {};
  group.tools.guardieLadri = {
    name: "guardieLadri",
    title: "Apri il Tavolo (Guardie & Ladri)",
    icon: "fa-solid fa-mask",
    order: 99,
    button: true,
    visible: true,
    onChange: () => GLTavolo.open(),
  };
});

Hooks.on("renderChatLog", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".gl-open-table")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "gl-open-table";
  btn.innerHTML = '<i class="fa-solid fa-mask"></i> Apri il Tavolo di Guardie & Ladri';
  btn.addEventListener("click", () => GLTavolo.open());
  const guida = document.createElement("button");
  guida.type = "button";
  guida.className = "gl-open-table";
  guida.innerHTML = '<i class="fa-solid fa-book-open"></i> Guida, regole e crediti';
  guida.addEventListener("click", () => GLGuida.open());
  root.insertAdjacentElement("afterbegin", guida);
  root.insertAdjacentElement("afterbegin", btn);
});
