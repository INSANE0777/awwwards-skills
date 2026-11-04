#!/usr/bin/env node
// Structural validation for the shipped skills. No dependencies.
//
// Checks:
//   - exactly the eight shipped skill dirs, each with matching frontmatter
//     `name` + a non-empty `description`
//   - every relative markdown link resolves inside its skill dir
//   - every skill dir carries LICENSE, byte-identical to the root LICENSE
//   - every .json under skills/ parses; the two techniques.json copies are equal
//   - all eight v2-routing.md copies are byte-identical
//   - when the network is available, those copies equal the raw MCP v1.17.1
//     fixture (set AWWWARDS_SKIP_NETWORK=1 to skip that one check)

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(root, "skills");
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
const ROUTING_FIXTURE =
  "https://raw.githubusercontent.com/INSANE0777/Awwwards-mcp/v1.17.1/test/fixtures/v2-routing.md";

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error(`FAIL ${msg}`);
};
const ok = (msg) => console.log(`ok   ${msg}`);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

if (!existsSync(skillsDir)) {
  fail("skills/ directory is missing");
} else {
  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  for (const name of SKILLS.filter((s) => !dirs.includes(s))) fail(`missing skill dir: skills/${name}`);
  for (const name of dirs.filter((d) => !SKILLS.includes(d))) fail(`unexpected skill dir: skills/${name}`);
}

const rootLicense = existsSync(join(root, "LICENSE")) ? readFileSync(join(root, "LICENSE")) : null;
if (!rootLicense) fail("root LICENSE is missing");

for (const skill of SKILLS) {
  const dir = join(skillsDir, skill);
  if (!existsSync(dir)) continue;

  const skillMd = join(dir, "SKILL.md");
  if (!existsSync(skillMd)) {
    fail(`skills/${skill}/SKILL.md is missing`);
  } else {
    const text = readFileSync(skillMd, "utf8");
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
    if (!frontmatter) {
      fail(`skills/${skill}/SKILL.md has no frontmatter`);
    } else {
      const name = /^name:\s*(.+?)\s*$/m.exec(frontmatter[1])?.[1];
      const description = /^description:\s*(.+?)\s*$/m.exec(frontmatter[1])?.[1];
      if (name !== skill) fail(`skills/${skill}/SKILL.md frontmatter name is ${JSON.stringify(name)}`);
      if (!description || description.length < 20) {
        fail(`skills/${skill}/SKILL.md frontmatter description is empty or too short`);
      }
    }
  }

  const license = join(dir, "LICENSE");
  if (!existsSync(license)) fail(`skills/${skill}/LICENSE is missing`);
  else if (rootLicense && !readFileSync(license).equals(rootLicense)) {
    fail(`skills/${skill}/LICENSE differs from the root LICENSE`);
  }

  const routing = join(dir, "v2-routing.md");
  if (!existsSync(routing)) fail(`skills/${skill}/v2-routing.md is missing`);
}

// Relative links in every shipped markdown file must resolve.
for (const skill of SKILLS) {
  const dir = join(skillsDir, skill);
  if (!existsSync(dir)) continue;
  for (const file of walk(dir).filter((p) => p.endsWith(".md"))) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/\]\(([^)\s]+)/g)) {
      const raw = match[1].replace(/^<|>$/g, "");
      if (/^(https?:|mailto:|tel:|data:|#|\/)/i.test(raw)) continue;
      let target = raw.split("#")[0].split("?")[0];
      if (!target) continue;
      try {
        target = decodeURIComponent(target);
      } catch {
        // keep the raw target; existsSync below reports it
      }
      const resolved = resolve(dirname(file), target);
      const rel = relative(dir, resolved);
      if (rel.startsWith("..") || isAbsolute(rel)) {
        fail(`${relative(root, file)} links outside its skill dir: ${raw}`);
      } else if (!existsSync(resolved)) {
        fail(`${relative(root, file)} has a broken relative link: ${raw}`);
      }
    }
  }
}

// JSON validity and the two identical technique registries.
const jsonFiles = existsSync(skillsDir)
  ? walk(skillsDir).filter((p) => p.endsWith(".json"))
  : [];
for (const file of jsonFiles) {
  try {
    JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    fail(`${relative(root, file)} is not valid JSON: ${err.message}`);
  }
}
const techniques = jsonFiles.filter((p) => basename(p) === "techniques.json");
if (techniques.length !== 2) {
  fail(`expected 2 techniques.json copies, found ${techniques.length}`);
} else if (!readFileSync(techniques[0]).equals(readFileSync(techniques[1]))) {
  fail(`${relative(root, techniques[0])} and ${relative(root, techniques[1])} differ`);
}

// All routing copies must be byte-identical.
const routingFiles = SKILLS.map((s) => join(skillsDir, s, "v2-routing.md")).filter((p) => existsSync(p));
if (routingFiles.length && routingFiles.length !== SKILLS.length) {
  fail(`only ${routingFiles.length}/${SKILLS.length} v2-routing.md copies exist`);
}
const routingBase = routingFiles.length ? readFileSync(routingFiles[0]) : null;
let routingSame = Boolean(routingBase);
for (const file of routingFiles.slice(1)) {
  if (!readFileSync(file).equals(routingBase)) {
    routingSame = false;
    fail(`${relative(root, file)} differs from ${relative(root, routingFiles[0])}`);
  }
}
if (routingSame) ok(`${routingFiles.length} v2-routing.md copies are byte-identical`);

async function checkRemoteFixture() {
  if (process.env.AWWWARDS_SKIP_NETWORK === "1") {
    console.log("skip raw MCP v1.17.1 routing fixture (AWWWARDS_SKIP_NETWORK=1)");
    return;
  }
  let remote;
  try {
    const res = await fetch(ROUTING_FIXTURE, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.warn(`skip raw MCP v1.17.1 routing fixture (HTTP ${res.status})`);
      return;
    }
    remote = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.warn(`skip raw MCP v1.17.1 routing fixture (network: ${err.message})`);
    return;
  }
  // Compare content, not checkout line endings.
  const canonical = (buf) => buf.toString("utf8").replace(/\r\n/g, "\n");
  for (const file of routingFiles) {
    if (canonical(readFileSync(file)) !== canonical(remote)) {
      fail(`${relative(root, file)} differs from the raw MCP v1.17.1 fixture`);
    }
  }
  ok(`v2-routing.md matches the raw MCP v1.17.1 fixture`);
}

await checkRemoteFixture();

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(`\nall checks passed (${SKILLS.length} skills)`);
