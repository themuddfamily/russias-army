# Old-edition lifecycle and control findings

Researched 2026-09-30. These are contemporary player reports and portal instructions, not an inspected original executable. They strengthen specific old-edition evidence without establishing every version's rules.

## Barrack death and re-entry

The [MPCforum thread “Russias Army Game”](https://www.mpcforum.pl/topic/255101-russias-army-game/), dated **12 December 2010**, links Gamevial's original `playgames.php?game=russiasarmy` route. Author **Chit0s111** asks how to avoid entering the server again whenever killed. The critical clause is:

> żeby za każdym razem gdy mnie zabiją nie musiał wchodzić jeszcze raz od nowa na serwer

Meaning: the player wants to avoid re-entering the server from the beginning after each death. A same-day reply by **lesnydziad** suggests automatic login, corroborating the described re-entry inconvenience rather than normal automatic respawn. The source discusses possible cheats; no cheat instructions are needed or implemented here.

This is more specific than the early guide's unexplained GAME OVER/REPLAY wording. Together with the preserved [Barrack 2010 sheet](../barrack-2010-sheet-0.jpg), showing gameplay followed by GAME OVER and room-entry screens, it supports a **per-player death ending that player's session and requiring re-entry** for the original Barrack route. It does not prove how scores reset, the exact server disconnect timing, room-wide frag/time limits or every later revision. Automatic respawn should not be presented as verified old Barrack behavior.

The web search tool reproducibly retrieved the thread's indexed text, publication date and posts. Direct web opens returned cache misses. No full forum HTML or executable was recovered by this audit; [retrieval provenance](lifecycle-forum-provenance.json) records that distinction.

## Woodland instructions and dated player comments

The [9 April 2009 Woodland article](https://www.kotaro269.com/articles/12859.html) lists slots **1–6**, reload, Shift scope and Tab chat. Dated comments add:

- **11, 9 April 18:06:** play ended upon dying; no replay/server lifecycle specified.
- **51, 13 April 23:49:** `Ｍで今いるメンバーの表示。` — M displays current members; no scoreboard/artwork specified.
- **63, 19 April 18:14:** requests slot-6 Dragunov documentation, rejects comments 30/31's mine claim, and speculates about performance-dependent cadence.
- **38/43/45/48/61/72:** varied scores, including beyond 600; no formula or twelve-frag rule.
- **56/67/68/82:** fenced building gaps, rear cliff routes and RPG/tree collision. These suggest landmarks, not metric topology; grenade-jump terminology conflicts with the more specific guide.

No comment establishes spawn ammunition, exact arrow mappings or respawn delay. The linked 2008 article still failed to open. Six documented slots by 2009 do not explain its earlier five-slot instruction.

## Next supported decisions

An **M current-members list** is supported for the selected Woodland version. A **death-to-GAME OVER/re-entry path** now has independent old Barrack testimony plus Woodland corroboration. Their implementations should retain explicit source/version limits. Do not convert reported scores into guessed point values, infer a full starting loadout from weapon availability, add mines from contradicted comments, or claim an original room-wide win condition.

Root follow-up retrieved the forum’s indexed text with both recorded queries again, including the original-route link and same-day reply. A direct raw HTML request returned HTTP403. The Woodland article was retrieved directly as 151,418 bytes of EUC-JP HTML; [saved retrieval metadata](woodland-2009/provenance.json) records its URL, timestamp and SHA256. This strengthens preservation without turning player reports into measured executable rules.
