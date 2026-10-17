# Score and health overlay audit

Passive script/cast/XMED examination confirms that **both editions display score**, independently of their differing health artwork. No original movie or ActionScript was executed.

## Score

Both `ParentScript 5 - goody.ls` files construct texture `stats`, set `nearFiltering = 0`, then place it at `point(rec[3] - 111, 80)` (Barrack line75; Woodland line76). Cast2186 has a128×128 texture envelope in both editions. Native text-envelope equality is established; responsive browser projection remains an adapter.

The preserved text is `score  30` in Barrack and `score  0` in Woodland: **two literal spaces** follow the label. Both `writestats` handlers replace `member("stats").word[2]` with `EMPTY & gscore`, then set that word to `rgb(255,255,0)`. Replacement preserves the intervening spaces; there is no score zero-padding, numeric health label, score prefix capitalization or added score suffix in this handler.

The referenced Paige styles use Arial bold12, no italic/underline, no character/space expansion. The label foreground is exact RGB255,0,0; the score foreground is RGB255,255,0. The active paragraph is record1 with justification1 (center). Stored ascent+descent+leading totals15; native font remeasurement and rasterization are not proven. The active paragraph contains one tab record, but the score text contains no tab character; do not add a synthetic tab.

Sources and byte ranges are retained by [dynamic-text-evidence.json](original-normal-ui/dynamic-text-evidence.json) and [other-hud-text-decode.json](original-normal-ui/other-hud-text-decode.json). Stats cast SHA256 is `f2d28f8985594c987f9c8243043a6eb46afcac897f406b9313aca75a7afb26bd`; Barrack XMED5126 SHA256 is `05451313ccf7805c4696ce96644b55317a7145eb410b8aac646cd1c52b71cc78`, Woodland XMED6536 SHA256 is `3b6d947c499781a6b57bd911c03b6ae4bc2657b134e0e7b77272cd5df7cb6df2`.

At the audit baseline, production `.legacy-score` is visible only in Woodland, uses16px/13px text, a5px numeric margin and added letter spacing, and is positioned relative to health rather than the independent source overlay. Correct both editions with a dedicated centered128×128 source score surface anchored at viewport-right−111,y80, literal two-space separation, Arial bold12 and exact red/yellow. Keep accessible numeric health separate from visible source artwork.

## Health

Both editions place the health overlay at `point(rec[3] - 82, 11)` (Barrack line78; Woodland line79). Their source health expression is the same, but the artwork/update path differs:

- Barrack `writestats` line297 selects Flash `posterFrame = 100 - (plives + 1 - pcheatflick)` on health cast3765/XMED5120.
- Woodland `writestats` lines301–304 computes that expression as `vphealth`, duplicates `healthempty`, and copies `healthfull` using the same source/destination rectangle `rect(0,64 - 0.64*vphealth,64,64)`. The three source bitmap members are64×64. Current `legacyHealthClip` preserves this normalized expression's +1 offset; browser clipping of out-of-range values is already explicitly adapted.

Barrack health is **not** the Woodland bitmap or an ordinary typographic plus. Its preserved SWF has64×64 stage,12FPS,100 frames and no executable tags in the published tag inventory. XMED5120 SHA256 is `cf457d250591f80b56677f13bdc5a8d203a8dae2dda8f06323ad138858b22966`; SWF starts at byte12. Passive static shape decoding finds:

- shape1 black cross, bounds0–60px, placed depth1 with a nonidentity transform/color transform;
- shape2 DefineMorphShape used as a clip mask at depth2 through depth4, updated by explicit ratios on frames2–99;
- shape3 red RGB204,0,0 cross, bounds2–62px, depth3;
- shape4 black1px cross outline at depth5, bounds1.5–62.5px;
- frame100 replaces the mask with shape5, a white rectangle spanning x−22–78,y0–77, clip depth4.

These structures permit a separate passive frame exporter, but no exact intermediate-frame mask recovery or out-of-range Flash posterFrame behavior was verified in this audit. Do not substitute Woodland clipping for Barrack and call it exact. At the baseline, Barrack instead displays an authored `✚` plus a numeric health value, so its visible health still needs source vector/frame recovery.

Scope switches UI texture1 only; health and stats are separate overlays and remain present. Any source score/health integration should retain this layer behavior while limiting artwork replacement to Barrack/Woodland; archived Winter is separate.
