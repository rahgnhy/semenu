# SE-MENU Test Console — archived build (2026-07-01)

This is a complete snapshot of the full-featured SE-MENU build taken before the
TEST tab was emptied. Everything needed to restore it is here.

## What's inside

| Path | Contents |
|---|---|
| `src/renderer/index.html` | shell + the full TEST tab template (all 8 section cards) |
| `src/renderer/js/netlab.js` | Network Lab |
| `src/renderer/js/sysmon.js` | System Monitor |
| `src/renderer/js/timelab.js` | Time Lab |
| `src/renderer/js/animlab.js` | Animation Lab |
| `src/renderer/js/perf.js` | Performance Bench |
| `src/renderer/js/devtools.js` | Developer Console |
| `src/renderer/js/playground.js` | Component Playground |
| `src/renderer/js/utilities.js` | Utility Bench |
| `src/renderer/js/updater-ui.js` | update banner + update modal |
| `src/renderer/js/settings.js` | settings popup |
| `src/renderer/js/selftest.js` | 32-check automated self-test |
| `src/renderer/js/dom.js`, `charts.js`, `app.js` | framework (DOM builder, icons, charts, tab registry) |
| `src/main/*`, `src/preload/*` | main process: telemetry, network engine, updater, IPC |
| `src/renderer/styles/styles.css` | design system |
| `assets/` | icon set + bundled fonts |

## Restore

From the project root:

```powershell
# safety copy of the current (empty-tab) build
Copy-Item src "$env:TEMP\se-menu-empty-src" -Recurse -Force

# put the archived build back
Copy-Item _archive\FULL_BUILD_2026-07-01\src -Destination . -Recurse -Force
Copy-Item _archive\FULL_BUILD_2026-07-01\assets -Destination . -Recurse -Force

npm start
```

`node_modules` is unchanged between builds, so no reinstall is required.

## Notes

* The main-process files in this archive are the versions that shipped with the
  full console. They are compatible with the empty-tab build as well.
* `npm run selftest` expects the full feature set; against the empty-tab build
  use the minimal self-test instead.
