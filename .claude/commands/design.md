Unified design command. All design work routes through design-master.

Modes:
- /design — activate design-master for current task (reads design-memory.json first)
- /design frontend — surface=web, Musubi brand layer enforced
- /design hud — surface=HUD, HUD token system enforced  
- /design brand — surface=identity, musubi-ember + Bricolage Grotesque
- /design audit — design critique on current implementation

All modes: read design-memory.json first, write decisions back on completion.
Related: /design-source-pack for extracting reusable visual systems.
Auto-activates via hook when design intent detected in prompt.
