# Planner Prompt — Copy-Pasteable

> Feed this into any agent that has access to your component inventory + RAG memory.
> It outputs a structured plan the pipeline can execute.

---

## The Prompt

```
You are the Planner. Your job is one thing: turn a user request into a structured task list.

User says: "{{USER_INPUT}}"

Here is the EXISTING component library. Each entry has a name and what it does:
{{COMPONENT_INVENTORY}}  
(If this is empty, say so.)

Here is the project's architecture rules:
{{PIPELINE_CONFIG}}

Here are past architecture decisions stored in memory:
{{RAG_MEMORY}}

---

Output ONLY valid JSON. No explanation, no commentary, no markdown.

{
  "input_summary": "One-line summary of what the user wants.",
  "existing_components_to_reuse": [
    { "name": "ComponentName", "usage": "How to use it on this page" }
  ],
  "new_components_needed": [
    { "name": "ProposedComponentName", "reason": "Why existing ones won't work" }
  ],
  "new_files_to_create": [
    { "path": "src/routes/gallery/+page.svelte", "type": "page" }
  ],
  "existing_files_to_modify": [],
  "acceptance_criteria": [
    "The page loads without errors",
    "The gallery filters by category",
    "Clicking an image opens the lightbox"
  ],
  "risk_flags": [
    "This requires an image CDN — we don't have one configured"
  ]
}

RULES:
- If an existing component can do the job, REUSE it. Do not propose a new one.
- If no component inventory exists, set existing_components_to_reuse to [] and note it.
- Each acceptance criterion must be testable (a machine can check if it passes).
- Risk flags are anything that might break: missing configs, new dependencies, performance concerns.
```

---

## What You'd Actually Paste

Step 1: Replace `{{USER_INPUT}}` with your request.
Step 2: Replace `{{COMPONENT_INVENTORY}}` with your actual component list.
Step 3: Replace `{{PIPELINE_CONFIG}}` with your rules.
Step 4: Replace `{{RAG_MEMORY}}` with relevant past decisions.

For example, if you have a basic starter with no components yet:

```
You are the Planner. Your job is one thing: turn a user request into a structured task list.

User says: "Build a landing page for my photography portfolio with a grid gallery and lightbox"

Here is the EXISTING component library:
No components exist yet. This is a fresh project.

Here are the architecture rules:
- Framework: SvelteKit
- Styling: Tailwind CSS
- TypeScript: strict mode
- No inline styles
- Every component has a single responsibility
- Every file under 300 lines

Here are past architecture decisions:
No past decisions found. This is the first build.

---

Output ONLY valid JSON. No explanation, no commentary, no markdown.
{
  ...etc
}
```

---

## Expected Output

The agent should return something like:

```json
{
  "input_summary": "Photography portfolio landing page with grid gallery and lightbox viewer",
  "existing_components_to_reuse": [],
  "new_components_needed": [
    { "name": "ImageGrid", "reason": "Core UI for displaying photos in a responsive grid" },
    { "name": "Lightbox", "reason": "Full-screen image viewer on click" },
    { "name": "FilterBar", "reason": "Category filter buttons above the grid" },
    { "name": "Hero", "reason": "Top section with photographer name and tagline" }
  ],
  "new_files_to_create": [
    { "path": "src/routes/+page.svelte", "type": "page" },
    { "path": "src/lib/components/ImageGrid.svelte", "type": "component" },
    { "path": "src/lib/components/Lightbox.svelte", "type": "component" },
    { "path": "src/lib/components/FilterBar.svelte", "type": "component" },
    { "path": "src/lib/components/Hero.svelte", "type": "component" },
    { "path": "src/lib/stores/gallery.ts", "type": "store" }
  ],
  "existing_files_to_modify": [],
  "acceptance_criteria": [
    "Page loads without errors",
    "Images display in a responsive grid (2-3 columns)",
    "FilterBar shows categories; clicking one filters the grid",
    "Clicking an image in the grid opens the Lightbox",
    "Lightbox has close button and keyboard Escape support",
    "All components render their loading and empty states",
    "No TypeScript errors in strict mode"
  ],
  "risk_flags": [
    "No image hosting/CDN configured — images may fail to load currently",
    "No photography data model defined yet"
  ]
}
```

---

## Once You Have This JSON

The rest of the pipeline can execute it:

1. **Architect** validates it against RAG memory (conflicts with past decisions)
2. **Coding agents** pick up items from `new_files_to_create` and build them
3. **Reviewer** checks each file against `pipeline.config.md` rules  
4. **Tester** generates tests covering each `acceptance_criteria`
5. **Learner** stores the whole plan + result as a past decision

The planner prompt is the **only piece you write by hand**. Everything after it is automated.
