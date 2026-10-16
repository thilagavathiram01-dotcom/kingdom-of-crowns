# Model & Audio Credits

War of Crowns uses **CC0 (public domain)** packs plus one **Craftpix royalty-free**
pack (see the peasants row). Verify the licence on each pack's page before
downloading — packs and terms can change.

| Pack | Author / Source | URL | Licence | Used for |
|---|---|---|---|---|
| Medieval / fantasy town kit | Kenney | https://kenney.nl/assets | CC0 | Barracks, houses |
| Castle kit | Kenney | https://kenney.nl/assets | CC0 | HQ keep, walls, towers, gate, catapult |
| Nature kit | Kenney | https://kenney.nl/assets | CC0 | Pine/oak trees, rocks |
| Tower defense kit | Kenney | https://kenney.nl/assets | CC0 | Watchtower |
| Medieval village pack | Quaternius | https://quaternius.com | CC0 | House, barn, windmill |
| Fantasy characters (animated) | Quaternius | https://quaternius.com | CC0 | Knight, ranger |
| Medieval Builder pack | KayKit | https://kaylousberg.itch.io | CC0 tier | Worker builder |
| Adventurers / Skeletons | KayKit | https://kaylousberg.itch.io | CC0 tier | Swordsman, archer |
| Medieval 3D people (peasants, men + women) | Craftpix / Free Game Assets | https://craftpix.net/freebies/free-medieval-3d-people-low-poly-models/ | Craftpix free (royalty-free, unlimited projects) | Worker villagers |
| Audio pack | Kenney | https://kenney.nl/assets | CC0 | UI + battle sounds |

Single props via Poly Pizza (https://poly.pizza, filter CC0 only) and
OpenGameArt (https://opengameart.org, filter CC0 only).

> Current build runs on the **procedural fallback** (`src/models.js`): every
> building/unit renders with zero downloads, team-tinted in the owner's
> kingdom colour. Drop GLBs into `public/models/buildings|units|props/` and
> rename roof/cloak materials to `Team` for automatic recolouring.
>
> Troops (`src/troops3d.js`) are articulated low-poly humanoids modelled in
> the visual idiom of KayKit's Adventurers character pack (kaylousberg.itch.io,
> free CC0 tier — the reference for our KayKit castle/worker assets): chunky
> proportions, flat-shaded, class weapons per unit, with code-driven walk
> swing and attack lunges. Tunic, shield, plume/hood and cape trim take the
> kingdom dye; skin, leather, wood and iron stay natural. No third-party
> troop files are shipped — everything is generated at runtime (~20 meshes,
> <1k tris per trooper, ideal for web/mobile).
