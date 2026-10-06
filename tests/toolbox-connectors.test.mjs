import test from "node:test";
import assert from "node:assert/strict";
import { toolbox } from "../dist/toolbox/registry.js";
import { classifyWorkflowSync, stableWorkflowHash } from "../dist/toolbox/n8nReconcile.js";

test("capability station discovers Mac, Xcode, Apple and n8n without enabling effects", async () => {
  const names = new Set(toolbox.list().map(x => x.name));
  for (const n of ["macos.runner.status","xcode.build","apple.build.upload","n8n.workflow.sync.apply"]) assert.equal(names.has(n), true);
  assert.equal(toolbox.describe("xcode.build").risk, "effect");
  assert.equal((await toolbox.execute("macos.runner.status", {})).status, "not_configured");
});

test("workflow reconciliation fast-forwards one-sided change and blocks divergence", () => {
  const base = { name:"ios", nodes:[{id:"1",type:"build"}] };
  const changed = { name:"ios", nodes:[{id:"1",type:"build"},{id:"2",type:"test"}] };
  const baseHash = stableWorkflowHash(base);
  assert.equal(classifyWorkflowSync({central:changed, local:base, lastSyncedHash:baseHash}).state, "CENTRAL_AHEAD");
  assert.equal(classifyWorkflowSync({central:base, local:changed, lastSyncedHash:baseHash}).state, "LOCAL_AHEAD");
  const divergent = classifyWorkflowSync({central:changed, local:{...base,name:"ios-local"}, lastSyncedHash:baseHash});
  assert.equal(divergent.state, "DIVERGED");
  assert.equal(divergent.applyAllowed, false);
});

test("volatile n8n revision fields do not create false drift", () => {
  const a={name:"x",updatedAt:"a",versionId:"1",nodes:[]};
  const b={name:"x",updatedAt:"b",versionId:"2",nodes:[]};
  assert.equal(stableWorkflowHash(a), stableWorkflowHash(b));
});
