#!/bin/sh
# Re-run every published study against the pinned τ-bench / τ²-bench commits and rewrite the
# committed flagged-*.json files. CI runs this and fails if anything in study/ changes.
set -e
cd "$(dirname "$0")/.."
npx tsx study/tau-bench.ts --dump
npx tsx study/tau-bench.ts --held-out --dump
npx tsx study/tau2-bench.ts --dump
npx tsx study/tau2-bench.ts --model gpt-4.1-2025-04-14 --dump
npx tsx study/tau2-bench.ts --model gpt-4.1-mini-2025-04-14 --setting base --dump
npx tsx study/tau2-bench.ts --model claude-3-7-sonnet-20250219 --dump
npx tsx study/tau2-bench.ts --domain telecom --dump
npx tsx study/tau2-bench.ts --model gpt-4.1-2025-04-14 --domain telecom --dump
npx tsx study/tau2-bench.ts --model claude-3-7-sonnet-20250219 --domain telecom --dump
npx tsx study/real-catches.ts
