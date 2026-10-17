# Recovered normal gameplay UI

The Barrack and Woodland copy now installs the original UI member's static frame-two artwork: translucent ammunition/chat backing, edition-specific emblem and caption outlines, four red reticle strokes and rounded black viewport border. Live health, ammunition and chat remain separate overlays above this artwork. Original scope frame one replaces the normal frame while scoped; normal artwork returns when scope closes. Archived Winter keeps its existing HUD.

## Primary evidence and extraction

[Static extractor](../../../scripts/research/extract-original-normal-ui.py) decodes Barrack cast4527/XMED5118 and Woodland cast5760/XMED6525 without executing Director, Flash or ActionScript. [Provenance](../../../public/assets/original-normal-ui/provenance.json) records original resource hashes, shape bodies, root/nested matrices, font glyph outlines, text advances, output hashes and explicit limits. [Extraction validation](original-normal-ui/extraction-validation.json) records deterministic regeneration and passive XML validation.

Both members contain identical selected normal-frame shape bodies and root placements. Their captions differ: original “Barrack” and “Woodland” text comes from DefineText9/DefineFont2 outlines; it is not substituted browser typography. The normal display list places backing at depth1, emblem at2, reticle at5 and border at40. Reticle sprite12 is translated to(385,285), with its center at(400,300). The source strokes are red, one pixel wide, five pixels long, separated by a ten-pixel central opening. `goody.buildui` sets the UI posterFrame2 and its camera overlay at(0,0), followed by separate dynamic overlays.

## Implementation and verification

[UI lifecycle module](../../../src/originalNormalUi.ts) prepends four inert image layers below dynamic HUD content, switches edition artwork, suppresses normal artwork during source scope, and removes its container on disposal. [Game integration](../../../src/game.ts) synchronizes map, active/paused presentation and source scope state. CSS replacements are limited to the two source maps, preserving Winter.

Six module tests cover lifecycle, edition switching, disposal, independent placement bounds and asset hashes. Full client/shared and server suites now pass **1,176+336=1,512 tests**, and both TypeScript configurations and the production build pass. [Browser validation](../../../artifacts/fidelity-review/2026-10-01/current/source-normal-ui-validation.json) records all eleven unique affected cases passing across runs. Both editions were inspected at800×600,1280×576 and390×844, including scoped/restored captures. The expanded lifecycle fixture initially used an online context for a solo-only review hook; separate paused-solo cases correct that fixture and cover death, Replay and edition switching. The failed run remains recorded.

## Limits still open

The original SWF stage is1024×1024. SVG output uses the visible800×600 source artwork viewport and stretches it to the current browser viewport. This is an explicit responsive projection adapter, especially apparent on narrow screens; it does not prove Director texture projection or native Flash rasterization, antialiasing, filters, line joins/caps or font hinting.

At the initial static-art integration, dynamic ammunition text extended beyond the recovered backing. [The later ammunition integration](ORIGINAL_AMMO_HUD_INTEGRATION.md) corrects its source anchor, envelope, padded text, font declaration and stored-metric stride. Health and chat still use browser layout adapters; native font/raster and overlay projection equality remain unproved. Historical transient camera registration also remains open. This installation does not increase checklist acceptance beyond27/40.

[Dynamic text evidence](ORIGINAL_DYNAMIC_HUD_TEXT.md) now pins both editions’ weapon member dimensions, source anchors, original plain-text row construction, style references and stored12-size fields. [Full primary Paige decoding](HUD_TEXT_STYLE_DECODE.md) now resolves font selection and stored style/paragraph fields, and the ammunition layout is installed. Native remeasurement and raster spacing remain unproved.
