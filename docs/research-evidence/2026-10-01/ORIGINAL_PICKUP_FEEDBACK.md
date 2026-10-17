# Source pickup feedback restoration

Both recovered `ParentScript 13 - pickups.ls` handlers distinguish an absent weapon property from an existing property. All six properties are initialized by `goody`, so current source-map dropped-gun collections use `Ammo for the <symbol>.`, including when ammunition is exhausted. Source symbols are pistol, spas12, ak47, rg6, rpg and dragunov.

The copy now appends the recovered message through the existing five-line source hints presentation after reload, both in solo `updateWeaponDrops` and local authoritative `collected` handling. Solo removal and five-point scoring follow feedback, matching the recovered handler order. Online authority already transports ammunition and score; text is presented when its collection event arrives. Reload audio still refers to the current weapon, while the message names the collected weapon.

Tests compare both recovered scripts and initial inventory, exercise actual Game handlers and solo same-slot restoration, and check real online collection text and yellow newest-line styling in both editions. The source maps have no static health/key/task/clue pickups in current production; no speculative crate routing is introduced.

`goody.feedback()` calls zero-argument `playsound()`. Its omitted argument/member resolution remains unresolved; no named or generated feedback sound is invented. [The audio invocation audit](ORIGINAL_AUDIO_INVOCATION_AUDIT.md) inventories the sixteen named/dynamic sound routes and this seventeenth unresolved invocation per edition. Native fonts, raster placement, callback timing, audio output and complete V28 comparison remain open.
