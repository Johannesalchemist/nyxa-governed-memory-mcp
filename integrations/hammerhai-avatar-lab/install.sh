#!/usr/bin/env bash
set -euo pipefail
command -v nvidia-smi >/dev/null || { echo 'BLOCKED:nvidia-smi'; exit 20; }
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
command -v docker >/dev/null || command -v apptainer >/dev/null || { echo 'BLOCKED:container-runtime'; exit 21; }
mkdir -p "${NYXA_HAMMERHAI_DATA:-$HOME/nyxa-hammerhai-data}"/{models,evidence,experiments,logs}
printf '%s\n' 'PRECHECK_GREEN' 'Next: bind HammerHAI scheduler/storage/runtime details and deploy pinned images.'
