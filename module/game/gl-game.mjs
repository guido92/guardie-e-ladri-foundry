/**
 * Collante con Foundry: stato condiviso (impostazione di mondo), socket verso il GM attivo,
 * permessi, annulla, messaggi in chat.
 */
import { apply, newGame, EngineError } from "./engine.mjs";
import { chatForEffect } from "./chat.mjs";
import { ritratto } from "../data/arte.mjs";
import { vistaPer } from "./vista.mjs";

// ---- cifratura dello stato completo (la chiave resta nel browser del Croupier) ----
const CHIAVE = () => `${SYSTEM_ID}.chiave.${game.world.id}`;
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function chiave(crea = false) {
  let raw = localStorage.getItem(CHIAVE());
  if (!raw && crea) {
    const k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    raw = b64(await crypto.subtle.exportKey("raw", k));
    localStorage.setItem(CHIAVE(), raw);
  }
  return raw ? crypto.subtle.importKey("raw", unb64(raw), "AES-GCM", false, ["encrypt", "decrypt"]) : null;
}
async function cifra(obj) {
  const k = await chiave(true);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = new TextEncoder().encode(JSON.stringify(obj));
  const dati = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, buf);
  // btoa su array grandi: a pezzi
  const u = new Uint8Array(dati);
  let bin = "";
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return { iv: b64(iv), dati: btoa(bin) };
}
async function decifra(blob) {
  const k = await chiave();
  if (!k || !blob) return null;
  try {
    const d = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(blob.iv) }, k, unb64(blob.dati));
    return JSON.parse(new TextDecoder().decode(d));
  } catch {
    return null;
  }
}

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

/** Le carte indicate stanno in mani che l'utente può usare (le sue o quelle mostrate alla Banda)? */
function carteUsabili(user, st, carte) {
  return (carte ?? []).every((c) => {
    const l = st.ladri.find((x) => x.mano.includes(c));
    if (!l) return true; // carta inesistente: ci pensa il motore a rifiutarla
    return controlla(user, st, l.id) || l.mostra || st.fase === "fuga";
  });
}

function allowed(action, st, user) {
  if (user.isGM) return true;
  if (SOLO_GM.has(action.type) || (action.type === "compra" && action.gratis)) return false;
  const seduto = ladriDi(user, st).length > 0;
  if (!seduto) return false;
  if (DEL_LADRO.has(action.type)) return controlla(user, st, action.ladro);
  switch (action.type) {
    case "gioca":
      return st.confronto?.tipo === "fuga" ? true : controlla(user, st, action.ladro);
    case "compra":
      return carteUsabili(user, st, action.carte);
    case "bottinoAssegna":
    case "bottinoDividi":
      return !!st.bottino?.partecipanti.some((id) => controlla(user, st, id));
    case "accetta":
      return st.confronto?.tipo === "fuga" || !!st.confronto?.attivi.some((id) => controlla(user, st, id));
    case "accesso":
    case "scasso":
      return carteUsabili(user, st, action.carte);
    case "allIn":
      return true;
    default:
      return false;
  }
}

export class GLGame {
  /** Stato completo (solo nel client del Croupier che ha la chiave). */
  static #pieno = null;
  static #precedente = null;
  /** Vista privata ricevuta dal Croupier (giocatori). */
  static #vista = null;

