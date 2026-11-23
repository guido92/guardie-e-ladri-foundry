/** Guida: come si usa il Tavolo, regole in sintesi, sicurezza e crediti. */
import { arte, ritratto } from "../data/arte.mjs";
import { CLASSI, GRADI, LISTINO } from "../core/regole.mjs";

const { ApplicationV2 } = foundry.applications.api;

const PAGINE = [
  ["intro", "Benvenuti"],
  ["tavolo", "Il Tavolo"],
  ["regole", "Regole in breve"],
  ["classi", "Le Classi"],
  ["sicurezza", "Sicurezza"],
  ["crediti", "Crediti"],
];

function intro() {
  return `
    <div class="gl-g-hero"><img src="${arte("copertina")}" alt="Copertina di Guardie & Ladri"/>
      <div>
        <img class="gl-g-logo" src="${arte("logo")}" alt="Guardie & Ladri"/>
        <p class="gl-g-lead">Un GDR d'azione, cooperativo e rules-light per 3-5 giocatori: i Ladri preparano il Grande Colpo con una serie di Lavoretti sporchi, comprano l'attrezzatura dal Fixer, svaligiano il bersaglio e provano a seminare le Guardie.</p>
        <p>Il <strong>Croupier</strong> (il Master) descrive il mondo e mette alla prova la Banda, ma non gioca contro di lei: a decidere sono le Carte, con le regole del Poker Texas hold'em.</p>
        <p>Una sessione dura un paio d'ore e non richiede preparazione. Questo sistema gestisce mazzi, Confronti, Fixer e Fasi: <strong>il manuale resta indispensabile</strong> per il racconto, gli esempi e gli Appunti sulla Ludopatia.</p>
      </div>
    </div>
    <div class="gl-g-banda">${["gangster", "lady", "meccanico", "intellettuale"].map((c) => `<figure><img src="${ritratto(c)}" alt=""/><figcaption>${CLASSI[c].nome}</figcaption></figure>`).join("")}</div>`;
}

function tavolo() {
  return `
    <h2 class="gl-g-banner">Il Tavolo</h2>
    <p>Si apre dall'icona della maschera nei controlli a sinistra, dal pulsante in cima alla chat o con <kbd>Alt</kbd>+<kbd>T</kbd>.</p>
    <ol>
      <li><strong>Prima della partita</strong>: ogni giocatore crea il suo Ladro dal Tavolo e compila la scheda (Classe, aspetto, le 3 domande di Background, Ricercato sì o no). Il Croupier sceglie da 2 a 4 Ladri e apre il tavolo.</li>
      <li><strong>Le Carte</strong> si selezionano con un clic (si alzano con un bordo dorato) e si usano con il pulsante della mossa. "Suggerisci" propone le Carte migliori.</li>
      <li><strong>Chi vede cosa</strong>: ognuno vede solo la propria mano; con "Mostra alla Banda" la si fa vedere ai complici. Il Croupier non vede le mani dei giocatori collegati. Nella Grande Fuga la Banda gioca come un'unica mano e la vede tutta.</li>
      <li><strong>Mazzi</strong>: in alto i contatori pesca/scarti del Mazzo della Banda (blu) e del Croupier (rosso), i Jolly del Croupier, le Guardie Allertate e il Mazzetto delle Guardie. Le carte del Croupier hanno un pallino rosso.</li>
      <li><strong>Il Croupier</strong> avvia Lavoretti e Fasi, gioca le sue Carte, premia l'interpretazione con un Jolly, può annullare l'ultima mossa o chiudere la partita.</li>
      <li>Ogni passaggio finisce anche in <strong>chat</strong>, con le Carte del Confronto.</li>
    </ol>
    <p class="gl-g-nota">Serve sempre un GM connesso: le mosse dei giocatori passano dal suo client, che controlla le regole.</p>`;
}

