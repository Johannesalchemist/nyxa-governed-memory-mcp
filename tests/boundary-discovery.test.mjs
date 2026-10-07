import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverUnvariedBoundaries } from '../dist/organism/boundaryDiscovery.js';

const assumptions = [
  { id: 'battery', kind: 'VARIABLE', description: 'Battery capacity' },
  { id: 'placement', kind: 'RELATION', description: 'Compute to actuator placement relation' },
  { id: 'energy', kind: 'OBJECTIVE', description: 'Energy objective' },
  { id: 'body-compute', kind: 'BOUNDARY', description: 'Body and compute are separate subsystems' },
];

test('E0_B finds only the explicit assumption never varied', () => {
  const result = discoverUnvariedBoundaries({
    assumptions,
    history: [
      { dimensionId: 'battery', generation: 1, evidenceRefs: ['ev:battery'] },
      { dimensionId: 'placement', generation: 1, evidenceRefs: ['ev:placement'] },
      { dimensionId: 'energy', generation: 2, evidenceRefs: ['ev:energy'] },
    ],
  });
  assert.deepEqual(result.candidates.map((candidate) => candidate.dimension.id), ['body-compute']);
  assert.equal(result.candidates[0].dimension.kind, 'BOUNDARY');
  assert.equal(result.candidates[0].reason, 'NEVER_VARIED');
  assert.equal(result.authorityEffect, 'NONE');
  assert.equal(result.capabilityEffect, 'NONE');
  assert.equal(result.effectRadiusDelta, 0);
});

test('E0_B rejects history that refers to an undeclared design dimension', () => {
  assert.throws(
    () => discoverUnvariedBoundaries({
      assumptions,
      history: [{ dimensionId: 'hidden', generation: 1, evidenceRefs: [] }],
    }),
    /boundary_discovery_unknown_dimension/,
  );
});

test('E0_B reports all explicit assumptions when no variation history exists without changing authority', () => {
  const result = discoverUnvariedBoundaries({ assumptions, history: [] });
  assert.equal(result.candidates.length, assumptions.length);
  assert.equal(result.authorityEffect, 'NONE');
  assert.equal(result.capabilityEffect, 'NONE');
  assert.equal(result.effectRadiusDelta, 0);
});
