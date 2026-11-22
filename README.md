# Guardie & Ladri — sistema per Foundry VTT

Sistema **non ufficiale** per giocare a *Guardie & Ladri* (Atropo Kelevra, 2025 — di Valentino Sergi, Alessandro Buniotto ed Elena Mutti, illustrazioni di Luca Erbetta) su Foundry Virtual Tabletop v13/v14. Serve il manuale: qui c'è il tavolo, non il regolamento.

Sviluppato con il consenso di Alessandro Buniotto e promosso dalla Taverna di Guido.

## Cosa fa

- **I due Mazzi da Poker** (Banda e Croupier) e i **4 Jolly** custoditi dal Croupier, con mescolate e scarti gestiti dal tavolo.
- **Il Confronto** alla Texas hold'em: flop, turn e river, il ritiro gratuito o con perdita di una Carta, le Carte coperte, il **Rilancio** con Bottino e Bonus, la **Tabella del Grado di Rischio** (Banale, Discreto, Tosto, Esagerato). Valutazione delle mani automatica, Jolly che valgono qualsiasi carta, carte identiche dei due mazzi che non fanno coppia, regola opzionale "Come Quando Fuori Piove".
- **Le quattro Classi** con la loro Caratteristica Speciale: Asso nella manica (Gangster), Il baciamano (Lady), Versatile (Meccanico), Eureka (Intellettuale). Ricercati con la Carta in più.
- **Il Fixer**: listino completo, pagamento con combinazioni verificate (anche con Carte di mani diverse), Jolly di Fumogeni e Attrezzi, Documenti falsi, sconti del Croupier.
- **Il Grande Colpo**: Accesso (Secondario, Incognito, Teatrale), Guardie Allertate e Mazzetto delle Guardie, Diversivo, Scasso (Professionale, Tecnico, Brutale o a mani vuote).
- **La Grande Fuga**: Auto da corsa, Pentiti, Confronto con la mano unica della Banda, **All-in** opzionale.
- **Epilogo** con il riepilogo dei rischi corsi, per il confronto finale con gli *Appunti sulla Ludopatia* del manuale.
- Schede dei Ladri con le 3 domande di Background; messaggi in chat con le carte; "Annulla ultima mossa" per il Croupier.

## Come si gioca

1. Il Croupier (GM) crea il mondo con il sistema *Guardie & Ladri*. Ogni giocatore crea il suo Ladro dal Tavolo (lo crea il GM per lui) e compila la scheda.
2. Il Croupier apre il **Tavolo** (icona maschera nei controlli, pulsante in chat o `Alt+T`), sceglie da 2 a 4 Ladri e apre la partita.
3. Tutto si fa dal Tavolo: si cliccano le Carte per selezionarle, poi il pulsante della mossa. Ognuno vede la propria mano; ogni Ladro può mostrarla alla Banda; nella Grande Fuga la Banda gioca come un'unica mano.

Serve un GM connesso: le mosse dei giocatori passano al suo client, che controlla le regole e salva lo stato.

> Le Carte nascoste (mani degli altri, mano del Croupier) non vengono mostrate dall'interfaccia, ma lo stato della partita è condiviso tra i client: chi sa usare la console del browser potrebbe sbirciare. È un gioco tra amici.

## Installazione

Da manifesto (quando pubblicato): incolla l'URL del `system.json` in *Installa sistema*.

In sviluppo: collega la cartella del repo in `Data/systems/guardie-e-ladri` (junction su Windows) e riavvia Foundry.

## Sviluppo

```
npm test                         # test delle regole (node --test)
node tools/build.mjs --repo owner/repo   # zip + manifesto in dist/
```

Struttura: `module/core` (carte e tabelle, funzioni pure), `module/game/engine.mjs` (macchina a stati pura), `module/game/gl-game.mjs` (stato, socket, permessi), `module/apps/tavolo.mjs` (il Tavolo). Contratto del motore in [docs/API.md](docs/API.md).

## Licenza

Codice MIT. Il gioco *Guardie & Ladri*, i suoi testi, tabelle e illustrazioni appartengono a Atropo Kelevra e agli autori.
