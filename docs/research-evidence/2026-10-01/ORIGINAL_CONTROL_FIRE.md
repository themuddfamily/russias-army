# Recovered ControlDown firing

Both recovered weaponry.gun handlers test `the mouseDown or the controlDown` inside their non-typing and ready gates: Woodland line158, Barrack line170. The copy previously consulted only its mouse firing flag. Holding either physical Control key therefore never reached the source firing branch.

The source callback now accepts ControlLeft or ControlRight alongside the existing mouse flag. Normal keydown records a standalone Control before the browser shortcut guard, and source talk retains its physical state while suppressing weapon execution. Keyup removes it. This uses the existing atomic shot/reload/counter path, including exhausted-weapon sorting; no parallel firing or authored cadence is introduced. Winter is outside the recovered callback.

Actual Game tests on both maps and both Control keys verify repeated shots without mouseDown, release stopping shots, typing preventing shots, and continuation after typing ends. Winter bypass is checked separately. The focused combat suite passes71 tests. Real browser authority receipts verify the host integration separately. The fixture holds real Control key states and uses form.requestSubmit() to close talk through the production listener because SEND is visually hidden and modifier chords retain browser protection; it does not claim a visible button click or native modified-Return behavior; native host key scheduling remains unmeasured.

Browser Ctrl/Meta/Alt secondary-key shortcuts retain existing protection and editing rules. This does not claim those host chords match Director. Held mouse-button retention across chat remains a separately identified gap; full G07 and weapon/render timing acceptance remain open.

## Retained authority timing failure

The corrected eight-case browser run passes seven cases, including Barrack Control and all four held-W cases plus both existing scope cases. Woodland Control reaches accepted shots and key release but receives one `fire_rate` rejection. The server's source check uses callback readiness/selected weapon, rather than the Winter millisecond fire interval. Its cause is not established by this run; source callback/packet phase agreement remains a real open integration issue. The failure screenshot, trace and fixture are retained under `source-control-fire-authority-rejection`; the initial hidden SEND click failures are retained separately. This pass does not claim a clean eight-case result or suppress protocol errors.

[The bounded timing review](ORIGINAL_CONTROL_FIRE_TIMING_LIMIT.md) identifies the exact server rejection gate and the synchronized evidence still needed to establish its cause.

[The input acknowledgment correction](ORIGINAL_CONTROL_FIRE_INPUT_ACK.md) supersedes the unresolved authority timing state above, with correlated live dispatch/receipt epochs and controlled callback-boundary tests. The retained failure remains historical evidence.
