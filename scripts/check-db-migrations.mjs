#!/usr/bin/env node
/**
 * Pre-commit / CI check for two CodeQL patterns in src/main/database.ts:
 *
 *  1. js/missing-space-in-string-concatenation — SQL string segments that end
 *     with a comma immediately before the closing quote (e.g. `'col INTEGER,'`)
 *     will produce `...INTEGER,nextCol` when concatenated.  Every segment that
 *     ends with ',' must have a trailing space: `'col INTEGER, '`.
 *
 *  2. js/useless-assignment-to-local — after the last migration block
 *     `if (userVersion < N)` writes `db.pragma('user_version = N')`, there
 *     must be no `userVersion = N` assignment because no later block reads it.
 *
 * To suppress a false positive on rule 1, add // db-sql-space-ok with a reason
 * on the same line as the string segment.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.resolve(__dirname, "..", "src", "main", "database.ts");

// ─── Rule 1: SQL segment ending with comma, no trailing space ─────────────────
// Matches a single-quoted string that ends with a bare comma: '...,' + or '...',
// but not '..., ' (space before closing quote).
// We only flag it when the line also contains a concatenation (+) or is
// clearly part of a multi-line SQL build.
const BARE_COMMA_SEGMENT = /'[^']*[^'\s],'\s*\+/;
const SUPPRESSED_SPACE = /\/\/\s*db-sql-space-ok\b/;

// ─── Rule 2: Useless assignment to userVersion after last migration ────────────
// Collect all `if (userVersion < N)` guards and `userVersion = N` assignments.
const GUARD_RE = /if\s*\(\s*userVersion\s*<\s*(\d+)\s*\)/g;
const ASSIGN_RE = /userVersion\s*=\s*(\d+)\s*;/g;

function checkSqlSpaces(lines) {
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!BARE_COMMA_SEGMENT.test(line)) continue;
    if (SUPPRESSED_SPACE.test(line)) continue;
    violations.push({ lineNum: i + 1, line: line.trim() });
  }
  return violations;
}

function checkUselessAssignment(content) {
  // Find the highest migration guard version.
  let maxGuard = 0;
  for (const m of content.matchAll(GUARD_RE)) {
    maxGuard = Math.max(maxGuard, parseInt(m[1], 10));
  }
  if (maxGuard === 0) return [];

  // After that guard, find any `userVersion = maxGuard` assignment.
  // We locate the guard position and search only from there forward.
  const guardStr = `userVersion < ${maxGuard}`;
  const guardIdx = content.lastIndexOf(guardStr);
  if (guardIdx === -1) return [];

  const tail = content.slice(guardIdx);
  const violations = [];
  for (const m of tail.matchAll(ASSIGN_RE)) {
    if (parseInt(m[1], 10) === maxGuard) {
      const lineNum =
        content.slice(0, guardIdx + m.index).split("\n").length;
      violations.push({
        lineNum,
        line: m[0].trim(),
        version: maxGuard,
      });
    }
  }
  return violations;
}

function main() {
  const relPath = path.relative(process.cwd(), DB_FILE);
  const content = fs.readFileSync(DB_FILE, "utf8");
  const lines = content.split("\n");

  const spaceViolations = checkSqlSpaces(lines);
  const assignViolations = checkUselessAssignment(content);

  if (spaceViolations.length === 0 && assignViolations.length === 0) {
    process.exit(0);
    return;
  }

  if (spaceViolations.length > 0) {
    console.error(
      "check-db-migrations: SQL string segments missing space after comma " +
        "(CodeQL js/missing-space-in-string-concatenation):\n"
    );
    for (const v of spaceViolations) {
      console.error(`  ${relPath}:${v.lineNum}`);
      console.error(`    ${v.line}`);
      console.error(
        "    Fix: add a trailing space before the closing quote, e.g. 'col INTEGER, '"
      );
      console.error("");
    }
    console.error(
      "To suppress a false positive, add // db-sql-space-ok with a reason on the same line.\n"
    );
  }

  if (assignViolations.length > 0) {
    console.error(
      "check-db-migrations: useless userVersion assignment in last migration block " +
        "(CodeQL js/useless-assignment-to-local):\n"
    );
    for (const v of assignViolations) {
      console.error(`  ${relPath}:${v.lineNum}`);
      console.error(`    ${v.line}`);
      console.error(
        `    Fix: remove \`userVersion = ${v.version};\` — no subsequent migration block reads it.`
      );
      console.error("");
    }
  }

  process.exit(1);
}

main();
