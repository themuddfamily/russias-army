# Original Woodland ammunition counters

Inspected 2026-09-30. This audit uses the preserved original Woodland recording, its decoded HUD crops, and the surviving original player-guide screenshot. It does not use Next Gen weapon rules or real-world magazine specifications.

## Directly readable observations

The sharp [0-second frame](woodland-video-0s.jpg) and [15-second frame](woodland-video-15s.jpg) both show these six rows:

| Row | Displayed pair | What is established |
| --- | --- | --- |
| pistol | 8 / 54 | Readable displayed state; no pistol firing or refill in these frames |
| spas12 | 6 / 24 | Readable displayed state; no shotgun refill here |
| ak47 | 28 / 140 | Readable displayed state, subsequently corroborated by firing and refill |
| rg6 | 6 / 18 | Readable displayed state; row 4 selected yellow at 0 seconds |
| rpg | 1 / 12 | Readable displayed state; no RPG firing or refill here |
| dragunov | 30 / 12 | **Thirty**, not three: the separate zero is readable in both decoded frames and the larger player-guide screenshot |

The [Mark Wiering screenshot](woodland-mark-wiering.jpg) independently shows pistol 8/54, spas12 6/24, selected AK 2/112, RG6 6/18, RPG 1/12 and Dragunov 30/12. It corroborates the displayed numbers and AK count changing, but does not establish a fresh-spawn loadout or a Dragunov magazine capacity.

## Observed AK burst and refill

The [decoded burst HUD sheet](woodland-burst-hud-19.5-21.8.png) samples the preserved recording at 0.1-second intervals. Its labels are offsets from 19.5 seconds:

- 19.5 and 19.6 seconds: 28 / 140.
- 19.7–20.6 seconds: the left count decreases through 25, 24, 22, 21, 19, 18, 17, 15, 14 to 12; the right count remains 140.
- 20.6–21.5 seconds: 12 / 140.
- 21.6–21.8 seconds: 28 / 124.

The refill therefore adds **16** to the first counter and removes **16** from the second. Together with the burst, this strongly supports loaded ammunition / reserve ammunition semantics for AK. The [refill presentation sheet](woodland-reload-21.3-22.8.png) shows the gun lowering after the counters change and returning, without a detached magazine animation.

This particular refill ends at **28**, with ample reserve still present. That is stronger evidence than a single starting snapshot for an original AK refill target of 28. It still does not directly expose the original internal capacity constant, input time, lockout duration, automatic refill trigger, fresh-spawn values, pickup behavior, or rules for another edition/map. The decoded prefix is sampled at 10 fps; intermediate shots may be skipped, so these differences must not be used as exact firing-interval measurements.

## Difference from the copy

At inspection, [WeaponState and WEAPONS](../../../src/weapons.ts) use loaded/reserve pairs pistol 8/64, shotgun 8/40, AK 30/150, RG6 6/18, RPG 1/5, Dragunov 10/40. Reload transfers ammunition from reserve to loaded up to each magazine setting. Thus the counter **semantics** already agree with the observed AK sequence; most numerical settings differ from the readable source state. The existing AK refill target of 30 also differs from the observed original refill endpoint of 28.

Implemented later on 2026-09-30: the Woodland AK refill target is now **28** in both client and authoritative server paths. Timed client and real server shooting/reload fixtures reproduce **12/140→28/124**. Spawn/reset remains **30/150** as an explicit copy rule. The target follows the map under either control preset; Barrack and archived Winter retain 30. This matches the preserved sequence, without proving every historical ammo rule or the original internal capacity.

The other displayed pairs may be used as comparison constraints, but changing fresh-spawn or magazine values for all six weapons is not justified by these stills alone. In particular, Dragunov 30/12 proves what the HUD displays, not a 30-round functional magazine. Do not hardcode false HUD counters: displayed counters must continue to report the actual game state. Further original firing/refill or fresh-spawn evidence is needed before claiming full numerical parity.

## Provenance and limits

Original video: [Saurogon, Russias Army Woodland](https://www.youtube.com/watch?v=fkB8Yg9S1HM), uploaded 2014-09-02. The local [first 45-second recording](woodland-video-first45s.mp4) and derived frame sheets are preserved research evidence; this audit adds no transformed source images. See the existing [video provenance](../video-provenance.json) and [remaining weapon observations](REMAINING_WEAPON_OBSERVATIONS.md). Source duration and later storyboard intervals are not decoded sharp-frame timing evidence.

The surviving player guide is [Mark Wiering's games page](https://www.markwiering.nl/games.htm). Its Woodland screenshot is the original-edition image; its separate Next Gen images were excluded. No audio, damage, respawn, pickup or full-match rule is established by this ammunition audit.
