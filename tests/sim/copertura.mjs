// Gioca molte partite e mostra quante volte è stata verificata ogni regola e ogni caso del gioco.
//   node tests/sim/copertura.mjs [N=5000] [seme]
import { newGame, apply } from "../../module/game/engine.mjs";
import { creaArbitro } from "./arbitro.mjs";
const N = Number(process.argv[2] ?? 5000);
const base = Number(process.argv[3] ?? 200000);
const gioca = creaArbitro({ newGame, apply });
const regole = {};
const casi = {};
const add = (o, k) => (o[k] = (o[k] ?? 0) + 1);
const errori = [];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const r = gioca(base + i);
  for (const [k, v] of Object.entries(r.regole)) regole[k] = (regole[k] ?? 0) + v;
  for (const p of r.problemi) errori.push(`seme ${r.seed}: ${p}`);
  const s = r.stato;
  add(casi, `Banda di ${s.ladri.length} Ladri`);
  for (const l of s.ladri) add(casi, `Classe ${l.classe}`);
  for (const [k, v] of Object.entries(s.opzioni)) add(casi, `opzione ${k}=${v}`);
  for (const h of s.storico) {
    add(casi, `Lavoretto ${h.grado}`);
    add(casi, `Lavoretto ${h.partecipanti.length === 1 ? "da solo" : "in coppia"}`);
    add(casi, `Lavoretto: ${h.esito}${h.rilancio ? " (rilancio)" : ""}`);
  }
  for (const e of r.eventi) {
    if (e.includes("si ritira al flop")) add(casi, "ritiro al flop");
    if (e.includes("si ritira al turn")) add(casi, "ritiro al turn");
    if (e.includes("baciamano")) add(casi, "baciamano");
    if (e.includes("Rilancio, ritiro")) add(casi, "ritiro dal Rilancio");
    if (e.includes("Diversivo")) add(casi, "Diversivo");
  }
  for (const a of s.acquisti) add(casi, `acquisto ${a}`);
  if (s.colpo.accesso) add(casi, `Ingresso ${s.colpo.accesso}`);
  if (s.colpo.scasso) add(casi, `Scasso ${s.colpo.scasso}`);
  if (s.colpo.allIn) add(casi, "All-in");
  if (s.ladri.some((l) => l.pentito)) add(casi, "Pentiti nella Fuga");
  add(casi, `Epilogo: ${s.esito?.tipo}`);
}
const sec = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`${N} partite in ${sec}s · ${Object.values(regole).reduce((a, b) => a + b, 0)} controlli su ${Object.keys(regole).length} regole · problemi: ${errori.length}`);
for (const e of errori.slice(0, 20)) console.log("  !!", e);
console.log("\nREGOLE (volte verificate):");
for (const [k, v] of Object.entries(regole).sort((a, b) => a[1] - b[1])) console.log(`  ${String(v).padStart(8)}  ${k}`);
console.log("\nCASI DI GIOCO (partite in cui sono capitati):");
for (const [k, v] of Object.entries(casi).sort()) console.log(`  ${String(v).padStart(8)}  ${k}`);
process.exitCode = errori.length ? 1 : 0;
