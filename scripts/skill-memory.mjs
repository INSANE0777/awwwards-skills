#!/usr/bin/env node
// skill-memory - the awwwards skills' self-improving memory.
//
// The loop that FINDS lessons runs constantly (verification steps, QA pin
// shots, section gates, repairs). This keeps them:
//   record   - append one structured finding to the episodic journal
//              ($AWWWARDS_SKILL_MEMORY_DIR or ~/.awwwards-mcp/skill-memory/findings.jsonl)
//   recall   - print a skill's managed rules (procedural) + recent findings
//              (episodic) so a loop start has both
//   distill  - deterministically cluster journal rules (jaccard >= 0.6) and
//              fold clusters with count >= min into the INSTALLED skill
//              copy's managed section (between skill-memory markers). LRU-
//              capped. Journal stays the source of truth; the section is a
//              rebuildable cache.
//   stats    - journal counts, top rule clusters, last distill time.
//   promote  - print a skill's folded rules CLEANED for the shipped copy:
//              evidence paths are machine-local (A:\..., /Users/...), so they
//              are stripped - doctrine stands on its own. Use the output in
//              the human PR that moves a rule into the repo SKILL.md.
//
// The SHIPPED (repo) skill copies are never auto-edited - promoting a rule
// into the repo is a human PR. No LLM in the loop; no dependencies.
//
// Installed skills dir resolution, in order:
//   --dir <path>  |  AWWWARDS_SKILLS_DIR  |  first existing common dir:
//   ~/.agents/skills, ~/.claude/skills, ~/.zcode/skills, ~/.pi/agent/skills
// (preferring one that already contains a shipped skill).
// Update installed copies with the `skills` CLI (`npx skills update`), then
// re-run `distill` so learned rules are folded back in.
//
// Usage:
//   node scripts/skill-memory.mjs record --skill awwwards-inspiration \
//        --phase verify --symptom "horizontal copy vanished mid-view" \
//        --rule "Full-viewport horizontal panels get one-shot entrances" \
//        [--evidence showcase/fallow-press/_qa/pin-0.33.png] [--refs "url1,url2"]
//   node scripts/skill-memory.mjs recall --skill awwwards-inspiration [--dir <skills-dir>]
//   node scripts/skill-memory.mjs distill [--min-count 2] [--cap 12] [--dir <skills-dir>]
//   node scripts/skill-memory.mjs promote --skill awwwards-inspiration [--dir <skills-dir>]
//   node scripts/skill-memory.mjs stats

import { appendFileSync, existsSync, readFileSync, realpathSync, renameSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";

const CACHE_ROOT = process.env.AWWWARDS_CACHE_DIR
  ? resolve(process.env.AWWWARDS_CACHE_DIR)
  : join(homedir(), ".awwwards-mcp");
const MEM_DIR = process.env.AWWWARDS_SKILL_MEMORY_DIR
  ? resolve(process.env.AWWWARDS_SKILL_MEMORY_DIR)
  : join(CACHE_ROOT, "skill-memory");
const JOURNAL = join(MEM_DIR, "findings.jsonl");
const LAST_DISTILL = join(MEM_DIR, "last-distill.json");
const SKILLS = [
  "awwwards-setup",
  "awwwards-inspiration",
  "recreate",
  "awwwards-motion-study",
  "awwwards-section-loop",
  "motion-authoring",
  "awwwards-doctor",
  "awwwards-design-md",
];
const PHASES = ["search", "capture", "motion-study", "design-doc", "build", "verify", "release", "repair"];
const MARK_START = "<!-- skill-memory:start -->";
const MARK_END = "<!-- skill-memory:end -->";

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith("--")) die(`--${name} requires a value`);
  return value;
};

function die(msg) {
  console.error(`skill-memory: ${msg}`);
  process.exit(1);
}

function requireSkill(skill) {
  if (!skill) die("--skill is required");
  if (!SKILLS.includes(skill)) {
    die(`unknown skill "${skill}" - expected one of: ${SKILLS.join(", ")}`);
  }
  return skill;
}

function installedRoot() {
  const explicit = flag("dir") ?? process.env.AWWWARDS_SKILLS_DIR;
  if (explicit) {
    const dir = resolve(explicit);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      die(`installed skills dir not found: ${dir}`);
    }
    return dir;
  }

  const candidates = [
    join(homedir(), ".agents", "skills"),
    join(homedir(), ".claude", "skills"),
    join(homedir(), ".zcode", "skills"),
    join(homedir(), ".pi", "agent", "skills"),
  ];
  const existing = candidates.filter((dir) => existsSync(dir));
  if (!existing.length) {
    die("no installed skills dir found - pass --dir or set AWWWARDS_SKILLS_DIR");
  }
  return existing.find((dir) => SKILLS.some((s) => existsSync(join(dir, s, "SKILL.md")))) ?? existing[0];
}

