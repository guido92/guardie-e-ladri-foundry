/**
 * Il Tavolo di Guardie & Ladri: due Mazzi, carte sul tavolo, mani dei Ladri,
 * pulsanti contestuali per ogni Fase. HTML generato qui, azioni via data-action.
 */
import { GLGame, controlla, ladriDi, SYSTEM_ID } from "../game/gl-game.mjs";
import { carteDaGiocare } from "../game/engine.mjs";
import { cartaHTML } from "./carte-html.mjs";
import { CLASSI, GRADI, LISTINO, ACCESSI, SCASSI, costoAccesso, costoScasso } from "../core/regole.mjs";
import { COMBINAZIONI, migliorCoppia, migliorMano, etichetta, parse, isJolly, trovaCombinazione } from "../core/carte.mjs";

const { ApplicationV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

const FASI = {
  setup: "Preparazione della Banda",
  lavoretti: "Fase 1 · La Preparazione — i Lavoretti",
  fixer: "Fase 1 · L'incontro con il Fixer",
  colpo: "Fase 2 · Il Grande Colpo",
  fuga: "Fase 3 · La Grande Fuga",
  epilogo: "Epilogo",
};

const costoTesto = (tipi) => (tipi.length ? tipi.map((t) => COMBINAZIONI[t].nome).join(" o ") : "nessuna Carta");

/** Ordine di visualizzazione delle carte in mano. */
function ordina(ids) {
  return [...ids].sort((a, b) => {
    if (isJolly(a) || isJolly(b)) return Number(isJolly(a)) - Number(isJolly(b));
    const x = parse(a);
    const y = parse(b);
    return x.v - y.v || x.s.localeCompare(y.s);
  });
}

export class GLTavolo extends ApplicationV2 {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "guardie-e-ladri-tavolo",
    classes: ["guardie-e-ladri", "gl-tavolo"],
    window: { title: "Guardie & Ladri — Il Tavolo", icon: "fa-solid fa-mask", resizable: true, minimizable: true },
    position: { width: 1180, height: 800 },
    actions: {
      sel: GLTavolo.#onSel,
      cmd: GLTavolo.#onCmd,
    },
  };

  /** Carte selezionate (solo su questo client). */
  sel = new Set();

  static open() {
    GLTavolo.instance ??= new GLTavolo();
    GLTavolo.instance.render({ force: true });
    return GLTavolo.instance;
  }

  static onState() {
    const app = GLTavolo.instance;
    if (!app?.rendered) return;
    const st = GLGame.state;
    // tieni solo le selezioni ancora valide
    const presenti = new Set([
      ...(st?.ladri.flatMap((l) => l.mano) ?? []),
      ...Object.values(st?.confronto?.giocate ?? {}).flat(),
      ...(st?.confronto?.croupierMano ?? []),
      ...(st?.mazzetto ?? []),
      ...(st?.bottino?.daScegliere ? st.mazzi.b.pesca : []),
    ]);
    for (const c of [...app.sel]) if (!presenti.has(c)) app.sel.delete(c);
    app.render();
  }

  async close(options) {
    GLTavolo.instance = null;
    return super.close(options);
  }

  // -------------------------------------------------------------------------

  async _prepareContext() {
    return { st: GLGame.state };
  }

  async _renderHTML({ st }) {
    const div = document.createElement("div");
    div.className = "gl-root";
    div.innerHTML = st ? this.#partita(st) : this.#nessunaPartita();
    return div;
  }

  _replaceHTML(result, content) {
    const scroll = content.querySelector(".gl-side")?.scrollTop ?? 0;
    content.replaceChildren(result);
    const side = content.querySelector(".gl-side");
    if (side) side.scrollTop = scroll;
  }

  // ---- senza partita --------------------------------------------------------

  #nessunaPartita() {
    const ladri = game.actors.filter((a) => a.type === "ladro");
    const opzClassi = Object.entries(CLASSI)
      .map(([k, v]) => `<option value="${k}">${v.nome} — ${v.speciale}</option>`)
      .join("");
    const crea = `
      <section class="gl-box">
        <h3>Crea il tuo Ladro</h3>
        <div class="gl-row">
          <input type="text" name="nuovoNome" placeholder="Nome del Ladro" />
          <select name="nuovaClasse">${opzClassi}</select>
          <button type="button" data-action="cmd" data-cmd="creaLadro"><i class="fa-solid fa-user-plus"></i> Crea</button>
        </div>
        <p class="gl-hint">Poi apri la scheda e rispondi alle 3 domande di Background. Se sei Ricercato, spunta la casella: peschi una Carta in più.</p>
      </section>`;
    if (!game.user.isGM) {
      return `<div class="gl-intro">${this.#logo()}<p>In attesa che il Croupier apra il tavolo…</p>${crea}</div>`;
    }
    const righe = ladri.length
      ? ladri
          .map((a) => {
            const owner = game.users.find((u) => !u.isGM && a.testUserPermission(u, "OWNER"));
            return `<label class="gl-check"><input type="checkbox" name="siede" value="${a.id}" ${owner ? "checked" : ""}/> <strong>${esc(a.name)}</strong> · ${CLASSI[a.system.classe]?.nome ?? "?"}${a.system.ricercato ? " · Ricercato" : ""} <span class="gl-hint">${owner ? `(${esc(owner.name)})` : "(nessun giocatore)"}</span></label>`;
          })
          .join("")
      : `<p class="gl-hint">Non ci sono ancora Ladri: createli qui sotto o lasciate che ogni giocatore crei il suo.</p>`;
    return `<div class="gl-intro">${this.#logo()}
      <section class="gl-box">
        <h3>Nuova partita</h3>
        <p class="gl-hint">Scegli da 2 a 4 Ladri (3-5 giocatori contando il Croupier). Il Croupier sei tu.</p>
        <div class="gl-col">${righe}</div>
        <h4>Opzioni</h4>
        <label class="gl-check"><input type="checkbox" name="opt-semi"/> Regola "Come Quando Fuori Piove": in caso di parità decidono i semi (♥ ♦ ♣ ♠)</label>
        <label class="gl-check"><input type="checkbox" name="opt-fixer"/> Le Carte pagate al Fixer escono dal gioco (partita più difficile)</label>
        <label class="gl-check"><input type="checkbox" name="opt-allin" checked/> All-in nella Grande Fuga</label>
        <div class="gl-row"><button type="button" class="gl-primary" data-action="cmd" data-cmd="newGame"><i class="fa-solid fa-play"></i> Apri il tavolo</button></div>
      </section>${crea}</div>`;
  }

  #logo() {
    return `<div class="gl-logo"><span>GUARDIE</span><em>&amp;</em><span>LADRI</span></div>`;
  }

  // ---- partita in corso -----------------------------------------------------

  /** Il giocatore di questo Ladro è collegato? */
  #giocatoreAttivo(l) {
    const owner = l.userId ? game.users.get(l.userId) : game.users.find((u) => !u.isGM && game.actors.get(l.id)?.testUserPermission(u, "OWNER"));
    return !!owner?.active;
  }

  /** Comando io questo Ladro? Il GM comanda quelli il cui giocatore non è collegato. */
  #comando(st, l) {
    if (controlla(game.user, st, l.id)) return true;
    return game.user.isGM && (!this.#giocatoreAttivo(l) || game.settings.get(SYSTEM_ID, "vediTutto"));
  }

  #comandati(st) {
    return st.ladri.filter((l) => this.#comando(st, l));
  }

  /** La mano di questo Ladro è visibile a me? */
  #vede(st, l) {
    if (this.#comando(st, l)) return true;
    const seduto = ladriDi(game.user, st).length > 0;
    if (seduto && (l.mostra || st.fase === "fuga")) return true;
    return false;
  }

  #partita(st) {
    return `<div class="gl-layout">
      <div class="gl-main">
        ${this.#barra(st)}
        ${this.#feltro(st)}
        ${this.#azioni(st)}
      </div>
      <aside class="gl-side">${this.#banda(st)}${this.#strumentiGM(st)}</aside>
    </div>`;
  }

  #barra(st) {
    const acquisti = st.acquisti.map((k) => `<span class="gl-badge gl-badge-gold" title="${esc(LISTINO[k].vantaggio)}">${LISTINO[k].nome}</span>`).join("");
    const guardie =
      st.fase === "colpo" || st.fase === "fuga" || st.mazzetto.length
        ? `<span class="gl-stat" title="Guardie Allertate"><i class="fa-solid fa-person-military-pointing"></i> ${st.colpo.guardie}</span><span class="gl-stat" title="Mazzetto delle Guardie"><i class="fa-solid fa-layer-group"></i> ${st.mazzetto.length}</span>`
        : "";
    const bottino = st.bottinoFinale === true ? `<span class="gl-badge gl-badge-gold"><i class="fa-solid fa-gem"></i> Bottino Finale</span>` : st.bottinoFinale === false ? `<span class="gl-badge">A mani vuote</span>` : "";
    return `<header class="gl-bar">
      <div class="gl-fase">${FASI[st.fase]}</div>
      <div class="gl-stats">
        <span class="gl-stat gl-m-b" title="Mazzo della Banda (pesca / scarti)"><i class="fa-solid fa-clone"></i> ${st.mazzi.b.pesca.length}/${st.mazzi.b.scarti.length}</span>
        <span class="gl-stat gl-m-c" title="Mazzo del Croupier (pesca / scarti)"><i class="fa-solid fa-clone"></i> ${st.mazzi.c.pesca.length}/${st.mazzi.c.scarti.length}</span>
        <span class="gl-stat" title="Jolly custoditi dal Croupier"><i class="fa-solid fa-star"></i> ${st.jolly.length}</span>
        ${guardie}${bottino}${acquisti}
      </div>
    </header>`;
  }

  #feltro(st) {
    const cf = st.confronto;
    if (st.fase === "epilogo") return this.#epilogo(st);
    if (!cf) {
      if (st.bottino) return this.#feltroVuoto("Divisione del Bottino");
      return this.#feltroVuoto(
        {
          setup: "Il Croupier descrive l'ambientazione e il Grande Colpo. I Ladri si presentano.",
          lavoretti: "Un solo giorno per procurarsi le risorse: un Lavoretto a testa, da soli o in coppia.",
          fixer: "Il Fixer apre il suo listino. Pagate in Carte.",
          colpo: "Accesso, Diversivo, Scasso.",
          fuga: "",
        }[st.fase] ?? "",
      );
    }
    const gm = game.user.isGM;
    const scoperte = cf.step === "esito" || cf.scoperte || cf.round === 2 || cf.round === "allin";
    const titolo =
      cf.tipo === "lavoretto"
        ? `Lavoretto ${GRADI[cf.grado].nome}${cf.descrizione ? ` — ${esc(cf.descrizione)}` : ""}${cf.round === 2 ? " · RILANCIO" : ""}`
        : `Grande Fuga${cf.round === "allin" ? " · ALL-IN" : ""}`;
    const tavolo = [0, 1, 2, 3, 4].map((i) => (cf.tavolo[i] ? cartaHTML(cf.tavolo[i]) : `<div class="gl-carta gl-vuota"></div>`)).join("");

    // carte giocate dai Ladri
    const giocate = Object.entries(cf.giocate)
      .map(([k, carte]) => {
        const nome = k === "banda" ? "La Banda" : st.ladri.find((l) => l.id === k)?.nome;
        const mie = k === "banda" ? this.#comandati(st).length > 0 : this.#comando(st, st.ladri.find((l) => l.id === k));
        const html = carte
          .map((c) => {
            const vis = scoperte || mie;
            return cartaHTML(c, { coperta: !vis, sel: this.sel.has(c), azione: vis && cf.step === "esito" ? "sel" : null });
          })
          .join("");
        return `<div class="gl-giocata"><div class="gl-lbl">${esc(nome)}</div><div class="gl-carte">${html}</div></div>`;
      })
      .join("");
    const attesa = cf.step === "river" && cf.tipo === "lavoretto" && cf.round === 1
      ? cf.attivi.filter((id) => !cf.giocate[id]).map((id) => `<div class="gl-giocata gl-attesa"><div class="gl-lbl">${esc(st.ladri.find((l) => l.id === id).nome)}</div><div class="gl-carte">${cartaHTML(null, { dorso: "b" })}</div></div>`).join("")
      : "";

    // il Croupier
    const crouGioca = cf.croupierGioca
      ? cf.croupierGioca.map((c) => cartaHTML(c, { coperta: !(scoperte || gm) })).join("")
      : cf.step === "river"
        ? `<div class="gl-carta gl-vuota"></div><div class="gl-carta gl-vuota"></div>`
        : "";
    const manoC = cf.tipo === "fuga" ? st.mazzetto : cf.croupierMano;
    const manoCroupier = manoC.length
      ? `<div class="gl-crou-mano"><div class="gl-lbl">${cf.tipo === "fuga" ? "Mazzetto delle Guardie" : "Mano del Croupier"} (${manoC.length})</div><div class="gl-carte">${manoC
          .map((c) => (gm ? cartaHTML(c, { mini: manoC.length > 5, sel: this.sel.has(c), azione: cf.step === "river" && !cf.croupierGioca ? "sel" : null }) : cartaHTML(c, { coperta: true, mini: true })))
          .join("")}</div></div>`
      : "";

    const esito = cf.step === "esito" || cf.step === "bottino"
      ? `<div class="gl-esito gl-esito-${cf.esito}">
          <strong>${cf.esito === "successo" ? "SUCCESSO" : "FALLIMENTO"}</strong>
          <span>Ladri: ${cf.manoLadri?.nome ?? "—"} · Croupier: ${cf.manoCroupier?.nome ?? "—"}</span>
        </div>`
      : "";
    const stepNome = { flop: "Il Croupier ha rivelato 3 Carte", turn: "4ª Carta rivelata", river: "Tutte le Carte sono sul tavolo: si gioca", esito: "Esito del Confronto", bottino: "Bottino" }[cf.step];

    return `<section class="gl-feltro">
      <div class="gl-feltro-head"><span class="gl-titolo">${titolo}</span><span class="gl-step">${stepNome}</span></div>
      <div class="gl-zona gl-zona-croupier"><div class="gl-lbl">Croupier</div><div class="gl-carte">${crouGioca}</div>${manoCroupier}</div>
      <div class="gl-zona gl-zona-tavolo"><div class="gl-carte gl-board">${tavolo}</div>${esito}</div>
      <div class="gl-zona gl-zona-ladri">${giocate}${attesa}</div>
    </section>`;
  }

  #feltroVuoto(testo) {
    return `<section class="gl-feltro gl-feltro-vuoto"><div class="gl-logo gl-logo-sm"><span>GUARDIE</span><em>&amp;</em><span>LADRI</span></div><p>${esc(testo)}</p></section>`;
  }

  #epilogo(st) {
    const e = st.esito ?? {};
    const gradi = st.storico.map((x) => `<li>Lavoretto <strong>${GRADI[x.grado].nome}</strong> (${x.partecipanti.map((id) => esc(st.ladri.find((l) => l.id === id)?.nome)).join(" e ")}): ${esc(x.esito)}${x.rilancio ? ", con Rilancio" : ""}</li>`).join("");
    const pentiti = st.ladri.filter((l) => l.pentito).map((l) => esc(l.nome));
    return `<section class="gl-feltro gl-epilogo gl-epi-${e.tipo}">
      <div class="gl-epi-titolo">${esc(e.testo ?? "")}</div>
      ${pentiti.length ? `<p>Pentiti: ${pentiti.join(", ")} (sconto di pena).</p>` : ""}
      <div class="gl-debrief">
        <h4>Al termine dell'avventura</h4>
        <p>Parlate liberamente di com'è andata. Poi leggete insieme gli <em>Appunti sulla Ludopatia</em> del manuale, confrontandoli con i rischi corsi:</p>
        <ul>${gradi || "<li>Nessun Lavoretto.</li>"}</ul>
        <p class="gl-hint">Telefono Verde Nazionale per le problematiche legate al Gioco d'Azzardo: <strong>800 558822</strong> (anonimo e gratuito).</p>
      </div>
    </section>`;
  }

  // ---- la Banda (colonna laterale) ------------------------------------------

  #banda(st) {
    const cf = st.confronto;
    const righe = st.ladri
      .map((l) => {
        const mio = this.#comando(st, l);
        const vede = this.#vede(st, l);
        const badges = [
          l.ricercato ? `<span class="gl-badge gl-badge-red">Ricercato</span>` : "",
          l.pentito ? `<span class="gl-badge">Pentito</span>` : "",
          st.fase === "lavoretti" && l.lavoretto ? `<span class="gl-badge">Lavoretto fatto</span>` : "",
          cf?.attivi?.includes(l.id) ? `<span class="gl-badge gl-badge-green">In gioco</span>` : "",
          cf?.decisioni?.[l.id] ? `<span class="gl-badge">${cf.decisioni[l.id] === "ritira" ? "vuole ritirarsi" : "continua"}</span>` : "",
          cf?.voti?.[l.id] ? `<span class="gl-badge">${cf.voti[l.id]}</span>` : "",
        ].join("");
        const mano = vede
          ? ordina(l.mano).map((c) => cartaHTML(c, { sel: this.sel.has(c), azione: "sel" })).join("") || `<span class="gl-hint">nessuna Carta</span>`
          : l.mano.map(() => cartaHTML(null, { mini: true })).join("") || `<span class="gl-hint">nessuna Carta</span>`;
        const actor = game.actors.get(l.id);
        const mostra = mio
          ? `<label class="gl-check gl-mini-check"><input type="checkbox" data-action="cmd" data-cmd="mostra" data-ladro="${l.id}" ${l.mostra ? "checked" : ""}/> Mostra alla Banda</label>`
          : "";
        return `<div class="gl-ladro ${mio ? "gl-mio" : ""}">
          <div class="gl-ladro-head">
            <img src="${actor?.img ?? "icons/svg/mystery-man.svg"}" alt=""/>
            <div><a data-action="cmd" data-cmd="scheda" data-ladro="${l.id}"><strong>${esc(l.nome)}</strong></a><div class="gl-classe" title="${esc(CLASSI[l.classe].testo)}">${CLASSI[l.classe].nome} · ${CLASSI[l.classe].speciale}</div></div>
            <span class="gl-conta" title="Carte in mano">${l.mano.length}</span>
          </div>
          <div class="gl-badges">${badges}</div>
          <div class="gl-carte gl-mano">${mano}</div>
          ${mostra}
        </div>`;
      })
      .join("");
    const selez = this.sel.size
      ? `<div class="gl-selezione">Selezionate: ${[...this.sel].map(etichetta).join(", ")} <a data-action="cmd" data-cmd="deseleziona">annulla</a>${this.#suggerimentoMano(st)}</div>`
      : `<div class="gl-selezione gl-vuoto">Clicca le Carte per selezionarle.</div>`;
    return `<h3 class="gl-h3">La Banda</h3>${selez}${righe}`;
  }

  #suggerimentoMano(st) {
    const sel = [...this.sel];
    if (sel.length < 2 || !st.confronto || st.confronto.tavolo.length < 3) return "";
    try {
      return ` · con il tavolo: <strong>${migliorMano([...sel, ...st.confronto.tavolo]).nome}</strong>`;
    } catch {
      return "";
    }
  }

  #strumentiGM(st) {
    if (!game.user.isGM) return "";
    const opt = st.ladri.map((l) => `<option value="${l.id}">${esc(l.nome)}</option>`).join("");
    const vedi = game.settings.get(SYSTEM_ID, "vediTutto");
    return `<section class="gl-box gl-gm">
      <h3 class="gl-h3">Croupier</h3>
      <div class="gl-row"><select name="jollyA">${opt}</select><button type="button" data-action="cmd" data-cmd="daiJolly" title="Premia l'interpretazione (max 1 per Ladro per Fase)"><i class="fa-solid fa-star"></i> Dai un Jolly</button></div>
      <div class="gl-row">
        <button type="button" data-action="cmd" data-cmd="annulla"><i class="fa-solid fa-rotate-left"></i> Annulla ultima mossa</button>
        <button type="button" data-action="cmd" data-cmd="reset" class="gl-danger"><i class="fa-solid fa-xmark"></i> Chiudi partita</button>
      </div>
      <label class="gl-check gl-mini-check"><input type="checkbox" data-action="cmd" data-cmd="vediTutto" ${vedi ? "checked" : ""}/> Vedi tutte le mani (sconsigliato: il Croupier non dovrebbe)</label>
    </section>`;
  }

  // ---- pulsanti per Fase ----------------------------------------------------

  #btn(cmd, label, { icon = "", dati = {}, cls = "", disabled = false, title = "" } = {}) {
    const attr = Object.entries(dati).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ");
    return `<button type="button" class="${cls}" data-action="cmd" data-cmd="${cmd}" ${attr} ${disabled ? "disabled" : ""} ${title ? `title="${esc(title)}"` : ""}>${icon ? `<i class="fa-solid fa-${icon}"></i> ` : ""}${label}</button>`;
  }

  #azioni(st) {
    const gm = game.user.isGM;
    const miei = this.#comandati(st);
    const cf = st.confronto;
    const parti = [];

    if (st.fase === "setup") {
      for (const l of miei.filter((x) => x.classe === "gangster" && !x.coppiaPronta)) {
        const valori = ["2", "3", "4", "5", "6", "7", "8", "9", "T"].map((v) => `<option value="${v}">${v === "T" ? "10" : v}</option>`).join("");
        const semi = [["C", "♥"], ["Q", "♦"], ["F", "♣"], ["P", "♠"]].map(([s, sym]) => `<label class="gl-check"><input type="checkbox" name="semeG-${l.id}" value="${s}"/> ${sym}</label>`).join("");
        parti.push(`<div class="gl-box"><h4>${esc(l.nome)}: Asso nella manica</h4><p class="gl-hint">Scegli una Coppia di numeri (2-10) e due semi: la prendi dal Mazzo della Banda.</p>
          <div class="gl-row"><select name="valoreG-${l.id}">${valori}</select>${semi}${this.#btn("coppiaGangster", "Prendi la Coppia", { dati: { ladro: l.id }, icon: "hand" })}</div></div>`);
      }
      const manca = st.ladri.filter((l) => !l.coppiaPronta).map((l) => esc(l.nome));
      if (gm) parti.push(`<div class="gl-row">${this.#btn("distribuisci", "Distribuisci le Carte", { icon: "clone", cls: "gl-primary", disabled: manca.length > 0, title: manca.length ? `Manca la Coppia di ${manca.join(", ")}` : "" })}</div>`);
      if (!parti.length) parti.push(`<p class="gl-hint">Il Croupier sta per distribuire le Carte.</p>`);
    }

    if (st.fase === "lavoretti" && !cf && !st.bottino) {
      const liberi = st.ladri.filter((l) => !l.lavoretto);
      if (gm) {
        const gradi = Object.entries(GRADI).map(([k, g]) => `<option value="${k}">${g.nome} (es. ${g.esempio}) · Croupier ${g.croupier} · Bottino ${g.bottino.n}${g.bottino.scelta ? " a scelta" : ""}</option>`).join("");
        const chi = liberi.map((l) => `<label class="gl-check"><input type="checkbox" name="partecipa" value="${l.id}"/> ${esc(l.nome)} (${l.mano.length})</label>`).join("");
        parti.push(`<div class="gl-box"><h4>Nuovo Lavoretto</h4>
          ${liberi.length ? `<div class="gl-row"><select name="grado">${gradi}</select></div><div class="gl-row"><input type="text" name="descrizione" placeholder="Cosa fanno? (facoltativo)"/></div><div class="gl-row">${chi}</div>
          <div class="gl-row">${this.#btn("lavorettoInizia", "Inizia il Confronto", { icon: "play", cls: "gl-primary" })}</div>` : `<p>Tutti i Ladri hanno fatto il loro Lavoretto.</p>`}
          <div class="gl-row">${this.#btn("faseFixer", "Fine della giornata: incontro con il Fixer", { icon: "handshake" })}</div></div>`);
      } else {
        parti.push(`<p class="gl-hint">Decidete con il Croupier chi fa quale Lavoretto (da soli o in coppia) e con che Grado di Rischio.</p>`);
      }
    }

    if (cf) parti.push(this.#azioniConfronto(st, cf, miei, gm));
    if (st.bottino) parti.push(this.#azioniBottino(st, miei, gm));
    if (st.fase === "fixer") parti.push(this.#azioniFixer(st, miei, gm));
    if (st.fase === "colpo") parti.push(this.#azioniColpo(st, miei, gm));

    return `<section class="gl-azioni">${parti.join("")}</section>`;
  }

  #azioniConfronto(st, cf, miei, gm) {
    const out = [];
    const mieiAttivi = miei.filter((l) => cf.attivi.includes(l.id));
    const sel = [...this.sel];
    if (cf.step === "flop" || cf.step === "turn") {
      for (const l of mieiAttivi.filter((x) => !cf.decisioni[x.id])) {
        let nota = "";
        if (cf.tipo === "lavoretto" && cf.round === 1) nota = cf.step === "flop" ? "Ritirarsi ora non costa nulla (ma niente altri Lavoretti)." : "Ritirarsi ora costa 1 Carta a scelta: selezionala.";
        else if (cf.tipo === "lavoretto") nota = "Ritirarsi dal Rilancio: tenete le Carte giocate ma perdete il Bottino (serve l'accordo di tutti).";
        else nota = "Chi si pente fa scartare a caso 1 Carta alla Banda, ma avrà uno sconto di pena.";
        out.push(`<div class="gl-box"><h4>${esc(l.nome)}</h4><p class="gl-hint">${nota}</p><div class="gl-row">
          ${this.#btn("decidi", "Continuo", { dati: { ladro: l.id, scelta: "continua" }, icon: "forward", cls: "gl-primary" })}
          ${this.#btn("decidi", cf.tipo === "fuga" ? "Mi pento" : "Mi ritiro", { dati: { ladro: l.id, scelta: "ritira" }, icon: "person-walking-arrow-right" })}</div></div>`);
      }
      const attesa = cf.attivi.filter((id) => !cf.decisioni[id]).map((id) => esc(st.ladri.find((l) => l.id === id).nome));
      out.push(`<p class="gl-hint">${attesa.length ? `In attesa di: ${attesa.join(", ")}.` : ""}</p>`);
      if (gm) out.push(`<div class="gl-row">${this.#btn("avanza", "Avanti (chi non ha deciso continua)", { icon: "forward-step" })}${cf.tipo === "lavoretto" ? this.#btn("annullaConfronto", "Annulla il Lavoretto", { icon: "ban" }) : ""}</div>`);
    }
    if (cf.step === "river") {
      if (cf.tipo === "lavoretto" && cf.round === 1) {
        for (const l of mieiAttivi.filter((x) => !cf.giocate[x.id])) {
          const n = carteDaGiocare(st, l.id);
          const mie = sel.filter((c) => l.mano.includes(c));
          out.push(`<div class="gl-box"><h4>${esc(l.nome)}: scegli ${n} Cart${n === 1 ? "a" : "e"} da giocare coperte</h4><div class="gl-row">${this.#btn("gioca", `Gioca ${mie.length}/${n}`, { dati: { ladro: l.id }, icon: "hand", cls: "gl-primary", disabled: mie.length !== n })}${this.#btn("suggerisci", "Suggerisci", { dati: { ladro: l.id }, icon: "lightbulb" })}</div></div>`);
        }
      }
      if (cf.tipo === "fuga" && !cf.giocate.banda && miei.length && !miei.every((l) => l.pentito)) {
        out.push(`<div class="gl-box"><h4>La Banda gioca 2 Carte da tutte le mani</h4><div class="gl-row">${this.#btn("gioca", `Gioca ${sel.length}/2`, { icon: "hand", cls: "gl-primary", disabled: sel.length !== 2 })}${this.#btn("suggerisci", "Suggerisci", { dati: { ladro: "banda" }, icon: "lightbulb" })}</div></div>`);
      }
      if (gm && !cf.croupierGioca) {
        const mano = cf.tipo === "fuga" ? st.mazzetto : cf.croupierMano;
        const n = Math.min(2, mano.length);
        const mie = sel.filter((c) => mano.includes(c));
        out.push(`<div class="gl-box gl-gm"><h4>Croupier: scegli ${n} Carte ${cf.round === 2 || cf.round === "allin" ? "(scoperte)" : "(coperte)"}</h4><div class="gl-row">${this.#btn("croupierGioca", `Gioca ${mie.length}/${n}`, { icon: "hand", cls: "gl-primary", disabled: mie.length !== n })}${this.#btn("suggerisciCroupier", "Le migliori", { icon: "lightbulb" })}</div></div>`);
      }
      const manca = [];
      if (cf.tipo === "lavoretto" && cf.round === 1) manca.push(...cf.attivi.filter((id) => !cf.giocate[id]).map((id) => st.ladri.find((l) => l.id === id).nome));
      if (cf.tipo === "fuga" && !cf.giocate.banda) manca.push("la Banda");
      if (!cf.croupierGioca) manca.push("il Croupier");
      if (manca.length) out.push(`<p class="gl-hint">Devono ancora giocare: ${manca.map(esc).join(", ")}.</p>`);
    }
    if (cf.step === "esito") {
      if (cf.esito === "fallimento") {
        const lady = miei.find((l) => l.classe === "lady" && cf.attivi.includes(l.id));
        if (lady && !cf.ladyUsata) {
          out.push(`<div class="gl-box"><h4>${esc(lady.nome)}: il baciamano</h4><p class="gl-hint">Seleziona una Carta ${cf.tipo === "fuga" ? "della Banda" : "della tua mano"} e una delle Carte rivelate dai Ladri, poi scambiale.</p><div class="gl-row">${this.#btn("baciamano", "Scambia", { dati: { ladro: lady.id }, icon: "right-left", cls: "gl-primary" })}</div></div>`);
        }
        const puoAccettare = gm || (cf.tipo === "fuga" ? miei.length : mieiAttivi.length);
        const allIn = cf.tipo === "fuga" && st.opzioni.allIn && cf.round !== "allin" && cf.attivi.length;
        if (puoAccettare)
          out.push(`<div class="gl-row">${this.#btn("accetta", cf.tipo === "fuga" ? "Arrendersi alle Guardie" : "Accettare il Fallimento", { icon: "handcuffs" })}${allIn ? this.#btn("allIn", "All-in: rinunciare al Bottino e giocarsi tutto", { icon: "dice", cls: "gl-danger" }) : ""}</div>`);
      } else if (cf.tipo === "lavoretto") {
        for (const l of mieiAttivi.filter((x) => !cf.voti[x.id])) {
          const g = GRADI[cf.grado];
          out.push(`<div class="gl-box"><h4>${esc(l.nome)}: Successo!</h4><p class="gl-hint">Incassate il Bottino (${g.bottino.n}${g.bottino.scelta ? " a scelta" : ""}) o Rilanciate per il Bonus (+${g.bonus.n}) rischiando tutto. Si rilancia solo se tutti sono d'accordo.</p><div class="gl-row">
            ${this.#btn("vota", "Incassa", { dati: { ladro: l.id, scelta: "incassa" }, icon: "sack-dollar", cls: "gl-primary" })}
            ${cf.round === 1 ? this.#btn("vota", "Rilancia!", { dati: { ladro: l.id, scelta: "rilancia" }, icon: "arrow-up-right-dots", cls: "gl-danger" }) : ""}</div></div>`);
        }
      }
    }
    return out.join("");
  }

  #azioniBottino(st, miei, gm) {
    const b = st.bottino;
    const mieiP = miei.filter((l) => b.partecipanti.includes(l.id));
    if (b.daScegliere) {
      if (!mieiP.length && !gm) return `<p class="gl-hint">I Ladri scelgono il Bottino dal Mazzo della Banda.</p>`;
      const carte = ordina(st.mazzi.b.pesca).map((c) => cartaHTML(c, { mini: true, sel: this.sel.has(c), azione: "sel" })).join("");
      const quanti = [...this.sel].filter((c) => st.mazzi.b.pesca.includes(c)).length;
      return `<div class="gl-box"><h4>Bottino: scegliete ${b.daScegliere} Carte dal Mazzo della Banda</h4><div class="gl-carte gl-scelta">${carte}</div>
        <div class="gl-row">${this.#btn("bottinoScegli", `Prendi ${quanti}/${b.daScegliere}`, { dati: { ladro: (mieiP[0] ?? st.ladri.find((l) => b.partecipanti.includes(l.id))).id }, icon: "sack-dollar", cls: "gl-primary", disabled: quanti !== b.daScegliere })}</div></div>`;
    }
    const puo = gm || mieiP.length;
    const righe = b.carte
      .map(
        (c) =>
          `<div class="gl-row">${cartaHTML(c, { mini: true })} ${puo ? b.partecipanti.map((id) => this.#btn("bottinoAssegna", `a ${esc(st.ladri.find((l) => l.id === id).nome)}`, { dati: { carta: c, a: id } })).join("") : ""}</div>`,
      )
      .join("");
    return `<div class="gl-box"><h4>Dividetevi il Bottino</h4>${righe}${puo ? `<div class="gl-row">${this.#btn("bottinoDividi", "Non siamo d'accordo: mescola e distribuisci", { icon: "shuffle" })}</div>` : ""}</div>`;
  }

  #azioniFixer(st, miei, gm) {
    const sel = [...this.sel];
    const seduto = miei.length > 0;
    const righe = Object.entries(LISTINO)
      .map(([k, v]) => {
        const preso = st.acquisti.includes(k);
        const ok = !preso && sel.length && (() => {
          try {
            return trovaCombinazione(v.costo, sel)?.length === sel.length;
          } catch {
            return false;
          }
        })();
        const dest = v.jolly && !preso ? `<select name="dest-${k}">${st.ladri.map((l) => `<option value="${l.id}" ${miei[0]?.id === l.id ? "selected" : ""}>Jolly a ${esc(l.nome)}</option>`).join("")}</select>` : "";
        return `<tr class="${preso ? "gl-preso" : ""}"><td><strong>${v.nome}</strong></td><td>${v.costoTesto}</td><td>${v.vantaggio}</td><td class="gl-nowrap">${
          preso
            ? `<span class="gl-badge gl-badge-gold">Acquistato</span>`
            : `${dest}${seduto || gm ? this.#btn("compra", "Paga", { dati: { oggetto: k }, icon: "coins", disabled: !ok, title: ok ? "" : `Seleziona esattamente ${v.costoTesto}` }) : ""}${gm ? this.#btn("compra", "Regala", { dati: { oggetto: k, gratis: 1 }, title: "Il Fixer fa uno sconto (o un favore)" }) : ""}`
        }</td></tr>`;
      })
      .join("");
    return `<div class="gl-box"><h4>Il listino del Fixer</h4><p class="gl-hint">Selezionate le Carte (anche da mani diverse, se mostrate) che formano il prezzo. Non si compra due volte lo stesso articolo.</p>
      <table class="gl-listino"><thead><tr><th>Articolo</th><th>Costo</th><th>Vantaggio</th><th></th></tr></thead><tbody>${righe}</tbody></table>
      ${gm ? `<div class="gl-row">${this.#btn("faseColpo", "Passa al Grande Colpo", { icon: "building-columns", cls: "gl-primary" })}</div>` : ""}</div>`;
  }

  #azioniColpo(st, miei, gm) {
    const out = [];
    const seduto = miei.length > 0 || gm;
    const intellettuale = st.ladri.some((l) => l.classe === "intellettuale");
    if (!st.colpo.accesso) {
      const righe = Object.entries(ACCESSI)
        .map(([k, v]) => {
          const bloccato = v.richiede && !st.acquisti.includes(v.richiede);
          const costo = costoAccesso(k, st.acquisti);
          return `<tr><td><strong>${v.nome}</strong>${bloccato ? `<div class="gl-hint">Serve la ${LISTINO[v.richiede].nome}</div>` : ""}</td><td>${costoTesto(costo)}</td><td>${seduto ? this.#btn("accesso", "Entra", { dati: { tipo: k }, icon: "door-open", disabled: bloccato }) : ""}</td></tr>`;
        })
        .join("");
      out.push(`<div class="gl-box"><h4>L'Accesso</h4><p class="gl-hint">Selezionate le Carte del costo, se serve. Ogni Guardia Allertata aggiunge 3 Carte al Mazzetto delle Guardie.</p><table class="gl-listino">${righe}</table></div>`);
    } else if (!st.colpo.scasso) {
      if (st.colpo.guardie && st.mazzetto.length) {
        const dv = miei.filter((l) => !st.colpo.diversivo.includes(l.id) && l.mano.length);
        if (dv.length)
          out.push(`<div class="gl-box"><h4>Il Diversivo</h4><p class="gl-hint">Ogni Ladro può sacrificare una Carta (scelta a caso dal Croupier) per far scartare ${st.colpo.guardie} Carte dal Mazzetto delle Guardie.</p><div class="gl-row">${dv.map((l) => this.#btn("diversivo", `Diversivo di ${esc(l.nome)}`, { dati: { ladro: l.id }, icon: "smog" })).join("")}</div></div>`);
      }
      const righe = Object.entries(SCASSI)
        .map(([k, v]) => {
          const bloccato = v.richiede && !st.acquisti.includes(v.richiede);
          const costo = k === "nessuno" ? [] : costoScasso(k, { intellettuale });
          return `<tr><td><strong>${v.nome}</strong>${bloccato ? `<div class="gl-hint">Serve: ${LISTINO[v.richiede].nome}</div>` : ""}</td><td>${k === "nessuno" ? "si fugge a mani vuote, 1 Guardia per Ladro" : costoTesto(costo)}</td><td>${seduto ? this.#btn("scasso", k === "nessuno" ? "Rinuncia" : "Scassina", { dati: { tipo: k }, icon: k === "nessuno" ? "person-running" : "unlock", disabled: bloccato }) : ""}</td></tr>`;
        })
        .join("");
      out.push(`<div class="gl-box"><h4>Lo Scasso</h4>${intellettuale ? `<p class="gl-hint">Eureka: l'Intellettuale dimezza le Guardie dello Scasso Tecnico e permette il Brutale con una Doppia coppia.</p>` : ""}<table class="gl-listino">${righe}</table></div>`);
    } else if (gm) {
      out.push(`<div class="gl-row">${this.#btn("faseFuga", "Inizia la Grande Fuga", { icon: "car-side", cls: "gl-primary" })}</div>`);
    } else {
      out.push(`<p class="gl-hint">Il Croupier descrive le vie di Fuga e l'arrivo delle forze dell'ordine…</p>`);
    }
    return out.join("");
  }

  // ---- interazione ------------------------------------------------------------

  static #onSel(event, target) {
    const c = target.dataset.carta;
    if (!c) return;
    if (this.sel.has(c)) this.sel.delete(c);
    else this.sel.add(c);
    this.render();
  }

  static async #onCmd(event, target) {
    const d = target.dataset;
    const st = GLGame.state;
    const sel = [...this.sel];
    const val = (name) => this.element.querySelector(`[name="${name}"]`)?.value;
    const send = async (action) => {
      await GLGame.dispatch(action);
    };
    switch (d.cmd) {
      case "creaLadro":
        return GLGame.creaLadro({ nome: val("nuovoNome"), classe: val("nuovaClasse") });
      case "newGame": {
        const ids = [...this.element.querySelectorAll('input[name="siede"]:checked')].map((i) => i.value);
        if (ids.length < 2 || ids.length > 4) return ui.notifications.warn("Scegli da 2 a 4 Ladri.");
        const ladri = ids.map((id) => {
          const a = game.actors.get(id);
          const owner = game.users.find((u) => !u.isGM && a.testUserPermission(u, "OWNER"));
          return { id, nome: a.name, classe: a.system.classe, ricercato: a.system.ricercato, userId: owner?.id ?? null };
        });
        const chk = (n) => !!this.element.querySelector(`[name="${n}"]`)?.checked;
        return send({ type: "newGame", config: { ladri, opzioni: { semi: chk("opt-semi"), fixerElimina: chk("opt-fixer"), allIn: chk("opt-allin") } } });
      }
      case "reset": {
        const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Chiudere la partita?" }, content: "<p>La partita in corso viene chiusa (si può ancora annullare con «Annulla ultima mossa»).</p>" });
        if (ok) return send({ type: "reset" });
        return;
      }
      case "annulla":
        return send({ type: "annulla" });
      case "vediTutto":
        await game.settings.set(SYSTEM_ID, "vediTutto", target.checked);
        return this.render();
      case "deseleziona":
        this.sel.clear();
        return this.render();
      case "scheda":
        return game.actors.get(d.ladro)?.sheet.render(true);
      case "mostra":
        return send({ type: "mostra", ladro: d.ladro, mostra: target.checked });
      case "coppiaGangster": {
        const semi = [...this.element.querySelectorAll(`input[name="semeG-${d.ladro}"]:checked`)].map((i) => i.value);
        return send({ type: "coppiaGangster", ladro: d.ladro, valore: val(`valoreG-${d.ladro}`), semi });
      }
      case "lavorettoInizia": {
        const partecipanti = [...this.element.querySelectorAll('input[name="partecipa"]:checked')].map((i) => i.value);
        return send({ type: "lavorettoInizia", grado: val("grado"), partecipanti, descrizione: val("descrizione") || "" });
      }
      case "decidi": {
        const l = st.ladri.find((x) => x.id === d.ladro);
        const carta = sel.find((c) => l?.mano.includes(c));
        if (d.scelta === "ritira" && st.confronto?.tipo === "lavoretto" && st.confronto.round === 1 && st.confronto.step === "turn" && !carta)
          return ui.notifications.warn("Seleziona la Carta che perdi ritirandoti.");
        await send({ type: "decidi", ladro: d.ladro, scelta: d.scelta, carta });
        break;
      }
      case "gioca": {
        if (st.confronto?.tipo === "fuga") await send({ type: "gioca", carte: sel.filter((c) => st.ladri.some((l) => l.mano.includes(c))) });
        else {
          const l = st.ladri.find((x) => x.id === d.ladro);
          await send({ type: "gioca", ladro: d.ladro, carte: sel.filter((c) => l.mano.includes(c)) });
        }
        break;
      }
      case "suggerisci": {
        const cf = st.confronto;
        const mano = d.ladro === "banda" ? st.ladri.flatMap((l) => l.mano) : st.ladri.find((l) => l.id === d.ladro).mano;
        const n = d.ladro === "banda" ? 2 : carteDaGiocare(st, d.ladro);
        if (n === 1) {
          // in coppia: la carta che, insieme a quelle note, migliora di più la mano
          let best = null;
          for (const c of mano) {
            const m = migliorMano([c, ...cf.tavolo]);
            if (!best || m.punti.join() > best.m.punti.join()) best = { c, m };
          }
          this.sel = new Set(best ? [best.c] : []);
        } else {
          const best = migliorCoppia(mano, cf.tavolo);
          this.sel = new Set(best?.carte ?? []);
        }
        return this.render();
      }
      case "suggerisciCroupier": {
        const cf = st.confronto;
        const mano = cf.tipo === "fuga" ? st.mazzetto : cf.croupierMano;
        const best = mano.length >= 2 ? migliorCoppia(mano, cf.tavolo) : { carte: mano };
        this.sel = new Set(best.carte);
        return this.render();
      }
      case "croupierGioca": {
        const cf = st.confronto;
        const mano = cf.tipo === "fuga" ? st.mazzetto : cf.croupierMano;
        await send({ type: "croupierGioca", carte: sel.filter((c) => mano.includes(c)) });
        break;
      }
      case "baciamano": {
        const cf = st.confronto;
        const giocate = Object.values(cf.giocate).flat();
        const giocata = sel.find((c) => giocate.includes(c));
        const mano = sel.find((c) => !giocate.includes(c) && st.ladri.some((l) => l.mano.includes(c)));
        if (!giocata || !mano) return ui.notifications.warn("Seleziona una Carta in mano e una delle Carte giocate dai Ladri.");
        await send({ type: "baciamano", ladro: d.ladro, mano, giocata });
        break;
      }
      case "bottinoScegli":
        await send({ type: "bottinoScegli", ladro: d.ladro, carte: sel.filter((c) => st.mazzi.b.pesca.includes(c)) });
        break;
      case "bottinoAssegna":
        return send({ type: "bottinoAssegna", carta: d.carta, a: d.a });
      case "compra": {
        const voce = LISTINO[d.oggetto];
        await send({ type: "compra", oggetto: d.oggetto, carte: d.gratis ? [] : sel, gratis: !!d.gratis, destinatario: voce.jolly ? val(`dest-${d.oggetto}`) : undefined });
        break;
      }
      case "accesso":
        await send({ type: "accesso", tipo: d.tipo, carte: costoAccesso(d.tipo, st.acquisti).length ? sel : [] });
        break;
      case "scasso": {
        const costo = d.tipo === "nessuno" ? [] : costoScasso(d.tipo, { intellettuale: st.ladri.some((l) => l.classe === "intellettuale") });
        await send({ type: "scasso", tipo: d.tipo, carte: costo.length ? sel : [] });
        break;
      }
      case "daiJolly":
        return send({ type: "daiJolly", ladro: val("jollyA") });
      default: {
        // azioni senza parametri o con i soli data-*
        const { cmd, action, ...rest } = d;
        await send({ type: cmd, ...rest });
      }
    }
    this.sel.clear();
    this.render();
  }
}
