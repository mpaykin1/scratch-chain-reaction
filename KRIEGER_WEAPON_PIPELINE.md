# Krieger weapon pipeline — source-level control map

Status: 2026-09-30  
Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`

This note records the exact first-person weapon and firing chain so custom levels do not accidentally amputate it.

## 1. Player resources come from the operator graph

`Exec_KKrieger_Para(KOp*, KEnvironment*)` reads animated operator parameters and writes:

- life / armor / alpha / beta and maxima;
- four ammo pools and maxima;
- `Player.Weapon[0..7]` ownership bits when `ResetByOp` is set;
- movement/camera physics parameters;
- player start position;
- `WeaponHits`.

Therefore player loadout is data-driven by the .kx operator graph, not hard-coded into the mobile shell.

## 2. Weapon visual/effect resources are KOp links

`Exec_KKrieger_Events(KOp*, KEnvironment*)` selects one of four arrays based on its animated mode:

- mode 0 -> `WeaponShot[8]`
- mode 1 -> `WeaponOptics[8]`
- mode 2 -> `WeaponExplode[0][8]`
- mode 3 -> `WeaponExplode[1][8]`

Then it copies eight `op->GetLink(i)` pointers into that array.

This is a crucial control point: weapons are not just meshes. They are references back into the authored operator graph.

## 3. Input chain

`KKriegerGame::OnKey` handles:

```
sKEY_MOUSEL / sKEY_CTRLR
 -> Player.FireKey = 1

BREAK
 -> Player.FireKey = 0
```

So a mobile bridge that injects `sKEY_MOUSEL` is only the first step.

## 4. Fire gating in OnTick

`KKriegerGame::OnTick` fires only when all relevant state is valid:

```
Player.FireKey
AND ammo available (or allowed infinite weapon)
AND CurrentWeapon == NextWeapon
AND Player.CoolTimer <= 0
AND WeaponTimer >= 0.25
```

Then it updates ammo/cooldown and only creates a shot if:

```
WeaponShot[CurrentWeapon] != 0
```

Therefore a FIRE button test that checks only input is insufficient.

## 5. Shot creation

`KKriegerGame::FireShot`:

- allocates a `KKriegerShot`;
- chooses point or cube physics from `ShotInfoTable`;
- calculates spawn transform from player camera/direction;
- assigns speed/tensor/cell;
- creates a `KEvent`;
- crucially assigns `shot->Event->Op = WeaponShot[weapon]`.

The projectile's authored appearance/effect is therefore again an operator graph reference.

## 6. Visible first-person weapon

`KKriegerGame::AddEvents` handles weapon switching. Once `WeaponTimer >= 1.0`:

```
CurrentWeapon = NextWeapon
WeaponEvent.Op = WeaponOptics[CurrentWeapon]
```

If that operator exists, the game updates the weapon event transform/modulation and sends it through:

```
KEnvironment::AddStaticEvent(&WeaponEvent)
```

That event must survive into scene/effect execution and Engine paint jobs.

## 7. Visible projectile/effect

`AddEvents` also iterates active `Shots` and sends each live shot event into `KEnvironment::AddStaticEvent`.

The native chain is therefore:

```
FIRE
 -> FireKey
 -> OnTick gates
 -> FireShot
 -> KKriegerShot::Event
 -> AddEvents
 -> KOp event execution
 -> scene/effect jobs
 -> Engine
 -> framebuffer
```

## 8. Important frame-order finding

In `mainplayer.cpp`, the relevant frame order is approximately:

```
Game->OnTick(...)
Environment->InitFrame(...)
Document->AddEvents(...)
Game->AddEvents(...)
root->Exec(...)
```

`Exec_KKrieger_Events` belongs to the authored root/operator execution and can repopulate the weapon-link arrays after a `Flush()`.

Therefore the statement “Flush permanently causes the missing weapon” is too strong without runtime telemetry.

Correct conclusion:

- `Flush()` is destructive and creates a dependency on successful re-execution of the weapon-binding operators;
- the Level Lab smoke test did not prove those links after its custom reset;
- **the guaranteed visual blocker is the later renderer isolation**, which clears `MeshJobs` and `EffectJobs` before painting.

This distinction is now permanent documentation.

## 9. Why Level Lab v1 cannot display native weapons/effects reliably

Its custom Engine path clears:

```
MeshJobs = 0;
EffectJobs = 0;
PortalJobs = 0;
SectorJobs = 0;
...
```

before adding only the custom level mesh.

Even if `WeaponOptics` and `WeaponShot` are valid and even if `Shots.Count` increases, the visual event work can be erased before the final paint.

That explains why “input works” and “the player moves” are not enough to prove FIRE/weapon rendering.

## 10. Weapon Lab acceptance telemetry

The next Weapon Lab must expose and assert, per current weapon:

- `Player.CurrentWeapon`
- `Player.NextWeapon`
- `Player.Weapon[current]`
- ammo pool
- `WeaponTimer`
- `Player.CoolTimer`
- `Player.FireKey`
- `WeaponOptics[current] != 0`
- `WeaponShot[current] != 0`
- both `WeaponExplode[*][current]` states
- `Shots.Count`
- shot event operator pointer/non-null state.

Test sequence:

```
baseline
 -> wait for weapon switch settled
 -> prove visible weapon region in framebuffer
 -> press FIRE
 -> prove FireKey/input transition
 -> prove ammo/cooldown or continuous-fire state transition
 -> prove Shots.Count/event creation
 -> prove framebuffer delta in weapon/muzzle/projectile region
 -> prove shot collision or expiry
```

No layer may be skipped.

## 11. Architectural rule for Native Level Lab v2

World replacement must happen at a scene/operator boundary that preserves the player and weapon event graph. Do not clear the entire renderer queue just to remove original environment geometry.

Preferred direction:

- identify and replace/override world sector/scene inputs;
- retain global/player/weapon/effect operators;
- let normal event execution enqueue weapon/effect jobs;
- let the same normal Engine/Paint2004 path render level + weapon + effects.

This is the path toward actual full control rather than a visually isolated demo.


## Quantified weapon graph evidence

The actual converted beta binds optics and shot events through four `KKrieger_Events` operators. Optics subgraphs reach **224–362 operators**; shot subgraphs reach **19–63 operators** and include particles/lights/scene transforms/physics depending on weapon.

Exact indices and counts: [KRIEGER_KX_ARCHAEOLOGY_BASELINE.md](KRIEGER_KX_ARCHAEOLOGY_BASELINE.md).
