# SE-MENU

A compact liquid-glass utility console for Windows. Animated glass background,
four workspaces, real measurements.

![stack](https://img.shields.io/badge/Electron-33-8b7cf6) ![platform](https://img.shields.io/badge/Windows-11-9ba3af) ![version](https://img.shields.io/badge/version-1.0.4-a78bfa)

---

## What it is

SE-MENU is a small floating glass window with four workspaces:

| Tab | Contents |
|---|---|
| **Test** | Live ping monitor with graph and stats, download/upload throughput, DNS, traceroute, interfaces · CPU, RAM, app memory, disks, GPU, FPS, uptime · clock, stopwatch with laps, countdown · component playground · performance bench · developer console · utility tools |
| **OpenCode Reset Tokens** | launches the OpenCode Infinite launcher and resets its token state |
| **Il2CppDumper** | IL2CPP metadata decrypt and repair, Il2CppDumper run, dump index and search, naming analysis, run log |
| **Settings** | Background animation picker with live previews, speed/intensity/blur/brightness/opacity/quality controls · UI scale, glass transparency and blur, accent colour, compact mode · updates and about |

The animated background renders on its own canvas inside the window and sits
behind every frosted panel, so the glass refracts whatever is moving.

## Run it

```bash
npm install
npm start          # launch from source
npm run selftest   # smoke checks + report
npm run test:il2cpp -- --dump   # IL2CPP pipeline acceptance test
npm run dist       # build the installer and portable executable
```

Pre-built binaries live in `dist/`:

- `semenu-v1.0.4-Setup.exe` — NSIS installer
- `semenu-v1.0.4.exe` — single-file portable build

## Background animations

Six render styles, all drawn on one canvas behind the glass:

| Style | Look |
|---|---|
| **Liquid Glass** | slow reflective light fields with drifting specular streaks |
| **Dark Waves** | layered silver wave ribbons |
| **Atmospheric** | drifting fog banks and ambient light |
| **Particles** | depth-sorted floating dust with bokeh |
| **Aurora** | swaying vertical light curtains |
| **Abstract** | rotating ring and rounded-rect outlines |

Every style responds to the speed, intensity, blur, brightness, opacity and
quality settings in the Settings tab, and the selection persists across
restarts.

## Liquid glass

Panels use a layered recipe rather than a flat transparent fill:

* `backdrop-filter: blur(20px) saturate(150%)` over the live canvas
* three-stop translucent gradient (top-lit glass falloff)
* 1px inner hairline highlight on the top edge
* diagonal specular sheen overlay on cards and panels
* soft outer shadow for separation

Glass transparency and blur are both user-adjustable in Settings.

## IL2CPP workspace

For Unity games built with IL2CPP. Point it at an APK, or at an extracted
`libil2cpp.so` plus `global-metadata.dat`, and it walks the whole chain:

- **Decrypt** — the container's S-box and per-section seeds are derived from the
  matching `libil2cpp.so`. Every section is verified field by field before
  anything is written: 84,657 fields, 127,343 methods, 23,319 properties, 102
  images, 102 assemblies and every string run. When no hypothesis passes, the
  pair is detached and the scores are reported instead of a guess.
- **Repair** — container defects are corrected and logged: `genericContainerIndex`
  restored to its stock slot, `elementTypeIndex` derived per enum from its own
  `value__`, `fieldRefs` retargeted or detached, `stringLiteral` widened from the
  container's 4-byte offset array to stock `{length, dataIndex}` pairs.
- **Dump** — the bundled Il2CppDumper writes `dump.cs`, `il2cpp.h`, `script.json`,
  `stringliteral.json` and `DummyDll`.
- **Analyse** — the dump is indexed and searched in place, and 23 naming signals
  are measured against what a normal Unity assembly produces. Suggested renames
  are a worklist with evidence attached; nothing is applied to the dump.
- **Report** — `report.md` and `report.json` are a run log: what was read, what
  changed, what could not be recovered, what was not checked, and every output
  with its real size. `types.csv` carries one row per type with its role.

## Architecture

```
src/
  main/
    main.js      window, IPC, tray, dialogs, benchmark/stress workers, self-test
    system.js    OS telemetry: os.cpus() deltas + one PowerShell CIM snapshot
    net.js       ping, HTTP throughput, DNS, traceroute, raw HTTP, interfaces
    updater.js   version compare, manifest parsing, resumable download, SHA-256, install
    il2cpp-extract.js     APK unzip and lib/metadata discovery
    il2cpp-decrypt.js     container S-box + seed recovery, section verify, convert
    il2cpp-metadata.js    v31 validator and repairer
    il2cpp-binary.js      ELF relocations and Il2CppType table
    il2cpp-dump-index.js  dump.cs index and cache
    il2cpp-crosscheck.js  metadata vs dump.cs vs binary
    il2cpp-obfuscation.js 23 naming signals, role propagation, rename worklist
    il2cpp-report.js      run log, report.md/json, types.csv, rename map
    il2cpp-query.js       search, type detail, re-analysis of an output folder
  preload/
    preload.js   the only bridge to the renderer (contextBridge, no nodeIntegration)
  renderer/
    index.html     shell + tab templates
    styles/        design system (tokens, glass recipe, motion)
    js/
      app.js       bootstrap, tab registry, title bar, window size memory
      dom.js       DOM builder, icon set, toasts, tooltips, modals, bus
      background.js animated background engine (six styles)
      charts.js    canvas LineChart / Gauge / Spark
      netlab.js    Network Lab
      sysmon.js    System Monitor
      timelab.js   Time Lab
      animlab.js   Animation Lab
      perf.js      Performance Bench
      devtools.js  Developer Console
      playground.js Component Playground
      utilities.js Utility Bench
      il2cpp-dumper.js IL2CPP workspace
      updater-ui.js update banner, modal and status blocks
      settings.js  Settings tab
      selftest.js  automated checks
```

Security: `contextIsolation` on, `nodeIntegration` off, sandboxed preload with a
single namespaced bridge, CSP restricted to `self` plus the measurement
endpoints.

## Configuration

Settings live in `%APPDATA%\se-menu\config.json`, update settings in
`%APPDATA%\se-menu\update-config.json`. Both survive application updates
because they live outside the install directory. The window also remembers its
size, position and maximised state.

## Updates

Publish a release and point SE-MENU at it — full instructions, the manifest
format and the integrity model are in [UPDATE_SERVER.md](UPDATE_SERVER.md).

```json
{
  "version": "1.2.0",
  "downloadUrl": "https://example.com/semenu-v1.2.0-Setup.exe",
  "sha256": "…",
  "notes": "What changed"
}
```

## Credits

Made by **sside**.

## License

MIT.
