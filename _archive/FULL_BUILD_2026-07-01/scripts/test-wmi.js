// Development probe: runs the exact PowerShell snapshot the app uses.
const { execFile } = require('child_process');
const { PS_ARGS, WMI_SCRIPT } = require('../src/main/system');

console.log('script length:', WMI_SCRIPT.length);
execFile('powershell.exe', PS_ARGS, { timeout: 20000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
  if (err) console.log('ERROR:', err.message, err.code);
  const out = String(stdout || '').trim();
  console.log('stdout (first 500):', out.slice(0, 500));
  console.log('stderr:', String(stderr || '').slice(0, 500));
  try {
    const parsed = JSON.parse(out);
    console.log('parsed ok — disks:', parsed.disks.length, 'gpus:', parsed.gpus.length, 'manufacturer:', parsed.manufacturer);
  } catch (e) {
    console.log('JSON parse failed:', e.message);
  }
});