function regole() {
  const gradi = Object.values(GRADI)
    .map((g) => `<tr><td><strong>${g.nome}</strong><div class="gl-g-mini">${g.esempio}</div></td><td>${g.croupier}</td><td>${g.bottino.n}${g.bottino.scelta ? " a scelta" : ""}</td><td>+${g.bonus.n}${g.bonus.scelta ? " a scelta" : ""}</td></tr>`)
    .join("");
  const listino = Object.values(LISTINO)
    .map((v) => `<tr><td><strong>${v.nome}</strong></td><td>${v.costoTesto}</td><td>${v.vantaggio}</td></tr>`)
    .join("");
  return `
    <h2 class="gl-g-banner">Il Confronto</h2>
    <img class="gl-g-float" src="${arte("jolly")}" alt=""/>
    <p>Il Croupier gira 3 Carte del Mazzo della Banda. Chi si ritira ora non perde nulla. Poi gira la 4ª: chi si ritira perde una Carta a scelta. Poi la 5ª: non ci si ritira più. Il Croupier pesca dal suo Mazzo quante Carte dice il Grado di Rischio e ne sceglie 2; i Ladri posano le loro coperte (2 da soli, 1 a testa in coppia). Vince la mano di Poker migliore con le 5 Carte sul tavolo: <strong>in caso di parità vince il Croupier</strong>. I Jolly valgono qualsiasi carta.</p>
    <p>Dopo un Successo si può <strong>Rilanciare</strong>: le Carte dei Ladri restano scoperte, il tavolo si rimescola, il Croupier torna al suo numero di Carte e si rigioca per Bottino + Bonus. Se va male si perde tutto.</p>
    <h2 class="gl-g-banner">Fase 1 · La Preparazione</h2>
    <p>Ogni Ladro pesca 2 Carte (i Ricercati 3) e fa un solo Lavoretto, da solo o in coppia.</p>
    <table class="gl-g-tab"><thead><tr><th>Grado</th><th>Carte del Croupier</th><th>Bottino</th><th>Bonus Rilancio</th></tr></thead><tbody>${gradi}</tbody></table>
    <p>A fine giornata la Banda incontra il <strong>Fixer</strong> e paga in Carte (anche mettendo insieme le mani). Chi arriva con meno di 2 Carte in tutto diventa Ricercato.</p>
    <table class="gl-g-tab"><thead><tr><th>Articolo</th><th>Costo</th><th>Vantaggio</th></tr></thead><tbody>${listino}</tbody></table>
    <h2 class="gl-g-banner">Fase 2 · Il Grande Colpo</h2>
    <img class="gl-g-wide" src="${arte("caveau")}" alt=""/>
    <p><strong>Accesso</strong>: Secondario (serve la Mappa), in Incognito o Teatrale. Ogni Guardia Allertata aggiunge 3 Carte al Mazzetto delle Guardie. <strong>Diversivo</strong>: ogni Ladro può sacrificare una Carta per sfoltire il Mazzetto. <strong>Scasso</strong>: Professionale (con la Combinazione), Tecnico (con gli Attrezzi), Brutale, oppure si fugge a mani vuote.</p>
    <h2 class="gl-g-banner">Fase 3 · La Grande Fuga</h2>
    <img class="gl-g-wide" src="${arte("fuga")}" alt=""/>
    <p>Il Mazzetto riceve 1 Carta per Ladro (meno, con l'Auto da corsa). Se resta con meno di 2 Carte la Banda scappa; se è la Banda ad averne meno di 2, finisce in gattabuia. Altrimenti Confronto con tutte le mani unite: al flop chi si pente si consegna (sconto di pena) e fa perdere una Carta alla Banda. Dopo un Fallimento, l'<strong>All-in</strong> opzionale: si rinuncia al Bottino per giocarsi la libertà.</p>`;
}

function classi() {
  return Object.entries(CLASSI)
    .map(
      ([k, c]) => `<div class="gl-g-classe"><img src="${ritratto(k)}" alt=""/><div><h2 class="gl-g-banner">${c.nome}</h2><div class="gl-g-speciale"><span>Caratteristica Speciale</span><strong>${c.speciale}</strong></div><p>${c.testo}</p></div></div>`,
    )
    .join("");
}

