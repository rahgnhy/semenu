'use strict';

/**
 * net.js — real network measurement primitives used by the main process.
 *
 * Everything here performs actual measurements: ICMP round-trips via the
 * system ping client, HTTP(S) download/upload throughput with live progress,
 * DNS resolution, traceroute, raw HTTP requests and interface enumeration.
 */

const os = require('os');
const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const { execFile, spawn } = require('child_process');

/* ------------------------------------------------------------------ ping */

function ping(host, timeoutMs = 1500) {
  return new Promise(resolve => {
    const t = Math.max(200, timeoutMs | 0);
    execFile('ping.exe', ['-4', '-n', '1', '-w', String(t), host], {
      timeout: t + 3000,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    }, (err, stdout, stderr) => {
      const out = `${stdout || ''}\n${stderr || ''}`.trim();
      const m = out.match(/time[=<]\s*(\d+(?:\.\d+)?)\s*ms/i);
      if (m) {
        resolve({ ok: true, ms: parseFloat(m[1]), host, raw: out });
        return;
      }
      const fail = /(unreachable|timed out|could not find|transmit failed|general failure|destination host)/i.test(out);
      resolve({ ok: false, ms: null, fail, host, raw: out || (err ? err.message : '') });
    });
  });
}

/* ----------------------------------------------------------- speed test */

function _mod(url) {
  return url.startsWith('https') ? https : http;
}

function downloadTest({ url, durationMs = 12000, timeoutMs = 30000 }, onProgress) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let req = null;
    let bytes = 0;
    const started = Date.now();
    let lastReport = 0;
    let lastBytes = 0;
    let lastT = started;
    let hardTimer = null;

    const cleanup = () => {
      if (hardTimer) clearTimeout(hardTimer);
    };

    const finish = aborted => {
      if (settled) return;
      settled = true;
      cleanup();
      const dur = Date.now() - started;
      const mbps = dur > 0 ? (bytes * 8) / (dur / 1000) / 1e6 : 0;
      resolve({ bytes, durationMs: dur, mbps, aborted: !!aborted, url });
    };

    const fail = err => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const run = (target, redirects) => {
      req = _mod(target).get(target, {
        headers: { 'Accept-Encoding': 'identity', 'User-Agent': 'SE-MENU/1.0', 'Cache-Control': 'no-cache' },
        timeout: timeoutMs,
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
          res.resume();
          const next = new URL(res.headers.location, target).toString();
          return run(next, redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return fail(new Error(`HTTP ${res.statusCode}`));
        }
        const total = Number(res.headers['content-length']) || 0;
        res.on('data', chunk => {
          bytes += chunk.length;
          const now = Date.now();
          if (now - lastReport > 120) {
            const inst = (bytes - lastBytes) * 8 / Math.max(0.05, (now - lastT) / 1000) / 1e6;
            if (onProgress) onProgress({ bytes, total, instant: inst, elapsed: now - started, phase: 'download' });
            lastReport = now;
            lastBytes = bytes;
            lastT = now;
          }
          if (now - started >= durationMs) {
            finish(true);
            try { req.destroy(); } catch (e) { /* noop */ }
          }
        });
        res.on('end', () => finish(false));
        res.on('error', fail);
      });
      req.on('error', fail);
      req.on('timeout', () => fail(new Error('download timeout')));
    };

    hardTimer = setTimeout(() => {
      try { if (req) req.destroy(); } catch (e) { /* noop */ }
      finish(true);
    }, timeoutMs + durationMs + 2000);

    run(url, 0);
  });
}

function uploadTest({ url, durationMs = 12000, chunkSize = 1024 * 1024, timeoutMs = 30000 }, onProgress) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let bytes = 0;
    const started = Date.now();
    let lastReport = 0;
    let lastBytes = 0;
    let lastT = started;
    let hardTimer = null;
    let req = null;

    // Recycled payload buffer — content is irrelevant for a throughput test,
    // but a deterministic pattern keeps it compressible-resistant.
    const payload = Buffer.allocUnsafe(chunkSize);
    for (let i = 0; i < chunkSize; i += 4) {
      payload.writeUInt32LE(((i * 2654435761) >>> 0) ^ 0x5bd1e995, i);
    }

    const cleanup = () => { if (hardTimer) clearTimeout(hardTimer); };
    const finish = (aborted, status) => {
      if (settled) return;
      settled = true;
      cleanup();
      const dur = Date.now() - started;
      const mbps = dur > 0 ? (bytes * 8) / (dur / 1000) / 1e6 : 0;
      resolve({ bytes, durationMs: dur, mbps, aborted: !!aborted, status: status || 0, url });
    };
    const fail = err => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    req = _mod(url).request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'User-Agent': 'SE-MENU/1.0',
        'Cache-Control': 'no-cache',
      },
      timeout: timeoutMs,
    }, res => {
      res.on('data', () => { /* drain */ });
      res.on('end', () => finish(false, res.statusCode));
      res.on('error', fail);
    });
    req.on('error', fail);
    req.on('timeout', () => fail(new Error('upload timeout')));

    const pump = () => {
      if (settled) return;
      const elapsed = Date.now() - started;
      if (elapsed >= durationMs) {
        try { req.end(); } catch (e) { /* noop */ }
        return;
      }
      const canWrite = req.write(payload);
      bytes += payload.length;
      const now = Date.now();
      if (now - lastReport > 120) {
        const inst = (bytes - lastBytes) * 8 / Math.max(0.05, (now - lastT) / 1000) / 1e6;
        if (onProgress) onProgress({ bytes, total: 0, instant: inst, elapsed: now - started, phase: 'upload' });
        lastReport = now;
        lastBytes = bytes;
        lastT = now;
      }
      if (canWrite) setImmediate(pump);
      else req.once('drain', pump);
    };
    pump();

    hardTimer = setTimeout(() => {
      try { req.destroy(); } catch (e) { /* noop */ }
      finish(true);
    }, timeoutMs + durationMs + 2000);
  });
}

