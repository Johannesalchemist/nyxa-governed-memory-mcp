# NYXA Toolbox V1
Stable MCP surface: toolbox.list, toolbox.describe, toolbox.execute, toolbox.health, toolbox.update.
Capabilities are registered modules. New capabilities do not require a new public MCP tool name.
Lifecycle target: validate -> tests -> build -> install -> activate -> reload -> discovery self-test -> evidence -> rollback on failure.
Media is the first module. Effectful media.submit stays fail-closed until its provider adapter and evidence path pass verification.
