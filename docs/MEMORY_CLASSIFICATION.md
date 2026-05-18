# Memory Classification

Governed memory lifecycle (conceptual):

`event -> candidate -> validation -> memory_node`

Interpretation:
- Event: raw observation/input.
- Candidate: provisional record, not confirmed truth.
- Validation: human or policy-governed review step.
- Memory node: validated record in governed memory space.

Sensitivity-aware handling (conceptual classes):
- low sensitivity: operational/factual context
- medium sensitivity: preference/process context
- high sensitivity: requires stronger gating and explicit review
- restricted domains: blocked or excluded in public MVP

Public MVP rule: memory is not confirmed automatically.