function sicurezza() {
  return `
    <h2 class="gl-g-banner">Prima di cominciare</h2>
    <p>Guardie &amp; Ladri può essere scanzonato o cupo: criminalità, violenza, armi. Parlatene prima e fissate <strong>Linee</strong> (temi esclusi) e <strong>Veli</strong> (temi che restano fuori scena), da rivedere quando serve.</p>
    <h2 class="gl-g-banner">Durante la sessione</h2>
    <p>Concordate un segno (per esempio alzare la mano) per fermare o riformulare una scena, e prendetevi delle pause.</p>
    <h2 class="gl-g-banner">Alla fine</h2>
    <p>Parlate di com'è andata e leggete insieme gli <em>Appunti sulla Ludopatia</em> del manuale: l'Epilogo del Tavolo riepiloga i Gradi di Rischio corsi dalla Banda proprio per questo confronto.</p>
    <p class="gl-g-nota">Telefono Verde Nazionale per le problematiche legate al Gioco d'Azzardo (Istituto Superiore di Sanità): <strong>800 558822</strong>, anonimo e gratuito.</p>`;
}

function crediti() {
  return `
    <div class="gl-g-hero"><img src="${arte("berretto")}" alt=""/>
      <div>
        <h2 class="gl-g-banner">Guardie &amp; Ladri — il GDR</h2>
        <dl class="gl-g-cred">
          <dt>Un gioco di</dt><dd>Atropo Kelevra, Valentino Sergi (Officina Meningi)</dd>
          <dt>Regolamento</dt><dd>Alessandro Buniotto, Elena Mutti (Boardgames Academy)</dd>
          <dt>Illustrazioni</dt><dd>Luca Erbetta</dd>
          <dt>Graphic design</dt><dd>Carolina Fiandri</dd>
          <dt>Sviluppo</dt><dd>Officina Meningi — prima edizione, gennaio 2025</dd>
          <dt>Iniziativa editoriale</dt><dd>Auser "Un Po di Giochi", progetto "Giochi di Comunità" (Piano GAP - ATS Val Padana), con AUSER Dosolo/Pomponesco, Azienda Speciale Consortile Oglio Po, Consorzio Casalasco Servizi alla Persona, Fondazione ARCA Centro Mantovano di Solidarietà Onlus, Arca Formazione, CSV Lombardia Sud ETS</dd>
          <dt>Ringraziamenti</dt><dd>Dr.ssa Sonia Rita Piana, Boardgames Academy, Sabrina Romeo</dd>
        </dl>
        <h2 class="gl-g-banner">Questo sistema per Foundry VTT</h2>
        <p>Sistema non ufficiale realizzato da <strong>Michael Guidotti</strong> per la <strong>Taverna di Guido</strong>, con il consenso degli autori. Il codice è sotto licenza MIT; il gioco, i testi, le tabelle e le illustrazioni appartengono ai rispettivi autori. Per giocare serve il manuale, scaricabile gratis da <a href="https://officinameningi.it/guardie-ladri-il-gdr/" target="_blank">officinameningi.it</a>.</p>
        <p class="gl-g-mini">Sistema creato con il supporto dell'intelligenza artificiale.</p>
      </div>
    </div>`;
}

const RENDER = { intro, tavolo, regole, classi, sicurezza, crediti };

export class GLGuida extends ApplicationV2 {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "guardie-e-ladri-guida",
    classes: ["guardie-e-ladri", "gl-guida"],
    window: { title: "Guardie & Ladri — Guida, regole e crediti", icon: "fa-solid fa-book-open", resizable: true },
    position: { width: 860, height: 760 },
    actions: { pagina: GLGuida.#onPagina },
  };

  pagina = "intro";

  static open(pagina = "intro") {
    GLGuida.instance ??= new GLGuida();
    GLGuida.instance.pagina = pagina;
    GLGuida.instance.render({ force: true });
    return GLGuida.instance;
  }

  async close(options) {
    GLGuida.instance = null;
    return super.close(options);
  }

  async _renderHTML() {
    const div = document.createElement("div");
    div.className = "gl-g-root";
    const tabs = PAGINE.map(([k, t]) => `<button type="button" data-action="pagina" data-pagina="${k}" class="${k === this.pagina ? "is-active" : ""}">${t}</button>`).join("");
    div.innerHTML = `<nav class="gl-g-tabs">${tabs}</nav><article class="gl-g-pagina gl-g-${this.pagina}">${RENDER[this.pagina]()}</article>`;
    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  static #onPagina(event, target) {
    this.pagina = target.dataset.pagina;
    this.render();
  }
}
