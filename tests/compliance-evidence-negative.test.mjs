import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "src/compliance/assessment.ts"),
  "utf8"
);

test("missing verification must not count", () => {
  assert.doesNotMatch(source, /r\.verified!==false/);
  assert.match(source, /r\.verified===true/);
});

test("unbound evidence must not match all controls", () => {
  assert.doesNotMatch(source, /!r\.controlId\|\|/);
  assert.match(source, /r\.controlId===control\.id/);
});
