// Loads the real popup/findings.js (a plain browser script that defines globalThis.CFFindings)
// into a node:vm context and returns its API. Results are copied into this realm so
// assert.deepEqual works on them.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../../popup/findings.js", import.meta.url), "utf8");

export function loadFindings() {
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: "findings.js" });
  const api = context.CFFindings;
  const plain = (value) => JSON.parse(JSON.stringify(value));
  return {
    buildFindings: (state) => plain(api.buildFindings(state)),
    computeVerdict: (state) => plain(api.computeVerdict(state)),
    tagCopy: (impact, state) => plain(api.tagCopy(impact, state)),
  };
}
