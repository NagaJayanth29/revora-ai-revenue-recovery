"""
Deprecated entrypoint — use the TypeScript trainer:

  npm run train:model

Which writes:
  ml/models/recovery_probability_v0.1-demo.json
  src/lib/ai/artifacts/recovery_probability_v0.1-demo.json

Demo evaluation — synthetic data (not Razorpay production statistics).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    script = root / "scripts" / "train-recovery-model.ts"
    print("Delegating to TypeScript trainer:", script)
    subprocess.check_call(["npx", "tsx", str(script)], cwd=str(root))


if __name__ == "__main__":
    main()
