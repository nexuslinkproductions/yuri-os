# MIT PDOS RESEARCH INDEX: DEEP DIVE

This index curates the most critical research from the MIT Parallel and Distributed Operating Systems (PDOS) group relevant to the YURI architecture.

## 1. Exokernel: An Operating System Architecture for Application-Level Resource Management
*   **Key Insight:** Fixed OS abstractions (like a standard filesystem) hurt performance. Exokernels separate resource protection from management.
*   **Relevance:** Allows the YURI neural core to manage memory and disk at the rawest level, bypassing standard OS overhead.
*   **Link:** [Exokernel Paper](https://pdos.csail.mit.edu/6.828/2024/readings/engler95exokernel.pdf)

## 2. seL4: Formal Verification of an OS Kernel
*   **Key Insight:** Proof that the kernel implementation strictly follows its abstract specification. No buffer overflows, no NULL pointer dereferences.
*   **Relevance:** The baseline for the "Safety-Critical" layer of our command center. Ensures the OS cannot be crashed by rogue agent routines.
*   **Link:** [seL4 Systems](https://sel4.systems/)

## 3. MIRAGE: A Practical OS for Many-Core Systems
*   **Key Insight:** Addresses the "Many-Core" bottleneck by rethinking scheduling and data movement.
*   **Relevance:** Essential for scaling Indra's Net across multi-GPU and high-core-count CPUs without hitting traditional synchronization walls.
*   **Link:** [Mirage Project](https://pdos.csail.mit.edu/mirage/)

## 4. Biscuit: A Kernel Written in a High-Level Language (Go)
*   **Key Insight:** Demonstrates that a kernel written in a garbage-collected language can achieve 90%+ the performance of a C kernel while being significantly safer.
*   **Relevance:** Informs our decision to use TypeScript/Node for high-level logic and Rust for the core, balancing safety and speed.
*   **Link:** [Biscuit Paper](https://pdos.csail.mit.edu/papers/biscuit:osdi18.pdf)

## 5. Click: A Modular Software Router
*   **Key Insight:** A flexible, modular architecture for building complex networking systems using simple elements.
*   **Relevance:** The template for our **Agent Routine Pipeline**. Each agent is a "Click element" in the cognitive network.
*   **Link:** [Click Paper](https://pdos.csail.mit.edu/papers/click:tocs00.pdf)

## 6. Arrakis: The Operating System is the Control Plane
*   **Key Insight:** Applications should talk directly to hardware (NICs, SSDs) for the data plane, while the OS only handles the "control plane" (setup/security).
*   **Relevance:** Direct hardware access for the multimedia ingestion pipeline.
*   **Link:** [Arrakis Paper](https://pdos.csail.mit.edu/papers/arrakis:osdi14.pdf)

## 7. Verifying a File System using Crash Hoare Logic (FSCQ)
*   **Key Insight:** A file system that is formally proven to recover correctly even if the power cuts at any micro-second.
*   **Relevance:** Critical for the **Physis Vault** storage layer to prevent data corruption during neural state saves.
*   **Link:** [FSCQ Paper](https://pdos.csail.mit.edu/papers/fscq:sosp15.pdf)

## 8. Scaling Symbolic Execution (KLEE)
*   **Key Insight:** A tool that automatically finds bugs in systems code by "exploring all possible paths."
*   **Relevance:** We will use KLEE-style logic to audit our custom system-level Rust drivers.
*   **Link:** [KLEE Project](https://klee.github.io/)

---
*Enrichment Task: Research team should read one paper per week and provide a 1-page implementation summary.*
