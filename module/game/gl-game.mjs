/**
 * Collante con Foundry: stato condiviso (impostazione di mondo), socket verso il GM attivo,
 * permessi, annulla, messaggi in chat.
 */
import { apply, newGame, EngineError } from "./engine.mjs";
import { chatForEffect } from "./chat.mjs";

export const SYSTEM_ID = "guardie-e-ladri";
const CHANNEL = `system.${SYSTEM_ID}`;

/** Azioni riservate al Croupier (GM). */
const SOLO_GM = new Set([
  "newGame",
  "reset",
  "annulla",
  "distribuisci",
  "lavorettoInizia",
  "avanza",
  "croupierGioca",
  "annullaConfronto",
  "faseFixer",
  "faseColpo",
  "faseFuga",
  "daiJolly",
]);

/** Azioni che riguardano un Ladro preciso: le manda chi lo controlla. */
const DEL_LADRO = new Set(["coppiaGangster", "mostra", "decidi", "baciamano", "vota", "diversivo", "bottinoScegli"]);

/** L'utente controlla questo Ladro? (giocatore assegnato o proprietario dell'Attore) */
export function controlla(user, st, ladroId) {
  const l = st?.ladri.find((x) => x.id === ladroId);
  if (!l) return false;
  if (l.userId) return l.userId === user.id;
  return !!game.actors.get(ladroId)?.testUserPermission(user, "OWNER");
}

export function ladriDi(user, st) {
  return (st?.ladri ?? []).filter((l) => controlla(user, st, l.id));
}

function allowed(action, st, user) {
  if (user.isGM) return true;
  if (SOLO_GM.has(action.type)) return false;
  const seduto = ladriDi(user, st).length > 0;
  if (!seduto) return false;
  if (DEL_LADRO.has(action.type)) return controlla(user, st, action.ladro);
  switch (action.type) {
    case "gioca":
      return st.confronto?.tipo === "fuga" ? true : controlla(user, st, action.ladro);
    case "compra":
      return !action.gratis;
    case "bottinoAssegna":
    case "bottinoDividi":
      return !!st.bottino?.partecipanti.some((id) => controlla(user, st, id));
    case "accetta":
      return st.confronto?.tipo === "fuga" || !!st.confronto?.attivi.some((id) => controlla(user, st, id));
    case "accesso":
    case "scasso":
    case "allIn":
      return true;
    default:
      return false;
  }
}

export class GLGame {
  static get state() {
    return game.settings.get(SYSTEM_ID, "partita") ?? null;
  }

  static get precedente() {
    return game.settings.get(SYSTEM_ID, "precedente") ?? null;
  }

  static register() {
    game.settings.register(SYSTEM_ID, "partita", {
      scope: "world",
      config: false,
      type: new foundry.data.fields.ObjectField({ nullable: true, initial: null }),
      onChange: () => Hooks.callAll("glStateChanged", GLGame.state),
    });
    game.settings.register(SYSTEM_ID, "precedente", {
      scope: "world",
      config: false,
      type: new foundry.data.fields.ObjectField({ nullable: true, initial: null }),
    });
    game.settings.register(SYSTEM_ID, "vediTutto", {
      scope: "client",
      config: false,
      type: new foundry.data.fields.BooleanField({ initial: false }),
    });
    game.settings.register(SYSTEM_ID, "apriTavolo", {
      name: "Apri il Tavolo all'ingresso",
      hint: "Apre da solo il Tavolo di Guardie & Ladri quando entri nel mondo.",
      scope: "client",
      config: true,
      type: new foundry.data.fields.BooleanField({ initial: true }),
    });
  }

  static activateSocket() {
    game.socket.on(CHANNEL, (msg) => {
      if (msg.type === "action") {
        if (game.users.activeGM?.isSelf) GLGame.#run(msg.action, msg.userId);
      } else if (msg.type === "creaLadro") {
        if (game.users.activeGM?.isSelf) GLGame.#creaLadro(msg.userId, msg);
      } else if (msg.type === "ladroCreato" && msg.to === game.user.id) {
        game.actors.get(msg.actorId)?.sheet.render(true);
      } else if (msg.type === "error" && msg.to === game.user.id) {
        ui.notifications.warn(msg.message);
      }
    });
  }

