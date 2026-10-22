# Supported platforms and limitations

Bobert is an unofficial project. It is released for **macOS, Windows and Linux**.

| Platform | Notes |
| --- | --- |
| macOS | Supported. |
| Windows | Supported. Default storage (the editor's per-extension folder) relies on the Windows user profile's permissions; a chosen storage location gets an owner-only NTFS DACL check and is refused if that cannot be confirmed. |
| Linux | Supported. Default source location is `${XDG_CONFIG_HOME:-~/.config}/Kiro`. |

## Known limitations

- Remote, WSL and SSH windows: Bobert runs on your own computer (a UI extension), so the credit view and warnings work; the workspace audit, the Steering and Hooks review and the session hints only check local folders.
- Account figures come from Kiro's existing local logs. They are the last observed values with an as-of time, not a live balance. If Kiro has not written a recent response, the view shows stale or unavailable data instead of guessing.
- The credit limit Kiro reports is not verified as base-only or total capacity. Add-on balances, purchases and overages are not known to the extension: a modelled overage figure is shown (projected credits over the reported limit at the bundled per-credit price), but actual overage charges remain unknown to it.
- Consumption between observations is unknown, never assumed to be zero.
- One account at a time. Several account partitions, or logs without a supported identity, withhold the account view; there is no account selector.
- Kiro's log format is not a documented contract and may change. Unsupported formats produce an unavailable status.
- Kiro's own SQLite cache and CLI/Crew session metering are not read.
- The optional session hints (context reminder and model hint) read the newest IDE session's metadata on **macOS, Windows and Linux**, in a local extension host; they are silent in remote windows and for CLI sessions, and whenever the session folder or path format differs from what Bobert expects. Kiro's session files are an undocumented implementation detail and can change without notice.
- Forecasts are qualified constant-rate scenarios, not guarantees or confidence intervals.

See [how-values-are-calculated.md](how-values-are-calculated.md), [forecasting.md](forecasting.md) and [privacy-and-storage.md](privacy-and-storage.md) for the details behind these points.
