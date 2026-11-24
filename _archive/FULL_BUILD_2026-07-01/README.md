# SE-MENU

A premium Windows desktop application for testing networks, hardware, time,
motion and UI components. One workspace, one tab (`TEST`), every probe live.

![stack](https://img.shields.io/badge/Electron-33-22d3ee) ![platform](https://img.shields.io/badge/Windows-11-818cf8) ![version](https://img.shields.io/badge/version-1.0.0-e879f9)

---

## What's inside

| Section | What it does |
|---|---|
| **Network Lab** | Live ICMP ping monitor (avg / min / max / jitter / loss + real-time graph), HTTP download & upload throughput with gauges and progress, public IP lookup, DNS resolution (A / AAAA / MX / TXT / NS / CNAME), traceroute with per-hop timings, interface enumeration |
| **System Monitor** | Per-core CPU load with graph, memory usage, application heap, disk usage per volume, GPU list, uptime & power state, hardware identity — all read from the OS |
| **Time Lab** | Live clock with milliseconds, stopwatch with laps, countdown with progress ring, session / system / process uptime |
| **Animation Lab** | Eight motion types on a live stage, speed & intensity controls, eight loader previews, 3D tilt, glow tracking, magnetic and ripple buttons, animated chart |
| **Performance Bench** | Frame rate, frame time, JS heap, event-loop lag, CPU benchmark (prime sieve + matrix multiply in a worker), click-latency measurement |
| **Developer Console** | Live event log, console mirror, diagnostics, endpoint connectivity checks, background task status, test history, JSON report export |
| **Component Playground** | Sliders (horizontal, vertical, dual range), toggles, checkboxes, radios, segmented controls, every button style, progress, badges, skeletons, accordions, mini tabs, steppers, pagination, rating, sortable table, interactive cards, tooltips, notifications |
| **Utility Bench** | JSON formatter, Base64, UUID / token generator, SHA-256 & SHA-1 hashing, text statistics, color palette & contrast checker, file hasher, HTTP tester, URL parser, screen capture, dead-pixel tester, display info, power & battery, storage estimate, reaction time, CPU stress, clipboard, number bases, timestamp converter, password generator |

Everything is measured — nothing is simulated.

---

## Run it

```bash
npm install
npm start          # launch the app
npm run selftest   # automated checks + screenshot + selftest-report.json
npm run icon       # regenerate the icon set
npm run dist       # build the NSIS installer + portable executable
```

Requirements: Windows 11 (Windows 10 works for the app itself; the installer
targets Windows 10+), Node 18+ for development.

---

## Build & distribute

```bash
npm run dist
```

Outputs into `dist/`:

- `se-menu-Setup-1.0.0.exe` — NSIS installer (choose the install folder, desktop shortcut)
- `se-menu-Portable-1.0.0.exe` — single-file portable build

Publish either one to a release endpoint and point users at it — see
[UPDATE_SERVER.md](UPDATE_SERVER.md) for the exact manifest format, the
auto-update flow and the integrity model.

---

## Architecture

```
src/
  main/
    main.js      window, IPC, tray, dialogs, benchmark/stress workers, self-test
    system.js    OS telemetry: os.cpus() deltas + one PowerShell CIM snapshot
    net.js       ping, HTTP throughput, DNS, traceroute, raw HTTP, interfaces
    updater.js   version compare, manifest parsing, resumable download, SHA-256, install
  preload/
    preload.js   the only bridge to the renderer (contextBridge, no nodeIntegration)
  renderer/
    index.html   shell + TEST tab template
    styles/      design system (tokens, glass, motion)
    js/
      app.js     bootstrap, tab registry, title bar, chips, splash
      dom.js     DOM builder, icon set, toasts, tooltips, modals, bus
      charts.js  canvas LineChart / Gauge / Spark (DPR aware, animated)
      netlab.js  Network Lab
      sysmon.js  System Monitor
      timelab.js Time Lab
      animlab.js Animation Lab
      perf.js    Performance Bench
      devtools.js Developer Console
      playground.js Component Playground
      utilities.js Utility Bench
      updater-ui.js update banner + update modal
      settings.js settings popup
      selftest.js automated renderer checks
```

Security: `contextIsolation` on, `nodeIntegration` off, sandboxed preload with a
single namespaced bridge, CSP restricted to `self` plus the measurement
endpoints, no remote code execution.

---

## Adding a tab

The tab system is a registry — `app.js` mounts one tab today:

```js
SE-MENU.app.registerTab({
  id: 'test',
  title: 'TEST',
  icon: 'flask',
  tip: 'Testing playground',
  mount(container) { /* build the page */ },
});
```

Add another `registerTab` call anywhere after boot and the sidebar, routing and
per-tab lifecycle are handled automatically.

---

## Configuration

Settings live in `%APPDATA%\SE-MENU\config.json`, update settings in
`%APPDATA%\SE-MENU\update-config.json`. Both survive application updates because
they live outside the install directory.

Open **Settings** (gear, top right) for appearance, animation, interface,
notification, update and network endpoint preferences.

---

## Self-test

`npm run selftest` boots the app in a special mode, runs 30+ automated checks
across the renderer and main process, writes `selftest-report.json` and captures
`selftest.png`. It also validates that ping, DNS, HTTP, telemetry and the update
state machine behave. Run it after any change to the measurement layers.

`scripts/test-updater.js` exercises the full update pipeline against a local
release server: manifest parsing, version comparison, resumable download,
SHA-256 verification and corruption rejection.

---

## License

MIT.
