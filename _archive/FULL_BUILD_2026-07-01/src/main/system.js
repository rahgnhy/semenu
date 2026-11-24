'use strict';

/**
 * SystemProvider — collects real hardware / OS telemetry.
 *
 * CPU load is computed from `os.cpus()` time deltas (accurate, no spawning).
 * Memory, disk, GPU, battery and hardware identity come from a single
 * PowerShell CIM snapshot refreshed on an interval and cached.
 */

const os = require('os');
const { execFile } = require('child_process');

const WMI_SCRIPT = [
  "$ErrorActionPreference='SilentlyContinue'",
  "$os=Get-CimInstance Win32_OperatingSystem",
  "$cs=Get-CimInstance Win32_ComputerSystem",
  "$cpu=@(Get-CimInstance Win32_Processor)",
  "$gpu=@(Get-CimInstance Win32_VideoController)",
  "$disk=@(Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\")",
  "$bat=@(Get-CimInstance Win32_Battery)",
  "$o=[ordered]@{",
  "caption=$os.Caption",
  "version=$os.Version",
  "build=$os.BuildNumber",
  "totalMemKB=$os.TotalVisibleMemorySize",
  "freeMemKB=$os.FreePhysicalMemory",
  "manufacturer=$cs.Manufacturer",
  "model=$cs.Model",
  "systemType=$cs.SystemType",
  "cpuName=(($cpu | ForEach-Object { $_.Name }) -join '; ')",
  "cpuCores=($cpu | Measure-Object -Property NumberOfCores -Sum).Sum",
  "cpuLogical=($cpu | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum",
  "cpuMaxClock=($cpu | Measure-Object -Property MaxClockSpeed -Maximum).Maximum",
  "gpus=@($gpu | ForEach-Object { [ordered]@{name=$_.Name; driver=$_.DriverVersion; vram=$_.AdapterRAM; status=$_.Status} })",
  "disks=@($disk | ForEach-Object { [ordered]@{id=$_.DeviceID; vol=$_.VolumeName; size=$_.Size; free=$_.FreeSpace} })",
  "battery=@($bat | ForEach-Object { [ordered]@{status=$_.BatteryStatus; charge=$_.EstimatedChargeRemaining} })",
  "}",
  "$o | ConvertTo-Json -Depth 6 -Compress",
].join('\n');

const PS_ARGS = [
  '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
  '-OutputFormat', 'Text', '-Command', WMI_SCRIPT,
];

class SystemProvider {
  constructor() {
    this.lastCpuTimes = os.cpus().map(c => ({ ...c.times }));
    this.lastCpuAt = Date.now();
    this.wmi = null;
    this.wmiPromise = null;
    this.wmiFails = 0;
    this.hardware = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      totalmem: os.totalmem(),
      cpus: os.cpus().map(c => c.model),
    };
    this.refreshWmi();
    this.timer = setInterval(() => this.refreshWmi(), 4000);
    if (this.timer.unref) this.timer.unref();
  }

  refreshWmi() {
    if (this.wmiPromise) return this.wmiPromise;
    this.wmiPromise = new Promise(resolve => {
      execFile('powershell.exe', PS_ARGS, { timeout: 10000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
        this.wmiPromise = null;
        if (err) {
          this.wmiFails++;
          resolve(null);
          return;
        }
        try {
          const parsed = JSON.parse(stdout.toString().trim());
          if (parsed && typeof parsed === 'object') {
            this.wmi = parsed;
            this.wmiFails = 0;
          }
        } catch (e) {
          this.wmiFails++;
        }
        resolve(this.wmi);
      });
    });
    return this.wmiPromise;
  }

  cpuLoad() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalAll = 0;
    const perCore = cpus.map((c, i) => {
      const prev = this.lastCpuTimes[i] || c.times;
      const cur = c.times;
      const d = k => (cur[k] || 0) - (prev[k] || 0);
      const idle = d('idle');
      const all = d('user') + d('nice') + d('sys') + d('irq') + d('idle');
      totalIdle += idle;
      totalAll += all;
      return all > 0 ? Math.min(100, Math.max(0, (1 - idle / all) * 100)) : 0;
    });
    this.lastCpuTimes = cpus.map(c => ({ ...c.times }));
    this.lastCpuAt = Date.now();
    const load = totalAll > 0 ? Math.min(100, Math.max(0, (1 - totalIdle / totalAll) * 100)) : 0;
    return { load, perCore };
  }

  processMem() {
    const m = process.memoryUsage();
    return {
      rss: m.rss || 0,
      heapUsed: m.heapUsed || 0,
      heapTotal: m.heapTotal || 0,
      external: m.external || 0,
      arrayBuffers: m.arrayBuffers || 0,
    };
  }

  snapshot() {
    const cpu = this.cpuLoad();
    const w = this.wmi || {};
    const totalMem = Number(w.totalMemKB) ? Number(w.totalMemKB) * 1024 : os.totalmem();
    const freeMem = Number(w.freeMemKB) ? Number(w.freeMemKB) * 1024 : os.freemem();
    const usedMem = Math.max(0, totalMem - freeMem);
    const disks = (w.disks || []).map(d => {
      const size = Number(d.size) || 0;
      const free = Number(d.free) || 0;
      const used = Math.max(0, size - free);
      return { id: d.id, vol: d.vol || '', size, free, used, percent: size ? (used / size) * 100 : 0 };
    });
    const battery = Array.isArray(w.battery) && w.battery.length
      ? { status: w.battery[0].status, charge: w.battery[0].charge }
      : null;
    return {
      ts: Date.now(),
      cpu,
      mem: { total: totalMem, free: freeMem, used: usedMem, percent: totalMem ? (usedMem / totalMem) * 100 : 0 },
      app: this.processMem(),
      disk: disks,
      gpu: w.gpus || [],
      battery,
      hardware: {
        ...this.hardware,
        manufacturer: w.manufacturer || '',
        model: w.model || '',
        systemType: w.systemType || '',
        cpuName: w.cpuName || (this.hardware.cpus[0] || ''),
        cpuCores: Number(w.cpuCores) || this.hardware.cpus.length,
        cpuLogical: Number(w.cpuLogical) || this.hardware.cpus.length,
        cpuMaxClock: Number(w.cpuMaxClock) || 0,
        osCaption: w.caption || '',
        osVersion: w.version || '',
        osBuild: w.build || '',
      },
      uptime: os.uptime(),
      load: os.loadavg ? os.loadavg() : [0, 0, 0],
    };
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
  }
}

module.exports = { SystemProvider, WMI_SCRIPT, PS_ARGS };