// Validate the skill name AND prove the resolved file stays under the chosen
// installed dir. Names are allow-listed, so traversal is already impossible;
// the containment check is the second lock for hand-edited journals.
function skillFile(skill) {
  requireSkill(skill);
  const base = installedRoot();
  const target = resolve(base, skill, "SKILL.md");
  const rel = relative(base, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    die(`resolved target escapes ${base}: ${target}`);
  }
  // Catch a symlinked skill dir that points outside the installed root.
  if (existsSync(target)) {
    const realRel = relative(realpathSync(base), realpathSync(target));
    if (!realRel || realRel.startsWith("..") || isAbsolute(realRel)) {
      die(`resolved target escapes ${base} through a symlink: ${target}`);
    }
  }
  return { base, target };
}

function readJournal() {
  if (!existsSync(JOURNAL)) return [];
  return readFileSync(JOURNAL, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null; // torn line from a killed process - skip, never crash
      }
    })
    .filter(Boolean);
}

function atomicWrite(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

function tokens(rule) {
  return new Set(
    rule.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean),
  );
}

function jaccard(a, b) {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

// ---------- record ----------
function record() {
  const skill = requireSkill(flag("skill"));
  const phase = flag("phase");
  const symptom = flag("symptom") ?? "";
  const rule = flag("rule");
  const evidence = flag("evidence");
  const refs = (flag("refs") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (!PHASES.includes(phase)) die(`record requires --phase (one of: ${PHASES.join(", ")})`);
  if (!rule || !rule.trim()) die("record requires --rule (one imperative sentence)");

  let trimmed = rule.trim();
  if (trimmed.length > 200) {
    trimmed = trimmed.slice(0, 197) + "...";
    console.error("note: rule truncated to 200 chars");
  }

  const finding = {
    at: new Date().toISOString(),
    skill,
    phase,
    symptom,
    rule: trimmed,
    ...(evidence ? { evidence: resolve(evidence) } : {}),
    ...(refs.length ? { refs } : {}),
  };
  mkdirSync(MEM_DIR, { recursive: true });
  appendFileSync(JOURNAL, JSON.stringify(finding) + "\n");
  console.log(`recorded: [${skill}/${phase}] ${trimmed}`);
  const dup = readJournal().filter(
    (f) => f.skill === skill && tokens(f.rule).size > 0 &&
      jaccard(tokens(f.rule), tokens(trimmed)) >= 0.6,
  ).length;
  if (dup >= 2) console.log(`cluster count now ${dup} - distill will fold this into the skill (>=2)`);
}

// ---------- distill ----------
function distill() {
  const minCount = Number(flag("min-count") ?? 2);
  const cap = Number(flag("cap") ?? 12);
  if (!Number.isInteger(minCount) || minCount < 1) die("--min-count must be a positive integer");
  if (!Number.isInteger(cap) || cap < 1) die("--cap must be a positive integer");
  const journal = readJournal();
  if (!journal.length) {
    console.log("journal empty - nothing to distill");
    process.exit(0);
  }

  // cluster by skill, then by rule-token jaccard >= 0.6 (seed = first seen)
  const bySkill = new Map();
  for (const f of journal) {
    if (!bySkill.has(f.skill)) bySkill.set(f.skill, []);
    bySkill.get(f.skill).push(f);
  }

  let foldedSkills = 0;
  let foldedRules = 0;
  const summary = [];

  for (const [skill, findings] of bySkill) {
    if (!SKILLS.includes(skill)) {
      summary.push(`${skill}: not a shipped skill - skipped`);
      continue;
    }

    const clusters = [];
    for (const f of findings) {
      const t = tokens(f.rule);
      if (!t.size) continue;
      const hit = clusters.find((c) => jaccard(c.tokens, t) >= 0.6);
      if (hit) {
        hit.findings.push(f);
        for (const tok of t) hit.tokens.add(tok);
      } else {
        clusters.push({ tokens: new Set(t), findings: [f] });
      }
    }

    const promoted = clusters
      .filter((c) => c.findings.length >= minCount)
      .map((c) => {
        const dates = c.findings.map((f) => f.at.slice(0, 10)).sort();
        const evidence = c.findings.find((f) => f.evidence)?.evidence;
        return { rule: c.findings[0].rule, count: c.findings.length, lastSeen: dates[dates.length - 1], evidence };
      })
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || b.count - a.count)
      .slice(0, cap);

    const installed = skillFile(skill).target;
    if (!promoted.length || !existsSync(installed)) {
      if (!existsSync(installed)) summary.push(`${skill}: installed copy not found at ${installed} - skipped`);
      continue;
    }

    const lines = promoted.map(
      (p) => `- [${p.lastSeen} x${p.count}] ${p.rule}${p.evidence ? ` (evidence: ${p.evidence})` : ""}`,
    );
    const section = `${MARK_START}\n<!-- machine-managed by scripts/skill-memory.mjs - source of truth: ${JOURNAL} -->\n${lines.join("\n")}\n${MARK_END}`;

    const src = readFileSync(installed, "utf8");
    let out;
    if (src.includes(MARK_START) && src.includes(MARK_END)) {
      const start = src.indexOf(MARK_START);
      const end = src.indexOf(MARK_END) + MARK_END.length;
      out = src.slice(0, start) + section + src.slice(end);
    } else {
      out = src.trimEnd() + "\n\n" + section + "\n";
    }
    atomicWrite(installed, out);
    foldedSkills++;
    foldedRules += promoted.length;
    summary.push(`${skill}: ${promoted.length} rule(s) folded (of ${clusters.length} clusters, journal ${findings.length})`);
  }

  atomicWrite(LAST_DISTILL, JSON.stringify({ at: new Date().toISOString(), journalLines: journal.length }));
  console.log(`distill: ${journal.length} findings -> ${foldedRules} rule(s) across ${foldedSkills} skill(s)`);
  for (const s of summary) console.log(`  ${s}`);
}

// ---------- promote ----------
// Output for the human PR that moves a rule into the SHIPPED copy.
// Evidence paths are machine-local, so they are stripped - a shipped rule
// stands on its own. Keeps only rules that were actually folded (the managed
// section), so promote never leaks unconfirmed journal noise.
function promote() {
  const skill = requireSkill(flag("skill"));
  const installed = skillFile(skill).target;
  if (!existsSync(installed)) die(`no installed copy at ${installed}`);

  const src = readFileSync(installed, "utf8");
  const start = src.indexOf(MARK_START);
  const end = src.indexOf(MARK_END);
  if (start < 0 || end <= start) die(`no managed section in ${installed} - run distill first`);

  const lines = src
    .slice(start + MARK_START.length, end)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- ["))
    .map((l) =>
      // strip the " (evidence: <machine-local path>)" tail and the date/count
      // prefix - the shipped copy keeps only the doctrine sentence
      l.replace(/^\- \[[^\]]+\]\s*/, "").replace(/\s*\(evidence: [^)]+\)$/, ""),
    );
  if (!lines.length) die(`managed section has no folded rules - run distill first`);

  console.log(`<!-- paste into the SHIPPED skills/${skill}/SKILL.md (human PR): -->`);
  for (const l of lines) console.log(`- ${l}`);
}

