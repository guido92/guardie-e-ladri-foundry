# Contratto del motore

`module/game/engine.mjs` — funzioni pure, nessun riferimento a Foundry.

- `newGame({ ladri, seed?, opzioni? }) -> { state, effects }`
  - `ladri`: 1-4 elementi `{ id, nome, classe: "gangster"|"lady"|"meccanico"|"intellettuale", ricercato?, userId? }`
  - `opzioni`: `{ semi: false, fixerElimina: false, allIn: true }`
- `apply(state, { type, ...parametri }) -> { state, effects }` — lancia `EngineError` se la mossa non è legale. Lo stato in ingresso non viene modificato.
- `carteDaGiocare(state, ladroId)` — quante Carte deve posare quel Ladro al river del Lavoretto.

## Carte

Stringhe `"<mazzo>:<valore><seme>"`: mazzo `b` (Banda) o `c` (Croupier); valore `2-9 T J Q K A`; seme `C` cuori, `Q` quadri, `F` fiori, `P` picche. Jolly `j:1`..`j:4`.
`module/core/carte.mjs`: `migliorMano(ids)`, `confronta(manoLadri, manoCroupier, { semi })` (> 0 vincono i Ladri), `formaCombinazione(tipi, ids)`, `trovaCombinazione`, `migliorCoppia(mano, tavolo)`.

## Stato

```
{ fase: "setup"|"lavoretti"|"fixer"|"colpo"|"fuga"|"epilogo",
  mazzi: { b: { pesca, scarti }, c: { pesca, scarti } }, jolly: [...], eliminate: [...],
  ladri: [{ id, nome, classe, userId, ricercato, mano, lavoretto, pentito, mostra, jollyFasi, coppiaPronta }],
  acquisti: [chiavi del LISTINO], confronto: null|{...}, bottino: null|{ carte, daScegliere, partecipanti },
  colpo: { accesso, scasso, diversivo: [ids], guardie }, mazzetto: [...], bottinoFinale: null|bool,
  esito: null|{ tipo, testo, pentiti }, storico: [{ grado, partecipanti, esito, rilancio }], opzioni, rng }
```

`confronto`: `{ tipo: "lavoretto"|"fuga", grado?, round: 1|2|"allin", step: "flop"|"turn"|"river"|"esito"|"bottino", tavolo, partecipanti, attivi, decisioni, giocate: { [ladroId]|banda: [...] }, croupierMano, croupierGioca, esito, manoLadri, manoCroupier, ladyUsata, voti }`.

## Azioni

| type | parametri | quando |
|---|---|---|
| `coppiaGangster` | `ladro, valore ("2".."T"), semi: [2]` | setup |
| `distribuisci` | — | setup → lavoretti |
| `mostra` | `ladro, mostra` | sempre |
| `lavorettoInizia` | `grado, partecipanti (1-2), descrizione?` | lavoretti |
| `decidi` | `ladro, scelta: "continua"|"ritira", carta?` | flop/turn |
| `avanza` | — | GM: chi non ha deciso continua |
| `gioca` | `ladro, carte` (lavoretto) · `carte` (fuga, 2 da qualsiasi mano) | river |
| `croupierGioca` | `carte` (2 dalla sua mano o dal Mazzetto) | river |
| `baciamano` | `ladro, mano, giocata` | esito = fallimento |
| `accetta` | — | esito = fallimento |
| `vota` | `ladro, scelta: "incassa"|"rilancia"` | esito = successo (lavoretto) |
| `bottinoScegli` | `ladro, carte` | Bottino a scelta |
| `bottinoAssegna` | `carta, a` | divisione |
| `bottinoDividi` | `ordine?` | divisione casuale |
| `annullaConfronto` | — | GM, lavoretto |
| `faseFixer` / `faseColpo` / `faseFuga` | — | GM |
| `compra` | `oggetto, carte, destinatario?, gratis?` | fixer |
| `daiJolly` | `ladro, motivo?, forza?` | GM |
| `accesso` | `tipo, carte` | colpo |
| `diversivo` | `ladro, descrizione?` | colpo, dopo l'Accesso |
| `scasso` | `tipo: professionale|tecnico|brutale|nessuno, carte` | colpo |
| `allIn` | — | fuga, dopo un Fallimento |

## Scelte interpretative

Dove il manuale non è esplicito:

1. **3 giocatori = 2 Ladri + Croupier**: in quel caso ogni Ladro riceve anche 1 Jolly e i Jolly per l'interpretazione arrivano solo nelle Fasi 2 e 3.
2. **Coppia che resta da sola** (un compagno si ritira): chi resta posa 2 Carte se ne ha almeno 2, altrimenti 1.
3. **Rilancio**: si rilancia solo se tutti i partecipanti votano per il rilancio; ci si ritira dal Rilancio solo se tutti sono d'accordo. Dopo il Rilancio la 4ª e la 5ª Carta escono insieme.
4. **Fine del Lavoretto**: le Carte non giocate dal Croupier vanno nei suoi scarti.
5. **Pagamenti** (Fixer, Accesso, Scasso): servono esattamente le Carte della combinazione, anche da mani diverse; i Jolly valgono come qualsiasi carta. Le Carte del Fixer tornano nel Mazzo della Banda (o escono dal gioco con l'opzione apposita); quelle dell'Accesso e dello Scasso vanno negli scarti.
6. **Figure** = J, Q, K (l'Asso non è una figura).
7. **Diversivo**: il numero di Carte tolte dal Mazzetto è pari alle Guardie Allertate fino a quel momento; la Carta persa dal Ladro e quelle tolte dal Mazzetto sono scelte a caso.
8. **Baciamano**: una volta per Confronto (per round), con una qualsiasi delle Carte rivelate dai Ladri; nella Fuga la Carta di partenza può venire da qualsiasi mano della Banda.
9. **Pentiti nella Fuga**: si ritirano solo al flop; le loro Carte restano nella mano della Banda, che ne scarta 1 a caso per ciascuno.
10. **All-in**: si rivelano subito 5 nuove Carte; il Croupier, che tiene il Mazzetto, pesca 2 Carte per ogni Pentito e ne sceglie 2.
11. **Parità con la regola dei semi**: si confrontano i semi delle carte che formano la mano, dalla più importante.
12. **Mazzo finito**: si rimescolano gli scarti.
