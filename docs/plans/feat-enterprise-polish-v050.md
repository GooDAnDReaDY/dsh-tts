# Plan: feat/enterprise-polish-v050 (Issue #117)

## Overview
Enterprise quality and performance upgrade for @goodandready/dsh-tts v0.5.0:
1. L1 RAM audio cache tier (<1ms TTFT for hot audio buffers).
2. Parallel pipeline pre-synthesis of sentence chunks.
3. Voice preview sample player in settings card.
4. Phonetic dictionary JSON import/export in PronunciationEditor.
5. SSE reconnection exponential backoff with jitter.

## Quality Gate & Constraints
- All 108+ unit tests passing.
- Client bundle < 92 KiB.
- Packed tarball < 256 KiB.
- Full EN + ZH dual localization.
- No force operations (--force, --no-verify).
