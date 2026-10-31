// What the engine checks, and the copy each finding uses, read from the engine's own files.
//
// Nothing here is a second copy of the rules: the rule list, tag list and vendor map are read
// from injected.js, and finding copy is produced by popup/findings.js (loaded unchanged in a
// node:vm context, as the runner and the tests load it). tests/consentflow-mcp.test.mjs checks
// the parsed list against a real run, so a change to injected.js that this parser misses fails.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// injected.js rule status → finding status (popup/findings.js ruleFinding()).
const RULE_STATUS = { pass: "verified", fail: "broken", warn: "review", not_checked: "not_checked" };

const unquote = (s) => s.replace(/\\(.)/g, "$1");
const quoted = (expr) => [...expr.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => unquote(m[1]));

/** Lines [start, end] (1-based, inclusive) from the line matching `startRe` to the first later line matching `endRe`. */
function block(lines, startIndex, endRe) {
  for (let i = startIndex; i < lines.length; i++) {
    if (endRe.test(lines[i])) return { start: startIndex + 1, end: i + 1, code: lines.slice(startIndex, i + 1).join("\n") };
  }
  throw new Error(`Unterminated block at line ${startIndex + 1}`);
}

let cached = null;

export function catalog() {
  if (cached) return cached;
  const injected = read("injected.js");
  const findingsSrc = read("popup/findings.js");
  const injectedLines = injected.split("\n");
  const findingsLines = findingsSrc.split("\n");

  // ─── Rules: each `rule({ id, name, description, status, needs? … })` in runValidation() ───
  const rules = [];
  injectedLines.forEach((line, i) => {
    if (!/^ {4}rule\(\{$/.test(line)) return;
    const src = block(injectedLines, i, /^ {4}\}\);$/);
    const field = (name) => {
      const m = src.code.match(new RegExp(`\\n {6}${name}: ([^\\n]*),\\n`));
      return m ? m[1] : null;
    };
    const id = quoted(field("id"))[0];
    const statuses = [...new Set(quoted(field("status")).map((s) => RULE_STATUS[s]))];
    const needs = field("needs") ? quoted(field("needs")) : [];
    rules.push({
      id,
      name: quoted(field("name"))[0],
      description: quoted(field("description")).join(""),
      statuses,
      needs,
      source: { file: "injected.js", lines: [src.start, src.end] },
    });
  });

  // ─── Tags: each check('Name', 'type', [consent types], …) in detectTags() ───
  const vendorMap = {};
  const mapStart = injectedLines.findIndex((l) => /^ {2}var TAG_VENDOR_MAP = \{$/.test(l));
  for (const m of block(injectedLines, mapStart, /^ {2}\};$/).code.matchAll(/'([^']+)': '(\w+)'/g)) vendorMap[m[1]] = m[2];
  // Only these tags can send cookieless pings (verdict `cookieless`, a review finding); for any
  // other tag, judgeRequest() returns a violation before the cookieless test.
  const cmLine = injectedLines.find((l) => /^ {2}var CONSENT_MODE_TAGS = \[.*\];$/.test(l));
  if (!cmLine) throw new Error("CONSENT_MODE_TAGS not found in injected.js");
  const consentModeTags = quoted(cmLine);
  const tags = [];
  injectedLines.forEach((line, i) => {
    const m = line.match(/^ {4}check\('([^']+)', '(\w+)', \[([^\]]*)\], function/);
    if (!m) return;
    const [, name, type, types] = m;
    tags.push({ name, type, vendor: vendorMap[name] || null, consentTypes: quoted(types), source: { file: "injected.js", line: i + 1 } });
  });

  // ─── Finding copy sources in popup/findings.js ───
  const copySource = {};
  findingsLines.forEach((line, i) => {
    const m = line.match(/^ {4}'([\w-]+)': function \(/);
    if (m) copySource[m[1]] = block(findingsLines, i, /^ {4}\},?$/);
  });
  const tagCopyStart = findingsLines.findIndex((l) => /^ {2}function tagCopy\(/.test(l));
  const tagCopySource = block(findingsLines, tagCopyStart, /^ {2}\}$/);
  const notCheckedStart = findingsLines.findIndex((l) => /^ {2}function notCheckedCopy\(/.test(l));
  const notCheckedSource = block(findingsLines, notCheckedStart, /^ {2}\}$/);
  // Tag verdicts injected.js assigns, minus the ones buildFindings() skips (no_consent_mode is
  // reported inside the missing-default finding; a GTM container is not judged itself, #28).
  const buildStart = findingsLines.findIndex((l) => /^ {2}function buildFindings\(/.test(l));
  const skipLine = block(findingsLines, buildStart, /^ {2}\}$/).code.match(/if \((t\.verdict === '\w+'(?: \|\| )?)+\) return;/)[0];
  const skipped = [...skipLine.matchAll(/'(\w+)'/g)].map((m) => m[1]);
  const tagVerdicts = [...new Set([...injected.matchAll(/^ +verdict = '(\w+)';$/gm)].map((m) => m[1]))].filter((v) => !skipped.includes(v));

  const context = vm.createContext({});
  vm.runInContext(findingsSrc, context, { filename: "popup/findings.js" });
  const engine = context.CFFindings;
  const plain = (v) => JSON.parse(JSON.stringify(v));

  // A tag whose detection lists no consent types is a container (verdict `container`).
  const judged = (t) => t.consentTypes.length > 0;

  // The verdicts a tag can get: cookieless only for the consent-mode-aware Google tags.
  const verdictsFor = (t) => tagVerdicts.filter((v) => v !== "cookieless" || consentModeTags.includes(t.name));
  const tagStatusesFor = (t) => [...new Set(verdictsFor(t).map((v) => tagFinding({ engine, plain }, t, v).status))];

  cached = { rules, tags, vendorMap, consentModeTags, verdictsFor, tagStatusesFor, copySource, tagCopySource, notCheckedSource, tagVerdicts, engine, plain, judged };
  return cached;
}

