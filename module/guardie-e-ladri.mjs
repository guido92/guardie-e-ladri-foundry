import { LadroData } from "./documents/data-models.mjs";
import { GLLadroSheet } from "./sheets/ladro-sheet.mjs";
import { GLGame, SYSTEM_ID } from "./game/gl-game.mjs";
import { GLTavolo } from "./apps/tavolo.mjs";
import * as carte from "./core/carte.mjs";

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
  root.insertAdjacentElement("afterbegin", btn);
});
