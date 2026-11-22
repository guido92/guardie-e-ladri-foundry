// Gioca N partite casuali con l'arbitro indipendente.
//   node tests/sim/gioca.mjs [N=10] [seme iniziale]
import { newGame, apply } from "../../module/game/engine.mjs";
import { creaArbitro } from "./arbitro.mjs";

const N = Number(process.argv[2] ?? 10);
const base = Number(process.argv[3] ?? Date.now() % 100000);
const gioca = creaArbitro({ newGame, apply });
const tutte = {};
let problemi = 0;
for (let i = 0; i < N; i++) {
  const r = gioca(base + i);
  for (const [k, v] of Object.entries(r.regole)) tutte[k] = (tutte[k] ?? 0) + v;
  problemi += r.problemi.length;
  if (N <= 20) {
    console.log(`\n### Partita ${i + 1} (seme ${r.seed})`);
    for (const e of r.eventi) console.log(`  - ${e}`);
  }
  for (const p of r.problemi) console.log(`  !! ${p}`);
}
console.log(`\n${N} partite, ${Object.values(tutte).reduce((a, b) => a + b, 0)} controlli su ${Object.keys(tutte).length} regole, problemi: ${problemi}`);
if (N <= 20) for (const [k, v] of Object.entries(tutte).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
process.exitCode = problemi ? 1 : 0;