  /** Lo stato che questo client può vedere. */
  static get state() {
    const pub = game.settings.get(SYSTEM_ID, "partita") ?? null;
    if (!pub) return null;
    if (game.user.isGM && GLGame.#pieno && (GLGame.#pieno.seq ?? 0) >= (pub.seq ?? 0)) return GLGame.#pieno;
    if (GLGame.#vista && (GLGame.#vista.seq ?? 0) >= (pub.seq ?? 0)) return GLGame.#vista;
    return pub;
  }

  /** Il Croupier ha in questo browser la chiave per leggere la partita? */
  static get haChiave() {
    return !!localStorage.getItem(CHIAVE());
  }

  /** Copia della chiave, per continuare la partita da un altro computer del Croupier. */
  static esportaChiave() {
    return localStorage.getItem(CHIAVE());
  }

  static importaChiave(raw) {
    localStorage.setItem(CHIAVE(), raw);
    return GLGame.#caricaSegreto();
  }

  static async #caricaSegreto() {
    if (!game.user.isGM) return;
    const blob = game.settings.get(SYSTEM_ID, "segreto");
    const d = blob ? await decifra(blob) : null;
    GLGame.#pieno = d?.stato ?? null;
    GLGame.#precedente = d?.precedente ?? null;
    Hooks.callAll("glStateChanged", GLGame.state);
  }

  static register() {
    game.settings.register(SYSTEM_ID, "partita", {
      scope: "world",
      config: false,
      type: new foundry.data.fields.ObjectField({ nullable: true, initial: null }),
      onChange: () => Hooks.callAll("glStateChanged", GLGame.state),
    });
    // stato completo e mossa precedente, cifrati: tutti ricevono il dato, solo il Croupier lo legge
    game.settings.register(SYSTEM_ID, "segreto", {
      scope: "world",
      config: false,
      type: new foundry.data.fields.ObjectField({ nullable: true, initial: null }),
      onChange: () => GLGame.#caricaSegreto(),
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

  /** Identificativo di questo client (lo stesso utente GM può avere più schede aperte). */
  static #sid = foundry.utils.randomID();
  /** Altri client dello stesso utente GM: sid -> ultimo segnale. */
  static #altriGM = new Map();
  /** Le azioni si eseguono una alla volta, in ordine di arrivo. */
  static #coda = Promise.resolve();

  /**
   * Tra i client del GM attivo, uno solo esegue le azioni: quello con l'identificativo minore
   * tra quelli che hanno dato segni di vita negli ultimi 30 secondi.
   */
  static get esecutore() {
    const gm = game.users.activeGM;
    if (!gm?.isSelf) return false;
    const ora = Date.now();
    const vivi = [...GLGame.#altriGM.entries()].filter(([, v]) => v.userId === gm.id && ora - v.t < 30000);
    // tra le schede del Croupier esegue chi ha la chiave della partita
    const tutti = [[GLGame.#sid, { chiave: GLGame.haChiave }], ...vivi];
    const conChiave = tutti.filter(([, v]) => v.chiave);
    return (conChiave.length ? conChiave : tutti).map(([k]) => k).sort()[0] === GLGame.#sid;
  }

  static #presenza(risposta = false) {
    if (!game.user.isGM) return;
    game.socket.emit(CHANNEL, { type: "presenza", sid: GLGame.#sid, userId: game.user.id, chiave: GLGame.haChiave, risposta }, GLGame.#aiGM());
  }

  /** Destinatari: solo i client dei GM (una mossa coperta non deve passare dagli altri giocatori). */
  static #aiGM() {
    return { recipients: game.users.filter((u) => u.isGM && u.active).map((u) => u.id) };
  }

  /** Il Croupier manda a un giocatore la sua vista privata. */
  static #mandaVista(user, st = GLGame.#pieno) {
    if (!st || !user || user.isGM || !user.active) return;
    const comandati = ladriDi(user, st).map((l) => l.id);
    game.socket.emit(CHANNEL, { type: "vista", stato: vistaPer(st, { comandati, banda: comandati.length > 0 }) }, { recipients: [user.id] });
  }

  static async #salva(nuovo, precedente) {
    GLGame.#pieno = nuovo;
    GLGame.#precedente = precedente;
    if (!nuovo) {
      await game.settings.set(SYSTEM_ID, "partita", null);
      await game.settings.set(SYSTEM_ID, "segreto", null);
      return;
    }
    await game.settings.set(SYSTEM_ID, "segreto", await cifra({ stato: nuovo, precedente }));
    for (const u of game.users) GLGame.#mandaVista(u, nuovo);
    await game.settings.set(SYSTEM_ID, "partita", vistaPer(nuovo, {}));
  }

  static async activateSocket() {
    if (game.user.isGM) {
      await GLGame.#caricaSegreto();
      // migrazione dalla 0.2.0: lo stato completo era in chiaro nell'impostazione "partita"
      const pub = game.settings.get(SYSTEM_ID, "partita");
      if (pub && !pub.vista && GLGame.esecutore) await GLGame.#salva({ ...pub, seq: (pub.seq ?? 0) + 1 }, null);
      for (const d of game.collections.get("Setting")?.filter((x) => x.key === `${SYSTEM_ID}.precedente`) ?? []) await d.delete();
    }
    Hooks.on("userConnected", (u, connesso) => connesso && GLGame.esecutore && setTimeout(() => GLGame.#mandaVista(u), 500));
    if (!game.user.isGM) game.socket.emit(CHANNEL, { type: "chiediVista", userId: game.user.id }, GLGame.#aiGM());
    GLGame.#presenza();
    setInterval(() => GLGame.#presenza(), 10000);
    window.addEventListener("beforeunload", () => game.socket.emit(CHANNEL, { type: "addio", sid: GLGame.#sid }));
    game.socket.on(CHANNEL, (msg) => {
      if (msg.type === "presenza") {
        const nuovo = !GLGame.#altriGM.has(msg.sid);
        GLGame.#altriGM.set(msg.sid, { userId: msg.userId, t: Date.now(), chiave: !!msg.chiave });
        if (nuovo && !msg.risposta) GLGame.#presenza(true);
      } else if (msg.type === "addio") {
        GLGame.#altriGM.delete(msg.sid);
      } else if (msg.type === "vista") {
        GLGame.#vista = msg.stato;
        Hooks.callAll("glStateChanged", GLGame.state);
      } else if (msg.type === "chiediVista") {
        if (GLGame.esecutore) GLGame.#mandaVista(game.users.get(msg.userId));
      } else if (msg.type === "action") {
        if (GLGame.esecutore) GLGame.#accoda(msg.action, msg.userId);
      } else if (msg.type === "creaLadro") {
        if (GLGame.esecutore) GLGame.#creaLadro(msg.userId, msg);
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
    if (GLGame.esecutore) return GLGame.#accoda(action, game.user.id);
    game.socket.emit(CHANNEL, { type: "action", userId: game.user.id, action }, GLGame.#aiGM());
  }

  static #accoda(action, userId) {
    const p = GLGame.#coda.then(() => GLGame.#run(action, userId));
    GLGame.#coda = p.catch(() => {});
    return p;
  }

  static async #run(action, userId) {
    const user = game.users.get(userId);
    const st = GLGame.state;
    try {
      if (!user) return;
      if (!st && action.type !== "newGame") throw new EngineError("Nessuna partita in corso.");
      if (!allowed(action, st, user)) {
        throw new EngineError(
          SOLO_GM.has(action.type) || (action.type === "compra" && action.gratis)
            ? "Questa mossa spetta al Croupier."
            : !ladriDi(user, st).length
              ? "Non siedi al Tavolo: il Croupier deve assegnarti un Ladro."
              : ["compra", "accesso", "scasso"].includes(action.type)
                ? "Puoi pagare solo con le tue Carte o con quelle che i complici mostrano alla Banda."
                : "Non puoi fare questa mossa per un altro Ladro.",
        );
      }
      if (st?.vista && action.type !== "reset" && action.type !== "newGame")
        throw new EngineError("Questo browser del Croupier non ha la chiave della partita: continua dal computer che l'ha aperta, oppure importa la chiave con game.gl.importaChiave().");
      if (action.type === "reset") {
        await GLGame.#salva(null, null);
        return;
      }
      if (action.type === "annulla") {
        const prev = GLGame.#precedente;
        if (!prev) throw new EngineError("Non c'è niente da annullare.");
        await GLGame.#salva({ ...prev, seq: (st.seq ?? 0) + 1 }, null);
        await ChatMessage.create({ content: `<div class="gl-chat gl-chat-info">Il Croupier annulla l'ultima mossa.</div>`, speaker: { alias: "Guardie & Ladri" } });
        return;
      }
      const result = action.type === "newGame" ? newGame(action.config) : apply(st, action);
      result.state.seq = (st?.seq ?? 0) + 1;
      await GLGame.#salva(result.state, st);
      for (const e of result.effects) {
        const msg = chatForEffect(e);
        if (!msg) continue;
        await ChatMessage.create({ content: msg, speaker: { alias: "Guardie & Ladri" }, flags: { [SYSTEM_ID]: { effect: e.tipo } } });
      }
    } catch (e) {
      if (e instanceof EngineError) {
        if (userId === game.user.id) ui.notifications.warn(e.message);
        else game.socket.emit(CHANNEL, { type: "error", to: userId, message: e.message }, { recipients: [userId] });
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
    if (GLGame.esecutore) return GLGame.#creaLadro(game.user.id, dati);
    if (!game.users.activeGM) return ui.notifications.error("Serve un GM connesso per creare il Ladro.");
    if (game.user.isGM && !GLGame.esecutore) return game.socket.emit(CHANNEL, { type: "creaLadro", userId: game.user.id, ...dati }, GLGame.#aiGM());
    game.socket.emit(CHANNEL, { type: "creaLadro", userId: game.user.id, ...dati }, GLGame.#aiGM());
  }

  static async #creaLadro(userId, { nome, classe }) {
    const user = game.users.get(userId);
    if (!user) return null;
    const actor = await Actor.create({
      name: nome,
      type: "ladro",
      img: ritratto(classe),
      ownership: user.isGM
        ? { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
        : { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED, [userId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
      system: { classe: classe ?? "gangster" },
    });
    if (userId === game.user.id) actor.sheet.render(true);
    else game.socket.emit(CHANNEL, { type: "ladroCreato", to: userId, actorId: actor.id }, { recipients: [userId] });
    return actor;
  }
}
