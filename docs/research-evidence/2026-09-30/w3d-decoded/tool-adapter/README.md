# Static extraction adapter

This adapter is research tooling only. It parses IFX bytes and exports mesh JSON/GLB. It does not contain or invoke Director, Lingo, Shockwave or a player VM. The reused upstream parser modules are GPL-3.0-only; the license is preserved here. They were obtained from https://github.com/igorlira/dirplayer-rs at commit `68376fbb4494a6bbad4c70081ecdcb99814a74c9`.

To reconstruct the temporary utility, create a Cargo project with this `Cargo.toml` and `Cargo.lock`, place `main.rs` at `src/main.rs`, and copy these source-only paths from that pinned upstream tree:

- `vm-rust/src/director/chunks/w3d/` → `src/director/chunks/w3d/`
- `vm-rust/src/director/chunks/pfr1/types.rs` → `src/director/chunks/pfr1/types.rs`

For the recorded diagnostics, change `W3D_PARSER_LOG` from false to true in `parser.rs`, and change its logger call from `debug!(...)` to `eprintln!(...)`. These two diagnostic changes do not modify data decoding. Build with `cargo build --release`, then run the resulting adapter with a preserved XMED resource path and a new output directory as its two arguments. That executes only this static parser, not any recovered game code.

The adapter's Symbol shim performs case-insensitive comparisons and preserves original spellings. It intentionally leaks interned strings until process exit; each extraction is one short-lived process. The output includes unscaled original coordinates, shader/material descriptions and an exporter-provided Y-up basis in GLB. The synthetic `defaultmodel` helper mesh is removed if no stored model node references it. Original cast textures and script-driven material overrides are not embedded.

Upstream per-block parser errors are recorded in stderr. A successful process exit alone is insufficient: inspect the log and independently compare geometry counts and bounds. The GI bones-block parse error remains unresolved; its static geometry is valid, its skeleton animation is not validated. The source exporter can inject default light/group helpers; their existence is not evidence of original game objects.
