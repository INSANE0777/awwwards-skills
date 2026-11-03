import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("./skill-memory.mjs", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "skill-memory-test-"));
const memDir = join(tmp, "memory");
const MARK_START = "<!-- skill-memory:start -->";
const MARK_END = "<!-- skill-memory:end -->";

after(() => rmSync(tmp, { recursive: true, force: true }));

function run(args, env = {}) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.AWWWARDS_SKILLS_DIR;
  return spawnSync(process.execPath, [helper, ...args], {
    encoding: "utf8",
    env: { ...cleanEnv, AWWWARDS_SKILL_MEMORY_DIR: memDir, ...env },
  });
}

function writeSkill(dir, name, body) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "SKILL.md"), body);
}

test("rejects a --skill that is not one of the seven shipped names (no traversal)", () => {
  const skillsDir = join(tmp, "traversal-skills");
  mkdirSync(skillsDir, { recursive: true });

  for (const payload of ["../../evil", "awwwards-inspiration/../../evil", "..\\..\\evil"]) {
    const res = run(["recall", "--skill", payload, "--dir", skillsDir]);
    assert.equal(res.status, 1, `expected rejection for ${payload}`);
    assert.match(res.stderr, /unknown skill/);
  }
  assert.equal(existsSync(join(tmp, "evil")), false);
});

test("uses an explicit --dir instead of auto-detection", () => {
  const skillsDir = join(tmp, "explicit-skills");
  writeSkill(skillsDir, "awwwards-inspiration", [
    "# Installed copy",
    "",
    MARK_START,
    "- [2026-01-01 x1] Learned from the explicit dir",
    MARK_END,
    "",
  ].join("\n"));

  const res = run(["recall", "--skill", "awwwards-inspiration", "--dir", skillsDir]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Learned from the explicit dir/);
});

test("auto-detects a common installed skills dir when --dir is omitted", () => {
  const home = join(tmp, "home");
  writeSkill(join(home, ".claude", "skills"), "awwwards-doctor", [
    "# Installed copy",
    "",
    MARK_START,
    "- [2026-01-01 x1] Learned from auto-detection",
    MARK_END,
    "",
  ].join("\n"));

  const res = run(["recall", "--skill", "awwwards-doctor"], {
    HOME: home,
    USERPROFILE: home,
  });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Learned from auto-detection/);
});

test("distill replaces only the managed section and preserves surrounding text", () => {
  const skillsDir = join(tmp, "distill-skills");
  const installed = join(skillsDir, "awwwards-inspiration", "SKILL.md");
  writeSkill(skillsDir, "awwwards-inspiration", [
    "# Installed copy",
    "",
    "KEEP THIS LINE.",
    "",
    MARK_START,
    "- [2026-01-01 x1] old folded rule",
    MARK_END,
    "",
  ].join("\n"));

  mkdirSync(memDir, { recursive: true });
  writeFileSync(join(memDir, "findings.jsonl"), [
    JSON.stringify({ at: "2026-01-01T00:00:00.000Z", skill: "awwwards-inspiration", phase: "verify", rule: "Gate each section with captured geometry" }),
    JSON.stringify({ at: "2026-01-02T00:00:00.000Z", skill: "awwwards-inspiration", phase: "verify", rule: "Gate each section with captured geometry" }),
  ].join("\n") + "\n");

  const res = run(["distill", "--dir", skillsDir]);
  assert.equal(res.status, 0, res.stderr);

  const out = readFileSync(installed, "utf8");
  assert.match(out, /KEEP THIS LINE\./);
  assert.match(out, /Gate each section with captured geometry/);
  assert.doesNotMatch(out, /old folded rule/);
  assert.equal(out.split(MARK_START).length - 1, 1);
  assert.equal(out.split(MARK_END).length - 1, 1);
});

test("sync no longer exists", () => {
  const res = run(["sync"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /unknown command "sync"/);
  assert.doesNotMatch(res.stderr, /use .*sync/);
});
