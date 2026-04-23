# Odyssey handoff for Codex

## Goal
Build the **flow-first** capital visualization system, not the cluttered dashboard-heavy v17 variant.

The desired direction is:
- cinematic / minimal / flow-first
- one dominant luminous flow surface
- sparse contextual UI only
- floating or lightly anchored nodes preferred over rigid dashboard clutter
- preserve data-driven integrity where possible, but prioritize the visual system first

## What is in this bundle
- `odyssey_repo_package/` — the last clean baseline that was successfully packaged and pushed
- `CURRENT_RENDER_BAD.jpeg` — screenshot of the currently running result that the user rejected
- `REFERENCE_NOT_THE_GOAL_v17.jpeg` — example of the over-instrumented style the user explicitly said is NOT the goal
- `REFERENCE_FLOW_FIRST_TARGET_v23.png` — closer visual target: flow-first, luminous, continuous
- `LATEST_LOCAL_main.tsx` — most recent local experimental `main.tsx` that was uploaded into chat; not verified as the active source of truth

## GitHub repo status
Repo: `aglick555/-Odyssey`
Known pushed baseline commit from chat: `3a4fa77` with message `Add full Odyssey engine baseline`.
Important: later local experiments were **not reliably pushed**. Treat the packaged repo in this bundle as the stable baseline.

## Current baseline architecture
The stable packaged baseline already includes:
- Vite + React shell
- `src/odyssey/engine/layoutRouting.ts`
  - deterministic node layout
  - deterministic routing
  - bundle lane reservation
  - bundle thickness conservation
  - junction shaping
- `src/odyssey/components/RiverRenderer.tsx`
  - current SVG/path-based renderer (architecturally useful, visually insufficient)
- `src/odyssey/components/OdysseyCustomEngine.tsx`
  - UI wrapper around the renderer
- `src/odyssey/data/demoOdyssey.ts`
  - demo dataset

## What is working
- deterministic geometry / routing foundation
- reusable node and flow types
- a buildable React/Vite project
- baseline visual shell

## What is not working
- current renderer still reads as ribbons / SVG paths / spaghetti
- does not achieve the cinematic continuous-flow look
- does not form a convincing central “river body”
- uncertainty/glow are mostly cosmetic
- dashboard clutter distracts from the primary visual

## Explicit user feedback to preserve
1. The v17-style image is **NOT** what is being built.
2. The user wants a **continuous capital flow surface**.
3. They prefer a **floating** presentation over rigid columns if the visual result is stronger.
4. They have low tolerance for multi-step manual terminal workflows.
5. They want a handoff to Codex with everything zipped so the next person can continue directly.

## Recommended next technical move
Do **not** continue incremental hacks on the current SVG renderer.

Instead, create a new isolated renderer track:
- keep the existing deterministic layout/routing engine as geometry input
- replace the visual renderer with a **field-first** or **canvas/webgl/pixi** approach
- treat routing outputs as guides for a continuous density field, not as final visible ribbons

### Suggested implementation plan
1. Preserve current baseline untouched.
2. Add a new route or component, e.g. `FlowFieldPrototype.tsx`.
3. Feed layout/routing outputs into a density-field renderer.
4. Render a luminous continuous body:
   - overlapping flow brightness accumulation
   - compression into a shared core
   - soft envelopes rather than discrete strands
5. Only after the flow looks correct, reintroduce minimal floating node cards.

## Visual priorities for the next iteration
1. One dominant flow surface
2. Central compression / shared river mass
3. Minimal interface chrome
4. Floating node cards
5. Soft light accumulation and blending
6. No bottom dashboard grid, no heavy side panels unless hidden/on-demand

## Anti-goals
Avoid:
- Bloomberg-terminal density
- many always-visible panels
- hard Sankey ribbons
- rigid dashboard clutter
- “show everything” mentality

## Where to start in code
- inspect `odyssey_repo_package/src/odyssey/engine/layoutRouting.ts`
- keep that as the geometry layer
- replace or bypass `odyssey_repo_package/src/odyssey/components/RiverRenderer.tsx`
- consider creating a clean proof-of-concept renderer in a new file rather than mutating the old one first

## Practical recommendation
Codex should first produce:
- a minimal, isolated `FlowFieldPrototype.tsx`
- mounted from `src/main.tsx` or behind a simple toggle
- with zero dashboard clutter
- just enough floating labels to prove the direction

Once the flow-first render is good, merge it back into the product shell.
