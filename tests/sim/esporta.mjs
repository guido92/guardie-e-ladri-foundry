// Scrive in un file JSON le mosse delle partite casuali, da rigiocare in Foundry.
import { writeFileSync } from "node:fs";
import { newGame, apply } from "../../module/game/engine.mjs";
import { creaArbitro } from "./arbitro.mjs";
const [N = 10, base = 1000, out = "tests/sim/partite.json"] = process.argv.slice(2);
const gioca = creaArbitro({ newGame, apply });
const partite = [];
for (let i = 0; i < Number(N); i++) {
  const r = gioca(Number(base) + i);
  partite.push({ seed: r.seed, eventi: r.eventi, problemi: r.problemi, mosse: r.mosse });
}
writeFileSync(out, JSON.stringify(partite));
console.log(partite.map((p) => `${p.seed}: ${p.mosse.length} mosse, problemi ${p.problemi.length}`).join("\n"));
