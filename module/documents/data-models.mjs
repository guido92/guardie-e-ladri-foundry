import { CLASSI } from "../core/regole.mjs";

const { TypeDataModel } = foundry.abstract;
const f = foundry.data.fields;

/** Scheda del Ladro: Classe, Background (3 domande), status di Ricercato. */
export class LadroData extends TypeDataModel {
  static defineSchema() {
    return {
      classe: new f.StringField({ initial: "gangster", choices: Object.fromEntries(Object.entries(CLASSI).map(([k, v]) => [k, v.nome])) }),
      aspetto: new f.StringField({ initial: "", blank: true }),
      perche: new f.StringField({ initial: "", blank: true }),
      bottino: new f.StringField({ initial: "", blank: true }),
      ricercato: new f.BooleanField({ initial: false }),
      motivo: new f.StringField({ initial: "", blank: true }),
      note: new f.HTMLField({ initial: "" }),
    };
  }
}
