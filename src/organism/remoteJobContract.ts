/** Declarative job envelope only. Never dispatches or grants authority. */
export type RemoteJobKind = 'simulation.start' | 'simulation.status' |
  'simulation.checkpoint' | 'simulation.stop' | 'test.run';
export type RemoteJobRequest = Readonly<{
  version: 'nyxa.remote-job.v1';
  target: 'server-c';
  kind: RemoteJobKind;
  jobId: string;
  actorId: string;
  mandateId: string;
  evidenceId: string;
  maxRuntimeSeconds: number;
}>;
export function validateRemoteJob(value: unknown): RemoteJobRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('remote_job_invalid');
  }
  const v = value as Record<string, unknown>;
  const keys = ['version', 'target', 'kind', 'jobId', 'actorId',
    'mandateId', 'evidenceId', 'maxRuntimeSeconds'];
  if (Object.keys(v).length !== keys.length ||
    Object.keys(v).some(k => !keys.includes(k))) throw new Error('remote_job_unknown_field');
  if (v.version !== 'nyxa.remote-job.v1' || v.target !== 'server-c') {
    throw new Error('remote_job_target_denied');
  }
  const kinds = ['simulation.start', 'simulation.status', 'simulation.checkpoint',
    'simulation.stop', 'test.run'];
  if (!kinds.includes(String(v.kind))) throw new Error('remote_job_kind_denied');
  for (const key of ['jobId', 'actorId', 'mandateId', 'evidenceId']) {
    if (typeof v[key] !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(v[key] as string)) {
      throw new Error('remote_job_identity_invalid');
    }
  }
  if (!Number.isSafeInteger(v.maxRuntimeSeconds) ||
    (v.maxRuntimeSeconds as number) < 1 || (v.maxRuntimeSeconds as number) > 3600) {
    throw new Error('remote_job_budget_invalid');
  }
  return v as RemoteJobRequest;
}