/* ------------------------------------------------------------------ dns */

async function dnsLookup(host, type = 'A') {
  const start = Date.now();
  const t = String(type || 'A').toUpperCase();
  try {
    let answers;
    switch (t) {
      case 'AAAA': answers = await dns.resolve6(host); break;
      case 'MX': answers = await dns.resolveMx(host); break;
      case 'TXT': answers = await dns.resolveTxt(host); break;
      case 'NS': answers = await dns.resolveNs(host); break;
      case 'CNAME': answers = await dns.resolveCname(host); break;
      case 'SOA': answers = await dns.resolveSoa(host); break;
      default: answers = await dns.resolve4(host); break;
    }
    return { ok: true, type: t, host, answers, timeMs: Date.now() - start };
  } catch (e) {
    return { ok: false, type: t, host, answers: [], error: e.code || e.message, timeMs: Date.now() - start };
  }
}

/* ------------------------------------------------------------ traceroute */

function parseHopLine(line) {
  const m = line.match(/^\s*(\d+)\s+([\s\S]*)$/);
  if (!m) return null;
  const rest = m[2];
  if (!/\d|ms/i.test(rest)) return null;
  const ip = rest.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  const times = [...rest.matchAll(/(<1|\d+(?:\.\d+)?)\s*ms/gi)]
    .map(x => (x[1].toLowerCase() === '<1' ? 0.5 : parseFloat(x[1])))
    .filter(x => Number.isFinite(x));
  return {
    n: parseInt(m[1], 10),
    ip: ip ? ip[1] : null,
    times,
    ms: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    timeout: !ip,
  };
}

function traceroute(host, onHop) {
  return new Promise(resolve => {
    let child;
    try {
      child = spawn('tracert.exe', ['-d', '-h', '20', '-w', '1200', host], { windowsHide: true });
    } catch (e) {
      resolve({ ok: false, error: e.message, hops: [] });
      return;
    }
    const hops = [];
    let buffer = '';
    let lastN = 0;
    let done = false;
    const finish = code => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: code === 0 || hops.length > 0, hops, host });
    };
    const timer = setTimeout(() => { try { child.kill(); } catch (e) { /* noop */ } finish(-1); }, 60000);
    child.stdout.on('data', d => {
      buffer += d.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        const hop = parseHopLine(line);
        if (hop && hop.n > lastN) {
          lastN = hop.n;
          hops.push(hop);
          if (onHop) onHop(hop);
        }
      }
    });
    child.stderr.on('data', () => { /* drain */ });
    child.on('error', err => finish(-1));
    child.on('close', code => finish(code));
  });
}

/* ----------------------------------------------------------- http client */

function httpRequest({ method = 'GET', url, headers = {}, body = null, timeoutMs = 12000, followRedirects = true }) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    let target = url;
    const run = () => {
      const start = Date.now();
      let ttfb = null;
      let bytes = 0;
      const req = _mod(target).request(target, {
        method,
        headers: { 'User-Agent': 'SE-MENU/1.0', Accept: '*/*', ...headers },
        timeout: timeoutMs,
      }, res => {
        res.on('data', c => {
          if (ttfb === null) ttfb = Date.now() - start;
          bytes += c.length;
        });
        res.on('end', () => {
          const timeMs = Date.now() - start;
          if (followRedirects && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
            redirects++;
            target = new URL(res.headers.location, target).toString();
            return run();
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 400,
            status: res.statusCode,
            statusText: res.statusMessage,
            timeMs,
            ttfbMs: ttfb,
            size: bytes,
            headers: res.headers,
            redirects,
            url: target,
          });
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('request timeout')));
      if (body) req.write(body);
      req.end();
    };
    run();
  });
}

async function externalIP(url = 'https://api.ipify.org?format=json') {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'SE-MENU/1.0' } });
    const text = (await res.text()).trim();
    let ip = text;
    try { ip = JSON.parse(text).ip || text; } catch (e) { /* plain text */ }
    return { ok: true, ip, timeMs: Date.now() - start, url };
  } catch (e) {
    return { ok: false, error: e.message, timeMs: Date.now() - start, url };
  }
}

/* ------------------------------------------------------------- interfaces */

function interfaces() {
  const ni = os.networkInterfaces();
  const list = [];
  for (const [name, addrs] of Object.entries(ni)) {
    if (!Array.isArray(addrs)) continue;
    for (const a of addrs) {
      list.push({
        name,
        family: a.family === 4 || a.family === 'IPv4' ? 'IPv4' : 'IPv6',
        address: a.address,
        netmask: a.netmask,
        mac: a.mac,
        internal: a.internal,
        cidr: a.cidr || '',
      });
    }
  }
  return list;
}

module.exports = {
  ping,
  downloadTest,
  uploadTest,
  dnsLookup,
  traceroute,
  httpRequest,
  externalIP,
  interfaces,
};
