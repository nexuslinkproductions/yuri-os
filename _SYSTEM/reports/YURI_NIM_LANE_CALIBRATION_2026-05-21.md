# YURI NIM Lane Calibration — 2026-05-21

Calibration command shape:

```bash
LANE_FRESH=1 OFFLOAD_QUEUE_BYPASS=1 OFFLOAD_STREAM=0 \
  _SYSTEM/Scripts/offload.sh -m <lane> --no-tools 'Reply PONG only.'
```

## Result

| Lane | Model | Result | Time | Routing Decision |
|---|---|---:|---:|---|
| `nvidia-nemotron-super-49b` | `nvidia/llama-3.3-nemotron-super-49b-v1.5` | exact `PONG` | 29s | active daily Nemotron reasoning |
| `nvidia-mistral-nemotron` | `mistralai/mistral-nemotron` | exact `PONG` | 1s | active guardrail/planning critic |
| `nvidia-llama4-maverick` | `meta/llama-4-maverick-17b-128e-instruct` | exact `PONG` | 2s | active multimodal/generalist fallback |
| `nvidia-vision-90b` | `meta/llama-3.2-90b-vision-instruct` | exact `PONG` | 109s | active heavy visual-introspection lane; slow |
| `nvidia-nemotron-nano-vl-8b` | `nvidia/llama-3.1-nemotron-nano-vl-8b-v1` | PONG-ish | 3s | active only for fresh/small visual probes |
| `nvidia-nemotron-mini-4b` | `nvidia/nemotron-mini-4b-instruct` | PONG-ish | 1s | active only for fresh/small sentinel prompts |
| `nvidia-magistral-small` | `mistralai/magistral-small-2506` | 404 | 1s | dead/blocked; fallback to `nvidia-mistral-nemotron` |
| `nvidia-qwen-coder-32b` | `qwen/qwen2.5-coder-32b-instruct` | 410 EOL | 0s | dead/blocked; fallback to `nvidia-qwen3-next` |
| `nvidia-usdcode` | `nvidia/usdcode` | 404 | 0s | dead/blocked for chat offload; needs adapter research |

## Operational Notes

- Fresh probes matter. Without `LANE_FRESH=1`, the shared `nvidia-nim` lane-session history can inflate tiny-model prompts past 16k or 4k context limits.
- `--no-tools` is the correct availability probe mode. It tests provider/model reachability without tool schema overhead.
- `nvidia-vision-90b` is usable but slow enough to reserve for actual visual-introspection work, not routine status checks.
- `nvidia-usdcode` remains interesting for 3D/Kagami mechanics, but not through the current OpenAI-compatible chat path.

