import { CLASSI, DOMANDE } from "../core/regole.mjs";
import { GLGame } from "../game/gl-game.mjs";
import { etichetta } from "../core/carte.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Scheda del Ladro. */
export class GLLadroSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["guardie-e-ladri", "gl-sheet"],
    position: { width: 560, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true },
  };

  static PARTS = {
    sheet: { template: "systems/guardie-e-ladri/templates/actor/ladro.hbs", scrollable: [".gl-sheet-body"] },
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const actor = this.document;
    const classe = CLASSI[actor.system.classe];
    const st = GLGame.state;
    const inGioco = st?.ladri.find((l) => l.id === actor.id);
    return Object.assign(ctx, {
      actor,
      system: actor.system,
      editable: this.isEditable,
      classi: Object.entries(CLASSI).map(([k, v]) => ({ k, nome: v.nome, sel: k === actor.system.classe })),
      classe,
      domande: DOMANDE,
      inGioco: inGioco
        ? { carte: inGioco.mano.length, mano: actor.isOwner ? inGioco.mano.map(etichetta).join(", ") : null, ricercato: inGioco.ricercato, pentito: inGioco.pentito }
        : null,
      noteHTML: await foundry.applications.ux.TextEditor.implementation.enrichHTML(actor.system.note, { relativeTo: actor, secrets: actor.isOwner }),
    });
  }
}
