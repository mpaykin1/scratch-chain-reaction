# Real 2.5D Game Fragments — provenance

This page replaced the earlier procedural imitation. The current gallery does **not** draw substitute game objects. Every visible location is an original screenshot from the source repository, and every animated character frame is cropped from an original source sprite sheet using the original animation metadata.

## Included

### Caapora 2.5D
- Repository: https://github.com/CaaporaGames/Caapora2.5D
- Cloned revision: `bbd76e8`
- License checked: root `LICENSE.md` — MIT
- Location: `Caapora1.png`
- Character sheet: `Assets/Caapora/Resources/Sprites/CaiporaRunning.png`
- Frame rectangles: `CaiporaRunning.png.meta`
- Animation timing/order: `Assets/Caapora/Resources/Animation/Animations/Caapora/CaaporaRunning-Down.anim`
- Source clip: 4 frames at 12 fps (0, 0.0833333, 0.166667, 0.25 seconds).

### Moral Matrix
- Repository: https://github.com/sedmugen/moral-matrix
- Cloned revision: `96ee552`
- License checked: root `LICENSE` — MIT
- README states the visual assets/screenshots/media in the repository are original.
- Location: `Assets/images/gameplay_sample.jpg`
- Character sheet: `Assets/Sprites/MC_8Direction_SpriteSheet.png`
- Frame rectangles: `MC_8Direction_SpriteSheet.png.meta`
- Animation order/timing: `Assets/Animation/Clips/McWalk0.anim`
- Source clip: 8 frames at 8 fps, one-second loop.

### Flare: Empyrean Campaign
- Repository: https://github.com/flareteam/flare-game
- Source revision used: `af6eee6d339ac98011864bfe89da837fe7769c28`
- License checked: art/data are CC-BY-SA 3.0 or later; engine code is GPLv3+.
- Location: `distribution/screenshot1.jpg`
- Character sheet: `mods/fantasycore/images/npcs/peasant_man1.png`
- Animation definition: `mods/fantasycore/animations/npcs/peasant_man1.txt`
- Source animation: `[stance]`, 4 frames, `duration=1600ms`, `type=back_forth`.
- Flare credits: https://github.com/flareteam/flare-game/wiki/Credits
- Reused Flare art on this page remains under CC-BY-SA 3.0 or later.

## Excluded rather than imitated

### Sovereign
Cloned revision `bc66672`. Engine license is GPLv3, but the current repository checkout does not provide a self-contained real location + player animation asset pair suitable for this browser gallery. The documentation explicitly notes third-party sprite graphics and attributions. No substitute was created.

### SimpleHD2D
Cloned revision `9d71017`. No repository license file is present, and the character asset names identify Final Fantasy VI / Terra material. It was excluded instead of redistributing unclear/copyrighted assets.

### Hero of Allacrost
The GitHub mirror README explicitly says the repository contains source/build files but **not the media files**. It was excluded instead of fabricating a replacement.

## Gallery repository
https://github.com/mpaykin1/scratch-chain-reaction/tree/main/2p5d-hero-gallery
