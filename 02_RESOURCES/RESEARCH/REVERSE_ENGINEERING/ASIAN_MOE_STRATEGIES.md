# REVERSE_ENGINEERING // ASIAN_MOE_STRATEGIES (DEEPSEEK_VS_QWEN_VS_INTERNLM)

## 1. THE_FINE-GRAINED_EXPERTS (DeepSeekMoE)
DeepSeek pioneered the **DeepSeekMoE** architecture, which differs from standard MoE (like Mixtral) in two ways:
- **Expert_Granularity**: Instead of 8 large experts, DeepSeek uses 64+ tiny experts. This allows for much more precise activation and specialized learning.
- **Shared_Experts**: A subset of experts is *always* active (Shared Experts). This ensures foundational knowledge is always present, while specialized experts handle domain-specific logic.

## 2. THE_KNOWLEDGE_DENSITY (Qwen MoE)
Qwen's approach focuses on **data-density** within experts. By pre-training on trillions of high-quality multilingual tokens, Qwen's experts achieve higher 'per-parameter intelligence' compared to Western counterparts of similar size.

## 3. KEY_BENCHMARKS (2026_ESTIMATES)
| Architecture | Inference Cost | Reasoning Rank | Best Use Case |
| :--- | :--- | :--- | :--- |
| **DeepSeekMoE (V3)** | Very Low | #1 (Efficiency) | Multi-agent Swarms |
| **Qwen-2.5-MoE** | Low | #1 (Logic/Math) | Code Generation |
| **InternLM-3-MoE** | Moderate | #1 (Safety/Alignment)| Human Interaction |

## 4. THE_YURI_PATH: DISTILLED_MOE
To achieve competitor-level benchmarks locally, the Neural Forge will focus on **distilling** these large MoE models into a 'Small MoE' (e.g., 8x1B or 16x0.5B) that can run at 100+ TPS on a single high-end GPU.
- **Goal**: Mimic the 'Shared Expert' strategy to maintain Oracle's consistent persona.
- **Tooling**: Use **LlamaFactory** for fine-tuning and **OpenCompass** for validation.