// ---------- recall ----------
function recall() {
  const skill = requireSkill(flag("skill"));
  const installed = skillFile(skill).target;

  if (existsSync(installed)) {
    const src = readFileSync(installed, "utf8");
    const start = src.indexOf(MARK_START);
    const end = src.indexOf(MARK_END);
    if (start >= 0 && end > start) {
      const body = src.slice(start + MARK_START.length, end).trim();
      if (body) {
        console.log(`learned rules (${skill}, machine-managed - promote to the shipped copy via PR):`);
        console.log(body);
      }
    }
  }

  const findings = readJournal().filter((f) => f.skill === skill).slice(-10);
  if (findings.length) {
    console.log(`\nrecent findings (${findings.length}, episodic):`);
    for (const f of findings) {
      console.log(`  [${f.at.slice(0, 10)}/${f.phase}] ${f.rule}${f.evidence ? ` - ${f.evidence}` : ""}`);
    }
  }
  if (!existsSync(installed) && !findings.length) console.log(`no memory yet for ${skill}`);
}

// ---------- stats ----------
function stats() {
  const journal = readJournal();
  const bySkill = {};
  const byPhase = {};
  for (const f of journal) {
    bySkill[f.skill] = (bySkill[f.skill] ?? 0) + 1;
    byPhase[f.phase] = (byPhase[f.phase] ?? 0) + 1;
  }
  console.log(`journal: ${journal.length} finding(s) at ${JOURNAL}`);
  console.log(`by skill: ${JSON.stringify(bySkill)}`);
  console.log(`by phase: ${JSON.stringify(byPhase)}`);
  if (existsSync(LAST_DISTILL)) {
    console.log(`last distill: ${readFileSync(LAST_DISTILL, "utf8")}`);
  }
}

switch (cmd) {
  case "record": record(); break;
  case "distill": distill(); break;
  case "promote": promote(); break;
  case "recall": recall(); break;
  case "stats": stats(); break;
  default:
    die(`unknown command "${cmd ?? ""}" - use record | promote | recall | distill | stats`);
}
