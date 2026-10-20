/** Structural relevance only. Does not attest source contents or confer qualifications. */
export type LawSourceUse = {
  sourceId: string;
  role: 'NORM' | 'JUDGMENT';
  use: 'DIRECT' | 'ANALOGY' | 'BACKGROUND';
  normRefs: readonly string[];
  issueTags: readonly string[];
};
export function assessLawExamSourceRelevance(input: {
  requiredNormRefs: readonly string[];
  questionIssueTags: readonly string[];
  sources: readonly LawSourceUse[];
}) {
  const hold = (reason: string) => ({decision: 'HOLD' as const, reason,
    sourceContentVerified: false, independentExamPassed: false, graduated: false});
  const required = [...new Set(input.requiredNormRefs.map(s => s.trim().toUpperCase()))];
  const issues = new Set(input.questionIssueTags.map(s => s.trim().toLowerCase()));
  if (!required.length || required.some(s => !s) || !issues.size || issues.has(''))
    return hold('exam_scope_missing');
  if (!input.sources.length || input.sources.some(s => !s.sourceId.trim()))
    return hold('sources_missing');
  if (new Set(input.sources.map(s => s.sourceId)).size !== input.sources.length)
    return hold('duplicate_source_id');
  for (const s of input.sources) {
    if (s.use === 'DIRECT' && !s.issueTags.some(t => issues.has(t.toLowerCase())))
      return hold('direct_source_issue_mismatch');
  }
  const supported = new Set(input.sources.filter(s => s.role === 'NORM' && s.use === 'DIRECT')
    .flatMap(s => s.normRefs.map(n => n.trim().toUpperCase())));
  if (required.some(n => !supported.has(n))) return hold('required_direct_norm_missing');
  return {decision: 'RELEVANCE_CANDIDATE' as const,
    reason: 'structural_relevance_only_content_and_independent_review_pending',
    sourceContentVerified: false, independentExamPassed: false, graduated: false};
}