const COPY_FIELDS = ["status", "title", "observed", "consequence", "fix", "verify", "evidence"];
const pick = (f) => Object.fromEntries(COPY_FIELDS.map((k) => [k, f[k] ?? null]));

/** The checks the engine runs: 8 Consent Mode rules from injected.js plus one finding per detected tag. */
export function listChecks() {
  const c = catalog();
  return {
    schemaVersion: "1",
    tool: "consentflow",
    rules: c.rules.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      statuses: r.statuses,
      needs: r.needs,
      source: r.source,
    })),
    tags: c.tags.map((t) => ({
      id: c.judged(t) ? `tag:${t.name}` : null,
      name: t.name,
      type: t.type,
      vendor: t.vendor,
      consentTypes: t.consentTypes,
      judged: c.judged(t),
      statuses: c.judged(t) ? c.tagStatusesFor(t) : [],
      cookielessPings: c.consentModeTags.includes(t.name),
      source: t.source,
    })),
    notes: [
      "Every rule gives one finding per page load. A tag gives a finding only when it is detected on the page, with id `tag:<name>`.",
      "A tag with no consent types (Google Tag Manager) is a container: it is not judged itself; the tags it loads are judged by the requests they send.",
      "Tags on a page with no consent default are reported inside the consent-default-exists finding, not as tag findings.",
      "Only tags with cookielessPings true (injected.js CONSENT_MODE_TAGS) can get the review status: a cookieless ping under advanced Consent Mode. For any other tag, a request sent while its consent was denied is a violation.",
    ],
  };
}

function tagFinding(c, tag, verdict) {
  return c.plain(
    c.engine.tagCopy({ name: tag.name, type: tag.type, vendor: tag.vendor, consentTypes: tag.consentTypes, verdict, hosts: [] }, {}),
  );
}

export class UnknownFindingError extends Error {}

/**
 * The copy model for one finding id (observed / consequence / fix / verify, plus evidence).
 * Copy that quotes no measured value is produced by popup/findings.js itself; copy built from
 * measured values (times, counts) differs per page load, so its source is returned instead.
 */
export function explainFinding(id) {
  const c = catalog();
  const rule = c.rules.find((r) => r.id === id);
  if (rule) {
    const notChecked = rule.statuses.includes("not_checked")
      ? rule.needs.map((need) => {
          const [f] = c.engine.buildFindings({ validation: [{ id: rule.id, name: rule.name, status: "not_checked", needs: need }] });
          return { needs: need, ...pick(c.plain(f)) };
        })
      : [];
    const src = c.copySource[rule.id];
    return {
      id: rule.id,
      kind: "rule",
      name: rule.name,
      description: rule.description,
      statuses: rule.statuses,
      copy: { not_checked: notChecked },
      copySource: {
        file: "popup/findings.js",
        lines: [src.start, src.end],
        code: src.code,
        covers: rule.statuses.filter((s) => s !== "not_checked"),
      },
      ruleSource: rule.source,
      note: "Copy for the other statuses quotes measured values (times in ms after navigation start, counts), so it is built per page load from the code in copySource. Call check_url for the concrete text on a page.",
    };
  }
  const tag = id.startsWith("tag:") ? c.tags.find((t) => `tag:${t.name}` === id && c.judged(t)) : null;
  if (tag) {
    // These verdicts' copy depends only on the tag's name, vendor and consent types.
    const verdicts = c.verdictsFor(tag);
    const fixed = ["blocked", "idle"].filter((v) => verdicts.includes(v));
    return {
      id,
      kind: "tag",
      name: tag.name,
      type: tag.type,
      vendor: tag.vendor,
      consentTypes: tag.consentTypes,
      statuses: c.tagStatusesFor(tag),
      verdicts,
      copy: Object.fromEntries(fixed.map((v) => [v, pick(tagFinding(c, tag, v))])),
      copySource: {
        file: "popup/findings.js",
        lines: [c.tagCopySource.start, c.tagCopySource.end],
        code: c.tagCopySource.code,
        covers: verdicts.filter((v) => !fixed.includes(v)),
      },
      detectionSource: tag.source,
      note:
        "`copy` is keyed by the tag verdict injected.js reports. The verdicts under copySource.covers quote measured counts and times, so their copy is built per page load from that code. Call check_url for the concrete text on a page." +
        (c.consentModeTags.includes(tag.name)
          ? " As a consent-mode-aware Google tag, it can send cookieless pings (verdict cookieless, status review)."
          : " This tag cannot send cookieless pings: any request sent while its consent was denied is a violation."),
    };
  }
  const known = [...c.rules.map((r) => r.id), ...c.tags.filter(c.judged).map((t) => `tag:${t.name}`)];
  const err = new UnknownFindingError(`Unknown finding id "${id}".`);
  err.known = known;
  throw err;
}
