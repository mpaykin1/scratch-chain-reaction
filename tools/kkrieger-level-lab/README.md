# Krieger Level Lab — bridge-chamber-v1

This is a deliberately small proof that we can author a **new playable level** using the real Krieger technology stack instead of only running the original exported level.

The demo is generated from the pinned real C++ source:
`MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`.

## What is ours

`bridge-chamber-v1` is created at runtime in C++ from:

- `Mesh_Cube` procedural geometry;
- `GenMesh::Add` mesh composition;
- `Mesh_CollisionCube` ADD/SUB collision cells;
- `KKriegerMesh` + `KKriegerGame::AddMesh` collision import;
- `KKriegerGame::CellConnect` real cell graph/collision generation;
- `EngMesh::FromGenMesh` and `Engine_::AddPaintJob`;
- real Krieger light/material/render/postprocess/WebGL path.

The level has two rooms connected by a corridor, an arch/pillar composition in the first chamber and a three-tower signature in the second.

It is built around world coordinate `x=1000`, deliberately far away from the original authored level. The proof renderer discards the original scene draw/effect jobs at the final Krieger engine paint boundary and inserts only the custom mesh, so the visible level cannot be mistaken for an original room.

## Playability

The original `KKriegerGame` simulation remains active. The custom level adds three overlapping `KCM_ADD` cells plus `KCM_SUB` obstacle cells. The player is spawned inside the new collision graph.

Mobile controls call C++ directly:
- left joystick → W/A/S/D;
- drag free screen → real mouse-look deltas;
- JUMP → space;
- FIRE → real `sKEY_MOUSEL`.

## Portrait

The Level Lab reuses the already user-confirmed portrait solution:
- full portrait master viewport;
- projection aspect from actual width/height;
- portrait-sized full render target;
- full visual viewport canvas.

## Acceptance

The browser gate refuses publication unless:
- level id is exactly `bridge-chamber-v1`;
- 28 procedural visual cubes are reported;
- at least 5 custom collision cells exist;
- origin is `x=1000`;
- player is inside a real custom collision cell;
- portrait master viewport and projection are correct;
- holding W changes the real C++ player position;
- look input changes real `PlayerDir/PlayerLook`;
- the custom 3D image covers at least 72% of portrait height;
- the same gate passes again on the permanent public URL.