  /** Invia un'azione al GM attivo (o la esegue se sei tu). */
  static async dispatch(action) {
    if (!game.users.activeGM) {
      ui.notifications.error("Serve il Croupier (un GM) connesso per giocare al Tavolo.");
      return;
    }
    if (game.users.activeGM.isSelf) return GLGame.#run(action, game.user.id);
    game.socket.emit(CHANNEL, { type: "action", userId: game.user.id, action });
  }

  static async #run(action, userId) {
    const user = game.users.get(userId);
    const st = GLGame.state;
    try {
      if (!user) return;
      if (!st && action.type !== "newGame") throw new EngineError("Nessuna partita in corso.");
      if (!allowed(action, st, user)) {
        throw new EngineError(
          SOLO_GM.has(action.type)
            ? "Questa mossa spetta al Croupier."
            : !ladriDi(user, st).length
              ? "Non siedi al Tavolo: il Croupier deve assegnarti un Ladro."
              : "Non puoi fare questa mossa per un altro Ladro.",
        );
      }
      if (action.type === "reset") {
        await game.settings.set(SYSTEM_ID, "precedente", st);
        await game.settings.set(SYSTEM_ID, "partita", null);
        return;
      }
      if (action.type === "annulla") {
        const prev = GLGame.precedente;
        if (!prev) throw new EngineError("Non c'è niente da annullare.");
        await game.settings.set(SYSTEM_ID, "precedente", null);
        await game.settings.set(SYSTEM_ID, "partita", prev);
        await ChatMessage.create({ content: `<div class="gl-chat gl-chat-info">Il Croupier annulla l'ultima mossa.</div>`, speaker: { alias: "Guardie & Ladri" } });
        return;
      }
      const result = action.type === "newGame" ? newGame(action.config) : apply(st, action);
      await game.settings.set(SYSTEM_ID, "precedente", st);
      await game.settings.set(SYSTEM_ID, "partita", result.state);
      for (const e of result.effects) {
        const msg = chatForEffect(e);
        if (!msg) continue;
        await ChatMessage.create({ content: msg, speaker: { alias: "Guardie & Ladri" }, flags: { [SYSTEM_ID]: { effect: e.tipo } } });
      }
    } catch (e) {
      if (e instanceof EngineError) {
        if (userId === game.user.id) ui.notifications.warn(e.message);
        else game.socket.emit(CHANNEL, { type: "error", to: userId, message: e.message });
      } else {
        console.error("Guardie & Ladri |", e);
        ui.notifications.error(`Guardie & Ladri: ${e.message}`);
      }
    }
  }

  /** Un giocatore crea il suo Ladro: lo crea il GM per lui (i giocatori non possono creare Attori). */
  static async creaLadro({ nome, classe }) {
    const dati = { nome: String(nome ?? "").trim().slice(0, 40), classe };
    if (!dati.nome) return ui.notifications.warn("Scrivi il nome del Ladro.");
    if (game.user.isGM) return GLGame.#creaLadro(game.user.id, dati);
    if (!game.users.activeGM) return ui.notifications.error("Serve un GM connesso per creare il Ladro.");
    game.socket.emit(CHANNEL, { type: "creaLadro", userId: game.user.id, ...dati });
  }

  static async #creaLadro(userId, { nome, classe }) {
    const user = game.users.get(userId);
    if (!user) return null;
    const actor = await Actor.create({
      name: nome,
      type: "ladro",
      img: "icons/svg/mystery-man.svg",
      ownership: user.isGM
        ? { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
        : { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED, [userId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
      system: { classe: classe ?? "gangster" },
    });
    if (userId === game.user.id) actor.sheet.render(true);
    else game.socket.emit(CHANNEL, { type: "ladroCreato", to: userId, actorId: actor.id });
    return actor;
  }
}
