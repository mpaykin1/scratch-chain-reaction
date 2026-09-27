# Water crisis: one complete causal scenario

Start at [the fullscreen scenario](https://mpaykin1.github.io/scratch-chain-reaction/cinematic/scenario.html).
The original Scratch .sb3 and the original sandbox game stay available.

## What is implemented
- A town starts with water scarcity (23/100); the player chooses among four structures plus a free proposal.
- Each structure requires a written explanation before construction. A deterministic parser identifies mechanisms, resources, assumptions and missing counterexamples.
- The preview replays exactly three future turns on a **clone** of the current game and does not alter the saved world.
- Two structures worsen water scarcity after an initial improvement; imports transfer the damage to the food budget; watershed restoration makes progress more gradually.
- Effects have delays and named causal parents. Choosing another project does not cancel unresolved effects of the previous one.
- Electricity failure stops pumps. Water failure damages agriculture and drives migration. Ecological damage affects food. Continued play remains possible even after catastrophe.
- The world visibly changes: forest and power facilities appear, the background recovers when water and ecology recover, walking inhabitants and wind turbines animate.
- The complete history and save state persist locally and can be exported to JSON.

## How it differs from a live AI
The engine is deterministic and open-source, **not a free-text LLM**. The four structures and a limited set of free-project mechanisms are explicitly modelled. Unrecognized proposals are refused with a request for AI or human review, rather than falsely claimed as simulated. A future optional server endpoint can replace the intent analyser while the deterministic causal engine stays the authoritative source of resource updates.

## Verification
- node --test test/scenario-engine.test.mjs
- BASE_URL=http://127.0.0.1:8765 node test/scenario-ui.cjs
- The existing Scratch native and 3-viewport gates still run in .github/workflows/release.yml.
- The 3-viewport scenario gate checks every card is visible, no overflow, preview, crisis, secondary generation, persistence, recovery, five choices and free input.

## Next steps
Add secure optional LLM intent classification, wider vocabulary and more objects, independent simulator preflight of generated alternatives, Supabase save IDs and multiplayer. No feature or pass state is implied before deployment and QA.

