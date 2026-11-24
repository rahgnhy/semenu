@echo off
setlocal EnableExtensions
title opencode-infinity
REM ============================================================
REM  OpenCode launcher  (v2.60.19)
REM  Multi-egress (WARP / TOR / free HTTP) + dependency bootstrap
REM  + auto-resume.
REM  v2.22 - v2.29: every fixed bug carries an inline "REM v2.2x:"
REM  note.
REM  v2.39: WARP never falls back to WireGuard; a failed warp-cli step stops
REM  warp_up and shows its exit code. VPN Gate removes its routes on stop, reads
REM  the OpenVPN log while it is open, checks the exit IP over IPv4 only, starts
REM  OpenCode's Node with IPv4 first, and reports DOWN when OpenCode's IPs are
REM  no longer routed. An invalid setting value names its key in the notice.
REM  v2.40: VPN Gate configs stripped of script/plugin directives and IPv6
REM  blocked; WIREGUARD service restarted behind the proxy; auth.json backups in
REM  LOCALAPPDATA, not the Desktop; bounded probe; SHA-256 check of Tor; window
REM  kept open on double click; fixes marked "REM v2.40:" / "# v2.40".
REM  v2.42: same fixes as v2.41 plus the VPNGATE message on line 657 (caret).
REM  v2.43: MENU_DEFAULT=2 continues (no token reset); saved tokens come back if auth.json vanishes;
REM  a crash relaunches on the same IP, and 3 crashes in 10 minutes stop it; the Desktop check repeats;
REM  "Detect the desktop app again" row.
REM  v2.44: the rainbow theme redraws a menu by its real rows: a line wider than the window used to leave its first row (e.g. the title "Review") behind on every redraw.
REM  v2.41: updates only from the latest GitLab release, checked against its
REM  SHA256SUMS; the file must carry the version of its tag.
REM  v2.38: Back in the folder menu; WIREGUARD and VPNGATE in the connection
REM  method picker; Settings lists open a list of values. Language cache 2.38.
REM  v2.37: egress WIREGUARD through wireproxy (a local proxy for OpenCode only, block
REM  #>>>OC_VPN_PS); chat helpers (#>>>OC_CHAT_PS): the resume never sends
REM  the same message twice, modes continue / last / custom, last messages
REM  kept in the scroll-back, text typed during a renewal goes to --prompt;
REM  free-limit loop bounded (LIMIT_*); sessions grouped by folder; recent
REM  folders; MENU_DEFAULT; MULTI_INSTANCE; Tor GeoIP paths, bridge port
REM  swap and a rotation that checks the exit IP changed; the warp-cli exit
REM  code is read before the cleanup (a del used to hide every failure);
REM  banner rows 1-2 realigned; every visible line goes through the
REM  translation table (langs\*.json, cache refreshed per version).
REM
REM  Usage:
REM    double-click                          -> folder menu
REM    drag a folder onto this file          -> opens in that folder
REM    "OpenCode Infinite.bat" "D:\work\project"
REM                                          -> opens in that folder
REM    --run [opencode args]                 -> quick start with the saved
REM                                             connection
REM    opencodeinf                           -> the menu (after setup)
REM    --verify / --renew                    -> hidden checks run by the UI
REM
REM  This script never moves, renames or deletes your chats, your
REM  history or any file of yours, except option [5] Deep reset,
REM  which asks first and archives before it deletes. The self-update
REM  in [upd] is the only other file it touches: it replaces this
REM  script with the newer repo copy, only after you say yes, and
REM  only after a backup of this script was made first.
REM
REM  Everything is user-mode. UAC is only needed if WARP
REM  has to be installed, and WARP is optional: without it the
REM  launcher still starts opencode, only rotation is skipped.
REM
REM  PROXY SCOPE: HTTP_PROXY / HTTPS_PROXY are set only for the
REM  opencode process tree (TUI + resume + probe). The rest of the
REM  system (browser, other apps) is never touched.
REM
REM  Works on Windows 10/11, x64 / arm64 / 32-bit (limited), any
REM  system language. The UI text is English only.
REM
REM  What it does
REM  - Finds opencode on the machine, asks each candidate for its
REM    version and runs the newest one. An old standalone exe sitting
REM    next to a current npm CLI is skipped instead of chosen by name,
REM    and a v1 binary pointed at a v2 database is reported in plain
REM    text instead of failing inside opencode. The menu shows the
REM    version and path actually in use.
REM
REM  - Bootstraps what is missing: WARP (silent MSI install, UAC
REM    once) and opencode (npm first, standalone build otherwise,
REM    npm with 32-bit node on x86), with curl -f and a size gate on
REM    every download.
REM
REM  - Once per start, checks opencode.ai for a newer opencode and offers
REM    to install it (v2.28): installed version from "%OC_CMD% --version",
REM    latest from the official release metadata over a direct connection
REM    (no WARP proxy), compared with :ver_gt. It asks [Y/N] first, updates
REM    through the channel the running command came from (npm @opencode/cli
REM    or the official standalone build, sha256-verified), never runs during
REM    an automatic resume, and stays silent when the network is unavailable.
REM
REM  - After the workspace is chosen, asks for the egress mode:
REM      [1] WARP   - Cloudflare WARP proxy mode (rotation supported)
REM      [2] TOR    - local Tor SOCKS through the launcher's own built-in
REM                   HTTP bridge on 127.0.0.1:8118 (process-only; no
REM                   Privoxy and nothing else to install)
REM      [3] PROXY  - free HTTP proxies from the ProxyScrape list
REM                   (process-only; dead ones are skipped)
REM      [4] NONE   - direct, no proxy
REM
REM  - TOR with nothing installed: [2] sets itself up. The portable
REM    Tor Expert Bundle (a tar.gz: no installer, no UAC, no service)
REM    is downloaded once into the launcher state folder, started
REM    hidden, and exposed as an HTTP proxy through a tiny built-in
REM    bridge process, so no Privoxy install is needed. A Tor already
REM    running (Tor Browser on 9150 or a user tor on 9050) is used as it
REM    is and never killed by this launcher. All of it is removed from
REM    memory again on exit, files stay portable.
REM
REM  - In TOR mode a burned circuit is renewed by restarting the Tor the
REM    launcher started, with a bounded attempt counter before the menu
REM    takes over. In PROXY mode a retry picks another free proxy. NONE
REM    returns to the menu.
REM
REM  - Rotates the WARP egress IP through the local proxy: drops the
REM    old registration, creates a new one, verifies the trace says
REM    warp=on (v2.22: or warp=plus, the WARP+ answer), and starts the
REM    tunnel in proxy mode. Every warp-cli
REM    call is time-bounded and logged to wcli.log, with the daemon's
REM    own error text on every failure, so a wedge is readable instead
REM    of a private salt of exit codes. A missing WARP registration is
REM    detected and recreated before any tunnel call, and the tunnel
REM    does not fall back to WireGuard (it is its own egress choice).
REM
REM  - Verifies the route, not just the tunnel: IP fetches ignore
REM    stale HTTP_PROXY/HTTPS_PROXY, and optionally each candidate IP
REM    gets one cheap probe message on a throwaway session so burned
REM    IPs are skipped. The probe runs standalone (its own server born
REM    with the NEW proxy env): a plain run would be answered by the
REM    shared background service, which still holds the old tunnel's
REM    sockets, and then every brand-new IP probes as burned. Only
REM    limit-shaped answers mark an IP burned; any other probe failure
REM    stops the hunt and is printed, because rotation cannot fix a
REM    broken probe. IP_FIND_MAX=0 keeps hunting until one works.
REM
REM  - TOR mode is fully self-contained. The details that are easy to get
REM    wrong: the spawn is verified live two seconds in, so a tor that
REM    refuses its config fails loudly with its own reason instead of
REM    leaving a dead pid behind; the torrc carries the Windows paths as
REM    forward slashes because tor treats a backslash inside double quotes
REM    as an escape sequence; the bridge serves every connection in its own
REM    PowerShell runspace (worker threads cannot run PowerShell functions),
REM    so parallel HTTP traffic is served correctly. Bugs there read as a
REM    hang at the TOR readiness prompt, which is why each piece fails
REM    loudly with a printed reason.
REM
REM  - Watches the log while opencode runs. A fatal line (drain
REM    failure, usage limit, quota, credits) kills the TUI; a rate limit (ask= line) never kills it, the launcher asks after it closes
REM    and starts the egress retry; recoverable errors are ignored, so
REM    it only fires when the chat is actually stuck.
REM
REM  - Resumes the chat on the new IP. The resume runs as a bounded
REM    child process with stdout and stderr captured, under a private
REM    server born with the current proxy env. On OpenCode v2 that is
REM    --standalone; v1 has no shared service and no such flag, so the
REM    launcher probes the CLI help and drops the flag there. If it
REM    does not answer within RESUME_TIMEOUT the whole tree is killed
REM    and the launcher rotates instead of freezing on "sending
REM    continue". On failure the last lines of resume.err are printed.

REM  - Restarts the background opencode service after every rotation
REM    (v2 only), so the next TUI never inherits sockets from the old
REM    tunnel. v1 starts a fresh server per process, so there is
REM    nothing to restart.
REM
REM  - Locking and housekeeping: a second instance is locked out,
REM    temp files are unique, settings are validated numeric, every
REM    PowerShell call uses %PSX% with TLS 1.2 forced, and every path
REM    reaches PowerShell through the environment.
REM
REM  - Deep reset archives across volumes with copy-verify-delete
REM    before removing anything.
REM
REM  - Self-update [upd]: once per start the launcher checks the GitLab
REM    repo for a newer copy of itself. Silent when equal or offline;
REM    when a new version is found it asks, backs this script up, and
REM    swaps the new one in through a helper on a post-exit window.
REM
REM  All tunables live in the settings block below: rotation tries,
REM  probe on/off and its model, resume message and timeout, WARP
REM  timings, log watching, the proxy port, the Tor bridge port, the
REM  ProxyScrape URL, and the self-update.
REM ============================================================

REM v3.6: --help prints the commands and exits. It runs first, so it needs no setup.
if /i "%~1"=="--help" goto :help_mode
if /i "%~1"=="-h" goto :help_mode

REM - settings (edit freely)
REM Rotation attempts for infrastructure problems (tunnel not up).
set "ROTATE_TRIES_MAX=4"
REM How many IPs the probe may reject as burned before giving up.
REM 0 = keep hunting until one works (Ctrl+C stops the launcher).
set "IP_FIND_MAX=0"
REM Seconds to wait after (re)connecting WARP.
set "WARP_WAIT=6"
REM v2.60 (N88): deadline of the trace after a connect; 45 s covers a cold MASQUE start.
set "TUNNEL_WAIT=45"
REM Seconds to WAIT between rotate attempts. Cloudflare throttles rapid
REM "registration new" bursts (429 Too Many Requests); spacing them out
REM keeps the attempts accepted, which is why a fast burst can end in
REM errors while the same rotation spaced over seconds works.
set "ROTATE_COOLDOWN=10"
REM Automatic rotation hunt (see :auto_rotate). AUTO_ROTATE=0 leaves it to the menu.
set "AUTO_ROTATE=1"
REM Target of the hunt: a country code and/or an IP prefix. Both empty = any new IP.
set "TARGET_COUNTRY="
set "TARGET_PREFIX="
REM v2.40: one attempt ended the hunt on the first infrastructure miss. v3.4: default is 20 attempts.
set "TARGET_TRIES=20"
set "TARGET_MINUTES=15"
set "TARGET_INTERVAL=15"
REM v2.54: the IP pool (see :pool_start). POOL_ENABLE=0 turns the background search off.
set "POOL_ENABLE=1"
set "POOL_MAX=5"
set "POOL_INTERVAL=60"
REM Seconds a single warp-cli call may take before it is killed.
set "WARP_CALL_TIMEOUT=15"
REM Seconds a single "where" lookup may take before it is killed. A PATH
REM entry on a dead mapped drive or an offline UNC share makes where.exe
REM block for minutes, and it does it before a single line is printed.
set "WHERE_TIMEOUT=5"
REM 1 = watch the log while opencode runs, rotate on any fatal error. Off by default since 2.60.3.
set "WATCH=0"
REM Message sent automatically so the chat continues where it stopped.
set "RESUME_MSG=continue"
REM 1 = the automatic resume runs unattended (auto-approves tool
REM permissions). 0 = the resume may stop and wait for permission.
set "RESUME_AUTO=1"
REM Seconds the resume message may run before it is killed and treated
REM as a dead exit IP. This is the hard stop that keeps the launcher
REM from sitting on "sending continue" forever.
set "RESUME_TIMEOUT=600"
REM v3.5: the resume is killed only after RESUME_IDLE seconds with no new output (a long turn keeps printing).
set "RESUME_IDLE=60"
REM Model used by the IP probe: one cheap message per candidate IP. It must be the
REM model the chat uses (OC_MODEL overrides it when set): a probe on another model
REM passes while the chat's free model is out of quota, and every "continue" then
REM goes to a dead IP.
REM An empty PROBE_MODEL means the chat model too.
set "PROBE_MODEL="
REM PROBE=0 skips the probe entirely (IPs are accepted without testing). Default 0 since after v2.60.1.
REM Off by default (after v2.60.1): each probe uses the free quota and leaves an ocinf-probe session,
REM so it made the next chat hit the limit. Turn it on in Settings > Probe if you want burned IPs skipped first.
set "PROBE=0"
REM How many probe failures that are NOT a limit error are tolerated
REM before the hunt stops and asks. Catches a retired PROBE_MODEL id or
REM an auth problem: a broken probe that would otherwise read every
REM fresh IP as burned and rotate forever.
set "PROBE_BROKEN_MAX=3"
REM v2.37: WIREGUARD runs the .conf files of WG_DIR through wireproxy, a local proxy that only OpenCode uses (empty = STATE_DIR\wireguard).
set "WG_DIR="
REM Seconds a tunnel gets to show a new exit IP before the next one is tried.
set "VPN_TIMEOUT=45"
REM v2.38: VPN Gate (OpenVPN): two-letter country (empty = any) and how many servers are tried per start.
set "VPNGATE_COUNTRY="
set "VPNGATE_MAX=8"
REM v2.36: what the automatic resume sends: continue (RESUME_MSG), last (your last message again) or custom (RESUME_TEXT).
set "RESUME_MODE=continue"
set "RESUME_TEXT="
REM v2.36: when the free limit keeps coming back: rotate (new IP, the default), provider (switch to LIMIT_MODEL) or ask.
set "LIMIT_ACTION=rotate"
set "LIMIT_MODEL="
set "LIMIT_ROT_MAX=3"
REM v2.54: 1 = after a quota stop the chat is resumed by a later start, only with a new exit IP and a fresh probe.
set "QUOTA_RESUME=1"
REM v2.54: a saved chat older than this many hours is dropped, not resumed.
set "AR_MAX_HOURS=24"
REM v2.36: model of the automatic resume (provider/model). Empty = the one OpenCode already uses.
set "OC_MODEL="
REM v2.36: ask shows the OpenCode menu; 1, 2 or 3 runs that option at once (new IP / clear tokens / change IP).
set "MENU_DEFAULT=ask"
REM v2.36: 1 = a second launcher window runs on its own copy of the settings instead of stopping.
set "MULTI_INSTANCE=0"
REM v2.36: 1 = a fresh start continues the newest chat of the folder while it is still empty.
set "REUSE_EMPTY=1"
REM v2.36: 1 = after opencode closes, the last messages of the chat are printed so they stay in the scroll-back.
set "CHAT_SNAPSHOT=1"
REM v2.36: 1 = keys typed while the IP is renewed are put in the prompt when opencode opens again.
set "TYPE_AHEAD=1"
REM 1 = every start checks the GitHub repo for a newer launcher,
REM offers to replace this script (backup first, ask first).
REM 0 = never touches the network for the launcher itself.
REM v2.16: default OFF while the repo copy is older than this file.
REM v3.1: ON again. Without it the opencode command and the shortcut kept running the
REM copy saved at setup, so a newer download was never used. Asks before it replaces.
REM The complete [upd] block is unchanged; set this to 1 to re-enable it.
set "UPDATE_CHECK=1"
REM v2.29: the activity log. Every part of the launcher appends to launcher.log
REM (see :log); the UI can bundle it into a support report with personal data
REM removed. LOG_MAX_KB bounds the file; LOG_MASK_IP is read by the report.
set "LOG_ENABLED=1"
set "LOG_MAX_KB=1024"
set "LOG_MASK_IP=1"
REM v2.30: what happens when opencode closes: ask (R/M/Q, default) or quit (see Settings).
set "ON_CLOSE=ask"
REM v3.1: the three letters of the closed-opencode prompt (Settings, Shortcuts).
set "KEY_ROTATE=R"
set "KEY_MENU=M"
set "KEY_QUIT=Q"

REM --- multi-egress tunables ---
REM TOR SOCKS port (default Tor Browser / tor service). Informational:
REM the launcher talks to the HTTP bridge, never to this port directly.
set "TOR_SOCKS_PORT=9050"
REM v2.24: this is the launcher's OWN built-in HTTP->SOCKS bridge, not
REM Privoxy. Required because OpenCode/Bun does not speak SOCKS5 natively;
REM only HTTP_PROXY works.
set "TOR_HTTP_PORT=8118"
REM [2] TOR auto-setup (v2.18): when nothing answers on the TOR ports,
REM download the portable Tor Expert Bundle once, run it hidden, and
REM expose it through the built-in bridge on TOR_HTTP_PORT. 0 = never
REM download; the launcher then behaves like older versions.
set "TOR_AUTO_INSTALL=1"
REM Seconds to wait for Tor to finish bootstrapping. The first run is
REM slower; later runs usually need a fraction of this.
set "TOR_BOOTSTRAP_WAIT=120"
REM v2.28: The proxy list. A URL (http, https, ftp, file:///) or a local path,
REM in ANY format: plain text, CSV, JSON, NDJSON, XML or HTML; sorted or not;
REM "ip:port", "scheme://user:pass@host:port", or ip and port in separate
REM fields/columns. Every proxy found is used; SOCKS entries are skipped
REM (OpenCode cannot use them) and lines starting with # or ; are comments.
REM Local example: set "PROXY_LIST_URL=D:\lists\my proxies.json"
REM Percent signs in a URL must be doubled (%%) inside this file.
set "PROXY_LIST_URL=https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&protocol=http&proxy_format=protocolipport&format=text"
REM Minimum bytes the downloaded list must have before the launcher
REM trusts it (a tiny error page is not a list). v2.21: configurable,
REM so a short custom list can pass the gate; 0 turns the gate off and
REM accepts any downloaded file.
set "PROXY_LIST_MIN_BYTES=20"
REM How many free proxies to try before giving up (per rotate).
set "PROXY_TRY_MAX=40"
REM Seconds a single free-proxy probe may take.
set "PROXY_PROBE_TIMEOUT=8"
REM NEW: how many burned proxies in a row before PROXY mode gives up and
REM offers Tor. Every proxy that hits the limit is remembered and skipped.
set "PROXY_ROT_MAX=10"
REM v2.22: a free proxy must also reach the host opencode's API talks to,
REM not only the Cloudflare trace, or the TUI dies on its first request.
REM v2.23: OFF by default. PROXY_API_CHECK_URL was never verified, and a
REM host that does not resolve rejects every proxy and kills PROXY mode.
REM Set it to 1 only after checking the URL by hand.
set "PROXY_API_CHECK=0"
set "PROXY_API_CHECK_URL=https://api.opencode.ai/"
REM v3.8: one proxy typed in Settings (host:port or http://host:port). Empty = use the list.
set "PROXY_FIXED="
REM v2.28: official release metadata (version, url, sha256 for every file).
REM GitHub "releases/latest", the npm package opencode-ai and winget SST.opencode
REM are all frozen on the old v1 line (1.19.5) - the current v2 is published here
REM and as the npm package @opencode/cli. 32-bit Windows has no v2 build.
set "OC_API_BASE=https://opencode.ai/update/api/latest"

REM - internal
REM Local port where the WARP proxy listens (WARP proxy mode).
set "PROXY_PORT=40000"
REM HTTP and SOCKS5 forms of the same local proxy, used by curl.
set "PROXY=http://127.0.0.1:%PROXY_PORT%"
set "SOCKS_PROXY=socks5h://127.0.0.1:%PROXY_PORT%"
REM Endpoint that returns ip= and warp= lines, used to check the IP.
set "TRACE_URL=https://www.cloudflare.com/cdn-cgi/trace"
REM Official download address for the WARP installer (64-bit MSI).
set "WARP_MSI_URL=https://downloads.cloudflareclient.com/v1/download/windows/ga"
REM Self-update source. In this file a literal % is written %% , so the
REM the URL in :self_update ends in the real "...%20Infinite.bat" form the repo uses.
REM Hosts that must never go through the proxy.
REM v2.40: NO_PROXY and no_proxy are the same variable on Windows, so the launcher list has its own name (it used to overwrite the user's own value before OC_NP0 saved it).
set "OC_NOPROXY_LIST=localhost,127.0.0.1,0.0.0.0,::1,[::1]"
REM Default PowerShell command; replaced below by the full path if it exists.
set "PSX=powershell"
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" set "PSX=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
REM This file's own path: the folder picker reads its embedded PowerShell
REM block from here, so the picker never needs a helper file on disk.
set "OCI_SELF=%~f0"
REM EGRESS mode: WARP | TOR | PROXY | NONE (set by the menu after the folder)
set "EGRESS=WARP"
REM ACTIVE_PROXY holds the exact URL handed to opencode (process-only).
set "ACTIVE_PROXY="
REM TOR portable setup runtime state (v2.18). TOR_DIR keeps the portable
REM Tor bundle and is the stop-identity root: at exit (v2.20) only tor
REM processes whose image path lives inside TOR_DIR, plus bridge
REM processes carrying the OC_TORBRIDGE_PS marker, are ever stopped -
REM so a Tor or a bridge already running before the launcher is never
REM touched and never killed. OURTOR / OURBRIDGE mean "the launcher
REM started it this session".
set "TOR_DIR=%LOCALAPPDATA%\opencode-infinite\tor"
set "TOR_EXE="
set "OURTOR="
set "OURBRIDGE="

REM v2.22: remember the user's own proxy variables before anything touches
REM them. They may be set system-wide; every cleanup used to delete them.
set "OC_HP0=%HTTP_PROXY%"
set "OC_SP0=%HTTPS_PROXY%"
set "OC_NP0=%no_proxy%"

REM UTF-8 console: folder paths in any system language survive the
REM write/read round trip in lastfolder.txt
REM Note: chcp 65001 changes the code page of the whole console window
REM for as long as this launcher runs, not only for this script.
REM v2.22: the original code page is saved here and restored in :quit.
set "OC_OLDCP="
for /f "tokens=2 delims=:" %%c in ('chcp') do set "OC_OLDCP=%%c"
set "OC_OLDCP=%OC_OLDCP: =%"
REM v3.1 (N20): some locales end the message with a dot ("Aktive Codepage: 850."), so only
REM the digits are kept and the value is checked before it is used or written to the flag.
for /f "delims=0123456789" %%c in ("%OC_OLDCP%") do set "OC_OLDCP="
if defined OC_OLDCP if %OC_OLDCP% LSS 1 set "OC_OLDCP="
if defined OC_OLDCP if %OC_OLDCP% GTR 65535 set "OC_OLDCP="
chcp 65001 >nul 2>&1

REM Where opencode keeps its data (chats, database, auth).
set "DATA_DIR=%USERPROFILE%\.local\share\opencode"
REM Log file the watcher and the quota check read. Falls back to the
REM LOCALAPPDATA location if the first one does not exist.
set "LOGFILE=%DATA_DIR%\log\opencode.log"
if not exist "%LOGFILE%" if exist "%LOCALAPPDATA%\opencode\log\opencode.log" set "LOGFILE=%LOCALAPPDATA%\opencode\log\opencode.log"
REM Folder for the launcher own state files (last folder, last IP, logs, locks).
REM v2.30: own state folder, named after the launcher and not after OpenCode.
set "STATE_DIR=%LOCALAPPDATA%\opencode-infinite"
REM v2.54: the chat saved after a quota stop (see :ar_mark). Only this file, never tokens.
set "ARF=%STATE_DIR%\pending_resume.txt"
set "T_2=  OpenCode - how do you want to run it?"
set "T_3=  [1] CLI      - terminal TUI ^(chat resumes on every new IP^)"
set "T_4=  [2] Desktop  - the OpenCode desktop app ^(restarted on every new IP^)"
set "T_5=  [3] Exit"
set "T_6=  One key, no Enter."
set "T_7=%%C_WARN%%  [*] OpenCode desktop not found.%%C_RST%%"
set "T_8=%%C_WARN%%  [*] still not found - set OC_APP to its OpenCode.exe.%%C_RST%%"
set "T_9=  [app] DESKTOP "%%OC_DESKTOP%%""
set "T_10=  OpenCode - choose a folder to work in"
set "T_11=  [1] Reopen the last folder"
set "T_12=      ^(nothing saved yet^)"
set "T_13=  [2] Use this folder"
set "T_14=  [3] Browse for a folder..."
set "T_15=  [4] Exit"
set "T_16=  No folder saved yet. Use [2] or [3] this time."
set "T_17=  Choose a folder in the dialog..."
set "T_18=  Opening the classic folder picker..."
set "T_19=  No folder selected."
set "T_20=  Folder not found: "%%OPFOLDER%%""
set "T_21=  Cannot enter: "%%OPFOLDER%%""
set "T_22=  Working in: "%%CD%%""
set "T_23=  [egress] %%EGRESS%% ^(from your settings^)"
set "T_24=  Choose egress for OpenCode only (system traffic stays direct)"
set "T_25=  [1] WARP     - Cloudflare WARP proxy mode (rotation supported)"
set "T_26=  [2] TOR      - local Tor + built-in bridge on :%%TOR_HTTP_PORT%%"
set "T_27=                 (auto-installs a portable Tor, nothing to set up)"
set "T_28=  [3] PROXY    - free HTTP proxies (ProxyScrape list)"
set "T_29=  [4] NONE     - direct, no proxy"
set "T_30=  [egress] NONE - direct."
set "T_31=  [egress] PROXY - free HTTP list."
set "T_32=  [egress] TOR - portable Tor + built-in bridge on :%%TOR_HTTP_PORT%%, auto-setup."
set "T_33=  [egress] WARP."
set "T_34=  [dep] curl"
set "T_35=  [dep] warp"
set "T_36=%%C_WARN%%  [*] Cloudflare WARP not found - IP rotation will be disabled.%%C_RST%%"
set "T_37=      Install it later from 1.1.1.1 if you want the rotation."
set "T_38=%%C_WARN%%  [*] WARP still not available - continuing without rotation.%%C_RST%%"
set "T_39=      warp-cli errors, if any, are in %%STATE_DIR%%\wcli.log"
set "T_40=%%C_WARN%%  [*] Cloudflare WARP publishes 64-bit Windows builds only.%%C_RST%%"
set "T_41=      On this 32-bit system rotation is disabled."
set "T_42=%%C_OK%%  [ok] WARP ready.%%C_RST%%"
set "T_43=  [dep] opencode"
set "T_44=  [auto-install] opencode not found, fetching it..."
set "T_45=%%C_OK%%  [ok] opencode ready.%%C_RST%%"
set "T_46=%%C_ERR%%  ERROR: opencode install failed or is not on PATH.%%C_RST%%"
set "T_47=  Get it by hand: https://github.com/sst/opencode/releases"
set "T_48=  Preparing the connection..."
set "T_49=  OpenCode"
set "T_50=  Folder : "%%CD%%""
set "T_51=  Egress : %%EGRESS%%"
set "T_52=  Mode   : %%APP_MODE%%"
set "T_53=  WARP   : not found ^(warp-cli.exe missing^) - rotation disabled"
set "T_54=  WARP   : "%%WARP%%""
set "T_55=  Version: %%OC_VER%%  "%%OC_CMD%%""
set "T_56=  Exit IP: %%IP%%"
set "T_57=  What do you want to do?"
set "T_58=  [1] Fresh start   - get a new IP / proxy, then open OpenCode"
set "T_59=                      (your chats and history stay untouched)"
set "T_60=  [2] Continue      - same egress, open OpenCode as it was"
set "T_61=  [3] Change IP     - rotate / pick new proxy only"
set "T_62=  [5] Deep reset    - kill opencode, move chats to the Desktop,"
set "T_63=                      clear saved tokens, open a fresh session"
set "T_64=  [6] Exit"
set "T_65=  [7] Token reset   - kill opencode, clear saved tokens, keep chats"
set "T_66=                      where they are, open a fresh session"
set "T_67=  [8] Settings      - change any launcher setting, applied right away"
set "T_265=  [9] Sessions      - continue a chat from this folder"
set "T_68=--- deep reset -----------------------------------------------"
set "T_69=  This closes opencode, moves your chats to the Desktop,"
set "T_70=  clears the saved tokens and opens a brand new session."
set "T_71=  Your chats move to the Desktop. Restore chats and token reset also change your files."
set "T_72=  Only the opencode this launcher started is closed; windows opened"
set "T_73=  by hand keep running (close them first if files are busy)."
set "T_74=--- token reset ----------------------------------------------"
set "T_75=  This closes opencode, clears the saved tokens and opens a"
set "T_76=  brand new session. Your chats are NOT moved."
set "T_77=  auth.json is copied to a private backup folder first, then removed."
set "T_78=    egress: %%EGRESS%%"
set "T_79=%%C_WARN%%  [*] WARP is not usable - OpenCode was not started.%%C_RST%%"
set "T_80=      Going direct would run OpenCode on your real IP. --allow-direct is needed for that."
set "T_81=%%C_WARN%%  [*] Tor did not get ready.%%C_RST%%"
set "T_82=%%C_WARN%%  [*] no working free proxy found.%%C_RST%%"
set "T_83=%%C_WARN%%  [*] the egress proxy stopped answering while OpenCode was open:%%C_RST%%"
set "T_84=      %%STATE_DIR%%\proxy_warn.txt"
set "T_85=%%C_WARN%%  [watch] a fatal error cut the chat - rotating and resuming it.%%C_RST%%"
set "T_86=OpenCode closed."
set "T_87=  %%KEY_ROTATE%% = new IP and resume the chat   %%KEY_MENU%% = menu   %%KEY_QUIT%% = quit (Ctrl+C also quits)"
set "T_88=Press any key to continue . . ."
set "T_89=  [tor] renewing the circuit, attempt %%TOR_TRIES%% of %%ROTATE_TRIES_MAX%%..."
set "T_90=%%C_OK%%  [tor] new circuit - resuming.%%C_RST%%"
set "T_91=%%C_WARN%%  [*] Tor could not be renewed - back to menu.%%C_RST%%"
set "T_92=%%C_WARN%%  [*] Tor could not get a usable circuit after %%ROTATE_TRIES_MAX%% attempts.%%C_RST%%"
set "T_93=      The exit node may be blocked: try a new identity in Tor, or"
set "T_94=      switch to [1] WARP. warp/tor notes: "%%TOR_DIR%%\tor.log""
set "T_95=  [proxy] %%ACTIVE_PROXY%% is burned - attempt %%PROXY_ROT%% of %%PROXY_ROT_MAX%%, picking another..."
set "T_96=  [proxy] picking a fresh free proxy before resume..."
set "T_97=%%C_WARN%%  [*] no free proxy is left that still works ^(they all hit the limit^).%%C_RST%%"
set "T_98=      Free proxies are shared by many people, so their limit is often used up."
set "T_99=  Automatic rotation is off - the menu decides."
set "T_100=Getting a new IP before the next attempt..."
set "T_101=  [i] hunting for %%HUNT_GOAL%%: up to %%TARGET_TRIES%% attempts, %%TARGET_MINUTES%% min. Esc or Q stops."
set "T_102=[%%ROTATE_TRIES%%/%%TARGET_TRIES%%] dropping the old registration..."
set "T_103=[%%ROTATE_TRIES%%/%%TARGET_TRIES%%] new registration..."
set "T_104=[%%ROTATE_TRIES%%] reconnect..."
set "T_105=[%%ROTATE_TRIES%%] waiting %%TARGET_INTERVAL%%s..."
set "T_106=[%%ROTATE_TRIES%%] %%IPN%% was already tried in this hunt, rotating again"
set "T_107=[%%ROTATE_TRIES%%/%%TARGET_TRIES%%] exit IP %%IPN%% ^(country %%GLOC%%^), target %%TMATCHTXT%%, %%HUNT_LEFT%% attempt(s) left"
set "T_108=[%%ROTATE_TRIES%%] probing if this IP can still talk..."
set "T_109=%%C_WARN%%  [*] probe failed for a reason that is NOT a limit - attempt %%PBROKEN%% of %%PROBE_BROKEN_MAX%%. Last output:%%C_RST%%"
set "T_110=[%%PROBE_TRIES%%] IP already burned, rotating again..."
set "T_111=%%C_WARN%%  [*] %%PROBE_TRIES%% IPs probed, every one of them already burned.%%C_RST%%"
set "T_112=%%C_WARN%%  [*] the probe failed %%PBROKEN%% times and none of them was a limit error.%%C_RST%%"
set "T_113=      The probe itself is broken, not every IP: a retired PROBE_MODEL id,"
set "T_114=      an auth error or a CLI change. Rotation cannot fix that."
set "T_115=      Check PROBE_MODEL in the settings block, or run the probe model once"
set "T_116=      by hand to see the real error."
set "T_117=  [i] probe off for this session - IPs are accepted on WARP-trace proof"
set "T_118=      only, and the resume's own limit check keeps catching burned ones."
set "T_119=%%C_WARN%%  [*] the probe session "%%OC_PROBE_ID%%" does not exist and this%%C_RST%%"
set "T_120=      opencode build refused it. That is a probe problem, NOT a"
set "T_121=      burned IP - no rotation can fix it."
set "T_122=  [i] the probe is off for this session: IPs are accepted on"
set "T_123=      WARP-trace proof only, and the resume's own limit check still"
set "T_124=      catches a burned one. To keep the probe, create the session by"
set "T_125=      hand once, or clear PROBE in the settings block."
set "T_126=%%C_OK%%[%%ROTATE_TRIES%%] IP %%IPN%% works.%%C_RST%%"
set "T_127=[%%ROTATE_TRIES%%] no verified WARP IP yet, retrying..."
set "T_128=%%C_WARN%%  [*] no usable IP from this hunt. warp-cli errors, if any, are in %%STATE_DIR%%\wcli.log%%C_RST%%"
set "T_129=  restarting the desktop app on the new egress..."
set "T_130=  sending "%%RESUME_MSG%%" so the chat picks up where it stopped..."
set "T_131=%%C_WARN%%  [*] proxy dead - retrying on the current egress instead of resuming.%%C_RST%%"
set "T_132=%%C_WARN%%  [*] no answer in %%RESUME_TIMEOUT%%s - this exit IP is dead.%%C_RST%%"
set "T_133=%%C_OK%%  chat resumed on the new IP.%%C_RST%%"
set "T_134=%%C_WARN%%  [*] the resume itself hit a limit - rotating again.%%C_RST%%"
set "T_135=  Egress is NONE - nothing to rotate."
set "T_136=  Restarting the launcher-managed Tor for a new circuit..."
set "T_137=  TOR mode - this Tor was started outside the launcher."
set "T_138=  Restart it yourself for a new circuit, or pick [1] WARP / [4] NONE."
set "T_139=  Current bridge: http://127.0.0.1:%%TOR_HTTP_PORT%%"
set "T_140=  Picking a new free HTTP proxy..."
set "T_141=  New proxy: %%ACTIVE_PROXY%%"
set "T_142=WARP is not available - nothing to rotate."
set "T_143=Requesting a new WARP registration..."
set "T_144=waiting %%WARP_WAIT%%s..."
set "T_145=%%C_WARN%%  [*] no verified WARP IP.%%C_RST%%"
set "T_146=      warp-cli errors land in %%STATE_DIR%%\wcli.log"
set "T_147=  same IP as before: %%IPN%%"
set "T_148=%%C_OK%%  New exit IP: %%IPN%% ^(WARP verified^)%%C_RST%%"
set "T_149=  --- resume stderr ---"
set "T_150=  --- resume stdout ---"
set "T_151=  downloading the WARP installer, about 60 MB..."
set "T_152=%%C_WARN%%  [*] download failed.%%C_RST%%"
set "T_153=      grab it by hand and run it: %%WARP_MSI_URL%%"
set "T_154=  installing..."
set "T_155=  [auto-install] the standalone build did not install, trying npm."
set "T_156=  [i] 32-bit Windows: no standalone build - installing via npm."
set "T_157=%%C_OK%%  [ok] opencode ready on 32-bit via npm.%%C_RST%%"
set "T_158=%%C_ERR%%  ERROR: opencode could not be installed on 32-bit Windows.%%C_RST%%"
set "T_159=         Install 32-bit node.js by hand from nodejs.org, then run:"
set "T_160=         npm i -g opencode-ai"
set "T_161=%%C_WARN%%  [*] could not read the official release info from opencode.ai.%%C_RST%%"
set "T_162=  [auto-install] downloading opencode %%OCA_VER%% ^(official build, %%OC_AFILE%%^)..."
set "T_163=%%C_WARN%%    [*] checksum mismatch - the download is not the official file.%%C_RST%%"
set "T_164=%%C_WARN%%    [*] download failed.%%C_RST%%"
set "T_165=  [auto-install] unpacking, about 200 MB on disk..."
set "T_166=  [auto-install] installing %%NPMPKG%% with npm..."
set "T_167=  [npm] the install script was blocked - running it by hand..."
set "T_168=  [auto-install] node.js (32-bit) is missing - installing it..."
set "T_169=    via winget..."
set "T_170=  [i] this can take a few minutes on its first run."
set "T_171=    winget failed - trying the MSI installer from nodejs.org..."
set "T_172=    downloading %%NODE_MSI_URL%% ..."
set "T_173=    direct download failed - retrying through the Windows proxy settings..."
set "T_174=    installing..."
set "T_175=  opencode update available: %%OCUPD_CUR%% -^> %%OCUPD_LAT%%"
set "T_176=  It closes every running opencode process first."
set "T_177=  [update] npm i -g @opencode/cli@latest"
set "T_178=  [update] official standalone build %%OCUPD_LAT%%"
set "T_179=%%C_WARN%%  [*] "%%OC_CMD%%" reports %%OC_VER%% but this machine has a v2 database.%%C_RST%%"
set "T_180=      A v1 binary cannot open it: "Database is not empty and has no session table"."
set "T_181=      Update it:  npm i -g @opencode/cli@latest   ^(or accept the update offer^)"
set "T_182=%%C_WARN%%  [*] WARP registration missing - creating a new one.%%C_RST%%"
set "T_183=  [tor] nothing answering on :%%TOR_HTTP_PORT%% - portable setup starting..."
set "T_184=%%C_WARN%%  [*] Tor did not become ready - the reason is in "%%TOR_DIR%%\tor.log"%%C_RST%%"
set "T_185=%%C_WARN%%  [*] the Tor download did not land. Grab it by hand:%%C_RST%%"
set "T_186=      https://dist.torproject.org/torbrowser/"
set "T_187=      unpack the tor-expert-bundle tar.gz into "%%TOR_DIR%%","
set "T_188=      so that "%%TOR_DIR%%\Tor\tor.exe" exists, then run this again."
set "T_189=%%C_OK%%  [tor] ready: SOCKS :%%TOR_SOCKS_PORT%% - HTTP :%%TOR_HTTP_PORT%%.%%C_RST%%"
set "T_190=  [tor] updater JSON unavailable - falling back to the dist index..."
set "T_191=%%C_WARN%%  [*] the Tor bundle did not download.%%C_RST%%"
set "T_192=  [tor] unpacking..."
set "T_193=%%C_OK%%  [ok] Tor installed - portable - in "%%TOR_DIR%%".%%C_RST%%"
set "T_194=%%C_WARN%%  [*] the bundle unpacked but tor.exe was not found in "%%TOR_DIR%%".%%C_RST%%"
set "T_195=  [tor] a Tor is already running on :%%TOR_SOCKS_PORT%% - using it as it is."
set "T_196=  [tor] starting tor (hidden window, log: "%%OC_TORLOG%%")..."
set "T_197=%%C_WARN%%  [*] tor could not be started - see "%%OC_TORERR%%" and "%%OC_TORLOG%%".%%C_RST%%"
set "T_198=  [tor] starting the built-in HTTP-^>SOCKS bridge on :%%TOR_HTTP_PORT%% (no Privoxy needed)..."
set "T_199=  [tor] bootstrapping, up to %%TOR_BOOTSTRAP_WAIT%%s (the first run takes longer)..."
set "T_200=  [tor] Tor is up and routing through the bridge."
set "T_201=  [tor] still not up after %%TOR_BOOTSTRAP_WAIT%%s."
set "T_202=  [tor] found a Tor Browser SOCKS on :9150 - using it."
set "T_203=  [tor] found a Tor SOCKS on :9050 - using it."
set "T_204=  [*] this Tor was not started by the launcher - it cannot be renewed"
set "T_205=      from here. Restart Tor Browser yourself, or pick [1] WARP / [4] NONE."
set "T_206=  WARP proxy is not answering - cannot verify the exit IP."
set "T_207=  same IP as the last run, requesting a new registration..."
set "T_208=  [%%EN_TRIES%%] dropping the old registration..."
set "T_209=  [%%EN_TRIES%%] new registration..."
set "T_210=  [%%EN_TRIES%%] reconnecting WARP proxy..."
set "T_211=  [%%EN_TRIES%%] waiting %%WARP_WAIT%%s..."
set "T_212=  exit IP: %%CUR%%"
set "T_213=  no new IP after %%ROTATE_TRIES_MAX%% tries, launching on the current one."
set "T_214=  [note] opencode log not found: "%%LOGFILE%%""
set "T_215=         auto-detect stays off until the log appears."
set "T_216=  OpenCode desktop update available: %%DVER%% -^> %%OCA_VER%%"
set "T_217=  It closes every OpenCode process first, the app and its service included."
set "T_218=  downloading the OpenCode desktop installer %%OCA_VER%%, about 250 MB..."
set "T_219=  [*] checksum mismatch - the download is not the official file."
set "T_220=  [*] download failed."
set "T_221=      grab it by hand and run it: %%ID_URL%%"
set "T_222=      or from the website: https://opencode.ai/download"
set "T_223=  installing..."
set "T_224=  [*] could not read the official release info from opencode.ai."
set "T_225=      get the installer by hand: https://opencode.ai/download"
set "T_226=  [*] the desktop app has no 32-bit Windows build."
set "T_227=[verify] egress: %%EGRESS%%"
set "T_228=[verify] ip=%%IPN%% warp=%%WFLAG%%"
set "T_229=[verify] Cloudflare WARP is not installed ^(warp-cli not found^)."
set "T_230=[renew] egress: %%EGRESS%%"
set "T_231=[renew] new exit IP: %%IPN%%"
set "T_232=[renew] Cloudflare WARP is not installed ^(warp-cli not found^)."
set "T_233=[renew] proxy: %%ACTIVE_PROXY%%"
set "T_234=[renew] done"
set "T_235=[renew] could not get a working connection"
set "T_236=  archiving chats to:"
set "T_237=  nothing to archive."
set "T_238=  archived."
set "T_239=  [*] could not move the storage folder - it stays where it is."
set "T_240=  [*] could not copy %%1 - it stays where it is."
set "T_241=  [*] size mismatch on %%1 - the bad copy is deleted, the original stays."
set "T_242=  cache and tokens cleared."
set "T_243=  auth.json archived in "%%AUTH_BAK%%"."
set "T_244=  [*] the auth.json copy did not verify - tokens are left in place."
set "T_245=  [*] could not copy auth.json - tokens are left in place."
set "T_246=  [*] no archive folder for this reset - auth.json is left in place."
set "T_WP_FAIL=%%C_WARN%%  [warp] WARP does not answer on 127.0.0.1:%%PROXY_PORT%%. Checked: HTTP through the port with curl, and SOCKS5 with socks5h. Next: warp-cli status, then warp-cli connect.%%C_RST%%"
set "T_WB_START=  [warp] port %%PROXY_PORT%% speaks SOCKS5 only: starting the HTTP bridge on 127.0.0.1:%%PROXY_BR_PORT%% ^> SOCKS5 127.0.0.1:%%PROXY_PORT%%."
set "T_WB_FAIL=%%C_WARN%%  [warp] the HTTP bridge did not start on 127.0.0.1:%%PROXY_BR_PORT%%. Its log: %%STATE_DIR%%\warp_bridge.log%%C_RST%%"
set "T_WV_OK=%%C_OK%%  [warp] tunnel verified through %%PROXY%%: warp=%%WV_FLAG%%, exit IP %%WV_IP%%.%%C_RST%%"
set "T_WV_FAIL=%%C_WARN%%  [warp] the trace through %%PROXY%% did not report warp=on - got warp=%%WV_FLAG%% and ip=%%WV_IP%%. Checked twice. Next: warp-cli status, then restart the WARP service.%%C_RST%%"
set "T_WB_REFUSE=%%C_WARN%%  [warp] not starting OpenCode on the real IP. Start the launcher with --allow-direct to allow it.%%C_RST%%"
set "T_249=  [proxy] process-only: %%ACTIVE_PROXY%%"
set "T_250=  [proxy] reading the proxy list..."
set "T_251=  [proxy] %%PCOUNT%% proxies in the list"
set "T_252=  [*] no proxies found in "%%PSRC%%""
set "T_253=  [*] no proxy passed the API check, but %%TRACE_ONLY%% did reach Cloudflare."
set "T_254=      PROXY_API_CHECK_URL may be wrong - see the settings block."
set "T_255=  [proxy] live: %%ACTIVE_PROXY%%"
set "T_256=  [*] OpenCode-Infinite is already open in another window."
set "T_257=  Exiting."
set "T_258=  [upd] repo copy is %%SU_RV%%, older than %%SU_LV%% - keeping this one."
set "T_259=  [upd] launcher matches the repo, %%SU_LV%%."
set "T_260=  [upd] update found: local %%SU_LV%% - repo %%SU_RV%%"
set "T_261=  [upd] swapping in %%SU_RV%% - this window closes now."
set "T_262=  [upd] the swap could not be prepared - keeping %%SU_LV%%."
set "T_263=        The downloaded copy is in "%%SU_TMP%%"."
set "T_264=  Press any key to close this window."
set "T_270=  Nothing to restore in that backup."
set "T_271=  Restore the chats from:"
set "T_272=  The chats in place now are moved to the Desktop first. Nothing is deleted."
set "T_273=  [*] some storage files did not copy. The backup is untouched."
set "T_274=  Chats restored. The previous ones are in:"
set "T_275=  [5] WIREGUARD - only for opencode, one .conf file after another"
set "T_276=  [6] VPNGATE   - VPN Gate through OpenVPN, only OpenCode's hosts"
set "T_277=  [egress] WIREGUARD - proxy from the .conf files in "%%WG_DIR_SHOW%%". Only opencode uses it. No administrator prompt."
set "T_278=  [egress] VPNGATE - VPN Gate through OpenVPN. Only OpenCode's hosts use the tunnel ^(their IPs are routed^). Needs a window that is already administrator: this script never asks for it."
set "T_279=%%C_WARN%%  [vpn] OpenVPN is missing and winget could not install it. Install OpenVPN from openvpn.net, then try again.%%C_RST%%"
set "T_288=%%C_WARN%%  [vpn] the VPN Gate list could not be downloaded and there is no saved copy.%%C_RST%%"
set "T_289=%%C_WARN%%  [vpn] no VPN Gate server matches the country "%%VPNGATE_COUNTRY%%". Clear the country to use any.%%C_RST%%"
set "T_292=%%C_WARN%%  [vpn] nothing left to try: every VPN Gate server failed in this session.%%C_RST%%"
set "T_293=%%C_WARN%%  [vpn] could not resolve the OpenCode hosts (opencode.ai, models.opencode.ai, opentunnel.xyz). Check the internet connection.%%C_RST%%"
set "T_280=[vpn] trying {0} ..."
set "T_281=[vpn] {0} left the same exit IP, next one."
set "T_282=[vpn] {0} gave no answer in {1}s, next one."
set "T_283=  [vpn] changing the %%EGRESS%% tunnel..."
set "T_284=%%C_OK%%  [vpn] tunnel "%%VPN_NAME%%" is up. Exit IP %%VPN_IP%% ^(country %%VPN_LOC%%^).%%C_RST%%"
set "T_285=%%C_WARN%%  [vpn] wireproxy is missing and could not be downloaded and verified. Log: %%STATE_DIR%%\vpn.log%%C_RST%%"
set "T_286=%%C_WARN%%  [vpn] there are no .conf files in "%%VPN_DIR%%". Copy your WireGuard configs there.%%C_RST%%"
set "T_287=%%C_WARN%%  [vpn] VPN Gate was not started: this window is not administrator, and this script never asks for it. Nothing was changed.%%C_RST%%"
set "T_290=%%C_WARN%%  [vpn] no tunnel gave a new IP ^(%%VPN_TRIED%% tried^). Log: %%STATE_DIR%%\vpn.log%%C_RST%%"
set "T_291=%%C_WARN%%  [vpn] nothing left to try: every .conf failed in this session.%%C_RST%%"
set "T_294=  [vpn] changing tunnel, attempt %%VPN_TRIES%% of %%ROTATE_TRIES_MAX%%..."
set "T_295=%%C_WARN%%  [vpn] no tunnel gave a usable IP.%%C_RST%%"
set "T_296=  [i] attempts: %%ROTATE_TRIES%%, burned IPs: %%PROBE_TRIES%%, last IP: %%IPN%%"
set "T_297=  [%%KEY_ROTATE%%] try again   [E] change egress   [%%KEY_MENU%%] menu"
set "T_298=  [menu] running option %%MENU_DEFAULT%% from your settings ^(Settings, Connection^)."
set "T_299=  [resume] "%%OC_MSG_SHOW%%" is already waiting in the chat, not sending it twice."
set "T_300=%%C_WARN%%  [limit] the free limit came back %%QUOTA_STREAK%% times in a row.%%C_RST%%"
set "T_301=  [limit] switching to the fallback model %%OC_MODEL%%."
set "T_302=  --- last messages of the chat, kept here so you can scroll and copy ---"
set "T_303=  [i] You can type your next message now: it waits in the prompt until OpenCode opens again."
set "T_304=  [i] What you typed is in the prompt."
set "T_305=  Could not bring it to the front. Switch to that window yourself."
set "T_306=  Brought the open window to the front."
set "T_307=  sending "%%OC_MSG_SHOW%%" so the chat picks up where it stopped..."
set "T_308=%%C_WARN%%  [limit] the fallback model did not help either. Stopping here.%%C_RST%%"
set "T_309=  [window] another window is open: this one works on its own copy of the settings."
set "T_310=  [tor] the new circuit left the same exit IP, renewing it again..."
set "T_311=  [tor] exit IP: %%TOR_IP%%"
set "T_312=  [tor] port %%TOP_OLD%% is used by another program, the bridge uses port %%TOR_HTTP_PORT%% instead."
set "T_313=%%C_WARN%%  [warp] no registration could be created. Open a terminal as administrator and run: warp-cli registration delete, then warp-cli registration new, then warp-cli connect. If it keeps failing, restart the Cloudflare WARP service.%%C_RST%%"
set "T_314=  [warp] the connection failed and the registration is missing or stale, creating a new one..."
set "T_315=       ^(not found - [2] offers to install it^)"
set "T_316=  [4] Folder        - work in a different folder"
set "T_317=  [4] Mode          - switch between CLI and Desktop"
set "T_318=  reopening the last session on the same chat..."
set "T_319=%%C_WARN%%OpenCode exited with code %%EC%%.%%C_RST%%"
set "T_320=%%C_WARN%%Free quota reached on this egress.%%C_RST%%"
set "T_321=Reopening on a new egress."
set "T_322=%%C_WARN%%Fatal error caught by the watcher - switching egress.%%C_RST%%"
REM v3.4: --auto prints only "Changing IP..." (translated). The reason stays in launcher.log.
set "T_CHGIP=Changing IP..."
set "T_GEO=%%C_WARN%%  [*] this model is not available from this IP's country - changing IP.%%C_RST%%"
set "T_323=[%%ROTATE_TRIES%%] the daemon refused a new registration - see wcli.log"
set "T_324=%%C_OK%%  [OK] target reached: %%HUNT_GOAL%%, IP %%IPN%%, attempt %%ROTATE_TRIES%% of %%TARGET_TRIES%%, %%HUNT_EL%% s.%%C_RST%%"
set "T_325=%%C_WARN%%  [!] attempt limit reached: %%TARGET_TRIES%% attempts, no match for %%HUNT_GOAL%%. Last IP %%IPN%%.%%C_RST%%"
set "T_326=%%C_WARN%%  [!] time limit reached: %%TARGET_MINUTES%% min, %%ROTATE_TRIES%% attempts, no match for %%HUNT_GOAL%%.%%C_RST%%"
set "T_327=%%C_WARN%%  [!] stopped: every probed IP was burned ^(IP_FIND_MAX^).%%C_RST%%"
set "T_328=  [i] stopped by you after %%ROTATE_TRIES%% attempts, %%HUNT_EL%% s. Last IP %%IPN%%."
set "T_329=%%C_WARN%%  [!] the new circuit did not come up - see "%%TOR_DIR%%\tor.log".%%C_RST%%"
set "T_330=  New circuit: Tor is serving on :%%TOR_HTTP_PORT%% again."
set "T_331=%%C_WARN%%  [!] the WARP daemon refused a new registration - see "%%STATE_DIR%%\wcli.log"%%C_RST%%"
set "T_332=      the trace answered but warp=off - the tunnel is not up."
set "T_333=      no trace answer - the proxy on port %%PROXY_PORT%% is down."
set "T_334=  [wcli] "%%WCMD%%" failed - see wcli.log"
set "T_335=%%C_WARN%%  [!] node.js is still not available - install the 32-bit build from nodejs.org.%%C_RST%%"
set "T_336=%%C_OK%%  [update] opencode now reports %%OC_VER%%%%C_RST%%"
set "T_337=  [tor] tor is already installed: %%TOR_EXE%%"
set "T_338=  [%%EN_TRIES%%] the daemon refused a new registration - see wcli.log"
set "T_339=  [update] OpenCode desktop now reports %%DVER%%"
REM v3.1 (N64): the four :yn questions were fixed English. They go through the table.
set "T_373=   Download and install the OpenCode desktop app now? [Y/N]: "
set "T_374=   Try again? [Y/N]: "
set "T_375=   Use the system folder instead? [Y/N]: "
set "T_376=   Try to download and install WARP now? [Y/N]: "
set "T_340=a new IP"
set "T_341=prefix %%TARGET_PREFIX%%"
set "T_342=country %%TARGET_COUNTRY%%"
set "T_343=country %%TARGET_COUNTRY%% and prefix %%TARGET_PREFIX%%"
set "T_344=Pick: "
set "T_345=--- fresh start ---------------------------------------------"
set "T_347=%%C_WARN%%  [*] the Tor bundle failed the SHA-256 check against sha256sums-signed-build.txt; it was deleted and NOT unpacked.%%C_RST%%"
set "T_348=%%C_WARN%%  [upd] the release download failed its SHA-256 check; it was deleted and nothing was replaced.%%C_RST%%"
set "T_349=%%C_WARN%%  [!] OpenCode crashed %%CRASH_STREAK%% times in 10 minutes. Stopped so it is not restarted in a loop. Details in launcher.log.%%C_RST%%"
set "T_350=  [!] OpenCode stopped with code %%EC%%. Retry %%CRASH_STREAK%% of 2 on the same connection in %%CRASH_WAIT%% s; the chat resumes."
set "T_351=  [tokens] auth.json had disappeared; it was restored from the launcher copy. No login needed."
set "T_352=%%C_WARN%%  [upd] the downloaded copy is missing; nothing was replaced.%%C_RST%%"
set "T_353=  Running instance: PID %%LK_PID%%  "%%LK_BAT%%""
set "T_354=  [1] Close it and continue   [2] Open anyway (own copy of the settings)   [3] Exit"
set "T_355=  The other instance was closed and its lock removed. Starting."
set "T_356=  Instance lock cleared."
REM v2.54: pending resume after a quota stop.
set "T_357=  Pending resume from a quota stop: checking it..."
set "T_358=  Pending resume kept: this exit IP still has no quota. It stays for a later start."
set "T_359=  Pending resume kept: the check on this IP failed for a reason other than the quota."
set "T_360=  Pending resume kept: it was saved in another folder (%%AR_FOLDER%%)."
set "T_361=  Pending resume kept: the exit IP is the same as at the quota stop."
set "T_362=  Pending resume discarded: it is older than %%AR_MAX_HOURS%% hours."
set "T_363=  Pending resume: new exit IP and a fresh quota. Resuming the chat."
set "T_364=  Pending resume discarded. The chat itself is untouched."
set "T_365=  Pending resume file is damaged. Discarded."
set "T_366=  Pending resume kept: the exit IP cannot be read right now."
set "T_367=  Pending resume kept: PROBE is off, so the quota cannot be confirmed."
set "T_346=--- continue ------------------------------------------------"
set "T_377=  opencode-%%PRESET_NAME%%: %%PMSG%% (code %%PCODE%%). Log: %%STATE_DIR%%\launcher.log"
set "T_378=  opencode-%%PRESET_NAME%%: opencode exited with code %%PCODE%%. Log: %%STATE_DIR%%\launcher.log"
set "T_379=  opencode-%%PRESET_NAME%%: could not bring the connection up (code %%PCODE%%). Log: %%STATE_DIR%%\launcher.log"
set "T_380=  opencode-%%PRESET_NAME%%: opencode is not installed or cannot be started (code %%PCODE%%). Log: %%STATE_DIR%%\launcher.log"
set "T_383=Direct commands installed: opencode-warp, opencode-tor, opencode-proxy."
set "T_384=Remove the direct commands?"
set "T_385=The direct commands were removed."
set "T_386=not installed"
REM v2.60.1: the CLI is installed only after the user says yes.
set "T_387=   OpenCode CLI is not installed. Install it now? [Y/N]: "
set "T_388=  OpenCode CLI was not installed. Run the launcher again and answer Y, or install it by hand."
set "T_389=  WARP is stopped or disabled. Turning it on needs administrator rights, which this script never asks for. Start the WARP service yourself, or run this script as administrator."
set "T_390=  VPN Gate uses OpenVPN, which needs administrator rights. This script never asks for them: run it as administrator to use VPN Gate."
REM Batch messages are translated from lang\<code>.json; the UI writes lang\messages.txt (data only).
set "OC_TUI=mki18n"
set "OC_STATE=%STATE_DIR%"
"%PSX%" -NoProfile -Command "$l=Get-Content -LiteralPath $env:OCI_SELF; $i=[Array]::IndexOf($l,'#>>>OC_TUI_PS'); $e=[Array]::IndexOf($l,'#>>>OC_ENDTUI'); if(($i -lt 0) -or ($e -le $i)){exit 20}; Invoke-Expression (($l[($i+1)..($e-1)]) -join [Environment]::NewLine)"
set "OC_TUI="
if exist "%STATE_DIR%\lang\messages.txt" for /f "usebackq tokens=1,* delims==" %%a in ("%STATE_DIR%\lang\messages.txt") do set "%%a=%%b"
set "LASTFOLDER=%STATE_DIR%\lastfolder.txt"
REM Run-time flags that are set and cleared during the session.
REM RESUME: 1 when the next launch should continue the last chat.
set "RESUME="
REM COLD: 1 = fresh start, 0 = continue the same session.
set "COLD=0"
REM WARP_UP: 1 once WARP has been connected in this session.
set "WARP_UP=0"
REM QHIT / FHIT: set to 1 when a quota or fatal error is found in the log.
set "QHIT="
set "FHIT="
REM IP and WARP hold the current exit IP and the WARP path, if found.
set "IP="
set "WARP="
REM OC_CMD: full path of the opencode command, filled by find_opencode.
set "OC_CMD="
REM CLI capabilities, filled by :detect_caps once opencode is located:
REM CAP_STANDALONE=1 when "run --standalone" exists (OpenCode v2),
REM CAP_SERVICE=1 when the "opencode service" command exists (v2).
REM v1 has neither: --standalone makes it print the help screen instead
REM of running the message, and "service" is an unknown command.
set "CAP_STANDALONE="
set "CAP_SERVICE="
REM OCUPD: 1 once the once-per-start npm version check has run.
set "OCUPD="
REM one fixed throwaway session for every probe: deleted after a pass
REM so that --continue always points at the real chat, never the probe
set "OC_PROBE_ID=ses_probe0000000"
REM fatal error family: anything that ends the chat without the user
REM choosing to stop. The pattern is matched against log lines.
REM v2.44: "Failed to drain Session" (a compaction error) is gone: rotating cannot fix it. The watcher
REM and :scan_log now classify with patterns.conf (OC_PLOAD / OC_CLS below); OC_PAT stays as documentation.
set "OC_PAT=level=ERROR.*(free usage limit|usage limit reached|rate limit|out of usage|insufficient credits|payment required)"
REM v2.44: patterns.conf, same format as the .sh: one rotate= / ask= / noop= line each, the value is regex
REM alternatives joined by | (case-insensitive). Missing key or file = default; empty value = matches nothing;
REM bad regex = that list's default. Only level=ERROR lines count: noop first, then rotate, then ask.
set "OC_PLOAD=$rot='usage limit|out of usage|insufficient credits|payment required|ip (is )?blocked|blocked ip|403.*region|region.*403'; $ask='rate limit|rate_limit_exceeded|too many requests|status(Code)?[=: ]*429|HTTP 429'; $nop='compaction|context length exceeded|context_length_exceeded|maximum context|model not found|invalid model|ProviderModelNotFound|content filter|content policy|content_policy'; foreach($ln in @(Get-Content -LiteralPath $env:OC_PATF -ErrorAction SilentlyContinue)){ if(([string]$ln).Trim() -match '^(rotate|ask|noop)=(.*)$'){ $k=$matches[1]; $v=$matches[2].Trim(); $ok=$true; if($v){ try{ [void][regex]::new($v) }catch{ $ok=$false } } else { $v=$null }; if($ok){ if($k -eq 'rotate'){ $rot=$v } elseif($k -eq 'ask'){ $ask=$v } else { $nop=$v } } } }"
set "OC_CLS=param($l) if($l -notmatch 'level=ERROR'){ return '' }; if($env:OC_T0 -and $l -match 'timestamp=(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)' -and [string]::CompareOrdinal($matches[1], $env:OC_T0) -lt 0){ return '' }; if($nop -and $l -match $nop){ return 'noop' }; if($rot -and $l -match $rot){ return 'rotate' }; if($ask -and $l -match $ask){ return 'ask' }; return ''"
REM v2.22: the watcher paths used to be defined only inside :watch_start, so
REM with WATCH=0 (and in NONE / WARP-without-WARP) :scan_log read an empty
REM OC_LOGF and always answered NOHIT. They are defined here, once, for the
REM whole session; :watch_start still uses the same two names.
set "OC_LOGF=%LOGFILE%"

REM 32-bit Windows: PROCESSOR_ARCHITEW6432 is defined when a 32-bit
REM process runs on a 64-bit OS, so x86 alone is not proof.
REM REAL86=1 means a true 32-bit Windows system (WARP and opencode
REM standalone builds are not available there).
set "REAL86=0"
if /i "%PROCESSOR_ARCHITECTURE%"=="x86" if not defined PROCESSOR_ARCHITEW6432 set "REAL86=1"

REM v2.29: settings saved by the UI (config.json -> config.env) override the
REM defaults above, and the opencode command added by setup (STATE_DIR\bin) is
REM taken out of PATH for this process so the launcher never finds its own shim.
if not defined OC_SID set "OC_SID=%RANDOM%%RANDOM%"
if exist "%STATE_DIR%\config.json" call :cfg_refresh
call :cfg_import
call set "PATH=%%PATH:%STATE_DIR%\bin;=%%"
call set "PATH=%%PATH:;%STATE_DIR%\bin=%%"

REM Validate the numeric settings: invalid values fall back to defaults.
call :numcfg ROTATE_TRIES_MAX 4 20
call :numcfg WARP_WAIT 6
call :numcfg ROTATE_COOLDOWN 10
call :numcfg TARGET_TRIES 5
call :numcfg TARGET_MINUTES 15
call :numcfg0 TARGET_INTERVAL 15
call :numcfg WARP_CALL_TIMEOUT 15
call :numcfg WHERE_TIMEOUT 5
call :numcfg RESUME_TIMEOUT 90
call :numcfg PROXY_TRY_MAX 40 500
call :numcfg PROXY_ROT_MAX 10
call :numcfg PROXY_PROBE_TIMEOUT 8
call :numcfg POOL_MAX 5
call :numcfg POOL_INTERVAL 60
REM 0 is also valid here: "no size gate on a custom list"
call :numcfg0 PROXY_LIST_MIN_BYTES 20
call :numcfg TOR_SOCKS_PORT 9050
call :numcfg TOR_HTTP_PORT 8118
REM this one may legitimately be 0 (hunt with no limit)
call :numcfg0 IP_FIND_MAX 0
call :numcfg PROBE_BROKEN_MAX 3
call :numcfg VPN_TIMEOUT 45
call :numcfg VPNGATE_MAX 8
call :numcfg0 LIMIT_ROT_MAX 3
REM the model of the settings, restored by a fresh start after the limit action switched it
set "OC_MODEL_CFG=%OC_MODEL%"
call :numcfg TOR_BOOTSTRAP_WAIT 120
REM v3.1 (N41): capped below the point where LOG_MAXB (KB*1024) overflows.
call :numcfg LOG_MAX_KB 1024 2097151

REM Create the state folder if it is missing, then check the single-instance lock.
if not exist "%STATE_DIR%" mkdir "%STATE_DIR%" >nul 2>&1
set "OC_PATF=%STATE_DIR%\patterns.conf"
REM v2.44: a missing patterns.conf is written with the defaults, so it can be edited.
if not exist "%OC_PATF%" "%PSX%" -NoProfile -Command "try{ iex $env:OC_PLOAD; Set-Content -LiteralPath $env:OC_PATF -Encoding ASCII -Value @('# rotate= rotates, ask= asks first (once per 10 min), noop= never rotates. Regex alternatives joined by |, case-insensitive.', ('rotate=' + $rot), ('ask=' + $ask), ('noop=' + $nop)) }catch{}" >nul 2>&1
REM Fresh trace for this run: the last line names the stage that froze.
if exist "%STATE_DIR%\startup.log" del /f /q "%STATE_DIR%\startup.log" >nul 2>&1
REM v2.20: bound wcli.log too (it only grows on warp-cli failures, but a
REM dying daemon can fail for weeks - keep the last 400 lines above 200 KB)
call :trim_log "%STATE_DIR%\wcli.log" 200000 400
set /a LOG_MAXB=LOG_MAX_KB*1024
set /a LOG_KEEP=LOG_MAX_KB*8
if exist "%STATE_DIR%\launcher.log" for %%L in ("%STATE_DIR%\launcher.log") do if %%~zL GTR %LOG_MAXB% call :trim_log "%STATE_DIR%\launcher.log" %LOG_MAXB% %LOG_KEEP%
REM v3.1 (N62): only that arguments were given. The values (a --run prompt, a client
REM path) would reach launcher.log in clear and the support report masks no free text.
set "LOG_ARGS=redacted"
set "LOG_OSV="
for /f "tokens=*" %%v in ('ver') do if not defined LOG_OSV set "LOG_OSV=%%v"
call :log "start v2.60.19 args=[%LOG_ARGS%] cwd=%CD% arch=%PROCESSOR_ARCHITECTURE% %LOG_OSV%" boot
REM v2.30: one official copy. Setup copies this file to STATE_DIR\app and the opencode
REM command runs that copy. A duplicate (a second download, "(1)") hands over to it, or
REM replaces it when it is the newer one.
set "OFFICIAL=%STATE_DIR%\app\OpenCode Infinite.bat"
if /i "%~f0"=="%OFFICIAL%" goto :official_ok
if not exist "%OFFICIAL%" goto :official_ok
call :launcher_ver "%~f0" RUNVER
call :launcher_ver "%OFFICIAL%" OFFVER
if not defined RUNVER goto :official_ok
if not defined OFFVER goto :official_ok
call :ver_gt "%RUNVER%" "%OFFVER%"
if not "%VGT%"=="1" goto :official_hand
REM v2.40: cmd re-reads a running .bat by byte offset, so never overwrite the official copy while a live lock owner or a cmd started on it runs.
set "OC_LOCK=%STATE_DIR%\lock"
set "OC_OFF=%OFFICIAL%"
"%PSX%" -NoProfile -Command "$a=$false; try{ $me=(Get-CimInstance Win32_Process -Filter ('ProcessId='+$PID)).ParentProcessId; $of=Join-Path $env:OC_LOCK 'owner'; if(Test-Path -LiteralPath $of){ $o=[int](@((Get-Content -LiteralPath $of -TotalCount 1) -split '\|')[0]); $p=Get-Process -Id $o -ErrorAction SilentlyContinue; if($p -and $o -ne $me -and $p.ProcessName -eq 'cmd'){ $a=$true } }; $id=Join-Path (Split-Path -Parent $env:OC_LOCK) 'instances'; foreach($f2 in @(Get-ChildItem -LiteralPath $id -Filter owner -Recurse -File -ErrorAction SilentlyContinue)){ try{ $v=@((Get-Content -LiteralPath $f2.FullName -TotalCount 1) -split '\|'); $q=Get-Process -Id ([int]$v[0]) -ErrorAction SilentlyContinue; if($q -and $v.Count -gt 3 -and $q.Id -ne $me -and [string]$q.StartTime.Ticks -eq $v[1] -and $q.Path -eq $v[2]){ $a=$true } }catch{} }; foreach($c in @(Get-CimInstance Win32_Process -Filter ('Name=''cmd.exe'''))){ if($c.ProcessId -ne $me -and $c.CommandLine -and $c.CommandLine.ToLower().Contains($env:OC_OFF.ToLower())){ $a=$true } } }catch{}; if($a){ exit 1 }; exit 0" >nul 2>&1
if errorlevel 1 goto :official_inuse
copy /y "%~f0" "%OFFICIAL%" >nul 2>&1
REM v2.39: the log depended on nothing; now it reflects the copy result.
if errorlevel 1 (call :log "official copy could not be replaced; the old copy runs" boot) else (call :log "official copy replaced by this newer launcher" boot)
goto :official_ok
:official_inuse
call :log "official copy in use by another window: not replaced" boot
goto :official_ok
:official_hand
REM v2.40: give the console its original code page back first, or the official copy saves 65001 as the "original" and never undoes it.
if defined OC_OLDCP chcp %OC_OLDCP% >nul 2>&1
call "%OFFICIAL%" %*
exit /b %errorlevel%
:official_ok
REM --allow-direct: the only way to run OpenCode on the real IP when WARP is not usable.
set "ALLOW_DIRECT="
REM v3.1 (N01): the arguments are read as data. Passing %* back to a command
REM re-parsed a path with & | < > and also matched --allow-direct-algo.
"%PSX%" -NoProfile -Command "try{ $me=(Get-CimInstance Win32_Process -Filter ('ProcessId='+$PID)).ParentProcessId; $cl=[string](Get-CimInstance Win32_Process -Filter ('ProcessId='+$me)).CommandLine; if($cl -match '(^|\s)--allow-direct(\s|$)'){ exit 0 } }catch{}; exit 1" >nul 2>&1
if not errorlevel 1 set "ALLOW_DIRECT=1"
if /i "%~1"=="--verify" goto :verify_mode
if /i "%~1"=="--renew" goto :renew_mode
REM v3.6: --install writes opencodeinf and opencode-auto and adds their folder to PATH (Settings, Launch, Install commands).
if /i "%~1"=="--install" goto :install_mode
REM D01: direct commands (opencode-warp, opencode-tor, opencode-proxy) and
REM the flags they add. Everything is read here, before the TUI and before
REM the lock, so a preset never draws a menu nor asks a question. An argument
REM that is not a known flag stops the scan, so a folder dropped on the .bat
REM still reaches %1 for :mode_folder.
set "PRESET_MODE="
set "PRESET_NAME="
set "OPT_HERE="
set "OPT_QUIET="
set "OPT_VERBOSE="
set "OPT_NOUPDATE="
set "OPT_NOPROBE="
set "OPT_SAMEIP="
set "OPT_NEWIP="
:ps_args
if "%~1"=="" goto :ps_parsed
if /i "%~1"=="--preset" goto :ps_name
if /i "%~1"=="--here" (set "OPT_HERE=1" & shift & goto :ps_args)
if /i "%~1"=="--quiet" (set "OPT_QUIET=1" & shift & goto :ps_args)
if /i "%~1"=="--verbose" (set "OPT_VERBOSE=1" & shift & goto :ps_args)
if /i "%~1"=="--no-update" (set "OPT_NOUPDATE=1" & shift & goto :ps_args)
if /i "%~1"=="--no-probe" (set "OPT_NOPROBE=1" & shift & goto :ps_args)
if /i "%~1"=="--same-ip" (set "OPT_SAMEIP=1" & shift & goto :ps_args)
if /i "%~1"=="--new-ip" (set "OPT_NEWIP=1" & shift & goto :ps_args)
if /i "%~1"=="--auto" (set "OPT_AUTO=1" & shift & goto :ps_args)
REM v3.7: --warp, --tor and --proxy are the same as the direct commands opencode-warp, opencode-tor and opencode-proxy.
if /i "%~1"=="--warp" (set "PRESET_MODE=1" & set "PRESET_NAME=warp" & set "OPT_HERE=1" & set "OPT_SAMEIP=1" & set "OPT_QUIET=1" & shift & goto :ps_args)
if /i "%~1"=="--tor" (set "PRESET_MODE=1" & set "PRESET_NAME=tor" & set "OPT_HERE=1" & set "OPT_SAMEIP=1" & set "OPT_QUIET=1" & shift & goto :ps_args)
if /i "%~1"=="--proxy" (set "PRESET_MODE=1" & set "PRESET_NAME=proxy" & set "OPT_HERE=1" & set "OPT_SAMEIP=1" & set "OPT_QUIET=1" & shift & goto :ps_args)
goto :ps_parsed
:ps_name
set "PRESET_MODE=1"
set "PRESET_NAME=%~2"
if not defined PRESET_NAME goto :ps_bad
shift
shift
goto :ps_args
:ps_parsed
REM v3.1 (D14): how much reaches the console. quiet prints nothing and only
REM logs; normal is what the script always did; debug also logs every line.
set "CONSOLE_MODE=normal"
if defined OPT_QUIET set "CONSOLE_MODE=quiet"
if defined OPT_VERBOSE set "CONSOLE_MODE=debug"
REM v2.60 (A1): --auto skips every menu: the current folder, CLI, and the saved
REM connection (WARP when none is saved). It goes through the same :folder_ok path as --run.
if defined OPT_AUTO (
  set "AUTO_RUN=1"
  set "APP_MODE=CLI"
  set "OPFOLDER=%CD%"
  set "RESUME="
  REM set /p "VAR=<file" would print "<file" as a prompt and wait on stdin; the input redirect goes after the quotes.
  call :auto_pick
  REM v2.60 A3: auto uses only WARP, TOR and PROXY, no VPN Gate and no admin; console stays short, details go to launcher.log.
  call :auto_method_ok
  set "AUTO_ROTATE=1"
  set "AUTO_FAILS=0"
  set "AUTO_GIVEUPS=0"
  if defined OPT_NOPROBE set "PROBE=0"
  if defined OPT_NOUPDATE set "UPDATE_CHECK=0"
  if not defined OPT_VERBOSE set "CONSOLE_MODE=quiet"
  call :log "auto: folder=%CD% egress=%OC_EGRESS_DEFAULT%" boot
  REM Same road as a preset: the lock check runs, then :ps_go skips the update prompt.
  goto :ps_locked
)
if not defined PRESET_MODE goto :ps_locked
REM The preset owns folder, mode and egress: :home_start, :mode_menu, :folder
REM and the picker of :egress_menu are all skipped below. OC_EGRESS_DEFAULT
REM makes :egress_cfg take the value as it is, without asking.
if /i "%PRESET_NAME%"=="warp" set "EGRESS=WARP"
if /i "%PRESET_NAME%"=="warp" goto :ps_have
if /i "%PRESET_NAME%"=="tor" set "EGRESS=TOR"
if /i "%PRESET_NAME%"=="tor" goto :ps_have
if /i "%PRESET_NAME%"=="proxy" set "EGRESS=PROXY"
if /i "%PRESET_NAME%"=="proxy" goto :ps_have
:ps_bad
echo opencode-preset: unknown preset "%PRESET_NAME%" (warp, tor, proxy) - code 2
exit /b 2
:ps_have
set "OC_EGRESS_DEFAULT=%EGRESS%"
set "OPFOLDER=%CD%"
set "APP_MODE=%OC_MODE_DEFAULT%"
if /i "%APP_MODE%"=="ASK" set "APP_MODE=CLI"
if not defined APP_MODE set "APP_MODE=CLI"
if /i "%APP_MODE%"=="DESKTOP" call :find_desktop_app
if defined OPT_NOPROBE set "PROBE=0"
if defined OPT_NOUPDATE set "UPDATE_CHECK=0"
REM AUTO_RUN takes :ready straight to :run, past :ready_menu and :menu_loop;
REM it also silences :oc_update_check. --same-ip/--new-ip are read and logged
REM only: the rotation decision belongs to D05/D06.
set "AUTO_RUN=1"
set "RESUME="
call :log "preset=%PRESET_NAME% egress=%EGRESS% mode=%APP_MODE% here=%OPT_HERE% same-ip=%OPT_SAMEIP% new-ip=%OPT_NEWIP% quiet=%OPT_QUIET% verbose=%OPT_VERBOSE% no-update=%OPT_NOUPDATE% no-probe=%OPT_NOPROBE%" boot
:ps_locked
call :lock_check
REM v2.22: :lock_check no longer jumps to :quit from inside a called
REM subroutine (that returned to this caller with an emptied scope). It
REM sets LOCK_BUSY and returns; the exit happens here, at top level.
if not defined LOCK_BUSY goto :ps_go
if not defined PRESET_MODE goto :quit
echo opencode-preset: another launcher is running - code 5
exit /b 5
:ps_go
if defined PRESET_MODE goto :folder_ok
if defined OPT_AUTO goto :folder_ok

REM Once per start: check the repo for a newer launcher. Silent when
REM nothing to do or offline; asks before ever replacing this file.
if "%UPDATE_CHECK%"=="1" if /i not "%UPDATE_ASK%"=="never" call :self_update

REM ============================================================
REM  00) HOME SCREEN (v2.29) and quick start
REM ============================================================
REM The UI lives at the end of this file (#>>>OC_TUI_PS). Launch continues to
REM the menus below; Exit leaves; no usable console falls back to them too.
REM --run is what the "opencode" command and the shortcut call: it skips every
REM menu and starts opencode in the current folder with the saved connection.
set "AUTO_RUN="
set "RUNARGS="
if /i "%~1"=="--run" goto :auto_run
if not "%~1"=="" goto :mode_menu
:home_start
call :tui home
set "TUIRC=%errorlevel%"
call :log "ui home rc=%TUIRC%" ui
set "TUI_PROBED=1"
REM v3.1 (N63): only a UI that answered marks itself usable; 21 (unreadable file) does not.
if "%TUIRC%"=="0" set "TUI_OK=1"
if "%TUIRC%"=="10" set "TUI_OK=1"
REM v2.58: "Start again" on the home screen (11): the last folder, CLI, the saved connection.
if "%TUIRC%"=="11" goto :quick_start
REM v3.6: Auto opencode (12): a new IP and a new session, no screens.
if "%TUIRC%"=="12" goto :auto_menu
call :cfg_import
if "%TUIRC%"=="0" goto :quit
goto :mode_menu

REM v3.6: the Auto button. The --auto road with two differences: the last folder is used
REM (no folder screen) and AUTO_COLD makes :ready start a fresh session on a new IP.
:auto_menu
set "AUTO_COLD=1"
set "OPT_AUTO=1"
set "AUTO_RUN=1"
set "APP_MODE=CLI"
set "RESUME="
set "OPFOLDER="
set "AQ="
if exist "%LASTFOLDER%" set /p AQ=<"%LASTFOLDER%"
if defined AQ set "AQ=%AQ:"=%"
if defined AQ if exist "%AQ%\" set "OPFOLDER=%AQ%"
if not defined OPFOLDER goto :home_start
call :auto_pick
call :auto_method_ok
set "AUTO_ROTATE=1"
set "AUTO_FAILS=0"
set "AUTO_GIVEUPS=0"
set "CONSOLE_MODE=quiet"
call :log "auto button: folder=%OPFOLDER% egress=%OC_EGRESS_DEFAULT% new session" boot
goto :ps_locked

REM v2.58: the last folder again. Mode is CLI (the home row exists only for CLI); folder and connection follow as usual.
:quick_start
set "APP_MODE=CLI"
set "QLAST="
if exist "%LASTFOLDER%" set /p QLAST=<"%LASTFOLDER%"
if defined QLAST set "QLAST=%QLAST:"=%"
if not defined QLAST goto :home_start
if not exist "%QLAST%\" goto :home_start
set "OPFOLDER=%QLAST%"
REM v2.60 (A2): "Start again" reuses the saved connection (see :egress_menu).
set "QUICK_START=1"
if exist "%STATE_DIR%\last_method.txt" set /p "OC_EGRESS_DEFAULT="<"%STATE_DIR%\last_method.txt"
call :log "quick start in the last folder" menu
goto :folder_ok

:auto_run
set "AUTO_RUN=1"
REM shortcut: the arguments are split on spaces when they reach opencode, so
REM a quoted argument with spaces is not kept whole - use the full launcher then.
set "RUNARGS=%*"
set "RUNARGS=%RUNARGS:*--run=%"
set "APP_MODE=CLI"
if /i "%OC_MODE_DEFAULT%"=="DESKTOP" call :find_desktop_app
if /i "%OC_MODE_DEFAULT%"=="DESKTOP" if defined OC_DESKTOP goto :mode_desktop_ok
set "OPFOLDER=%CD%"
goto :folder_ok

REM ============================================================
REM  0) APP MODE: CLI (terminal TUI) or the desktop app
REM ============================================================
REM v2.26: new. APP_MODE=CLI keeps the whole flow as it was. APP_MODE=DESKTOP launches
REM the OpenCode desktop exe through the same egress, and restarts it after
REM every rotation (there is no CLI chat to resume). OC_APP overrides the exe.
:mode_menu
if defined MODE_FORCE_ASK goto :mode_show
if /i not "%OC_MODE_DEFAULT%"=="CLI" goto :mode_chk_d
set "APP_MODE=CLI"
goto :mode_done
:mode_chk_d
if /i not "%OC_MODE_DEFAULT%"=="DESKTOP" goto :mode_show
call :find_desktop_app
if not defined OC_DESKTOP goto :mode_show
goto :mode_desktop_ok
:mode_show
REM v2.44: the mode screen reuses the Desktop search kept up to 10 minutes (desktop_scan.txt); "Detect the desktop app again" forces a new one.
call :find_desktop_app
call :log "mode screen: desktop=%OC_DESKTOP%" mode
call :tui_init
if not defined TUI_OK goto :mode_old
call :tui mode
set "TUIRC=%errorlevel%"
if "%TUIRC%"=="20" goto :mode_old
if "%TUIRC%"=="2" goto :mode_desktop
if "%TUIRC%"=="1" goto :mode_cli
REM v3.1: Esc (3) goes back to the home screen, it does not quit.
if "%TUIRC%"=="3" goto :home_start
REM v2.42: 5 = detect again: the screen is shown again with a fresh search.
if "%TUIRC%"=="5" goto :mode_show
goto :quit
:mode_cli
set "APP_MODE=CLI"
goto :mode_done
:mode_old
cls
echo ============================================================
call echo %T_2%
echo ============================================================
echo.
call echo %T_3%
call echo %T_4%
if defined OC_DESKTOP echo       "%OC_DESKTOP%"
if not defined OC_DESKTOP call echo %T_315%
call echo %T_5%
echo.
call echo %T_6%
echo.
call :pick 123 "Pick: "
if errorlevel 100 goto :quit
if not errorlevel 1 goto :mode_menu
if errorlevel 3 goto :quit
if errorlevel 2 goto :mode_desktop
set "APP_MODE=CLI"
goto :mode_done
:mode_desktop
call :find_desktop_app
if defined OC_DESKTOP goto :mode_desktop_ok
echo.
call echo %T_7%
call :yn "%T_373%"
if errorlevel 100 goto :quit
if errorlevel 2 goto :mode_menu
call :install_desktop
REM v2.42: the silent installer can return before its files are in place: look again for up to 60 s.
set "DSK_WAIT=0"
:mode_desk_wait
call :rescan_desktop
if defined OC_DESKTOP goto :mode_desktop_ok
set /a DSK_WAIT+=1
if %DSK_WAIT% GEQ 30 goto :mode_desk_nf
timeout /t 2 /nobreak >nul 2>&1
goto :mode_desk_wait
:mode_desk_nf
call echo %T_8%
call :pause_key
goto :mode_menu
:mode_desktop_ok
set "APP_MODE=DESKTOP"
echo.
call echo %T_9%
call :desktop_update_check
:mode_done
call :log "run mode %APP_MODE%" menu
REM The desktop app has its own project picker: no folder step for it.
if /i not "%APP_MODE%"=="DESKTOP" goto :mode_folder
set "OPFOLDER=%CD%"
goto :folder_ok
:mode_folder

REM ============================================================
REM  1) WORKING FOLDER
REM ============================================================
REM No parenthesised block may expand a path variable: a folder like
REM "Program Files (x86)" unbalances the block while it is parsed.
REM Everything here is sequential ifs and gotos instead.
REM If a folder was passed as argument (drag and drop), use it directly.
if "%~1"=="" goto :folder
if not exist "%~1\" goto :folder
set "OPFOLDER=%~1"
goto :folder_ok

REM Folder menu: reopen last folder, use the current one, browse, or exit.
:folder
set "OPFOLDER="
set "LASTPATH="
if exist "%LASTFOLDER%" set /p LASTPATH=<"%LASTFOLDER%"
if defined LASTPATH set "LASTPATH=%LASTPATH:"=%"
if defined LASTPATH if not exist "%LASTPATH%\" set "LASTPATH="
call :tui_init
if not defined TUI_OK goto :folder_old
set "OC_LASTPATH=%LASTPATH%"
set "OC_CWD=%CD%"
call :tui folder
set "TUIRC=%errorlevel%"
if "%TUIRC%"=="20" goto :folder_old
if "%TUIRC%"=="1" goto :folder_1
if "%TUIRC%"=="2" goto :use_current
if "%TUIRC%"=="3" goto :pick_folder
if "%TUIRC%"=="6" goto :folder_recent
REM v3.1: Esc (5) goes back to the home screen; 4 is the Exit row.
if "%TUIRC%"=="5" goto :home_start
goto :quit
:folder_old
cls
echo ============================================================
call echo %T_10%
echo ============================================================
echo.
set "OPFOLDER="
set "LASTPATH="
REM Read the saved folder path, strip quotes, and drop it if it no longer exists.
if exist "%LASTFOLDER%" set /p LASTPATH=<"%LASTFOLDER%"
if defined LASTPATH set "LASTPATH=%LASTPATH:"=%"
if defined LASTPATH if not exist "%LASTPATH%\" set "LASTPATH="
echo.
call echo %T_11%
REM Show the saved path only when there is one; otherwise show a placeholder.
if defined LASTPATH goto :folder_lp
call echo %T_12%
goto :folder_m2
:folder_lp
echo       "%LASTPATH%"
:folder_m2
call echo %T_13%
echo       "%CD%"
call echo %T_14%
call echo %T_15%
echo.
call echo %T_6%
echo.
REM v2.22: choice is the main path again. Every keypress used to start a
REM fresh PowerShell just to read one character; ESC is no longer read
REM here, [4] exits.
REM v2.23: the raw-key reader :readkey is gone - nothing called it any more
REM and every keypress used to cost a PowerShell start.
goto :folder_choice

:folder_choice
REM choice returns the key number through errorlevel: check highest first.
call :pick 1234 "Pick: "
REM v2.22: errorlevel 0 (Ctrl+C) redraws the menu instead of falling through
REM to option [1] and forcing the last folder.
REM v2.25: stdin closed answers 255 - leave instead of looping.
if errorlevel 100 goto :quit
if not errorlevel 1 goto :folder
if errorlevel 4 goto :quit
if errorlevel 3 goto :pick_folder
if errorlevel 2 goto :use_current
:folder_1
REM Option 1 with nothing saved: explain, wait, and show the menu again.
if not defined LASTPATH (
  echo.
  call echo %T_16%
  timeout /t 3 /nobreak >nul 2>&1
  goto :folder
)
set "OPFOLDER=%LASTPATH%"
goto :folder_ok

REM A folder from the saved history (Menu-Folder wrote its path to folder_pick.txt).
:folder_recent
set "OPFOLDER="
if exist "%STATE_DIR%\folder_pick.txt" for /f "usebackq delims=" %%f in ("%STATE_DIR%\folder_pick.txt") do set "OPFOLDER=%%f"
if exist "%STATE_DIR%\folder_pick.txt" del /f /q "%STATE_DIR%\folder_pick.txt" >nul 2>&1
if not defined OPFOLDER goto :folder
goto :folder_ok

REM Option 2: the folder the launcher was started from.
:use_current
set "OPFOLDER=%CD%"
goto :folder_ok

REM Option 3: modern Explorer folder picker (IFileDialog, FOS_PICKFOLDERS),
REM opened in the last used folder. ESC or X on it opens the classic
REM FolderBrowserDialog right after; cancelling that one too reaches the
REM retry question. Both pickers live at the end of this same file, after
REM the batch body, and run through :run_picker, which reads this script
REM with PowerShell and captures the chosen path from stdout. No helper
REM files and no temp results: the dialog is the only thing that touches
REM the disk, and it writes nothing.
:pick_folder
echo.
call echo %T_17%
set "OPFOLDER="
REM Both dialogs open where the user last worked, when that folder exists.
set "OC_START=%USERPROFILE%"
if defined LASTPATH if exist "%LASTPATH%\" set "OC_START=%LASTPATH%"
set "OC_MODE=modern"
call :run_picker
if defined OPFOLDER goto :pick_done
REM Modern dialog cancelled (ESC/X) or unable to start: classic fallback.
call echo %T_18%
set "OC_MODE=classic"
call :run_picker
if defined OPFOLDER goto :pick_done
echo.
call echo %T_19%
call :yn "%T_374%"
if not errorlevel 2 goto :pick_folder
goto :folder
:pick_done
goto :folder_ok

REM - run the embedded picker (see the block after the end of the batch
REM   body) and capture the chosen folder from stdout. OC_MODE selects the
REM   dialog. The picker script is read out of this file from its marker
REM   line down, so the C# interop never has to cross cmd quoting and no
REM   helper file is ever written.
:run_picker
set "OPFOLDER="
call :olog "picker: %OC_MODE% dialog starting"
for /f "usebackq delims=" %%i in (`%PSX% -NoProfile -STA -Command "$l=Get-Content -LiteralPath $env:OCI_SELF; $i=[Array]::IndexOf($l,'#>>>OC_PICKER_PS'); if($i -lt 0){exit 1}; Invoke-Expression (($l[($i+1)..($l.Count-1)]) -join [Environment]::NewLine)"`) do set "OPFOLDER=%%i"
if not defined OPFOLDER goto :run_picker_none
call :olog "picker: %OC_MODE% returned a folder"
goto :eof
:run_picker_none
call :olog "picker: %OC_MODE% returned nothing"
goto :eof

REM Check that the chosen folder exists before entering it.
:folder_ok
if exist "%OPFOLDER%\" goto :folder_ok2
echo.
call echo %T_20%
timeout /t 3 /nobreak >nul 2>&1
goto :folder

REM Enter the folder. pushd is used because it also accepts UNC (network) paths.
:folder_ok2
pushd "%OPFOLDER%" 2>nul
if not errorlevel 1 goto :folder_ok3
echo.
call echo %T_21%
timeout /t 3 /nobreak >nul 2>&1
goto :folder

REM POPPED marks that a pushd was done, so :quit runs popd.
REM The path is saved in quotes; the quotes are removed when it is read back.
:folder_ok3
set "POPPED=1"
REM quoted write + quote-strip on read: survives & and () in the path
>"%LASTFOLDER%" echo "%CD%"
call :folder_remember
title opencode-infinity
REM v2.60 (A3): auto prints nothing from the folder, egress and dependency steps.
if not defined OPT_AUTO echo.
if not defined OPT_AUTO if not defined OPT_QUIET call echo %T_22%
call :trace folder "%CD%"
if not defined OPT_AUTO echo.

REM ============================================================
REM  1b) EGRESS MODE (process-only for opencode)
REM ============================================================
REM Asks once after the folder is fixed. The choice lives in EGRESS and
REM ACTIVE_PROXY. Only the opencode process tree inherits the proxy env.
:egress_menu
REM v2.60 (A2): the saved connection is taken only by --run/--auto and by "Start again".
REM "Launch OpenCode" always shows every method, even when one is saved.
if not defined AUTO_RUN if not defined QUICK_START goto :egress_ask
if /i "%OC_EGRESS_DEFAULT%"=="WARP" goto :egress_cfg
if /i "%OC_EGRESS_DEFAULT%"=="TOR" goto :egress_cfg
if /i "%OC_EGRESS_DEFAULT%"=="PROXY" goto :egress_cfg
if /i "%OC_EGRESS_DEFAULT%"=="NONE" goto :egress_cfg
if /i "%OC_EGRESS_DEFAULT%"=="WIREGUARD" goto :egress_cfg
if /i "%OC_EGRESS_DEFAULT%"=="VPNGATE" goto :egress_cfg
goto :egress_ask
:egress_cfg
set "EGRESS=%OC_EGRESS_DEFAULT%"
set "ACTIVE_PROXY="
set "WARP="
if /i "%EGRESS%"=="TOR" set "ACTIVE_PROXY=http://127.0.0.1:%TOR_HTTP_PORT%"
if /i "%EGRESS%"=="TOR" set "TOR_TRIES=0"
if /i "%EGRESS%"=="WIREGUARD" call :vpn_labels
if /i "%EGRESS%"=="VPNGATE" call :vpn_labels
if not defined OPT_AUTO if not defined OPT_QUIET call echo %T_23%
goto :egress_done
:egress_ask
call :tui_init
if not defined TUI_OK goto :egress_old
set "OC_H_FOLDER=%CD%"
call :tui egress
set "TUIRC=%errorlevel%"
if "%TUIRC%"=="20" goto :egress_old
if %TUIRC% LSS 1 goto :quit
REM v3.1: Esc goes back to the folder screen (9 since the two tunnel rows took 5 and 6).
if "%TUIRC%"=="9" goto :folder
if %TUIRC% GTR 6 goto :quit
cmd /c exit %TUIRC%
goto :egress_pick
:egress_old
echo ============================================================
call echo %T_24%
echo ============================================================
echo.
call echo %T_25%
call echo %T_26%
call echo %T_27%
call echo %T_28%
call echo %T_29%
call echo %T_275%
call echo %T_276%
echo.
call echo %T_6%
echo.
call :pick 123456 "Pick egress: "
REM v3.1 (N21): :pick answers 0 on Ctrl+C. No "if errorlevel" matched it, so the flow fell
REM through to EGRESS=WARP and offered to install WARP. Back to the egress chooser instead.
if not errorlevel 1 goto :egress_ask
:egress_pick
REM v2.25: stdin closed answers 255; do not silently pick NONE.
if errorlevel 100 goto :quit
if errorlevel 6 (
  set "EGRESS=VPNGATE"
  set "ACTIVE_PROXY="
  set "WARP="
  call echo %T_278%
  goto :egress_done
)
if errorlevel 5 (
  set "EGRESS=WIREGUARD"
  set "ACTIVE_PROXY="
  set "WARP="
  call :vpn_labels
  call echo %T_277%
  goto :egress_done
)
if errorlevel 4 (
  set "EGRESS=NONE"
  set "ACTIVE_PROXY="
  set "WARP="
  call echo %T_30%
  goto :egress_done
)
if errorlevel 3 (
  set "EGRESS=PROXY"
  set "ACTIVE_PROXY="
  set "WARP="
  call echo %T_31%
  goto :egress_done
)
if errorlevel 2 (
  set "EGRESS=TOR"
  set "WARP="
  set "ACTIVE_PROXY=http://127.0.0.1:%TOR_HTTP_PORT%"
  REM v2.22: circuit rotation counter, reset every time TOR is chosen.
  set "TOR_TRIES=0"
  REM v2.22: the menu still described a manual Privoxy setup; TOR installs
  REM and bridges itself now.
  call echo %T_32%
  goto :egress_done
)
set "EGRESS=WARP"
set "ACTIVE_PROXY="
if not defined OPT_QUIET call echo %T_33%
:egress_done
if not defined OPT_AUTO echo.
call :trace egress %EGRESS%

REM ============================================================
REM  2) DEPENDENCIES
REM ============================================================
REM Each stage names itself before it runs. They are silent when they work,
REM and a silent console cannot be told apart from a frozen one.
REM HAVE_CURL=1 when curl.exe is available (it is used for downloads and IP checks).
call :trace dep_curl
if not defined OPT_AUTO if not defined OPT_QUIET call echo %T_34%
call :have_exe curl.exe
set "HAVE_CURL=%HAVE%"

REM - WARP (optional, only when EGRESS=WARP)
if /i not "%EGRESS%"=="WARP" goto :check_opencode
REM Look for warp-cli. If found, skip the WARP setup and go to opencode.
call :trace dep_warp
if not defined OPT_AUTO if not defined OPT_QUIET call echo %T_35%
call :find_warp
if defined WARP goto :check_opencode
REM v2.60 (A3): auto never offers the WARP installer; a missing WARP moves on to Tor (see :auto_connect).
if defined OPT_AUTO goto :check_opencode

REM 32-bit systems cannot run the WARP installer: skip the offer.
if "%REAL86%"=="1" goto :no_warp_32

call echo %T_36%
call echo %T_37%
echo.
REM Offer the install. Answering N continues without rotation.
call :yn "%T_376%"
if errorlevel 2 goto :check_opencode
call :install_warp
call :find_warp
if defined WARP goto :warp_ready
call echo %T_38%
call echo %T_39%
goto :check_opencode

REM Message shown on 32-bit systems, then continue without WARP.
:no_warp_32
call echo %T_40%
call echo %T_41%
goto :check_opencode

REM WARP was installed or found: confirm and continue.
:warp_ready
call echo %T_42%

REM - opencode
REM Look for the opencode command. If found, go to the menu.
:check_opencode
call :trace dep_opencode
if not defined OPT_AUTO if not defined OPT_QUIET call echo %T_43%
call :find_opencode
call :db_guard
if defined OC_CMD goto :ready
REM v2.40: Desktop mode launches the app, not the CLI: no CLI is not an error there, so do not install it or quit.
if /i "%APP_MODE%"=="DESKTOP" goto :ready

REM Not found: ask first (v2.60.2). Auto and quiet runs never install on their own.
if defined OPT_AUTO goto :oc_missing
if defined OPT_QUIET goto :oc_missing
echo.
call :yn "%T_387%"
if errorlevel 100 goto :quit
if errorlevel 2 goto :oc_missing
REM Yes: install it (npm first, then the standalone build).
call echo %T_44%
call :install_opencode
REM v2.22: :install_opencode can abort (32-bit with no route) - exit from
REM here, at top level, where :quit is safe to reach with goto.
if defined OC_ABORT goto :quit
call :find_opencode
if defined OC_CMD (
  call echo %T_45%
  goto :ready
)
REM The install failed: show a manual link and stop.
call echo %T_46%
call echo %T_47%
call :pause_key
goto :quit
REM Declined, or an auto/quiet run: say how to get it, then stop.
:oc_missing
call echo %T_388%
call echo %T_47%
if not defined OPT_AUTO if not defined OPT_QUIET call :pause_key
goto :quit

REM Both dependencies are ready. Probe what this CLI build supports,
REM then a short pause before the menu.
:ready
call :detect_caps
call :log "opencode: %OC_CMD% version=%OC_VER% service=%CAP_SERVICE% standalone=%CAP_STANDALONE%" deps
REM CLI update check only in CLI mode; desktop mode checks its own update right after it is picked.
if /i not "%APP_MODE%"=="DESKTOP" call :oc_update_check
call :trace ready
if not defined AUTO_RUN goto :ready_menu
set "COLD=0"
REM v3.6: the Auto button asks for a new IP and starts a new session.
if defined AUTO_COLD set "COLD=1"
goto :run
:ready_menu
timeout /t 1 /nobreak >nul 2>&1

REM ============================================================
REM  3) MENU
REM ============================================================
REM Main menu. Each pass redraws the screen and checks the IP.
:menu_loop
REM v2.39: a chat pinned by menu [9] is forgotten once the menu is shown again.
set "PIN_SESS="
set "AR_CHECKED="
call :trace menu
REM keep the lock fresh so a second launcher can tell it is alive
REM v2.22: :lock_touch recreates the stamp entry, which is what moves the
REM folder timestamp (see :lock_check).
if exist "%STATE_DIR%\lock\" call :lock_touch
call :tui_init
if not defined TUI_OK goto :menu_hdr_old
cls
call echo %T_48%
goto :menu_work
:menu_hdr_old
cls
echo ============================================================
call echo %T_49%
echo.
call echo %T_50%
call echo %T_51%
call echo %T_52%
if defined ACTIVE_PROXY echo   Proxy  : %ACTIVE_PROXY%
REM Show the WARP path only in WARP mode; otherwise say rotation is off.
if /i not "%EGRESS%"=="WARP" goto :menu_warp_done
if defined WARP goto :menu_warp_path
call echo %T_53%
goto :menu_warp_done
:menu_warp_path
call echo %T_54%
:menu_warp_done
if not defined OC_VER goto :menu_ver_done
call echo %T_55%
:menu_ver_done
echo ============================================================
echo.

:menu_work
REM Connect WARP the first time the menu is shown in this session.
REM Later passes skip this step, because WARP_UP is already 1.
if /i not "%EGRESS%"=="WARP" goto :menu_ip
if not defined WARP goto :menu_ip
if "%WARP_UP%"=="1" goto :menu_ip
call :warp_up
set "WARP_UP=1"
REM Read the current exit IP through the proxy. WFLAG receives warp=on or off.
:menu_ip
set "WFLAG="
if /i "%EGRESS%"=="WARP" if defined WARP call :getip2 IP WFLAG
if defined IP goto :menu_ip_ok
REM No IP could be read: show "unknown" with the reason.
set "IP=unknown"
if /i "%EGRESS%"=="WARP" if defined WARP set "IP=unknown - WARP proxy not answering"
if /i "%EGRESS%"=="WARP" if not defined WARP set "IP=unknown - WARP not installed"
if /i "%EGRESS%"=="TOR" set "IP=via Tor"
if /i "%EGRESS%"=="PROXY" if defined ACTIVE_PROXY set "IP=via free proxy"
if /i "%EGRESS%"=="NONE" set "IP=direct"
:menu_ip_ok
REM v2.36: MENU_DEFAULT runs one option at once, the first time the menu would be drawn.
if defined MENU_AUTO_DONE goto :menu_ip_ok2
if /i "%MENU_DEFAULT%"=="ask" goto :menu_ip_ok2
set "MENU_AUTO_DONE=1"
set "MD_RC="
if "%MENU_DEFAULT%"=="1" set "MD_RC=1"
REM v2.42: 2 continues the same IP and chat (like menu [2]); it never clears the saved tokens.
if "%MENU_DEFAULT%"=="2" set "MD_RC=2"
if "%MENU_DEFAULT%"=="3" set "MD_RC=3"
if not defined MD_RC goto :menu_ip_ok2
call echo %T_298%
cmd /c exit %MD_RC%
goto :menu_dispatch
:menu_ip_ok2
if not defined TUI_OK goto :menu_old_list
set "OC_H_FOLDER=%CD%"
set "OC_H_EGRESS=%EGRESS%"
set "OC_H_MODE=%APP_MODE%"
set "OC_H_PROXY=%ACTIVE_PROXY%"
set "OC_H_WARP="
if /i "%EGRESS%"=="WARP" set "OC_H_WARP=%WARP%"
if /i "%EGRESS%"=="WARP" if not defined WARP set "OC_H_WARP=not found (warp-cli.exe missing) - rotation disabled"
set "OC_H_VER=%OC_VER%"
set "OC_H_IP=%IP%"
call :tui main
set "TUIRC=%errorlevel%"
if "%TUIRC%"=="20" set "TUI_OK="
if "%TUIRC%"=="20" goto :menu_loop
REM v3.1: Esc (10) on the main menu goes back to the home screen.
if "%TUIRC%"=="10" goto :home_start
REM v3.1 (N02): any other out-of-range code (255/1 when the TUI fails or stdin is closed)
REM returned to :menu_loop with TUI_OK still set and relaunched the TUI in a loop.
if %TUIRC% GTR 9 goto :quit
cmd /c exit %TUIRC%
goto :menu_dispatch
:menu_old_list
call echo %T_56%
echo.
call echo %T_57%
echo.
call echo %T_58%
call echo %T_59%
call echo %T_60%
call echo %T_61%
if /i not "%APP_MODE%"=="DESKTOP" call echo %T_316%
if /i "%APP_MODE%"=="DESKTOP" call echo %T_317%
call echo %T_62%
call echo %T_63%
call echo %T_64%
REM NEW: option 7 is like [5] but leaves the chats where they are.
call echo %T_65%
call echo %T_66%
call echo %T_67%
call echo %T_265%
echo.
call echo %T_6%
echo.
REM Read the menu choice. Highest number is checked first.
call :pick 123456789 "Pick: "
REM v2.36: the text menu numbers its rows differently from the screen menu (which sends 1 7 3 4 9 10 6 8):
REM [2] continue, [4] folder, [5] deep reset, [8] settings, [9] sessions are translated here, not guessed.
if errorlevel 100 goto :quit
if not errorlevel 1 goto :quit
if errorlevel 9 goto :menu_sessions
if errorlevel 8 goto :menu_settings
if errorlevel 7 goto :run_soft
if errorlevel 6 goto :quit
if errorlevel 5 goto :menu_deep
if errorlevel 4 goto :menu_old_4
if errorlevel 3 goto :rotate
if errorlevel 2 goto :run_warm
goto :run_cold
:menu_old_4
if /i "%APP_MODE%"=="DESKTOP" goto :menu_mode
goto :folder
:menu_dispatch
REM choice exits 0 on Ctrl+C: quit cleanly (v2.30), never guess option 1.
REM v2.25: with stdin closed (piped input, EOF) choice answers 255, not 0, and
REM 255 satisfies every "if errorlevel N" below, so the old guard looped here
REM forever through the token-reset prompt. No console to ask: leave.
if errorlevel 100 goto :quit
if not errorlevel 1 goto :quit
REM NEW: 7 is checked first (highest number first).
REM Main menu codes 1 new IP, 7 clear tokens, 3 change IP, 4 deep submenu, 9 mode, 6 exit.
if errorlevel 9 goto :menu_mode
if errorlevel 8 goto :menu_sessions
if errorlevel 7 goto :run_soft
if errorlevel 6 goto :quit
if errorlevel 4 goto :menu_deep
if errorlevel 3 goto :rotate
REM v2.42: code 2 = continue (the text menu sends it too; the screen menu never does).
if errorlevel 2 goto :run_warm
goto :run_cold

REM Option 9 (Sessions): pick a chat from this folder and continue it with --session.
REM The picker writes the id to session_pick.txt; exit 1 = a session was picked. CLI only.
:menu_sessions
set "SESS_PICK=%STATE_DIR%\session_pick.txt"
set "SESS_DIR=%STATE_DIR%\session_dir.txt"
if exist "%SESS_PICK%" del /f /q "%SESS_PICK%" >nul 2>&1
if exist "%SESS_DIR%" del /f /q "%SESS_DIR%" >nul 2>&1
call :tui sessions
set "SESSRC=%errorlevel%"
if not "%SESSRC%"=="1" goto :menu_loop
set "SESSID="
set "SESSDIR="
if exist "%SESS_PICK%" for /f "usebackq delims=" %%s in ("%SESS_PICK%") do set "SESSID=%%s"
if exist "%SESS_DIR%" for /f "usebackq delims=" %%s in ("%SESS_DIR%") do set "SESSDIR=%%s"
if not defined SESSID goto :menu_loop
REM a chat of another folder: work in that folder, like picking it from the folder screen
REM v2.43: every pick pushed one more level and :quit pops only one. The folder must stay for the
REM run (--session and the later --continue are folder-bound), so the previous pushd is popped
REM first: the stack stays at one level and :quit's single popd balances it.
if not defined SESSDIR goto :ms_dir_done
if not exist "%SESSDIR%\" goto :ms_dir_done
if /i "%SESSDIR%"=="%CD%" goto :ms_dir_done
REM v3.1 (N22): the pushd is checked. A failed one leaves POPPED alone (the stack was
REM already popped) and the menu comes back instead of running in the wrong folder.
if defined POPPED popd
pushd "%SESSDIR%" 2>nul || goto :ms_dir_fail
set "POPPED=1"
goto :ms_dir_done
:ms_dir_fail
call echo "  [*] could not open the chat folder: %SESSDIR%"
call :pause_key
goto :menu_loop
:ms_dir_done
if defined SESSDIR call :folder_remember
set "RUNARGS=--session %SESSID%"
set "PIN_SESS=%SESSID%"
set "COLD=0"
goto :run

REM Option 8: the settings screens; WARP_UP=0 re-applies the proxy port on the
REM next pass. Values that a running service cannot change say so in the UI.
:menu_settings
call :pool_start
call :tui settings
call :pool_stop
call :cfg_import
REM v2.44: a new OC_APP or a "Re-detect" in Settings - Paths takes effect now.
if /i "%APP_MODE%"=="DESKTOP" call :find_desktop_app
set "WARP_UP=0"
goto :menu_loop

REM Deep reset or restore chats: its own submenu. 1 = deep reset, 2 = restore.
:menu_deep
call :tui deep
set "DRC=%errorlevel%"
if "%DRC%"=="1" goto :run_deep
if "%DRC%"=="2" goto :restore_chats
if "%DRC%"=="4" goto :menu_clear_lock
if "%DRC%"=="5" goto :menu_drop_resume
if not "%DRC%"=="3" goto :menu_loop
REM v2.44: "Clear cache" on its own: the cache folder only, never auth.json or the chats.
REM v2.39: ask first, like the deep reset does.
call :yn "  Delete the OpenCode cache folder? [Y/N] "
if errorlevel 2 goto :menu_loop
call :clear_cache menu
call :pause_key
goto :menu_loop

REM v2.54: "Discard pending resume" (deep menu): forgets the saved chat; the chat itself is kept.
:menu_drop_resume
del /f /q "%ARF%" >nul 2>&1
call :log "pending resume discarded from the menu" resume
call echo %T_364%
call :pause_key
goto :menu_loop

REM v2.49 (bug 11): "Clear instance lock" removes the single-instance lock; when this window owned it, it takes it again with its own PID.
:menu_clear_lock
set "CL_DIR=%STATE_DIR%"
if defined BASE_STATE set "CL_DIR=%BASE_STATE%"
if exist "%CL_DIR%\lock\" rmdir /s /q "%CL_DIR%\lock" >nul 2>&1
call :log "lock %CL_DIR%\lock cleared from the menu" lock
if not defined LOCK_FOREIGN if defined LOCKDIR call :lk_take
call echo %T_356%
call :pause_key
goto :menu_loop

REM Mode (CLI or Desktop) from the main menu.
:menu_mode
set "MODE_FORCE_ASK=1"
goto :mode_menu

REM Restore chats from an archived deep reset. Auth is not restored.
REM The chats in place now are moved aside to the Desktop, never deleted.
:restore_chats
set "RS_PICK=%STATE_DIR%\restore_pick.txt"
if exist "%RS_PICK%" del /f /q "%RS_PICK%" >nul 2>&1
if not defined DESKTOP call :find_desktop
set "OC_ARCH=%DESKTOP%\opencode_chats_archiviate"
call :tui restore
set "RSRC=%errorlevel%"
if not "%RSRC%"=="1" goto :menu_deep
set "RS_SRC="
if exist "%RS_PICK%" for /f "usebackq delims=" %%s in ("%RS_PICK%") do set "RS_SRC=%%s"
if not defined RS_SRC goto :menu_deep
if not exist "%RS_SRC%\opencode.db" if not exist "%RS_SRC%\storage" (
  call echo %T_270%
  goto :menu_deep
)
echo.
call echo %T_271%
echo     "%RS_SRC%"
call echo %T_272%
echo.
call :yn "  Restore now? [Y/N] "
if errorlevel 2 goto :menu_deep
call :stop_opencode restore-chats
REM v3.1 (N03): an archive that only brings storage keeps the live database. It is
REM copied aside like the rest, never deleted, and the operator is told.
set "RS_NODB="
if not exist "%RS_SRC%\opencode.db" set "RS_NODB=1"
set "RS_KEEP=%DESKTOP%\opencode_chats_before_restore\%RANDOM%%RANDOM%"
if not exist "%RS_KEEP%" mkdir "%RS_KEEP%" >nul 2>&1
if not defined RS_NODB for %%F in (opencode.db opencode.db-wal opencode.db-shm) do if exist "%DATA_DIR%\%%F" move /y "%DATA_DIR%\%%F" "%RS_KEEP%\%%F" >nul
if exist "%DATA_DIR%\storage" robocopy "%DATA_DIR%\storage" "%RS_KEEP%\storage" /e /move /r:1 /w:1 /nfl /ndl /njh /njs /np >nul
REM v3.1 (N23): a failed move leaves the live storage incomplete, so the database is
REM not touched and the restore stops here.
set "RS_ABORT="
if errorlevel 8 set "RS_ABORT=1"
if defined RS_ABORT call echo %T_273%
if defined RS_ABORT goto :menu_deep
REM v2.39: a failed database copy is reported, not announced as restored.
set "RS_FAIL="
for %%F in (opencode.db opencode.db-wal opencode.db-shm) do if exist "%RS_SRC%\%%F" copy /y "%RS_SRC%\%%F" "%DATA_DIR%\%%F" >nul || set "RS_FAIL=1"
if exist "%RS_SRC%\storage" robocopy "%RS_SRC%\storage" "%DATA_DIR%\storage" /e /r:1 /w:1 /nfl /ndl /njh /njs /np >nul
if errorlevel 8 call echo %T_273%
if defined RS_FAIL call echo %T_273%
REM v3.1 (N03): the live database stayed in place because the archive has none.
REM T_270 is not printed here: the archive has no database and the live one is kept.
call echo %T_274%
echo     "%RS_KEEP%"
set "RESUME="
set "COLD=0"
goto :run

REM Option 1 (fresh start): COLD=1 asks for a new IP before launching.
:run_cold
set "COLD=1"
REM NEW: a fresh start forgets the burned proxies.
del /f /q "%STATE_DIR%\proxy_burned.txt" >nul 2>&1
set "PROXY_ROT=0"
set /a QUOTA_STREAK=0
set "LIMIT_SWITCHED="
set "OC_MODEL=%OC_MODEL_CFG%"
goto :run

REM Option 2 (continue): COLD=0 keeps the current IP and session.
:run_warm
set "COLD=0"
goto :run

REM - the discord-style reset: close, archive, wipe tokens, reopen
REM Option 5. Destructive part: asks first, then closes opencode,
REM moves the chats to the Desktop and clears tokens.
:run_deep
echo.
call echo %T_68%
call echo %T_69%
call echo %T_70%
call echo %T_71%
REM v2.44: :stop_opencode closes only what this launcher started (T_72/T_73 say so).
call echo %T_72%
call echo %T_73%
echo.
call :yn "  Do that now? [Y/N] "
if errorlevel 2 goto :menu_loop
call :stop_opencode deep-reset
call :deep_archive
REM v2.44: the deep reset is the explicit "tokens and cache" action (the menu says so).
call :clear_cache deep-reset
call :clear_tokens deep-reset
REM After a reset there is nothing to resume: start cold.
set "RESUME="
set "COLD=1"
goto :run

REM NEW: Option 7 (token reset). Same as option 5 but the chats are NOT moved.
REM Only the token cache is cleared and auth.json is copied to the private backup folder
REM (verified) before it is removed.
:run_soft
echo.
call echo %T_74%
call echo %T_75%
call echo %T_76%
call echo %T_77%
call echo %T_72%
call echo %T_73%
echo.
call :yn "  Do that now? [Y/N] "
if errorlevel 2 goto :menu_loop
call :stop_opencode token-reset
call :soft_target
REM v2.44: token reset = tokens only; the cache is left alone.
call :clear_tokens token-reset
set "RESUME="
set "COLD=1"
goto :run

REM NEW: builds the backup folder for option 7 only. It sets TARGET so
REM :archive_auth works, and never creates the chats folder. TARGET is
REM always recomputed so a value left by an earlier deep reset is not reused.
:soft_target
set "STAMP="
set "OC_OUT=%TEMP%\oc_stm_%RANDOM%.txt"
if exist "%OC_OUT%" del /f /q "%OC_OUT%" >nul 2>&1
set "OC_STM=%OC_OUT%"
"%PSX%" -NoProfile -Command "try{[IO.File]::WriteAllLines($env:OC_STM, (Get-Date -Format yyyyMMdd-HHmmss))}catch{}" >nul 2>&1
if exist "%OC_OUT%" for /f "usebackq delims=" %%T in ("%OC_OUT%") do set "STAMP=%%T"
if exist "%OC_OUT%" del /f /q "%OC_OUT%" >nul 2>&1
if not defined STAMP set "STAMP=r%RANDOM%%RANDOM%"
REM v2.40: the auth.json copy now goes to :archive_auth's private folder, not the Desktop
set "TARGET=%LOCALAPPDATA%\opencode-infinite\backup\auth\%STAMP%"
goto :eof

REM Launch step. Checks the egress first, then starts opencode.
:run
call :token_guard
REM v2.60 (A3): auto skips the start banner; its short messages come from :asay.
if defined OPT_AUTO goto :run_auto
echo.
if not defined OPT_QUIET if "%COLD%"=="1" call echo %T_345%
if not defined OPT_QUIET if not "%COLD%"=="1" call echo %T_346%
if not defined OPT_QUIET echo     "%CD%"
if not defined OPT_QUIET call echo %T_78%

REM never launch through a dead proxy, and never "rotate" into a
REM direct connection: the gate asks instead of leaking silently.
if /i "%EGRESS%"=="NONE" goto :run_noproxy
if /i "%EGRESS%"=="WIREGUARD" goto :run_vpn
if /i "%EGRESS%"=="VPNGATE" goto :run_vpn
if /i "%EGRESS%"=="WARP" if not defined WARP goto :run_noproxy

REM Prepare ACTIVE_PROXY for the chosen mode (process-only).
if /i "%EGRESS%"=="WARP" (
  set "ACTIVE_PROXY=%PROXY%"
  call :export_proxy
  if errorlevel 1 (
    call echo %T_79%
    call echo %T_80%
    REM Default is No (the TUI confirm opens on No). Yes runs on the real IP only with --allow-direct.
    call :yn "   Continue without WARP? [Y/N]: "
    if errorlevel 2 goto :menu_loop
    if not defined ALLOW_DIRECT (
      call :msg %T_WB_REFUSE%
      call :pause_key
      goto :menu_loop
    )
    goto :run_noproxy
  )
  if "%COLD%"=="1" call :ensure_new_ip
  goto :run_gate_ok
)
REM v2.22: TOR and PROXY left the parenthesised block and became labelled
REM steps, so the PROXY branch can test COLD/ACTIVE_PROXY without the
REM parse-time expansion trap those blocks carry.
if /i "%EGRESS%"=="TOR" goto :run_tor
if /i "%EGRESS%"=="PROXY" goto :run_free
goto :run_noproxy

REM - TOR egress: gate first, then hand the bridge to the child
:run_tor
call :tor_gate
if errorlevel 1 goto :run_tor_fail
REM v2.39: a fresh start gets a new circuit (menu text promises a new IP); only a Tor we started can be renewed.
if "%COLD%"=="1" if defined OURTOR call :tor_rotate || call :log "tor rotate on fresh start failed; continuing on the current circuit" run
set "ACTIVE_PROXY=http://127.0.0.1:%TOR_HTTP_PORT%"
call :export_proxy_active
goto :run_gate_ok
:run_tor_fail
call :msg %T_81%
call :yn "   Continue direct? [Y/N]: "
if errorlevel 2 goto :menu_loop
goto :run_noproxy

REM - WIREGUARD egress: wireproxy serves a local proxy that only OpenCode uses. A fresh start always switches;
REM a continue keeps the proxy while it is still running.
:run_vpn
set "ACTIVE_PROXY="
if "%COLD%"=="1" goto :run_vpn_new
call :vpn_run status
if /i not "%VPN_STATUS%"=="OK" goto :run_vpn_new
REM N04: VPNGATE status writes PORT=0 (no local proxy; the tunnel works by routes),
REM so only a real WireGuard port may become ACTIVE_PROXY. Same guard as :vpn_r_ok.
if not "%VPN_PORT%"=="0" set "ACTIVE_PROXY=http://127.0.0.1:%VPN_PORT%"
call :export_proxy_active
goto :run_gate_ok
:run_vpn_new
call :vpn_switch
if errorlevel 1 goto :run_vpn_fail
call :export_proxy_active
goto :run_gate_ok
:run_vpn_fail
call :yn "   Continue direct? [Y/N]: "
if errorlevel 2 goto :menu_loop
goto :run_noproxy

REM - free proxy egress
REM v2.22: [2] Continue used to pick a brand-new free proxy on each :run.
REM With COLD=0 the proxy already in ACTIVE_PROXY is kept; a fresh start
REM or an empty slot picks a new one.
:run_free
if "%COLD%"=="0" if defined ACTIVE_PROXY goto :run_free_keep
:run_free_pick
call :pick_free_proxy
if errorlevel 1 goto :run_free_fail
call :export_proxy_active
goto :run_gate_ok
:run_free_keep
REM v2.22: a kept proxy is checked before it is reused - a dead one falls
REM back to picking a new candidate instead of launching through a corpse.
call :proxy_alive "%ACTIVE_PROXY%"
if errorlevel 1 goto :run_free_pick
call :export_proxy_active
goto :run_gate_ok
:run_free_fail
call :msg %T_82%
call :yn "   Continue direct? [Y/N]: "
if errorlevel 2 goto :menu_loop
goto :run_noproxy

REM Proxy is working: continue with the gate checks.
:run_gate_ok
REM the background service is the process that talks to the API: it
REM must be born with the proxy env.
REM v2.22: the svc_proxied marker restarted it ONCE in the life of the
REM machine, so a service first started direct kept the real IP after
REM WARP/TOR/PROXY was chosen later. The restart now runs whenever the
REM egress URL in use differs from the one it was last restarted on,
REM which covers every mode and every proxy change.
REM v1 has no shared service: skip the restart there.
if not defined CAP_SERVICE goto :run_marked
if not defined ACTIVE_PROXY goto :run_marked
if /i "%ACTIVE_PROXY%"=="%SVC_PROXIED%" goto :run_marked
call "%OC_CMD%" service restart >nul 2>&1
REM v2.56 (N05): the marker only records a restart that returned 0. A failed
REM restart leaves it empty, so the next pass retries instead of trusting the
REM old sockets while the UI claims the new proxy is in use.
set "GATESVC=%ERRORLEVEL%"
if not "%GATESVC%"=="0" goto :run_svc_bad
set "SVC_PROXIED=%ACTIVE_PROXY%"
goto :run_marked
:run_svc_bad
set "SVC_PROXIED="
call :log "service restart failed rc=%GATESVC% proxy=%ACTIVE_PROXY% egress=%EGRESS%" run
:run_marked
REM v2.22: delete the obsolete marker once; nothing reads it anymore.
if exist "%STATE_DIR%\svc_proxied" del /f /q "%STATE_DIR%\svc_proxied" >nul 2>&1
REM v2.23: WARP/TOR/PROXY used to fall straight through into the clearing
REM block below, which wiped the proxy that had just been exported and ran
REM opencode on the real IP. Proxied runs jump over that block now.
goto :run_launch

REM - direct path: NONE, WARP without WARP, or "Continue direct?"
:run_noproxy
REM v2.22: NONE (and the no-WARP fallback) must be direct for the child
REM too: a system-wide HTTP_PROXY used to leak into the "no proxy" mode.
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "no_proxy="
set "ACTIVE_PROXY="
REM v2.23: a v2 service born under a proxy keeps the old tunnel's sockets.
REM Coming back to NONE restarts it once, then forgets the proxy it had.
if not defined SVC_PROXIED goto :run_launch
if defined CAP_SERVICE if defined OC_CMD call "%OC_CMD%" service restart >nul 2>&1
set "SVC_PROXIED="

REM Common launch path, proxied and direct runs alike (v2.23).
:run_launch
if /i "%APP_MODE%"=="DESKTOP" goto :rl_cmd_ok
if defined OC_CMD goto :rl_cmd_ok
echo.
echo   OpenCode not found: install it or set the path in OC_APP ^(config^).
call :pause_key
goto :menu_loop
:rl_cmd_ok
call :auto_resume

REM Remember the log size before launch, so the watcher and the quota
REM check only read what this run writes.
set "SIZE_BEFORE=0"
for %%S in ("%LOGFILE%") do if not "%%~zS"=="" set "SIZE_BEFORE=%%~zS"
REM The log is shared by every OpenCode run, so old limit lines stay in it. Only lines stamped after this start count.
set "OC_T0F=%STATE_DIR%\run_t0.txt" & "%PSX%" -NoProfile -Command "[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss') | Set-Content -LiteralPath $env:OC_T0F -Encoding ASCII" >nul 2>&1
set "OC_T0="
if exist "%STATE_DIR%\run_t0.txt" set /p "OC_T0="<"%STATE_DIR%\run_t0.txt"
REM WHY records the reason the run ended (exit, quota, stop, watcher).
set "WHY="

REM FLAGS gets --continue when resuming the last chat.
set "FLAGS="
set "RL_RENEWED="
if defined RESUME set "RL_RENEWED=1"
REM v2.39: a chat picked in menu [9] stays pinned across rotation/crash resumes (PIN_SESS is cleared in :menu_loop).
if defined RESUME if defined PIN_SESS (set "FLAGS=--session %PIN_SESS%") else (set "FLAGS=--continue")
if defined RESUME call :msg %T_318%
REM v2.36: a fresh start continues the newest chat of the folder while it is still empty, instead of piling up empty chats
if /i "%APP_MODE%"=="DESKTOP" goto :rl_reuse_done
if not "%REUSE_EMPTY%"=="1" goto :rl_reuse_done
if defined RESUME goto :rl_reuse_done
if defined RUNARGS goto :rl_reuse_done
call :chat_run empty
if "%CHAT_EMPTY%"=="1" set "FLAGS=--continue"
:rl_reuse_done
REM v2.36: what was typed while the IP was being renewed goes into the prompt of the reopened opencode
set "OC_PROMPT="
if not defined RL_RENEWED goto :rl_typed_done
if /i "%APP_MODE%"=="DESKTOP" goto :rl_typed_done
if not "%TYPE_AHEAD%"=="1" goto :rl_typed_done
call :chat_run typed
if defined CHAT_TYPED set "OC_PROMPT=%CHAT_TYPED%"
if defined CHAT_TYPED call :msg %T_304%
:rl_typed_done
set "RESUME="
if defined RUNARGS set "FLAGS=%FLAGS% %RUNARGS%"
set "RUNARGS="

REM Start the watcher, open the TUI, and stop the watcher when it closes.
call :watch_start
call :log "starting opencode: %OC_CMD% mode=%APP_MODE% egress=%EGRESS% cold=%COLD% continue=%FLAGS%" run
REM v2.60 (A2): remember the connection that opened OpenCode; "Start again" and --auto reuse it.
if defined EGRESS (> "%STATE_DIR%\last_method.txt" <nul set /p "=%EGRESS%")
REM v2.60 (A3): auto says it once, and from now on a failure resumes this chat instead of starting over.
if defined OPT_AUTO set "AUTO_FAILS=0"
if defined OPT_AUTO set "AUTO_GIVEUPS=0"
if defined OPT_AUTO call :asay "OpenCode open"
if defined OPT_AUTO set "AUTO_STARTED=1"
REM v2.43: a resumed chat (--continue / --session) logs its egress facts too; the typed prompt is not logged.
if defined FLAGS call :resume_facts
if defined FLAGS call :log "resume tui: flags=%FLAGS% ip=%IP% proxy=%RPX% svc=%SVC_PROXIED% auth=%RAUTH%" run
set "EC="
call :launch
REM v2.22: the TUI exit code is taken right after the launch. :launch stores
REM it in EC itself and the fallback read covers a build where it did not.
REM The old capture sat after :watch_stop, whose taskkill overwrote
REM errorlevel, so a crashed TUI was reported as a clean exit.
if not defined EC set "EC=%errorlevel%"
set "OC_PROMPT="
call :log "opencode exited code %EC% egress=%EGRESS%" run
call :watch_stop
REM v2.36: drop the terminal replies and keys left over from the TUI, so only what is typed from now on is kept
if "%TYPE_AHEAD%"=="1" call :flush_keys
REM v2.22: restore the user's own proxy variables instead of deleting them.
call :restore_env
REM v2.22: the watcher can flag a dead proxy/tunnel while the TUI is open
REM (WARP/TOR/PROXY). It never kills the TUI; the note is shown here.
if not exist "%STATE_DIR%\proxy_warn.txt" goto :run_warn_done
echo.
call :msg %T_83%
call :msg %T_84%
>"%STATE_DIR%\renew_needed.txt" echo the egress proxy stopped answering
call :log "the egress proxy stopped answering while opencode was open" rotate
del /f /q "%STATE_DIR%\proxy_warn.txt" >nul 2>&1
:run_warn_done
echo.

REM the watcher firing outranks the exit code: a killed TUI exits
REM nonzero, but the marker tells us WHY and where to go.
REM If the watcher left a hit marker, it killed the TUI because of a fatal error.
if not exist "%STATE_DIR%\watch_hit.txt" goto :run_no_hit
del /f /q "%STATE_DIR%\watch_hit.txt" >nul 2>&1
call :msg %T_85%
set "WHY=watcher"
goto :quota_rotate
REM No watcher hit. A nonzero exit code means opencode crashed.
:run_no_hit
REM 9009 = the launch guard found no opencode: rotating the IP cannot fix that.
if "%EC%"=="9009" goto :menu_loop
REM v2.44: a rate limit (ask= line) seen by the watcher: ask now, never rotate on our own.
REM v2.60 (A3): auto never asks: a rate limit rotates the IP at once.
REM Only a rate-limit line the watcher saw rotates here. A plain exit (code 0, you closed OpenCode) must not rotate.
if defined OPT_AUTO if exist "%STATE_DIR%\watch_ask.txt" (
  del /f /q "%STATE_DIR%\watch_ask.txt" >nul 2>&1
  set "WHY=ratelimit"
  goto :quota_rotate
)
if exist "%STATE_DIR%\watch_ask.txt" goto :rl_ask
REM v2.42: a clean exit resets the crash streak. A crash retries on the same egress first (:crash_retry).
if "%EC%"=="0" set "CRASH_STREAK=0"
set "CRASH_RETRY="
set "CRASH_STOP="
if not "%EC%"=="0" call :crash_retry
if defined CRASH_STOP goto :menu_loop
if defined CRASH_RETRY goto :run
REM NONE (or WARP mode without WARP) has no egress to retry: menu.
if /i "%EGRESS%"=="NONE" goto :closed
if /i "%EGRESS%"=="WARP" if not defined WARP goto :closed
if not "%EC%"=="0" goto :exit_rotate
REM A clean exit: check the log for a quota message before deciding.
call :check_quota
if defined QHIT set "WHY=quota"
if defined QHIT goto :quota_rotate
if defined QASK goto :rl_ask
goto :closed

REM v2.44: rate limit: one question at most every 10 minutes (stamp file), 60 s, default No.
:rl_ask
if exist "%STATE_DIR%\watch_ask.txt" del /f /q "%STATE_DIR%\watch_ask.txt" >nul 2>&1
REM v2.60 (A3): same for the check_quota path.
if defined OPT_AUTO (set "WHY=ratelimit" & goto :quota_rotate)
set "OC_ASKT=%STATE_DIR%\ratelimit_ask.txt"
"%PSX%" -NoProfile -Command "try{ if((Test-Path -LiteralPath $env:OC_ASKT) -and (((Get-Date)-(Get-Item -LiteralPath $env:OC_ASKT).LastWriteTime).TotalMinutes -lt 10)){ exit 1 }; Set-Content -LiteralPath $env:OC_ASKT -Value (Get-Date -Format o); exit 0 }catch{ exit 0 }" >nul 2>&1
if not errorlevel 1 goto :rl_ask_now
call :log "category=ask action=none reason=asked less than 10 min ago" rotate
goto :closed
:rl_ask_now
call :flush_keys
choice /t 60 /c YN /d N /m "Rate limit detected. Rotate the IP now?"
if errorlevel 2 goto :rl_ask_no
if not errorlevel 1 goto :rl_ask_no
call :log "category=ask action=rotate reason=user said yes" rotate
set "WHY=ratelimit"
goto :quota_rotate
:rl_ask_no
call :log "category=ask action=none reason=user said no or timed out" rotate

REM Normal close: R/M/Q, or quit at once when ON_CLOSE=quit.
:closed
REM v3.1 (D07): a clean preset close prints nothing and returns opencode's own code.
if defined PRESET_MODE goto :closed_preset
REM v2.60 (A3): in auto a normal close ends the launcher, no R/M/Q question.
if defined OPT_AUTO goto :quit
call :msg %T_86%
set /a QUOTA_STREAK=0
if /i "%ON_CLOSE%"=="quit" goto :quit
if /i "%EGRESS%"=="NONE" goto :menu_loop
if /i "%EGRESS%"=="WARP" if not defined WARP goto :menu_loop
echo.
call :msg %T_87%
REM v2.30: no timeout and no default: the prompt waits for a deliberate key.
call :flush_keys
call :pick %KEY_ROTATE%%KEY_MENU%%KEY_QUIT% "Pick: "
if errorlevel 3 goto :quit
if errorlevel 2 goto :menu_loop
if errorlevel 1 (
    set "WHY=stop"
    goto :quota_rotate
)
REM errorlevel 0 is Ctrl+C
goto :quit
:closed_preset
set /a QUOTA_STREAK=0
if /i "%EGRESS%"=="NONE" goto :run_no_egress
if /i "%EGRESS%"=="WARP" if not defined WARP goto :run_no_egress
set "PCODE=%EC%"
if not defined PCODE set "PCODE=0"
set "PMSG="
goto :preset_exit
:run_no_egress
if not defined PRESET_MODE goto :menu_loop
set "PCODE=3"
set "PMSG=%EGRESS% is not available"
goto :preset_exit
REM v3.1 (D07): the only exit of a preset. One line, the code and the log path;
REM T_377-T_382 take these texts over when D15 lands. The lock, the folder and the
REM environment are released here, which is what :quit would have done.
:preset_exit
set /a QUOTA_STREAK=0
call :log "preset code=%PCODE% %PMSG%" boot
REM v2.60 (D15): one line per preset failure, with the reason, the code and the
REM log path. The raw warp-cli, where and PowerShell output stays in wcli.log,
REM launcher.log and the other logs, never on the console.
if not "%PCODE%"=="0" goto :preset_say
goto :preset_clean
:preset_say
set "PTXT=%T_378%"
if defined PMSG set "PTXT=%T_377%"
if "%PCODE%"=="3" set "PTXT=%T_379%"
if "%PCODE%"=="9009" set "PTXT=%T_380%"
REM After v2.60.1: echo, not :msg. The shims always pass --quiet and :msg prints nothing in quiet mode, so a failed preset was silent.
call echo %PTXT%
:preset_clean
call :restore_env
call :watch_stop
if defined POPPED popd
if exist "%STATE_DIR%\lock\" rmdir /s /q "%STATE_DIR%\lock" >nul 2>&1
if defined OC_OLDCP chcp %OC_OLDCP% >nul 2>&1
endlocal & exit /b %PCODE%

REM v2.30: drops the keys already waiting in the console. Keys typed inside opencode,
REM and the terminal's replies to its queries (a cursor report ends in R), would pick
REM an option at the prompt. The wait lets the late replies arrive first.
:flush_keys
"%PSX%" -NoProfile -Command "try { for ($i = 0; $i -lt 2; $i++) { Start-Sleep -Milliseconds 300; while ([Console]::KeyAvailable) { [void][Console]::ReadKey($true) } } } catch { }" >nul 2>&1
exit /b 0

REM v2.30: one key, no Enter, read by PowerShell instead of choice. Ctrl+C reaches
REM PowerShell as a key, so cmd never raises its "Terminate batch job" prompt.
REM usage: call :pick KEYS "prompt" [seconds default_index]. Result in errorlevel:
REM 1-based index of the key, 0 = Ctrl+C, 255 = no console (stdin closed).
:pick
if "%~2"=="Pick: " (<nul call set /p "=%%T_344%%") else (<nul set /p "=%~2")
set "OC_KEYS=%~1"
set "OC_TMO=%~3"
set "OC_DEF=%~4"
"%PSX%" -NoProfile -Command "$prev=$null; try{ $prev=[Console]::TreatControlCAsInput; [Console]::TreatControlCAsInput=$true; $k=$env:OC_KEYS.ToUpper(); $dl=$null; if($env:OC_TMO){ $dl=(Get-Date).AddSeconds([int]$env:OC_TMO) }; $rc=255; while($true){ if($dl -and -not [Console]::KeyAvailable){ if((Get-Date) -gt $dl){ $rc=[int]$env:OC_DEF; break }; Start-Sleep -Milliseconds 80; continue }; $ki=[Console]::ReadKey($true); if($ki.Key -eq 'C' -and ($ki.Modifiers -band [ConsoleModifiers]::Control)){ $rc=0; break }; $i=$k.IndexOf($ki.KeyChar.ToString().ToUpper()); if($i -ge 0){ $rc=$i+1; break } }; [Console]::TreatControlCAsInput=$prev; exit $rc }catch{ try{ [Console]::TreatControlCAsInput=$prev }catch{}; exit 255 }" 
set "PKRC=%errorlevel%"
echo.
exit /b %PKRC%

REM v2.30: "Press any key" for pause. Ctrl+C here is only a key, it does not quit.
:pause_key
call :msg %T_88%
"%PSX%" -NoProfile -Command "$prev=$null; try{ $prev=[Console]::TreatControlCAsInput; [Console]::TreatControlCAsInput=$true; [void][Console]::ReadKey($true); [Console]::TreatControlCAsInput=$prev }catch{ try{ [Console]::TreatControlCAsInput=$prev }catch{} }" >nul 2>&1
echo.
exit /b 0

REM v2.30: launcher version of a copy, from its header line "(v2.30)". Result in %2.
:launcher_ver
set "%~2="
for /f "tokens=2 delims=()" %%v in ('findstr /b /c:"REM  OpenCode launcher  (v" "%~1" 2^>nul') do set "%~2=%%v"
exit /b 0


REM opencode exited with a nonzero code and the watcher did not catch it.
REM v2.42: a crash (nonzero exit, no limit and no watcher) first relaunches on the SAME egress
REM after a short backoff; the chat resumes with --continue. More than 2 crashes within 10
REM minutes stop the launcher instead of restarting OpenCode in a loop. Limits and the
REM watcher still rotate the IP as before.
:crash_retry
call :nowsecs
set "CRASH_NOW=%NOWS%"
if defined CRASH_LAST_S call :crash_age
set "CRASH_LAST_S=%CRASH_NOW%"
set /a CRASH_STREAK+=1
call :log "opencode crashed: code %EC% streak %CRASH_STREAK% egress=%EGRESS%" run
if %CRASH_STREAK% GTR 2 goto :crash_stop
if /i "%EGRESS%"=="NONE" goto :eof
set /a CRASH_WAIT=CRASH_STREAK*2
call :msg %T_350%
timeout /t %CRASH_WAIT% /nobreak >nul 2>&1
set "RESUME=1"
set "COLD=0"
set "CRASH_RETRY=1"
goto :eof
:crash_stop
REM v2.60 (A3): auto does not stop on a crash streak: it clears it and the caller rotates the IP (:exit_rotate).
if defined OPT_AUTO (set "CRASH_STREAK=0" & goto :eof)
set "CRASH_STOP=1"
call echo %T_349%
call :pause_key
goto :eof
:crash_age
set /a CRASH_AGE=CRASH_NOW-CRASH_LAST_S
if %CRASH_AGE% LSS 0 set /a CRASH_AGE+=86400
if %CRASH_AGE% GTR 600 set "CRASH_STREAK=0"
goto :eof
:exit_rotate
set "WHY=exit"

REM Common exit path for the egress retry. WHY is one of: exit, quota, stop, watcher.
REM Only the message for the current WHY value is shown.
:quota_rotate
call :log "rotating: reason=%WHY% egress=%EGRESS% opencode-exit=%EC%" rotate
call :chat_snapshot
call :ar_mark
REM v2.45: QUOTA_STREAK is set only by a fresh start and by a clean close. A resume (continue)
REM or a watcher hit reached the next line with it empty, and then "if %QUOTA_STREAK% GTR ..."
REM is a syntax error that closes the window ("3 was unexpected at this time.").
if not defined QUOTA_STREAK set "QUOTA_STREAK=0"
if not defined LIMIT_ROT_MAX set "LIMIT_ROT_MAX=3"
REM v2.44 anti-loop cap (5 rotations in 30 minutes) removed: keep trying until a usable IP appears; Exit stops it.
:qr_guard_ok
if "%WHY%"=="quota" set /a QUOTA_STREAK+=1
REM LIMIT_ROT_MAX=0 means never stop (the user chose it in Settings)
if not "%LIMIT_ROT_MAX%"=="0" if "%WHY%"=="quota" if %QUOTA_STREAK% GTR %LIMIT_ROT_MAX% goto :limit_action
REM v3.4: --auto prints one line, "Changing IP...", whatever the reason. The reason is in launcher.log (rotating: reason=...).
if defined OPT_AUTO call :asay "%T_CHGIP%"
if not defined OPT_AUTO if "%WHY%"=="exit" call echo %T_319%
if not defined OPT_AUTO if "%WHY%"=="quota" call echo %T_320%
if not defined OPT_AUTO if "%WHY%"=="stop" call echo %T_321%
if not defined OPT_AUTO if "%WHY%"=="watcher" call echo %T_322%
if not defined OPT_AUTO if "%WHY%"=="geo" call echo %T_GEO%
if not defined OPT_AUTO if "%TYPE_AHEAD%"=="1" if /i not "%APP_MODE%"=="DESKTOP" call echo %T_303%

REM Non-WARP modes: pick a new free proxy or just resume on TOR/NONE.
REM NEW: PROXY used to pick the SAME first live proxy every time and loop
REM forever. Now the proxy that just hit the limit is remembered (burned),
REM skipped by the next pick, and the attempts are bounded.
if /i "%EGRESS%"=="PROXY" goto :qr_proxy
if /i "%EGRESS%"=="WIREGUARD" goto :qr_vpn
if /i "%EGRESS%"=="VPNGATE" goto :qr_vpn
REM v2.22: TOR used to resume on the SAME circuit forever: a burned exit
REM node hit the limit, the gate passed, and the resume met the same limit
REM again with no way out. The circuit is now renewed for real (restart of
REM the launcher-managed Tor) with a bounded attempt counter.
if /i not "%EGRESS%"=="TOR" goto :qr_after_tor
set /a TOR_TRIES+=1
if %TOR_TRIES% GTR %ROTATE_TRIES_MAX% goto :tor_exhausted
call echo %T_89%
call :tor_rotate
if errorlevel 1 goto :tor_rotate_fail
call :tor_gate
if errorlevel 1 goto :tor_rotate_fail
call echo %T_90%
set "RESUME=1"
set "COLD=0"
goto :resume_and_run
:tor_rotate_fail
REM v2.60 (A3): auto never pauses on a failed Tor renewal.
if defined OPT_AUTO goto :auto_giveup
call echo %T_91%
call :pause_key
goto :menu_loop
:tor_exhausted
REM v2.60 (A3): auto does not stop here.
if defined OPT_AUTO goto :auto_giveup
call echo %T_92%
call echo %T_93%
call echo %T_94%
set /a TOR_TRIES=0
>"%STATE_DIR%\renew_needed.txt" echo Tor could not get a usable circuit
call :log "Tor could not get a usable circuit" rotate
call :pause_key
goto :menu_loop
REM v2.36: the free limit came back LIMIT_ROT_MAX times in a row. rotate / ask: stop and let the user decide.
REM provider: the resume switches to LIMIT_MODEL once; if the limit still comes back, stop.
:limit_action
call echo %T_300%
set /a QUOTA_STREAK=0
if /i not "%LIMIT_ACTION%"=="provider" goto :limit_stop
if not defined LIMIT_MODEL goto :limit_stop
if defined LIMIT_SWITCHED goto :limit_stop2
set "LIMIT_SWITCHED=1"
set "OC_MODEL=%LIMIT_MODEL%"
call echo %T_301%
call :log "limit loop: the resume switches to model %OC_MODEL%" rotate
set "RESUME=1"
set "COLD=0"
goto :resume_and_run
:limit_stop2
call echo %T_308%
:limit_stop
>"%STATE_DIR%\renew_needed.txt" echo the free limit keeps coming back
call :log "limit loop stopped" rotate
goto :rotate_ask
REM v2.37: tunnel egress. One switch already walks through every usable .conf, so the counter here
REM only bounds the "switch, resume, limit again" cycle. A good resume clears it.
:qr_vpn
set /a VPN_TRIES+=1
if %VPN_TRIES% GTR %ROTATE_TRIES_MAX% goto :vpn_exhausted
call echo %T_294%
call :vpn_switch
if errorlevel 1 goto :vpn_exhausted
set "RESUME=1"
set "COLD=0"
goto :resume_and_run
:vpn_exhausted
set /a VPN_TRIES=0
call echo %T_295%
>"%STATE_DIR%\renew_needed.txt" echo no tunnel gave a usable IP
call :log "vpn rotation exhausted" rotate
goto :rotate_ask
:qr_proxy
if defined ACTIVE_PROXY >>"%STATE_DIR%\proxy_burned.txt" echo %ACTIVE_PROXY%
set /a PROXY_ROT+=1
if %PROXY_ROT% GTR %PROXY_ROT_MAX% goto :proxy_exhausted
call echo %T_95%
call echo %T_96%
call :pick_free_proxy
if errorlevel 1 goto :proxy_exhausted
set "RESUME=1"
set "COLD=0"
goto :resume_and_run
:proxy_exhausted
REM v2.60 (A3): auto does not ask to switch to Tor: it moves on by itself.
if defined OPT_AUTO goto :auto_giveup
call echo %T_97%
call echo %T_98%
call :yn "   Switch to Tor and keep going? [Y/N]: "
if errorlevel 2 goto :proxy_exhausted_menu
set "EGRESS=TOR"
set "WARP="
set "TOR_TRIES=0"
set "PROXY_ROT=0"
set "ACTIVE_PROXY=http://127.0.0.1:%TOR_HTTP_PORT%"
call :tor_gate
if errorlevel 1 goto :tor_rotate_fail
set "RESUME=1"
set "COLD=0"
goto :resume_and_run
:proxy_exhausted_menu
>"%STATE_DIR%\renew_needed.txt" echo no free proxy still works
call :log "no free proxy still works" rotate
set "PROXY_ROT=0"
call :pause_key
goto :menu_loop
:qr_after_tor
if /i "%EGRESS%"=="NONE" goto :menu_loop
if not defined WARP goto :menu_loop
REM R at the closed prompt (WHY=stop) is an explicit request: it always rotates.
if "%AUTO_ROTATE%"=="0" if not "%WHY%"=="stop" (
    call echo %T_99%
    goto :menu_loop
)
call echo %T_100%
timeout /t 3 /nobreak >nul 2>&1

REM ============================================================
REM  3b) ROTATION + PROBE + RESUME
REM ============================================================
REM Automatic rotation: a hunt for an IP that matches the target. TARGET_COUNTRY
REM and TARGET_PREFIX are both checked; both empty = any new IP. The hunt stops on
REM a match, the attempt cap (TARGET_TRIES), the time cap (TARGET_MINUTES), the
REM burned-IP cap (IP_FIND_MAX), or Esc / Q at the wait (Ctrl+C quits).
REM ROTATE_TRIES counts the registrations of this hunt, probe misses included.
:auto_rotate
set /a ROTATE_TRIES=0
set /a PROBE_TRIES=0
set "PBROKEN=0"
set "HUNT_SEEN="
REM v3.4: the first new IP is compared with the IP the hunt leaves. After a watcher hit that IP is
REM often still empty or "unknown" (only a manual start sets it), so read the live one first.
echo %IP%| findstr /r /c:"^[0-9a-fA-F:.][0-9a-fA-F:.]*$" >nul
set "TW_PREV=%TUNNEL_WAIT%"
if errorlevel 1 (
    set "TUNNEL_WAIT=10"
    call :warp_poll BASEIP BASEFLAG
    set "TUNNEL_WAIT=%TW_PREV%"
    if defined BASEIP set "IP=%BASEIP%"
)
call set "HUNT_GOAL=%T_340%"
if defined TARGET_PREFIX call set "HUNT_GOAL=%T_341%"
if defined TARGET_COUNTRY call set "HUNT_GOAL=%T_342%"
if defined TARGET_COUNTRY if defined TARGET_PREFIX call set "HUNT_GOAL=%T_343%"
set /a HUNT_LIM=TARGET_MINUTES*60
call :nowsecs
set "HUNT_START=%NOWS%"
call :flush_keys
if not defined OPT_AUTO call echo %T_101%
:rotate_loop
if %ROTATE_TRIES% GEQ %TARGET_TRIES% (
    set "HUNT_WHY=tries"
    goto :rotate_fail
)
call :hunt_clock
if %HUNT_EL% GEQ %HUNT_LIM% (
    set "HUNT_WHY=time"
    goto :rotate_fail
)
set /a ROTATE_TRIES+=1
REM v2.60 (N89): this hunt drops the registration at most once. A new registration on
REM every retry restarts the MASQUE handshake from zero with the same short deadline,
REM so the tunnel never gets to finish connecting.
if %ROTATE_TRIES% EQU 1 (
    set "HUNT_DROP="
    set "HUNT_TRACE="
    REM v3.5: the first try follows a limit on the current IP, so it always takes a new registration.
    set "HUNT_FORCE=1"
)
REM v3.5: a retry after a same or already judged IP needs a new registration. Reconnecting alone keeps the same exit IP.
set "HUNT_NEED_IP="
if defined HUNT_FORCE set "HUNT_NEED_IP=1"
set "HUNT_FORCE="
if defined HUNT_NEED_IP goto :rot_drop
if defined HUNT_DROP goto :rot_reconnect
if defined HUNT_TRACE goto :rot_drop
REM v2.60 (N89): bounded status before any drop. Connected or Connecting means the tunnel
REM is still coming up: nothing is deleted, TARGET_INTERVAL is waited and only the trace
REM is repeated.
set "OC_RSF=%TEMP%\oc_wst_%RANDOM%%RANDOM%.txt"
set "OC_RSF_TO=%WARP_CALL_TIMEOUT%"
"%PSX%" -NoProfile -Command "try{ $p=Start-Process -FilePath $env:WARP -ArgumentList @('--accept-tos','status') -NoNewWindow -PassThru -RedirectStandardOutput $env:OC_RSF -RedirectStandardError ($env:OC_RSF+'.err') }catch{ exit 1 }; if(-not $p){ exit 1 }; $null=$p.Handle; if(-not $p.WaitForExit([int]$env:OC_RSF_TO*1000)){ Start-Process taskkill.exe -ArgumentList @('/T','/F','/PID',$p.Id) -WindowStyle Hidden -Wait; exit 124 }; exit 0" >nul 2>&1
set "WST_UP="
findstr /i /b /c:"Status update: Connected" "%OC_RSF%" >nul 2>&1
if not errorlevel 1 set "WST_UP=1"
findstr /i /b /c:"Status update: Connecting" "%OC_RSF%" >nul 2>&1
if not errorlevel 1 set "WST_UP=1"
del /f /q "%OC_RSF%" "%OC_RSF%.err" >nul 2>&1
if defined WST_UP (
    set "HUNT_TRACE=1"
    goto :rot_wait
)
:rot_drop
REM Drop the current WARP connection and its registration.
if not defined OPT_AUTO call echo %T_102%
call :reg_drop
set "HUNT_DROP=1"
REM A new registration gets a new exit IP from Cloudflare.
if not defined OPT_AUTO call echo %T_103%
call :reg_new
if "%REGNEW%"=="0" if not defined OPT_AUTO call echo %T_323%
if not defined OPT_AUTO call echo %T_104%
call :warp_up
set "WARP_UP=1"
goto :rot_wait
:rot_reconnect
REM v2.60 (N89): later retries keep the registration: connect only, no registration new.
if not defined OPT_AUTO call echo %T_104%
call :wcli connect
if errorlevel 1 call :log "rotation reconnect failed rc=%WCLIRC%" rotate
set "WARP_UP=1"
:rot_wait
if not defined OPT_AUTO call echo %T_105%
REM v2.60 (N89): the pause moved here, after connect, so TARGET_INTERVAL is time the
REM tunnel gets to finish its handshake instead of a wait before its delete.
REM v3.4: --auto pauses 3 s only: the trace poll below already waits for the tunnel.
set "PAUSE_S=%TARGET_INTERVAL%"
if defined OPT_AUTO set "PAUSE_S=3"
if %PAUSE_S% GTR 0 (
    call :napkey %PAUSE_S%
    if errorlevel 2 goto :quit
    if errorlevel 1 goto :hunt_stop
)
REM v2.43: poll the IP every second (up to WARP_WAIT) instead of a fixed sleep.
REM an IP counts only when the trace came back through the proxy AND
REM says warp=on. anything else is a retry, never a silent launch.
call :warp_poll IPN WFLAG
REM v2.43: compare by :ipkey (IPv6 = same /64 counts as the same IP) and log old/new/try/time/reason.
call :ipkey IPNK "%IPN%"
call :ipkey IPK "%IP%"
set "RWHY=new"
if not defined IPN set "RWHY=no warp answer"
if defined IPN if "%IPNK%"=="%IPK%" set "RWHY=same ip or /64"
call :log "rotation try %ROTATE_TRIES%: old=%IP% new=%IPN% wait=%WP_SECS%s result=%RWHY%" rotate
if not defined IPN goto :rotate_retry
if not "%WFLAG%"=="on" goto :rotate_retry
REM An IP equal to the previous one does not count: retry for a new one.
if "%IPNK%"=="%IPK%" set "HUNT_FORCE=1"
if "%IPNK%"=="%IPK%" goto :rotate_retry
REM An IP already judged in this hunt does not count again.
echo ;%HUNT_SEEN%;| findstr /l /c:";%IPNK%;" >nul
if not errorlevel 1 (
    if not defined OPT_AUTO call echo %T_106%
    set "HUNT_FORCE=1"
    goto :rotate_loop
)
set "HUNT_SEEN=%HUNT_SEEN%;%IPNK%;"
REM v3.4: after "model not available in your country", an IP from that same country is skipped. Any other country counts.
if defined HUNT_AVOID if /i "%GLOC%"=="%HUNT_AVOID%" set "HUNT_FORCE=1"
if defined HUNT_AVOID if /i "%GLOC%"=="%HUNT_AVOID%" goto :rotate_loop
call :target_ok
set /a HUNT_LEFT=TARGET_TRIES-ROTATE_TRIES
if not defined OPT_AUTO call echo %T_107%
if "%TMATCH%"=="0" goto :rotate_loop

REM probe: one cheap message on the throwaway session. burned IP ->
REM rotate again. With PROBE=0 the probe is skipped and the IP is accepted directly.
if "%PROBE%"=="0" goto :rotate_good
REM v2.40: Desktop mode without the CLI has nothing to probe with.
if not defined OC_CMD goto :rotate_good
if not defined OPT_AUTO call echo %T_108%
call :probe_once
if not errorlevel 1 goto :rotate_good
REM Classify the miss: only a limit-shaped answer marks the IP burned.
REM Anything else is a broken probe (retired model id, auth, a CLI
REM change), and no amount of IP rotation fixes that.
REM v2.22: a probe session the CLI refuses is its own case and never
REM counts as a burned IP.
if /i "%PCLASS%"=="nosession" goto :probe_no_session
if /i not "%PCLASS%"=="broken" goto :probe_miss_burned
set /a PBROKEN+=1
if not defined OPT_AUTO call echo %T_109%
call :probe_print
if %PBROKEN% GEQ %PROBE_BROKEN_MAX% goto :probe_broken_stop
goto :rotate_loop
:probe_miss_burned
REM The probe hit the limit on this fresh IP: the IP is burned. The attempt
REM still counts toward the hunt's cap; burned IPs have their own cap.
set "PBROKEN=0"
set /a PROBE_TRIES+=1
REM IP_FIND_MAX=0 means no limit on burned IPs. Otherwise stop after the limit.
if "%IP_FIND_MAX%"=="0" goto :probe_endless
if %PROBE_TRIES% GTR %IP_FIND_MAX% goto :probe_exhausted
:probe_endless
if not defined OPT_AUTO call echo %T_110%
goto :rotate_loop
:probe_exhausted
echo.
if not defined OPT_AUTO call echo %T_111%
set "HUNT_WHY=burned"
goto :rotate_fail
:probe_broken_stop
REM v2.60 (A3): auto accepts IPs untested instead of asking.
if defined OPT_AUTO (set "PROBE=0" & set "PBROKEN=0" & goto :rotate_loop)
echo.
if not defined OPT_AUTO call echo %T_112%
if not defined OPT_AUTO call echo %T_113%
if not defined OPT_AUTO call echo %T_114%
if not defined OPT_AUTO call echo %T_115%
if not defined OPT_AUTO call echo %T_116%
call :yn "   Continue WITHOUT the probe this session (IPs accepted untested)? [Y/N]: "
if errorlevel 2 goto :pbs_quit
if not defined OPT_AUTO call echo %T_117%
if not defined OPT_AUTO call echo %T_118%
set "PROBE=0"
set "PBROKEN=0"
goto :rotate_loop
:pbs_quit
call "%OC_CMD%" session delete %OC_PROBE_ID% >nul 2>&1
call :pause_key
goto :menu_loop

REM v2.22 (defensive, unverified against real CLI behaviour): nothing here
REM creates the fixed probe session, so a build that REFUSES an unknown
REM "-s <id>" would fail the probe for every IP. That must never read as
REM "all IPs burned": the probe is switched off for this session, the
REM current IP is kept, and the reason is printed in plain text.
:probe_no_session
echo.
if not defined OPT_AUTO call echo %T_119%
if not defined OPT_AUTO call echo %T_120%
if not defined OPT_AUTO call echo %T_121%
if not defined OPT_AUTO call echo %T_122%
if not defined OPT_AUTO call echo %T_123%
if not defined OPT_AUTO call echo %T_124%
if not defined OPT_AUTO call echo %T_125%
set "PROBE=0"
set "PBROKEN=0"
REM v2.23: the IP itself was fine, only the probe could not run. Rotating
REM again burned a fresh Cloudflare registration for nothing; accept this
REM IP and resume.
goto :rotate_good

REM A verified IP that passed the probe: save it, mark the resume, and resume the chat.
:rotate_good
if not defined OPT_AUTO call echo %T_126%
set "HUNT_WHY=success"
call :hunt_summary
call :log "rotation ok: new IP verified on try %ROTATE_TRIES%" rotate
if exist "%STATE_DIR%\renew_needed.txt" del /f /q "%STATE_DIR%\renew_needed.txt" >nul 2>&1
set "PBROKEN=0"
>"%STATE_DIR%\lastip.txt" echo %IPN%
set "IP=%IPN%"
set "HUNT_AVOID="
set "RESUME=1"
set "COLD=0"
REM the background service holds sockets from the old tunnel, and its env
REM was captured before this rotation: restart it so the next TUI is born
REM on this exit IP. this runs on every rotation, not once per machine.
REM v2.25: the restart used to run on the user's own env (the probe had just
REM restored it), so the new service was born DIRECT and every later request
REM left on the real IP. The WARP proxy env is exported around it now.
if not defined CAP_SERVICE goto :rg_svc_done
if not defined OC_CMD goto :rg_svc_done
call :export_proxy
call "%OC_CMD%" service restart >nul 2>&1
set "RGSVC=%ERRORLEVEL%"
call :restore_env
REM v2.56 (N05): mark only a clean restart; otherwise forget the marker so the
REM next gate pass restarts again instead of running on the old tunnel.
if not "%RGSVC%"=="0" goto :rg_svc_bad
if defined ACTIVE_PROXY set "SVC_PROXIED=%ACTIVE_PROXY%"
goto :rg_svc_done
:rg_svc_bad
set "SVC_PROXIED="
call :log "service restart failed after rotation rc=%RGSVC% proxy=%ACTIVE_PROXY%" rotate
:rg_svc_done
goto :resume_and_run

REM Not a usable IP yet (no answer, or WARP not on): try again.
:rotate_retry
if not defined OPT_AUTO call echo %T_127%
goto :rotate_loop

REM v2.60 (N90): the hunt is over, but the last tunnel may still be coming up. One last
REM full poll before giving up: a cold MASQUE start can answer after the attempt cap, and
REM that IP is the one the operator wanted.
:rotate_fail
if not defined OPT_AUTO call echo %T_105%
call :warp_poll IPN WFLAG
call :ipkey IPNK "%IPN%"
call :ipkey IPK "%IP%"
set "RWHY=last poll: no warp answer"
if defined IPN set "RWHY=last poll: same ip or /64"
if defined IPN if /i "%WFLAG%"=="on" if not "%IPNK%"=="%IPK%" set "RWHY=last poll: new ip"
call :log "rotation last poll: old=%IP% new=%IPN% wait=%WP_SECS%s result=%RWHY%" rotate
if not defined IPN goto :rf_summary
if /i not "%WFLAG%"=="on" goto :rf_summary
if "%IPNK%"=="%IPK%" goto :rf_summary
REM The tunnel came up after the cap: keep this IP instead of losing it.
call :log "rotation ok: last tunnel adopted on try %ROTATE_TRIES%" rotate
goto :rotate_good
:rf_summary
call :hunt_summary
goto :rotate_pause
:rotate_pause
REM never leave the probe session behind as the last session
call "%OC_CMD%" session delete %OC_PROBE_ID% >nul 2>&1
if not defined OPT_AUTO call echo %T_128%
>"%STATE_DIR%\renew_needed.txt" echo rotation hunt ended: %HUNT_WHY%
call :log "ROTATION HUNT ENDED (%HUNT_WHY%), see wcli.log" rotate
if not defined OPT_AUTO call echo %T_296%
REM v2.36: the hunt used to end on "press any key". Now it says what happened and offers the next step.
:rotate_ask
REM v2.60 (A3): auto never waits for a key after a failed hunt or a limit loop.
if defined OPT_AUTO goto :auto_giveup
echo.
if not defined OPT_AUTO call echo %T_297%
call :flush_keys
call :pick %KEY_ROTATE%E%KEY_MENU% "Pick: "
if errorlevel 100 goto :menu_loop
if not errorlevel 1 goto :quit
if errorlevel 3 goto :menu_loop
if errorlevel 2 goto :egress_ask
set "WHY=stop"
goto :quota_rotate

REM Esc or Q during the wait: stop the hunt and go to the menu. Chat not resumed.
:hunt_stop
set "HUNT_WHY=user"
call :hunt_summary
call "%OC_CMD%" session delete %OC_PROBE_ID% >nul 2>&1
goto :menu_loop

REM The summary of a hunt. HUNT_WHY says how it ended.
:hunt_summary
call :hunt_clock
if not defined OPT_AUTO echo.
if "%HUNT_WHY%"=="success" if not defined OPT_AUTO call echo %T_324%
if "%HUNT_WHY%"=="tries" if not defined OPT_AUTO call echo %T_325%
if "%HUNT_WHY%"=="time" if not defined OPT_AUTO call echo %T_326%
if "%HUNT_WHY%"=="burned" if not defined OPT_AUTO call echo %T_327%
if "%HUNT_WHY%"=="user" if not defined OPT_AUTO call echo %T_328%
exit /b 0

REM Seconds since midnight in NOWS. The time string has a leading space before 10 o'clock.
:nowsecs
set "NT=%TIME: =0%"
set /a NOWS=(1%NT:~0,2%-100)*3600+(1%NT:~3,2%-100)*60+(1%NT:~6,2%-100)
exit /b 0

REM Seconds since the hunt started in HUNT_EL. Midnight wraps.
:hunt_clock
call :nowsecs
set /a HUNT_EL=NOWS-HUNT_START
if %HUNT_EL% LSS 0 set /a HUNT_EL+=86400
exit /b 0

REM v2.43: comparison key of an exit IP, usage: call :ipkey VAR "ip". IPv4 stays as is; IPv6 becomes
REM its /64 (first 4 groups, :: expanded, hex read as numbers so case and leading zeros do not count),
REM because one WARP registration can hand out several addresses of the same /64.
:ipkey
setlocal EnableDelayedExpansion
set "IK=%~2"
if not defined IK goto :ik_out
if "!IK::=!"=="!IK!" goto :ik_out
set "IS=!IK:::=:-:!"
REM the split happens outside FOR: its list breaks on "=" before !...! is expanded
set "IS=!IS::= !"
set /a IN=0
for %%g in (!IS!) do if not "%%g"=="-" set /a IN+=1
set /a IM=8-IN
set "IK="
set /a IC=0
for %%g in (!IS!) do (
  if "%%g"=="-" (
    for /l %%z in (1,1,!IM!) do if !IC! LSS 4 (
      set "IK=!IK!-0"
      set /a IC+=1
    )
  ) else if !IC! LSS 4 (
    set /a IV=0x%%g
    set "IK=!IK!-!IV!"
    set /a IC+=1
  )
)
:ik_out
endlocal & set "%~1=%IK%"
exit /b 0

REM v2.60 (N88): two phases. (a) wait up to 2 s for PROXY_PORT to accept TCP, so a
REM closed proxy is told apart from a tunnel that is still handshaking. (b) poll the
REM trace every second until TUNNEL_WAIT (45 s default, 5-180). A cold MASQUE start
REM needs much more than WARP_WAIT; "no trace yet" is not a bad IP.
REM Exit: 0 = IP + warp=on, 1 = proxy closed, 2 = proxy open without a trace,
REM 3 = trace answered with an error. WP_PHASE mirrors the exit code; WP_SECS is
REM the polling time, which the callers log as wait=%WP_SECS%s.
:warp_poll
if not defined TUNNEL_WAIT set "TUNNEL_WAIT=45"
set "TW_NUM=1"
for /f "delims=0123456789" %%d in ("%TUNNEL_WAIT%") do set "TW_NUM=0"
if "%TW_NUM%"=="0" set "TUNNEL_WAIT=45"
if %TUNNEL_WAIT% LSS 5 set "TUNNEL_WAIT=5"
if %TUNNEL_WAIT% GTR 180 set "TUNNEL_WAIT=180"
set "TW_SEEN="
REM (a) the proxy port has to answer before any trace can come back.
set /a TW_P1=0
:wp_port
call :port_up %PROXY_PORT%
if not errorlevel 1 goto :wp_start
set /a TW_P1+=1
if %TW_P1% GEQ 2 goto :wp_noport
ping -n 2 127.0.0.1 >nul
goto :wp_port
REM (b) poll the trace once per second up to TUNNEL_WAIT.
:wp_start
call :nowsecs
set /a WP_T0=NOWS
:wp_loop
REM v3.1 (N67): timeout /t 1 returns at once with stdin redirected; ping is a real clock.
ping -n 2 127.0.0.1 >nul
call :getip2 %1 %2
call :nowsecs
set /a WP_SECS=NOWS-WP_T0
if %WP_SECS% LSS 0 set /a WP_SECS+=86400
if defined GIP if /i "%GFLAG%"=="on" goto :wp_ok
if defined GFLAG set "TW_SEEN=1"
if %WP_SECS% LSS %TUNNEL_WAIT% goto :wp_loop
if defined TW_SEEN goto :wp_bad
goto :wp_notrace
:wp_ok
set "WP_PHASE=0"
exit /b 0
:wp_noport
set "WP_PHASE=1"
set /a WP_SECS=0
exit /b 1
:wp_notrace
set "WP_PHASE=2"
exit /b 2
:wp_bad
set "WP_PHASE=3"
exit /b 3

REM TMATCH=1 when the trace country and IP prefix match the target (empty = no test).
:target_ok
set "TMATCH=1"
set "TMATCHTXT=yes"
if not defined GLOC set "GLOC=?"
if defined TARGET_COUNTRY if /i not "%GLOC%"=="%TARGET_COUNTRY%" set "TMATCH=0"
if defined TARGET_PREFIX (
    echo %IPN%| findstr /b /l /c:"%TARGET_PREFIX%" >nul
    if errorlevel 1 set "TMATCH=0"
)
if "%TMATCH%"=="0" set "TMATCHTXT=no"
exit /b 0

REM Waits the given seconds, reading keys: Esc or Q exits 1 (stop the hunt), Ctrl+C exits 2
REM (quit). No console (piped run): plain sleep, exit 0.
:napkey
set "NK_SECS=%~1"
"%PSX%" -NoProfile -Command "$rc = 0; $old = $false; try { $old = [Console]::TreatControlCAsInput; [Console]::TreatControlCAsInput = $true; $end = (Get-Date).AddSeconds([int]$env:NK_SECS); while ((Get-Date) -lt $end) { if ([Console]::KeyAvailable) { $k = [Console]::ReadKey($true); if ($k.Key -eq 'Escape' -or $k.Key -eq 'Q') { $rc = 1; break }; if ($k.Key -eq 'C' -and ($k.Modifiers -band [ConsoleModifiers]::Control) -ne 0) { $rc = 2; break } }; Start-Sleep -Milliseconds 200 } } catch { Start-Sleep -Seconds ([int]$env:NK_SECS) } finally { try { [Console]::TreatControlCAsInput = $old } catch { } }; exit $rc" >nul 2>&1
exit /b %errorlevel%

REM - send the resume message so the chat continues, then open the
REM    TUI on the same session. a fresh fatal here loops back into
REM    the rotation.
REM Send RESUME_MSG to the existing session. Then reopen the TUI with --continue.
REM The call is bounded by RESUME_TIMEOUT: a resume that never answers is a
REM dead exit IP, not a reason to freeze the console.
:resume_and_run
if not defined RESUME goto :run
if /i not "%APP_MODE%"=="DESKTOP" goto :resume_cli
call echo %T_129%
set "RESUME="
goto :run
:resume_cli
call :ar_clear
REM The proxy must answer before the message is sent: a dead route here is
REM the exact case that used to block forever with both streams discarded.
REM v2.43: start from errorlevel 0, so the check below reads this step's own result: the NONE
REM branch (and :export_proxy without WARP) set nothing and used to pass on a stale errorlevel.
(call )
if /i "%EGRESS%"=="WARP" (
  call :export_proxy
) else if /i "%EGRESS%"=="NONE" (
  set "HTTP_PROXY="
  set "HTTPS_PROXY="
) else (
  call :export_proxy_active
)
goto :resume_envdone
:resume_envdone
if errorlevel 1 (
    call :msg %T_131%
    if not defined OPT_AUTO call :resume_tail
    set "WHY=quota"
    goto :quota_rotate
)
REM RZB stores the log size before the resume message, to scan only its output.
REM It stays EMPTY when the log does not exist: an empty offset makes
REM scan_log read the whole file and match the quota error from hours ago.
set "RZB="
for %%S in ("%LOGFILE%") do if not "%%~zS"=="" set "RZB=%%~zS"
REM RESUME_AUTO=1 adds --auto, which approves tool permissions without asking.
REM On OpenCode v2, --standalone gives the resume a private server born with
REM THIS proxy env, instead of the long-lived background service that still
REM holds the old tunnel's sockets. v1 has no shared service and no such
REM flag: it prints the help screen and never sends the message. So the flag
REM is added only when :detect_caps found it in the CLI help.
set "RARGS=-c"
REM v2.54: a pinned chat (menu [9] or an automatic resume) is resumed by its id, not the newest chat of the folder.
if defined PIN_SESS set "RARGS=-s %PIN_SESS%"
if defined CAP_STANDALONE set "RARGS=%RARGS% --standalone"
if "%RESUME_AUTO%"=="1" set "RARGS=%RARGS% --auto"
if defined OC_MODEL set "RARGS=%RARGS% -m %OC_MODEL%"
call :resume_msg
if "%RDUP%"=="1" goto :resume_dup
REM v2.43: what the resume runs with (no secrets: the message text and tokens are not logged).
call :resume_facts
call :log "resume: session=last-of-folder ip=%IP% egress=%EGRESS% proxy=%RPX% svc=%SVC_PROXIED% auth=%RAUTH% cmd=opencode run %RARGS%" resume
call :resume_run %RARGS%
set "REC=%errorlevel%"
call :log "resume finished code %REC%" resume
REM v2.22: restore the user's own proxy variables instead of deleting them.
call :restore_env
if "%REC%"=="9009" echo   OpenCode not found: the path is empty or does not exist.
if "%REC%"=="9009" goto :menu_loop
REM 124 is the watchdog code: the resume was killed for taking too long.
if "%REC%"=="124" (
    call :msg %T_132%
    if not defined OPT_AUTO call :resume_tail
    set "WHY=quota"
    goto :quota_rotate
)
REM Free-tier / quota text often lands on stderr even when exit code is noisy.
REM Catch it here so a burned IP never becomes the next TUI session.
set "RESLIMIT="
if exist "%STATE_DIR%\resume.err" findstr /i /c:"Free usage limit" /c:"usage limit reached" /c:"out of usage" /c:"insufficient credits" /c:"payment required" "%STATE_DIR%\resume.err" >nul 2>&1 && set "RESLIMIT=1"
if exist "%STATE_DIR%\resume.out" if not defined RESLIMIT findstr /i /c:"Free usage limit" /c:"usage limit reached" /c:"out of usage" /c:"insufficient credits" /c:"payment required" "%STATE_DIR%\resume.out" >nul 2>&1 && set "RESLIMIT=1"
if defined RESLIMIT goto :resume_fatal
REM No usable offset means no verdict from the log: trust the exit code only.
if not defined RZB goto :resume_noscan
call :scan_log %RZB%
if defined FHIT goto :resume_fatal
:resume_noscan
if not "%REC%"=="0" goto :resume_fatal
call echo %T_133%
set /a QUOTA_STREAK=0
REM v2.23: a good resume clears the circuit counter. Without this TOR_TRIES
REM accumulated for the whole session and four clean renewals in a row sent
REM the fifth to the menu.
set /a TOR_TRIES=0
set /a VPN_TRIES=0
set "PROXY_ROT=0"
goto :run
REM The resume hit a limit: go back to the rotation with WHY=quota.
:resume_fatal
REM v3.4: "not available in your country" is a country block, not a usage limit. It gets its own
REM reason. Rotating can still help, because the next IP may be in another country.
set "GEOHIT="
if exist "%STATE_DIR%\resume.err" findstr /i /c:"not available in your country" "%STATE_DIR%\resume.err" >nul 2>&1 && set "GEOHIT=1"
if exist "%STATE_DIR%\resume.out" if not defined GEOHIT findstr /i /c:"not available in your country" "%STATE_DIR%\resume.out" >nul 2>&1 && set "GEOHIT=1"
if defined GEOHIT call :log "resume refused: model not available from this IP country, ip=%IP% egress=%EGRESS%" resume
if defined GEOHIT if not defined OPT_AUTO call :resume_tail
if defined GEOHIT set "WHY=geo"
if defined GEOHIT if defined GLOC set "HUNT_AVOID=%GLOC%"
if defined GEOHIT goto :quota_rotate
if not defined OPT_AUTO call :msg %T_134%
if not defined OPT_AUTO call :resume_tail
set "WHY=quota"
goto :quota_rotate

REM v2.60 (A3): --auto connection chain. Order WARP, Tor, PROXY and back to WARP; VPN Gate is never used,
REM no admin prompt, no question. The technical output of every attempt goes to launcher.log only.
:run_auto
set "AUTO_LOG=NUL"
if exist "%STATE_DIR%\" set "AUTO_LOG=%STATE_DIR%\launcher.log"
if not defined AUTO_STARTED call :asay "Connecting..."
:auto_try
REM v3.6: the time each method takes to connect is kept, so Auto can pick the fastest installed one.
call :now_cs
set "AUTO_T0=%NOW_CS%"
call :auto_connect >>"%AUTO_LOG%" 2>&1
if not errorlevel 1 goto :auto_ok
REM v2.60 (A3): this method did not connect: take the next one of the chain (every 3rd failure waits 5 s first).
:auto_next
set /a AUTO_FAILS+=1
call :log "auto: %EGRESS% did not connect, failure %AUTO_FAILS%" auto
call :restore_env
if /i "%EGRESS%"=="WARP" (set "EGRESS=TOR") else if /i "%EGRESS%"=="TOR" (set "EGRESS=PROXY") else (set "EGRESS=WARP")
set "WARP="
set "ACTIVE_PROXY="
if /i "%EGRESS%"=="TOR" set "ACTIVE_PROXY=http://127.0.0.1:%TOR_HTTP_PORT%"
if /i "%EGRESS%"=="TOR" set "TOR_TRIES=0"
set "PROXY_ROT=0"
set /a AUTO_M=AUTO_FAILS%%3
if "%AUTO_M%"=="0" timeout /t 5 /nobreak >nul 2>&1
REM v2.60 (A3): once OpenCode has been open, the new connection also sends the resume message (same chat).
if defined AUTO_STARTED set "AUTO_SENDRESUME=1"
call :asay "Trying %EGRESS%..."
goto :auto_try
:auto_ok
if defined AUTO_T0 call :auto_record
set "AUTO_FAILS=0"
if not defined AUTO_SENDRESUME goto :run_gate_ok
set "AUTO_SENDRESUME="
set "RESUME=1"
set "COLD=0"
goto :resume_and_run

REM v2.60 (A3): the rotation machinery ended without a usable IP (hunt, Tor, proxies or limit loop). Auto rotates
REM again on the same connection; the second time in a row it moves to the next connection of the chain.
:auto_giveup
set /a AUTO_GIVEUPS+=1
call :log "auto: rotation ended without a usable IP (%AUTO_GIVEUPS%) egress=%EGRESS%" auto
set /a QUOTA_STREAK=0
set /a TOR_TRIES=0
set /a VPN_TRIES=0
set "PROXY_ROT=0"
timeout /t 5 /nobreak >nul 2>&1
if %AUTO_GIVEUPS% GEQ 2 (set "AUTO_GIVEUPS=0" & goto :auto_next)
set "WHY=stop"
goto :quota_rotate

REM v2.60 (A3): one connection attempt for the current EGRESS, errorlevel 0 = ready. Called with its output sent to the log.
:auto_connect
if /i "%EGRESS%"=="WARP" goto :ac_warp
if /i "%EGRESS%"=="TOR" goto :ac_tor
goto :ac_proxy
:ac_warp
if not defined WARP call :find_warp
if not defined WARP exit /b 1
call :proxy_ok
if not errorlevel 1 goto :ac_warp_x
REM The proxy answers nothing: WARP is off or in another mode. Start it in proxy mode (no register, no installer, no admin).
call :warp_ensure_on
if errorlevel 1 exit /b 1
:ac_warp_x
set "ACTIVE_PROXY=%PROXY%"
call :export_proxy
exit /b %errorlevel%
:ac_tor
call :tor_gate
if errorlevel 1 exit /b 1
set "ACTIVE_PROXY=http://127.0.0.1:%TOR_HTTP_PORT%"
call :export_proxy_active
exit /b %errorlevel%
:ac_proxy
if not defined ACTIVE_PROXY goto :ac_proxy_new
call :proxy_alive "%ACTIVE_PROXY%"
if errorlevel 1 goto :ac_proxy_new
call :export_proxy_active
exit /b %errorlevel%
:ac_proxy_new
call :pick_free_proxy
if errorlevel 1 exit /b 1
call :export_proxy_active
exit /b %errorlevel%

REM v2.60 (A3): a saved NONE, WIREGUARD or VPNGATE becomes WARP (called at run time: the auto block is parsed as one unit).
:auto_method_ok
if /i "%OC_EGRESS_DEFAULT%"=="WARP" exit /b 0
if /i "%OC_EGRESS_DEFAULT%"=="TOR" exit /b 0
if /i "%OC_EGRESS_DEFAULT%"=="PROXY" exit /b 0
set "OC_EGRESS_DEFAULT=WARP"
exit /b 0

REM v3.6: Auto picks the installed method that connected fastest. Unmeasured methods use a default time
REM (WARP 5 s, PROXY 8 s, TOR 120 s). A method counts as installed when its program is on disk (PROXY always).
REM The times and the Tor folder are shared by every window, so they live in the base folder, not in STATE_DIR.
:auto_pick
set "OC_EGRESS_DEFAULT="
for /f "usebackq delims=" %%M in (`"%PSX%" -NoProfile -Command "$s=$env:LOCALAPPDATA+'\opencode-infinite';$t=@{WARP=5000;PROXY=8000;TOR=120000}; foreach($m in @($t.Keys)){ $f=Join-Path $s ('method_'+$m+'.ms'); if(Test-Path -LiteralPath $f){ $v=0; if([int]::TryParse((Get-Content -LiteralPath $f -Raw).Trim(),[ref]$v)){ $t[$m]=$v } } }; $w=$false; foreach($b in @($env:ProgramFiles,${env:ProgramFiles(x86)},$env:ProgramW6432,$env:LOCALAPPDATA)){ if($b -and (Test-Path -LiteralPath (Join-Path $b 'Cloudflare\Cloudflare WARP\warp-cli.exe'))){ $w=$true } }; $tor=$false; $td=Join-Path $s 'tor'; if(Test-Path -LiteralPath $td){ if(Get-ChildItem -LiteralPath $td -Recurse -Filter tor.exe -ErrorAction SilentlyContinue | Select-Object -First 1){ $tor=$true } }; $ok=@{PROXY=$true;WARP=$w;TOR=$tor}; $t.Keys | Where-Object { $ok[$_] } | Sort-Object { $t[$_] } | Select-Object -First 1"`) do set "OC_EGRESS_DEFAULT=%%M"
if not defined OC_EGRESS_DEFAULT set "OC_EGRESS_DEFAULT=WARP"
call :log "auto picks %OC_EGRESS_DEFAULT% (fastest installed)" boot
exit /b 0

REM v3.6: connect time of the method that just worked, in milliseconds. %time% has centiseconds and a midnight wrap.
:now_cs
set "NT=%time: =0%"
set /a NOW_CS=(1%NT:~0,2%-100)*360000+(1%NT:~3,2%-100)*6000+(1%NT:~6,2%-100)*100+(1%NT:~9,2%-100)
exit /b 0

:auto_record
call :now_cs
set /a AUTO_MS=(NOW_CS-AUTO_T0)*10
if %AUTO_MS% LSS 0 set /a AUTO_MS+=86400000
> "%LOCALAPPDATA%\opencode-infinite\method_%EGRESS%.ms" <nul set /p "=%AUTO_MS%"
set "AUTO_T0="
exit /b 0

REM v2.60 (A3): the only console lines of auto: short and plain, also written to launcher.log.
:asay
call :log "%~1" auto
echo   %~1
exit /b 0

REM v2.43: RPX = proxy handed to the child (user:pass@ hidden), RAUTH = auth.json present (yes/no).
:resume_facts
set "RPX=%HTTPS_PROXY%"
if not defined RPX set "RPX=none"
if not "%RPX:@=%"=="%RPX%" set "RPX=set-with-credentials-hidden"
set "RAUTH=no"
if exist "%DATA_DIR%\auth.json" set "RAUTH=yes"
exit /b 0

REM v2.36: the resume message is already the last thing in the chat and nothing answered it: it is not sent twice.
:resume_dup
call echo %T_299%
call :restore_env
goto :run

REM Option 3: rotate only, without opening opencode. Shows the result and waits.
:rotate
if /i "%EGRESS%"=="NONE" (
  echo.
  call echo %T_135%
  call :pause_key
  goto :menu_loop
)
if /i "%EGRESS%"=="WIREGUARD" goto :rotate_vpn
if /i "%EGRESS%"=="VPNGATE" goto :rotate_vpn
if /i "%EGRESS%"=="TOR" (
  echo.
  if defined OURTOR (
    call echo %T_136%
    REM v2.22: one call does the whole renewal, log-aware on failure.
    call :tor_rotate
    if errorlevel 1 call echo %T_329%
    if not errorlevel 1 call echo %T_330%
    call :pause_key
    goto :menu_loop
  )
  REM v2.22: a Tor this launcher did not start cannot be renewed from here.
  call echo %T_137%
  call echo %T_138%
  call echo %T_139%
  call :pause_key
  goto :menu_loop
)
if /i "%EGRESS%"=="PROXY" (
  echo.
  call echo %T_140%
  call :pick_free_proxy
  if errorlevel 1 (
    call echo %T_82%
  ) else (
    call echo %T_141%
  )
  call :pause_key
  goto :menu_loop
)
REM WARP path
if not defined WARP (
  echo.
  call echo %T_142%
  call :pause_key
  goto :menu_loop
)
echo.
call echo %T_143%
call :reg_drop
call :reg_new
if "%REGNEW%"=="0" call echo %T_331%
call :warp_up
set "WARP_UP=1"
call echo %T_144%
REM v2.43: poll instead of the fixed WARP_WAIT sleep.
call :warp_poll IPN WFLAG
call :log "manual rotation: old=%IP% new=%IPN% wait=%WP_SECS%s" rotate
if defined IPN if "%WFLAG%"=="on" goto :rotate_ok
REM Explain why the rotation failed: no answer or tunnel down.
call echo %T_145%
if defined IPN if not "%WFLAG%"=="on" call echo %T_332%
if not defined IPN call echo %T_333%
call echo %T_146%
call :pause_key
goto :menu_loop
REM Rotation succeeded. Report whether the IP changed or stayed the same.
:rotate_ok
REM v2.43: same IP (IPv6: same /64) no longer ends at the menu: retry through :ens_loop,
REM bounded by ROTATE_TRIES_MAX. Its service restart runs on the user's env, so the marker is
REM cleared again and the next launch restarts the service with the proxy exported.
call :ipkey IPNK "%IPN%"
call :ipkey IPK "%IP%"
if not "%IPNK%"=="%IPK%" goto :rotate_new
call echo %T_147%
set "LASTIP=%IP%"
set /a EN_TRIES=0
call :ens_loop
set "SVC_PROXIED="
set "IPN=%IP%"
call :log "manual rotation retried: old=%LASTIP% new=%IP% tries=%EN_TRIES%" rotate
goto :rotate_done
:rotate_new
call echo %T_148%
>"%STATE_DIR%\lastip.txt" echo %IPN%
set "IP=%IPN%"
:rotate_done
echo.
call :pause_key
goto :menu_loop
:rotate_vpn
echo.
call :vpn_switch
if not errorlevel 1 >"%STATE_DIR%\lastip.txt" echo %IPN%
if not errorlevel 1 set "IP=%IPN%"
echo.
call :pause_key
goto :menu_loop

REM ============================================================
REM  4) SUBROUTINES
REM ============================================================

REM ============================================================
REM  WireGuard egress (v2.37): wireproxy serves a local HTTP proxy that only OpenCode uses.
REM ============================================================
REM The block #>>>OC_VPN_PS at the end of this file does the work and writes vpn_result.txt.
REM usage: call :vpn_run switch|status|stop. Result: VPN_STATUS VPN_IP VPN_LOC VPN_NAME VPN_TRIED VPN_TOOL VPN_DIR VPN_PORT.
:vpn_run
set "VPN_STATUS="
set "VPN_IP="
set "VPN_LOC="
set "VPN_NAME="
set "VPN_TRIED="
set "VPN_TOOL="
set "VPN_DIR="
set "VPN_PORT="
if exist "%STATE_DIR%\vpn_result.txt" del /f /q "%STATE_DIR%\vpn_result.txt" >nul 2>&1
if /i "%~1"=="switch" if /i "%EGRESS%"=="VPNGATE" if not defined OPT_AUTO call echo %T_390%
set "OC_VPN_ACT=%~1"
set "OC_STATE=%STATE_DIR%"
set "OC_VPN_M_TRY=%T_280%"
set "OC_VPN_M_SAME=%T_281%"
set "OC_VPN_M_NOANS=%T_282%"
if /i "%EGRESS%"=="VPNGATE" goto :vpn_run_vg
set "OC_VPN_START=#>>>OC_VPN_PS"
set "OC_VPN_END=#>>>OC_ENDVPN"
goto :vpn_run_go
:vpn_run_vg
set "OC_VPN_START=#>>>OC_VGATE_PS"
set "OC_VPN_END=#>>>OC_ENDVGATE"
:vpn_run_go
"%PSX%" -NoProfile -Command "$l=Get-Content -LiteralPath $env:OCI_SELF; $i=[Array]::IndexOf($l,$env:OC_VPN_START); $e=[Array]::IndexOf($l,$env:OC_VPN_END); if(($i -lt 0) -or ($e -le $i)){exit 90}; Invoke-Expression (($l[($i+1)..($e-1)]) -join [Environment]::NewLine)"
set "VPNRC=%errorlevel%"
if exist "%STATE_DIR%\vpn_result.txt" for /f "usebackq tokens=1* delims==" %%a in ("%STATE_DIR%\vpn_result.txt") do set "VPN_%%a=%%b"
exit /b %VPNRC%

REM Names shown in the egress messages.
:vpn_labels
set "WG_DIR_SHOW=%WG_DIR%"
if not defined WG_DIR_SHOW set "WG_DIR_SHOW=%STATE_DIR%\wireguard"
goto :eof

REM v2.54: the pool worker (#>>>OC_POOL_PS) runs only while Settings is open. :pool_stop waits for it (up to 2 min).
:pool_start
set "POOL_STARTED="
if /i not "%POOL_ENABLE%"=="1" goto :eof
set "OC_STATE=%STATE_DIR%"
md "%STATE_DIR%\pool" >nul 2>&1
REM N26: a worker left behind by a crashed launcher is adopted, never doubled.
call :pool_alive
if not defined POOL_ALIVE goto :pool_start_new
set "POOL_STARTED=1"
goto :eof
:pool_start_new
del /f /q "%STATE_DIR%\pool\stop.flag" "%STATE_DIR%\pool\done.flag" "%STATE_DIR%\pool\worker.pid" >nul 2>&1
REM N26: the worker writes pool\worker.pid (PID, start ticks, launcher path) before
REM it starts working, so :pool_stop can see what it is waiting for.
start "" /b "%PSX%" -NoProfile -Command "$l=Get-Content -LiteralPath $env:OCI_SELF; $i=[Array]::IndexOf($l,'#>>>OC_POOL_PS'); $e=[Array]::IndexOf($l,'#>>>OC_ENDPOOL'); if(($i -lt 0) -or ($e -le $i)){exit 30}; [IO.File]::WriteAllText((Join-Path $env:OC_STATE 'pool\worker.pid'),([string]$PID+[Environment]::NewLine+[string](Get-Process -Id $PID).StartTime.Ticks+[Environment]::NewLine+$env:OCI_SELF)); Invoke-Expression (($l[($i+1)..($e-1)]) -join [Environment]::NewLine)" >nul 2>&1
set "POOL_STARTED=1"
goto :eof
:pool_stop
if not defined POOL_STARTED goto :eof
set "POOL_STARTED="
set "OC_STATE=%STATE_DIR%"
type nul > "%STATE_DIR%\pool\stop.flag"
REM v3.1 (N59): the fill child holds the pool for 10-16 min; kill the pid recorded by
REM Run-Vpn so :pool_stop does not have to give up after 120 s.
set "OC_FILLPID=%STATE_DIR%\pool\fill.pid" & "%PSX%" -NoProfile -Command "try{ $f=$env:OC_FILLPID; if(Test-Path -LiteralPath $f){ $t=[int](Get-Content -LiteralPath $f -TotalCount 1); if($t){ & taskkill.exe /PID $t /T /F | Out-Null } } }catch{}" >nul 2>&1
set /a POOL_WAIT=0
:pool_wait
if exist "%STATE_DIR%\pool\done.flag" goto :pool_stopped
set /a POOL_WAIT+=1
if %POOL_WAIT% GEQ 120 goto :pool_kill
ping -n 2 127.0.0.1 >nul
goto :pool_wait
:pool_kill
REM N26: 2 min without honouring stop.flag: kill only the PID whose start ticks
REM match worker.pid and whose command line still carries the pool marker.
"%PSX%" -NoProfile -Command "try{ $t=@(Get-Content -LiteralPath (Join-Path $env:OC_STATE 'pool\worker.pid')); if($t.Count -lt 3){exit 1}; $p=[int]$t[0]; $q=Get-Process -Id $p -ErrorAction Stop; if([string]$q.StartTime.Ticks -ne $t[1]){exit 1}; $cl=[string](Get-CimInstance Win32_Process -Filter ('ProcessId='+$p)).CommandLine; if(-not $cl -or -not $cl.Contains('OC_POOL_PS')){exit 1}; & taskkill.exe /PID $p /T /F | Out-Null; exit 0 }catch{ exit 1 }" >nul 2>&1
if errorlevel 1 goto :eof
:pool_stopped
del /f /q "%STATE_DIR%\pool\stop.flag" "%STATE_DIR%\pool\done.flag" "%STATE_DIR%\pool\worker.pid" >nul 2>&1
goto :eof
REM N26: sets POOL_ALIVE when pool\worker.pid names a live worker with the marker.
:pool_alive
set "POOL_ALIVE="
if not exist "%STATE_DIR%\pool\worker.pid" goto :eof
for /f "usebackq delims=" %%i in (`%PSX% -NoProfile -Command "try{ $t=@(Get-Content -LiteralPath (Join-Path $env:OC_STATE 'pool\worker.pid')); if($t.Count -lt 3){exit 1}; $p=[int]$t[0]; $q=Get-Process -Id $p -ErrorAction Stop; if([string]$q.StartTime.Ticks -ne $t[1]){exit 1}; $cl=[string](Get-CimInstance Win32_Process -Filter ('ProcessId='+$p)).CommandLine; if($cl -and $cl.Contains('OC_POOL_PS')){ [Console]::Out.Write('1') } }catch{}"`) do set "POOL_ALIVE=%%i"
goto :eof
REM takes one saved entry for the mode in the first argument (VPNGATE, WIREGUARD, PROXY) whose IP is not the current one.
REM Its id goes to OC_POOL_PREFER; empty = none.
:pool_take
set "OC_POOL_PREFER="
if /i not "%POOL_ENABLE%"=="1" goto :eof
set "OC_POOL_MODE=%~1"
set "OC_POOL_CUR=%IPN%"
set "OC_STATE=%STATE_DIR%"
set "OC_POOL_ACT=take"
REM v2.54: PSX unquoted as in every other for /f; quoted, cmd /c stripped the outer quotes and failed on the marker (N11).
for /f "usebackq delims=" %%i in (`%PSX% -NoProfile -Command "$l=Get-Content -LiteralPath $env:OCI_SELF; $i=[Array]::IndexOf($l,'#>>>OC_POOL_PS'); $e=[Array]::IndexOf($l,'#>>>OC_ENDPOOL'); if(($i -lt 0) -or ($e -le $i)){exit 30}; Invoke-Expression (($l[($i+1)..($e-1)]) -join [Environment]::NewLine)"`) do set "OC_POOL_PREFER=%%i"
set "OC_POOL_ACT="
goto :eof

REM Switch to the next .conf and prove the exit IP changed. Exit 0 = up; the report says why when not.
:vpn_switch
call echo %T_283%
if /i "%EGRESS%"=="VPNGATE" call :pool_take VPNGATE
if /i "%EGRESS%"=="WIREGUARD" call :pool_take WIREGUARD
call :vpn_run switch
set "OC_POOL_PREFER="
if /i "%VPN_STATUS%"=="NOTOOL" goto :vpn_r_notool
set "IPN=%VPN_IP%"
set "GLOC=%VPN_LOC%"
if /i "%VPN_STATUS%"=="OK" goto :vpn_r_ok
if /i "%VPN_STATUS%"=="NOCONF" goto :vpn_r_noconf
if /i "%VPN_STATUS%"=="NOLIST" goto :vpn_r_nolist
if /i "%VPN_STATUS%"=="NOIP" goto :vpn_r_noip
if /i "%VPN_STATUS%"=="NOADMIN" goto :vpn_r_noadmin
if "%VPN_TRIED%"=="0" goto :vpn_r_none
call echo %T_290%
exit /b 1
:vpn_r_none
if /i "%EGRESS%"=="VPNGATE" call echo %T_292%
if /i not "%EGRESS%"=="VPNGATE" call echo %T_291%
exit /b 1
:vpn_r_ok
set "ACTIVE_PROXY="
if not "%VPN_PORT%"=="0" set "ACTIVE_PROXY=http://127.0.0.1:%VPN_PORT%"
REM Node picks IPv6 first, and an IPv6 request leaves by the physical route. VPN Gate routes only IPv4,
REM so the Node processes of this tree (opencode and its service) are told to use IPv4.
REM v2.40: NODE_OPTIONS is set anyway; whether Bun honours it is not verified; Build-Ovpn now routes and blocks its IPv6 in the tunnel.
REM v3.1 (N27): NODE_OPTIONS was set for VPN Gate and never saved, so a later switch
REM to WARP, Tor or direct inherited --dns-result-order=ipv4first.
if /i "%EGRESS%"=="VPNGATE" if not defined OC_NODE_OPTIONS_SET set "OC_NODE_OPTIONS_PREV=%NODE_OPTIONS%"
if /i "%EGRESS%"=="VPNGATE" set "OC_NODE_OPTIONS_SET=1"
if /i "%EGRESS%"=="VPNGATE" set "NODE_OPTIONS=--no-network-family-autoselection --dns-result-order=ipv4first"
call echo %T_284%
call :log "vpn up: %EGRESS% %VPN_NAME% ip=%VPN_IP% port=%VPN_PORT%" vpn
REM the shared background service holds the sockets of the old route: restart it so the next request leaves by the new one
REM v2.40: the restart ran on the user's env (no proxy) and :run_gate_ok skipped its own because the port
REM never changes, so the WireGuard service left direct. Export around it, as :rotate_good does for WARP.
if not defined CAP_SERVICE exit /b 0
if not defined OC_CMD exit /b 0
call :export_proxy_active >nul
call "%OC_CMD%" service restart >nul 2>&1
set "VPNSVC=%ERRORLEVEL%"
call :restore_env
REM v2.56 (N05): only a restart that returned 0 sets the marker. A failure
REM leaves it empty so the next pass retries and the log records why.
if not "%VPNSVC%"=="0" goto :vpn_r_svc_bad
set "SVC_PROXIED=%ACTIVE_PROXY%"
exit /b 0
:vpn_r_svc_bad
set "SVC_PROXIED="
call :log "service restart failed after vpn up rc=%VPNSVC% egress=%EGRESS% port=%VPN_PORT%" vpn
exit /b 0
:vpn_r_noconf
if /i "%EGRESS%"=="VPNGATE" if defined VPNGATE_COUNTRY call echo %T_289%
if /i "%EGRESS%"=="VPNGATE" if not defined VPNGATE_COUNTRY call echo %T_292%
if /i not "%EGRESS%"=="VPNGATE" call echo %T_286%
exit /b 1
:vpn_r_noip
call echo %T_293%
exit /b 1
:vpn_r_nolist
call echo %T_288%
exit /b 1
:vpn_r_noadmin
call echo %T_287%
exit /b 1
:vpn_r_notool
if /i "%EGRESS%"=="VPNGATE" call echo %T_279%
if /i not "%EGRESS%"=="VPNGATE" call echo %T_285%
exit /b 1
REM Stops the proxy this launcher started. No administrator prompt.
:vpn_stop
call :vpn_run stop
if defined OC_NODE_OPTIONS_SET set "NODE_OPTIONS=%OC_NODE_OPTIONS_PREV%"
exit /b 0

REM v2.36: the folders worked in, newest first (15 kept). Menu-Folder and Menu-Sessions read them.
:folder_remember
set "OC_FH=%STATE_DIR%\folders.txt"
set "OC_FNEW=%CD%"
"%PSX%" -NoProfile -Command "try{ $f=$env:OC_FH; $n=$env:OC_FNEW; $l=@(); if(Test-Path -LiteralPath $f){ $l=@(Get-Content -LiteralPath $f -Encoding UTF8 | Where-Object { $_ -and $_ -ne $n }) }; $l=@(@($n)+$l | Select-Object -First 15); [IO.File]::WriteAllLines($f,[string[]]$l,(New-Object Text.UTF8Encoding($false))) }catch{}" >nul 2>&1
goto :eof

REM ============================================================
REM  Chat helpers (v2.36): the block #>>>OC_CHAT_PS reads the chat through the opencode CLI
REM ============================================================
REM usage: call :chat_run snapshot|empty|resume|typed. Result: CHAT_EMPTY CHAT_DUP CHAT_MSG CHAT_TYPED.
:chat_run
set "CHAT_EMPTY="
set "CHAT_SID="
set "CHAT_DUP="
set "CHAT_MSG="
set "CHAT_SHOW="
set "CHAT_TYPED="
if exist "%STATE_DIR%\chat_result.txt" del /f /q "%STATE_DIR%\chat_result.txt" >nul 2>&1
set "OC_CHAT_ACT=%~1"
set "OC_EXE=%OC_CMD%"
set "OC_STATE=%STATE_DIR%"
"%PSX%" -NoProfile -Command "$l=Get-Content -LiteralPath $env:OCI_SELF; $i=[Array]::IndexOf($l,'#>>>OC_CHAT_PS'); $e=[Array]::IndexOf($l,'#>>>OC_ENDCHAT'); if(($i -lt 0) -or ($e -le $i)){exit 90}; Invoke-Expression (($l[($i+1)..($e-1)]) -join [Environment]::NewLine)"
if exist "%STATE_DIR%\chat_result.txt" for /f "usebackq tokens=1* delims==" %%a in ("%STATE_DIR%\chat_result.txt") do set "CHAT_%%a=%%b"
exit /b 0

REM What the resume sends: continue = RESUME_MSG, last = your last real message again, custom = RESUME_TEXT.
REM RDUP=1 when that very message is already the last thing in the chat and nothing answered it.
:resume_msg
set "RDUP="
set "OC_MSG=%RESUME_MSG%"
if not defined OC_MSG set "OC_MSG=continue"
if /i "%RESUME_MODE%"=="custom" if defined RESUME_TEXT set "OC_MSG=%RESUME_TEXT%"
set "OC_RMODE=%RESUME_MODE%"
set "OC_BASE=%OC_MSG%"
set "OC_SKIP1=%RESUME_MSG%"
set "OC_SKIP2=%RESUME_TEXT%"
call :chat_run resume
if defined CHAT_MSG set "OC_MSG=%CHAT_MSG%"
set "RDUP=%CHAT_DUP%"
set "OC_MSG_SHOW=%OC_MSG:~0,80%"
REM v2.40: the echoed copy comes stripped of & | < > ^ % from the chat module (the sent text keeps them).
if defined CHAT_SHOW set "OC_MSG_SHOW=%CHAT_SHOW%"
if not "%RDUP%"=="1" call echo %T_307%
exit /b 0

REM The last messages of the chat, printed in the normal screen so they stay in the scroll-back (the TUI clears its own).
:chat_snapshot
if not "%CHAT_SNAPSHOT%"=="1" goto :eof
if /i "%APP_MODE%"=="DESKTOP" goto :eof
if not defined OC_CMD goto :eof
echo.
call echo %T_302%
call :chat_run snapshot
echo.
goto :eof

REM v2.54: after a quota stop the chat is remembered (pending_resume.txt). A later start resumes it only
REM with a new exit IP and a fresh probe. :ar_mark saves, :auto_resume checks, :ar_clear consumes.
REM Only WARP: :getip2 reads the exit IP through WARP; the other egresses have no IP to compare.
:ar_mark
if not "%QUOTA_RESUME%"=="1" goto :eof
if /i "%APP_MODE%"=="DESKTOP" goto :eof
if not defined OC_CMD goto :eof
if not "%WHY%"=="quota" if not "%WHY%"=="watcher" goto :eof
if /i not "%EGRESS%"=="WARP" call :log "pending resume not saved: egress %EGRESS% has no exit IP check" resume
if /i not "%EGRESS%"=="WARP" goto :eof
REM a watcher hit counts only when the log scan finds a quota error
if "%WHY%"=="watcher" call :scan_log %SIZE_BEFORE%
if "%WHY%"=="watcher" if not defined FHIT goto :eof
REM rotation has not run yet, so this is still the IP that hit the quota
call :getip2 ARIP ARFL
if not defined ARIP set "ARIP=unknown"
REM v3.5: the hit IP is the reference for the rotation. Without it an empty old IP accepted the next IP even when it was the same one.
if not "%ARIP%"=="unknown" set "IP=%ARIP%"
set "OC_ARSID=continue"
call :chat_run sid
if defined CHAT_SID set "OC_ARSID=%CHAT_SID%"
set "OC_ARF=%ARF%"
set "OC_ARFOLDER=%CD%"
set "OC_ARIP=%ARIP%"
"%PSX%" -NoProfile -Command "try{ $t=$env:OC_ARF+'.tmp'; $v=@(('FOLDER='+$env:OC_ARFOLDER),('SESSION='+$env:OC_ARSID),('IP='+$env:OC_ARIP),('TIME='+[DateTimeOffset]::UtcNow.ToUnixTimeSeconds())); [IO.File]::WriteAllLines($t,[string[]]$v,(New-Object Text.UTF8Encoding($false))); Move-Item -LiteralPath $t -Destination $env:OC_ARF -Force; exit 0 }catch{ exit 1 }" >nul 2>&1
if errorlevel 1 goto :ar_mark_fail
call :log "pending resume saved: session=%OC_ARSID% ip=%ARIP% folder=%CD%" resume
goto :eof
:ar_mark_fail
call :log "pending resume not saved: the file could not be written" resume
goto :eof

REM v2.54: a start after a quota stop. A probe that passes on a new exit IP means the quota is back.
REM The record is kept on every other outcome, except when it is damaged or older than AR_MAX_HOURS.
:auto_resume
if not "%QUOTA_RESUME%"=="1" goto :eof
if defined RESUME goto :eof
if "%AR_CHECKED%"=="1" goto :eof
if not exist "%ARF%" goto :eof
if /i "%APP_MODE%"=="DESKTOP" goto :eof
if not defined OC_CMD goto :eof
if /i not "%EGRESS%"=="WARP" goto :eof
set "AR_CHECKED=1"
set "AR_FOLDER="
set "AR_SESSION="
set "AR_IP="
set "AR_TIME="
for /f "usebackq tokens=1* delims==" %%a in ("%ARF%") do set "AR_%%a=%%b"
if not defined AR_FOLDER goto :ar_bad
if not defined AR_TIME goto :ar_bad
set "OC_ART=%AR_TIME%"
set "OC_ARMAX=%AR_MAX_HOURS%"
"%PSX%" -NoProfile -Command "try{ $h=[int64]0; if(-not [int64]::TryParse($env:OC_ARMAX,[ref]$h)){ $h=24 }; $a=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()-[int64]$env:OC_ART; if(($a -ge 0) -and ($a -le 3600*$h)){ exit 0 }; exit 1 }catch{ exit 2 }" >nul 2>&1
if errorlevel 2 goto :ar_bad
if errorlevel 1 goto :ar_old
if /i not "%AR_FOLDER%"=="%CD%" goto :ar_other
call echo %T_357%
call :getip2 ARCUR ARCFL
echo(%ARCUR%| findstr /r /x /c:"[0-9a-fA-F.:][0-9a-fA-F.:]*" >nul
if errorlevel 1 goto :ar_noip
echo(%AR_IP%| findstr /r /x /c:"[0-9a-fA-F.:][0-9a-fA-F.:]*" >nul
if errorlevel 1 goto :ar_noip
call :ipkey ARCK "%ARCUR%"
call :ipkey ARSK "%AR_IP%"
if "%ARCK%"=="%ARSK%" goto :ar_sameip
if "%PROBE%"=="0" goto :ar_noprobe
call :export_proxy
call :probe_once
if not errorlevel 1 goto :ar_go
if /i "%PCLASS%"=="burned" goto :ar_still
goto :ar_probe_fail
:ar_go
call :log "pending resume: new exit IP %ARCUR% (saved %AR_IP%), probe passed, resuming session %AR_SESSION%" resume
call echo %T_363%
set "COLD=0"
set "RESUME=1"
if /i not "%AR_SESSION%"=="continue" set "PIN_SESS=%AR_SESSION%"
goto :resume_and_run
:ar_bad
call echo %T_365%
call :log "pending resume file damaged: discarded" resume
del /f /q "%ARF%" >nul 2>&1
goto :eof
:ar_old
call echo %T_362%
call :log "pending resume older than %AR_MAX_HOURS% hours: discarded" resume
del /f /q "%ARF%" >nul 2>&1
goto :eof
:ar_other
call echo %T_360%
call :log "pending resume kept: saved in another folder (%AR_FOLDER%)" resume
goto :eof
:ar_noip
call echo %T_366%
call :log "pending resume kept: exit IP not readable (now=%ARCUR% saved=%AR_IP%)" resume
goto :eof
:ar_sameip
call echo %T_361%
call :log "pending resume kept: same exit IP %ARCUR%" resume
goto :eof
:ar_noprobe
call echo %T_367%
call :log "pending resume kept: PROBE=0, quota not confirmed" resume
goto :eof
:ar_still
call echo %T_358%
call :log "pending resume kept: the probe on %ARCUR% still shows the quota" resume
goto :eof
:ar_probe_fail
call echo %T_359%
call :log "pending resume kept: probe failed, class %PCLASS%" resume
goto :eof

REM v2.54: any resume of this folder's chat consumes the record. A record of another folder stays.
:ar_clear
if not exist "%ARF%" goto :eof
findstr /l /b /e /c:"FOLDER=%CD%" "%ARF%" >nul 2>&1
if errorlevel 1 goto :eof
del /f /q "%ARF%" >nul 2>&1
call :log "pending resume consumed by a resume of this folder" resume
goto :eof

REM Second window (MULTI_INSTANCE=1): it works on a private copy of the settings, so the two never share
REM the pid, watcher and probe files. Tor, WARP and the opencode data stay shared (they are system-wide).
:multi_state
set "BASE_STATE=%STATE_DIR%"
set "STATE_DIR=%BASE_STATE%\instances\%OC_SID%"
md "%STATE_DIR%" >nul 2>&1
REM v2.49: owner file (PID|ticks|exe|launcher) like lock\owner, so a newer copy started later sees this window and does not overwrite the official .bat under it.
set "OC_LOCK=%STATE_DIR%"
"%PSX%" -NoProfile -Command "try{ $pp=(Get-CimInstance Win32_Process -Filter ('ProcessId='+$PID)).ParentProcessId; $p=Get-Process -Id $pp -ErrorAction Stop; [IO.File]::WriteAllText((Join-Path $env:OC_LOCK 'owner'),([string]$pp+'|'+$p.StartTime.Ticks+'|'+$p.Path+'|'+$env:OCI_SELF)) }catch{}" >nul 2>&1
for %%F in (config.json config.env ui.env lang.chosen) do if exist "%BASE_STATE%\%%F" copy /y "%BASE_STATE%\%%F" "%STATE_DIR%\%%F" >nul 2>&1
if exist "%BASE_STATE%\lang\" robocopy "%BASE_STATE%\lang" "%STATE_DIR%\lang" /e /r:1 /w:1 /nfl /ndl /njh /njs /np >nul 2>&1
call :log "second window: private state %STATE_DIR%" boot
goto :eof

REM - launch opencode with a tracked PID
REM The TUI runs through a small PowerShell host in this same console
REM so the launcher knows the exact PID (written to tui.pid). The
REM watcher kills exactly that process tree, and .cmd shims from npm
REM installs work the same as plain .exe builds.
REM Start opencode, save its PID to tui.pid, wait for it to exit, and return its exit code.
:launch
call :ui_reset
set "OC_EXE=%OC_CMD%"
set "OC_FLAGS=%FLAGS%"
if /i not "%APP_MODE%"=="DESKTOP" goto :launch_go
REM Desktop: no --continue (it is a CLI flag). A leftover app or sidecar was
REM born without the proxy env and would keep the old egress, so close both.
REM v2.44: only the app this launcher started (oc_launched.pid); a window opened by hand is left alone.
set "OC_EXE=%OC_DESKTOP%"
set "OC_FLAGS="
call :stop_launched desktop-relaunch
timeout /t 2 /nobreak >nul 2>&1
:launch_go
REM v2.52: Electron prints "Most NODE_OPTIONs are not supported in packaged apps" when NODE_OPTIONS is set (VPN Gate sets it).
REM The desktop app gets none; the value is restored when it exits.
if /i "%APP_MODE%"=="DESKTOP" if defined NODE_OPTIONS set "OC_NODE_OPTS=%NODE_OPTIONS%"
if /i "%APP_MODE%"=="DESKTOP" if defined NODE_OPTIONS set "NODE_OPTIONS="
set "OC_PIDF=%STATE_DIR%\tui.pid"
set "OC_LPIDF=%STATE_DIR%\oc_launched.pid"
set "OC_LAUNCHLOG=%STATE_DIR%\launcher.log"
if exist "%OC_PIDF%" del /f /q "%OC_PIDF%" >nul 2>&1
REM Start-Process -ArgumentList treats one spaced string as ONE argument:
REM split the flags into tokens first (FLAGS is only --continue here).
REM PowerShell 5.1 REJECTS an empty -ArgumentList ("El argumento es NULL,
REM ..."): a fresh start has no --continue, so the plain-exe branch must
REM omit the parameter entirely when the list is empty.
REM .cmd and .bat files are started through cmd.exe, others are started directly.
REM v2.25: the .cmd/.bat branch used to pass @('/c',$exe)+$a, which never
REM quotes $exe: a path with a space ("C:\Users\John Smith\...") ran as
REM "C:\Users\John" and died. The whole line is now one string, wrapped in
REM the extra quote pair that /s strips, with the exe quoted inside it.
"%PSX%" -NoProfile -Command "$exe=$env:OC_EXE; if(-not $exe -or -not (Test-Path -LiteralPath $exe)){ exit 9009 }; $a=@(); if($env:OC_FLAGS){ $a=([string]$env:OC_FLAGS) -split [char]32; $a=@($a | Where-Object { $_ }) }; if($env:OC_PROMPT){ $pvp=[string]$env:OC_PROMPT; foreach($ch in '&','|','<','>','^',[string][char]37,[string][char]34){ $pvp=$pvp.Replace($ch,' ') }; $a+=@('--prompt',([char]34+$pvp+[char]34)) }; $p=$null; if($exe -match '[.](cmd|bat)$'){ $q=[char]34; $cl='/s /c '+$q+$q+$exe+$q; foreach($x in $a){ $cl+=' '+$x }; $cl+=$q; $p=Start-Process cmd.exe -ArgumentList $cl -NoNewWindow -PassThru } elseif($a.Count){ $p=Start-Process $exe -ArgumentList @($a) -NoNewWindow -PassThru } else { $p=Start-Process $exe -NoNewWindow -PassThru }; if(-not $p){ exit 1 }; $null=$p.Handle; Set-Content -LiteralPath $env:OC_PIDF -Value $p.Id; try{ Set-Content -LiteralPath $env:OC_LPIDF -Value ([string]$p.Id + ' ' + $p.StartTime.Ticks); if($env:LOG_ENABLED -ne '0'){ Add-Content -LiteralPath $env:OC_LAUNCHLOG -Encoding OEM -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] [' + $env:OC_SID + '] [proc] start pid=' + $p.Id + ' exe=' + (Split-Path -Leaf $exe)) } }catch{}; [void]$p.WaitForExit(); if($p.ExitCode -ne $null){ exit $p.ExitCode }; exit 1"
set "EC=%errorlevel%"
if defined OC_NODE_OPTS set "NODE_OPTIONS=%OC_NODE_OPTS%"
set "OC_NODE_OPTS="
if defined C_ACC <nul set /p "=%C_ACC%"
if "%EC%"=="9009" echo   OpenCode not found: the path is empty or does not exist.
goto :eof

REM - resume message under a hard time limit
REM usage: call :resume_run -c [--standalone] --auto
REM stdout goes to resume.out, stderr to resume.err, and the whole tree is
REM killed after RESUME_TIMEOUT seconds. Returns 124 on timeout, otherwise
REM the real exit code of opencode.
:resume_run
set "OC_EXE=%OC_CMD%"
set "OC_FL=%*"
if not defined RESUME_MSG set "RESUME_MSG=continue"
if not defined OC_MSG set "OC_MSG=%RESUME_MSG%"
set "OC_OUTF=%STATE_DIR%\resume.out"
set "OC_ERRF=%STATE_DIR%\resume.err"
set "OC_TO=%RESUME_TIMEOUT%"
set "OC_IDLE=%RESUME_IDLE%"
if exist "%OC_OUTF%" del /f /q "%OC_OUTF%" >nul 2>&1
if exist "%OC_ERRF%" del /f /q "%OC_ERRF%" >nul 2>&1
"%PSX%" -NoProfile -Command "$exe=$env:OC_EXE; if(-not $exe -or -not (Test-Path -LiteralPath $exe)){ exit 9009 }; $a=@('run'); if($env:OC_FL){ $a+=@($env:OC_FL -split [char]32 | Where-Object { $_ }) }; if($env:OC_MSG){ $mm=$env:OC_MSG; if($exe -match '[.](cmd|bat)$'){ $mm=$mm -replace '[&|<>^%%]',' ' }; $a+=([char]34 + $mm + [char]34) }; $a=@($a | Where-Object { $_ }); $o=$env:OC_OUTF; $e=$env:OC_ERRF; if($exe -match '[.](cmd|bat)$'){ $q=[char]34; $cl='/s /c '+$q+$q+$exe+$q; foreach($x in $a){ $cl+=' '+$x }; $cl+=$q; $p=Start-Process cmd.exe -ArgumentList $cl -NoNewWindow -PassThru -RedirectStandardOutput $o -RedirectStandardError $e } else { $p=Start-Process $exe -ArgumentList $a -NoNewWindow -PassThru -RedirectStandardOutput $o -RedirectStandardError $e }; if(-not $p){ exit 1 }; $null=$p.Handle; $lim=[int]$env:OC_TO; $idle=[int]$env:OC_IDLE; $t=0; $last=-1; $lastT=0; $ok=$false; while($t -lt $lim){ if($p.WaitForExit(1000)){ $ok=$true; break }; $t++; $sz=0; if(Test-Path -LiteralPath $o){ $sz=(Get-Item -LiteralPath $o).Length }; if($sz -ne $last){ $last=$sz; $lastT=$t }; if(($t-$lastT) -ge $idle){ break } }; if(-not $ok){ if(-not $p.HasExited){ Start-Process taskkill.exe -ArgumentList @('/T','/F','/PID',$p.Id) -WindowStyle Hidden -Wait }; exit 124 }; exit $p.ExitCode"
exit /b %errorlevel%

REM - print what the resume actually said
REM Only called on failure: the last lines of each stream, indented.
:resume_tail
if not exist "%STATE_DIR%\resume.err" if not exist "%STATE_DIR%\resume.out" goto :eof
call :msg %T_149%
set "OC_TF=%STATE_DIR%\resume.err"
"%PSX%" -NoProfile -Command "if(Test-Path -LiteralPath $env:OC_TF){ Get-Content -LiteralPath $env:OC_TF -Tail 8 | ForEach-Object { '     ' + $_ } }"
call :msg %T_150%
set "OC_TF=%STATE_DIR%\resume.out"
"%PSX%" -NoProfile -Command "if(Test-Path -LiteralPath $env:OC_TF){ Get-Content -LiteralPath $env:OC_TF -Tail 8 | ForEach-Object { '     ' + $_ } }"
goto :eof

REM - the watcher: tail the log, kill the TUI only when stuck
REM Polls every 2 seconds. On a fatal pattern it waits 4 seconds and
REM re-reads: if normal activity (INFO/DEBUG) followed the error, the
REM session recovered on its own and is left alone. Only a stuck chat
REM gets killed, and it kills exactly the tracked PID tree.
REM The watcher runs in the background (start /b). It reads the log
REM from SIZE_BEFORE onward, and if the TUI is still alive after a
REM confirmed fatal error, it writes watch_hit.txt and kills the tree.
REM Starts the background PowerShell watcher. Does nothing if WATCH is not 1,
REM the egress is NONE, or WARP mode has no WARP.
:watch_start
if not "%WATCH%"=="1" goto :eof
REM Clear leftovers from a previous run (also in modes that do not watch).
if exist "%STATE_DIR%\watch_hit.txt" del /f /q "%STATE_DIR%\watch_hit.txt" >nul 2>&1
if exist "%STATE_DIR%\watch_ask.txt" del /f /q "%STATE_DIR%\watch_ask.txt" >nul 2>&1
if exist "%STATE_DIR%\watch.pid" del /f /q "%STATE_DIR%\watch.pid" >nul 2>&1
REM v2.22: the egress watchdog writes here, and the launcher reads it back
REM after the TUI closes.
if exist "%STATE_DIR%\proxy_warn.txt" del /f /q "%STATE_DIR%\proxy_warn.txt" >nul 2>&1
if /i "%EGRESS%"=="NONE" goto :eof
if /i "%EGRESS%"=="WARP" if not defined WARP goto :eof
REM Paths and settings passed to the watcher through the environment.
set "OC_WPIDF=%STATE_DIR%\watch.pid"
set "OC_TPIDF=%STATE_DIR%\tui.pid"
set "OC_HITF=%STATE_DIR%\watch_hit.txt"
REM v2.44: an ask= line (rate limit) never kills the TUI; the launcher asks after it closes.
set "OC_ASKF=%STATE_DIR%\watch_ask.txt"
REM v2.45: the watcher writes the fatal line to launcher.log, so the cause of a rotation is kept.
set "OC_LAUNCHLOG=%STATE_DIR%\launcher.log"
set "OC_LOGF=%LOGFILE%"
set "OC_OFF=%SIZE_BEFORE%"
REM v2.22: proxy watchdog target (host:port). The watcher polls it every
REM minute and warns when the egress dies with the TUI open. It never kills
REM the TUI: a dead proxy is a warning, not a verdict on the session.
set "OC_WATCHP="
set "OC_PWARNF=%STATE_DIR%\proxy_warn.txt"
if /i "%EGRESS%"=="WARP" set "OC_WATCHP=127.0.0.1:%PROXY_PORT%"
if /i "%EGRESS%"=="TOR" set "OC_WATCHP=127.0.0.1:%TOR_HTTP_PORT%"
if /i "%EGRESS%"=="PROXY" if defined ACTIVE_PROXY set "OC_WATCHP=%ACTIVE_PROXY%"
REM Watcher body (PowerShell, one line). Its steps in order:
REM  1) save its own PID, 2) wait up to 60 s for the TUI PID,
REM  3) loop every 2 s: read new log bytes, look for a fatal pattern,
REM     re-read after 4 s, ignore it if INFO or DEBUG lines followed,
REM     otherwise write the hit marker and kill the TUI process tree.
REM v2.40: the watcher saves PID|StartTime so :watch_stop never kills a process that reused its PID.
start "" /b "%PSX%" -NoProfile -Command "([string]$PID + '|' + (Get-Process -Id $PID).StartTime.Ticks) | Set-Content -LiteralPath $env:OC_WPIDF; iex $env:OC_PLOAD; $cls=[scriptblock]::Create($env:OC_CLS); $nl=0; $asked=$false; $cut={ param($s) $s=(([string]$s) -replace '\s+',' ').Trim(); if($s.Length -gt 300){$s=$s.Substring(0,300)}; $s }; $lg={ param($m) try{ Add-Content -LiteralPath $env:OC_LAUNCHLOG -Encoding OEM -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] [watch] ' + $m) }catch{} }; $tpid=0; $off=0; $tick=0; $pfail=0; if($env:OC_OFF){$off=[int64]$env:OC_OFF}; $dl=(Get-Date).AddSeconds(60); while($tpid -eq 0){ if((Get-Date) -gt $dl){exit 0}; if(Test-Path -LiteralPath $env:OC_TPIDF){ $c=(Get-Content -LiteralPath $env:OC_TPIDF -ErrorAction SilentlyContinue | Select-Object -First 1); if($c){$tpid=[int]$c} }; if($tpid -eq 0){Start-Sleep -Seconds 1} }; while($true){ Start-Sleep -Seconds 2; $p=Get-Process -Id $tpid -ErrorAction SilentlyContinue; if(-not $p){exit 0}; $tick++; if($tick -ge 30){ $tick=0; if($env:OC_WATCHP){ try{ $hp=($env:OC_WATCHP -replace '^[A-Za-z0-9]+://',''); $ix=$hp.LastIndexOf([char]58); $ph=$hp.Substring(0,$ix); $pp=[int]$hp.Substring($ix+1); $c=New-Object Net.Sockets.TcpClient; $ar=$c.BeginConnect($ph,$pp,$null,$null); if($ar.AsyncWaitHandle.WaitOne(2500)){ $c.EndConnect($ar); $c.Close(); $pfail=0 } else { $pfail++ } }catch{ try{$c.Close()}catch{}; $pfail++ }; if($pfail -ge 3){ try{ Set-Content -LiteralPath $env:OC_PWARNF -Value ('egress proxy stopped answering: ' + $env:OC_WATCHP) }catch{}; $pfail=0 } } }; $t=''; try{ $fs=[IO.File]::Open($env:OC_LOGF,'Open','Read','ReadWrite'); if($fs.Length -lt $off){$off=0}; if($fs.Length -gt $off){ [void]$fs.Seek($off,'Begin'); $sr=New-Object IO.StreamReader($fs); $t=$sr.ReadToEnd(); $off=$fs.Length; $sr.Close() } else { $fs.Close() } }catch{ continue }; $hit=$false; foreach($l in ($t -split [char]10)){ $c=& $cls $l; if($c -eq 'rotate'){ $hit=$true } elseif($c -eq 'noop' -and $nl -lt 20){ $nl++; & $lg ('category=noop action=none line: ' + (& $cut $l)) } elseif($c -eq 'ask' -and -not $asked){ $asked=$true; try{ Set-Content -LiteralPath $env:OC_ASKF -Value 'ASK' }catch{}; & $lg ('category=ask action=ask-after-close line: ' + (& $cut $l)) } }; if(-not $hit){ continue }; Start-Sleep -Seconds 4; $t2=''; try{ $fs2=[IO.File]::Open($env:OC_LOGF,'Open','Read','ReadWrite'); if($fs2.Length -gt $off){ [void]$fs2.Seek($off,'Begin'); $sr2=New-Object IO.StreamReader($fs2); $t2=$sr2.ReadToEnd(); $off=$fs2.Length; $sr2.Close() } else { $fs2.Close() } }catch{}; $lines=($t+$t2) -split [char]10; $idx=-1; for($i=0;$i -lt $lines.Count;$i++){ if((& $cls $lines[$i]) -eq 'rotate'){$idx=$i} }; $rec=$false; if($idx -ge 0){ for($j=$idx+1;$j -lt $lines.Count;$j++){ if($lines[$j] -match 'level=(INFO|DEBUG)'){$rec=$true} } }; if($rec){ continue }; $p2=Get-Process -Id $tpid -ErrorAction SilentlyContinue; if($p2){ try{ $fl=[string]$lines[[Math]::Max($idx,0)]; $fl=($fl -replace '\s+',' ').Trim(); if($fl.Length -gt 300){$fl=$fl.Substring(0,300)}; Add-Content -LiteralPath $env:OC_LAUNCHLOG -Encoding OEM -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] [watch] category=rotate action=rotate line: ' + $fl) }catch{}; try{Set-Content -LiteralPath $env:OC_HITF -Value 'HIT'}catch{}; Start-Process taskkill.exe -ArgumentList @('/T','/F','/PID',$tpid) -WindowStyle Hidden -Wait; exit 1 } }"     
goto :eof

REM Stop the watcher and remove the PID files once the TUI has closed.
:watch_stop
if not exist "%STATE_DIR%\watch.pid" goto :ws_clean
REM v2.40: kill only if the PID still belongs to the watcher (same start time); it usually exited with the TUI.
set "OC_WPIDF=%STATE_DIR%\watch.pid"
"%PSX%" -NoProfile -Command "try{ $v=@((Get-Content -LiteralPath $env:OC_WPIDF -TotalCount 1) -split '\|'); $p=Get-Process -Id ([int]$v[0]) -ErrorAction Stop; if($v.Count -gt 1 -and [string]$p.StartTime.Ticks -eq $v[1]){ Stop-Process -Id $p.Id -Force } }catch{}" >nul 2>&1
del /f /q "%STATE_DIR%\watch.pid" >nul 2>&1
:ws_clean
if exist "%STATE_DIR%\tui.pid" del /f /q "%STATE_DIR%\tui.pid" >nul 2>&1
goto :eof

REM - scan the log from a byte offset for a fatal pattern
REM usage: call :scan_log <offset>; sets FHIT=1 when the delta matches.
REM Reads the log from the given byte offset and writes HIT or NOHIT to a temp file.
REM The result is read back into FHIT, and the temp file is removed.
:scan_log
set "FHIT="
set "FASK="
set "SCANF=%TEMP%\oc_scan_%RANDOM%%RANDOM%.txt"
if exist "%SCANF%" del /f /q "%SCANF%" >nul 2>&1
set "OC_SCANF=%SCANF%"
set "OC_LAUNCHLOG=%STATE_DIR%\launcher.log"
set "OC_OFF=%~1"
"%PSX%" -NoProfile -Command "try{ $fs=[IO.File]::Open($env:OC_LOGF,'Open','Read','ReadWrite'); if($fs.Length -lt [int64]$env:OC_OFF){ Set-Content -LiteralPath $env:OC_SCANF -Value 'NOHIT' } else { [void]$fs.Seek([int64]$env:OC_OFF,'Begin'); $sr=New-Object IO.StreamReader($fs); $t=$sr.ReadToEnd(); $sr.Close(); iex $env:OC_PLOAD; $cls=[scriptblock]::Create($env:OC_CLS); $r='NOHIT'; $nl=0; foreach($l in ($t -split [char]10)){ $c=& $cls $l; if($c -eq 'rotate'){ $r='HIT'; break }; if($c -eq 'ask'){ $r='ASK' }; if($c -eq 'noop' -and $nl -lt 5){ $nl++; $s=(([string]$l) -replace '\s+',' ').Trim(); if($s.Length -gt 300){$s=$s.Substring(0,300)}; try{ Add-Content -LiteralPath $env:OC_LAUNCHLOG -Encoding OEM -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] [scan] category=noop action=none line: ' + $s) }catch{} } }; Set-Content -LiteralPath $env:OC_SCANF -Value $r } }catch{ try{ Set-Content -LiteralPath $env:OC_SCANF -Value 'NOHIT' }catch{} }" >nul 2>&1
if exist "%SCANF%" for /f "usebackq delims=" %%q in ("%SCANF%") do if /i "%%q"=="HIT" set "FHIT=1"
if exist "%SCANF%" for /f "usebackq delims=" %%q in ("%SCANF%") do if /i "%%q"=="ASK" set "FASK=1"
if exist "%SCANF%" del /f /q "%SCANF%" >nul 2>&1
goto :eof

REM - one probe message on the throwaway session
REM exit 0 = the IP can talk, exit 1 = failure. PCLASS is set for the caller:
REM "burned" = a limit-shaped answer, the IP is spent; "broken" = the probe
REM itself failed for another reason (a retired PROBE_MODEL id, an auth
REM error, a CLI change) and no rotation can fix that.
REM The probe NEVER rides the shared background service: on v2 a plain "run"
REM connects to the long-lived service process, which was born with the OLD
REM tunnel's sockets and proxy env. Every brand-new IP would then be probed
REM from the burned route and read as burned forever. When --standalone
REM exists (v2), the probe gets its own server born with THIS proxy env,
REM exactly like the resume does; v1 has no such flag and keeps the old call.
:probe_once
set "PCLASS=burned"
set "PROBE_TMO="
set "PROBE_RTO="
set "HTTP_PROXY=%PROXY%"
set "HTTPS_PROXY=%PROXY%"
set "POUTF=%STATE_DIR%\probe.out"
set "PERRF=%STATE_DIR%\probe.err"
REM The probe creates its own session (a fixed -s id is refused by some builds).
REM :probe_cleanup then deletes only that session.
set "PRB_M=%PROBE_MODEL%"
if defined OC_MODEL set "PRB_M=%OC_MODEL%"
set "PARGS=--title ocinf-probe --auto"
if defined PRB_M set "PARGS=-m %PRB_M% %PARGS%"
if defined CAP_STANDALONE set "PARGS=%PARGS% --standalone"
if exist "%POUTF%" del /f /q "%POUTF%" >nul 2>&1
if exist "%PERRF%" del /f /q "%PERRF%" >nul 2>&1
REM No usable offset = no verdict from the log. Never scan the whole file:
REM it still holds every old quota error and would fail every probe.
set "PZB="
for %%S in ("%LOGFILE%") do if not "%%~zS"=="" set "PZB=%%~zS"
REM v2.40: the probe runs through :resume_run, so a hung IP is killed after RESUME_TIMEOUT (124) instead of freezing the hunt.
call :probe_newest PROBE_N0
set "PRB_MSG0=%OC_MSG%"
set "OC_MSG=reply with just: ok"
REM v2.60 (N91): without CAP_STANDALONE the probe rides the service born with the old
REM tunnel, so its verdict belongs to the burned route. The service is restarted with
REM this proxy exported first; a failure is logged and the probe still runs.
call :probe_svc_guard
call :resume_run %PARGS%
set "PEC=%errorlevel%"
set "OC_MSG=%PRB_MSG0%"
set "PRB_MSG0="
move /y "%STATE_DIR%\resume.out" "%POUTF%" >nul 2>&1
move /y "%STATE_DIR%\resume.err" "%PERRF%" >nul 2>&1
REM v2.23: restore the user's own proxy variables instead of deleting them.
call :restore_env
REM v2.60 (N91): a timeout (124) is not evidence that the IP is burned: the limit was
REM never seen. One retry with double RESUME_TIMEOUT, then broken. burned is only ever
REM set by a limit answer.
set "PBURNED="
if not "%PEC%"=="124" goto :probe_judge
if defined PROBE_TMO goto :probe_bad
set "PROBE_TMO=1"
set "PROBE_RTO=%RESUME_TIMEOUT%"
set /a RESUME_TIMEOUT=RESUME_TIMEOUT*2
call :log "probe timeout: retrying with resume timeout %RESUME_TIMEOUT%s" probe
call :resume_run %PARGS%
set "PEC=%errorlevel%"
set "RESUME_TIMEOUT=%PROBE_RTO%"
set "PROBE_RTO="
move /y "%STATE_DIR%\resume.out" "%POUTF%" >nul 2>&1
move /y "%STATE_DIR%\resume.err" "%PERRF%" >nul 2>&1
call :restore_env
if "%PEC%"=="124" goto :probe_bad
:probe_judge
if not "%PEC%"=="0" goto :probe_classify
REM v2.60: a clean exit is a good IP. The answer may quote limit words ("usage limit
REM reached") and the shared log may hold another chat's limit line, so neither marks
REM the IP burned here. Only a failed run reads limit text (:probe_classify).
set "PBURNED="
REM pass: delete the probe session so --continue points at the chat
call :probe_cleanup
exit /b 0
REM Failure: decide whether it was a limit error or a broken probe.
:probe_classify
set "PBURNED="
if exist "%PERRF%" findstr /i /c:"free usage limit" /c:"usage limit reached" /c:"out of usage" /c:"insufficient credits" /c:"payment required" "%PERRF%" >nul 2>&1 && set "PBURNED=1"
if not defined PBURNED if exist "%POUTF%" findstr /i /c:"free usage limit" /c:"usage limit reached" /c:"out of usage" /c:"insufficient credits" /c:"payment required" "%POUTF%" >nul 2>&1 && set "PBURNED=1"
REM v3.6: a country block on this model is a burned IP too (it was filed as a broken probe).
if not defined PBURNED if exist "%PERRF%" findstr /i /c:"not available in your country" "%PERRF%" >nul 2>&1 && set "PBURNED=1"
if not defined PBURNED if exist "%POUTF%" findstr /i /c:"not available in your country" "%POUTF%" >nul 2>&1 && set "PBURNED=1"
REM v2.22 (defensive): a CLI that refuses the fixed probe session says so
REM in its own words. Catch that shape before the miss is filed as a
REM "broken probe", so the rotation loop can report it as what it is.
if not defined PBURNED if exist "%PERRF%" findstr /i /c:"session not found" /c:"no such session" /c:"session does not exist" /c:"unknown session" "%PERRF%" >nul 2>&1 && set "PCLASS=nosession"
if not defined PBURNED if exist "%POUTF%" findstr /i /c:"session not found" /c:"no such session" /c:"session does not exist" /c:"unknown session" "%POUTF%" >nul 2>&1 && set "PCLASS=nosession"
REM the CLI also answers a refused probe session with "Database is not empty" (seen in the field).
if not defined PBURNED if exist "%PERRF%" findstr /i /c:"database is not empty" "%PERRF%" >nul 2>&1 && set "PCLASS=nosession"
if not defined PBURNED if exist "%POUTF%" findstr /i /c:"database is not empty" "%POUTF%" >nul 2>&1 && set "PCLASS=nosession"
:probe_bad
if not defined PBURNED if /i not "%PCLASS%"=="nosession" set "PCLASS=broken"
REM Delete the probe session on both paths, so it never lingers as the
REM newest session while the hunt keeps going.
call :probe_cleanup
exit /b 1

REM v2.60 (N91): restart the long-lived service with the probe's proxy, so an IP is not
REM probed through the sockets of the old tunnel when CAP_STANDALONE is missing.
:probe_svc_guard
if defined CAP_STANDALONE goto :eof
if not defined CAP_SERVICE goto :eof
call :export_proxy
call "%OC_CMD%" service restart >nul 2>&1
set "PSVC=%ERRORLEVEL%"
call :restore_env
if not "%PSVC%"=="0" call :log "probe: service restart failed rc=%PSVC%, the probe may ride the old service" probe
set "PSVC="
goto :eof

REM v2.60 (N30): a session list call with a deadline, so a hung CLI cannot freeze the
REM launcher after a rotation. usage: call :sess_list_bounded OUTFILE COUNT
REM errorlevel 124 = the call was killed after WHERE_TIMEOUT seconds.
:sess_list_bounded
set "OC_SLB_F=%~1"
set "OC_SLB_N=%~2"
set "OC_SLB_TO=%WHERE_TIMEOUT%"
"%PSX%" -NoProfile -Command "try{ $p=Start-Process -FilePath $env:OC_CMD -ArgumentList @('session','list','--format','json','-n',$env:OC_SLB_N) -NoNewWindow -PassThru -RedirectStandardOutput $env:OC_SLB_F -RedirectStandardError ($env:OC_SLB_F+'.err') }catch{ exit 1 }; if(-not $p){ exit 1 }; $null=$p.Handle; if(-not $p.WaitForExit([int]$env:OC_SLB_TO*1000)){ Start-Process taskkill.exe -ArgumentList @('/T','/F','/PID',$p.Id) -WindowStyle Hidden -Wait; exit 124 }; exit 0" >nul 2>&1
exit /b %errorlevel%

REM - newest top-level session id, empty when none or unreadable. usage: call :probe_newest VAR
:probe_newest
set "%~1="
set "OC_PLJ=%STATE_DIR%\probe_list.json"
REM v2.60 (N30): bounded; a timeout reads as "no id" instead of freezing the launcher.
call :sess_list_bounded "%OC_PLJ%" 1
if errorlevel 124 call :log "probe_newest: session list timed out after %WHERE_TIMEOUT%s" probe
for /f "usebackq delims=" %%i in (`%PSX% -NoProfile -Command "try{ $r=@(Get-Content -LiteralPath $env:OC_PLJ -Raw | ConvertFrom-Json); if($r.Count -and $r[0].id){ [string]$r[0].id } }catch{}"`) do set "%~1=%%i"
if exist "%OC_PLJ%" del /f /q "%OC_PLJ%" >nul 2>&1
exit /b 0

REM - delete the session this probe created; an older one is never deleted (the id must change)
:probe_cleanup
REM v3.1 (N31): the newest id was deleted whenever it differed from PROBE_N0, without
REM proof that this probe had created it. When the first read failed, PROBE_N0 was empty
REM and this deleted the user's newest chat. Now it needs PROBE_N0 and the probe title.
if not defined PROBE_N0 goto :pc_done
call :probe_newest PROBE_N1
if not defined PROBE_N1 goto :pc_done
if "%PROBE_N1%"=="%PROBE_N0%" goto :pc_done
set "OC_PN1=%PROBE_N1%"
set "OC_PLJ2=%STATE_DIR%\probe_del.json"
REM v2.60 (N30): bounded like :probe_newest; a timeout leaves no id, so nothing is deleted.
call :sess_list_bounded "%OC_PLJ2%" 5
if errorlevel 124 call :log "probe_cleanup: session list timed out after %WHERE_TIMEOUT%s" probe
set "OC_PCL="
for /f "usebackq delims=" %%t in (`%PSX% -NoProfile -Command "try{ $r=@(Get-Content -LiteralPath $env:OC_PLJ2 -Raw | ConvertFrom-Json); $m=@($r | Where-Object { [string]$_.id -eq $env:OC_PN1 }); if($m.Count -and ([string]$m[0].title) -like 'ocinf-probe*'){ 'ok' } }catch{}"`) do set "OC_PCL=%%t"
if exist "%OC_PLJ2%" del /f /q "%OC_PLJ2%" >nul 2>&1
if /i "%OC_PCL%"=="ok" call "%OC_CMD%" session delete %PROBE_N1% >nul 2>&1
:pc_done
set "PROBE_N1="
set "OC_PCL="
exit /b 0

REM - show the last output the probe produced (failure reports only)
:probe_print
set "OC_TF=%STATE_DIR%\probe.err"
"%PSX%" -NoProfile -Command "if(Test-Path -LiteralPath $env:OC_TF){ Get-Content -LiteralPath $env:OC_TF -Tail 4 | ForEach-Object { '     ' + $_ } }"
set "OC_TF=%STATE_DIR%\probe.out"
"%PSX%" -NoProfile -Command "if(Test-Path -LiteralPath $env:OC_TF){ Get-Content -LiteralPath $env:OC_TF -Tail 4 | ForEach-Object { '     ' + $_ } }"
goto :eof

REM - locate warp-cli anywhere reasonable
REM Search in order: PATH, then the standard install folders.
REM Sets WARP to the first path found. Leaves it empty if none exists.
:find_warp
set "WARP="
set "WF=%TEMP%\oc_where_warp_%RANDOM%%RANDOM%.txt"
call :bwhere warp-cli.exe "%WF%"
if exist "%WF%" for /f "usebackq delims=" %%w in ("%WF%") do if not defined WARP set "WARP=%%w"
del /f /q "%WF%" >nul 2>&1
if defined WARP goto :eof
if exist "%ProgramFiles%\Cloudflare\Cloudflare WARP\warp-cli.exe" set "WARP=%ProgramFiles%\Cloudflare\Cloudflare WARP\warp-cli.exe"
if defined WARP goto :eof
REM 32-bit Program Files folder, when it exists.
set "PF86="
if defined ProgramFiles(x86) set "PF86=%ProgramFiles(x86)%"
if defined PF86 if exist "%PF86%\Cloudflare\Cloudflare WARP\warp-cli.exe" set "WARP=%PF86%\Cloudflare\Cloudflare WARP\warp-cli.exe"
if defined WARP goto :eof
if defined ProgramW6432 if exist "%ProgramW6432%\Cloudflare\Cloudflare WARP\warp-cli.exe" set "WARP=%ProgramW6432%\Cloudflare\Cloudflare WARP\warp-cli.exe"
if defined WARP goto :eof
if exist "%LOCALAPPDATA%\Cloudflare\Cloudflare WARP\warp-cli.exe" set "WARP=%LOCALAPPDATA%\Cloudflare\Cloudflare WARP\warp-cli.exe"
goto :eof

REM - one "where" lookup with a hard time limit
REM usage: call :bwhere "name1 name2" "outfile"
REM where.exe walks every PATH entry, and a dead mapped drive or an offline
REM UNC share makes it block for minutes before a single line is printed.
REM The lookup is killed after WHERE_TIMEOUT seconds and the output file
REM keeps whatever was found before the kill.
:bwhere
set "OC_WN=%~1"
set "OC_WF=%~2"
set "OC_WTO=%WHERE_TIMEOUT%"
set "OC_BWRC="
set "OC_BWF="
if exist "%OC_WF%" del /f /q "%OC_WF%" >nul 2>&1
"%PSX%" -NoProfile -Command "$names=@($env:OC_WN -split ' ' | Where-Object { $_ }); $f=$env:OC_WF; $to=[int]$env:OC_WTO*1000; $p=Start-Process where.exe -ArgumentList $names -NoNewWindow -PassThru -RedirectStandardOutput $f -RedirectStandardError ($f+'.err'); if(-not $p){ exit 1 }; $null=$p.Handle; if(-not $p.WaitForExit($to)){ Start-Process taskkill.exe -ArgumentList @('/T','/F','/PID',$p.Id) -WindowStyle Hidden -Wait; exit 124 }; exit 0" >nul 2>&1
REM v3.1 (N32): a killed where left half a line in the file and a non-zero exit still
REM counted as "found". Only a clean exit is trusted and every line must be a real file.
set "OC_BWRC=%errorlevel%"
if not "%OC_BWRC%"=="0" if exist "%OC_WF%" del /f /q "%OC_WF%" >nul 2>&1
if "%OC_BWRC%"=="0" if exist "%OC_WF%" set "OC_BWF=%OC_WF%"
if defined OC_BWF "%PSX%" -NoProfile -Command "try{ $f=$env:OC_BWF; $l=@(Get-Content -LiteralPath $f -ErrorAction SilentlyContinue | Where-Object { $_ -and (Test-Path -LiteralPath $_) }); [IO.File]::WriteAllLines($f, [string[]]$l) }catch{}" >nul 2>&1
if exist "%OC_WF%.err" del /f /q "%OC_WF%.err" >nul 2>&1
goto :eof

REM - is this command on PATH? (bounded, unlike a bare where)
REM usage: call :have_exe curl.exe   -> HAVE=1 when found, HAVE=0 when not.
:have_exe
set "HAVE=0"
set "OC_WF=%TEMP%\oc_where_%RANDOM%%RANDOM%.txt"
call :bwhere "%~1" "%OC_WF%"
if exist "%OC_WF%" for %%F in ("%OC_WF%") do if not "%%~zF"=="0" set "HAVE=1"
del /f /q "%OC_WF%" >nul 2>&1
goto :eof

REM - one warp-cli call with a hard time limit
REM usage: call :wcli registration new
REM A hung call is killed after WARP_CALL_TIMEOUT seconds. Failures
REM are logged to %STATE_DIR%\wcli.log with a timestamp, the exit
REM code, the exact subcommand AND the daemon's own error text (last
REM non-empty stdout/stderr line). Without that text the log only
REM ever says "exit 1" and nobody can tell Registration missing from
REM a daemon that is not listening. Every value travels through the
REM environment, so no path can break the PowerShell command line.
:wcli
if not defined WARP exit /b 9009
set "WCMD=%*"
set "OC_EXE=%WARP%"
set "OC_ARGS=--accept-tos %WCMD%"
set "OC_LOG=%STATE_DIR%\wcli.log"
set "OC_TO=%WARP_CALL_TIMEOUT%"
set "OC_RRF=%STATE_DIR%\wcli_out.txt"
REM v2.22: WCLI_QUIET=1 silences one call (no console line, no wcli.log
REM entry). Used by the registration poll in :reg_drop, where a failure is
REM the expected answer and used to fill wcli.log with noise.
set "OC_QUIET="
if defined WCLI_QUIET set "OC_QUIET=1"
"%PSX%" -NoProfile -Command "$o=$env:OC_RRF; $p=Start-Process -FilePath $env:OC_EXE -ArgumentList $env:OC_ARGS -NoNewWindow -PassThru -RedirectStandardOutput $o -RedirectStandardError ($o+'.err'); if(-not $p){ exit 1 }; $null=$p.Handle; if(-not $p.WaitForExit([int]$env:OC_TO*1000)){ Start-Process taskkill.exe -ArgumentList @('/T','/F','/PID',$p.Id) -WindowStyle Hidden -Wait; try{Add-Content -LiteralPath $env:OC_LOG -Value (((Get-Date -Format o)+' TIMEOUT: '+$env:OC_ARGS))}catch{}; exit 1 }; if($p.ExitCode -eq $null){ exit 1 }; $rc=$p.ExitCode; if($rc -ne 0){ $why=''; foreach($f in @($o,($o+'.err'))){ if(Test-Path -LiteralPath $f){ $l=@(Get-Content -LiteralPath $f -ErrorAction SilentlyContinue | Where-Object { $_ }); if($l.Count){ $why=$l[$l.Count-1]; break } } }; $line=((Get-Date -Format o)+' exit '+$rc+': '+$env:OC_ARGS); if($why){ $line=$line+' :: '+$why }; if(-not $env:OC_QUIET){ try{Add-Content -LiteralPath $env:OC_LOG -Value $line}catch{} }; exit $rc }; exit 0" >nul 2>&1
REM v2.36: the exit code is read BEFORE the cleanup. A successful del sets ERRORLEVEL to 0, so every warp-cli call
REM used to look successful (the failure was only written to wcli.log) and no retry or fallback ever ran.
set "WCLIRC=%errorlevel%"
if exist "%OC_RRF%" del /f /q "%OC_RRF%" >nul 2>&1
if exist "%OC_RRF%.err" del /f /q "%OC_RRF%.err" >nul 2>&1
if not "%WCLIRC%"=="0" if not defined WCLI_QUIET call echo %T_334%
if not "%WCLIRC%"=="0" if not defined WCLI_QUIET call :log "warp-cli %WCMD% failed rc=%WCLIRC%" wcli
exit /b %WCLIRC%

REM - install WARP (UAC once)
REM Downloads the WARP MSI (curl if available, otherwise PowerShell),
REM checks its size, and installs it silently with an elevated msiexec.
REM The proxy variables are cleared during the download and restored afterwards.
:install_warp
set "MSI=%TEMP%\Cloudflare_WARP_x64.msi"
if exist "%MSI%" del /f /q "%MSI%" >nul 2>&1
set "KEEP_HP=%HTTP_PROXY%"
set "KEEP_SP=%HTTPS_PROXY%"
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "OC_URL=%WARP_MSI_URL%"
set "OC_OUT=%MSI%"
call echo %T_151%
if "%HAVE_CURL%"=="1" goto :iw_curl
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri $env:OC_URL -OutFile $env:OC_OUT}catch{}" >nul 2>&1
goto :iw_check
REM Download with curl: fail on HTTP errors, 15 minute limit, no proxy.
:iw_curl
curl.exe -L -f -s --max-time 900 --noproxy "*" -o "%MSI%" "%WARP_MSI_URL%"
if not errorlevel 1 goto :iw_check
REM Direct egress failed: retry through the Windows proxy settings.
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri $env:OC_URL -OutFile $env:OC_OUT}catch{}" >nul 2>&1
:iw_check
set "HTTP_PROXY=%KEEP_HP%"
set "HTTPS_PROXY=%KEEP_SP%"
set "MSIOK=0"
if exist "%MSI%" for %%M in ("%MSI%") do if not "%%~zM"=="" if %%~zM GTR 5000000 set "MSIOK=1"
if "%MSIOK%"=="1" goto :iw_sign
call echo %T_152%
call echo %T_153%
if exist "%MSI%" del /f /q "%MSI%" >nul 2>&1
goto :eof
REM v2.60 (N06): the size only proves the file is big, and this MSI runs elevated.
REM A valid Authenticode signature from Cloudflare is required before the UAC prompt;
REM otherwise any content served in place of the MSI installed as administrator.
:iw_sign
set "OC_MSI=%MSI%"
"%PSX%" -NoProfile -Command "try{ $s=Get-AuthenticodeSignature -LiteralPath $env:OC_MSI; if($s.Status -ne 'Valid'){ exit 1 }; if(-not $s.SignerCertificate){ exit 2 }; if([string]$s.SignerCertificate.Subject -notmatch 'O=Cloudflare, Inc[.]'){ exit 2 }; exit 0 }catch{ exit 1 }" >nul 2>&1
if errorlevel 1 goto :iw_badsig
goto :iw_install
:iw_badsig
call :log "warp msi rejected: signature check failed" install
call echo %T_152%
call echo %T_153%
if exist "%MSI%" del /f /q "%MSI%" >nul 2>&1
goto :eof
REM Install silently from a random name; the UAC prompt appears here. Remove both afterwards.
REM v2.60 (N06): the file is renamed before it is used, so a file swapped into %TEMP%
REM under the announced name is not the one that runs elevated.
:iw_install
call echo %T_154%
set "MSIRND=%TEMP%\warp_%RANDOM%%RANDOM%.msi"
move /y "%MSI%" "%MSIRND%" >nul 2>&1
if not errorlevel 1 set "OC_MSI=%MSIRND%"
REM v3.1 (N07): -PassThru and the exit code. A cancelled UAC prompt, a corrupt MSI or a
REM 1603 used to end here looking exactly like a successful install.
"%PSX%" -NoProfile -Command "if(-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){ exit 9010 }; $p=$null; try{ $p=Start-Process msiexec.exe -ArgumentList ('/i ' + [char]34 + $env:OC_MSI + [char]34 + ' /qn /norestart') -Wait -PassThru }catch{}; if(-not $p){ exit 9009 }; exit $p.ExitCode" >nul 2>&1
set "MSIRC=%errorlevel%"
del /f /q "%MSI%" >nul 2>&1
if defined MSIRND del /f /q "%MSIRND%" >nul 2>&1
if not "%MSIRC%"=="0" if not "%MSIRC%"=="3010" call :log "warp msi exit %MSIRC%" install
set "MSIRC="
call :find_warp
goto :eof

REM - install opencode: official winget channel first, npm next, else the
REM standalone build from the GitHub release. Every hop is logged to
REM %STATE_DIR%\install.log so a VM that stalls shows where it stalled.
:install_opencode
REM v2.40: the only caller gets here after :find_opencode found nothing usable, so an opencode.exe that exists is broken: reinstall over it (Expand-Archive -Force) instead of doing nothing.
call :olog "install opencode start"
REM v2.28: the winget channel (SST.opencode) is frozen on 1.19.5, the old v1
REM line, so it is not used. The official build from opencode.ai goes first.
call :standalone
call :find_opencode
if defined OC_CMD goto :ioc_done
if defined OC_ABORT goto :eof
call :olog "standalone produced nothing, trying npm"
call :have_exe npm
if "%HAVE%"=="0" goto :eof
call echo %T_155%
call :npm_install
call :find_opencode
if defined OC_CMD goto :ioc_done
call :olog "npm produced nothing"
goto :eof
:ioc_done
call :olog "opencode ready: %OC_CMD%"
goto :eof

REM Standalone build. Chooses x64 or arm64; 32-bit systems go through npm.
:standalone
set "OCARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "OCARCH=arm64"
if not "%REAL86%"=="1" goto :sa_ok
REM 32-bit: opencode publishes no x86 Windows binary. The JS package
REM runs fine on 32-bit node, so the npm route is the supported path.
call :msg %T_156%
call :install_node_x86
call :npm_install opencode-ai
call :find_opencode
if defined OC_CMD (
  call :msg %T_157%
  goto :eof
)
call :msg %T_158%
call :msg %T_159%
call :msg %T_160%
call :pause_key
REM v2.22: :standalone runs inside "call :install_opencode". A "goto :quit"
REM from here jumped out of the call, ran :quit and then returned into the
REM caller anyway. Raise a flag and return; the top-level caller exits.
set "OC_ABORT=1"
goto :eof

REM Download the standalone zip from the latest GitHub release.
:sa_ok
call :oc_cli_file
call :oc_api cli "%OC_AFILE%"
if defined OCA_URL goto :sa_have
call :msg %T_161%
goto :eof
:sa_have
set "OC_URL=%OCA_URL%"
set "OCZIP=%TEMP%\opencode-windows.zip"
set "OCBIN=%LOCALAPPDATA%\opencode\bin"
call :msg %T_162%
echo     %OC_URL%
if exist "%OCZIP%" del /f /q "%OCZIP%" >nul 2>&1
REM Clear the proxy during the download, as in install_warp.
set "KEEP_HP=%HTTP_PROXY%"
set "KEEP_SP=%HTTPS_PROXY%"
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "OC_OUT=%OCZIP%"
if "%HAVE_CURL%"=="1" goto :sa_curl
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri $env:OC_URL -OutFile $env:OC_OUT}catch{}" >nul 2>&1
goto :sa_check
REM Download with curl, as in install_warp.
:sa_curl
curl.exe -L -f -s --max-time 900 --noproxy "*" -o "%OCZIP%" "%OC_URL%"
if not errorlevel 1 goto :sa_check
REM Direct egress failed: retry through the Windows proxy settings.
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri $env:OC_URL -OutFile $env:OC_OUT}catch{}" >nul 2>&1
:sa_check
set "HTTP_PROXY=%KEEP_HP%"
set "HTTPS_PROXY=%KEEP_SP%"
set "ZOK=0"
if exist "%OCZIP%" for %%Z in ("%OCZIP%") do if not "%%~zZ"=="" if %%~zZ GTR 5000000 set "ZOK=1"
if not "%ZOK%"=="1" goto :sa_bad
call :oc_sha "%OCZIP%" "%OCA_SHA%"
if "%SHAOK%"=="1" goto :sa_unzip
call :msg %T_163%
:sa_bad
call :msg %T_164%
if exist "%OCZIP%" del /f /q "%OCZIP%" >nul 2>&1
goto :eof
REM Unpack the zip into the bin folder, then add that folder to PATH for this session.
:sa_unzip
if not exist "%OCBIN%" mkdir "%OCBIN%" >nul 2>&1
call :msg %T_165%
set "OC_ZIP=%OCZIP%"
set "OC_BIN=%OCBIN%"
"%PSX%" -NoProfile -Command "try{Expand-Archive -LiteralPath $env:OC_ZIP -DestinationPath $env:OC_BIN -Force}catch{}" >nul 2>&1
del /f /q "%OCZIP%" >nul 2>&1
set "PATH=%PATH%;%OCBIN%"
if exist "%OCBIN%\opencode.exe" echo %C_OK%  [ok] installed to %OCBIN%%C_RST%
goto :eof

REM - the one-line install trail: every hop a channel attempt makes is
REM written here, so a VM that refuses to install gives the reason.
:olog
>>"%STATE_DIR%\install.log" echo [%DATE% %TIME%] %~1
call :log "%~1" install
goto :eof

REM Install opencode with npm globally, then add the npm folder to PATH for this session.
:npm_install
REM v2.28: the v2 CLI is @opencode/cli (opencode-ai is the frozen v1 line, kept
REM only for 32-bit). npm 12 blocks its postinstall unless allowed, and without
REM it bin\opencode.exe stays a 229-byte stub that prints "postinstall script
REM was not run". The flag is harmless on older npm (an unknown-config warning).
set "NPMPKG=%~1"
if not defined NPMPKG set "NPMPKG=@opencode/cli"
call :msg %T_166%
call npm install -g %NPMPKG%@latest --allow-scripts=@opencode/cli
set "PATH=%PATH%;%ProgramFiles%\nodejs;%APPDATA%\npm"
call :npm_fixbin
goto :eof

REM - repair a blocked postinstall: run it by hand when the exe is still the stub
:npm_fixbin
set "NPMROOT="
for /f "usebackq delims=" %%r in (`npm root -g 2^>nul`) do set "NPMROOT=%%r"
if not defined NPMROOT set "NPMROOT=%APPDATA%\npm\node_modules"
set "NPMCLI=%NPMROOT%\@opencode\cli"
if not exist "%NPMCLI%\postinstall.mjs" goto :eof
if exist "%NPMCLI%\bin\opencode.exe" for %%F in ("%NPMCLI%\bin\opencode.exe") do if %%~zF GTR 100000 goto :eof
call :msg %T_167%
node "%NPMCLI%\postinstall.mjs" >nul 2>&1
goto :eof
REM - 32-bit support: make sure npm exists, installing node if not
REM opencode publishes no x86 Windows binary, so npm with 32-bit node
REM is the only supported route there. Node installs through winget
REM when the Windows package manager is present, else a pinned 32-bit
REM MSI from the nodejs.org v22 LTS line; the MSI size is gated like
REM every other download and direct-egress failures retry through the
REM Windows proxy settings. /qn installs silently after the UAC prompt.
:install_node_x86
call :have_exe npm
if "%HAVE%"=="1" goto :eof
call :msg %T_168%
call :have_exe winget.exe
call :is_admin
if "%HAVE%"=="1" if "%IS_ADMIN%"=="1" goto :node_winget
goto :node_msi
REM v2.60.4: the winget and MSI installers run elevated by themselves, so they run only in an administrator window.
:is_admin
set "IS_ADMIN=0"
for /f "usebackq delims=" %%a in (`"%PSX%" -NoProfile -Command "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)" `) do if /i "%%a"=="True" set "IS_ADMIN=1"
exit /b 0
:node_winget
call :msg %T_169%
call :msg %T_170%
"%PSX%" -NoProfile -Command "$p=Start-Process -FilePath winget.exe -ArgumentList @('install','--id','OpenJS.NodeJS.LTS','--silent','--accept-package-agreements','--accept-source-agreements','--disable-interactivity') -NoNewWindow -PassThru; $null=$p.Handle; if(-not $p.WaitForExit(600000)){ try{$p.Kill()}catch{}; exit 1 }; exit $p.ExitCode" >nul 2>&1
if not errorlevel 1 goto :node_done
call :msg %T_171%
:node_msi
REM Pinned: the pin moves with the LTS line; bump the version tag when
REM nodejs.org retires v22 (the MSI filename embeds the version).
set "NODE_MSI_URL=https://nodejs.org/dist/v22.13.1/node-v22.13.1-x86.msi"
set "NODE_MSI=%TEMP%\node_x86.msi"
if exist "%NODE_MSI%" del /f /q "%NODE_MSI%" >nul 2>&1
set "KEEP_HP=%HTTP_PROXY%"
set "KEEP_SP=%HTTPS_PROXY%"
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "OC_URL=%NODE_MSI_URL%"
set "OC_OUT=%NODE_MSI%"
call :msg %T_172%
if "%HAVE_CURL%"=="1" goto :nx_curl
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri $env:OC_URL -OutFile $env:OC_OUT -TimeoutSec 900}catch{}" >nul 2>&1
goto :nx_check
:nx_curl
curl.exe -L -f -s --max-time 900 --noproxy "*" -o "%NODE_MSI%" "%NODE_MSI_URL%"
if not errorlevel 1 goto :nx_check
call :msg %T_173%
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri $env:OC_URL -OutFile $env:OC_OUT -TimeoutSec 900}catch{}" >nul 2>&1
REM Restore the proxy variables and check the MSI size.
:nx_check
set "HTTP_PROXY=%KEEP_HP%"
set "HTTPS_PROXY=%KEEP_SP%"
set "NOK=0"
if exist "%NODE_MSI%" for %%M in ("%NODE_MSI%") do if not "%%~zM"=="" if %%~zM GTR 1000000 set "NOK=1"
if not "%NOK%"=="1" goto :node_done
call :msg %T_174%
set "OC_MSI=%NODE_MSI%"
"%PSX%" -NoProfile -Command "if(([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){ try{Start-Process msiexec.exe -ArgumentList ('/i ' + [char]34 + $env:OC_MSI + [char]34 + ' /qn /norestart') -Wait}catch{} }" >nul 2>&1
del /f /q "%NODE_MSI%" >nul 2>&1
REM Either route: refresh the session PATH with the standard homes.
:node_done
set "PATH=%PATH%;%ProgramFiles%\nodejs;%APPDATA%\npm"
call :have_exe npm
if "%HAVE%"=="0" call :msg %T_335%
exit /b 0

REM - what this opencode build actually supports
REM The CLI surface moved between v1 and v2: v2 has the shared background
REM service, "opencode service ..." and the global --standalone flag; v1 has
REM none of them and rejects the whole command (help screen) when it sees an
REM unknown flag. Probe the top-level help once, bounded, and set the two
REM capability flags the rest of the launcher keys off. Only ASCII markers
REM are searched, so the ANSI/code-page noise in the help output is harmless.
:detect_caps
set "CAP_STANDALONE="
set "CAP_SERVICE="
if not defined OC_CMD goto :eof
REM v2.22: 8 s was too short on a cold start, and empty output is
REM indistinguishable from a v1 CLI. 15 s, plus one retry when neither
REM marker was found.
set "OC_DCR=0"
:dc_run
set "OC_VEXE=%OC_CMD%"
set "OC_VF=%TEMP%\oc_caps_%RANDOM%%RANDOM%.txt"
set "OC_VTO=15"
if exist "%OC_VF%" del /f /q "%OC_VF%" >nul 2>&1
"%PSX%" -NoProfile -Command "$exe=$env:OC_VEXE; $o=$env:OC_VF; $to=[int]$env:OC_VTO*1000; $line='call '+[char]34+$exe+[char]34+' --help 2>&1'; $p=Start-Process cmd.exe -ArgumentList @('/c',$line) -NoNewWindow -PassThru -RedirectStandardOutput $o; if($p){ $null=$p.Handle; if(-not $p.WaitForExit($to)){ Start-Process taskkill.exe -ArgumentList @('/T','/F','/PID',$p.Id) -WindowStyle Hidden -Wait } }" >nul 2>&1
if not exist "%OC_VF%" goto :dc_retry
findstr /i /c:"--standalone" "%OC_VF%" >nul 2>&1 && set "CAP_STANDALONE=1"
REM v2.25: OpenCode v2 prints the subcommand as "service    Manage the
REM background server" and never the words "opencode service", so this flag
REM was never set and every service restart/stop in the launcher was dead
REM code. The legacy marker stays as a fallback.
findstr /i /c:"opencode service" "%OC_VF%" >nul 2>&1 && set "CAP_SERVICE=1"
if not defined CAP_SERVICE findstr /r /i /c:"^ *service  *Manage" "%OC_VF%" >nul 2>&1 && set "CAP_SERVICE=1"
if defined CAP_STANDALONE goto :dc_eof
if defined CAP_SERVICE goto :dc_eof
:dc_retry
if "%OC_DCR%"=="1" goto :dc_eof
set "OC_DCR=1"
if exist "%OC_VF%" del /f /q "%OC_VF%" >nul 2>&1
goto :dc_run
:dc_eof
if exist "%OC_VF%" del /f /q "%OC_VF%" >nul 2>&1
goto :eof

REM - locate opencode anywhere reasonable
REM Collects every candidate (PATH, npm shim, standalone builds), reads the
REM version of each and keeps the newest one. A machine can hold an old
REM standalone exe next to a current npm CLI: picking the first hit by name
REM starts v1 against a v2 database and dies with
REM "Database is not empty and has no session table".
REM Sets OC_CMD to the newest working binary and OC_VER to its version.
:find_opencode
REM A failed re-scan must not blank OC_CMD: the launch then passed an empty path to Start-Process.
set "OC_PREV=%OC_CMD%"
set "OC_PREV_VER=%OC_VER%"
REM D10: 24 h cache keyed by the binary path and its mtime. The second start of
REM the day pays neither "where" nor "opencode --version" while the binary did
REM not change. The WARP and CAP_* entries share the same caps_cache.txt file.
set "OC_CCF=%STATE_DIR%\caps_cache.txt"
set "OC_CC_TTL=86400"
set "OC_CMD="
set "OC_VER="
if not exist "%OC_CCF%" goto :fo_scan
REM A missing opencode_path.txt means "Re-detect": force the full scan.
if not exist "%STATE_DIR%\opencode_path.txt" goto :fo_scan
for /f "usebackq tokens=1,2 delims=*" %%a in (`%PSX% -NoProfile -Command "$f=$env:OC_CCF; $ttl=[int]$env:OC_CC_TTL; $now=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds(); try{ foreach($l in [IO.File]::ReadAllLines($f)){ if($l -like 'OC_CMD=*'){ $v=$l.Substring(7); $p,$ticks,$at,$ver=$v -split '\*',4; if($p -and (Test-Path -LiteralPath $p)){ $t=(Get-Item -LiteralPath $p).LastWriteTimeUtc.Ticks; if(([string]$t -eq $ticks) -and (($now-[int64]$at) -lt $ttl)){ $p+'*'+$ver } } } } }catch{}"`) do (
    set "OC_CMD=%%a"
    set "OC_VER=%%b"
)
if defined OC_CMD goto :fo_cache_hit
:fo_scan
set "OCCAND=%TEMP%\oc_cand_%RANDOM%%RANDOM%.txt"
if exist "%OCCAND%" del /f /q "%OCCAND%" >nul 2>&1
REM One bounded lookup for all three names instead of three unbounded ones.
call :bwhere "opencode.exe opencode.cmd opencode.bat" "%OCCAND%"
call :add_cand "%APPDATA%\npm\opencode.cmd"
call :add_cand "%USERPROFILE%\.local\bin\opencode.exe"
call :add_cand "%LOCALAPPDATA%\Programs\opencode\opencode.exe"
call :add_cand "%LOCALAPPDATA%\opencode\bin\opencode.exe"
call :add_cand "%USERPROFILE%\.opencode\bin\opencode.exe"
call :add_cand "%LOCALAPPDATA%\Microsoft\WinGet\Links\opencode.exe"
if exist "%STATE_DIR%\opencode_path.txt" for /f "usebackq delims=" %%p in ("%STATE_DIR%\opencode_path.txt") do call :add_cand "%%p"
if not exist "%OCCAND%" goto :fo_ver
REM v3.1 (N08): a single candidate used to be taken without --version, so a stub or a
REM broken exe read as "opencode ready" and the reinstall below never ran. It is probed
REM like any other candidate.
set "OCN=0"
for /f "usebackq delims=" %%c in ("%OCCAND%") do set /a OCN+=1
REM Several candidates: probe each one, the highest version wins.
for /f "usebackq delims=" %%c in ("%OCCAND%") do call :oc_probe "%%c"
:fo_ver
del /f /q "%OCCAND%" >nul 2>&1
if not defined OC_CMD if defined OC_PREV if exist "%OC_PREV%" set "OC_CMD=%OC_PREV%"
if not defined OC_VER if defined OC_CMD if defined OC_PREV_VER if "%OC_CMD%"=="%OC_PREV%" set "OC_VER=%OC_PREV_VER%"
if defined OC_CMD if not defined OC_VER (
    set "OC_CAN=%OC_CMD%"
    call :oc_version
    REM One candidate skips the probe loop, so its version is carried here;
    REM without this the menu loses the version line and the database check
    REM pays for a second probe.
    REM v2.39: %CVER% inside the block expanded before :oc_version set it; call re-expands it.
    if defined CVER call set "OC_VER=%%CVER%%"
)
if not defined OC_CMD goto :fo_cache_hit
>"%STATE_DIR%\opencode_path.txt" echo %OC_CMD%
REM D10: refresh only this entry; the WARP= and CAP_*= lines are left untouched.
set "OC_CCP=%OC_CMD%"
set "OC_CCV=%OC_VER%"
"%PSX%" -NoProfile -Command "$f=$env:OC_CCF; $k='OC_CMD'; $p=$env:OC_CCP; $v=$p+'*'+[string](Get-Item -LiteralPath $p).LastWriteTimeUtc.Ticks+'*'+[string][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()+'*'+$env:OC_CCV; $out=@(); $seen=$false; try{ foreach($l in [IO.File]::ReadAllLines($f)){ if($l.StartsWith($k+'=')){ if(-not $seen){ $out+=($k+'='+$v); $seen=$true } } else { $out+=$l } } }catch{}; if(-not $seen){ $out+=($k+'='+$v) }; try{ [IO.File]::WriteAllLines($f,[string[]]$out) }catch{}" >nul 2>&1
:fo_cache_hit
goto :eof

REM - add one candidate path, at most once
REM A duplicate costs a second version probe (2 to 5 seconds) for a path
REM that was already found by "where": one path, one probe.
:add_cand
set "OCP=%~1"
if not exist "%OCP%" goto :eof
findstr /x /i /c:"%OCP%" "%OCCAND%" >nul 2>&1
if not errorlevel 1 goto :eof
>>"%OCCAND%" echo %OCP%
goto :eof

REM - probe one candidate, keep it when it is the newest
REM Sets CVER and, when it wins, OC_CMD and OC_VER.
:oc_probe
set "OC_CAN=%~1"
call :oc_version
if not defined CVER goto :eof
if not defined OC_CMD goto :op_take
set "VGT=0"
call :ver_gt "%CVER%" "%OC_VER%"
if "%VGT%"=="1" goto :op_take
goto :eof
:op_take
set "OC_CMD=%OC_CAN%"
set "OC_VER=%CVER%"
goto :eof

REM - version string of the binary in OC_CAN
REM "opencode v2.2.0" and a bare "2.2.0" both land in CVER unchanged.
REM The probe is bounded and writes to a file instead of a nested for /f:
REM a candidate that starts an interactive UI instead of printing a version
REM used to hang the launcher right after "Working in:" with no output.
:oc_version
call :trace oc_version
set "CVER="
REM v2.22: 3 s was too short on a cold start (antivirus scanning the exe),
REM and an empty answer made the launcher treat a v2 binary as v1. 10 s,
REM plus one retry when nothing came back.
set "OC_VR=0"
:oc_ver_run
set "OC_VF=%TEMP%\oc_ver_%RANDOM%%RANDOM%.txt"
set "OC_VEXE=%OC_CAN%"
set "OC_VTO=10"
if exist "%OC_VF%" del /f /q "%OC_VF%" >nul 2>&1
"%PSX%" -NoProfile -Command "$exe=$env:OC_VEXE; $o=$env:OC_VF; $to=[int]$env:OC_VTO*1000; $line='call ' + [char]34 + $exe + [char]34 + ' --version 2>nul <nul'; $p=Start-Process cmd.exe -ArgumentList @('/c',$line) -NoNewWindow -PassThru -RedirectStandardOutput $o; if(-not $p){ exit 1 }; $null=$p.Handle; if(-not $p.WaitForExit($to)){ Start-Process taskkill.exe -ArgumentList @('/T','/F','/PID',$p.Id) -WindowStyle Hidden -Wait; exit 124 }; exit 0" >nul 2>&1
set "OC_VRC=%errorlevel%"
set "VLINE="
if exist "%OC_VF%" set /p VLINE=<"%OC_VF%"
if defined VLINE goto :oc_ver_read
REM v2.23: retry only after a TIMEOUT (124). A binary that answered and
REM printed nothing is a normal v1 answer; retrying it cost another 10 s
REM per candidate for nothing.
if not "%OC_VRC%"=="124" goto :oc_ver_eof
if "%OC_VR%"=="1" goto :oc_ver_eof
set "OC_VR=1"
if exist "%OC_VF%" del /f /q "%OC_VF%" >nul 2>&1
goto :oc_ver_run
:oc_ver_read
if exist "%OC_VF%" del /f /q "%OC_VF%" >nul 2>&1
for /f "tokens=2" %%v in ("%VLINE%") do if not defined CVER set "CVER=%%v"
if not defined CVER for /f "tokens=1" %%v in ("%VLINE%") do if not defined CVER set "CVER=%%v"
REM v2.28: "Error: ... postinstall script was not run" used to be taken as a
REM version. Only a token that starts with a digit (after an optional v) is one.
if not defined CVER goto :oc_ver_eof
set "CV=%CVER%"
if /i "%CV:~0,1%"=="v" set "CV=%CV:~1%"
set "CVD=%CV:~0,1%"
for /f "delims=0123456789" %%d in ("%CVD%") do set "CVER="
:oc_ver_eof
if exist "%OC_VF%" del /f /q "%OC_VF%" >nul 2>&1
REM v2.23: no second run for an unparsable line either - only a timeout.
goto :eof

REM - numeric version compare
REM usage: call :ver_gt <a> <b>; sets VGT=1 when a is newer than b.
:ver_gt
set "VGT=0"
set "VA=%~1"
set "VB=%~2"
if not defined VB goto :vg_new
set "VA=%VA:v=%"
set "VB=%VB:v=%"
set "A1=0"
set "A2=0"
set "A3=0"
set "B1=0"
set "B2=0"
set "B3=0"
REM v2.22: the third component (patch) is compared too. v2.21 stopped at
REM minor, so 2.2.1 and 2.2.9 ranked equal.
for /f "tokens=1,2,3 delims=." %%a in ("%VA%") do (set "A1=%%a" & set "A2=%%b" & set "A3=%%c")
for /f "tokens=1,2,3 delims=." %%a in ("%VB%") do (set "B1=%%a" & set "B2=%%b" & set "B3=%%c")
call :vnum A1
call :vnum A2
call :vnum A3
call :vnum B1
call :vnum B2
call :vnum B3
if %A1% GTR %B1% goto :vg_new
if %A1% LSS %B1% goto :eof
if %A2% GTR %B2% goto :vg_new
if %A2% LSS %B2% goto :eof
if %A3% GTR %B3% goto :vg_new
goto :eof
:vg_new
set "VGT=1"
goto :eof

REM - force a token to a non-negative integer
REM usage: call :vnum NAME; anything that is not a number becomes 0.
:vnum
set "NV=%~1"
call set "NRAW=%%%NV%%%"
REM v2.25: set /a reads a leading 0 as octal, so "08" and "09" failed and
REM ranked as 0. Leading zeros are stripped first.
REM An undefined NRAW (a one-part version like "2") must never reach the
REM substring syntax below: it is a syntax error in a batch file.
:vn_z
if not defined NRAW goto :vn_n
if not "%NRAW:~0,1%"=="0" goto :vn_n
if "%NRAW:~1%"=="" goto :vn_n
set "NRAW=%NRAW:~1%"
goto :vn_z
:vn_n
set "NN="
set /a NN=NRAW 2>nul
if not defined NN set "NN=0"
if %NN% LSS 0 set "NN=0"
set "%NV%=%NN%"
goto :eof

REM - offer a newer opencode, once per start, ask first
REM Installed version comes from "%OC_CMD% --version" (:oc_version), the
REM latest from the official release metadata (:oc_api) over a direct
REM connection: the proxy env is cleared so WARP is never in the path, and
REM the call is capped at 20 s. No network, a timeout or a bad answer all
REM leave the launcher running exactly as it was. The check is skipped
REM during an automatic resume and never installs without a Y.
:oc_update_check
if /i "%UPDATE_ASK%"=="never" goto :eof
if defined OCUPD goto :eof
set "OCUPD=1"
if defined AUTO_RUN goto :eof
if not defined OC_CMD goto :eof
if defined RESUME goto :eof
call :trace oc_update
REM Installed version, read from the binary itself.
set "OC_CAN=%OC_CMD%"
call :oc_version
if not defined CVER goto :eof
set "OCUPD_CUR=%CVER%"
REM v2.28: latest from the official release metadata (direct, 20 s cap). The
REM old check asked npm for opencode-ai, the frozen v1 line, so it never saw v2.
call :oc_api cli ""
if not defined OCA_VER goto :eof
set "OCUPD_LAT=%OCA_VER%"
call :log "update check: opencode installed %OCUPD_CUR% latest %OCUPD_LAT%" update
set "VGT=0"
call :ver_gt "%OCUPD_LAT%" "%OCUPD_CUR%"
if not "%VGT%"=="1" goto :eof
echo.
call :msg %T_175%
call :msg %T_176%
call :yn_upd "   Update now? [Y/N]: "
REM errorlevel 0 (no stdin) and 2 (N) both skip the install.
if not errorlevel 1 goto :eof
if errorlevel 2 goto :eof
call :stop_opencode cli-update
REM Same channel as the running command: npm installs go through npm, the rest
REM through the official standalone build.
echo "%OC_CMD%" | findstr /i /c:"\npm" >nul 2>&1
if errorlevel 1 goto :ouc_standalone
call :msg %T_177%
call :npm_install
goto :ouc_after
:ouc_standalone
call :msg %T_178%
call :standalone
:ouc_after
REM v3.1 (N68): remember what the binary reported before the install, so "now reports"
REM is only printed when the version really changed.
set "OC_UPD_PREV=%OC_VER%"
REM v2.22: resolve the command again. OC_CMD could still point at an old
REM exe, so the version read below came from the wrong binary. The newest wins.
call :find_opencode
REM Re-read what the binary reports now and refresh the capability flags.
set "OC_CAN=%OC_CMD%"
call :oc_version
if defined CVER set "OC_VER=%CVER%"
call :detect_caps
if defined OC_VER if not "%OC_VER%"=="%OC_UPD_PREV%" call :msg %T_336%
timeout /t 2 /nobreak >nul 2>&1
goto :eof
REM - v1 binary on a v2 database
REM A v1 CLI cannot open the v2 database and fails inside opencode with
REM "Database is not empty and has no session table". Say it here instead.
:db_guard
if not defined OC_CMD goto :eof
if not exist "%DATA_DIR%\opencode.db" goto :eof
if defined OC_VER goto :dg_check
set "OC_CAN=%OC_CMD%"
call :oc_version
:dg_check
if not defined OC_VER goto :eof
set "OCMAJ=0"
for /f "tokens=1 delims=." %%m in ("%OC_VER:v=%") do set "OCMAJ=%%m"
call :vnum OCMAJ
if %OCMAJ% GEQ 2 goto :eof
call :msg %T_179%
call :msg %T_180%
call :msg %T_181%
goto :eof

REM - WARP into MASQUE + proxy mode on port 40000 and connected
REM Sets the tunnel protocol to MASQUE, switches to proxy mode on
REM PROXY_PORT, then connects. Waits 3 seconds for the connection.
:warp_up
REM v2.43: a (re)connect leaves the service on dead keep-alive sockets (ECONNRESET) and the
REM proxy URL never changes, so forget the marker: the next :run_gate_ok restarts the service.
set "SVC_PROXIED="
set "WU_STEP="
set "WU_OK="
call :trace warp_up
REM v3.7: the service must run and start with Windows. Changing that needs admin: see :warp_svc_fix.
call :warp_svc_fix
if errorlevel 1 if not defined OPT_AUTO call :msg %T_313%
call :warp_register
REM v2.59: the daemon rejects config verbs while the tunnel is up. Drop it and let it settle first.
REM The wait is not checked: if the status text differs, the sequence still runs.
call :wcli disconnect
call :warp_wait "Status update: Disconnected" 15
REM No WireGuard fallback: the local proxy mode needs MASQUE. A failed step skips the rest.
set "WU_STEP=tunnel protocol set MASQUE"
call :wcli tunnel protocol set MASQUE
if errorlevel 1 goto :wu_fail
set "WU_STEP=mode proxy"
call :wcli mode proxy
if errorlevel 1 goto :wu_fail
set "WU_STEP=proxy port %PROXY_PORT%"
call :wcli proxy port %PROXY_PORT%
if errorlevel 1 goto :wu_fail
set "WU_STEP=connect"
call :wcli connect
if not errorlevel 1 goto :wu_connected
REM v2.36: connect failed. Without a registration behind it ("Registration Missing", "Old registration is still
REM around") every call fails; make a clean one and connect again.
set "WCLI_QUIET=1"
call :wcli registration show
set "WCLI_QUIET="
if not errorlevel 1 goto :wu_fail
call :msg %T_314%
call :reg_new
if not "%REGNEW%"=="1" goto :wu_fail
set "WU_STEP=connect after new registration"
call :wcli connect
if errorlevel 1 goto :wu_fail
:wu_connected
set "WU_STEP=wait for Connected"
call :warp_wait "Status update: Connected" 25
if errorlevel 1 goto :wu_fail
set "WU_STEP=port %PROXY_PORT% bound"
call :port_up %PROXY_PORT%
if errorlevel 1 goto :wu_fail
set "WU_OK=1"
goto :wu_done
:wu_fail
call :log "warp_up failed at step: %WU_STEP%" wcli
:wu_done
timeout /t 3 /nobreak >nul 2>&1
goto :eof

REM v3.7: when the WARP service is stopped or its start type is Disabled (after a reboot it would not come back),
REM one Windows prompt (UAC) runs one fixed command: start type Automatic and start. Auto never asks (nobody to answer),
REM it just goes on to the next method. exit 0 = service running, 1 = still not running.
:warp_svc_fix
set "WSF_NEED="
sc query CloudflareWARP | findstr /i "RUNNING" >nul 2>&1
if errorlevel 1 set "WSF_NEED=1"
sc qc CloudflareWARP | findstr /i "DISABLED" >nul 2>&1
if not errorlevel 1 set "WSF_NEED=1"
if not defined WSF_NEED exit /b 0
if defined OPT_AUTO exit /b 1
call echo %T_389%
call :log "WARP service is stopped or disabled: setting it Automatic and starting it only if this window is already administrator (no prompt)" warp
"%PSX%" -NoProfile -Command "try{ Set-Service -Name CloudflareWARP -StartupType Automatic; Start-Service -Name CloudflareWARP }catch{ exit 1 }" >nul 2>&1
sc query CloudflareWARP | findstr /i "RUNNING" >nul 2>&1
if errorlevel 1 (call :log "WARP service still not running after the administrator step" warp & exit /b 1)
call :log "WARP service set to Automatic and running" warp
exit /b 0

REM v3.5: starts WARP when the proxy answers nothing. The CloudflareWARP service must already run
REM (starting it needs admin, so --auto never does it). Connects in proxy mode and waits for
REM "Connected", so the caller does not export a proxy before the tunnel exists.
:warp_ensure_on
sc query CloudflareWARP | findstr /i "RUNNING" >nul 2>&1
if not errorlevel 1 goto :weo_run
call :log "WARP service is not running; the launcher cannot start it without admin" warp
if not defined OPT_AUTO call echo %T_313%
exit /b 1
:weo_run
call :log "WARP is off: setting proxy mode on port %PROXY_PORT% and connecting" warp
call :wcli mode proxy
call :wcli proxy port %PROXY_PORT%
call :wcli connect
call :warp_wait "Status update: Connected" 25
if not errorlevel 1 exit /b 0
call :log "WARP did not reach Connected within 25 s" warp
exit /b 1

REM - wait for a status line that starts with the text in %~1. %~2 = seconds. exit 0 = seen, 1 = timeout.
REM /b anchors the match: "Connected" alone would also match "Disconnected".
:warp_wait
set "WW_F=%TEMP%\oc_wst_%RANDOM%%RANDOM%.txt"
set /a WW_I=0
:ww_loop
"%WARP%" --accept-tos status >"%WW_F%" 2>&1
findstr /i /b /c:"%~1" "%WW_F%" >nul 2>&1
if not errorlevel 1 goto :ww_ok
set /a WW_I+=1
if %WW_I% GEQ %~2 goto :ww_no
timeout /t 1 /nobreak >nul 2>&1
goto :ww_loop
:ww_ok
del /f /q "%WW_F%" >nul 2>&1
exit /b 0
:ww_no
del /f /q "%WW_F%" >nul 2>&1
exit /b 1

REM - recreate a missing WARP registration
REM After a manual deletion every later call fails in a confusing way:
REM mode, port, connect and the MASQUE protocol all report errors because
REM there is no registration behind them. Create one before the tunnel.
:warp_register
if not defined WARP goto :eof
set "OC_WARPF=%TEMP%\oc_wstate_%RANDOM%%RANDOM%.txt"
set "OC_WARPEXE=%WARP%"
set "OC_WARPTO=%WARP_CALL_TIMEOUT%"
REM Bounded: a warp-cli that never answers (service stopped, tunnel wedged)
REM used to freeze the launcher here with nothing on screen.
"%PSX%" -NoProfile -Command "$f=$env:OC_WARPF; $to=[int]$env:OC_WARPTO*1000; $p=Start-Process $env:OC_WARPEXE -ArgumentList @('--accept-tos','status') -NoNewWindow -PassThru -RedirectStandardOutput $f -RedirectStandardError ($f+'.err'); if(-not $p){ exit 1 }; $null=$p.Handle; if(-not $p.WaitForExit($to)){ Start-Process taskkill.exe -ArgumentList @('/T','/F','/PID',$p.Id) -WindowStyle Hidden -Wait; exit 124 }; exit 0" >nul 2>&1
if not exist "%OC_WARPF%" goto :eof
if exist "%OC_WARPF%.err" type "%OC_WARPF%.err" >>"%OC_WARPF%" 2>nul
set "REGMISS="
findstr /i /c:"Registration Missing" "%OC_WARPF%" >nul 2>&1
if not errorlevel 1 set "REGMISS=1"
del /f /q "%OC_WARPF%" "%OC_WARPF%.err" >nul 2>&1
if not defined REGMISS goto :eof
call :msg %T_182%
REM v3.1 (N83): a bare "registration new" on a half-torn state is the call that fails.
REM :reg_new drops the stale registration first and records the result in REGNEW.
call :reg_new
goto :eof

REM - drop the current registration, then wait for the daemon to let go
REM registration delete returns before the daemon has finished tearing the
REM old one down, and the next "registration new" then fails with
REM "Old registration is still around", which used to loop forever.
REM Deletes once, then polls registration show until it stops answering.
:reg_drop
REM v2.43: same as :warp_up - a dropped tunnel makes the service restart on the next launch.
set "SVC_PROXIED="
call :wcli disconnect
timeout /t 1 /nobreak >nul 2>&1
call :wcli registration delete
set "RD_OK="
set /a RD_TRIES=0
:rd_wait
set /a RD_TRIES+=1
if %RD_TRIES% GTR 6 goto :rd_go
REM v2.22: this poll is EXPECTED to fail while the daemon tears the old
REM registration down. Quiet mode keeps that normal probe out of the
REM console and out of wcli.log.
set "WCLI_QUIET=1"
call :wcli registration show
set "WCLI_QUIET="
if errorlevel 1 set "RD_OK=1"
if defined RD_OK goto :rd_go
timeout /t 1 /nobreak >nul 2>&1
goto :rd_wait
:rd_go
REM N84: a registration that is gone after the polls is success, even if the delete
REM printed an error (Missing registration). One still there is a real failure.
if defined RD_OK goto :eof
exit /b 1

REM - create a WARP registration, retrying once after a full drop
REM Sets REGNEW=1 when the daemon accepted a registration.
:reg_new
set "REGNEW=0"
call :wcli registration new
if not errorlevel 1 goto :rn_ok
REM v3.1 (N81): the delete that works is preceded by a disconnect and waits for the
REM daemon; deleting on a live daemon reproduced the failure.
call :reg_drop
call :wcli registration new
if not errorlevel 1 goto :rn_ok
REM v3.1 (N80): "Old registration is still around" means the daemon has not finished
REM tearing down. Wait for it and try once more before the operator message.
timeout /t 5 /nobreak >nul 2>&1
call :wcli registration new
if errorlevel 1 goto :rn_done
:rn_ok
set "REGNEW=1"
goto :eof
:rn_done
REM v3.1 (N86): T_313 tells the operator to restart Cloudflare WARP by hand. The launcher
REM does not restart services itself: that needs administrator rights.
call echo %T_313%
goto :eof

REM ============================================================
REM  4a) TOR portable auto-setup [2] ----------------------------
REM ============================================================
REM Option [2] TOR with nothing installed: download the portable
REM Tor Expert Bundle once (tar.gz, no installer, no UAC, no
REM service), start it hidden on TOR_SOCKS_PORT, and expose it as an
REM HTTP proxy on TOR_HTTP_PORT through a tiny built-in bridge
REM process, so no Privoxy install is needed. A Tor already running
REM (Tor Browser or a user tor on the SOCKS port) is used as it is and
REM never killed by the launcher: at exit :tor_stop only ever stops
REM processes running from inside TOR_DIR (v2.20 identity rule).

REM - one-stop gate for the TOR egress: 0 = usable, 1 = give up
:tor_gate
call :trace tor_gate
set "TG_PORTSWAP="
call :tor_ready
REM v2.24: a bridge that already answers short-circuits the gate. Recover
REM ownership here too, or "Change IP" treats our own Tor as a foreign one.
if not errorlevel 1 goto :tg_have
REM v2.22: look for a Tor that is already running BEFORE downloading the
REM portable bundle. The old order fetched the bundle even when a live Tor
REM (service on 9050, Tor Browser on 9150) was sitting on its SOCKS port.
call :tor_socks_up
if not errorlevel 1 goto :tg_existing
if not "%TOR_AUTO_INSTALL%"=="1" goto :tg_fail
call :msg %T_183%
call :tor_install_if_missing
if not defined TOR_EXE goto :tg_missing
:tg_existing
call :tor_start_if_needed
if errorlevel 1 goto :tg_fail
call :tor_wait_up
call :tor_ready
if not errorlevel 1 goto :tg_ok
:tg_fail
REM v2.36: a foreign program (a system Privoxy, say) on the bridge port makes the chain fail. Move the bridge once.
if defined TG_PORTSWAP goto :tg_fail2
set "TG_PORTSWAP=1"
call :tor_other_port
if not errorlevel 1 goto :tg_existing
:tg_fail2
call :msg %T_184%
call :tor_log_tail
exit /b 1
:tg_missing
call :msg %T_185%
call :msg %T_186%
call :msg %T_187%
call :msg %T_188%
exit /b 1
REM v2.24: single place that records who owns the running Tor, whichever
REM branch reached a ready state.
:tg_have
call :tor_own_running
if not errorlevel 1 set "OURTOR=1"
:tg_ok
set "ACTIVE_PROXY=http://127.0.0.1:%TOR_HTTP_PORT%"
call :msg %T_189%
exit /b 0

REM - locate tor.exe under TOR_DIR: fixed bundle layouts first, then one
REM bounded recurse. Sets TOR_EXE, or leaves it empty when nothing is there.
:tor_find_exe
if defined TOR_EXE goto :eof
set "TOR_EXE="
if exist "%TOR_DIR%\Tor\tor.exe" set "TOR_EXE=%TOR_DIR%\Tor\tor.exe"
if not defined TOR_EXE if exist "%TOR_DIR%\tor.exe" set "TOR_EXE=%TOR_DIR%\tor.exe"
if defined TOR_EXE goto :eof
set "OC_TORDIR=%TOR_DIR%"
for /f "usebackq delims=" %%t in (`%PSX% -NoProfile -Command "try{ $f=Get-ChildItem -LiteralPath $env:OC_TORDIR -Recurse -Filter tor.exe -ErrorAction SilentlyContinue | Select-Object -First 1; if($f){ $f.FullName } }catch{}"`) do set "TOR_EXE=%%t"
goto :eof

REM - download the portable Tor Expert Bundle once
REM Facts travel the Tor Browser updater downloads.json first: it carries
REM the exact current bundle filename, so no version is ever hard-coded.
REM A scrape of the dist folder index is the fallback. Size-gated like
REM every other download, unpacked with the Windows tar.exe, direct egress.
:tor_install_if_missing
set "TOR_EXE="
if exist "%TOR_DIR%\Tor\tor.exe" set "TOR_EXE=%TOR_DIR%\Tor\tor.exe"
if not defined TOR_EXE if exist "%TOR_DIR%\tor.exe" set "TOR_EXE=%TOR_DIR%\tor.exe"
if defined TOR_EXE call echo %T_337%
if defined TOR_EXE goto :eof
call :trace tor_install
if not exist "%TOR_DIR%" mkdir "%TOR_DIR%" >nul 2>&1
set "TORPLAT=windows_x86_64"
set "TORFILE=windows-x86_64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "TORPLAT=windows_arm64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "TORFILE=windows-arm64"
if "%REAL86%"=="1" set "TORPLAT=windows_i686"
if "%REAL86%"=="1" set "TORFILE=windows-i686"
set "TGZ=%TEMP%\tor-expert-bundle.tar.gz"
if exist "%TGZ%" del /f /q "%TGZ%" >nul 2>&1
set "KEEP_HP=%HTTP_PROXY%"
set "KEEP_SP=%HTTPS_PROXY%"
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "OC_TORDL=%TEMP%\oc_tor_url.txt"
set "OC_TPLAT=%TORPLAT%"
set "OC_TFILE=%TORFILE%"
set "OC_TOUT=%OC_TORDL%"
if exist "%OC_TORDL%" del /f /q "%OC_TORDL%" >nul 2>&1
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $j=Invoke-RestMethod -Uri 'https://aus1.torproject.org/torbrowser/update_3/release/downloads.json' -TimeoutSec 30; $p=$j.projects.tor.platforms.($env:OC_TPLAT); $u=$null; if($p -and $p.download_url){ $u=([string]$p.download_url[0]).TrimEnd('/')+'/'+[string]$p.download_filename }; if(-not $u -or $u -notmatch '^https://'){ exit 1 }; [IO.File]::WriteAllText($env:OC_TOUT, $u); exit 0 }catch{ exit 1 }" >nul 2>&1
set "TGZURL="
if exist "%OC_TORDL%" for /f "usebackq delims=" %%u in ("%OC_TORDL%") do set "TGZURL=%%u"
if exist "%OC_TORDL%" del /f /q "%OC_TORDL%" >nul 2>&1
if defined TGZURL goto :tia_fetch
call :msg %T_190%
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $h=(Invoke-WebRequest -UseBasicParsing -Uri 'https://dist.torproject.org/torbrowser/' -TimeoutSec 30).Content; $vs=@(); foreach($m in [regex]::Matches($h, '(\d+\.\d+(?:\.\d+)?)/')){ if($vs -notcontains $m.Groups[1].Value){ $vs+=,$m.Groups[1].Value } }; $last=$null; foreach($v in $vs){ try{ if((-not $last) -or ([version]$v -gt [version]$last)){ $last=$v } }catch{} }; if(-not $last){ exit 1 }; $u='https://dist.torproject.org/torbrowser/'+$last+'/tor-expert-bundle-'+$env:OC_TFILE+'-'+$last+'.tar.gz'; [IO.File]::WriteAllText($env:OC_TOUT, $u); exit 0 }catch{ exit 1 }" >nul 2>&1
set "TGZURL="
if exist "%OC_TORDL%" for /f "usebackq delims=" %%u in ("%OC_TORDL%") do set "TGZURL=%%u"
if exist "%OC_TORDL%" del /f /q "%OC_TORDL%" >nul 2>&1
if not defined TGZURL goto :tia_restore
:tia_fetch
echo     %TGZURL%
set "OC_TURL=%TGZURL%"
set "OC_TGZ=%TGZ%"
if "%HAVE_CURL%"=="1" curl.exe -L -f -s --max-time 600 --noproxy "*" -o "%TGZ%" "%TGZURL%" >nul 2>&1
if exist "%TGZ%" for %%Z in ("%TGZ%") do if %%~zZ GEQ 4000000 goto :tia_up_ok
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri $env:OC_TURL -OutFile $env:OC_TGZ -TimeoutSec 600}catch{}" >nul 2>&1
if exist "%TGZ%" for %%Z in ("%TGZ%") do if %%~zZ GEQ 4000000 goto :tia_up_ok
:tia_restore
set "HTTP_PROXY=%KEEP_HP%"
set "HTTPS_PROXY=%KEEP_SP%"
call :msg %T_191%
goto :eof
:tia_badsum
if exist "%TGZ%" del /f /q "%TGZ%" >nul 2>&1
set "HTTP_PROXY=%KEEP_HP%"
set "HTTPS_PROXY=%KEEP_SP%"
call :msg %T_347%
goto :eof
:tia_up_ok
REM v2.40: the size alone proved nothing. SHA-256 against the sums file published next to the bundle (as opencode and wireproxy are checked).
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $u=$env:OC_TURL; $i=$u.LastIndexOf([char]47)+1; $n=$u.Substring($i); $t=(Invoke-WebRequest -UseBasicParsing -Uri ($u.Substring(0,$i)+'sha256sums-signed-build.txt') -TimeoutSec 30).Content; $m=[regex]::Match($t,'(?mi)^([0-9a-f]{64})\s+'+[regex]::Escape($n)+'\s*$'); if(-not $m.Success){ exit 1 }; if((Get-FileHash -LiteralPath $env:OC_TGZ -Algorithm SHA256).Hash -ieq $m.Groups[1].Value){ exit 0 } else { exit 1 } }catch{ exit 1 }" >nul 2>&1
if errorlevel 1 goto :tia_badsum
set "HTTP_PROXY=%KEEP_HP%"
set "HTTPS_PROXY=%KEEP_SP%"
call :msg %T_192%
set "OC_TGZ=%TGZ%"
set "OC_TDIR=%TOR_DIR%"
REM v2.28: the Windows tar by full path - a GNU tar from Git/MSYS earlier in PATH
REM reads "C:\..." as host:file and unpacks nothing.
set "TAREXE=tar.exe"
if exist "%SystemRoot%\System32\tar.exe" set "TAREXE=%SystemRoot%\System32\tar.exe"
"%TAREXE%" -xzf "%TGZ%" -C "%TOR_DIR%" >nul 2>&1
if exist "%TGZ%" del /f /q "%TGZ%" >nul 2>&1
call :tor_find_exe
if defined TOR_EXE (
  REM v2.22: this echo used to contain a literal "(portable)". Inside an
  REM if (...) block that closing parenthesis ended the block right there,
  REM so the whole line was a syntax error at parse time.
  call :msg %T_193%
) else (
  call :msg %T_194%
)
goto :eof

REM - start what is missing; never touch a Tor or bridge that already runs
REM A SOCKS port already answering belongs to a running Tor (for example
REM Tor Browser): it is used as it is. At exit :tor_stop (v2.20) stops
REM only tor processes whose image path lives inside TOR_DIR plus bridge
REM processes carrying the OC_TORBRIDGE_PS command-line marker, so what
REM gets stopped is always launcher-managed - also left over from a
REM past session - and a foreign Tor or bridge never is. An HTTP port
REM already answering is a working bridge (anyone's) and is used as it is.
:tor_start_if_needed
set "OURTOR="
set "OURBRIDGE="
REM v2.23: our own tor can still be alive after the bridge died. Recover
REM ownership from tor.pid so :tor_rotate can restart it, instead of
REM declaring it foreign and refusing to renew the circuit.
call :tor_own_running
if not errorlevel 1 set "OURTOR=1"
call :tor_socks_up
if errorlevel 1 goto :tsi_tor
call :msg %T_195%
goto :tsi_bridge
:tsi_tor
call :tor_find_exe
if not defined TOR_EXE exit /b 1
if not exist "%TOR_DIR%\data" mkdir "%TOR_DIR%\data" >nul 2>&1
REM torrc written to a file instead of quoting trouble on the command
REM line. Quoted values must carry WINDOWS PATHS AS FORWARD SLASHES:
REM tor treats a backslash inside double quotes as the start of an
REM escape sequence, so a backslashed path dies parsing with
REM "Invalid escape sequence in quoted string". tor accepts
REM forward-slash Windows paths, so slashtify the directory once here.
set "OC_TDS=%TOR_DIR:\=/%"
>"%TOR_DIR%\torrc" echo SocksPort "127.0.0.1:%TOR_SOCKS_PORT%"
>>"%TOR_DIR%\torrc" echo DataDirectory "%OC_TDS%/data"
>>"%TOR_DIR%\torrc" echo Log "notice file %OC_TDS%/tor.log"
REM v2.36: tor warned about the relative GeoIPFile / GeoIPv6File of the bundle. Absolute paths (forward slashes).
set "TOR_GEO="
set "TOR_GEO6="
for /r "%TOR_DIR%" %%g in (geoip) do if exist "%%g" if not defined TOR_GEO set "TOR_GEO=%%g"
for /r "%TOR_DIR%" %%g in (geoip6) do if exist "%%g" if not defined TOR_GEO6 set "TOR_GEO6=%%g"
if defined TOR_GEO set "TOR_GEO=%TOR_GEO:\=/%"
if defined TOR_GEO6 set "TOR_GEO6=%TOR_GEO6:\=/%"
if defined TOR_GEO >>"%TOR_DIR%\torrc" echo GeoIPFile "%TOR_GEO%"
if defined TOR_GEO6 >>"%TOR_DIR%\torrc" echo GeoIPv6File "%TOR_GEO6%"
if exist "%TOR_DIR%\tor.log" del /f /q "%TOR_DIR%\tor.log" >nul 2>&1
if exist "%TOR_DIR%\tor.pid" del /f /q "%TOR_DIR%\tor.pid" >nul 2>&1
set "OC_TOREXE=%TOR_EXE%"
set "OC_TORRC=%TOR_DIR%\torrc"
set "OC_TORPID=%TOR_DIR%\tor.pid"
set "OC_TORLOG=%TOR_DIR%\tor.log"
set "OC_TORERR=%TOR_DIR%\tor_start.err"
if exist "%OC_TORERR%" del /f /q "%OC_TORERR%" >nul 2>&1
call echo %T_196%
REM tor's config switch is -f (a "--torrc" flag does not exist: tor
REM exits with "Unknown option 'torrc'"). stderr is captured so a tor
REM that refuses to start leaves its own reason in tor_start.err, and
REM the spawn is confirmed two seconds later: a process that died
REM immediately after Start-Process is a failed start, not an up one.
"%PSX%" -NoProfile -Command "try{ $si=New-Object System.Diagnostics.ProcessStartInfo; $si.FileName=$env:OC_TOREXE; $si.Arguments=('-f '+[char]34+$env:OC_TORRC+[char]34+' --quiet'); $si.UseShellExecute=$false; $si.CreateNoWindow=$true; $si.RedirectStandardError=$true; $p=[System.Diagnostics.Process]::Start($si); if(-not $p){ exit 1 }; [IO.File]::WriteAllText($env:OC_TORPID,[string]$p.Id); Start-Sleep -Seconds 2; if($p.HasExited){ try{ [IO.File]::WriteAllText($env:OC_TORERR, 'tor exited with code '+$p.ExitCode+': '+($p.StandardError.ReadToEnd())) }catch{}; exit 1 }; exit 0 }catch{ exit 1 }" >nul 2>&1
if errorlevel 1 (
  call echo %T_197%
  if exist "%OC_TORERR%" "%PSX%" -NoProfile -Command "Get-Content -LiteralPath $env:OC_TORERR -ErrorAction SilentlyContinue | Select-Object -First 4 | ForEach-Object { '     ' + [string]$_ }"
  exit /b 1
)
set "OURTOR=1"
:tsi_bridge
call :port_up %TOR_HTTP_PORT%
if not errorlevel 1 goto :tsi_done
REM v2.25: with a Tor that was already running, nothing had created TOR_DIR
REM yet, so the bridge could write neither bridge.log nor bridge.pid (it
REM printed a DirectoryNotFound error) and :tor_stop could never find the
REM bridge again: it kept running after the launcher exited.
if not exist "%TOR_DIR%" mkdir "%TOR_DIR%" >nul 2>&1
set "OC_BRPORT=%TOR_HTTP_PORT%"
set "OC_BRSOCKS=%TOR_SOCKS_PORT%"
set "OC_BRLOG=%TOR_DIR%\bridge.log"
set "OC_BRPIDF=%TOR_DIR%\bridge.pid"
if exist "%OC_BRLOG%" del /f /q "%OC_BRLOG%" >nul 2>&1
if exist "%OC_BRPIDF%" del /f /q "%OC_BRPIDF%" >nul 2>&1
call echo %T_198%
start "" /b "%PSX%" -NoProfile -Command "$l=Get-Content -LiteralPath $env:OCI_SELF; $i=[Array]::IndexOf($l,'#>>>OC_TORBRIDGE_PS'); $e=[Array]::IndexOf($l,'#>>>OC_ENDTORBRIDGE'); if(($i -ge 0) -and ($e -gt $i)){ $BRTEXT=(($l[($i+1)..($e-1)]) -join [Environment]::NewLine); Invoke-Expression $BRTEXT }"
timeout /t 2 /nobreak >nul 2>&1
set "OURBRIDGE=1"
:tsi_done
exit /b 0

REM - wait until Tor routes THROUGH THE BRIDGE (v2.20): the run gate and
REM opencode itself use the HTTP proxy on TOR_HTTP_PORT, so the wait
REM checks the whole chain, not just a live SOCKS port - a Tor up with a
REM dead bridge must not be answered as ready. With curl: the real TRACE
REM probe through the bridge. Without curl: "Bootstrapped 100" in the
REM tor log plus both ports listening. Bounded.
:tor_wait_up
call echo %T_199%
REM v2.40: the wait is measured on the clock; counting 2 s per pass ignored the up-to-8 s each curl check takes.
call :nowsecs
set "TW_START=%NOWS%"
:tw_loop
call :nowsecs
set /a TW_TRIES=NOWS-TW_START
if %TW_TRIES% LSS 0 set /a TW_TRIES+=86400
if %TW_TRIES% GEQ %TOR_BOOTSTRAP_WAIT% goto :tw_timeout
timeout /t 2 /nobreak >nul 2>&1
call :tw_check
if not errorlevel 1 goto :tw_up
<nul set /p=.
goto :tw_loop
:tw_up
echo.
call echo %T_200%
exit /b 0
:tw_timeout
echo.
call echo %T_201%
exit /b 1
REM One wait check. Runtime-safe errorlevel handling throughout (the
REM old NEQ-style line read %errorlevel% as stale parse-time text).
:tw_check
if "%HAVE_CURL%"=="1" (
  curl.exe -sS -o nul -f --max-time 8 --noproxy "" --proxy "http://127.0.0.1:%TOR_HTTP_PORT%" "%TRACE_URL%" >nul 2>&1
  if errorlevel 1 exit /b 1
  exit /b 0
)
call :port_up %TOR_SOCKS_PORT%
if errorlevel 1 exit /b 1
call :port_up %TOR_HTTP_PORT%
if errorlevel 1 exit /b 1
if not exist "%TOR_DIR%\tor.log" exit /b 1
findstr /c:"Bootstrapped 100" "%TOR_DIR%\tor.log" >nul 2>&1
if errorlevel 1 exit /b 1
exit /b 0

REM v2.36: the exit IP seen through the bridge, in TOR_IP (empty without curl or when nothing answers)
:tor_exit_ip
set "TOR_IP="
if not "%HAVE_CURL%"=="1" exit /b 0
for /f "tokens=2 delims==" %%i in ('curl.exe -sS --max-time 10 --noproxy "" --proxy "http://127.0.0.1:%TOR_HTTP_PORT%" "%TRACE_URL%" 2^>nul ^| findstr /b /c:"ip="') do set "TOR_IP=%%i"
exit /b 0

REM v2.36: the bridge port answers but the chain through it does not work: it belongs to another program.
REM Take the next free port above it (20 tried). exit 0 = TOR_HTTP_PORT was moved, 1 = nothing to move.
:tor_other_port
if defined OURBRIDGE exit /b 1
call :port_up %TOR_HTTP_PORT%
if errorlevel 1 exit /b 1
set "TOP_OLD=%TOR_HTTP_PORT%"
set /a TOP_N=TOR_HTTP_PORT
set /a TOP_LIM=TOR_HTTP_PORT+20
:top_loop
set /a TOP_N+=1
if %TOP_N% GTR %TOP_LIM% exit /b 1
call :port_up %TOP_N%
if not errorlevel 1 goto :top_loop
set "TOR_HTTP_PORT=%TOP_N%"
set "ACTIVE_PROXY=http://127.0.0.1:%TOP_N%"
call echo %T_312%
exit /b 0

REM - the last lines of tor.log, printed next to the failure message
:tor_log_tail
if not exist "%TOR_DIR%\tor.log" goto :eof
set "OC_TF=%TOR_DIR%\tor.log"
"%PSX%" -NoProfile -Command "if(Test-Path -LiteralPath $env:OC_TF){ Get-Content -LiteralPath $env:OC_TF -Tail 6 | ForEach-Object { '     ' + $_ } }"
REM v2.36: the bridge has its own log; its last lines usually name the reason when only the bridge is down
set "OC_TF=%TOR_DIR%\bridge.log"
"%PSX%" -NoProfile -Command "if(Test-Path -LiteralPath $env:OC_TF){ Get-Content -LiteralPath $env:OC_TF -Tail 4 | ForEach-Object { '     ' + $_ } }"
goto :eof

REM - is a TCP port on 127.0.0.1 accepting connections?
REM usage: call :port_up 9050  -> errorlevel 0 when open, 1 when closed.
:port_up
set "OC_PU=%~1"
"%PSX%" -NoProfile -Command "try{$c=New-Object Net.Sockets.TcpClient;$a=$c.BeginConnect('127.0.0.1',[int]$env:OC_PU,$null,$null);if(-not $a.AsyncWaitHandle.WaitOne(1200)){exit 1};$c.EndConnect($a);$c.Close();exit 0}catch{exit 1}" >nul 2>&1
exit /b %errorlevel%

REM - stop only launcher-managed processes, never a recycled PID or a
REM foreign process behind a stale record (v2.20 rewrite):
REM   tor    - only if its ProcessName is tor AND its image path lives
REM            inside TOR_DIR, the private bundle dir only this launcher
REM            writes to. A user's Tor Browser or any foreign tor is
REM            never matched, whatever the pid file says.
REM   bridge - only if ProcessName is powershell/pwsh AND the process
REM            command line carries the OC_TORBRIDGE_PS marker that every
REM            launcher-spawned bridge process carries.
REM Final stop verification is by identity, not by pid alone; pid files
REM that match nothing are stale garbage and are deleted.
:tor_stop
set "OC_TORPID=%TOR_DIR%\tor.pid"
set "OC_BRPIDF=%TOR_DIR%\bridge.pid"
if not exist "%OC_TORPID%" if not exist "%OC_BRPIDF%" goto :eof
set "OC_TORDIR=%TOR_DIR%"
if exist "%OC_TORPID%" "%PSX%" -NoProfile -Command "$t=Get-Content -LiteralPath $env:OC_TORPID -ErrorAction SilentlyContinue | Select-Object -First 1; if($t){ try{ $p=Get-Process -Id ([int]$t) -ErrorAction Stop }catch{ $p=$null }; if($p -and $p.ProcessName -eq 'tor'){ $ok=$false; try{ $pd=$env:OC_TORDIR; if($p.Path){ $ok=($p.Path -ieq $pd) -or ($p.Path -like ($pd+'\*')) } }catch{}; if($ok){ try{ Stop-Process -Id $p.Id -Force }catch{} } } }" >nul 2>&1
if exist "%OC_BRPIDF%" "%PSX%" -NoProfile -Command "$t=Get-Content -LiteralPath $env:OC_BRPIDF -ErrorAction SilentlyContinue | Select-Object -First 1; if($t){ try{ $p=Get-Process -Id ([int]$t) -ErrorAction Stop }catch{ $p=$null }; if($p -and ($p.ProcessName -eq 'powershell' -or $p.ProcessName -eq 'pwsh')){ $ok=$false; try{ $cl=(Get-CimInstance Win32_Process -Filter ('ProcessId=' + [string]$p.Id)).CommandLine; if($cl -and $cl.Contains('OC_TORBRIDGE_PS')){ $ok=$true } }catch{}; if($ok){ try{ Stop-Process -Id $p.Id -Force }catch{} } } }" >nul 2>&1
REM v3.1 (N69): the pid files were deleted even when the identity check failed and the
REM process was still alive, so the launcher lost its own Tor and treated it as foreign.
REM A pid file goes only when its process is gone or is not what the file claims.
"%PSX%" -NoProfile -Command "try{ $f=$env:OC_TORPID; if(Test-Path -LiteralPath $f){ $t=[int](Get-Content -LiteralPath $f -TotalCount 1); $p=Get-Process -Id $t -ErrorAction SilentlyContinue; if(-not $p -or $p.ProcessName -ne 'tor'){ Remove-Item -LiteralPath $f -Force } } }catch{}" >nul 2>&1
"%PSX%" -NoProfile -Command "try{ $f=$env:OC_BRPIDF; if(Test-Path -LiteralPath $f){ $t=[int](Get-Content -LiteralPath $f -TotalCount 1); $p=Get-Process -Id $t -ErrorAction SilentlyContinue; if(-not $p){ Remove-Item -LiteralPath $f -Force } else { $cl=(Get-CimInstance Win32_Process -Filter ('ProcessId='+[string]$t)).CommandLine; if(-not $cl -or -not $cl.Contains('OC_TORBRIDGE_PS')){ Remove-Item -LiteralPath $f -Force } } } }catch{}" >nul 2>&1
set "OURTOR="
set "OURBRIDGE="
goto :eof

REM - is a Tor SOCKS port answering? (v2.22)
REM Checks TOR_SOCKS_PORT first, then Tor Browser's default (9150) and the
REM tor service default (9050). When one of those answers, TOR_SOCKS_PORT
REM is moved to it, so torrc and the bridge point at the live Tor.
REM exit 0 = a usable SOCKS port exists, 1 = none.
:tor_socks_up
call :port_up %TOR_SOCKS_PORT%
if not errorlevel 1 exit /b 0
call :port_up 9150
if not errorlevel 1 goto :tsu_9150
call :port_up 9050
if not errorlevel 1 goto :tsu_9050
exit /b 1
:tsu_9150
call echo %T_202%
set "TOR_SOCKS_PORT=9150"
exit /b 0
:tsu_9050
call echo %T_203%
set "TOR_SOCKS_PORT=9050"
exit /b 0

REM - is the tor recorded in tor.pid ours and still running? (v2.23)
REM Identity rule of :tor_stop: only a tor process whose image path sits
REM inside TOR_DIR counts, whatever the pid file says.
REM exit 0 = ours and alive, 1 = not.
:tor_own_running
set "OC_TORPID=%TOR_DIR%\tor.pid"
if not exist "%OC_TORPID%" exit /b 1
set "OC_TORDIR=%TOR_DIR%"
"%PSX%" -NoProfile -Command "$t=Get-Content -LiteralPath $env:OC_TORPID -ErrorAction SilentlyContinue | Select-Object -First 1; if(-not $t){ exit 1 }; try{ $p=Get-Process -Id ([int]$t) -ErrorAction Stop }catch{ exit 1 }; if($p.ProcessName -ne 'tor'){ exit 1 }; try{ $pd=$env:OC_TORDIR; if($p.Path -and (($p.Path -ieq $pd) -or ($p.Path -like ($pd+'\*')))){ exit 0 } }catch{}; exit 1" >nul 2>&1
exit /b %errorlevel%

REM - renew the Tor circuit (v2.22)
REM Restarting the Tor the launcher started is a real circuit change: every
REM new process builds new circuits from a new guard. A Tor the launcher
REM did NOT start (Tor Browser, a tor service) is never touched. A NEWNYM
REM over ControlPort is not used: the torrc here has no ControlPort.
REM exit 0 = a live Tor answers again, 1 = cannot renew.
:tor_rotate
if not defined OURTOR goto :tr_foreign
call :tor_exit_ip
set "TR_PREV=%TOR_IP%"
set "TR_N=0"
:tr_again
call :tor_stop
call :tor_start_if_needed
if errorlevel 1 goto :tr_fail
call :tor_wait_up
if errorlevel 1 goto :tr_fail
call :tor_ready
if errorlevel 1 goto :tr_fail
call :tor_exit_ip
REM v2.36: a restart usually builds other circuits; when the exit is the same, renew once or twice more
if not defined TOR_IP exit /b 0
if not defined TR_PREV goto :tr_report
if not "%TOR_IP%"=="%TR_PREV%" goto :tr_report
set /a TR_N+=1
if %TR_N% GEQ 3 goto :tr_report
call echo %T_310%
goto :tr_again
:tr_report
call echo %T_311%
exit /b 0
:tr_foreign
call echo %T_204%
call echo %T_205%
exit /b 1
:tr_fail
call :tor_log_tail
exit /b 1

REM - exit IP + warp flag
REM When WARP is on, an IP is reported only if the trace came back
REM through the proxy AND says warp=on. a dead tunnel reports nothing,
REM never the real IP dressed up as a fresh one.
REM Returns the exit IP in the variable named by argument 1 and the
REM warp flag in the variable named by argument 2.
REM Tries the HTTP proxy first, then SOCKS5, when WARP is on.
REM Without WARP it reads the IP directly.
:getip2
call :trace getip2
set "%~1="
set "%~2="
set "GIP="
set "GFLAG="
set "GLOC="
if not defined WARP goto :getip2_direct
set "TFILE=%TEMP%\oc_trace_%RANDOM%.txt"
set "OC_TURL=%TRACE_URL%"
set "OC_TFILE=%TFILE%"
set "OC_TPROXY=%PROXY%"
if "%HAVE_CURL%"=="1" goto :gip_curl_http
REM PowerShell fallback: read the trace through the proxy and write it to a file.
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; (Invoke-RestMethod -Uri $env:OC_TURL -Proxy $env:OC_TPROXY -TimeoutSec 8) -replace [char]13,[char]10 | Out-File -LiteralPath $env:OC_TFILE -Encoding ascii}catch{}" >nul 2>&1
goto :gip_parse
REM curl through the HTTP proxy. If the file is empty, try the SOCKS5 proxy.
:gip_curl_http
curl.exe -4 -s -f --max-time 8 -x "%PROXY%" -o "%TFILE%" "%TRACE_URL%" >nul 2>&1
if exist "%TFILE%" for %%T in ("%TFILE%") do if %%~zT GTR 0 goto :gip_parse
curl.exe -4 -s -f --max-time 8 -x "%SOCKS_PROXY%" -o "%TFILE%" "%TRACE_URL%" >nul 2>&1
goto :gip_parse

REM Without WARP: read the IP directly, with proxies ignored.
:getip2_direct
set "TFILE=%TEMP%\oc_trace_%RANDOM%.txt"
set "OC_TURL=%TRACE_URL%"
set "OC_TFILE=%TFILE%"
if "%HAVE_CURL%"=="1" goto :gid_curl
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; (Invoke-RestMethod -Uri $env:OC_TURL -TimeoutSec 10) -replace [char]13,[char]10 | Out-File -LiteralPath $env:OC_TFILE -Encoding ascii}catch{}" >nul 2>&1
goto :gip_parse
REM curl without any proxy.
:gid_curl
curl.exe -4 -s -f --max-time 10 --noproxy "*" -o "%TFILE%" "%TRACE_URL%" >nul 2>&1

REM Read the ip= and warp= lines from the trace file, then delete it.
REM With WARP on, a result that is not warp=on is discarded.
:gip_parse
if not exist "%TFILE%" goto :gip_done
for /f "tokens=2 delims==" %%i in ('findstr /b "ip=" "%TFILE%"') do set "GIP=%%i"
for /f "tokens=2 delims==" %%w in ('findstr /b "warp=" "%TFILE%"') do set "GFLAG=%%w"
for /f "tokens=2 delims==" %%l in ('findstr /b "loc=" "%TFILE%"') do set "GLOC=%%l"
del /f /q "%TFILE%" >nul 2>&1
REM v2.22: WARP+ accounts answer warp=plus, not warp=on. Both mean the
REM trace came back THROUGH WARP, so plus is normalised to on here, at the
REM single point every caller reads the flag from (:getip2, :ensure_new_ip,
REM :rotate_loop, :rotate and the manual rotation all use this value).
if /i "%GFLAG%"=="plus" set "GFLAG=on"
REM v3.1 (N09): the ip= line is data from the network. Only an IPv4 of four octets
REM or an IPv6 literal is kept; anything else is dropped before it reaches the state.
if defined GIP set "OC_GIP=%GIP%"
if defined GIP "%PSX%" -NoProfile -Command "try{ $v=[string]$env:OC_GIP; if($v -match '^(\d{1,3}\.){3}\d{1,3}$'){ $o=$v -split '[.]'; if(-not (@($o | Where-Object { [int]$_ -gt 255 }).Count)){ exit 0 } }; if($v.Length -ge 7 -and $v.Length -le 45 -and $v -match '^[0-9A-Fa-f:.]+$' -and $v.Contains(':')){ exit 0 } }catch{}; exit 1" >nul 2>&1
if defined GIP if errorlevel 1 set "GIP="
:gip_done
if not defined WARP goto :gip_store
REM v3.1 (N70): GFLAG is lowercased from plus with /i, so the test must be /i too.
if /i not "%GFLAG%"=="on" set "GIP="
REM Return the values through the caller variable names.
:gip_store
if defined GIP set "%~1=%GIP%"
if defined GFLAG set "%~2=%GFLAG%"
goto :eof

REM - make sure this launch does not reuse the last egress IP
REM Compares the current IP with lastip.txt. If they match, it asks
REM WARP for a new registration, up to ROTATE_TRIES_MAX times.
REM After the limit, it keeps the current IP and continues.
:ensure_new_ip
set "LASTIP="
if exist "%STATE_DIR%\lastip.txt" set /p LASTIP=<"%STATE_DIR%\lastip.txt"
call :getip2 CUR CFLAG
if defined CUR if /i "%CFLAG%"=="on" goto :ens_have
call echo %T_206%
goto :eof
REM Current IP is verified: compare it with the last one.
:ens_have
if not defined LASTIP goto :remember_ip
REM v2.43: compared by :ipkey (IPv6: same /64 = same IP).
call :ipkey CURK "%CUR%"
call :ipkey LASTK "%LASTIP%"
if not "%CURK%"=="%LASTK%" goto :remember_ip
call echo %T_207%
set /a EN_TRIES=0

REM Loop: new registration until the IP differs or the limit is reached.
:ens_loop
set /a EN_TRIES+=1
if %EN_TRIES% GTR %ROTATE_TRIES_MAX% goto :ens_giveup
call echo %T_208%
call :reg_drop
call echo %T_209%
call :reg_new
if "%REGNEW%"=="0" call echo %T_338%
call echo %T_210%
call :warp_up
set "WARP_UP=1"
call echo %T_211%
REM v2.43: poll instead of the fixed WARP_WAIT sleep; compare by :ipkey; log each try.
call :warp_poll CUR CFLAG
call :ipkey CURK "%CUR%"
call :ipkey LASTK "%LASTIP%"
call :log "new-ip try %EN_TRIES%: old=%LASTIP% new=%CUR% wait=%WP_SECS%s" rotate
if not defined CUR goto :ens_loop
if not "%CFLAG%"=="on" goto :ens_loop
if "%CURK%"=="%LASTK%" goto :ens_loop

REM Save the IP as the last one used and show it.
:remember_ip
if defined CUR if /i "%CFLAG%"=="on" >"%STATE_DIR%\lastip.txt" echo %CUR%
set "IP=%CUR%"
REM v2.22: the header promises a service restart after every rotation and
REM this path never did it, so the next TUI could inherit the old tunnel's
REM sockets. v2 only: v1 has no shared service.
REM v2.56 (N05): the marker is set only when the restart returned 0; a failed
REM one clears it so the next pass retries.
set "REMSVC=0"
if defined CAP_SERVICE if defined OC_CMD if defined ACTIVE_PROXY call "%OC_CMD%" service restart >nul 2>&1
if defined CAP_SERVICE if defined OC_CMD if defined ACTIVE_PROXY set "REMSVC=%ERRORLEVEL%"
if not "%REMSVC%"=="0" goto :rem_svc_bad
if defined ACTIVE_PROXY set "SVC_PROXIED=%ACTIVE_PROXY%"
goto :rem_svc_done
:rem_svc_bad
set "SVC_PROXIED="
call :log "service restart failed on ensure rc=%REMSVC% proxy=%ACTIVE_PROXY%" rotate
:rem_svc_done
call echo %T_212%
goto :eof
REM Limit reached without a new IP: continue with the current one.
:ens_giveup
call echo %T_213%
REM v2.60 (N90): CUR used to be saved empty, so the IP that did come up was lost and the
REM operator only saw a summary. The known IP is kept instead.
if not defined CUR if defined IP set "CUR=%IP%"
if not defined CUR if defined LASTIP set "CUR=%LASTIP%"
goto :remember_ip

REM - did this run write a fatal line to the log?
REM Sets QHIT=1 when the log part written during this run has a fatal line.
REM If the log does not exist, warns once and leaves auto-detection off.
:check_quota
set "QHIT="
set "QASK="
if exist "%LOGFILE%" goto :cq_run
if defined QWARNED goto :eof
set "QWARNED=1"
call echo %T_214%
call echo %T_215%
goto :eof
REM Scan the log from the size recorded before launch.
:cq_run
call :scan_log %SIZE_BEFORE%
if defined FHIT set "QHIT=1"
if defined FASK set "QASK=1"
goto :eof

REM - close the opencode this launcher started so the chat db unlocks
REM Ask opencode to stop its service, then kill what this launcher started.
REM The short wait lets the database files unlock before they are moved.
REM usage: call :stop_opencode <reason>
:stop_opencode
if defined CAP_SERVICE if defined OC_CMD call "%OC_CMD%" service stop >nul 2>&1
call :stop_launched %1
timeout /t 2 /nobreak >nul 2>&1
goto :eof

REM v2.44: taskkill /im killed every opencode on the PC. This kills only the tree started by :launch
REM (oc_launched.pid = PID and start ticks): the root if it is still that process, and its descendants,
REM orphans included, each born after its parent (so a reused PID is never taken for ours).
REM usage: call :stop_launched <reason>
:stop_launched
set "OC_LPIDF=%STATE_DIR%\oc_launched.pid"
if not exist "%OC_LPIDF%" goto :eof
for /f "usebackq delims=" %%k in (`%PSX% -NoProfile -Command "try{ $v=@((Get-Content -LiteralPath $env:OC_LPIDF -TotalCount 1) -split ' '); $root=[int]$v[0]; $t0=[int64]$v[1]; $tr=[int64]::MaxValue; $r=Get-Process -Id $root -ErrorAction SilentlyContinue; if($r){ if($r.StartTime.Ticks -eq $t0){ [string]$root } else { $tr=$r.StartTime.Ticks } }; $ours=@{}; $ours[$root]=$t0; $all=@(Get-CimInstance Win32_Process); $more=$true; while($more){ $more=$false; foreach($p in $all){ $id=[int]$p.ProcessId; $pp=[int]$p.ParentProcessId; if($ours.ContainsKey($id) -or -not $ours.ContainsKey($pp) -or -not $p.CreationDate){ continue }; $c=$p.CreationDate.Ticks; if($c -lt $ours[$pp]){ continue }; if($pp -eq $root -and $c -ge $tr){ continue }; $ours[$id]=$c; [string]$id; $more=$true } } }catch{}"`) do (
  call :log "stop pid=%%k reason=%~1" proc
  taskkill /pid %%k /t /f >nul 2>&1
)
del /f /q "%OC_LPIDF%" >nul 2>&1
goto :eof

REM - installed desktop version: DVER from the exe's file version (v2.28)
:desktop_version
set "DVER="
set "OC_DEXE=%OC_DESKTOP%"
for /f "usebackq delims=" %%v in (`%PSX% -NoProfile -Command "try{ (Get-Item -LiteralPath $env:OC_DEXE).VersionInfo.FileVersion }catch{}"`) do if not defined DVER set "DVER=%%v"
goto :eof

REM - offer a newer desktop app, once per start, ask first (v2.28)
REM The installed version comes from the exe, the latest from the official
REM release metadata (direct, no proxy). No network or an unreadable version
REM leaves everything as it was; nothing is replaced without a Y. The silent
REM installer upgrades the app in place, so chats and settings stay.
:desktop_update_check
if /i "%UPDATE_ASK%"=="never" goto :eof
if defined ODUPD goto :eof
set "ODUPD=1"
if not defined OC_DESKTOP goto :eof
call :desktop_version
if not defined DVER goto :eof
call :oc_api desktop ""
if not defined OCA_VER goto :eof
call :log "update check: desktop installed %DVER% latest %OCA_VER%" update
set "VGT=0"
call :ver_gt "%OCA_VER%" "%DVER%"
if not "%VGT%"=="1" goto :eof
echo.
call echo %T_216%
call echo %T_217%
call :yn_upd "   Update now? [Y/N]: "
REM errorlevel 0 (no stdin) and 2 (N) both skip the install.
if not errorlevel 1 goto :eof
if errorlevel 2 goto :eof
REM v2.44: only the app this launcher started, never a window opened by hand.
call :stop_launched desktop-update
timeout /t 2 /nobreak >nul 2>&1
set "DVER_PREV=%DVER%"
call :install_desktop
call :rescan_desktop
set "DVER="
call :desktop_version
REM v3.1 (N35): T_339 was printed with only DVER defined, and DVER still held the old
REM version when the installer failed. Only a real change says "now reports".
if not defined DVER goto :eof
if /i "%DVER%"=="%DVER_PREV%" call :log "desktop update: version unchanged at %DVER%" update
if /i not "%DVER%"=="%DVER_PREV%" call echo %T_339%
goto :eof
goto :eof

REM - download and silently install the official desktop app (v2.27)
:install_desktop
if "%REAL86%"=="1" goto :id_no86
call :have_exe curl.exe
set "HAVE_CURL=%HAVE%"
set "ID_ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ID_ARCH=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "ID_ARCH=arm64"
set "ID_FILE=opencode-desktop-win-%ID_ARCH%.exe"
call :oc_api desktop "%ID_FILE%"
if not defined OCA_URL goto :id_noapi
set "ID_URL=%OCA_URL%"
set "ID_EXE=%TEMP%\opencode-desktop-setup.exe"
if exist "%ID_EXE%" del /f /q "%ID_EXE%" >nul 2>&1
REM download direct: the user's own proxy variables are put back below
set "ID_HP=%HTTP_PROXY%"
set "ID_SP=%HTTPS_PROXY%"
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "OC_URL=%ID_URL%"
set "OC_OUT=%ID_EXE%"
call echo %T_218%
if "%HAVE_CURL%"=="1" goto :id_curl
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri $env:OC_URL -OutFile $env:OC_OUT}catch{}" >nul 2>&1
goto :id_check
:id_curl
curl.exe -L -f -s --max-time 900 --noproxy "*" -o "%ID_EXE%" "%ID_URL%"
if not errorlevel 1 goto :id_check
REM Direct egress failed: retry through the Windows proxy settings.
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri $env:OC_URL -OutFile $env:OC_OUT}catch{}" >nul 2>&1
:id_check
set "HTTP_PROXY=%ID_HP%"
set "HTTPS_PROXY=%ID_SP%"
set "ID_OK=0"
if exist "%ID_EXE%" for %%M in ("%ID_EXE%") do if not "%%~zM"=="" if %%~zM GTR 50000000 set "ID_OK=1"
if not "%ID_OK%"=="1" goto :id_bad
call :oc_sha "%ID_EXE%" "%OCA_SHA%"
if "%SHAOK%"=="1" goto :id_run
call echo %T_219%
:id_bad
call echo %T_220%
call echo %T_221%
call echo %T_222%
if exist "%ID_EXE%" del /f /q "%ID_EXE%" >nul 2>&1
goto :eof
:id_run
call echo %T_223%
set "OC_ID=%ID_EXE%"
"%PSX%" -NoProfile -Command "try{Start-Process $env:OC_ID -ArgumentList '/S' -Wait}catch{}" >nul 2>&1
del /f /q "%ID_EXE%" >nul 2>&1
goto :eof
:id_noapi
call echo %T_224%
call echo %T_225%
goto :eof
:id_no86
call echo %T_226%
goto :eof

REM - the activity log (v2.29): usage call :log "message" source
REM One line per event in launcher.log: time, session id (shared with the hidden
REM child runs and the UI), source, message. Delayed expansion keeps &, | and >
REM in a message from running as commands; keep quotes out of the message.
REM v3.1 (D14): the one console line of the hot path. Always in launcher.log
REM (category ui), printed unless CONSOLE_MODE is quiet. The TUI and the menus
REM keep their own echo, so they are untouched by --quiet.
REM usage: call :msg <text>
:msg
call :log "%*" ui
if /i "%CONSOLE_MODE%"=="quiet" goto :eof
echo %*
goto :eof

:log
if "%LOG_ENABLED%"=="0" goto :eof
if not exist "%STATE_DIR%" goto :eof
setlocal EnableDelayedExpansion
set "LM=%~1"
>>"%STATE_DIR%\launcher.log" echo [%DATE% %TIME%] [%OC_SID%] [%~2] !LM!
endlocal
REM v3.1 (N72): the log is bounded while it grows, not only at start.
if defined LOG_MAXB call :trim_grow
goto :eof

:trim_grow
REM v3.1 (N72): LOG_MAXB is expanded at run time here; expanded inside :log it is empty before the first setting and breaks the line.
if not exist "%STATE_DIR%\launcher.log" goto :eof
for %%L in ("%STATE_DIR%\launcher.log") do if %%~zL GTR %LOG_MAXB% call :trim_log "%STATE_DIR%\launcher.log" %LOG_MAXB% %LOG_KEEP%
goto :eof

REM - the UI (v2.29): usage "call :tui home|settings|export"; exit code 0 = leave,
REM 10 = continue, 20 = no usable console. The script is read out of this file.
:tui
set "OC_TUI=%~1"
set "OC_STATE=%STATE_DIR%"
"%PSX%" -NoProfile -Command "$l=Get-Content -LiteralPath $env:OCI_SELF; $i=[Array]::IndexOf($l,'#>>>OC_TUI_PS'); $e=[Array]::IndexOf($l,'#>>>OC_ENDTUI'); if(($i -lt 0) -or ($e -le $i)){exit 20}; Invoke-Expression (($l[($i+1)..($e-1)]) -join [Environment]::NewLine)"
set "TUIX=%errorlevel%"
if not "%~1"=="probe" call :log "ui %~1 -> %TUIX%" ui
if not "%~1"=="probe" if defined C_ACC <nul set /p "=%C_ACC%"
if exist "%STATE_DIR%\lang\messages.txt" for /f "usebackq tokens=1,* delims==" %%a in ("%STATE_DIR%\lang\messages.txt") do set "%%a=%%b"
exit /b %TUIX%

REM - does a usable console exist for the interface? sets TUI_OK once per run
:tui_init
if defined TUI_PROBED goto :eof
set "TUI_PROBED=1"
call :tui probe
if "%errorlevel%"=="0" set "TUI_OK=1"
goto :eof

REM - yes/no in the interface style: errorlevel 1 = yes, 2 = no, like choice /c yn.
REM Anything else (Ctrl+C) counts as no. No usable console falls back to choice.
REM usage: call :yn "question [Y/N]" [seconds until the default answer, No]
:yn
call :tui_init
if not defined TUI_OK goto :yn_old
set "OC_Q=%~1"
set "OC_QT=%~2"
call :tui confirm
set "TUIRC=%errorlevel%"
set "OC_QT="
if "%TUIRC%"=="20" goto :yn_old
if "%TUIRC%"=="1" exit /b 1
if "%TUIRC%"=="3" exit /b 3
exit /b 2
:yn_upd
set "OC_UPD=1"
call :yn %1
set "YU_RC=%errorlevel%"
set "OC_UPD="
exit /b %YU_RC%
:yn_old
if "%~2"=="" call :pick yn "%~1 "
if not "%~2"=="" call :pick yn "%~1 " %~2 2
REM v2.39: :pick returns 0 on Ctrl+C; callers test errorlevel 2 for No, so 0 must mean No.
if "%errorlevel%"=="0" exit /b 2
exit /b %errorlevel%

REM - colors for the launcher's own lines (v2.29): the same theme as the interface.
REM ui.env (written by the interface from a real console) says whether the console
REM understands ANSI colors and which accent the theme uses. The accent becomes the
REM default text color, so every plain line follows the theme; warnings, errors and
REM successes get yellow, red and green. Nothing is printed when colors are off.
:ui_style
set "C_RST="
set "C_OFF="
set "C_ACC="
set "C_OK="
set "C_ERR="
set "C_WARN="
set "C_DIM="
if not "%UI_COLOR%"=="1" goto :eof
if not defined ESC for /f "tokens=1,2 delims=#" %%a in ('"prompt #$H#$E# & echo on & for %%b in (1) do rem"') do set "ESC=%%b"
if not defined ESC goto :eof
set "C_OFF=%ESC%[0m"
set "C_OK=%ESC%[32m"
set "C_ERR=%ESC%[31m"
set "C_WARN=%ESC%[33m"
set "C_DIM=%ESC%[90m"
if defined UI_ACC if not "%UI_ACC%"=="0" set "C_ACC=%ESC%[%UI_ACC%m"
set "C_RST=%C_OFF%%C_ACC%"
goto :eof

REM - put the console back to normal (the accent is set inline where it is needed)
:ui_reset
if defined C_OFF <nul set /p "=%C_OFF%"
goto :eof

REM - validate config.json and rewrite config.env (hand edits are checked here)
:cfg_refresh
call :tui export
goto :eof

REM - load config.env into this process; derived values follow the port
:cfg_import
REM N36: only the keys the launcher owns are taken from these files, so a
REM hand-edited PATH, TEMP, STATE_DIR or COMSPEC cannot replace the environment
REM of the running launcher.
set "CFG_KEYS= AUTO_ROTATE CHAT_SNAPSHOT IP_FIND_MAX KEY_MENU KEY_QUIT KEY_ROTATE LIMIT_ACTION LIMIT_MODEL LIMIT_ROT_MAX LOG_ENABLED LOG_MASK_IP LOG_MAX_KB MENU_DEFAULT MULTI_INSTANCE OC_API_BASE OC_APP OC_EGRESS_DEFAULT OC_MODE_DEFAULT OC_MODEL OC_OTHER_WINDOW OCUI_COLOR OCUI_FONT OCUI_FONT_SIZE OCUI_ICONS OCUI_LANG OCUI_THEME ON_CLOSE POOL_ENABLE POOL_INTERVAL POOL_MAX PROBE PROBE_BROKEN_MAX PROBE_MODEL PROXY_API_CHECK PROXY_API_CHECK_URL PROXY_FIXED PROXY_LIST_MIN_BYTES PROXY_LIST_URL PROXY_PORT PROXY_PROBE_TIMEOUT PROXY_ROT_MAX PROXY_TRY_MAX QUOTA_RESUME RESUME_AUTO RESUME_MODE RESUME_MSG RESUME_TEXT RESUME_TIMEOUT REUSE_EMPTY ROTATE_COOLDOWN ROTATE_TRIES_MAX TARGET_COUNTRY TARGET_INTERVAL TARGET_MINUTES TARGET_PREFIX TARGET_TRIES TOR_AUTO_INSTALL TOR_BOOTSTRAP_WAIT TOR_HTTP_PORT TOR_SOCKS_PORT TYPE_AHEAD UI_ACC UI_COLOR UPDATE_ASK UPDATE_CHECK VPN_TIMEOUT VPNGATE_COUNTRY VPNGATE_MAX WARP_CALL_TIMEOUT WARP_WAIT WATCH WG_DIR WHERE_TIMEOUT "
if exist "%STATE_DIR%\ui.env" for /f "usebackq tokens=1* delims==" %%a in ("%STATE_DIR%\ui.env") do for %%k in (%CFG_KEYS%) do if /i "%%a"=="%%k" set "%%a=%%b"
call :ui_style
if not exist "%STATE_DIR%\config.env" goto :cfg_nums
for /f "usebackq tokens=1* delims==" %%a in ("%STATE_DIR%\config.env") do for %%k in (%CFG_KEYS%) do if /i "%%a"=="%%k" set "%%a=%%b"
set "PROXY=http://127.0.0.1:%PROXY_PORT%"
set "SOCKS_PROXY=socks5h://127.0.0.1:%PROXY_PORT%"
if defined PROXY_BR set "PROXY=%PROXY_BR%"
:cfg_nums
REM N36: the same numeric checks as at boot, repeated after every import, so a
REM config.env cannot put a non-number or a negative count into a loop limit.
call :numcfg ROTATE_TRIES_MAX 4
call :numcfg WARP_WAIT 6
call :numcfg ROTATE_COOLDOWN 10
call :numcfg TARGET_TRIES 5
call :numcfg TARGET_MINUTES 15
call :numcfg0 TARGET_INTERVAL 15
call :numcfg WARP_CALL_TIMEOUT 15
call :numcfg WHERE_TIMEOUT 5
call :numcfg RESUME_TIMEOUT 90
call :numcfg PROXY_TRY_MAX 40
call :numcfg PROXY_ROT_MAX 10
call :numcfg PROXY_PROBE_TIMEOUT 8
call :numcfg POOL_MAX 5
call :numcfg POOL_INTERVAL 60
call :numcfg0 PROXY_LIST_MIN_BYTES 20
call :numcfg TOR_SOCKS_PORT 9050
call :numcfg TOR_HTTP_PORT 8118
call :numcfg0 IP_FIND_MAX 0
call :numcfg PROBE_BROKEN_MAX 3
call :numcfg VPN_TIMEOUT 45
call :numcfg VPNGATE_MAX 8
call :numcfg0 LIMIT_ROT_MAX 3
call :numcfg TOR_BOOTSTRAP_WAIT 120
call :numcfg LOG_MAX_KB 1024
goto :eof

REM - --help: the commands. Plain text, no setup needed.
:help_mode
echo.
echo OpenCode Infinite - commands
echo.
echo   opencodeinf                      open the launcher menu
echo   opencodeinf --auto               start OpenCode in this folder with no menus,
echo                                    using the last working connection
echo   opencode-auto                    the same as opencodeinf --auto
echo   opencodeinf --preset warp        start with one connection, no menu (warp, tor, proxy)
echo   opencode-warp, opencode-tor,     one connection each, no menu
echo   opencode-proxy                   (Settings, Launch, Install direct commands)
echo   opencodeinf --run [args]         quick start with the saved connection
echo   opencodeinf --here               use the folder you are in as the project folder
echo   opencodeinf --quiet              print nothing, only write the log
echo   opencodeinf --verbose            also log every line
echo   opencodeinf --no-update          skip the update check
echo   opencodeinf --no-probe           skip the IP probe
echo   opencodeinf --install            write opencodeinf and opencode-auto and add their folder to PATH
echo   opencodeinf --help               this list (also -h)
echo.
exit /b 0

REM - --install: the same as Settings, Launch, Install commands.
:install_mode
call :tui install
set "IRC=%errorlevel%"
exit /b %IRC%

REM - --verify: does the saved connection work? exit 0 = yes. Run hidden by setup.
:verify_mode
set "UI_COLOR=0"
call :ui_style
call :have_exe curl.exe
set "HAVE_CURL=%HAVE%"
set "EGRESS=%OC_EGRESS_DEFAULT%"
if /i "%EGRESS%"=="ASK" set "EGRESS=WARP"
call echo %T_227%
call :log "verify start egress=%EGRESS%" verify
if /i "%EGRESS%"=="NONE" goto :vm_none
if /i "%EGRESS%"=="TOR" goto :vm_tor
if /i "%EGRESS%"=="PROXY" goto :vm_proxy
if /i "%EGRESS%"=="WIREGUARD" goto :vm_vpn
if /i "%EGRESS%"=="VPNGATE" goto :vm_vpn
call :find_warp
if not defined WARP goto :vm_nowarp
call :warp_up
if not defined WU_OK goto :vm_wu_fail
call :getip2 IPN WFLAG
call echo %T_228%
if defined IPN if "%WFLAG%"=="on" exit /b 0
call :log "verify: trace came back but not through WARP" verify
exit /b 1
:vm_wu_fail
call echo %T_228%
call :log "verify: WARP unusable, failed step %WU_STEP%" verify
exit /b 1
:vm_nowarp
call echo %T_229%
exit /b 2
:vm_tor
call :tor_gate
set "VMRC=%errorlevel%"
call :tor_stop
exit /b %VMRC%
:vm_proxy
call :pick_free_proxy
exit /b %errorlevel%
:vm_none
curl.exe -s -f --max-time 10 --noproxy "*" -o nul "%TRACE_URL%"
exit /b %errorlevel%
REM v2.36: a tunnel egress is verified by its state (no administrator prompt from a hidden run)
:vm_vpn
call :vpn_run status
if /i "%VPN_STATUS%"=="OK" exit /b 0
exit /b 1

REM - --renew: close the opencode this launcher started, get a new
REM egress. Run hidden by the UI after it asked; exit 0 = renewed.
:renew_mode
set "UI_COLOR=0"
call :ui_style
call :have_exe curl.exe
set "HAVE_CURL=%HAVE%"
set "EGRESS=%OC_EGRESS_DEFAULT%"
if /i "%EGRESS%"=="ASK" set "EGRESS=WARP"
call echo %T_230%
call :log "renew start egress=%EGRESS%" renew
call :find_opencode
call :detect_caps
REM v2.44: a renew only needs a new egress: it no longer deletes the tokens or the cache.
call :stop_opencode renew
call :soft_target
if /i "%EGRESS%"=="NONE" goto :rm_done
if /i "%EGRESS%"=="TOR" goto :rm_tor
if /i "%EGRESS%"=="PROXY" goto :rm_proxy
if /i "%EGRESS%"=="WIREGUARD" goto :rm_vpn
if /i "%EGRESS%"=="VPNGATE" goto :rm_vpn
call :find_warp
if not defined WARP goto :rm_nowarp
set /a RM_TRY=0
REM v2.43: --renew also wants an IP (IPv6: a /64) other than the one in lastip.txt.
set "LASTIP="
if exist "%STATE_DIR%\lastip.txt" set /p LASTIP=<"%STATE_DIR%\lastip.txt"
call :ipkey LASTK "%LASTIP%"
:rm_warp_loop
set /a RM_TRY+=1
if %RM_TRY% GTR %ROTATE_TRIES_MAX% goto :rm_fail
if %RM_TRY% GTR 1 timeout /t %ROTATE_COOLDOWN% /nobreak >nul 2>&1
call :reg_drop
call :reg_new
REM N85: no connect on a broken registration; the next try drops it again.
if not "%REGNEW%"=="1" (
  call :log "renew try %RM_TRY%: registration failed, connect skipped" renew
  goto :rm_warp_loop
)
call :warp_up
REM v2.43: poll instead of the fixed WARP_WAIT sleep.
call :warp_poll IPN WFLAG
call :ipkey IPNK "%IPN%"
call :log "renew try %RM_TRY%: old=%LASTIP% new=%IPN% wait=%WP_SECS%s" renew
if not defined IPN goto :rm_warp_loop
if not "%WFLAG%"=="on" goto :rm_warp_loop
REM the same IP is retried while tries are left; on the last try it is kept, as :ens_giveup does.
if "%IPNK%"=="%LASTK%" if %RM_TRY% LSS %ROTATE_TRIES_MAX% goto :rm_warp_loop
call echo %T_231%
>"%STATE_DIR%\lastip.txt" echo %IPN%
goto :rm_done
:rm_vpn
call :vpn_switch
if errorlevel 1 goto :rm_fail
goto :rm_done
:rm_nowarp
call echo %T_232%
exit /b 2
:rm_tor
call :tor_gate
if errorlevel 1 goto :rm_fail
call :tor_rotate
set "RMRC=%errorlevel%"
call :tor_stop
if not "%RMRC%"=="0" goto :rm_fail
goto :rm_done
:rm_proxy
REM v2.60.4: the proxy in use (proxy_current.txt) is burned before a new one is picked; burned entries are kept.
set "PCUR="
if exist "%STATE_DIR%\proxy_current.txt" set /p PCUR=<"%STATE_DIR%\proxy_current.txt"
if defined PCUR >>"%STATE_DIR%\proxy_burned.txt" echo %PCUR%
call :pick_free_proxy
if errorlevel 1 goto :rm_fail
>"%STATE_DIR%\proxy_current.txt" echo %ACTIVE_PROXY%
call echo %T_233%
:rm_done
if exist "%STATE_DIR%\renew_needed.txt" del /f /q "%STATE_DIR%\renew_needed.txt" >nul 2>&1
call echo %T_234%
exit /b 0
:rm_fail
call echo %T_235%
exit /b 1

REM - official release metadata (v2.28)
REM usage: call :oc_api <cli|desktop> "<file name or empty>"
REM Sets OCA_VER, and for a file name also OCA_URL / OCA_SHA / OCA_SIZE. All of
REM them stay empty when the answer is missing; the call is direct (no proxy).
:oc_api
set "OCA_VER="
set "OCA_URL="
set "OCA_SHA="
set "OCA_SIZE="
set "OC_AKIND=%~1"
set "OC_AFILE=%~2"
set "OC_AOUT=%TEMP%\oc_api_%RANDOM%%RANDOM%.txt"
if exist "%OC_AOUT%" del /f /q "%OC_AOUT%" >nul 2>&1
set "KEEP_HP=%HTTP_PROXY%"
set "KEEP_SP=%HTTPS_PROXY%"
set "HTTP_PROXY="
set "HTTPS_PROXY="
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $j=Invoke-RestMethod -Uri ($env:OC_API_BASE+'/'+$env:OC_AKIND+'/opencode/') -TimeoutSec 20; $l=[string]$j.version; if($env:OC_AFILE){ $f=$j.metadata.files.($env:OC_AFILE); if($f){ $l+='|'+$f.url+'|'+$f.sha256+'|'+$f.size } else { $l='' } }; if($l){ [IO.File]::WriteAllText($env:OC_AOUT,$l) } }catch{}" >nul 2>&1
set "HTTP_PROXY=%KEEP_HP%"
set "HTTPS_PROXY=%KEEP_SP%"
if exist "%OC_AOUT%" for /f "usebackq tokens=1-4 delims=|" %%a in ("%OC_AOUT%") do (set "OCA_VER=%%a" & set "OCA_URL=%%b" & set "OCA_SHA=%%c" & set "OCA_SIZE=%%d")
if exist "%OC_AOUT%" del /f /q "%OC_AOUT%" >nul 2>&1
goto :eof

REM - SHA-256 of a download against the published one: SHAOK=1 when they match
REM usage: call :oc_sha "<file>" "<sha256>"
:oc_sha
set "SHAOK=0"
set "OC_SF=%~1"
set "OC_SX=%~2"
if not defined OC_SX goto :eof
"%PSX%" -NoProfile -Command "try{ if((Get-FileHash -LiteralPath $env:OC_SF -Algorithm SHA256).Hash -ieq $env:OC_SX){exit 0}else{exit 1} }catch{exit 1}" >nul 2>&1
if not errorlevel 1 set "SHAOK=1"
goto :eof

REM - the official Windows CLI zip for this CPU: sets OC_AFILE
REM x64 needs AVX2; older CPUs get the -baseline build (the npm script's rule).
:oc_cli_file
set "OCARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "OCARCH=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "OCARCH=arm64"
set "OC_AFILE=opencode-windows-%OCARCH%.zip"
if not "%OCARCH%"=="x64" goto :eof
set "AVX2="
for /f "usebackq delims=" %%v in (`%PSX% -NoProfile -Command "try{ $t=Add-Type -MemberDefinition ('[DllImport(' + [char]34 + 'kernel32.dll' + [char]34 + ')] public static extern bool IsProcessorFeaturePresent(int f);') -Name K32 -Namespace OCW -PassThru; if($t::IsProcessorFeaturePresent(40)){ 'yes' } }catch{ 'yes' }"`) do set "AVX2=%%v"
if not defined AVX2 set "OC_AFILE=opencode-windows-x64-baseline.zip"
goto :eof

REM - locate the OpenCode desktop exe (OC_APP first, then the usual installs)
:find_desktop_app
set "OC_DESKTOP="
REM v2.44: a manual OC_APP (exe or its folder, quotes allowed) must be an existing file, or a folder holding OpenCode.exe: no app.asar test.
if not defined OC_APP goto :fda_auto
set "OC_APPX=%OC_APP:"=%"
if exist "%OC_APPX%\OpenCode.exe" set "OC_APPX=%OC_APPX%\OpenCode.exe"
if exist "%OC_APPX%" if not exist "%OC_APPX%\" set "OC_DESKTOP=%OC_APPX%"
if defined OC_DESKTOP goto :eof
call :log "OC_APP has no OpenCode.exe: %OC_APPX% - searching the usual places" desktop
:fda_auto
if not defined OC_DESKTOP call :fda_try "%LOCALAPPDATA%\Programs\ai.opencode.desktop\OpenCode.exe"
if not defined OC_DESKTOP call :fda_try "%LOCALAPPDATA%\Programs\@opencode-ai\desktop\OpenCode.exe"
if not defined OC_DESKTOP call :fda_try "%LOCALAPPDATA%\Programs\opencode-desktop\OpenCode.exe"
if not defined OC_DESKTOP call :fda_try "%LOCALAPPDATA%\Programs\opencode\OpenCode.exe"
if not defined OC_DESKTOP call :fda_try "%LOCALAPPDATA%\Programs\OpenCode\OpenCode.exe"
if not defined OC_DESKTOP call :fda_try "%LOCALAPPDATA%\ai.opencode.desktop\OpenCode.exe"
if not defined OC_DESKTOP call :fda_try "%LOCALAPPDATA%\opencode-desktop\OpenCode.exe"
if not defined OC_DESKTOP call :fda_try "%LOCALAPPDATA%\OpenCode\OpenCode.exe"
if not defined OC_DESKTOP call :fda_try "%ProgramFiles%\ai.opencode.desktop\OpenCode.exe"
if not defined OC_DESKTOP call :fda_try "%ProgramFiles%\@opencode-ai\desktop\OpenCode.exe"
if not defined OC_DESKTOP call :fda_try "%ProgramFiles%\opencode-desktop\OpenCode.exe"
if not defined OC_DESKTOP call :fda_try "%ProgramFiles%\opencode\OpenCode.exe"
if not defined OC_DESKTOP call :fda_try "%ProgramFiles%\OpenCode\OpenCode.exe"
if not defined OC_DESKTOP call :fda_try "%ProgramFiles(x86)%\opencode\OpenCode.exe"
if not defined OC_DESKTOP call :fda_try "%ProgramFiles(x86)%\OpenCode\OpenCode.exe"
if defined OC_DESKTOP goto :eof
REM Not in a known folder: ask the uninstall registry keys (read only), a running
REM OpenCode.exe and a shallow search of the usual roots. Only an exe with
REM resources\app.asar next to it counts, so the CLI opencode.exe is never taken.
REM v2.44: no longer once per session: the result is kept 10 minutes in desktop_scan.txt (its time
REM stamp) and :rescan_desktop throws it away ("Re-detect", after an install).
set "OC_DSCF=%STATE_DIR%\desktop_scan.txt"
for /f "usebackq delims=" %%i in (`%PSX% -NoProfile -Command "$cf=$env:OC_DSCF; if((Test-Path -LiteralPath $cf) -and (((Get-Date)-(Get-Item -LiteralPath $cf).LastWriteTime).TotalMinutes -lt 10)){ $y=[string](Get-Content -LiteralPath $cf -TotalCount 1); if($y -and (Test-Path -LiteralPath $y)){ $y }; exit }; $c=@(); foreach($r in 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'){ foreach($k in @(Get-ItemProperty $r -ErrorAction SilentlyContinue)){ if($k.DisplayName -like '*opencode*'){ if($k.InstallLocation){$c+=Join-Path $k.InstallLocation 'OpenCode.exe'}; if($k.DisplayIcon){$c+=(($k.DisplayIcon -replace ',\d+$','').Trim([char]34))} } } }; foreach($p in @(Get-Process -Name OpenCode -ErrorAction SilentlyContinue)){ if($p.Path){$c+=$p.Path} }; foreach($rd in @(@($env:LOCALAPPDATA+'\Programs',3),@($env:ProgramFiles,2),@(${env:ProgramFiles(x86)},2),@($env:LOCALAPPDATA,1),@($env:APPDATA,1))){ if($rd[0] -and (Test-Path -LiteralPath $rd[0])){ foreach($f in @(Get-ChildItem -LiteralPath $rd[0] -Filter OpenCode.exe -Recurse -Depth $rd[1] -ErrorAction SilentlyContinue)){ $c+=$f.FullName } } }; $hit=''; foreach($x in $c){ if($x -and (Test-Path -LiteralPath $x) -and (Test-Path -LiteralPath (Join-Path (Split-Path $x) 'resources\app.asar'))){ $hit=$x; break } }; try{ Set-Content -LiteralPath $cf -Value $hit }catch{}; if($hit){ $hit }"`) do if not defined OC_DESKTOP set "OC_DESKTOP=%%i"
goto :eof

REM v2.44: forget the cached search and look again (after an install, or "Re-detect" in Settings - Paths).
:rescan_desktop
if exist "%STATE_DIR%\desktop_scan.txt" del /f /q "%STATE_DIR%\desktop_scan.txt" >nul 2>&1
call :log "desktop re-detect requested" desktop
call :find_desktop_app
goto :eof
:fda_try
if exist "%~1" if exist "%~dp1resources\app.asar" set "OC_DESKTOP=%~1"
goto :eof

REM - the desktop can be redirected to OneDrive or another drive
REM Asks PowerShell for the real Desktop folder. If that fails, falls back
REM to OneDrive\Desktop, then Desktop, then the user profile folder.
:find_desktop
set "DESKTOP="
set "OC_OUT=%TEMP%\oc_dsk_%RANDOM%.txt"
if exist "%OC_OUT%" del /f /q "%OC_OUT%" >nul 2>&1
set "OC_DSK=%OC_OUT%"
"%PSX%" -NoProfile -Command "try{[IO.File]::WriteAllLines($env:OC_DSK, [Environment]::GetFolderPath('Desktop'))}catch{}" >nul 2>&1
if exist "%OC_OUT%" for /f "usebackq delims=" %%D in ("%OC_OUT%") do set "DESKTOP=%%D"
if exist "%OC_OUT%" del /f /q "%OC_OUT%" >nul 2>&1
if defined DESKTOP if not exist "%DESKTOP%\" set "DESKTOP="
if not defined DESKTOP if exist "%USERPROFILE%\OneDrive\Desktop" set "DESKTOP=%USERPROFILE%\OneDrive\Desktop"
if not defined DESKTOP if exist "%USERPROFILE%\Desktop" set "DESKTOP=%USERPROFILE%\Desktop"
if not defined DESKTOP set "DESKTOP=%USERPROFILE%"
goto :eof

REM - move the chats out of the way, timestamped, never overwritten
REM Creates a timestamped folder on the Desktop and moves the chat database
REM and storage folder into it. The stamp comes from PowerShell, with a random
REM fallback. MOVED stays 0 when nothing was moved, and the empty folder is removed.
:deep_archive
if not defined DESKTOP call :find_desktop
set "ARCHIVE_ROOT=%DESKTOP%\opencode_chats_archiviate"
set "STAMP="
set "OC_OUT=%TEMP%\oc_stm_%RANDOM%.txt"
if exist "%OC_OUT%" del /f /q "%OC_OUT%" >nul 2>&1
set "OC_STM=%OC_OUT%"
"%PSX%" -NoProfile -Command "try{[IO.File]::WriteAllLines($env:OC_STM, (Get-Date -Format yyyyMMdd-HHmmss))}catch{}" >nul 2>&1
if exist "%OC_OUT%" for /f "usebackq delims=" %%T in ("%OC_OUT%") do set "STAMP=%%T"
if exist "%OC_OUT%" del /f /q "%OC_OUT%" >nul 2>&1
if not defined STAMP set "STAMP=r%RANDOM%%RANDOM%"
set "TARGET=%ARCHIVE_ROOT%\%STAMP%"
call echo %T_236%
echo     "%TARGET%"
set "MOVED=0"
if exist "%DATA_DIR%\storage" call :archive_storage
REM v3.1 (N71): a partial storage move stops here; the databases stay where they are.
if not defined ARCH_PARTIAL for %%F in (opencode.db opencode.db-wal opencode.db-shm) do call :archive_file %%F
if not "%MOVED%"=="0" goto :arch_done
if exist "%TARGET%" rmdir "%TARGET%" >nul 2>&1
call echo %T_237%
goto :eof
REM Something was moved: report it.
:arch_done
call echo %T_238%
goto :eof

REM robocopy does not care about volumes and deletes the source
REM only after the copy is complete.
REM Move the storage folder with robocopy. Exit codes 2 and above mean failure.
:archive_storage
if not exist "%TARGET%" mkdir "%TARGET%" >nul 2>&1
robocopy "%DATA_DIR%\storage" "%TARGET%\storage" /e /move /r:1 /w:1 /nfl /ndl /njh /njs /np >nul
REM v3.1 (N71): robocopy 2/4 are partial copies. Anything above 1 leaves the storage
REM half moved, so this pass does not claim MOVED and does not archive the .db files.
if errorlevel 2 (
  set "ARCH_PARTIAL=1"
  call echo %T_239%
  goto :eof
)
set "MOVED=1"
goto :eof

REM copy first, verify the size, delete only then.
REM Copy one database file, compare the sizes, and delete the original only if they match.
:archive_file
if not exist "%DATA_DIR%\%1" goto :eof
if not exist "%TARGET%" mkdir "%TARGET%" >nul 2>&1
copy /y "%DATA_DIR%\%1" "%TARGET%\%1" >nul
if errorlevel 1 (
  call echo %T_240%
  goto :eof
)
set "SZS="
set "SZD="
for %%A in ("%DATA_DIR%\%1") do set "SZS=%%~zA"
for %%A in ("%TARGET%\%1") do set "SZD=%%~zA"
if "%SZS%"=="%SZD%" goto :af_del
call echo %T_241%
del /f /q "%TARGET%\%1" >nul 2>&1
goto :eof
REM Sizes match: delete the original and count the file as moved.
:af_del
del /f /q "%DATA_DIR%\%1" >nul 2>&1
set "MOVED=1"
goto :eof

REM - v2.42: tokens survive restarts. A copy of auth.json is kept in the state
REM folder at every start. If auth.json vanished and no reset was asked for,
REM it is put back from that copy and the event is logged. A reset deletes the copy.
:token_guard
set "AUTH_SNAP=%STATE_DIR%\auth_snapshot"
if exist "%DATA_DIR%\auth.json" goto :tg_save
if exist "%AUTH_SNAP%\auth.json" goto :tg_restore
goto :eof
:tg_save
set "AUTH_SZ=0"
for %%A in ("%DATA_DIR%\auth.json") do set "AUTH_SZ=%%~zA"
if %AUTH_SZ% LSS 3 goto :eof
if not exist "%AUTH_SNAP%\" mkdir "%AUTH_SNAP%" >nul 2>&1
REM v3.1 (N37): one previous snapshot is kept and each copy carries its SHA-256,
REM so a truncated snapshot is never installed as auth.json.
if exist "%AUTH_SNAP%\auth.json" copy /y "%AUTH_SNAP%\auth.json" "%AUTH_SNAP%\auth.json.prev" >nul 2>&1
if exist "%AUTH_SNAP%\auth.json" if exist "%AUTH_SNAP%\auth.json.sha256" copy /y "%AUTH_SNAP%\auth.json.sha256" "%AUTH_SNAP%\auth.json.prev.sha256" >nul 2>&1
copy /y "%DATA_DIR%\auth.json" "%AUTH_SNAP%\auth.json" >nul 2>&1
set "OC_SNAP=%AUTH_SNAP%"
"%PSX%" -NoProfile -Command "try{ $a=Join-Path $env:OC_SNAP 'auth.json'; $h=(Get-FileHash -Algorithm SHA256 -LiteralPath $a).Hash; [IO.File]::WriteAllText(($a+'.sha256'),$h) }catch{}" >nul 2>&1
goto :eof
:tg_restore
if not exist "%DATA_DIR%\" mkdir "%DATA_DIR%" >nul 2>&1
REM v3.1 (N37): a snapshot is restored only when its SHA-256 matches; the previous
REM one is tried second. A truncated file is left where it is.
set "OC_SNAP=%AUTH_SNAP%"
set "OC_DDIR=%DATA_DIR%"
"%PSX%" -NoProfile -Command "try{ $s=$env:OC_SNAP; $d=Join-Path $env:OC_DDIR 'auth.json'; foreach($nm in @('auth.json','auth.json.prev')){ $a=Join-Path $s $nm; $hf=$a+'.sha256'; if(-not (Test-Path -LiteralPath $a)){ continue }; if(-not (Test-Path -LiteralPath $hf)){ continue }; $want=[string](Get-Content -LiteralPath $hf -TotalCount 1); if(-not $want){ continue }; if((Get-FileHash -Algorithm SHA256 -LiteralPath $a).Hash -ine $want.Trim()){ continue }; Copy-Item -LiteralPath $a -Destination $d -Force; exit 0 }; exit 1 }catch{ exit 1 }" >nul 2>&1
if errorlevel 1 goto :tg_bad
call :log "tokens: auth.json was missing, restored from the launcher snapshot (hash verified)" tokens
call echo %T_351%
goto :eof
:tg_bad
call :log "tokens: the snapshot failed its hash check - auth.json is not restored" tokens
goto :eof
REM - cache and saved tokens, two separate actions (v2.44). Chats are not touched here.
REM usage: call :clear_cache <why>   - the opencode cache folder only, never auth.json
:clear_cache
set "CACHE_DIR=%USERPROFILE%\.cache\opencode"
if not exist "%CACHE_DIR%" goto :eof
call :log "delete cache: %CACHE_DIR% (why=%~1)" clean
rmdir /s /q "%CACHE_DIR%" >nul 2>&1
echo   cache cleared.
goto :eof

REM usage: call :clear_tokens <why>  - auth.json only, after a verified copy to backup\auth\<date-time>
REM v2.22: auth.json is archived (copy, size check, delete) before it is removed.
REM v2.44: the backup is plain text in the user's own state folder (DPAPI is left to the C++ app).
:clear_tokens
REM v2.42: an explicit reset also drops the snapshot, so :token_guard cannot bring the tokens back.
if exist "%STATE_DIR%\auth_snapshot\auth.json" del /f /q "%STATE_DIR%\auth_snapshot\auth.json" >nul 2>&1
if not exist "%DATA_DIR%\auth.json" goto :eof
if not defined STAMP call :soft_target
call :log "delete tokens: %DATA_DIR%\auth.json (why=%~1) backup=%LOCALAPPDATA%\opencode-infinite\backup\auth\%STAMP%" clean
call :archive_auth
goto :eof

REM - archive auth.json into this reset's folder, verify, then delete
:archive_auth
if not defined STAMP goto :aa_nodir
REM v2.40: auth.json holds every API key: it is kept in the private state folder, never on the (often OneDrive-synced) Desktop.
set "AUTH_BAK=%LOCALAPPDATA%\opencode-infinite\backup\auth\%STAMP%"
if not exist "%AUTH_BAK%" mkdir "%AUTH_BAK%" >nul 2>&1
copy /y "%DATA_DIR%\auth.json" "%AUTH_BAK%\auth.json" >nul 2>&1
if errorlevel 1 goto :aa_fail
set "SZS="
set "SZD="
for %%A in ("%DATA_DIR%\auth.json") do set "SZS=%%~zA"
for %%A in ("%AUTH_BAK%\auth.json") do set "SZD=%%~zA"
if not "%SZS%"=="%SZD%" goto :aa_bad
del /f /q "%DATA_DIR%\auth.json" >nul 2>&1
call echo %T_243%
goto :eof
:aa_bad
del /f /q "%AUTH_BAK%\auth.json" >nul 2>&1
call echo %T_244%
goto :eof
:aa_fail
call echo %T_245%
goto :eof
:aa_nodir
call echo %T_246%
goto :eof

REM - hand the WARP proxy to the child process only
REM Returns errorlevel 1 when the proxy is dead; the caller decides.
REM Sets HTTP_PROXY, HTTPS_PROXY and no_proxy so that child processes use the proxy.
:export_proxy
if not defined WARP goto :eof
REM The tunnel can need a few seconds after a (re)connect: poll the proxy for WARP_WAIT seconds before failing.
set /a EP_T0=0
:ep_probe
call :proxy_ok
if not errorlevel 1 goto :ep_probed
if %EP_T0% GEQ %WARP_WAIT% (call echo %T_WP_FAIL% & exit /b 1)
set /a EP_T0+=1
timeout /t 1 /nobreak >nul 2>&1
goto :ep_probe
:ep_probed
REM OpenCode (Bun) speaks HTTP only. A SOCKS5-only WARP port gets the launcher's own
REM HTTP-to-SOCKS5 bridge in front of it (the same code Tor uses), so DNS is resolved by WARP.
if /i not "%PROXY_KIND%"=="socks" goto :ep_http
call :warp_bridge_up
if errorlevel 1 exit /b 1
set "PROXY=%PROXY_BR%"
:ep_http
set "HTTP_PROXY=%PROXY%"
set "HTTPS_PROXY=%PROXY%"
set "no_proxy=%OC_NOPROXY_LIST%"
REM Fail closed: the exit must be WARP (warp=on) through the same proxy OpenCode gets.
call :warp_verify
if errorlevel 1 (call :restore_env & exit /b 1)
set "ACTIVE_PROXY=%PROXY%"
exit /b 0

REM - hand ACTIVE_PROXY (TOR / free HTTP) to the child process only
:export_proxy_active
if not defined ACTIVE_PROXY exit /b 1
>"%STATE_DIR%\proxy_current.txt" echo %ACTIVE_PROXY%
set "HTTP_PROXY=%ACTIVE_PROXY%"
set "HTTPS_PROXY=%ACTIVE_PROXY%"
set "no_proxy=%OC_NOPROXY_LIST%"
call echo %T_249%
exit /b 0

REM - WARP bridge: WARP's port is SOCKS5 only and OpenCode needs HTTP. The HTTP-to-SOCKS5
REM bridge is the one Tor uses (#>>>OC_TORBRIDGE_PS). It listens on 127.0.0.1 at the first free
REM port from 8119 and forwards to PROXY_PORT. Sets PROXY_BR, PROXY_BR_PORT and OURWBRIDGE=1.
:warp_bridge_up
if not defined WARP exit /b 1
if defined OURWBRIDGE call :port_up %PROXY_BR_PORT%
if defined OURWBRIDGE if not errorlevel 1 exit /b 0
call :warp_bridge_stop
set "PROXY_BR_PORT="
call :wb_free 8119
call :wb_free 8120
call :wb_free 8121
if not defined PROXY_BR_PORT goto :wbu_fail
if not exist "%STATE_DIR%" mkdir "%STATE_DIR%" >nul 2>&1
set "OC_BRPORT=%PROXY_BR_PORT%"
set "OC_BRSOCKS=%PROXY_PORT%"
set "OC_BRLOG=%STATE_DIR%\warp_bridge.log"
set "OC_BRPIDF=%STATE_DIR%\warp_bridge.pid"
if exist "%OC_BRLOG%" del /f /q "%OC_BRLOG%" >nul 2>&1
call echo %T_WB_START%
start "" /b "%PSX%" -NoProfile -Command "$l=Get-Content -LiteralPath $env:OCI_SELF; $i=[Array]::IndexOf($l,'#>>>OC_TORBRIDGE_PS'); $e=[Array]::IndexOf($l,'#>>>OC_ENDTORBRIDGE'); if(($i -ge 0) -and ($e -gt $i)){ $BRTEXT=(($l[($i+1)..($e-1)]) -join [Environment]::NewLine); Invoke-Expression $BRTEXT }"
set "OURWBRIDGE=1"
set /a WB_TRY=0
:wbu_wait
timeout /t 1 /nobreak >nul 2>&1
call :port_up %PROXY_BR_PORT%
if not errorlevel 1 goto :wbu_ok
set /a WB_TRY+=1
if %WB_TRY% GEQ 6 goto :wbu_fail
goto :wbu_wait
:wbu_ok
set "PROXY_BR=http://127.0.0.1:%PROXY_BR_PORT%"
exit /b 0
:wbu_fail
call echo %T_WB_FAIL%
call :warp_bridge_stop
exit /b 1
:wb_free
if defined PROXY_BR_PORT exit /b 0
call :port_up %1
if errorlevel 1 set "PROXY_BR_PORT=%1"
exit /b 0
REM Stops only the bridge this launcher started (pid file + command line marker).
:warp_bridge_stop
set "OC_WBPIDF=%STATE_DIR%\warp_bridge.pid"
if exist "%OC_WBPIDF%" "%PSX%" -NoProfile -Command "$t=Get-Content -LiteralPath $env:OC_WBPIDF -ErrorAction SilentlyContinue | Select-Object -First 1; if($t){ try{ $p=Get-Process -Id ([int]$t) -ErrorAction Stop }catch{ $p=$null }; if($p -and ($p.ProcessName -eq 'powershell' -or $p.ProcessName -eq 'pwsh')){ $ok=$false; try{ $cl=(Get-CimInstance Win32_Process -Filter ('ProcessId=' + [string]$p.Id)).CommandLine; if($cl -and $cl.Contains('OC_TORBRIDGE_PS')){ $ok=$true } }catch{}; if($ok){ try{ Stop-Process -Id $p.Id -Force }catch{} } } }" >nul 2>&1
if exist "%OC_WBPIDF%" del /f /q "%OC_WBPIDF%" >nul 2>&1
set "OURWBRIDGE="
set "PROXY_BR="
exit /b 0
REM Fail-closed check: a trace through the proxy OpenCode gets must say warp=on (plus counts).
REM Two tries. Sets WV_FLAG and WV_IP for the messages.
:warp_verify
set /a WV_TRY=0
:wv_try
set /a WV_TRY+=1
set "WV_FLAG="
set "WV_IP="
set "WV_FILE=%TEMP%\oc_wv_%RANDOM%%RANDOM%.txt"
if "%HAVE_CURL%"=="1" curl.exe -4 -s -f --max-time 10 -x "%PROXY%" -o "%WV_FILE%" "%TRACE_URL%" >nul 2>&1
if not "%HAVE_CURL%"=="1" "%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; (Invoke-RestMethod -Uri $env:TRACE_URL -Proxy $env:PROXY -TimeoutSec 10) -replace [char]13,[char]10 | Out-File -LiteralPath $env:WV_FILE -Encoding ascii}catch{}" >nul 2>&1
if exist "%WV_FILE%" for /f "tokens=2 delims==" %%i in ('findstr /b "ip=" "%WV_FILE%"') do set "WV_IP=%%i"
if exist "%WV_FILE%" for /f "tokens=2 delims==" %%w in ('findstr /b "warp=" "%WV_FILE%"') do set "WV_FLAG=%%w"
del /f /q "%WV_FILE%" >nul 2>&1
if /i "%WV_FLAG%"=="plus" set "WV_FLAG=on"
if /i "%WV_FLAG%"=="on" goto :wv_ok
if %WV_TRY% GEQ 2 goto :wv_fail
timeout /t 2 /nobreak >nul 2>&1
goto :wv_try
:wv_ok
if not defined OPT_AUTO call echo %T_WV_OK%
exit /b 0
:wv_fail
call echo %T_WV_FAIL%
exit /b 1
REM -- end of WARP bridge --
REM - put the user's own proxy variables back (v2.22)
REM The launcher overwrites HTTP_PROXY / HTTPS_PROXY / no_proxy for the
REM child tree. Before v2.22 it then emptied them, which deleted values
REM that were already set system-wide or by the user's shell.
:restore_env
set "HTTP_PROXY=%OC_HP0%"
set "HTTPS_PROXY=%OC_SP0%"
set "no_proxy=%OC_NP0%"
REM v3.1 (N27): the VPNGATE-only NODE_OPTIONS is put back here too.
if defined OC_NODE_OPTIONS_SET set "NODE_OPTIONS=%OC_NODE_OPTIONS_PREV%"
goto :eof

REM - can the proxy actually carry an https request?
REM With curl: try the HTTP proxy, then SOCKS5. Without curl: only check
REM that the port accepts a TCP connection (the 1.5 second wait).
:proxy_ok
REM v2.22: PROXY_KIND records WHICH form answered: http, socks or tcp.
REM :export_proxy needs it to hand opencode a URL that actually works.
set "PROXY_KIND="
if not "%HAVE_CURL%"=="1" goto :proxy_ok_tcp
curl.exe -sS -o nul -f --max-time 6 --noproxy "" --proxy "%PROXY%" "%TRACE_URL%" >nul 2>&1
if not errorlevel 1 goto :pok_http
curl.exe -sS -o nul -f --max-time 6 --noproxy "" --proxy "%SOCKS_PROXY%" "%TRACE_URL%" >nul 2>&1
if not errorlevel 1 goto :pok_socks
exit /b 1
:pok_http
set "PROXY_KIND=http"
exit /b 0
:pok_socks
set "PROXY_KIND=socks"
exit /b 0

REM TCP-only check, used when curl is missing.
:proxy_ok_tcp
"%PSX%" -NoProfile -Command "try{$c=New-Object Net.Sockets.TcpClient;$a=$c.BeginConnect('127.0.0.1',%PROXY_PORT%,$null,$null);if(-not $a.AsyncWaitHandle.WaitOne(1500)){exit 1};$c.EndConnect($a);$c.Close();exit 0}catch{exit 1}" >nul 2>&1
if errorlevel 1 exit /b 1
set "PROXY_KIND=tcp"
exit /b 0

REM - can this proxy URL still carry the trace request? (v2.22)
REM usage: call :proxy_alive <url>  -> errorlevel 0 when it answers.
REM Without curl there is nothing to test with: reported alive and left to
REM the gate, which is the old behaviour.
:proxy_alive
if not "%HAVE_CURL%"=="1" exit /b 0
set "OC_PA=%~1"
if not defined OC_PA exit /b 1
curl.exe -sS -o nul -f --max-time %PROXY_PROBE_TIMEOUT% --noproxy "" --proxy "%OC_PA%" "%TRACE_URL%" >nul 2>&1
if errorlevel 1 exit /b 1
exit /b 0

REM - TOR readiness: Privoxy (or any HTTP->SOCKS bridge) must answer on TOR_HTTP_PORT
:tor_ready
"%PSX%" -NoProfile -Command "try{$c=New-Object Net.Sockets.TcpClient;$a=$c.BeginConnect('127.0.0.1',%TOR_HTTP_PORT%,$null,$null);if(-not $a.AsyncWaitHandle.WaitOne(1500)){exit 1};$c.EndConnect($a);$c.Close();exit 0}catch{exit 1}" >nul 2>&1
if errorlevel 1 exit /b 1
if "%HAVE_CURL%"=="1" (
  curl.exe -sS -o nul -f --max-time 8 --noproxy "" --proxy "http://127.0.0.1:%TOR_HTTP_PORT%" "%TRACE_URL%" >nul 2>&1
  if errorlevel 1 exit /b 1
)
exit /b 0

REM - download the free HTTP proxy list and pick the first that answers TRACE
:pick_free_proxy
set "ACTIVE_PROXY="
REM v2.23: first candidate that passed the Cloudflare trace but not the
REM (unverified) API check. Offered at the end instead of failing the mode.
set "TRACE_ONLY="
REM v3.8: a proxy typed in Settings is the only candidate: no list download, no pool.
if defined PROXY_FIXED goto :pfp_fixed
call :pool_take PROXY
set "PPOOL_OK="
if defined OC_POOL_PREFER if "%HAVE_CURL%"=="1" (
  curl.exe -sS -o nul -f --max-time %PROXY_PROBE_TIMEOUT% --noproxy "" --proxy "%OC_POOL_PREFER%" "%TRACE_URL%" >nul 2>&1
  if not errorlevel 1 set "PPOOL_OK=1"
)
if defined PPOOL_OK set "ACTIVE_PROXY=%OC_POOL_PREFER%"
set "OC_POOL_PREFER="
if defined PPOOL_OK call echo %T_255%
if defined PPOOL_OK exit /b 0
set "PLIST=%STATE_DIR%\proxy_list.txt"
if exist "%PLIST%" del /f /q "%PLIST%" >nul 2>&1
call echo %T_250%
set "PRAW=%STATE_DIR%\proxy_list_raw.txt"
REM v3.1 (N60): download to a temp file; the old raw list is replaced only after the checks below.
set "PRAW_TMP=%PRAW%.tmp"
if exist "%PRAW_TMP%" del /f /q "%PRAW_TMP%" >nul 2>&1
set "PSRC="
if not defined PROXY_LIST_URL goto :pfp_nolist
set "PSRC=%PROXY_LIST_URL:"=%"
if not defined PSRC goto :pfp_nolist
if /i "%PSRC:~0,7%"=="http://" goto :pfp_url
if /i "%PSRC:~0,8%"=="https://" goto :pfp_url
if /i "%PSRC:~0,6%"=="ftp://" goto :pfp_url
if /i "%PSRC:~0,7%"=="file://" goto :pfp_url
REM anything else is a local file
copy /y "%PSRC%" "%PRAW_TMP%" >nul 2>&1
if not exist "%PRAW_TMP%" goto :pfp_nolist
move /y "%PRAW_TMP%" "%PRAW%" >nul 2>&1
goto :pfp_norm
:pfp_url
set "KEEP_HP=%HTTP_PROXY%"
set "KEEP_SP=%HTTPS_PROXY%"
set "HTTP_PROXY="
set "HTTPS_PROXY="
if "%HAVE_CURL%"=="1" goto :pfp_curl
set "OC_URL=%PSRC%"
set "OC_OUT=%PRAW_TMP%"
"%PSX%" -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri $env:OC_URL -OutFile $env:OC_OUT -TimeoutSec 20}catch{ Remove-Item -LiteralPath $env:OC_OUT -Force -ErrorAction SilentlyContinue }" >nul 2>&1
goto :pfp_dl_done
:pfp_curl
curl.exe -L -f -s --max-time 20 --noproxy "*" -o "%PRAW_TMP%" "%PSRC%" >nul 2>&1
if errorlevel 1 if exist "%PRAW_TMP%" del /f /q "%PRAW_TMP%" >nul 2>&1
:pfp_dl_done
set "HTTP_PROXY=%KEEP_HP%"
set "HTTPS_PROXY=%KEEP_SP%"
REM v2.21: an error page is not a list: PROXY_LIST_MIN_BYTES gates downloads
REM only; a short local list of one proxy is fine.
if not exist "%PRAW_TMP%" exit /b 1
set "PLSZ=0"
for %%F in ("%PRAW_TMP%") do set "PLSZ=%%~zF"
if %PLSZ% LSS %PROXY_LIST_MIN_BYTES% exit /b 1
move /y "%PRAW_TMP%" "%PRAW%" >nul 2>&1
if not exist "%PRAW%" exit /b 1
:pfp_norm
if not exist "%PRAW%" goto :pfp_nolist
REM Read any list format and write one http://host:port per line (v2.28).
REM The normalizer lives at the end of this file (#>>>OC_PLIST_PS).
set "OC_PRAW=%PRAW%"
set "OC_PLIST=%PLIST%"
set "PCOUNT="
for /f "usebackq delims=" %%n in (`%PSX% -NoProfile -Command "$l=Get-Content -LiteralPath $env:OCI_SELF; $i=[Array]::IndexOf($l,'#>>>OC_PLIST_PS'); $e=[Array]::IndexOf($l,'#>>>OC_ENDPLIST'); if(($i -lt 0) -or ($e -le $i)){exit 1}; Invoke-Expression (($l[($i+1)..($e-1)]) -join [Environment]::NewLine)"`) do set "PCOUNT=%%n"
if not defined PCOUNT goto :pfp_nolist
call echo %T_251%
goto :pfp_listok
:pfp_nolist
call echo %T_252%
exit /b 1
:pfp_fixed
set "PFX=%PROXY_FIXED%"
if /i not "%PFX:~0,7%"=="http://" if /i not "%PFX:~0,8%"=="https://" set "PFX=http://%PFX%"
set "PLIST=%STATE_DIR%\proxy_fixed.txt"
> "%PLIST%" echo %PFX%
:pfp_listok
set /a PTRY=0
for /f "usebackq delims=" %%p in ("%PLIST%") do (
  set "CAND=%%p"
  call :pfp_count
  if errorlevel 1 goto :pfp_fail
  if not defined PSKIP call :try_one_proxy
  if not defined PSKIP if not errorlevel 1 goto :pfp_ok
)
:pfp_fail
REM v2.23: every candidate that reached Cloudflare was rejected by the
REM second check, and that check depends on PROXY_API_CHECK_URL, which is
REM not verified. Offer the first proxy that did pass the trace instead of
REM killing PROXY mode outright.
if not defined TRACE_ONLY exit /b 1
REM v2.60 (A3): auto takes no unverified proxy and asks nothing.
if defined OPT_AUTO exit /b 1
call echo %T_253%
call echo %T_254%
call :yn "   Use that proxy anyway? [Y/N]: "
if errorlevel 2 exit /b 1
set "ACTIVE_PROXY=%TRACE_ONLY%"
call echo %T_255%
exit /b 0
:pfp_ok
exit /b 0

REM - count one list attempt and enforce PROXY_TRY_MAX
REM Called from the for body so the counter is not frozen by block expansion.
REM Comment lines (# or ;) are list headers: they do not count toward the
REM cap and never spend a probe (v2.21).
:pfp_count
set "PSKIP="
set "C1=%CAND:~0,1%"
if "%C1%"=="#" exit /b 0
if "%C1%"==";" exit /b 0
REM NEW: a proxy already burned is skipped and does not spend the try cap.
if not exist "%STATE_DIR%\proxy_burned.txt" goto :pfc_count
findstr /x /i /c:"%CAND%" "%STATE_DIR%\proxy_burned.txt" >nul 2>&1 && set "PSKIP=1"
findstr /x /i /c:"http://%CAND%" "%STATE_DIR%\proxy_burned.txt" >nul 2>&1 && set "PSKIP=1"
if defined PSKIP exit /b 0
:pfc_count
set /a PTRY+=1
if %PTRY% GTR %PROXY_TRY_MAX% exit /b 1
exit /b 0

REM - test one candidate from the free list (HTTP and HTTPS proxies)
:try_one_proxy
REM CAND is "ip:port", "http://ip:port" or "https://ip:port"; a comment
REM line is skipped before anything is probed (v2.21).
set "C=%CAND%"
set "C1=%CAND:~0,1%"
if "%C1%"=="#" exit /b 1
if "%C1%"==";" exit /b 1
echo %C% | findstr /i /b "http:// https://" >nul 2>&1
if errorlevel 1 set "C=http://%C%"
echo %C% | findstr /i "socks" >nul 2>&1
if not errorlevel 1 exit /b 1
if not "%HAVE_CURL%"=="1" exit /b 1
curl.exe -sS -o nul -f --max-time %PROXY_PROBE_TIMEOUT% --noproxy "" --proxy "%C%" "%TRACE_URL%" >nul 2>&1
if errorlevel 1 exit /b 1
REM v2.23: remember the first candidate that cleared the trace, in case the
REM API check rejects everything.
if not defined TRACE_ONLY set "TRACE_ONLY=%C%"
REM v2.22: the Cloudflare trace only proves the proxy reaches Cloudflare.
REM Check the API host opencode actually calls before accepting it. No -f,
REM so any HTTP status counts: only an unreachable route fails here.
if not "%PROXY_API_CHECK%"=="1" goto :top_ok
curl.exe -sS -o nul --max-time %PROXY_PROBE_TIMEOUT% --noproxy "" --proxy "%C%" "%PROXY_API_CHECK_URL%" >nul 2>&1
if errorlevel 1 exit /b 1
:top_ok
set "ACTIVE_PROXY=%C%"
call echo %T_255%
exit /b 0

REM - one launcher at a time
REM The lock is a folder: creating it succeeds only for the first launcher.
REM v2.49 (bug 11): the file "owner" holds PID|start ticks|exe|launcher path of the cmd that took
REM the lock. It counts only when PID, start time and exe all match a running process that is not
REM this window or its parent (the unofficial copy hands over in this same cmd). Anything else is an
REM orphan (crash, kill, closed window, reused PID): removed, logged, and the start goes on. The
REM lock age and tui.pid are no longer read: a stale tui.pid on a reused PID blocked every start.
:lock_check
set "LOCKDIR=%STATE_DIR%\lock"
set "OC_LOCK=%LOCKDIR%"
md "%LOCKDIR%" >nul 2>&1
if not errorlevel 1 goto :lk_take
set "OC_LKINFO=%STATE_DIR%\lock_check.txt"
if exist "%OC_LKINFO%" del /f /q "%OC_LKINFO%" >nul 2>&1
"%PSX%" -NoProfile -Command "$f=$env:OC_LKINFO; $L=$env:OC_LOCK; $of=Join-Path $L 'owner'; $saved='none'; $ex='no'; $proc='none'; $why=''; $rc=0; $opid='-'; $obat='-'; try{ $me=(Get-CimInstance Win32_Process -Filter ('ProcessId='+$PID)).ParentProcessId; $up=(Get-CimInstance Win32_Process -Filter ('ProcessId='+$me)).ParentProcessId; if(Test-Path -LiteralPath $of){ $saved=[string](Get-Content -LiteralPath $of -TotalCount 1); $v=@($saved -split '\|'); if($v[0]){ $opid=$v[0] }; if($v.Count -gt 3 -and $v[3]){ $obat=$v[3] }; $p=$null; try{ $p=Get-Process -Id ([int]$v[0]) -ErrorAction Stop }catch{}; if(-not $p){ $why='orphan: saved PID is not running' } else { $ex='yes'; $proc=$p.ProcessName+' pid '+$p.Id+' started '+$p.StartTime.ToString('s')+' exe '+$p.Path; if($p.Id -eq $me -or $p.Id -eq $up){ $why='orphan: saved PID is this window or its parent' } elseif($v.Count -lt 3){ $cl=(Get-CimInstance Win32_Process -Filter ('ProcessId='+$p.Id)).CommandLine; if($p.ProcessName -eq 'cmd' -and $cl -match '\.bat'){ $why='valid: old-format lock held by a cmd running a .bat'; $rc=1 } else { $why='orphan: old-format lock, PID is not a launcher' } } elseif([string]$p.StartTime.Ticks -ne $v[1]){ $why='orphan: PID reused by another process, start time differs' } elseif($p.Path -ne $v[2]){ $why='orphan: PID reused by another program, exe differs' } else { $why='valid: owner launcher is running'; $rc=1 } } } else { $age=((Get-Date)-(Get-Item -LiteralPath $L -Force).CreationTime).TotalSeconds; if($age -lt 20){ $why='valid: lock is '+[int]$age+' s old, owner not written yet'; $rc=1 } else { $why='orphan: lock has no owner file' } } }catch{ $why='orphan: check failed: '+$_.Exception.Message; $rc=0 }; $act='kept, start stopped'; if($rc -eq 0){ try{ Remove-Item -LiteralPath $L -Recurse -Force -ErrorAction Stop; $act='removed, start continues' }catch{ $act='remove failed, start continues' } }; $m='lock '+$L+' saved='+$saved+' pid exists='+$ex+' process='+$proc+' reason='+$why+' action='+$act; foreach($c in 34,37,33){ $m=$m.Replace([string][char]$c,'') }; [IO.File]::WriteAllLines($f,[string[]]@($m,$opid,$obat)); exit $rc" >nul 2>&1
set "LKRC=%errorlevel%"
set "LK_MSG=lock %LOCKDIR%: the check wrote no report"
set "LK_PID="
set "LK_BAT="
if exist "%OC_LKINFO%" <"%OC_LKINFO%" set /p "LK_MSG="
if exist "%OC_LKINFO%" for /f "usebackq skip=1 delims=" %%a in ("%OC_LKINFO%") do if not defined LK_PID (set "LK_PID=%%a") else if not defined LK_BAT set "LK_BAT=%%a"
call :log "%LK_MSG%" lock
REM v2.60 (N39): a live PID is not proof of a live launcher. :lock_touch refreshes
REM the stamp entry on every menu pass, so a stamp that has not moved in LK_STALE_MIN
REM minutes means the owner is hung: it is treated as an orphan and removed.
set "LK_STALE_MIN=120"
"%PSX%" -NoProfile -Command "try{ $s=Join-Path $env:OC_LOCK 'stamp'; if(Test-Path -LiteralPath $s){ $m=((Get-Date)-(Get-Item -LiteralPath $s -Force).LastWriteTime).TotalMinutes; if($m -ge %LK_STALE_MIN%){ exit 1 } } }catch{}; exit 0" >nul 2>&1
if not errorlevel 1 goto :lk_live
call :log "lock: stamp not refreshed in %LK_STALE_MIN% min, owner PID %LK_PID% treated as orphan" lock
rmdir /s /q "%LOCKDIR%" >nul 2>&1
goto :lk_take
:lk_live
if not "%LKRC%"=="1" goto :lk_take
if "%MULTI_INSTANCE%"=="1" goto :lk_multi
REM v3.7: OC_OTHER_WINDOW answers without a question. OPEN (default) starts this window with its own settings copy.
if /i "%OC_OTHER_WINDOW%"=="CLOSE" goto :lk_close
if /i not "%OC_OTHER_WINDOW%"=="ASK" goto :lk_multi
call echo %T_256%
call echo %T_353%
call echo %T_354%
call :pick 123 "Pick: " 60 3
if errorlevel 100 goto :lk_exit
if not errorlevel 1 goto :lk_exit
if errorlevel 3 goto :lk_exit
if errorlevel 2 goto :lk_multi
:lk_close
REM [1] close it: its whole tree, and only while PID and start time still match the lock.
REM v3.1 (N10): the owner PID used to be the cmd that launched this .bat, so closing
REM the other instance killed the operator's shell. The tree is killed only when the
REM owner command line really runs this launcher; otherwise the lock is foreign.
"%PSX%" -NoProfile -Command "try{ $v=@((Get-Content -LiteralPath (Join-Path $env:OC_LOCK 'owner') -TotalCount 1) -split '\|'); $p=Get-Process -Id ([int]$v[0]) -ErrorAction Stop; $cl=[string](Get-CimInstance Win32_Process -Filter ('ProcessId='+$p.Id)).CommandLine; $me=[string]$env:OCI_SELF; $own=($me -and $cl -and $cl.ToLower().Contains($me.ToLower())); if(-not $own){ exit 2 }; if($v.Count -lt 3 -or [string]$p.StartTime.Ticks -eq $v[1]){ & taskkill.exe /PID $p.Id /T /F | Out-Null } }catch{}" >nul 2>&1
if errorlevel 2 goto :lk_foreign
rmdir /s /q "%LOCKDIR%" >nul 2>&1
call :log "lock: user closed instance PID %LK_PID%, lock removed" lock
call echo %T_355%
goto :lk_take
:lk_foreign
call :log "lock: the owner is not this launcher - not closed" lock
goto :quit_busy
:lk_exit
set "FO_TRY=0"
:lk_focus
call :focus_owner
if not errorlevel 1 goto :lk_focus_ok
set /a FO_TRY+=1
if %FO_TRY% GEQ 3 goto :lk_focus_fail
timeout /t 1 /nobreak >nul 2>&1
goto :lk_focus
:lk_focus_ok
call echo %T_306%
goto :quit_busy
:lk_focus_fail
call echo %T_305%
goto :quit_busy
:lk_multi
call echo %T_309%
call :multi_state
set "LOCKDIR="
set "LOCK_FOREIGN=1"
goto :eof
:lk_take
md "%LOCKDIR%" >nul 2>&1
call :lock_touch
set "OC_LOCK=%LOCKDIR%"
"%PSX%" -NoProfile -Command "try{ $pp=(Get-CimInstance Win32_Process -Filter ('ProcessId='+$PID)).ParentProcessId; $p=Get-Process -Id $pp -ErrorAction Stop; [IO.File]::WriteAllText((Join-Path $env:OC_LOCK 'owner'),([string]$pp+'|'+$p.StartTime.Ticks+'|'+$p.Path+'|'+$env:OCI_SELF)) }catch{}" >nul 2>&1
call :log "lock taken: %LOCKDIR%" lock
goto :eof
REM User chose not to continue.
REM v2.22: this used to "goto :quit" from inside a called subroutine, so
REM the caller resumed with an emptied scope and the script kept running.
REM It sets a flag and returns now; the top-level caller does the exit.
REM LOCK_FOREIGN keeps :quit from deleting a lock that is not ours.
:quit_busy
call echo %T_257%
timeout /t 2 /nobreak >nul 2>&1
set "LOCK_FOREIGN=1"
set "LOCK_BUSY=1"
set "LOCKDIR="
exit /b

REM v2.30: brings the window of the launcher that owns the lock to the front. Its
REM console window first (classic console); under Windows Terminal that handle is
REM hidden, so the WindowsTerminal window above the owner is used instead. Exit 0 = done.
REM Limit: Windows Terminal has one window for all tabs, so the right tab is not picked.
:focus_owner
set "OC_LOCK=%LOCKDIR%"
"%PSX%" -NoProfile -Command "try{ $o=[int](@((Get-Content -LiteralPath (Join-Path $env:OC_LOCK 'owner') -TotalCount 1) -split '\|')[0]); Add-Type -Namespace OcFocus -Name W -MemberDefinition '[DllImport(''user32.dll'')] public static extern bool ShowWindow(IntPtr h, int c); [DllImport(''user32.dll'')] public static extern bool SetForegroundWindow(IntPtr h); [DllImport(''user32.dll'')] public static extern bool IsWindowVisible(IntPtr h); [DllImport(''user32.dll'')] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e); [DllImport(''kernel32.dll'')] public static extern bool FreeConsole(); [DllImport(''kernel32.dll'')] public static extern bool AttachConsole(uint p); [DllImport(''kernel32.dll'')] public static extern IntPtr GetConsoleWindow();'; $hw=[IntPtr]::Zero; [void][OcFocus.W]::FreeConsole(); if([OcFocus.W]::AttachConsole([uint32]$o)){ $hw=[OcFocus.W]::GetConsoleWindow(); [void][OcFocus.W]::FreeConsole() }; if($hw -eq [IntPtr]::Zero -or -not [OcFocus.W]::IsWindowVisible($hw)){ $hw=[IntPtr]::Zero; $cur=$o; for($i=0; $i -lt 6 -and $cur; $i++){ $pr=Get-Process -Id $cur -ErrorAction SilentlyContinue; if($pr -and $pr.ProcessName -eq 'WindowsTerminal' -and $pr.MainWindowHandle -ne 0){ $hw=$pr.MainWindowHandle; break }; $cur=(Get-CimInstance Win32_Process -Filter ('ProcessId='+$cur)).ParentProcessId } }; if($hw -eq [IntPtr]::Zero){ exit 1 }; [void][OcFocus.W]::ShowWindow($hw, 9); [OcFocus.W]::keybd_event(18, 0, 0, [UIntPtr]::Zero); [OcFocus.W]::keybd_event(18, 0, 2, [UIntPtr]::Zero); if([OcFocus.W]::SetForegroundWindow($hw)){ exit 0 }; exit 1 }catch{ exit 1 }" >nul 2>&1
exit /b

REM - refresh the lock timestamp (v2.22)
REM Removing and re-creating the stamp entry is what actually bumps the
REM folder's LastWriteTime on NTFS; rewriting it does not.
:lock_touch
if not defined LOCKDIR goto :eof
if not exist "%LOCKDIR%\" goto :eof
del /f /q "%LOCKDIR%\stamp" >nul 2>&1
>"%LOCKDIR%\stamp" echo %RANDOM%%RANDOM% %DATE% %TIME%
goto :eof

REM - startup trace: one line per stage, appended to startup.log -----
REM If the launcher freezes, the last line names the stage it froze in.
:trace
if not exist "%STATE_DIR%" goto :eof
>>"%STATE_DIR%\startup.log" echo %DATE% %TIME% %*
set "TRM=%*"
set "TRM=%TRM:"='%"
call :log "%TRM%" trace
goto :eof

REM - keep an appended log bounded (v2.20): only rewrites the file once
REM it is bigger than MAXB bytes, keeping the last KEEP lines.
REM usage: call :trim_log FILE MAXB KEEP
:trim_log
if not exist "%~1" goto :eof
set "OC_TLF=%~1"
set "OC_TMAX=%~2"
set "OC_TKEEP=%~3"
"%PSX%" -NoProfile -Command "$i=Get-Item -LiteralPath $env:OC_TLF -ErrorAction SilentlyContinue; if($i -and $i.Length -gt [long]$env:OC_TMAX){ try{ $l=@(Get-Content -LiteralPath $env:OC_TLF | Select-Object -Last ([int]$env:OC_TKEEP)); if($l.Count){ $t=$env:OC_TLF+'.tmp'; Set-Content -LiteralPath $t -Value $l -Encoding UTF8; Move-Item -LiteralPath $t -Destination $env:OC_TLF -Force } }catch{} }" >nul 2>&1
goto :eof

REM - self-update: newest launcher from the latest GitLab release [upd] -
REM Once per start, before anything interactive. Steps:
REM   1) read the latest release tag, then download the .bat and
REM      SHA256SUMS at that tag (PowerShell, 15/30 s caps); the .bat must
REM      match its SHA-256 line, and its header version must be the tag;
REM   2) size gate (this script is ~400 KB; an error page is not) plus
REM      a header-marker gate, so a truncated or wrong file never
REM      replaces the launcher;
REM   3) read "launcher  (vX.Y)" from the running file and the
REM      downloaded one; equal -> one quiet line, no download copy.
REM   4) different -> ask. On yes: backup to STATE_DIR, write a tiny
REM      helper that waits for THIS cmd to exit (a running .bat cannot
REM      be overwritten), copies the new file over it and restarts.
REM      The current script ends right after starting it: no batch
REM      line is ever read from a file that is being swapped.
REM The check is fully silent when the network is down or the repo is
REM unreachable: the launcher never blocks its start on GitHub.

:self_update
call :trace upd_start
set "SU_TMP=%STATE_DIR%\upd_remote.bat"
if exist "%SU_TMP%" del /f /q "%SU_TMP%" >nul 2>&1
call :have_exe curl.exe
REM v2.20: mirror the result into the canonical HAVE_CURL flag and use
REM only that name below - the HAVE twin used to diverge from it.
set "HAVE_CURL=%HAVE%"
REM v2.41: updates come only from the newest GitLab RELEASE, never from main.
REM The release tag (vX.Y) names the version. The file and SHA256SUMS are read
REM at that tag, and the file must match its SHA-256 line or it is deleted
REM unused. rc 0 ok, 1 network, 2 checksum, 3 no release. Only rc 2 is shown.
set "SU_TAG="
set "SU_SHA="
set "SU_TAG_OUT=%STATE_DIR%\su_tag.tmp"
if exist "%SU_TAG_OUT%" del /f /q "%SU_TAG_OUT%" >nul 2>&1
"%PSX%" -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try{ [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $r=@(Invoke-RestMethod -UseBasicParsing -Uri 'https://gitlab.com/api/v4/projects/88367491/releases?order_by=released_at&sort=desc&per_page=1' -TimeoutSec 15); if(-not $r.Count){ exit 3 }; $t=[string]$r[0].tag_name; if($t -notmatch '^v[0-9]+[.][0-9]+([.][0-9]+)?$'){ exit 3 }; $b='https://gitlab.com/jekooo/opencode-infinite/-/raw/'+$t+'/'; $sf=$env:SU_TMP+'.sums'; Invoke-WebRequest -UseBasicParsing -Uri ($b+'SHA256SUMS') -OutFile $sf -TimeoutSec 15; $h=$null; foreach($l in [IO.File]::ReadAllLines($sf)){ if($l -match '^([0-9a-fA-F]{64}) [ *]OpenCode Infinite[.]bat$'){ $h=$Matches[1] } }; Remove-Item -LiteralPath $sf -Force; if(-not $h){ exit 2 }; Invoke-WebRequest -UseBasicParsing -Uri ($b+'OpenCode%%20Infinite.bat') -OutFile $env:SU_TMP -TimeoutSec 30; if((Get-FileHash -Algorithm SHA256 -LiteralPath $env:SU_TMP).Hash -ne $h){ Remove-Item -LiteralPath $env:SU_TMP -Force; exit 2 }; [IO.File]::WriteAllText($env:SU_TAG_OUT,($t+' '+$h)) }catch{ exit 1 }" >nul 2>&1
set "SU_PEC=%errorlevel%"
call :trace upd_release rc=%SU_PEC%
if "%SU_PEC%"=="2" call echo %T_348%
if not exist "%SU_TAG_OUT%" goto :su_delete
REM The file holds "tag sha256"; :su_apply and the helper check the hash again before replacing.
for /f "usebackq tokens=1,2" %%s in ("%SU_TAG_OUT%") do set "SU_TAG=%%s" & set "SU_SHA=%%t"
del /f /q "%SU_TAG_OUT%" >nul 2>&1
if not defined SU_TAG goto :su_delete
if not defined SU_SHA goto :su_delete
call :trace upd_tag %SU_TAG%
:su_size
set "SU_OK="
if exist "%SU_TMP%" for %%s in ("%SU_TMP%") do if %%~zs GEQ 20000 set "SU_OK=1"
if not defined SU_OK goto :su_delete
REM Header gate: it must be the launcher, never an HTML error page.
findstr /b /c:"REM  OpenCode launcher" "%SU_TMP%" >nul 2>&1
if errorlevel 1 goto :su_delete
REM Version tokens, from the () in the header line.
set "SU_LV="
set "SU_RV="
for /f "tokens=2 delims=()" %%v in ('findstr /b /c:"REM  OpenCode launcher  (" "%~f0"') do set "SU_LV=%%v"
for /f "tokens=2 delims=()" %%v in ('findstr /b /c:"REM  OpenCode launcher  (" "%SU_TMP%"') do set "SU_RV=%%v"
if not defined SU_LV goto :su_delete
if not defined SU_RV goto :su_delete
call :trace upd_ver %SU_LV% / %SU_RV%
REM v2.41: the file must carry the version its release tag names.
if /i not "%SU_RV%"=="%SU_TAG%" goto :su_delete
REM v2.22: compare numerically, not by string equality. A repo copy that
REM is OLDER used to be offered as an "update".
set "VGT=0"
call :ver_gt "%SU_RV%" "%SU_LV%"
if "%VGT%"=="1" goto :su_new
if /i "%SU_RV%"=="%SU_LV%" goto :su_same
call echo %T_258%
goto :su_delete
:su_same
call echo %T_259%
goto :su_delete
:su_new
call echo %T_260%
call :yn_upd "   Replace this launcher with %SU_RV%? [Y/N]: "
if errorlevel 2 goto :su_delete
goto :su_apply
:su_apply
call :trace upd_apply
REM Controlled failure: a missing or altered download replaces nothing and says why.
if not exist "%SU_TMP%" goto :su_nofile
"%PSX%" -NoProfile -Command "try{ if((Get-FileHash -Algorithm SHA256 -LiteralPath $env:SU_TMP).Hash -ieq $env:SU_SHA){ exit 0 } }catch{}; exit 1" >nul 2>&1
if errorlevel 1 goto :su_badsha
REM Backup first - it is never overwritten silently: timestamped name.
REM N40: the backup carries a stamp, so two updates on the same day do not
REM overwrite the copy that was made before the first of them.
for /f "usebackq delims=" %%a in (`%PSX% -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"`) do set "SU_STAMP=%%a"
if not defined SU_STAMP set "SU_STAMP=manual"
set "SU_BAK=%STATE_DIR%\OpenCode Infinite backup %SU_LV% %SU_STAMP%.bat"
set "SU_STAMP="
copy /y "%~f0" "%SU_BAK%" >nul 2>&1
if errorlevel 1 goto :su_fail
if not exist "%SU_BAK%" goto :su_fail
REM The updater waits for this cmd to release the .bat, swallows the
REM swap and restarts. Paths go through environment variables: quoted
REM arguments to start were lost (empty copy paths, endless retry loop).
set "SU_HELP=%STATE_DIR%\oc_updater.cmd"
>"%SU_HELP%" echo @echo off
>>"%SU_HELP%" echo setlocal EnableExtensions
>>"%SU_HELP%" echo title OpenCode update
>>"%SU_HELP%" echo set "UP_NEW=%%OC_UPD_NEW%%"
>>"%SU_HELP%" echo set "UP_DST=%%OC_UPD_DST%%"
>>"%SU_HELP%" echo set "UP_TRY=0"
>>"%SU_HELP%" echo if not defined UP_NEW goto u_fail
>>"%SU_HELP%" echo if not defined UP_DST goto u_fail
REM v2.42: the helper used to start deleting at once while the parent cmd still had to re-read this file ("The batch file cannot be found"). It now waits 2 s first, and stops with a message if the new copy is missing.
>>"%SU_HELP%" echo set "UP_SHA=%%OC_UPD_SHA%%"
>>"%SU_HELP%" echo if not defined UP_SHA goto u_fail
>>"%SU_HELP%" echo if not exist "%%UP_NEW%%" goto u_nofile
>>"%SU_HELP%" echo "%PSX%" -NoProfile -Command "try{ if((Get-FileHash -Algorithm SHA256 -LiteralPath $env:UP_NEW).Hash -ieq $env:UP_SHA){ exit 0 } }catch{}; exit 1" ^>nul 2^>^&1
>>"%SU_HELP%" echo if errorlevel 1 goto u_badsha
>>"%SU_HELP%" echo timeout /t 2 /nobreak ^>nul 2^>^&1
>>"%SU_HELP%" echo :u_retry
>>"%SU_HELP%" echo set /a UP_TRY+=1
>>"%SU_HELP%" echo if %%UP_TRY%% GTR 60 goto u_fail
REM v2.60 (N40): copy beside the target, check the copy, then rename over it.
REM The launcher is never deleted first, so a failed copy leaves it usable.
>>"%SU_HELP%" echo set "UP_TMP=%%UP_DST%%.new"
>>"%SU_HELP%" echo copy /y "%%UP_NEW%%" "%%UP_TMP%%" ^>nul 2^>^&1
>>"%SU_HELP%" echo if errorlevel 1 goto u_wait
>>"%SU_HELP%" echo "%PSX%" -NoProfile -Command "try{ if((Get-FileHash -Algorithm SHA256 -LiteralPath $env:UP_TMP).Hash -ieq $env:UP_SHA){ exit 0 } }catch{}; exit 1" ^>nul 2^>^&1
>>"%SU_HELP%" echo if errorlevel 1 goto u_wait
>>"%SU_HELP%" echo move /y "%%UP_TMP%%" "%%UP_DST%%" ^>nul 2^>^&1
>>"%SU_HELP%" echo if not errorlevel 1 goto u_put
>>"%SU_HELP%" echo :u_wait
>>"%SU_HELP%" echo timeout /t 1 /nobreak ^>nul 2^>^&1
>>"%SU_HELP%" echo goto u_retry
>>"%SU_HELP%" echo :u_put
>>"%SU_HELP%" echo start "" "%%UP_DST%%"
>>"%SU_HELP%" echo del /f /q "%%UP_NEW%%" ^>nul 2^>^&1
REM The helper deletes itself with (goto) first: a plain del of the running .cmd made cmd print "The batch file cannot be found." in the update window.
>>"%SU_HELP%" echo (goto) 2^>nul ^& del /f /q "%%~f0" ^>nul 2^>^&1
>>"%SU_HELP%" echo exit /b 0
>>"%SU_HELP%" echo :u_nofile
>>"%SU_HELP%" echo echo   [upd] The downloaded copy is missing. Nothing was replaced.
>>"%SU_HELP%" echo goto u_stop
>>"%SU_HELP%" echo :u_badsha
>>"%SU_HELP%" echo echo   [upd] The downloaded copy failed its SHA-256 check. It was deleted and nothing was replaced.
>>"%SU_HELP%" echo del /f /q "%%UP_NEW%%" ^>nul 2^>^&1
>>"%SU_HELP%" echo :u_stop
>>"%SU_HELP%" echo pause
>>"%SU_HELP%" echo exit /b 1
>>"%SU_HELP%" echo :u_fail
>>"%SU_HELP%" echo echo   [upd] The replacement could not finish during the restart.
>>"%SU_HELP%" echo echo   The new copy stays in: %%UP_NEW%%
>>"%SU_HELP%" echo echo   Replace by hand: %%UP_DST%%
>>"%SU_HELP%" echo pause
>>"%SU_HELP%" echo exit /b 1
if not exist "%SU_HELP%" goto :su_fail
if not exist "%SU_TMP%" goto :su_fail
REM The restarted launcher would otherwise meet a fresh lock dir and be
REM treated as a second instance. Same cleanup :quit does.
if exist "%STATE_DIR%\lock\" rmdir /s /q "%STATE_DIR%\lock" >nul 2>&1
call echo %T_261%
call :trace upd_launch
set "OC_UPD_NEW=%SU_TMP%"
set "OC_UPD_DST=%~f0"
set "OC_UPD_SHA=%SU_SHA%"
REM v2.42: start and exit share one line, so cmd has already read exit before the helper can touch this file (no timeout here).
start "OpenCode update" "%SU_HELP%" & exit
:su_nofile
call echo %T_352%
call :pause_key
goto :eof
:su_badsha
call echo %T_348%
del /f /q "%SU_TMP%" >nul 2>&1
call :pause_key
goto :eof
:su_fail
call echo %T_262%
call echo %T_263%
call :pause_key
goto :eof
:su_delete
del /f /q "%SU_TMP%" >nul 2>&1
:su_eof
goto :eof

REM - keep the settings numeric (0 allowed only for numcfg0)
REM Accepts only numbers of at least 1. Anything else falls back to the default.
REM A default is set first when the variable is empty.
:numcfg
if not defined %1 set "%1=%~2"
call set "NCV=%%%1%%"
set "NCN="
set /a NCN=NCV 2>nul
if not defined NCN set "NCN=%~2"
if %NCN% LSS 1 set "NCN=%~2"
REM v3.1 (N41): the optional third argument is a ceiling; config.env used to accept any number.
if not "%~3"=="" if %NCN% GTR %~3 set "NCN=%~3"
set "%1=%NCN%"
goto :eof
REM Same as numcfg, but accepts 0 as a valid value.
:numcfg0
if not defined %1 set "%1=%~2"
call set "NCV=%%%1%%"
set "NCN="
set /a NCN=NCV 2>nul
if not defined NCN set "NCN=%~2"
if %NCN% LSS 0 set "NCN=%~2"
if not "%~3"=="" if %NCN% GTR %~3 set "NCN=%~3"
set "%1=%NCN%"
goto :eof

REM Common exit: restore the folder with popd, remove the lock, and end the local scope.
:quit
call :log "quit" boot
call :ui_reset
if defined POPPED popd
REM v2.23: a "second instance" exit must never kill the Tor and the bridge
REM the other launcher is using. :tor_stop only runs for our own session,
REM and the foreign lock is left alone as well.
if defined LOCK_FOREIGN goto :quit_nolock
call :tor_stop
if /i "%EGRESS%"=="WIREGUARD" call :vpn_stop
if /i "%EGRESS%"=="VPNGATE" call :vpn_stop & if defined OURWBRIDGE call :warp_bridge_stop
REM v2.22: never delete a lock that belongs to another instance the user
REM chose not to interrupt.
if exist "%STATE_DIR%\lock\" rmdir /s /q "%STATE_DIR%\lock" >nul 2>&1
:quit_nolock
REM v2.30: a double-click (no args, started by explorer) closes the window when the
REM batch ends. --run (shim and shortcut) keeps its own window; this keeps the rest.
REM A typed command has no /c in its command line, so nothing below runs for it. Explorer,
REM PowerShell and other shells start a bat with /c; only then :keep_open checks who started it.
REM v2.40: done before endlocal (PSX and the texts died with it) and on a quote-free copy (explorer's quotes broke the if).
if /i "%~1"=="--run" goto :quit_cp
set "OC_CL=%CMDCMDLINE%"
set "OC_CL=%OC_CL:"=%"
if not "%OC_CL:/c=%"=="%OC_CL%" call :keep_open
:quit_cp
REM v2.22: put the console code page back the way it was found.
if defined OC_OLDCP chcp %OC_OLDCP% >nul 2>&1
endlocal
:main_end

REM ============================================================
REM  Embedded folder picker (PowerShell). :run_picker reads this
REM  file from the marker line down and runs the block with
REM  PowerShell; the batch body ends at exit /b and never reads
REM  these lines. OC_MODE=modern opens the Explorer-style
REM  IFileDialog picker; classic opens FolderBrowserDialog. Both
REM  print the chosen folder on stdout and print nothing on
exit /b

REM v2.30: waits for a key only when explorer started this window (double-click).
:keep_open
"%PSX%" -NoProfile -Command "$p=(Get-CimInstance Win32_Process -Filter ('ProcessId='+$PID)).ParentProcessId; $c=(Get-CimInstance Win32_Process -Filter ('ProcessId='+$p)).ParentProcessId; if ((Get-Process -Id $c -ErrorAction SilentlyContinue).ProcessName -eq 'explorer') { exit 0 } exit 1" >nul 2>&1
if errorlevel 1 exit /b 0
echo.
call echo %T_264%
call :pause_key
exit /b 0

REM ============================================================

#>>>OC_TORBRIDGE_PS
# Built-in HTTP->SOCKS bridge (replaces Privoxy). Started hidden by
# :tor_start_if_needed; reads OC_BRPORT / OC_BRSOCKS / OC_BRLOG /
# OC_BRPIDF from the environment; logs to bridge.log; killed through
# the PID in bridge.pid by :tor_stop. Loopback only.
# The same text serves two contexts: the starter runs it once (no
# $CLIENT variable) and it becomes the accept loop; every accepted
# connection gets its own runspace seeded with $CLIENT, where the
# same text sees $CLIENT and runs Handle-Client on this one socket.
# Threadpool callbacks cannot run PowerShell functions (worker
# threads have no runspace): handlers died silently on accept and
# every CONNECT waited for the client to reset. Tunnels need both
# directions live, so the client-to-target pump gets its own small
# runspace and the target-to-client pump runs in the handler here.
# v2.20 fixes: every SOCKS reply read is exact-length (Read-Exact helper)
# so a split or refused reply never leaves stale bytes for the TLS
# handshake, and the request-head read carries an 8s timeout so a silent
# local client cannot park its handler forever. The timeout is captured
# and restored before the pumps start: idle long-lived tunnels (SSE,
# websockets) must be allowed to stay open indefinitely.
$ErrorActionPreference = 'Continue'
try { [IO.File]::WriteAllText($env:OC_BRPIDF, [string]$PID) } catch { }
function Write-BridgeLog([string]$m) {
    try { Add-Content -LiteralPath $env:OC_BRLOG -Value ((Get-Date -Format o) + ' ' + $m) -ErrorAction SilentlyContinue } catch { }
}
# reads EXACTLY $total bytes or returns $null at EOF or error. SOCKS
# replies may arrive split across TCP reads; v2.20 consumes every reply
# with exact reads so no stale byte survives next in the stream.
function Read-Exact($n, $total) {
    $out = New-Object byte[] $total
    $got = 0
    while ($got -lt $total) {
        $r = $n.Read($out, $got, $total - $got)
        if ($r -le 0) { return $null }
        $got += $r
    }
    return $out
}
function Connect-Socks([string]$hostName, [int]$port) {
    try {
        $s = New-Object Net.Sockets.TcpClient
        $s.Connect('127.0.0.1', [int]$env:OC_BRSOCKS)
        $n = $s.GetStream()
        $n.Write([byte[]](5, 1, 0), 0, 3)
        $r = Read-Exact $n 2
        if (-not $r) { $s.Close(); return $null }
        if ($r[1] -ne 0) { $s.Close(); return $null }
        $h = [Text.Encoding]::ASCII.GetBytes($hostName)
        if ($h.Length -gt 255) { $s.Close(); return $null }
        $pb = New-Object byte[] 2
        $pb[0] = [byte](($port -shr 8) -band 255)
        $pb[1] = [byte]($port -band 255)
        $req = New-Object byte[] (5 + $h.Length + 2)
        $req[0] = 5; $req[1] = 1; $req[2] = 0; $req[3] = 3; $req[4] = $h.Length
        [Array]::Copy($h, 0, $req, 5, $h.Length)
        [Array]::Copy($pb, 0, $req, 5 + $h.Length, 2)
        $n.Write($req, 0, $req.Length)
        $resp = Read-Exact $n 4
        if (-not $resp) { $s.Close(); return $null }
        if ($resp[1] -ne 0) { $s.Close(); return $null }
        # consume the exact address bytes of the reply: for ATYP=1 (IPv4)
        # the address is fixed 4 bytes, for ATYP=4 it is fixed 16 bytes,
        # and for ATYP=3 (FQDN) the FIRST byte after the header is the
        # length. Reading them in exact chunks keeps the stream clean:
        # partial or stale bytes used to be read by the TLS handshake as
        # garbage (the SEC_E_INVALID_TOKEN failure).
        if ($resp[3] -eq 1) { $skipLen = 4 }
        elseif ($resp[3] -eq 4) { $skipLen = 16 }
        elseif ($resp[3] -eq 3) { $lb = Read-Exact $n 1; if (-not $lb) { $s.Close(); return $null }; $skipLen = [int]$lb[0] }
        else { $s.Close(); return $null }
        if ($skipLen -gt 0) { $sk = Read-Exact $n $skipLen; if (-not $sk) { $s.Close(); return $null } }
        $tail = Read-Exact $n 2
        if (-not $tail) { $s.Close(); return $null }
        return $s
    } catch { return $null }
}
function Pump($from, $to) {
    try {
        $buf = New-Object byte[] 65536
        while ($true) {
            $n = $from.Read($buf, 0, $buf.Length)
            if ($n -le 0) { break }
            $to.Write($buf, 0, $n)
        }
    } catch { }
    try { $to.Close() } catch { }
    try { $from.Close() } catch { }
}
# reverse-direction pump on its own little runspace (see header note)
function Spawn-Pump($from, $to, $code) {
    try {
        $rs2 = [runspacefactory]::CreateRunspace()
        $rs2.Open()
        $rs2.SessionStateProxy.SetVariable('FROM', $from)
        $rs2.SessionStateProxy.SetVariable('TO', $to)
        $pw2 = [powershell]::Create()
        $pw2.Runspace = $rs2
        [void]$pw2.AddScript($code)
        $ar2 = $pw2.BeginInvoke()
        return @{ ps = $pw2; rs = $rs2; ar = $ar2 }
    } catch {
        Write-BridgeLog ('pumpspawn: ' + $_.Exception.Message)
    }
}
# v2.40: the reverse pump's runspace was never freed (a leak per tunnel). Pump $cs $st closes both streams, which ends it.
function Free-Pump($h) {
    if (-not $h) { return }
    try { [void]$h.ar.AsyncWaitHandle.WaitOne(3000) } catch { }
    try { $h.ps.Dispose() } catch { }
    try { $h.rs.Dispose() } catch { }
}
$PUMP_CODE = 'try{ $buf = New-Object byte[] 65536; while ($true) { $x = $FROM.Read($buf, 0, 65536); if ($x -le 0) { break }; $TO.Write($buf, 0, $x) } } catch { }; try { $TO.Close() } catch { }; try { $FROM.Close() } catch { }'
function Handle-Client($client) {
    try {
        $st = $client.GetStream()
        # v2.20: bounded head read. A silent local client (connects and
        # never speaks) used to park its handler forever; with a timeout
        # set, Read throws IOException instead, the handler closes and
        # the runspace ends. Restore the previous value before pumping:
        # idle tunnels (SSE, websockets) must be allowed to sit open.
        $headT = 0
        try { $headT = $st.ReadTimeout } catch { }
        $st.ReadTimeout = 8000
        # v3.1 (N43): ReadTimeout bounds each read, not the whole head, so one byte every
        # 7 s held a handler for 16384 x 8 s. Absolute deadline, block reads, blank line.
        $head = New-Object 'System.Collections.Generic.List[byte]'
        $deadline = (Get-Date).AddSeconds(8)
        $buf = New-Object byte[] 4096
        $done = $false
        while (-not $done -and $head.Count -lt 16384) {
            if ((Get-Date) -gt $deadline) { break }
            $n = 0
            try { $n = $st.Read($buf, 0, $buf.Length) } catch { break }
            if ($n -le 0) { $client.Close(); return }
            for ($k = 0; $k -lt $n -and $head.Count -lt 16384; $k++) { $head.Add($buf[$k]) }
            $arr = $head.ToArray()
            for ($k = 3; $k -lt $arr.Length; $k++) {
                if ($arr[$k] -eq 10 -and $arr[$k - 1] -eq 13 -and $arr[$k - 2] -eq 10 -and $arr[$k - 3] -eq 13) { $done = $true; break }
            }
        }
        try { $st.ReadTimeout = $headT } catch { }
        $headTxt = [Text.Encoding]::GetEncoding(28591).GetString($head.ToArray())
        $line = ($headTxt -split "`r`n")[0]
        # CONNECT: TLS passthrough, the request head is already consumed
        if ($line -match '^CONNECT\s+(.+):(\d+)\s') {
            $hostName = $Matches[1]
            $port = [int]$Matches[2]
            if ($hostName -match '^\[(.+)\]$') { $hostName = $Matches[1] }
            $dst = Connect-Socks $hostName $port
            if (-not $dst) { Write-BridgeLog ('CONNECT refused: ' + $line); $client.Close(); return }
            $okReply = [Text.Encoding]::ASCII.GetBytes('HTTP/1.1 200 Connection established' + "`r`n`r`n")
            $st.Write($okReply, 0, $okReply.Length)
            $cs = $dst.GetStream()
            # both directions must live at once; see the header note
            $pp = Spawn-Pump $st $cs $PUMP_CODE
            Pump $cs $st
            Free-Pump $pp
            return
        }
        # plain HTTP with an absolute URI: rewrite it to origin form and relay
        if ($line -match '^[A-Za-z]+\s+http://([^/:]+)(:\d+)?(/.*)?\s+HTTP/') {
            $hostName = $Matches[1]
            $port = 80
            if ($Matches[2]) { $port = [int]($Matches[2].Replace(':', '')) }
            $dst = Connect-Socks $hostName $port
            if (-not $dst) { Write-BridgeLog ('request refused: ' + $line); $client.Close(); return }
            $cs = $dst.GetStream()
            # N45: only the request line is rewritten; Referer and Origin keep their URLs.
            $eol = $headTxt.IndexOf("
")
            if ($eol -lt 0) { $eol = $headTxt.Length }
            $reqLine = $headTxt.Substring(0, $eol)
            $reqLine = [regex]::Replace($reqLine, [regex]::Escape('http://' + $hostName + ':' + $port), '', 'IgnoreCase')
            $reqLine = [regex]::Replace($reqLine, [regex]::Escape('http://' + $hostName), '', 'IgnoreCase')
            $rewritten = $reqLine + $headTxt.Substring($eol)
            # v2.22: force "Connection: close". Only the FIRST request of a
            # keep-alive stream carries an absolute URI; the second one
            # arrived in origin form and the relay had nothing to rewrite,
            # so the tunnel answered the wrong thing. Closing after one
            # exchange keeps every request on the rewrite path.
            $rewritten = [regex]::Replace($rewritten, '(?im)^Connection\s*:.*$', 'Connection: close')
            if ($rewritten -notmatch '(?im)^Connection\s*:') {
                $rewritten = $rewritten -replace "(`r`n`r`n)", "`r`nConnection: close`r`n`r`n"
            }
            $bytes = [Text.Encoding]::GetEncoding(28591).GetBytes($rewritten)
            $cs.Write($bytes, 0, $bytes.Length)
            $pp = Spawn-Pump $st $cs $PUMP_CODE
            Pump $cs $st
            Free-Pump $pp
            return
        }
        $client.Close()
    } catch {
        Write-BridgeLog ('handler: ' + $_.Exception.Message)
    }
    try { $client.Close() } catch { }
}
if (Get-Variable -Name CLIENT -ErrorAction SilentlyContinue) {
    Handle-Client $CLIENT
    return
}
try {
    Write-BridgeLog ('bridge up: 127.0.0.1:' + $env:OC_BRPORT + ' -> socks 127.0.0.1:' + $env:OC_BRSOCKS)
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, [int]$env:OC_BRPORT)
    $listener.Start()
    $pool = New-Object System.Collections.ArrayList
    while ($true) {
        $client = $listener.AcceptTcpClient()
        # reap finished per-connection runspaces, then spawn this one
        $alive = New-Object System.Collections.ArrayList
        foreach ($e in $pool) {
            $pstate = $e.ps.InvocationStateInfo.State
            # v3.1 (N46): only the runspace was freed; the [powershell] object and its
            # IAsyncResult leaked once per connection.
            if (($pstate -eq 'Running') -or ($pstate -eq 'NotStarted')) { [void]$alive.Add($e) } else { try { $e.ps.Dispose() } catch { }; try { $e.rs.Dispose() } catch { } }
        }
        $pool = $alive
        # v2.22: cap concurrent connections. Every accepted socket opened a
        # runspace with no ceiling at all, so a browser burst could spawn
        # hundreds of them. Over the cap the connection is dropped instead.
        if ($pool.Count -ge 200) {
            Write-BridgeLog ('busy: connection cap reached, dropping a client')
            try { $client.Close() } catch { }
            continue
        }
        $rs = [runspacefactory]::CreateRunspace()
        $rs.Open()
        $rs.SessionStateProxy.SetVariable('CLIENT', $client)
        $pw = [powershell]::Create()
        $pw.Runspace = $rs
        [void]$pw.AddScript($BRTEXT)
        [void]($pw.BeginInvoke())
        [void]$pool.Add(@{ ps = $pw; rs = $rs })
    }
} catch {
    Write-BridgeLog ('listener: ' + $_.Exception.Message)
}
#>>>OC_ENDTORBRIDGE
#>>>OC_TUI_PS
# OpenCode Infinite UI (v2.29): home screen, settings, setup wizard, renew, uninstall.
# Modes (OC_TUI): home | settings | export. In: OC_STATE (state folder), OCI_SELF (launcher).
# Exit codes: 0 leave the launcher, 10 continue to the launcher, 20 no usable console.
# Test hooks: OC_TUI_KEYS (comma list of keys, or OC_TUI_KEYS_<MODE> per screen), OC_TUI_INPUT (; list of typed lines),
# OC_TUI_CHILD_EXIT (skip the child launcher, pretend it exited with this code).
$ErrorActionPreference = 'Stop'
$State = $env:OC_STATE
$Self = $env:OCI_SELF
$Mode = $env:OC_TUI
$CfgPath = Join-Path $State 'config.json'
$EnvPath = Join-Path $State 'config.env'
$BackDir = Join-Path $State 'backup'
$ShimDir = Join-Path $State 'bin'
$ShimPath = Join-Path $ShimDir 'opencode.cmd'
$ShimInfPath = Join-Path $ShimDir 'opencodeinf.cmd'
# v2.60 (A1): opencode-auto = opencodeinf --auto (no menus, last working connection).
$ShimAutoPath = Join-Path $ShimDir 'opencode-auto.cmd'
# D02: the three direct commands, one per preset. They are written only when the
# operator asks for them (Settings, group Launch); nothing creates them at setup.
$ShimWarpPath = Join-Path $ShimDir 'opencode-warp.cmd'
$ShimTorPath = Join-Path $ShimDir 'opencode-tor.cmd'
$ShimProxyPath = Join-Path $ShimDir 'opencode-proxy.cmd'
# v2.30: setup copies the launcher here; the commands and shortcuts run this copy, not the download.
$Official = Join-Path $State 'app\OpenCode Infinite.bat'
# v2.41: a re-download takes the latest release, not main.
$RawUrl = 'https://gitlab.com/jekooo/opencode-infinite/-/releases/permalink/latest/downloads/OpenCode-Infinite.bat'
$Repo = 'https://gitlab.com/jekooo/opencode-infinite'
# OC_TUI_KEYS_<MODE> (for example OC_TUI_KEYS_MAIN) overrides OC_TUI_KEYS for that screen only, so a whole
# launcher run can be driven screen by screen.
$keySrc = [Environment]::GetEnvironmentVariable('OC_TUI_KEYS_' + ([string]$Mode).ToUpper())
if (-not $keySrc) { $keySrc = $env:OC_TUI_KEYS }
if ($keySrc -and $keySrc.Contains('|')) {
  # "a,b|c,d": one key list per call of this screen, the last one repeats (test hook)
  $parts = @($keySrc -split '\|')
  $cf = Join-Path $State ('seq_' + $Mode + '.n')
  $ci = 0
  try { if (Test-Path -LiteralPath $cf) { $ci = [int](Get-Content -LiteralPath $cf -TotalCount 1) } } catch { }
  try { New-Item -ItemType Directory -Force -Path $State | Out-Null; Set-Content -LiteralPath $cf -Value ($ci + 1) } catch { }
  $keySrc = $parts[[Math]::Min($ci, $parts.Count - 1)]
}
$Scripted = [bool]$keySrc
$KeyQ = New-Object 'Collections.Generic.Queue[string]'
if ($keySrc) { foreach ($k in ($keySrc -split ',')) { if ($k) { $KeyQ.Enqueue($k) } } }
$InQ = New-Object 'Collections.Generic.Queue[string]'
if ($null -ne $env:OC_TUI_INPUT) { foreach ($k in ($env:OC_TUI_INPUT -split ';')) { $InQ.Enqueue($k) } }
$esc = [string][char]27
function Log([string]$msg, [string]$src = 'ui') {
  try {
    if ($script:Cfg -and $script:Cfg.settings.ContainsKey('LOG_ENABLED') -and [int]$script:Cfg.settings['LOG_ENABLED'] -eq 0) { return }
    New-Item -ItemType Directory -Force -Path $State | Out-Null
    $sid = $env:OC_SID; if (-not $sid) { $sid = '-' }
    $line = '[' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss.ff', [Globalization.CultureInfo]::InvariantCulture) + '] [' + $sid + '] [' + $src + '] ' + ($msg -replace '[\r\n]+', ' | ')
    # v2.60 (N42): with up to 200 runspaces writing at once, the second opener gets a
    # sharing violation and the old catch threw the line away. The append is retried a few
    # times with a growing pause instead of being lost, and it never keeps the file open.
    $lf = Join-Path $State 'launcher.log'
    $lc = $line + "`r`n"
    $le = New-Object Text.UTF8Encoding($false)
    for ($ln = 1; $ln -le 6; $ln++) {
      try { [IO.File]::AppendAllText($lf, $lc, $le); return } catch { Start-Sleep -Milliseconds (15 * $ln) }
    }
  } catch { }
}

# ---------------------------------------------------------------- settings schema
function S($k, $g, $l, $t, $d, $h, $a = 'now', $min = 0, $max = 0, $vals = @()) {
  [pscustomobject]@{ Key = $k; Group = $g; Label = $l; Type = $t; Default = $d; Help = $h; Apply = $a; Min = $min; Max = $max; Values = $vals }
}
$Schema = @(
  S 'OC_EGRESS_DEFAULT' 'Connection' 'Connection method' 'enum' 'ASK' 'Egress used for opencode. ASK shows the picker at every start.' 'now' 0 0 @('ASK', 'WARP', 'TOR', 'PROXY', 'WIREGUARD', 'VPNGATE', 'NONE')
  S 'OC_MODE_DEFAULT' 'Launch' 'Run mode' 'enum' 'ASK' 'CLI terminal, Desktop app, or ask at every start.' 'now' 0 0 @('ASK', 'CLI', 'DESKTOP')
  S 'OC_OTHER_WINDOW' 'Launch' 'If already open' 'enum' 'OPEN' 'Another OpenCode-Infinite window is running. OPEN starts this one too, with its own copy of the settings. CLOSE closes the other one and continues. ASK asks each time.' 'now' 0 0 @('OPEN', 'CLOSE', 'ASK')
  S 'OC_MODEL' 'Session' 'Resume model' 'ostring' '' 'Model of the automatic resume, as provider/model, for example opencode/deepseek-v4.1-flash-free. Type - to clear: OpenCode keeps its own model.' 'now'
  S 'MENU_DEFAULT' 'Launch' 'OpenCode menu shortcut' 'enum' 'ask' 'ask shows the OpenCode menu. 1 starts with a new IP, 2 continues with the same IP and chat (saved tokens untouched), 3 only changes the IP. The menu is skipped.' 'now' 0 0 @('ask', '1', '2', '3')
  S 'MULTI_INSTANCE' 'Launch' 'Several windows' 'bool' 0 'On: a second launcher window runs on its own copy of the settings. Off: the If already open setting decides.' 'next launch'
  S 'REUSE_EMPTY' 'Launch' 'Reuse the empty chat' 'bool' 1 'A fresh start continues the newest chat when it is still empty, instead of piling up empty chats.' 'now'
  S 'PROXY_PORT' 'WARP' 'WARP proxy port' 'port' 40000 'Local port of the WARP proxy.' 'next WARP connect'
  S 'WARP_WAIT' 'WARP' 'WARP wait (s)' 'int' 6 'Seconds to wait after (re)connecting WARP.' 'now' 1 60
  S 'WARP_CALL_TIMEOUT' 'WARP' 'warp-cli timeout (s)' 'int' 15 'Seconds a single warp-cli call may take.' 'now' 5 300
  S 'PROXY_LIST_URL' 'Proxy list' 'Proxy list source' 'listsrc' 'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&protocol=http&proxy_format=protocolipport&format=text' 'URL or local file, any format (plain, CSV, JSON, XML, HTML).' 'now'
  S 'PROXY_LIST_MIN_BYTES' 'Proxy list' 'Minimum list size (bytes)' 'int' 20 'A downloaded list smaller than this is rejected. 0 = off.' 'now' 0 100000000
  S 'PROXY_TRY_MAX' 'Proxy list' 'Proxies tried per pick' 'int' 40 'How many untried proxies to test before giving up. Tested ones are skipped until the whole list was used.' 'now' 1 500
  S 'PROXY_PROBE_TIMEOUT' 'Proxy list' 'Proxy test timeout (s)' 'int' 8 'Seconds a single proxy test may take.' 'now' 1 120
  S 'PROXY_ROT_MAX' 'Proxy list' 'Burned proxies before Tor offer' 'int' 10 'Burned proxies in a row before PROXY mode offers Tor.' 'now' 1 200
  S 'PROXY_API_CHECK' 'Proxy list' 'Check the API host' 'bool' 0 'A proxy must also reach the opencode API host.' 'now'
  S 'PROXY_API_CHECK_URL' 'Proxy list' 'API check URL' 'url' 'https://api.opencode.ai/' 'Host used by the API check.' 'now'
  S 'PROXY_FIXED' 'Proxy list' 'Your own proxy' 'proxyaddr' '' 'One proxy to use instead of the list, as host:port, for example 203.0.113.5:8080. Type - to clear and use the list again.' 'now'
  S 'TOR_SOCKS_PORT' 'Tor' 'Tor SOCKS port' 'port' 9050 'SOCKS port of the Tor the launcher starts.' 'next Tor start'
  S 'TOR_HTTP_PORT' 'Tor' 'Tor HTTP bridge port' 'port' 8118 'HTTP port of the built-in bridge opencode uses.' 'next Tor start'
  S 'TOR_AUTO_INSTALL' 'Tor' 'Install Tor automatically' 'bool' 1 'Download the portable Tor bundle when nothing answers.' 'now'
  S 'TOR_BOOTSTRAP_WAIT' 'Tor' 'Tor bootstrap wait (s)' 'int' 120 'Seconds to wait for Tor to finish bootstrapping.' 'now' 30 900
  S 'ROTATE_TRIES_MAX' 'IP rotation' 'Rotation attempts' 'int' 4 'Attempts per round when the tunnel is not up.' 'now' 1 20
  S 'WG_DIR' 'WireGuard / VPN Gate' 'WireGuard folder' 'dir' '' 'Folder with the WireGuard .conf files. Type - to use the default folder inside the launcher state folder.' 'now'
  S 'VPN_TIMEOUT' 'WireGuard / VPN Gate' 'Seconds per attempt' 'int' 45 'Seconds a tunnel gets to show a new exit IP before the next one is tried.' 'now' 10 300
  S 'VPNGATE_COUNTRY' 'WireGuard / VPN Gate' 'VPN Gate country' 'ostring' '' 'Two-letter country code of the VPN Gate servers, for example JP. Type - for any country.' 'now'
  S 'VPNGATE_MAX' 'WireGuard / VPN Gate' 'VPN Gate servers per start' 'int' 8 'How many VPN Gate servers are tried, best score first, before the start gives up.' 'now' 1 30
  S 'ROTATE_COOLDOWN' 'IP rotation' 'Cooldown between attempts (s)' 'int' 10 'Cloudflare throttles rapid registrations.' 'now' 0 300
  S 'ON_CLOSE' 'Session' 'After opencode closes' 'enum' 'ask' 'ask = R, M or Q: R gets a new IP and resumes the chat, M opens the menu, Q quits. quit = leave the launcher at once.' 'now' 0 0 @('ask', 'quit')
  S 'IP_FIND_MAX' 'IP rotation' 'Burned IPs allowed' 'int' 0 'IPs the probe may reject before giving up. 0 = no limit.' 'now' 0 10000
  S 'AUTO_ROTATE' 'IP rotation' 'Automatic rotation' 'bool' 1 'On: a limit or a closed opencode gets a new IP and the chat resumes. Off: the menu decides.' 'now'
  S 'TARGET_COUNTRY' 'IP rotation' 'Target country' 'country' '' 'Keep asking for IPs until one is in this country, e.g. DE. Empty = any new IP.' 'now'
  S 'TARGET_PREFIX' 'IP rotation' 'Target IP prefix' 'ipprefix' '' 'Keep asking until the IP starts with this, e.g. 104.28. Empty = not used.' 'now'
  S 'TARGET_TRIES' 'IP rotation' 'Max attempts per hunt' 'int' 20 'New IPs requested in one hunt. The hunt stops at this count.' 'now' 1 100
  S 'TARGET_MINUTES' 'IP rotation' 'Max minutes per hunt' 'int' 15 'The hunt stops after this many minutes.' 'now' 1 240
  S 'TARGET_INTERVAL' 'IP rotation' 'Seconds between attempts' 'int' 15 'Pause between two attempts, so Cloudflare is not hit too fast.' 'now' 0 300
  S 'POOL_ENABLE' 'IP rotation' 'Keep a pool of tested IPs' 'bool' 1 'While Settings is open, the launcher tests IPs for proxy, VPN Gate and WireGuard and keeps them, so a rotation can reuse one.' 'now'
  S 'POOL_MAX' 'IP rotation' 'Saved IPs per mode' 'int' 5 'Most tested IPs kept for each mode. The oldest is dropped.' 'now' 1 50
  S 'POOL_INTERVAL' 'IP rotation' 'Seconds between pool searches' 'int' 60 'Pause between two pool searches. Minimum 5.' 'now' 5 3600
  S 'LIMIT_ACTION' 'IP rotation' 'When the free limit returns' 'enum' 'rotate' 'rotate = a new IP every time. provider = after the rotations below, switch to the fallback model. ask = stop and ask.' 'now' 0 0 @('rotate', 'provider', 'ask')
  S 'LIMIT_MODEL' 'IP rotation' 'Fallback model' 'ostring' '' 'Model used when the free limit keeps coming back, as provider/model. Type - to clear.' 'now'
  S 'LIMIT_ROT_MAX' 'IP rotation' 'Limit rotations in a row' 'int' 3 'Rotations in a row that end in the free limit again before the action above applies. 0 = never stop: keep rotating until a usable IP appears.' 'now' 0 50
  S 'WATCH' 'Session' 'Watch the log' 'bool' 0 'Rotate when a fatal error appears while opencode runs.' 'now'
  S 'RESUME_MSG' 'Session' 'Resume message' 'string' 'continue' 'Sent automatically after a rotation.' 'now'
  S 'RESUME_MODE' 'Session' 'Resume mode' 'enum' 'continue' 'continue = send the resume message. last = send your last message again. custom = send the custom text below.' 'now' 0 0 @('continue', 'last', 'custom')
  S 'RESUME_TEXT' 'Session' 'Custom resume text' 'ostring' '' 'Text sent when the resume mode is custom. Type - to clear.' 'now'
  S 'CHAT_SNAPSHOT' 'Session' 'Show the last messages' 'bool' 1 'After opencode closes, the last messages of the chat are printed so they stay in the scroll-back and can be copied.' 'now'
  S 'TYPE_AHEAD' 'Session' 'Keep what you type' 'bool' 1 'Keys typed while the IP is being renewed are put in the prompt when opencode opens again.' 'now'
  S 'RESUME_AUTO' 'Session' 'Unattended resume' 'bool' 1 'The resume auto-approves tool permissions.' 'now'
  S 'QUOTA_RESUME' 'Session' 'Resume after quota' 'bool' 1 'After a quota stop the chat resumes on a later start only with a new exit IP and a fresh probe.' 'now'
  S 'RESUME_TIMEOUT' 'Session' 'Resume timeout (s)' 'int' 90 'Seconds before a silent resume counts as a dead IP.' 'now' 10 900
  S 'PROBE' 'Probe' 'Test every new IP' 'bool' 0 'Send one cheap message through each candidate IP. Off by default: each probe uses the free quota and leaves a session.' 'now'
  S 'PROBE_MODEL' 'Probe' 'Probe model' 'string' '' 'Model used by the IP probe (the chat model unless a model is set).' 'now'
  S 'PROBE_BROKEN_MAX' 'Probe' 'Probe failures tolerated' 'int' 3 'Non-limit probe failures before the hunt stops.' 'now' 1 50
  S 'OC_APP' 'Paths' 'Desktop app path' 'path' '' 'Full path of OpenCode.exe. Empty = search automatically.' 'now'
  S 'OC_API_BASE' 'Updates' 'Release metadata URL' 'url' 'https://opencode.ai/update/api/latest' 'Where versions and checksums are read from.' 'now'
  S 'WHERE_TIMEOUT' 'Paths' 'PATH lookup timeout (s)' 'int' 5 'Seconds a single "where" lookup may take.' 'now' 1 120
  S 'UPDATE_CHECK' 'Updates' 'Launcher self-update' 'bool' 1 'Check GitHub for a newer launcher at every start.' 'next launch'
  S 'UPDATE_ASK' 'Updates' 'Update prompts' 'enum' 'ask' 'ask = offer newer versions at start (launcher, opencode, desktop app). never = no update checks and no prompts.' 'now' 0 0 @('ask', 'never')
  S 'OCUI_THEME' 'Appearance' 'Color theme' 'enum' 'ocean' 'Accent colors of the interface.' 'now' 0 0 @('ocean', 'forest', 'sunset', 'mono', 'rainbow')
  S 'OCUI_COLOR' 'Appearance' 'Colors' 'enum' 'auto' 'auto follows the terminal and NO_COLOR; off disables colors.' 'now' 0 0 @('auto', 'on', 'off')
  S 'OCUI_ICONS' 'Appearance' 'Icons and borders' 'enum' 'auto' 'emoji = modern terminals, unicode = classic console, ascii = anything.' 'now' 0 0 @('auto', 'emoji', 'unicode', 'ascii')
  S 'OCUI_LANG' 'Appearance' 'Language' 'enum' 'auto' 'Language of the menus and descriptions. auto follows Windows. Logs and the support report stay in English.' 'now' 0 0 @('auto', 'en', 'es', 'fr', 'de', 'pt', 'it', 'tr', 'ru')
  S 'OCUI_FONT' 'Appearance' 'Terminal font' 'font' '' 'Font of the terminal text. Empty leaves the terminal as it is.' 'now'
  S 'OCUI_FONT_SIZE' 'Appearance' 'Font size' 'int' 16 'Size used with the chosen font.' 'now' 8 72
  S 'KEY_ROTATE' 'Shortcuts' 'Rotate key' 'key' 'R' 'Closed-opencode prompt: new IP and resume the chat.' 'now'
  S 'KEY_MENU' 'Shortcuts' 'Menu key' 'key' 'M' 'Closed-opencode prompt: open the menu.' 'now'
  S 'KEY_QUIT' 'Shortcuts' 'Quit key' 'key' 'Q' 'Closed-opencode prompt: quit. Ctrl+C always quits too.' 'now'
  S 'LOG_ENABLED' 'Logs' 'Activity log' 'bool' 1 'Record what the launcher does in launcher.log so a problem can be diagnosed.' 'now'
  S 'LOG_MAX_KB' 'Logs' 'Log size limit (KB)' 'int' 1024 'The log is cut to its newest part when it grows past this.' 'next launch' 64 10240
  S 'LOG_MASK_IP' 'Logs' 'Hide IPs in reports' 'bool' 1 'Public IP addresses are masked in the support report.' 'now'
)
$Groups = @('Common', 'Launch', 'Connection', 'WARP', 'Tor', 'Proxy list', 'WireGuard / VPN Gate', 'IP rotation', 'Probe', 'Session', 'Paths', 'Updates', 'Appearance', 'Shortcuts', 'Logs')
$GroupHelp = @{
  'Common' = 'The settings most people change: connection, proxy list, rotation, language and theme. The other groups are for advanced use.'
  'Launch' = 'How OpenCode starts: run mode, the menu shortcut, reusing an empty chat and several windows.'
  'Connection' = 'The default connection method opencode uses at start.'
  'WARP' = 'The WARP proxy port and the warp-cli timings.'
  'Tor' = 'Ports and install behavior of the portable Tor the launcher starts for you.'
  'Proxy list' = 'Where proxies come from (URL or file, any format) and how each one is tested.'
  'WireGuard / VPN Gate' = 'The WireGuard and VPN Gate methods: the folder of .conf files, the time limit, the country and how many servers are tried.'
  'IP rotation' = 'How many times, and how fast, a new IP is requested when the free limit is hit.'
  'Probe' = 'The cheap test message sent through every new IP before it is trusted.'
  'Session' = 'Watching the opencode log, the resume after a rotation and what is kept between sessions.'
  'Paths' = 'Desktop app location and lookup timeouts.'
  'Updates' = 'Whether the launcher checks for a newer copy of itself, and where versions and checksums are read from.'
  'Appearance' = 'Color theme, colors on or off, icon and border style, and the terminal font. Applied immediately.'
  'Shortcuts' = 'The keys of the launcher and the terminal commands. Fixed keys are listed for reference; the three letters can be changed.'
  'Logs' = 'The activity log (launcher.log) and the support report: what is recorded, how big it may grow, whether IPs are masked.'
}

# ---------------------------------------------------------------- config file
function To-Hash($o) {
  if ($o -is [System.Management.Automation.PSCustomObject]) {
    $h = @{}
    foreach ($p in $o.PSObject.Properties) { $h[$p.Name] = To-Hash $p.Value }
    return $h
  }
  if ($o -is [array]) { $r = @(); foreach ($x in $o) { $r += , (To-Hash $x) }; return , $r }
  return $o
}
function Get-Setting($key) { foreach ($s in $Schema) { if ($s.Key -eq $key) { return $s } } return $null }
function Get-Val($key) {
  $s = Get-Setting $key
  if ($script:Cfg.settings.ContainsKey($key)) { return $script:Cfg.settings[$key] }
  return $s.Default
}
function Load-Cfg {
  $script:Cfg = @{ version = 1; settings = @{}; setup = @{}; font = @{} }
  if (-not (Test-Path -LiteralPath $CfgPath)) { return }
  try {
    $j = To-Hash (Get-Content -LiteralPath $CfgPath -Raw -Encoding UTF8 | ConvertFrom-Json)
    $bad = @()
    if ($j.settings -is [hashtable]) {
      foreach ($s in $Schema) {
        if ($j.settings.ContainsKey($s.Key)) {
          $r = Test-Val $s ([string]$j.settings[$s.Key]) $true
          if ($r.ok) { $script:Cfg.settings[$s.Key] = $r.v } else { $bad += $s.Key }
        }
      }
    }
    if ($bad.Count) { $script:Notice = @('warn', ('config.json: invalid value for ' + ($bad -join ', ') + '; the default is used.')) }
    if ($j.setup -is [hashtable]) { $script:Cfg.setup = $j.setup }
    if ($j.font -is [hashtable]) { $script:Cfg.font = $j.font }
  } catch {
    # a hand-edited file that no longer parses is kept aside, never overwritten silently
    try { Copy-Item -LiteralPath $CfgPath -Destination ($CfgPath + '.broken') -Force } catch { }
    $script:Notice = @('warn', 'config.json could not be read; a copy was kept as config.json.broken and defaults are in use.')
  }
}
function Save-Cfg {
  New-Item -ItemType Directory -Force -Path $State | Out-Null
  $tmp = $CfgPath + '.tmp'
  [IO.File]::WriteAllText($tmp, ($script:Cfg | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $tmp -Destination $CfgPath -Force
  # every effective value, so a reset or a removed override also reaches a running launcher
  $lines = @()
  foreach ($s in $Schema) { $lines += ($s.Key + '=' + [string](Get-Val $s.Key)) }
  [IO.File]::WriteAllLines($EnvPath, [string[]]$lines, (New-Object Text.UTF8Encoding($false)))
  # What the batch needs to color its own lines like this interface. Only a real console writes it: a hidden
  # child (output redirected) must not switch colors off for the window that is actually on screen.
  # NO_COLOR is for this run only: a run with it must not save UI_COLOR=0 for later runs.
  if (($Scripted -or -not [Console]::IsOutputRedirected) -and -not $env:NO_COLOR) {
    $ui = @(('UI_COLOR=' + $(if ($script:Color) { 1 } else { 0 })), ('UI_ACC=' + $script:Theme.Accent))
    [IO.File]::WriteAllLines((Join-Path $State 'ui.env'), [string[]]$ui, (New-Object Text.UTF8Encoding($false)))
  }
}
function Set-Val($s, $v) {
  if ([string]$v -eq [string]$s.Default) { [void]$script:Cfg.settings.Remove($s.Key) } else { $script:Cfg.settings[$s.Key] = $v }
  Save-Cfg
}

# ---------------------------------------------------------------- validation
function Fail($m) { return @{ ok = $false; err = $m } }
function Pass($v) { return @{ ok = $true; v = $v } }
function Test-Val($s, [string]$t, [bool]$loading = $false) {
  $t = $t.Trim()
  switch ($s.Type) {
    'bool' {
      if ($t -match '^(1|on|yes|true|y)$') { return Pass 1 }
      if ($t -match '^(0|off|no|false|n)$') { return Pass 0 }
      return Fail 'Use on or off.'
    }
    'int' {
      $n = 0
      if (-not [int]::TryParse($t, [ref]$n)) { return Fail 'Enter a whole number.' }
      if ($n -lt $s.Min -or $n -gt $s.Max) { return Fail (Tf 'Must be between {0} and {1}.' $s.Min $s.Max) }
      return Pass $n
    }
    'port' {
      $n = 0
      if (-not [int]::TryParse($t, [ref]$n) -or $n -lt 1 -or $n -gt 65535) { return Fail 'A port is a number from 1 to 65535.' }
      if (-not $loading) {
        foreach ($o in @('PROXY_PORT', 'TOR_SOCKS_PORT', 'TOR_HTTP_PORT')) {
          if ($o -ne $s.Key -and [int](Get-Val $o) -eq $n) { return Fail (Tf 'Port {0} is already used by {1}.' $n (T (Get-Setting $o).Label)) }
        }
      }
      return Pass $n
    }
    'enum' {
      foreach ($v in $s.Values) { if ($v -ieq $t) { return Pass $v } }
      return Fail (Tf 'Choose one of: {0}.' ($s.Values -join ', '))
    }
    'country' {
      if ($t -eq '') { return Pass '' }
      if ($t -notmatch '^[A-Za-z]{2}$') { return Fail 'Two letters, like DE or US. Empty = any country.' }
      return Pass $t.ToUpper()
    }
    'ipprefix' {
      if ($t -eq '') { return Pass '' }
      if ($t -notmatch '^\d{1,3}(\.\d{1,3}){0,3}\.?$') { return Fail 'The start of an IPv4 address, like 104.28. Empty = any IP.' }
      return Pass $t
    }
    'key' {
      if ($t -notmatch '^[A-Za-z]$') { return Fail 'One letter, like R.' }
      $u = $t.ToUpper()
      # v3.1 (N66): E changes the egress at the closed-opencode prompt; it cannot be chosen.
      if (-not $loading) { if ($u -eq 'E') { return Fail (Tf 'Key {0} is already used by {1}.' $u (T 'Change egress')) } }
      if (-not $loading) { foreach ($o in @('KEY_ROTATE', 'KEY_MENU', 'KEY_QUIT')) { if ($o -ne $s.Key -and ([string](Get-Val $o)).ToUpper() -eq $u) { return Fail (Tf 'Key {0} is already used by {1}.' $u (T (Get-Setting $o).Label)) } } }
      return Pass $u
    }
    'string' {
      if ($t -match '["\r\n]') { return Fail 'Quotes and line breaks are not allowed.' }
      if ($t.Length -lt 1 -or $t.Length -gt 200) { return Fail 'Use 1 to 200 characters.' }
      return Pass $t
    }
    'url' {
      if ($t -notmatch '^(https?|ftp|file)://[^\s"]+$') { return Fail 'Enter a full URL (http, https, ftp or file).' }
      return Pass $t
    }
    'listsrc' {
      if ($t -match '["\r\n]') { return Fail 'Quotes and line breaks are not allowed.' }
      if ($t -match '^[A-Za-z][A-Za-z0-9+.-]*://[^/\s]*:[^/\s]*@') { return Fail 'Credentials inside a URL are not stored. Use a local file instead.' }
      if ($t -match '^(https?|ftp|file)://[^\s]+$') { return Pass $t }
      if ($t -and (Test-Path -LiteralPath $t -PathType Leaf)) { return Pass $t }
      return Fail 'Not a URL, and no file exists at that path.'
    }
    'font' {
      if ($t -eq '') { return Pass '' }
      if ($t -match '["\\\r\n]' -or $t.Length -gt 31) { return Fail 'Use up to 31 characters, without quotes or backslashes.' }
      return Pass $t
    }
    'path' {
      if ($t -eq '') { return Pass '' }
      if ($t -match '["\r\n]') { return Fail 'Quotes and line breaks are not allowed.' }
      if ((Test-Path -LiteralPath $t -PathType Leaf) -and $t -match '\.exe$') { return Pass $t }
      return Fail 'No .exe file exists at that path.'
    }
    'dir' {
      if ($t -eq '') { return Pass '' }
      if ($t -match '["\r\n]') { return Fail 'Quotes and line breaks are not allowed.' }
      if (Test-Path -LiteralPath $t -PathType Container) { return Pass $t }
      return Fail 'No folder exists at that path.'
    }
    'ostring' {
      if ($t -match '["\r\n]') { return Fail 'Quotes and line breaks are not allowed.' }
      if ($t.Length -gt 200) { return Fail 'Use up to 200 characters.' }
      return Pass $t
    }
    'proxyaddr' {
      if ($t -eq '') { return Pass '' }
      if ($t -match '^(http://)?[A-Za-z0-9.-]+:\d{1,5}$') { return Pass $t }
      return Fail 'Use host:port, for example 203.0.113.5:8080. No user or password, no https.'
    }
  }
  return Fail 'Unknown setting type.'
}

# ---------------------------------------------------------------- terminal, colors, icons
function Enable-VT {
  if ($env:WT_SESSION -or $env:TERM_PROGRAM -or $env:ConEmuANSI -eq 'ON') { return $true }
  try {
    # v3.1 (N11): Init-Ui runs this again. The second Add-Type threw, the catch returned
    # $false and Save-Cfg then persisted UI_COLOR=0.
    if (-not ('OCI.K32' -as [type])) {
      Add-Type -Namespace OCI -Name K32 -ErrorAction Stop -MemberDefinition '[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int n); [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h, out int m); [DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr h, int m);'
    }
    $h = [OCI.K32]::GetStdHandle(-11); $m = 0
    if (-not [OCI.K32]::GetConsoleMode($h, [ref]$m)) { return $false }
    return [OCI.K32]::SetConsoleMode($h, ($m -bor 4))
  } catch { return $false }
}
$Themes = @{
  ocean  = @{ Title = '1;96'; Accent = '36'; Sel = '30;46'; Border = '34'; Panel = '48;5;235' }
  forest = @{ Title = '1;92'; Accent = '32'; Sel = '30;42'; Border = '32'; Panel = '48;5;234' }
  sunset = @{ Title = '1;95'; Accent = '35'; Sel = '30;45'; Border = '35'; Panel = '48;5;236' }
  mono   = @{ Title = '1'; Accent = '0'; Sel = '7'; Border = '0'; Panel = '' }
  rainbow = @{ Title = '1'; Accent = '36'; Sel = '30;46'; Border = '35'; Panel = ''; Rainbow = $true }
}
# v2.60.1: more themes are read from themes/themes.txt of the repository, cached in the state folder like the languages.
# The five built-in themes stay in this file, so the launcher still works offline.
$BuiltinThemes = @('ocean', 'forest', 'sunset', 'mono', 'rainbow')
$ThemeBase = if ($env:OC_THEME_BASE) { $env:OC_THEME_BASE } else { 'https://gitlab.com/jekooo/opencode-infinite/-/raw/main/themes' }
$ThemeVer = '1'
# one theme per line: name|title|accent|border|selected|rainbow; a line that does not fit is skipped (max 30)
function Parse-Themes([string]$text) {
  $out = @{}
  foreach ($raw in ($text -split "`r?`n")) {
    $f = $raw.Trim().Split('|')
    if ($f.Count -ne 6 -or $f[0] -cnotmatch '^[a-z][a-z0-9_-]{1,19}$' -or $BuiltinThemes -contains $f[0]) { continue }
    if ($f[1] -notmatch '^[0-9;]{1,20}$' -or $f[2] -notmatch '^[0-9;]{1,20}$' -or $f[3] -notmatch '^[0-9;]{1,20}$' -or $f[4] -notmatch '^[0-9;]{1,20}$' -or $f[5] -notmatch '^[01]$') { continue }
    if ($out.Count -ge 30) { break }
    $out[$f[0]] = @{ Title = $f[1]; Accent = $f[2]; Border = $f[3]; Sel = $f[4]; Panel = ''; Rainbow = ($f[5] -eq '1') }
  }
  return $out
}
# downloads the theme file when it is missing or from another ThemeVer (a failed try is not repeated for an hour),
# then adds its themes to $Themes and lists them in the OCUI_THEME setting
function Load-Themes {
  $dir = Join-Path $State 'themes'
  $file = Join-Path $dir 'themes.txt'
  $verFile = $file + '.ver'
  $failFile = $file + '.failed'
  $tmp = $file + '.tmp'
  $fresh = (Test-Path -LiteralPath $file) -and (Test-Path -LiteralPath $verFile) -and (([string](Get-Content -LiteralPath $verFile -Raw)).Trim() -eq $ThemeVer)
  $recentFail = (Test-Path -LiteralPath $failFile) -and (((Get-Date) - (Get-Item -LiteralPath $failFile).LastWriteTime).TotalHours -lt 1)
  if (-not $fresh -and -not $recentFail) {
    try {
      New-Item -ItemType Directory -Force -Path $dir | Out-Null
      $src = $ThemeBase + '/themes.txt'
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      if ($src -match '^https://') { Invoke-WebRequest -Uri $src -OutFile $tmp -UseBasicParsing -TimeoutSec 8 } else { Copy-Item -LiteralPath $src -Destination $tmp -Force }
      if ((Parse-Themes (Get-Content -LiteralPath $tmp -Raw -Encoding UTF8)).Count -eq 0) { throw 'no valid theme in the file' }
      Move-Item -LiteralPath $tmp -Destination $file -Force
      [IO.File]::WriteAllText($verFile, $ThemeVer)
      Remove-Item -LiteralPath $failFile -Force -ErrorAction SilentlyContinue
      Log 'themes downloaded'
    } catch {
      Log ('themes not downloaded: ' + $_.Exception.Message)
      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
      [IO.File]::WriteAllText($failFile, (Get-Date).ToString('s'))
    }
  }
  $extra = @{}
  if (Test-Path -LiteralPath $file) { try { $extra = Parse-Themes (Get-Content -LiteralPath $file -Raw -Encoding UTF8) } catch { } }
  foreach ($k in $extra.Keys) { $Themes[$k] = $extra[$k] }
  $script:ExtraThemes = @($extra.Keys | Sort-Object)
  ($Schema | Where-Object { $_.Key -eq 'OCUI_THEME' }).Values = @($BuiltinThemes + $script:ExtraThemes)
}
Load-Themes
# rainbow: the phase moves a little every frame, so the colors flow like LEDs (see Anim-Key)
$script:RainPhase = 0
function Hue-Rgb([double]$h) {
  $h = (($h % 360) + 360) % 360; $x = 1 - [Math]::Abs((($h / 60) % 2) - 1)
  switch ([int][Math]::Floor($h / 60)) { 0 { $r = 1; $g = $x; $b = 0 } 1 { $r = $x; $g = 1; $b = 0 } 2 { $r = 0; $g = 1; $b = $x } 3 { $r = 0; $g = $x; $b = 1 } 4 { $r = $x; $g = 0; $b = 1 } default { $r = 1; $g = 0; $b = $x } }
  return ('{0};{1};{2}' -f [int]($r * 255), [int]($g * 255), [int]($b * 255))
}
# v2.30: the languages the interface knows; each one is a JSON file in langs/.
$Langs = @('en', 'es', 'fr', 'de', 'pt', 'it', 'tr', 'ru')
$LangBase = if ($env:OC_LANG_BASE) { $env:OC_LANG_BASE } else { 'https://gitlab.com/jekooo/opencode-infinite/-/raw/main/langs' }
# a cached language file is refreshed when it was downloaded by another launcher version (its .ver file)
$LangVer = '2.60.19'
# T looks a text up in the selected language; no entry means the English text is shown. Leading
# icons and spaces are kept. Tf fills {0} {1} after translating. OC_TUI_I18N_DUMP=<file> lists the misses.
$script:TrCache = @{}
function Get-Table([string]$lg) {
  if ($lg -eq 'en') { return @{} }
  if ($script:TrCache.ContainsKey($lg)) { return $script:TrCache[$lg] }
  $h = New-Object 'Collections.Generic.Dictionary[string,string]' ([StringComparer]::Ordinal)
  $file = Join-Path (Join-Path $State 'lang') ($lg + '.json')
  # downloaded when this language has no copy yet or the copy came from another launcher version; picking it again (Fetch-Lang) forces a new one
  [void](Update-Lang $lg $file $false)
  if (Test-Path -LiteralPath $file) {
    try { foreach ($p in (Read-Lang (Get-Content -LiteralPath $file -Raw -Encoding UTF8)).GetEnumerator()) { $h[$p.Key] = $p.Value } }
    catch { Log ('language file unreadable, English is used: ' + $lg) }
  }
  $script:TrCache[$lg] = $h
  return $h
}
# Downloads the texts of the language the user picked, even when a copy is already there. English has no file.
function Fetch-Lang([string]$lg) {
  if ($lg -eq 'en') { return }
  $script:TrCache.Remove($lg)
  $file = Join-Path (Join-Path $State 'lang') ($lg + '.json')
  if (-not (Update-Lang $lg $file $true)) { Say 'warn' ('Could not download the ' + (Lang-Name $lg) + ' texts from the repository. English is used; pick it again to retry.') }
}
# Keys are case-sensitive here ('Yes' and 'yes' are both in the table); ConvertFrom-Json would merge them.
function Read-Lang([string]$text) {
  Add-Type -AssemblyName System.Web.Extensions
  $d = (New-Object System.Web.Script.Serialization.JavaScriptSerializer).DeserializeObject($text)
  if ($d -isnot [System.Collections.IDictionary]) { throw 'not a language object' }
  $h = New-Object 'Collections.Generic.Dictionary[string,string]' ([StringComparer]::Ordinal)
  foreach ($k in $d.Keys) { $h[[string]$k] = [string]$d[$k] }
  return $h
}
# Downloads langs/<code>.json from the repo into lang\. Without force it runs only when there is no copy, and a
# failed attempt is not repeated for an hour (every screen is a new process). Returns $true when a copy is in place.
function Update-Lang([string]$lg, [string]$file, [bool]$force) {
  $verFile = $file + '.ver'
  if (-not $force -and (Test-Path -LiteralPath $file) -and (Test-Path -LiteralPath $verFile) -and ((Get-Content -LiteralPath $verFile -Raw).Trim() -eq $LangVer)) { return $true }
  $fail = $file + '.failed'
  if (-not $force -and (Test-Path -LiteralPath $fail) -and ((Get-Date) - (Get-Item -LiteralPath $fail).LastWriteTime).TotalHours -lt 1) { return $false }
  $tmp = $file + '.tmp'
  try {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $file) | Out-Null
    $src = $LangBase + '/' + $lg + '.json'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    if ($src -match '^https://') { Invoke-WebRequest -Uri $src -OutFile $tmp -UseBasicParsing -TimeoutSec 8 } else { Copy-Item -LiteralPath $src -Destination $tmp -Force }
    [void](Read-Lang (Get-Content -LiteralPath $tmp -Raw -Encoding UTF8))
    Move-Item -LiteralPath $tmp -Destination $file -Force
    [IO.File]::WriteAllText($verFile, $LangVer)
    Remove-Item -LiteralPath $fail -Force -ErrorAction SilentlyContinue
    Log ('language ' + $lg + ' downloaded')
    return $true
  } catch {
    Log ('language ' + $lg + ' not downloaded: ' + $_.Exception.Message)
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    [IO.File]::WriteAllText($fail, (Get-Date).ToString('s'))
    return $false
  }
}
function Strip-Icon([string]$s) {
  foreach ($ic in $script:IconList) { if ($ic -and $s.StartsWith($ic + ' ')) { return $s.Substring($ic.Length + 1) } }
  return $s
}
function T([string]$s) {
  # the table does not exist yet while Load-Cfg validates the saved values: one bad value used to void the whole file
  if (-not $s -or $script:Lang -eq 'en' -or $null -eq $script:Tr) { return $s }
  if ($script:Tr.ContainsKey($s)) { return $script:Tr[$s] }
  # an icon in front ("[X] Exit", "~ Support report") stays as it is; icons such as [OK] contain letters
  foreach ($ic in $script:IconList) { if ($ic -and $s.StartsWith($ic + ' ')) { return $ic + ' ' + (T $s.Substring($ic.Length + 1)) } }
  $m = [regex]::Match($s, '^([^\p{L}\d]*)(.+)$')
  if ($m.Success -and $m.Groups[1].Value -and $script:Tr.ContainsKey($m.Groups[2].Value)) { return $m.Groups[1].Value + $script:Tr[$m.Groups[2].Value] }
  if ($env:OC_TUI_I18N_DUMP -and $s -match '\p{L}') { try { Add-Content -LiteralPath $env:OC_TUI_I18N_DUMP -Value $s -Encoding UTF8 } catch { } }
  return $s
}
function Detect-Lang {
  $uc = $(if ($env:OC_TUI_UILANG) { $env:OC_TUI_UILANG } else { (Get-UICulture).TwoLetterISOLanguageName })
  if ($Langs -contains $uc) { return $uc }
  return 'en'
}
function Tf([string]$fmt, [Parameter(ValueFromRemainingArguments = $true)]$a) { return ((T $fmt) -f @($a)) }
function Init-Ui {
  try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false) } catch { }
  $cm = Get-Val 'OCUI_COLOR'
  $script:Color = $false
  if ($cm -ne 'off' -and -not $env:NO_COLOR) {
    if ($Scripted -and $cm -eq 'on') { $script:Color = $true }
    elseif (-not [Console]::IsOutputRedirected) { $script:Color = ((Enable-VT) -or ($cm -eq 'on')) }
  }
  $script:Theme = $Themes[(Get-Val 'OCUI_THEME')]
  $lg = Get-Val 'OCUI_LANG'
  if ($lg -eq 'auto') { $lg = Detect-Lang }
  $script:Lang = $lg
  # v2.60 (N12): the previous value is kept so the console gets Ctrl+C back on every exit.
  if (-not $Scripted) { try { $script:OldCtrlC = [Console]::TreatControlCAsInput; [Console]::TreatControlCAsInput = $true } catch { } }
  $script:Tr = Get-Table $lg
  $im = Get-Val 'OCUI_ICONS'
  if ($im -eq 'auto') { if ($env:WT_SESSION -or $env:TERM_PROGRAM -or $env:VSCODE_PID) { $im = 'emoji' } else { $im = 'unicode' } }
  $script:IconMode = $im
  $c = { param($n) [string][char]$n }
  if ($im -eq 'emoji') {
    $script:I = @{ ok = (& $c 0x2714); err = (& $c 0x2716); warn = (& $c 0x26A0); gear = (& $c 0x2699); play = (& $c 0x25B6); link = (& $c 0x221E); renew = (& $c 0x21BB); trash = (& $c 0x2716); back = (& $c 0x2190); sel = (& $c 0x276F); up = (& $c 0x2191); down = (& $c 0x2193); info = (& $c 0x2139)
      renewE = [char]::ConvertFromUtf32(0x1F504); gearE = [char]::ConvertFromUtf32(0x2699) + [char]0xFE0F
      tl = (& $c 0x256D); tr = (& $c 0x256E); bl = (& $c 0x2570); br = (& $c 0x256F); h = (& $c 0x2500); v = (& $c 0x2502)
      spin = @(0x280B, 0x2819, 0x2839, 0x2838, 0x283C, 0x2834, 0x2826, 0x2827, 0x2807, 0x280F | ForEach-Object { [string][char]$_ }); bar = (& $c 0x2588); barOff = (& $c 0x2591) }
  } elseif ($im -eq 'unicode') {
    $script:I = @{ ok = '[OK]'; err = '[X]'; warn = '[!]'; gear = '[*]'; play = '>'; link = '~'; renew = '@'; trash = 'x'; back = '<'; sel = '>'; up = '^'; down = 'v'; info = 'i'
      renewE = '[~]'; gearE = '[*]'
      tl = (& $c 0x250C); tr = (& $c 0x2510); bl = (& $c 0x2514); br = (& $c 0x2518); h = (& $c 0x2500); v = (& $c 0x2502)
      spin = @('|', '/', '-', '\'); bar = (& $c 0x2588); barOff = (& $c 0x2591) }
  } else {
    $script:I = @{ ok = '[OK]'; err = '[X]'; warn = '[!]'; gear = '[*]'; play = '>'; link = '~'; renew = '@'; trash = 'x'; back = '<'; sel = '>'; up = '^'; down = 'v'; info = 'i'
      renewE = '[~]'; gearE = '[*]'
      tl = '+'; tr = '+'; bl = '+'; br = '+'; h = '-'; v = '|'
      spin = @('|', '/', '-', '\'); bar = '#'; barOff = '.' }
  }
  $script:IconList = @(@($script:I.ok, $script:I.err, $script:I.warn, $script:I.gear, $script:I.play, $script:I.link, $script:I.renew, $script:I.trash, $script:I.back, $script:I.renewE) | Where-Object { $_ } | Sort-Object { $_.Length } -Descending)
  # v2.60 (N13): the geometry is measured again for every frame, so a window resized while a
  # menu is open measures its rows and draws them with the same width and margin.
  Get-Geometry
  $script:VPad = ((-not $Scripted) -or [bool]$env:OC_TUI_VPAD)
}
# A block background behind a line: re-applied after each color reset inside the line.
function Panel([string]$s) {
  if (-not $script:Color -or -not $script:Theme.Panel) { return $s }
  $p = $esc + '[' + $script:Theme.Panel + 'm'
  return $p + $s.Replace($esc + '[0m', $esc + '[0m' + $p) + $esc + '[0m'
}
# rainbow theme: each letter takes the next hue of a moving gradient, spaces are left alone
function Rainbow([string]$t) {
  $o = ''; $i = 0
  foreach ($c in $t.ToCharArray()) { if ($c -eq ' ') { $o += ' ' } else { $o += $esc + '[38;2;' + (Hue-Rgb ($script:RainPhase * 8 + $i * 28)) + 'm' + $c; $i++ } }
  return $o + $esc + '[0m'
}
# the selected row and the borders take one moving hue (rainbow only)
function SelStyle { if ($script:Theme.Rainbow) { return '30;48;2;' + (Hue-Rgb ($script:RainPhase * 8 + 180)) } return $script:Theme.Sel }
function P($style, [string]$t) {
  if ($script:Color -and $style -eq 'rainbow') { return Rainbow $t }
  if ($script:Color -and $style) { return $esc + '[' + $style + 'm' + $t + $esc + '[0m' } return $t
}
function Style($name) {
  switch ($name) { 'ok' { '32' } 'err' { '31' } 'warn' { '33' } 'title' { if ($script:Theme.Rainbow) { 'rainbow' } else { $script:Theme.Title } } 'accent' { if ($script:Theme.Rainbow) { 'rainbow' } else { $script:Theme.Accent } }'dim' { '90' } 'border' { if ($script:Theme.Rainbow) { '38;2;' + (Hue-Rgb ($script:RainPhase * 8)) } else { $script:Theme.Border } } default { '' } }
}
function W([string]$s) { [Console]::Write($s) }
function WL([string]$s = '') {
  foreach ($l in ($s -split "`r?`n")) { if ($l) { [Console]::WriteLine((' ' * $script:Margin) + $l) } else { [Console]::WriteLine() } }
}
function Wrap-Text([string]$text, [int]$w, [int]$max) {
  $lines = @(); $cur = ''
  foreach ($word in ($text -split '\s+')) {
    if (-not $word) { continue }
    while ($word.Length -gt $w) { if ($cur) { $lines += $cur; $cur = '' }; $lines += $word.Substring(0, $w); $word = $word.Substring($w) }
    if ($cur -and (($cur.Length + $word.Length + 1) -gt $w)) { $lines += $cur; $cur = $word }
    elseif ($cur) { $cur = $cur + ' ' + $word }
    else { $cur = $word }
  }
  if ($cur) { $lines += $cur }
  if ($lines.Count -gt $max) {
    $lines = @($lines[0..($max - 1)])
    $l = $lines[$max - 1]
    if ($l.Length -gt $w - 3) { $l = $l.Substring(0, $w - 3) }
    $lines[$max - 1] = $l + '...'
  }
  return $lines
}
function Clear-Screen { if ($Scripted) { WL ('-' * 20); return } try { [Console]::Clear() } catch { } }
function Disp-W([string]$s) {
  $w = 0
  for ($i = 0; $i -lt $s.Length; $i++) {
    $c = [int]$s[$i]
    if ($c -ge 0xD800 -and $c -le 0xDBFF) { $w += 2; $i++ } elseif ($c -eq 0xFE0F -or ($c -ge 0x0300 -and $c -le 0x036F)) { } else { $w++ }
  }
  return $w
}
function Pad([string]$s, [int]$n) {
  # v3.1 (N75): truncating by .Length split surrogate pairs and measured columns wrong.
  # Text is cut by whole text elements and padded by visible width.
  if ($n -le 0) { return '' }
  $w = Disp-W $s
  if ($w -le $n) { return $s + (' ' * ($n - $w)) }
  $e = [System.Globalization.StringInfo]::GetTextElementEnumerator($s)
  $o = ''; $u = 0
  while ($e.MoveNext()) { $g = [string]$e.Current; $gw = Disp-W $g; if (($u + $gw) -gt $n) { break }; $o += $g; $u += $gw }
  return $o + (' ' * ($n - $u))
}
function Box-Top([string]$title) { return Panel (Box-Top0 $title) }
function Box-Top0([string]$title) {
  $in = $script:Width - 2
  # v3.1 (N75): a title wider than the panel used to tear the box; it is truncated.
  $tt = $title
  if ((Disp-W $tt) -gt ($in - 3)) { $tt = (Pad $tt ([Math]::Max(0, $in - 3))).TrimEnd() }
  $t = ' ' + $tt + ' '
  $left = $script:I.tl + $script:I.h
  $fill = $script:I.h * [Math]::Max(0, $in - 1 - $t.Length)
  return (P (Style 'border') $left) + (P (Style 'title') $t) + (P (Style 'border') ($fill + $script:I.tr))
}
function Box-Bot { return Panel (P (Style 'border') ($script:I.bl + ($script:I.h * ($script:Width - 2)) + $script:I.br)) }
function Box-Line([string]$text, $style = '') {
  $in = $script:Width - 4
  return Panel ((P (Style 'border') $script:I.v) + ' ' + (P $style (Pad $text $in)) + ' ' + (P (Style 'border') $script:I.v))
}
function Get-Banner {
  $bw = 80; try { $bw = [Console]::WindowWidth } catch { }
  if ($env:OC_TUI_COLS) { $bw = 0; if (-not [int]::TryParse([string]$env:OC_TUI_COLS, [ref]$bw)) { $bw = 0 } }
  # the logo is 56 columns wide: in a narrower window its lines wrap and tear, so a short title is shown instead
  if ($bw -lt 60) { return @((P (Style 'title') ' OPENCODE INFINITE'), (P (Style 'accent') (' ' + $Repo))) }
  $art = @(
    '  ___   ____   _____  _   _   ____   ___   ____   _____ ',
    ' / _ \ |  _ \ | ____|| \ | | / ___| / _ \ |  _ \ | ____|',
    '| | | || |_) ||  _|  |  \| || |    | | | || | | ||  _|  ',
    '| |_| ||  __/ | |___ | |\  || |___ | |_| || |_| || |___ ',
    ' \___/ |_|    |_____||_| \_| \____| \___/ |____/ |_____|',
    ' ___  _   _  _____  ___  _   _  ___  _____  _____       ',
    '|_ _|| \ | ||  ___||_ _|| \ | ||_ _||_   _|| ____|      ',
    ' | | |  \| || |_    | | |  \| | | |   | |  |  _|        ',
    ' | | | |\  ||  _|   | | | |\  | | |   | |  | |___       ',
    '|___||_| \_||_|    |___||_| \_||___|  |_|  |_____|      ')
  $w = 0; foreach ($a in $art) { if ($a.Length -gt $w) { $w = $a.Length } }
  $pad = 0
  $lead = ' ' * $pad
  $out = @()
  # the logo follows the theme: rainbow flows per letter, the others use the title color for OPEN and the accent for INFINITE
  for ($r = 0; $r -lt $art.Count; $r++) {
    $st = if ($script:Theme.Rainbow) { 'rainbow' } elseif ($r -lt 5) { Style 'title' } else { Style 'accent' }
    $out += (P $st ($lead + $art[$r]))
  }
  $out += (P (Style 'accent') ($lead + $Repo))
  return $out
}

# ---------------------------------------------------------------- input
function Get-Key {
  if ($Scripted) { if ($KeyQ.Count -eq 0) { throw 'keys exhausted' } return $KeyQ.Dequeue() }
  if ($script:KeyTimeout -gt 0) {
    # a prompt with a default answer: no key before the deadline means Esc
    $dl = (Get-Date).AddSeconds($script:KeyTimeout)
    while (-not [Console]::KeyAvailable) { if ((Get-Date) -gt $dl) { return 'Esc' }; Start-Sleep -Milliseconds 80 }
  }
  $ki = [Console]::ReadKey($true)
  if ($ki.Key -eq 'C' -and ($ki.Modifiers -band [ConsoleModifiers]::Control)) { throw 'ctrl-c' }
  switch ($ki.Key) {
    'UpArrow' { return 'Up' } 'DownArrow' { return 'Down' } 'LeftArrow' { return 'Left' } 'RightArrow' { return 'Right' }
    'Enter' { return 'Enter' } 'Escape' { return 'Esc' } 'Home' { return 'Home' } 'End' { return 'End' }
    default { return [string]$ki.KeyChar }
  }
}
function Read-Text([string]$prompt, [string]$current) {
  WL ''
  WL ((P (Style 'accent') (T $prompt)) + ' ' + (P (Style 'dim') (Tf '(Enter = keep "{0}")' $current)))
  W ((' ' * $script:Margin) + (P (Style 'accent') $script:I.sel) + ' ')
  if ($Scripted) { if ($InQ.Count -eq 0) { throw 'keys exhausted' } $r = $InQ.Dequeue(); WL $r; return $r }
  # Esc gives '<' (back), the same as in a menu. Enter ends the line.
  $sb = New-Object Text.StringBuilder
  while ($true) {
    $ki = [Console]::ReadKey($true)
    if ($ki.Key -eq 'Enter') { WL ''; return $sb.ToString() }
    if ($ki.Key -eq 'Escape') { WL ''; return '<' }
    if ($ki.Key -eq 'C' -and ($ki.Modifiers -band [ConsoleModifiers]::Control)) { throw 'ctrl-c' }
    if ($ki.Key -eq 'Backspace') { if ($sb.Length) { $sb.Length = $sb.Length - 1; W "`b `b" }; continue }
    if ($ki.KeyChar -ge ' ') { [void]$sb.Append($ki.KeyChar); W ([string]$ki.KeyChar) }
  }
}
function Say($kind, [string]$msg) {
  $ic = switch ($kind) { 'ok' { $script:I.ok } 'err' { $script:I.err } 'warn' { $script:I.warn } default { $script:I.gear } }
  WL ((P (Style $kind) $ic) + ' ' + (P (Style $kind) (T $msg)))
}
function Wait-Key { WL ''; WL (P (Style 'dim') (T 'Press any key to continue...')); [void](Get-Key) }

# Arrow-key menu. Items: @{L=label; V=value text; S=value style; D=disabled; H=what it does}.
# Returns the index, or -1 on Esc. The selected row's H is shown under the box.
# The interface is a block centered in the terminal: margin = free columns / 2.
# v2.60 (N13): Width, Margin and TermH used to be computed once, so after a resize the frame
# was measured with the new width and drawn with the old margin, and [nF went back too many
# rows. One measurement per frame keeps rows, $vp and $anim on the same values.
function Get-Geometry {
  try { $cw = [Console]::WindowWidth; $script:TermH = [Console]::WindowHeight } catch { $cw = 80; $script:TermH = 30 }
  if ($env:OC_TUI_COLS) { $cw = 0; if (-not [int]::TryParse([string]$env:OC_TUI_COLS, [ref]$cw)) { $cw = 0 } }
  if ($cw -lt 20) { $cw = 80 }
  $script:Width = [Math]::Max(56, [Math]::Min(74, $cw - 2))
  $script:Margin = [Math]::Max(0, [int](($cw - $script:Width) / 2))
}
function Show-Menu([string]$title, $items, $footer = $null, $head = $null, [int]$start = 0, [bool]$banner = $false, [bool]$inline = $false) {
  $i = $start
  if ($i -ge $items.Count) { $i = 0 }
  $top = -1; $drawn = 0
  while ($true) {
    Get-Geometry
    $buf = New-Object 'Collections.Generic.List[string]'
    $fullVal = ''
    if ($banner) { foreach ($b in (Get-Banner)) { $buf.Add($b) }; $buf.Add('') }
    if ($head) { foreach ($h in $head) { $buf.Add([string]$h) } }
    $buf.Add((Box-Top (T (Strip-Icon $title))))
    $in = $script:Width - 4
    for ($n = 0; $n -lt $items.Count; $n++) {
      $it = $items[$n]
      $num = ([string]($n + 1) + '.').PadRight(3)
      $mark = if ($n -eq $i) { '>' } else { ' ' }
      $lab = $mark + ' ' + $num + ' ' + (T (Strip-Icon ([string]$it.L)))
      $val = T ([string]$it.V)
      $room = $in - $lab.Length - 1
      if ($val.Length -gt $room - 1) { if ($n -eq $i) { $fullVal = $val }; $val = $val.Substring(0, [Math]::Max(0, $room - 2)) + '..' }
      $gap = ' ' * [Math]::Max(1, $in - (Disp-W $lab) - (Disp-W $val))
      if ($n -eq $i) {
        $buf.Add((Panel ((P (Style 'border') $script:I.v) + ' ' + (P (SelStyle) (Pad ($lab + $gap + $val) $in)) + ' ' + (P (Style 'border') $script:I.v))))
      } else {
        $st = if ($it.D) { Style 'dim' } else { '' }
        $vs = if ($it.S) { Style $it.S } else { Style 'accent' }
        $pad = ' ' * [Math]::Max(0, $in - (Disp-W $lab) - $gap.Length - (Disp-W $val))
        $buf.Add((Panel ((P (Style 'border') $script:I.v) + ' ' + (P $st $lab) + $gap + (P $vs $val) + $pad + ' ' + (P (Style 'border') $script:I.v))))
      }
    }
    $buf.Add((Box-Bot))
    $dtext = T ([string]$items[$i].H)
    if ($fullVal) { $dtext = (Tf 'Value: {0}' $fullVal) + '  ' + $dtext }
    $dl = @(Wrap-Text $dtext ($script:Width - 4) 3)
    for ($q = 0; $q -lt 3; $q++) {
      if ($q -lt $dl.Count) {
        $pre = if ($q -eq 0) { $script:I.info + ' ' } else { '  ' }
        $buf.Add((P (Style 'accent') (Pad ($pre + $dl[$q]) ($script:Width - 1))))
      } else { $buf.Add((' ' * ($script:Width - 1))) }
    }
    $buf.Add((P (Style 'dim') (Pad ('arrows' + (T ' move   Enter select   Esc back   1-9 or letter jump')) ($script:Width - 1))))
    foreach ($f in @($footer)) { if ($f) { foreach ($fl in (Wrap-Text (T ([string]$f)) ($script:Width - 1) 3)) { $buf.Add((Panel (P (Style 'dim') (Pad $fl ($script:Width - 1))))) } } }
    # rainbow redraws in place, one frame per color step; the other themes draw once per key
    # v2.44: count the rows the frame really takes. A line wider than the console wraps onto two rows;
    # counting lines left the first row (the title) behind on every rainbow redraw.
    $cwNow = 80; try { $cwNow = [Console]::WindowWidth } catch { }
    if ($cwNow -lt 20) { $cwNow = 80 }
    $rows = 0
    foreach ($line in $buf) { $vis = [regex]::Replace([string]$line, [regex]::Escape($esc) + '\[[0-9;]*[A-Za-z]', ''); $rows += [Math]::Max(1, [int][Math]::Ceiling(($script:Margin + (Disp-W $vis)) / $cwNow)) }
    # a frame taller than the window cannot be moved back up to its first row: redraw it with a clear instead
    $anim = [bool]($script:Theme.Rainbow -and $script:Color -and -not $Scripted -and $rows -lt ($script:TermH - 2))
    # rainbow moves up by the rows it drew last time (relative, so scrollback and buffer offset do not matter)
    if ($anim -and $drawn -gt 0) { W ($esc + '[' + $drawn + 'F') }
    elseif ($inline) {
      # drawn under the text already on screen and redrawn in place
      if ($top -ge 0) { try { [Console]::SetCursorPosition(0, $top) } catch { } }
    } else { Clear-Screen }
    $vp = 0
    if ($script:VPad -and -not $inline) {
      $vp = [Math]::Max(0, [int](($script:TermH - $buf.Count - 1) / 2))
      for ($q = 0; $q -lt $vp; $q++) { WL '' }
    }
    $eol = if ($anim) { $esc + '[K' } else { '' }
    foreach ($line in $buf) { WL ($line + $eol) }
    $drawn = $vp + $rows
    if ($anim) { W ($esc + '[J') }
    if ($inline) { try { $top = [Math]::Max(0, [Console]::CursorTop - $buf.Count) } catch { $top = -1 } }
    if ($anim) { $k = Anim-Key } else { $k = Get-Key }
    if ($null -eq $k) { continue }
    switch -Regex ($k) {
      '^Up$' { do { $i = ($i - 1 + $items.Count) % $items.Count } while ($items[$i].D -and $items.Count -gt 1); continue }
      '^Down$' { do { $i = ($i + 1) % $items.Count } while ($items[$i].D -and $items.Count -gt 1); continue }
      '^Home$' { $i = 0; continue }
      '^End$' { $i = $items.Count - 1; continue }
      '^Enter$' { if (-not $items[$i].D) { return $i } continue }
      '^Esc$' { return -1 }
      '^[1-9]$' { $n = [int]$k - 1; if ($n -lt $items.Count -and -not $items[$n].D) { return $n } continue }
      default { for ($q = 0; $q -lt $items.Count; $q++) { if ($items[$q].K -and ([string]$items[$q].K -ieq $k) -and -not $items[$q].D) { return $q } } }
    }
  }
}
# rainbow wait: about 90 ms per frame; no key in that time advances the colors and returns nothing
function Anim-Key {
  $dl = (Get-Date).AddMilliseconds(90)
  while ((Get-Date) -lt $dl) { if ([Console]::KeyAvailable) { return Get-Key }; Start-Sleep -Milliseconds 15 }
  $script:RainPhase++
  return $null
}
function Confirm-Box([string]$question, [string[]]$lines = @()) {
  $head = @()
  $head += (P (Style 'warn') ($script:I.warn + ' ' + (T $question)))
  foreach ($l in $lines) { $head += (P (Style 'dim') ('   ' + (T $l))) }
  $head += ''
  $r = Show-Menu 'Confirm' @(@{ L = 'No, cancel'; H = 'Go back. Nothing is changed.' }, @{ L = 'Yes, continue'; S = 'warn'; H = 'Do it now.' }) $null $head 0
  return ($r -eq 1)
}
function Progress([int]$n, [int]$total, [string]$label) {
  $w = 24
  $fill = [int][Math]::Round($w * $n / [Math]::Max(1, $total))
  $bar = ($script:I.bar * $fill) + ($script:I.barOff * ($w - $fill))
  WL ((P (Style 'accent') ('[' + $bar + ']')) + ' ' + $n + '/' + $total + '  ' + (T $label))
}

# Runs the launcher itself in a hidden child (--verify / --renew) behind a spinner. Returns the exit code.
function Run-Child([string]$label, [string]$arg, [string]$log, [int]$timeout = 300) {
  $label = T $label
  if ($env:OC_TUI_CHILD_EXIT) { WL ((P (Style 'accent') $script:I.spin[0]) + ' ' + $label); return [int]$env:OC_TUI_CHILD_EXIT }
  if (Test-Path -LiteralPath $log) { Remove-Item -LiteralPath $log -Force -ErrorAction SilentlyContinue }
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $env:SystemRoot + '\System32\cmd.exe'
  $psi.Arguments = '/d /c ""' + $Self + '" ' + $arg + ' < nul > "' + $log + '" 2>&1"'
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $p = [Diagnostics.Process]::Start($psi)
  $t0 = Get-Date; $f = 0; $killed = $false
  while (-not $p.HasExited) {
    $frame = $script:I.spin[$f % $script:I.spin.Count]; $f++
    $sec = [int]((Get-Date) - $t0).TotalSeconds
    W ("`r" + (' ' * $script:Margin) + (P (Style 'accent') $frame) + ' ' + $label + ' ' + (P (Style 'dim') ($sec.ToString() + 's')) + '   ')
    Start-Sleep -Milliseconds 120
    if ($sec -gt $timeout) {
      # v3.1 (N47): the kill was fire-and-forget. A failing taskkill left the child alive
      # while 124 told the caller to start another one, and $p was never freed.
      try {
        $tk = Start-Process taskkill.exe -ArgumentList @('/T', '/F', '/PID', $p.Id) -WindowStyle Hidden -Wait -PassThru
        if ($tk) { $tk.Dispose() }
      } catch { }
      $killed = $true; break
    }
  }
  W ("`r" + (' ' * ($script:Margin + $label.Length + 12)) + "`r")
  try { if ($killed -and -not $p.HasExited) { [void]$p.WaitForExit(2000) } } catch { }
  if ($killed -or -not $p.HasExited) { try { $p.Dispose() } catch { }; return 124 }
  $rc = $p.ExitCode
  try { $p.Dispose() } catch { }
  return $rc
}
function Show-LogTail([string]$log, [int]$n = 6) {
  if (-not (Test-Path -LiteralPath $log)) { return }
  $t = @(Get-Content -LiteralPath $log -Tail $n -ErrorAction SilentlyContinue | Where-Object { $_ -and $_.Trim() })
  foreach ($l in $t) { WL (P (Style 'dim') ('   ' + $l.Trim())) }
}

# ---------------------------------------------------------------- terminal font
# The classic console (cmd / PowerShell windows) takes a font through the Windows API and shows it at
# once. Windows Terminal keeps its font in settings.json: only profiles.defaults.font is touched, after a
# backup, and the file must still parse before it is written. Other terminals own their font.
function Installed-Fonts {
  if ($env:OC_TUI_FONTS) { return @($env:OC_TUI_FONTS -split ',') }
  try {
    Add-Type -AssemblyName System.Drawing
    $all = @((New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name })
  } catch { return @() }
  $cand = @('Cascadia Mono', 'Cascadia Code', 'Consolas', 'Lucida Console', 'Courier New', 'JetBrains Mono', 'Fira Code', 'Fira Mono', 'Source Code Pro', 'Hack', 'Roboto Mono', 'Ubuntu Mono', 'DejaVu Sans Mono', 'IBM Plex Mono', 'Iosevka', 'Inconsolata', 'MS Gothic')
  return @($cand | Where-Object { $all -contains $_ })
}
function Pick-Font {
  $cur = [string](Get-Val 'OCUI_FONT')
  $items = @(@{ L = '(terminal default)'; V = $(if ($cur -eq '') { '*' } else { '' }); H = 'Leave the terminal font as it is. If the launcher changed it, the original font comes back.'; f = '' })
  foreach ($f in (Installed-Fonts)) { $items += @{ L = $f; V = $(if ($f -eq $cur) { '*' } else { '' }); H = (Tf 'Use {0} for the terminal text. Monospaced fonts only look right.' $f); f = $f } }
  $items += @{ L = 'Type a font name...'; H = 'Any installed font name, for example Cascadia Code.'; f = '<type>' }
  $items += @{ L = ($script:I.back + ' Back'); H = 'Keep the current font.'; f = '<back>' }
  $r = Show-Menu 'Terminal font' $items 'The font applies to the whole terminal window, not only to this launcher.'
  if ($r -eq -1) { return $null }
  $f = $items[$r].f
  if ($f -eq '<back>') { return $null }
  if ($f -eq '<type>') {
    while ($true) {
      $t = Read-Text 'Font name' $cur
      if ($t -eq '' -or $t -eq '<') { return $null }
      $v = Test-Val (Get-Setting 'OCUI_FONT') $t
      if ($v.ok) { return $v.v }
      Say 'err' $v.err
    }
  }
  return $f
}
function Strip-Jsonc([string]$s) {
  $sb = New-Object Text.StringBuilder; $i = 0; $n = $s.Length; $inStr = $false
  while ($i -lt $n) {
    $c = $s[$i]
    if ($inStr) {
      [void]$sb.Append($c)
      if ($c -eq [char]92) { $i++; if ($i -lt $n) { [void]$sb.Append($s[$i]) } } elseif ($c -eq [char]34) { $inStr = $false }
      $i++; continue
    }
    if ($c -eq [char]34) { $inStr = $true; [void]$sb.Append($c); $i++; continue }
    if ($c -eq '/' -and ($i + 1) -lt $n -and $s[$i + 1] -eq '/') { while ($i -lt $n -and $s[$i] -ne "`n") { $i++ }; continue }
    if ($c -eq '/' -and ($i + 1) -lt $n -and $s[$i + 1] -eq '*') { $i += 2; while (($i + 1) -lt $n -and -not ($s[$i] -eq '*' -and $s[$i + 1] -eq '/')) { $i++ }; $i += 2; continue }
    [void]$sb.Append($c); $i++
  }
  return [regex]::Replace($sb.ToString(), ',(\s*[}\]])', '$1')
}
function Get-WtPaths {
  if ($env:OC_TUI_WTPATHS) { return @($env:OC_TUI_WTPATHS -split ';' | Where-Object { $_ }) }
  $c = @((Join-Path $env:LOCALAPPDATA 'Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json'),
    (Join-Path $env:LOCALAPPDATA 'Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState\settings.json'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\Windows Terminal\settings.json'))
  return @($c | Where-Object { Test-Path -LiteralPath $_ })
}
# $block is the text of the font entry ("font": { ... }) or $null to remove it. Returns the font text that
# was there before ('' when none) so a later reset can put it back, or $false when the file was not edited.
# keeps the face of an existing font entry when only the size is changed
function Merge-FontFace($block, [string]$existing) {
  if (-not $block -or $block -match '"face"' -or $existing -notmatch '"face"\s*:\s*"[^"]*"') { return $block }
  return ($block -replace '^"font"\s*:\s*\{\s*', ('"font": { ' + [regex]::Match($existing, '"face"\s*:\s*"[^"]*"').Value + ', '))
}
# The font of the profile this tab runs (WT_PROFILE_ID). A profile's own font wins over profiles.defaults.
# Returns @(text, prior font text) or $null when that profile is not in profiles.list.
function Set-ProfFont([string]$text, [string]$guid, $block) {
  $gm = [regex]::Match($text, '"guid"\s*:\s*"' + [regex]::Escape($guid) + '"', 'IgnoreCase')
  if (-not $gm.Success) { return $null }
  $open = -1; $depth = 0
  for ($i = $gm.Index; $i -ge 0 -and $open -lt 0; $i--) {
    if ($text[$i] -eq '}') { $depth++ } elseif ($text[$i] -eq '{') { if ($depth -eq 0) { $open = $i } else { $depth-- } }
  }
  if ($open -lt 0) { return $null }
  $close = -1; $depth = 0
  for ($i = $open; $i -lt $text.Length -and $close -lt 0; $i++) {
    if ($text[$i] -eq '{') { $depth++ } elseif ($text[$i] -eq '}') { $depth--; if ($depth -eq 0) { $close = $i } }
  }
  if ($close -lt 0) { return $null }
  $obj = $text.Substring($open, $close - $open + 1)
  $fontRe = '"font"\s*:\s*\{[^{}]*\}'
  $fm = [regex]::Match($obj, $fontRe)
  $prior = ''
  if ($fm.Success) {
    $prior = $fm.Value
    if ($block) { $obj = $obj.Remove($fm.Index, $fm.Length).Insert($fm.Index, (Merge-FontFace $block $prior)) }
    elseif ($obj -match (',\s*' + $fontRe)) { $obj = [regex]::Replace($obj, ',\s*' + $fontRe, '', 'None', 1) }
    else { $obj = [regex]::Replace($obj, $fontRe + '\s*,?', '', 'None', 1) }
  } elseif ($block) {
    $obj = '{' + "`r`n            " + $block + ',' + $obj.Substring(1)
  }
  return @(($text.Substring(0, $open) + $obj + $text.Substring($close + 1)), $prior)
}
function Edit-WtFile([string]$path, $block, [bool]$pTouch = $false, $pblock = $null) {
  $bytes = [IO.File]::ReadAllBytes($path)
  $bom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
  $text = [Text.Encoding]::UTF8.GetString($bytes)
  if ($bom) { $text = $text.Substring(1) }
  $fontRe = '"font"\s*:\s*\{[^{}]*\}'
  $defRe = '(?s)("defaults"\s*:\s*\{)((?:[^{}]|\{[^{}]*\})*)(\})'
  $prior = ''
  $m = [regex]::Match($text, $defRe)
  if ($m.Success) {
    $body = $m.Groups[2].Value
    $fm = [regex]::Match($body, $fontRe)
    if ($fm.Success) { $prior = $fm.Value; $cm = [regex]::new(',\s*' + $fontRe); if ($cm.IsMatch($body)) { $body = $cm.Replace($body, '', 1) } else { $body = ([regex]::new($fontRe + '\s*,?')).Replace($body, '', 1) } }  # v2.39: remove the font and exactly one adjacent comma
    $block = Merge-FontFace $block $prior
    if ($block) {
      $sep = $(if ($body.Trim()) { ',' } else { '' })
      $nl = $(if ($text.Contains("`r`n")) { "`r`n" } else { "`n" })
      $im = [regex]::Match($body, '\n([ \t]+)\S')
      $ind = $(if ($im.Success) { $im.Groups[1].Value } else { '        ' })
      $body = $nl + $ind + $block + $sep + $body
    }
    $new = $text.Substring(0, $m.Groups[2].Index) + $body + $text.Substring($m.Groups[2].Index + $m.Groups[2].Length)
  } else {
    $pm = [regex]::Match($text, '"profiles"\s*:\s*\{')
    if (-not $pm.Success -or -not $block) { return $false }
    $new = $text.Insert($pm.Index + $pm.Length, "`r`n    ""defaults"": { " + $block + " },")
  }
  $script:ProfFound = $false; $script:ProfPrior = ''
  if ($pTouch -and $env:WT_PROFILE_ID) {
    $pr = Set-ProfFont $new $env:WT_PROFILE_ID $pblock
    if ($pr) { $new = $pr[0]; $script:ProfFound = $true; $script:ProfPrior = $pr[1] }
  }
  if ($new -eq $text) { return $prior }
  # the result must still be valid and must say what we meant
  try {
    $j = (Strip-Jsonc $new) | ConvertFrom-Json
    $got = $j.profiles.defaults.font
    if ($block) { if (-not $got) { return $false } } elseif ($got -and -not $prior) { return $false }
    if ($script:ProfFound -and $pblock) { $pp = @($j.profiles.list | Where-Object { $_.guid -eq $env:WT_PROFILE_ID }); if ($pp.Count -and -not $pp[0].font) { return $false } }
  } catch { return $false }
  $out = [Text.Encoding]::UTF8.GetBytes($new)
  if ($bom) { $out = [byte[]](0xEF, 0xBB, 0xBF) + $out }
  [IO.File]::WriteAllBytes($path, $out)
  return $prior
}
function Apply-WtFont([string]$face, [int]$size) {
  $paths = @(Get-WtPaths)
  if ($paths.Count -eq 0) { return @('warn', 'Windows Terminal settings.json was not found.') }
  if (-not $script:Cfg.font.ContainsKey('wt')) { $script:Cfg.font['wt'] = @{} }
  $done = 0
  $failed = $false  # v2.39: a failure on one file no longer drops the backup record of files already written
  foreach ($p in $paths) {
    $key = ($p -replace '[^A-Za-z0-9]', '_')
    $restore = (-not $face) -and $script:Cfg.font.wt.ContainsKey($key) -and [bool]$script:Cfg.font.wt[$key].face
    $entry = $null
    if ($face) { $entry = '"font": { "face": "' + $face + '", "size": ' + $size + ' }' }
    elseif ($restore) { $entry = [string]$script:Cfg.font.wt[$key].prior; if (-not $entry) { $entry = $null } }
    else { $entry = '"font": { "size": ' + $size + ' }' }
    New-Item -ItemType Directory -Force -Path $BackDir | Out-Null
    $bk = Join-Path $BackDir ('wt-settings-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $done + '.json')
    Copy-Item -LiteralPath $p -Destination $bk -Force
    $pentry = $entry
    if ($restore) { $pentry = [string]$script:Cfg.font.wt[$key].pprior; if (-not $pentry) { $pentry = $null } }
    $ptouch = if ($restore) { [bool]$script:Cfg.font.wt[$key].ptouched } else { $true }
    $prior = Edit-WtFile $p $entry $ptouch $pentry
    if ($prior -is [bool] -and -not $prior) { Remove-Item -LiteralPath $bk -Force -ErrorAction SilentlyContinue; $failed = $true; continue }
    if ($restore) { [void]$script:Cfg.font.wt.Remove($key) }
    else {
      if (-not $script:Cfg.font.wt.ContainsKey($key)) { $script:Cfg.font.wt[$key] = @{ prior = [string]$prior; backup = $bk; ptouched = [bool]$script:ProfFound; pprior = [string]$script:ProfPrior } }
      $script:Cfg.font.wt[$key].face = $face
    }
    $done++
  }
  if ($done -eq 0 -and $failed) { return @('err', 'settings.json was left untouched: the edit would not have kept it valid.') }
  Save-Cfg
  if (-not $face -and $paths.Count -gt 0 -and $done -gt 0 -and -not $script:Cfg.font.wt.Count) { return @('ok', 'Windows Terminal font put back as it was. Reopen the tab if it does not change.') }
  if (-not $face) { return @('ok', (Tf 'Windows Terminal font size set to {0}. Reopen the tab if it does not change.' $size)) }
  return @('ok', ('Windows Terminal font set to ' + $face + ' ' + $size + '. Backup of settings.json: ' + $BackDir))
}
function Get-ConsoleFonts {
  try {
    $k = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Console\TrueTypeFont' -ErrorAction Stop
    $n = @($k.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' -and $_.Value -match '^[A-Za-z]' } | ForEach-Object { [string]$_.Value })
    if ($n.Count) { return ($n -join ', ') }
  } catch { }
  return 'Consolas, Lucida Console'
}
function Apply-ConsoleFont([string]$face, [int]$size) {
  try {
    Add-Type -Namespace OCI -Name Fnt -ErrorAction Stop -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct COORD { public short X; public short Y; }
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct CFI { public int cbSize; public int nFont; public COORD dwFontSize; public int FontFamily; public int FontWeight; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string FaceName; }
[DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr GetStdHandle(int n);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool GetCurrentConsoleFontEx(IntPtr h, bool max, ref CFI i);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetCurrentConsoleFontEx(IntPtr h, bool max, ref CFI i);
'@
  } catch { if (-not ('OCI.Fnt' -as [type])) { return @('err', 'The Windows font API could not be loaded.') } }
  $h = [OCI.Fnt]::GetStdHandle(-11)
  $cfi = New-Object 'OCI.Fnt+CFI'
  $cfi.cbSize = [Runtime.InteropServices.Marshal]::SizeOf([type]'OCI.Fnt+CFI')
  if (-not [OCI.Fnt]::GetCurrentConsoleFontEx($h, $false, [ref]$cfi)) { return @('err', 'This window does not allow changing the font from here.') }
  if ($face) {
    if (-not $script:Cfg.font.ContainsKey('orig')) { $script:Cfg.font['orig'] = @{ face = $cfi.FaceName; size = [int]$cfi.dwFontSize.Y }; Save-Cfg }
  } elseif ($script:Cfg.font.ContainsKey('orig')) { $face = [string]$script:Cfg.font.orig.face }
  else { $face = [string]$cfi.FaceName }
  $c = New-Object 'OCI.Fnt+COORD'; $c.X = 0; $c.Y = [int16]$size
  $cfi.dwFontSize = $c; $cfi.FaceName = $face; $cfi.FontFamily = 54; $cfi.FontWeight = 400
  if (-not [OCI.Fnt]::SetCurrentConsoleFontEx($h, $false, [ref]$cfi)) { return @('err', 'Windows refused that font in this console.') }
  $chk = New-Object 'OCI.Fnt+CFI'
  $chk.cbSize = [Runtime.InteropServices.Marshal]::SizeOf([type]'OCI.Fnt+CFI')
  [void][OCI.Fnt]::GetCurrentConsoleFontEx($h, $false, [ref]$chk)
  if ($chk.FaceName -ne $face) {
    # put the old font back so the window is not left half changed
    if ($script:Cfg.font.ContainsKey('orig') -and $chk.FaceName -ne [string]$script:Cfg.font.orig.face) { $cfi.FaceName = [string]$script:Cfg.font.orig.face; $c.Y = [int16]$script:Cfg.font.orig.size; $cfi.dwFontSize = $c; [void][OCI.Fnt]::SetCurrentConsoleFontEx($h, $false, [ref]$cfi) }
    return @('warn', ('This console refused "' + $face + '" and kept "' + $chk.FaceName + '". Older classic consoles only take the fonts Windows registers for them (' + (Get-ConsoleFonts) + '). Windows Terminal accepts any installed font.'))
  }
  return @('ok', ('Console font set to ' + $face + ' ' + $size + '. It lasts while this window is open and is applied again at every launcher start.'))
}
function Apply-Font {
  $face = [string](Get-Val 'OCUI_FONT'); $size = [int](Get-Val 'OCUI_FONT_SIZE')
  try {
    if ($env:WT_SESSION -or $env:OC_TUI_WTPATHS) { return Apply-WtFont $face $size }
    if ($env:TERM_PROGRAM -or $env:VSCODE_PID) { return @('warn', 'This terminal keeps its font in its own settings (VS Code: terminal.integrated.fontFamily).') }
    return Apply-ConsoleFont $face $size
  } catch { return @('err', ('Could not change the font: ' + $_.Exception.Message)) }
}

# ---------------------------------------------------------------- settings screens
function Edit-Setting($s) {
  $cur = Get-Val $s.Key
  $new = $null
  if ($s.Key -eq 'OCUI_LANG') {
    # a list to pick from; Init-Ui then loads only the chosen language
    $codes = @('auto') + @($Langs)
    $items = @()
    foreach ($c in $codes) { $items += @{ L = (Lang-Name $c); V = $(if ($c -eq [string]$cur) { '*' } else { '' }); H = $(if ($c -eq 'auto') { 'Follow the language Windows uses.' } else { 'Use this language for every menu and message.' }) } }
    $items += @{ L = ($script:I.back + ' Back'); H = 'Keep the current language.' }
    $r = Show-Menu 'Language' $items 'Only the chosen language is downloaded from the langs folder of the repository.' $null ([Array]::IndexOf($codes, [string]$cur))
    if ($r -lt 0 -or $r -ge $codes.Count) { return $null }
    $new = $codes[$r]
    if ($new -eq [string]$cur) { return $null }
  }
  elseif ($s.Type -eq 'bool') { $new = if ([int]$cur -eq 1) { 0 } else { 1 } }
  elseif ($s.Type -eq 'enum') {
    # a list with the current value marked; Back keeps it
    $vals = @($s.Values)
    $items = @()
    foreach ($v in $vals) { $items += @{ L = [string]$v; V = $(if ([string]$v -eq [string]$cur) { '*' } else { '' }); H = (T ([string]$s.Help)) } }
    $items += @{ L = ($script:I.back + ' Back'); H = 'Keep the current value.' }
    $r = Show-Menu (T $s.Label) $items $null $null ([Array]::IndexOf($vals, $cur))
    if ($r -lt 0 -or $r -ge $vals.Count) { return $null }
    $new = $vals[$r]
    if ([string]$new -eq [string]$cur) { return $null }
  } elseif ($s.Key -eq 'PROXY_LIST_URL') {
    # v2.58: the same source list as the setup
    $v = Pick-ProxySource 'Proxy list source'
    if ($v -eq '<') { return $null }
    $new = $v
  } elseif ($s.Type -eq 'font') {
    $new = Pick-Font
    if ($null -eq $new) { return $null }
  } else {
    while ($true) {
      $t = Read-Text ((T $s.Label) + ' - ' + (T $s.Help)) ([string]$cur)
      if ($t -eq '<') { return $null }
      if ($t -eq '' -and $s.Type -ne 'path') { return $null }
      if ($t -eq '-' -and @('path', 'dir', 'ostring', 'country', 'proxyaddr') -contains $s.Type) { $t = '' }
      $r = Test-Val $s $t
      if ($r.ok) { $new = $r.v; break }
      Say 'err' $r.err
    }
  }
  Set-Val $s $new
  Log ('setting ' + $s.Key + ' -> ' + (Safe-Val $s.Key))
  if ($s.Key -eq 'OCUI_LANG') { Fetch-Lang $(if ($new -eq 'auto') { Detect-Lang } else { $new }); Init-Ui; Write-I18n }
  if ($s.Key -like 'OCUI_*') { Init-Ui }
  if ($s.Key -eq 'OCUI_FONT' -or $s.Key -eq 'OCUI_FONT_SIZE') {
    $script:FontMsg = Apply-Font
    Log ('font ' + $script:FontMsg[0] + ': ' + $script:FontMsg[1])
    if ($script:FontMsg[0] -ne 'ok') {
      # nothing changed on screen, so the saved value must not say otherwise
      Set-Val $s $cur
      $script:FontMsg = @($script:FontMsg[0], ($script:FontMsg[1] + ' The setting was not changed.'))
      return $null
    }
  }
  return $s
}
function Format-Val($s) {
  $v = Get-Val $s.Key
  switch ($s.Type) { 'bool' { if ([int]$v -eq 1) { return (T 'on') } else { return (T 'off') } } default { if ([string]$v -eq '') { return (T '(auto)') } if ($s.Key -eq 'OCUI_LANG') { return (Lang-Name $v) } return [string]$v } }
}
function Lang-Name([string]$c) {
  switch ($c) { 'auto' { return (T 'auto') } 'en' { return 'English' } 'es' { return ('Espa' + [char]0xF1 + 'ol') } 'fr' { return ('Fran' + [char]0xE7 + 'ais') } 'de' { return 'Deutsch' } 'pt' { return ('Portugu' + [char]0xEA + 's') } 'it' { return 'Italiano' } 'tr' { return ('T' + [char]0xFC + 'rk' + [char]0xE7 + 'e') } 'ru' { return (-join ([char[]](0x0420, 0x0443, 0x0441, 0x0441, 0x043A, 0x0438, 0x0439))) } default { return $c } }
}
function Describe-Setting($s) {
  if ($s.Type -eq 'bool') { $dv = $(if ([int]$s.Default -eq 1) { T 'on' } else { T 'off' }) }
  elseif ([string]$s.Default -eq '') { $dv = T '(auto)' }
  elseif ($s.Key -eq 'OCUI_LANG') { $dv = Lang-Name ([string]$s.Default) }
  else { $dv = [string]$s.Default }
  $d = (T ([string]$s.Help)) + ' ' + (Tf 'Default: {0}.' $dv)
  if ($s.Type -eq 'bool') { $d += ' ' + (T 'Enter toggles it.') }
  elseif ($s.Type -eq 'enum') { $d += ' ' + (T 'Enter opens the list of values.') }
  elseif ($s.Type -eq 'int') { $d += ' ' + (Tf 'Range {0} to {1}.' $s.Min $s.Max) }
  if ($s.Apply -ne 'now') { $d += ' ' + (Tf 'Applies at the {0}.' (T $s.Apply)) }
  return $d
}
# Fixed keys and terminal commands: listed under the Shortcuts group, dimmed, never selected.
function Shortcut-Info {
  @(
    @{ L = 'Esc'; V = 'back to the previous screen'; D = $true; H = 'Fixed. In a menu or a text prompt Esc goes back; it never closes the launcher.' },
    @{ L = 'Enter, arrows'; V = 'select and move'; D = $true; H = 'Fixed. Digits 1-9 jump straight to a row.' },
    @{ L = 'Ctrl+C'; V = 'quit the launcher'; D = $true; H = 'Fixed. Stops the processes it started and leaves the terminal open, no Y/N question.' },
    @{ L = 'opencode'; V = 'normal OpenCode, no launcher'; D = $true; H = 'Terminal command from any folder. Starts the OpenCode you installed, as it is, with no connection change.' },
    @{ L = 'opencodeinf'; V = 'launcher menu'; D = $true; H = 'Terminal command: opens the launcher menu. The Start menu shortcut does the same. Options go after it, see the rows below.' },
    @{ L = 'opencodeinf --preset warp|tor|proxy'; V = 'connection, no menu'; D = $true; H = 'Starts OpenCode with that connection and no menu. Example: opencodeinf --preset warp --here --quiet' },
    @{ L = 'opencode-auto  (= opencodeinf --auto)'; V = 'no menus'; D = $true; H = 'Starts OpenCode in the folder you are in with the last working connection. No menus.' },
    @{ L = 'opencodeinf --here'; V = 'this folder'; D = $true; H = 'Uses the folder you are in now as the project folder.' },
    @{ L = 'opencodeinf --quiet | --verbose'; V = 'console output'; D = $true; H = '--quiet prints nothing and only writes the log. --verbose also logs every line.' },
    @{ L = 'opencodeinf --no-update | --no-probe'; V = 'skip checks'; D = $true; H = '--no-update skips the update check; --no-probe skips the IP probe.' },
    @{ L = 'opencode-warp, -tor, -proxy'; V = 'one connection each, no menu'; D = $true; H = 'Written by Install direct commands in the Launch group. Each runs opencodeinf --preset with its connection.' }
  )
}
# v3.5: the user PATH gets only the launcher folder of the real user profile. The check uses the
# known-folder path, not the LOCALAPPDATA variable, so a test copy that has its own state folder
# cannot register it. Other launcher folders (any folder with an opencodeinf.cmd) are removed, so an
# old or test copy cannot win the command. Returns added, there or skipped.
function Set-ShimPath {
  $mine = $ShimDir.TrimEnd('\')
  $real = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'opencode-infinite\bin').TrimEnd('\')
  if ($mine -ine $real) { Log ('PATH not changed: this copy uses ' + $mine + ', not the real launcher folder') 'path'; return 'skipped' }
  $cur = [string](Get-UserPath)
  $parts = @($cur -split ';' | Where-Object { $_ -ne '' })
  $stray = @($parts | Where-Object { $_.TrimEnd('\') -ine $mine -and (Test-Path -LiteralPath (Join-Path $_ 'opencodeinf.cmd')) })
  $keep = @($parts | Where-Object { $stray -notcontains $_ })
  $there = [bool]($keep | Where-Object { $_.TrimEnd('\') -ieq $mine })
  if (-not $there) { $keep = @($ShimDir) + $keep }
  $new = $keep -join ';'
  if ($new -ne $cur) { Set-UserPath $new }
  if ($stray.Count) { Log ('removed other launcher folder(s) from PATH: ' + ($stray -join ', ')) 'path' }
  if ($there) { return 'there' }
  return 'added'
}
# Commands on their own, not tied to setup: opencodeinf and opencode-auto, and the bin folder on the user PATH.
function Commands-Install {
  New-Item -ItemType Directory -Force -Path $ShimDir | Out-Null
  $utf8 = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($ShimInfPath, (Shim-Text ''), $utf8)
  [IO.File]::WriteAllText($ShimAutoPath, (Shim-Text '--auto'), $utf8)
  # v3.7: the direct commands come with the others, so opencode-warp is on PATH after one install.
  foreach ($x in @(@('warp', $ShimWarpPath), @('tor', $ShimTorPath), @('proxy', $ShimProxyPath))) { [IO.File]::WriteAllText($x[1], (Shim-Preset $x[0]), $utf8) }
  return (Set-ShimPath)
}
# Main menu > Commands: only two choices, install or remove opencodeinf and opencode-auto. Esc goes back.
# The local name must not be $state: PowerShell names are case-insensitive, and $State is the state folder that Log uses.
function Commands-Menu {
  $have = ((Test-Path -LiteralPath $ShimInfPath) -or (Test-Path -LiteralPath $ShimAutoPath))
  $cstate = $(if ($have) { (T 'installed') } else { (T 'not installed') })
  $items = @(
    @{ L = ($script:I.link + ' ' + (T 'Install commands')); V = $cstate; S = 'ok'; H = 'Write opencodeinf, opencode-auto, opencode-warp, opencode-tor and opencode-proxy, and put their folder on your PATH.' },
    @{ L = ($script:I.err + ' ' + (T 'Remove commands')); V = $cstate; S = 'err'; D = (-not $have); H = 'Delete the same five commands. The folder leaves your PATH when no other launcher file is in it.' })
  $r = Show-Menu 'Commands' $items $null $null 0
  if ($r -eq 0) {
    $res = Commands-Install
    Log ('commands installed from the main menu, PATH ' + $res)
    if ($res -eq 'skipped') { $script:Notice = @('warn', 'PATH not changed: this copy is not the installed launcher.') }
    elseif ($res -eq 'added') { $script:Notice = @('ok', 'Commands installed: opencodeinf and opencode-auto. The folder was added to your PATH. Open a new terminal to use them.') }
    else { $script:Notice = @('ok', 'Commands installed: opencodeinf and opencode-auto.') }
  }
  elseif ($r -eq 1) {
    Remove-Item -LiteralPath $ShimWarpPath, $ShimTorPath, $ShimProxyPath -Force -ErrorAction SilentlyContinue
    $res = Commands-Remove
    Log ('commands removed from the main menu, PATH ' + $res)
    if ($res -eq 'kept') { $script:Notice = @('ok', 'Commands removed. The folder stays on your PATH because other launcher files are in it.') }
    else { $script:Notice = @('ok', 'Commands removed: opencodeinf, opencode-auto, opencode-warp, opencode-tor and opencode-proxy.') }
  }
}
function Commands-Remove {
  Remove-Item -LiteralPath $ShimInfPath, $ShimAutoPath -Force -ErrorAction SilentlyContinue
  # The folder stays on PATH while other files are in it (the opencode command, for example).
  if (@(Get-ChildItem -LiteralPath $ShimDir -File -ErrorAction SilentlyContinue).Count) { return 'kept' }
  $parts = @(([string](Get-UserPath)) -split ';' | Where-Object { $_ -ne '' })
  $keep = @($parts | Where-Object { $_.TrimEnd('\') -ine $ShimDir.TrimEnd('\') })
  if ($keep.Count -ne $parts.Count) { Set-UserPath ($keep -join ';') }
  return 'removed'
}
function Group-Menu([string]$group) {
  $list = @(Group-Keys $group)
  $pos = 0; $msg = $null
  # D03: the three direct commands, kept next to the settings of the group.
  $direct = @(@('warp', $ShimWarpPath), @('tor', $ShimTorPath), @('proxy', $ShimProxyPath))
  while ($true) {
    $items = @()
    foreach ($s in $list) {
      $items += @{ L = $s.Label; V = (Format-Val $s); S = $(if ($script:Cfg.settings.ContainsKey($s.Key)) { 'warn' } else { 'accent' }); H = (Describe-Setting $s) }
    }
    if ($group -eq 'Shortcuts') { $items += Shortcut-Info }
    # v2.44: the manual path is the OC_APP row above; this row forgets the cached search.
    if ($group -eq 'Paths') { $redetAt = $items.Count; $items += @{ L = 'Re-detect desktop app'; H = 'Search for OpenCode.exe again now instead of using the result kept for 10 minutes.' } } else { $redetAt = -2 }
    # D03: install or remove the three direct commands, showing the state they have right now.
    if ($group -eq 'Launch') {
      $have = @($direct | Where-Object { Test-Path -LiteralPath $_[1] } | ForEach-Object { $_[0] })
      $stateTxt = $(if ($have.Count) { 'installed: ' + ($have -join ', ') } else { (T 'not installed') })
      $dirAt = $items.Count; $items += @{ L = 'Install direct commands'; V = $stateTxt; H = 'Write opencode-warp, opencode-tor and opencode-proxy: each one starts opencode with that connection and no menu.' }
      $rmAt = $items.Count; $items += @{ L = 'Remove direct commands'; V = $stateTxt; S = 'err'; D = (-not $have.Count); H = 'Delete only those three commands. opencode and opencodeinf are kept.' }
    } else { $dirAt = -2; $rmAt = -2 }
    # Commands on their own (not tied to setup): opencodeinf and opencode-auto.
    if ($group -eq 'Launch') {
      $cHave = ((Test-Path -LiteralPath $ShimInfPath) -or (Test-Path -LiteralPath $ShimAutoPath))
      $cState = $(if ($cHave) { 'opencodeinf, opencode-auto' } else { (T 'not installed') })
      $cmdAt = $items.Count; $items += @{ L = 'Install commands'; V = $cState; H = 'Write opencodeinf and opencode-auto, and put their folder on your PATH. Does not need Set up connection.' }
      $cmdRmAt = $items.Count; $items += @{ L = 'Remove commands'; V = $cState; S = 'err'; D = (-not $cHave); H = 'Delete opencodeinf and opencode-auto. The folder stays on PATH while other files are in it.' }
    } else { $cmdAt = -2; $cmdRmAt = -2 }
    $backAt = $items.Count
    $items += @{ L = ($script:I.back + ' Back'); H = 'Return to the settings groups.' }
    $head = @(); if ($msg) { $head += $msg; $head += '' }
    $r = Show-Menu ((T 'Settings') + ' - ' + (T $group)) $items 'Changed values are yellow. Enter edits or toggles the selected value.' $head $pos
    if ($r -eq -1 -or $r -eq $backAt) { return }
    $pos = $r
    if ($r -eq $redetAt) { Remove-Item -LiteralPath (Join-Path $State 'desktop_scan.txt') -Force -ErrorAction SilentlyContinue; $msg = (P (Style 'ok') ($script:I.ok + ' ' + (T 'The desktop app will be searched for again.'))); continue }
    if ($r -eq $dirAt) {
      $utf8 = New-Object Text.UTF8Encoding($false)
      New-Item -ItemType Directory -Force -Path $ShimDir | Out-Null
      foreach ($x in $direct) { [IO.File]::WriteAllText($x[1], (Shim-Preset $x[0]), $utf8) }
      Log 'direct commands installed'
      $msg = (P (Style 'ok') ($script:I.ok + ' ' + (T 'Direct commands installed: opencode-warp, opencode-tor, opencode-proxy.')))
      continue
    }
    if ($r -eq $rmAt) {
      if (Confirm-Box (T 'Remove the direct commands?') @('opencode-warp, opencode-tor and opencode-proxy are deleted.', 'opencode and opencodeinf are kept.')) {
        foreach ($x in $direct) { Remove-Item -LiteralPath $x[1] -Force -ErrorAction SilentlyContinue }
        Log 'direct commands removed'
        $msg = (P (Style 'ok') ($script:I.ok + ' ' + (T 'The direct commands were removed.')))
      } else { $msg = (P (Style 'dim') (T 'No change.')) }
      $pos = $dirAt
      continue
    }
    if ($r -eq $cmdAt) {
      $res = Commands-Install
      Log 'commands installed'
      $extra = $(if ($res -eq 'added') { ' ' + (T 'The folder was added to your PATH. Open a new terminal to use them.') } else { '' })
      $msg = (P (Style 'ok') ($script:I.ok + ' ' + (T 'Commands installed: opencodeinf and opencode-auto.') + $extra))
      continue
    }
    if ($r -eq $cmdRmAt) {
      if (Confirm-Box (T 'Remove the commands?') @('opencodeinf and opencode-auto are deleted.', 'opencode and the other launcher files are kept.')) {
        $res = Commands-Remove
        Log 'commands removed'
        $msg = (P (Style 'ok') ($script:I.ok + ' ' + (T 'The commands were removed.')))
      } else { $msg = (P (Style 'dim') (T 'No change.')) }
      $pos = $cmdAt
      continue
    }
    if ($r -ge $list.Count) { continue }
    $s = $list[$r]
    $done = Edit-Setting $s
    if ($done) {
      $m = (P (Style 'ok') ($script:I.ok + ' ' + (Tf 'Saved: {0} = {1}' (T $s.Label) (Format-Val $s))))
      if ($s.Apply -ne 'now') { $m += "`n" + (P (Style 'warn') ($script:I.warn + ' ' + (Tf 'Takes effect at the {0}; a service already running keeps the old value until then.' (T $s.Apply)))) }
      if ($script:FontMsg) { $m += "`n" + (P (Style $script:FontMsg[0]) ($script:I.gear + ' ' + $script:FontMsg[1])); $script:FontMsg = $null }
      $msg = $m
    } else {
      $msg = (P (Style 'dim') (T 'No change.'))
      if ($script:FontMsg) { $msg += "`n" + (P (Style $script:FontMsg[0]) ($script:I.gear + ' ' + $script:FontMsg[1])); $script:FontMsg = $null }
    }
  }
}
# Export: the changed settings only, as one JSON file. Import: every value is checked first, and
# one wrong value stops the whole import, so the settings are never half changed.
function Export-Settings {
  $def = Join-Path ([Environment]::GetFolderPath('Desktop')) 'opencode-infinite-settings.json'
  $t = Read-Text (T 'File to write (Enter = Desktop, Esc = back)') $def
  if ($t -eq '<') { return }
  if ($t -eq '') { $t = $def }
  if ($t -notmatch '\.json$') { $t += '.json' }
  $dir = Split-Path -Parent $t
  if (-not $dir -or -not (Test-Path -LiteralPath $dir -PathType Container)) { Say 'err' (T 'That folder does not exist.'); Wait-Key; return }
  if ((Test-Path -LiteralPath $t) -and -not (Confirm-Box 'Replace the file that is already there?' @($t))) { return }
  $obj = [ordered]@{ format = 'opencode-infinite-settings'; version = 1; settings = [ordered]@{} }
  foreach ($s in $Schema) { if ($script:Cfg.settings.ContainsKey($s.Key)) { $obj.settings[$s.Key] = [string]$script:Cfg.settings[$s.Key] } }
  [IO.File]::WriteAllText($t, ($obj | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding($false)))
  Log ('settings exported: ' + $obj.settings.Count + ' changed')
  Say 'ok' (Tf 'Exported {0} changed setting(s) to {1}' $obj.settings.Count $t)
  Wait-Key
}
function Import-Settings {
  $t = Read-Text (T 'File to read (Esc = back)') ''
  if ($t -eq '<' -or $t -eq '') { return }
  if (-not (Test-Path -LiteralPath $t -PathType Leaf)) { Say 'err' (T 'No file at that path.'); Wait-Key; return }
  $j = $null
  try { $j = Get-Content -LiteralPath $t -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
  if (-not $j -or $j.format -ne 'opencode-infinite-settings' -or -not $j.settings) { Say 'err' (T 'This is not an OpenCode Infinite settings file.'); Wait-Key; return }
  $take = @{}; $bad = @(); $skip = 0
  foreach ($p in $j.settings.PSObject.Properties) {
    $s = Get-Setting $p.Name
    if (-not $s) { $skip++; continue }
    $r = Test-Val $s ([string]$p.Value)
    if ($r.ok) { $take[$p.Name] = $r.v } else { $bad += ($p.Name + ': ' + $r.err) }
  }
  if ($bad.Count) {
    Say 'err' (T 'Nothing was imported. These values are not valid:')
    foreach ($x in $bad) { WL (P (Style 'dim') ('   ' + $x)) }
    Wait-Key; return
  }
  $extra = @(); if ($skip) { $extra = @(Tf '{0} setting(s) of this file are unknown here and are skipped.' $skip) }
  if (-not (Confirm-Box (Tf 'Import {0} setting(s)? Their current values are replaced.' $take.Count) $extra)) { return }
  foreach ($k in $take.Keys) { Set-Val (Get-Setting $k) $take[$k] }
  Init-Ui
  if ($take.ContainsKey('OCUI_LANG')) { $lg = [string]$take['OCUI_LANG']; Fetch-Lang $(if ($lg -eq 'auto') { Detect-Lang } else { $lg }); Init-Ui; Write-I18n }  # v2.39: refresh language after import
  if ($take.ContainsKey('OCUI_FONT') -or $take.ContainsKey('OCUI_FONT_SIZE')) { [void](Apply-Font) }
  Log ('settings imported: ' + $take.Count + ' from ' + $t)
  Say 'ok' (Tf 'Imported {0} setting(s).' $take.Count)
  Wait-Key
}
# the schema rows of one settings group; "Common" is the short list people change most
$CommonKeys = @('OC_EGRESS_DEFAULT', 'OC_MODE_DEFAULT', 'PROXY_LIST_URL', 'AUTO_ROTATE', 'ON_CLOSE', 'OCUI_THEME', 'OCUI_LANG')
function Group-Keys([string]$g) {
  if ($g -eq 'Common') { return @($Schema | Where-Object { $CommonKeys -contains $_.Key }) }
  return @($Schema | Where-Object { $_.Group -eq $g })
}
function Settings-Menu {
  $pos = 0
  while ($true) {
    $items = @(); $acts = @()
    foreach ($g in $Groups) {
      $n = @(Group-Keys $g | Where-Object { $script:Cfg.settings.ContainsKey($_.Key) }).Count
      $items += @{ L = $g; V = $(if ($n) { Tf '{0} changed' $n } else { '' }); S = 'warn'; H = $GroupHelp[$g] }; $acts += $g
    }
    # v3.6: the support report lives here now (it was a main menu row).
    $items += @{ L = ($script:I.link + ' Support report'); H = 'Collect system info, versions, settings and the recent log into one text file you can send for help. Passwords, tokens, your user name and (by default) IPs are removed first.' }; $acts += 'report'
    $items += @{ L = 'Export settings to a file'; H = 'Save every changed setting to one .json file, to keep a backup or copy them to another PC.' }; $acts += 'export'
    $items += @{ L = 'Import settings from a file'; H = 'Load a file made by Export. Every value is checked first; if one is wrong, nothing changes.' }; $acts += 'import'
    $items += @{ L = 'Reset to default values'; S = 'err'; H = 'Put every setting back to its default. Your connection setup (command, shortcuts) is not touched. Asks first.' }; $acts += 'reset'
    # v2.58: uninstall moved here from the home screen; it only appears when a connection is set up
    if (Test-Configured) { $items += @{ L = ($script:I.trash + ' Uninstall the connection'); S = 'err'; H = 'Removes only what the setup added (command, shortcuts, PATH entry) and restores the settings it changed. Backups are kept. Asks first.' }; $acts += 'uninstall' }
    $items += @{ L = ($script:I.back + ' Back'); H = 'Return to the main menu.' }; $acts += 'back'
    $r = Show-Menu ($script:I.gear + ' ' + (T 'Settings')) $items (Tf 'Every change is saved at once to {0}' $CfgPath) $null $pos
    if ($r -eq -1) { return }
    $pos = $r
    switch ($acts[$r]) {
      'back' { return }
      'report' { Show-Report }
      'export' { Export-Settings }
      'import' { Import-Settings }
      'uninstall' { Do-Uninstall; if (-not (Test-Configured)) { return } }
      'reset' {
        if (Confirm-Box 'Reset every setting to its default?' @('Your connection setup (shim, shortcuts) is not touched.')) {
          $script:Cfg.settings = @{}; Save-Cfg; Init-Ui
          Fetch-Lang (Detect-Lang); Init-Ui; Write-I18n  # v2.39: refresh language after reset
          Log 'settings reset to defaults'
          [void](Apply-Font)
        }
      }
      default { Group-Menu $acts[$r] }
    }
  }
}

# ---------------------------------------------------------------- setup / status / renew / uninstall
function Test-Configured { return (($script:Cfg.setup -is [hashtable]) -and ($script:Cfg.setup.done -eq $true) -and (Test-Path -LiteralPath $ShimPath) -and (Test-Path -LiteralPath $ShimInfPath)) }
function Get-UserPath {
  if ($env:OC_TUI_FAKEPATH) { if (Test-Path -LiteralPath $env:OC_TUI_FAKEPATH) { return [string](Get-Content -LiteralPath $env:OC_TUI_FAKEPATH -Raw).Trim() } return '' }
  # v2.40: the raw registry value. GetEnvironmentVariable expands %VAR% entries, and writing that back flattened them.
  $k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')
  try { if ($k) { return [string]$k.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } return '' } finally { if ($k) { $k.Close() } }
}
function Set-UserPath([string]$v) {
  if ($env:OC_TUI_FAKEPATH) { [IO.File]::WriteAllText($env:OC_TUI_FAKEPATH, $v); return }
  # v2.40: written as REG_EXPAND_SZ (SetEnvironmentVariable writes REG_SZ). Deleting a variable that does not exist
  # still broadcasts WM_SETTINGCHANGE, which is what makes new windows see the change.
  $k = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
  try { $k.SetValue('Path', $v, [Microsoft.Win32.RegistryValueKind]::ExpandString) } finally { $k.Close() }
  [Environment]::SetEnvironmentVariable('OC_PATH_NOTIFY', $null, 'User')
}
function Get-LinkDirs {
  if ($env:OC_TUI_LNKDIRS) { return @($env:OC_TUI_LNKDIRS -split ';') }
  return @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
}
function Remove-PathEntry([string]$dir) {
  $p = Get-UserPath
  $parts = @($p -split ';' | Where-Object { $_ -and ($_.TrimEnd('\') -ine $dir.TrimEnd('\')) })
  Set-UserPath ($parts -join ';')
}
# v2.58: one source picker for the setup and for Settings > Proxy list. Returns the URL, or '<' for Back.
function Pick-ProxySource([string]$title) {
  $cur = [string](Get-Val 'PROXY_LIST_URL')
  $srcs = @(
    @{ L = 'ProxyScrape'; V = 'default'; u = 'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&protocol=http&proxy_format=protocolipport&format=text'; H = 'The free ProxyScrape HTTP list, the launcher default.' },
    @{ L = 'proxifly'; V = 'GitHub list'; u = 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/http/data.txt'; H = 'proxifly free-proxy-list: plain ip:port lines, refreshed every 5 minutes, no key.' },
    @{ L = 'GeoNode'; V = 'API, HTTP only'; u = 'https://proxylist.geonode.com/api/proxy-list?page=1&limit=500&sort_by=responseTime&sort_type=asc&protocols=http'; H = 'GeoNode API: up to 500 HTTP proxies, fastest first.' },
    @{ L = 'monosans'; V = 'GitHub list'; u = 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt'; H = 'monosans proxy-list: plain ip:port lines, HTTP only.' },
    @{ L = 'TheSpeedX'; V = 'GitHub list'; u = 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt'; H = 'TheSpeedX PROXY-List: plain ip:port lines, HTTP only.' },
    @{ L = 'Your own list'; V = 'URL or file'; u = ''; H = 'A URL or a local file of your own.' }
  )
  # the highlight starts on the list in use, so Enter keeps it
  $start = 0
  for ($k = 0; $k -lt $srcs.Count; $k++) { if ($srcs[$k].u -and $srcs[$k].u -eq $cur) { $start = $k } }
  $pr = Show-Menu $title ($srcs + @(@{ L = ($script:I.back + ' Back'); H = 'Go back without changing the list.' })) 'Public proxies can see the traffic that goes through them. Each one is tested before use.' $null $start
  if ($pr -eq -1 -or $pr -eq $srcs.Count) { return '<' }
  if ($srcs[$pr].u) { return [string]$srcs[$pr].u }
  return [string](Ask-Setting 'PROXY_LIST_URL' 'Proxies')
}
function Pick-Method {
  $opts = @(
    @{ L = 'WARP'; V = 'Cloudflare WARP'; m = 'WARP'; H = 'Cloudflare WARP in local proxy mode. Every rotation asks for a new registration, which gives a new exit IP. Needs the WARP client (offered if missing).' },
    @{ L = 'TOR'; V = 'Portable Tor'; m = 'TOR'; H = 'Tor is downloaded once, run hidden and offered to opencode through a built-in HTTP bridge. Slower, but a new circuit is a new IP.' },
    @{ L = 'PROXY'; V = 'Free or your own list'; m = 'PROXY'; H = 'Public HTTP proxies from a list: ProxyScrape, proxifly (GitHub) or your own. Each one is tested first and burned ones are skipped.' },
    @{ L = 'NONE'; V = 'Direct, no proxy'; m = 'NONE'; H = 'No proxy: opencode uses your real connection and nothing is rotated.' },
    @{ L = 'WIREGUARD'; V = 'wireproxy'; m = 'WIREGUARD'; H = 'Your WireGuard .conf files through wireproxy, a local proxy that only opencode uses. No administrator prompt.' },
    @{ L = 'VPNGATE'; V = 'OpenVPN'; m = 'VPNGATE'; H = 'VPN Gate servers through OpenVPN. Only opencode''s hosts go through the tunnel. Administrator prompt.' })
  # v2.58: the highlight starts on the method already set up, or on Cancel, never on WARP. Enter on a fresh start cancels.
  $cur = [string](Get-Val 'OC_EGRESS_DEFAULT'); $start = $opts.Count
  for ($k = 0; $k -lt $opts.Count; $k++) { if ($opts[$k].m -eq $cur) { $start = $k } }
  $r = Show-Menu 'Setup 1/2 - connection method' ($opts + @(@{ L = ($script:I.back + ' Cancel'); H = 'Leave the setup without changing anything.' })) 'The proxy lives only in the opencode process; the rest of the system stays direct.' $null $start
  if ($r -eq -1 -or $r -ge $opts.Count) { return $null }
  return $opts[$r].m
}
function Ask-Setting([string]$key, [string]$step) {
  $s = Get-Setting $key
  while ($true) {
    $t = Read-Text ((T $step) + ' ' + (T $s.Label) + ' - ' + (T $s.Help)) ([string](Get-Val $key))
    if ($t -eq '<') { return '<' }
    if ($t -eq '') { return [string](Get-Val $key) }
    $r = Test-Val $s $t
    if ($r.ok) { return $r.v }
    Say 'err' $r.err
  }
}
# The command file. It runs the fixed launcher copy; when that copy is gone it offers a fresh download.
function Shim-Text([string]$arg) {
  $dir = Split-Path -Parent $Official
  $l = @('@echo off', 'rem Added by OpenCode-Infinite setup. Uninstall in the launcher removes it.',
    ('if exist "' + $Official + '" goto go'),
    ('echo OpenCode-Infinite is not installed at: ' + ($Official -replace '([&|<>^])', '^$1')),
    'choice /c YN /n /m "Download it again now? "', 'if errorlevel 2 exit /b 1',
    ('if not exist "' + $dir + '" mkdir "' + $dir + '"'),
    ('curl.exe -fsSL -o "' + $Official + '.tmp" "' + $RawUrl + '" && move /y "' + $Official + '.tmp" "' + $Official + '" >nul'),
    ('if not exist "' + $Official + '" (echo Download failed. Check the connection and run this command again. & exit /b 1)'),
    ':go', ('call "' + $Official + '" ' + $arg + ' %*'), 'exit /b %errorlevel%')
  return (($l -join "`r`n") + "`r`n")
}
# The OpenCode that was installed before the launcher: the first opencode on PATH outside the launcher's folder.
function Find-Original-Oc {
  # v2.59: a temp copy (scratchpad, another session) is never the real install; the shim must not point into %TEMP%.
  $tmp = ([string]$env:TEMP).TrimEnd('\') + '\'
  $c = @(Get-Command opencode -All -ErrorAction SilentlyContinue | Where-Object { $_.Source -match '\.(exe|cmd)$' -and -not $_.Source.StartsWith($ShimDir, [StringComparison]::OrdinalIgnoreCase) -and -not $_.Source.StartsWith($tmp, [StringComparison]::OrdinalIgnoreCase) })
  if ($c.Count) { return [string]$c[0].Source }
  $saved = Join-Path ([string]$env:OC_STATE) 'opencode_path.txt'
  if (Test-Path -LiteralPath $saved) { $s = [string](Get-Content -LiteralPath $saved -TotalCount 1); if ($s -and (Test-Path -LiteralPath $s) -and -not $s.StartsWith($tmp, [StringComparison]::OrdinalIgnoreCase)) { return $s } }
  return ''
}
function Shim-Original([string]$exe) {
  if (-not $exe) { return "@echo off`r`necho OpenCode was not found outside the launcher. Run opencodeinf to install it.`r`nexit /b 1`r`n" }
  return "@echo off`r`nrem Original OpenCode: no launcher and no connection change.`r`n`"$exe`" %*`r`nexit /b %errorlevel%`r`n"
}
# D02: body of a direct command: start the official launcher with that preset and
# pass on the caller's arguments and exit code.
function Shim-Preset([string]$flag) {
  return "@echo off`r`ncall `"$Official`" --preset $flag --here --quiet %*`r`nexit /b %errorlevel%`r`n"
}
# Keeps the commands current: "opencode" is always the real OpenCode, never the launcher, and the
# shortcuts open opencodeinf. Runs at every start, so installs made by older versions are fixed too.
function Refresh-Shims {
  if (-not (Test-Configured)) { return }
  try {
    $utf8 = New-Object Text.UTF8Encoding($false)
    $orig = Shim-Original (Find-Original-Oc)
    foreach ($p in @($ShimPath)) {
      $cur = ''
      if (Test-Path -LiteralPath $p) { $cur = [IO.File]::ReadAllText($p) }
      if ($cur -ne $orig) { [IO.File]::WriteAllText($p, $orig, $utf8) }
    }
    # D02: a direct command that exists is kept current; one the operator deleted
    # is not created again here.
    foreach ($x in @(@('warp', $ShimWarpPath), @('tor', $ShimTorPath), @('proxy', $ShimProxyPath))) {
      if (-not (Test-Path -LiteralPath $x[1])) { continue }
      $pw = Shim-Preset $x[0]
      $pc = [IO.File]::ReadAllText($x[1])
      if ($pc -ne $pw) { [IO.File]::WriteAllText($x[1], $pw, $utf8) }
    }
    # v3.1 (N87): opencodeinf was never repaired, so the shortcut pointed at a file
    # that did not exist after an antivirus removed it. It is rewritten when missing.
    if (-not (Test-Path -LiteralPath $ShimInfPath)) { [IO.File]::WriteAllText($ShimInfPath, (Shim-Text ''), $utf8) }
    if (-not (Test-Path -LiteralPath $ShimAutoPath)) { [IO.File]::WriteAllText($ShimAutoPath, (Shim-Text '--auto'), $utf8) }
    $want = '/d /k ""' + $ShimInfPath + '""'
    $wsh = New-Object -ComObject WScript.Shell
    foreach ($l in @($script:Cfg.setup.shortcuts)) {
      if (-not $l -or -not (Test-Path -LiteralPath $l)) { continue }
      $sc = $wsh.CreateShortcut($l)
      if ($sc.Arguments -ne $want) { $sc.Arguments = $want; $sc.Save() }
    }
  } catch { Log ('shim refresh: ' + $_.Exception.Message) 'error' }
}
function Run-Setup {
  Log 'setup start'
  $ans = @{}
  $step = 0
  $method = $null
  while ($true) {
    if ($step -eq 0) {
      $method = Pick-Method
      if (-not $method) { return $false }
      foreach ($k in @($ans.Keys)) { if ($k -ne 'OC_EGRESS_DEFAULT') { $ans.Remove($k) } }
      $ans['OC_EGRESS_DEFAULT'] = $method
      $step = 1; continue
    }
    if ($step -eq 1) {
      $opts = @(@{ L = 'CLI'; V = 'terminal'; m = 'CLI'; H = 'The terminal interface. The opencode command and the shortcut open it.' }, @{ L = 'Desktop'; V = 'OpenCode app'; m = 'DESKTOP'; H = 'The OpenCode desktop app; it is restarted after every new IP.' }, @{ L = 'Ask every time'; V = ''; m = 'ASK'; H = 'Show the CLI or Desktop choice every time the launcher opens.' })
      $r = Show-Menu 'Setup 2/2 - run mode' ($opts + @(@{ L = ($script:I.back + ' Back'); H = 'Return to the connection method.' })) 'The opencode command and the shortcut open this mode. Ask every time uses the CLI there. Ports and the proxy list are set in Settings.'
      if ($r -eq -1 -or $r -eq 3) { $step = 0; continue }
      $ans['OC_MODE_DEFAULT'] = $opts[$r].m
      $step = 2; continue
    }
    if ($step -eq 2) {
      $head = @((P (Style 'title') (T 'Review')), '')
      foreach ($k in $ans.Keys) { $head += ('   ' + (Pad (T (Get-Setting $k).Label) 26) + ' ' + (P (Style 'accent') ([string]$ans[$k]))) }
      $head += ''
      $head += (P (Style 'dim') ('   ' + (T 'Adds: the opencode and opencodeinf commands, two shortcuts, one PATH entry. Backups are kept.')))
      # Each answer can be changed from here. Ports and the proxy list are changed in Settings.
      $rows = @(
        @{ L = 'Connection method'; V = [string]$ans['OC_EGRESS_DEFAULT']; H = 'Choose the method again.' },
        @{ L = 'Run mode'; V = [string]$ans['OC_MODE_DEFAULT']; H = 'Choose CLI, Desktop or ask every time.' },
        @{ L = ($script:I.ok + ' Apply'); S = 'ok'; H = 'Save the settings, create the opencode command, the shortcuts and the PATH entry, then test the connection.' },
        @{ L = ($script:I.back + ' Back'); H = 'Change the run mode.' })
      $r = Show-Menu 'Apply setup' $rows '' $head 2
      if ($r -eq 0) { $step = 0; continue }
      if ($r -eq 1) { $step = 1; continue }
      if ($r -eq 3 -or $r -eq -1) { $step = 1; continue }
      break
    }
  }
  Clear-Screen
  WL (P (Style 'title') ($script:I.link + ' ' + (T 'Connecting opencode')))
  WL ''
  $total = 6; $n = 0
  try {
    # 1 backup
    $n++; Progress $n $total 'Backing up the current configuration'
    New-Item -ItemType Directory -Force -Path $BackDir | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    if (Test-Path -LiteralPath $CfgPath) { Copy-Item -LiteralPath $CfgPath -Destination (Join-Path $BackDir ('config-' + $stamp + '.json')) -Force }
    $pathBk = Join-Path $BackDir 'user_path.txt'
    if (-not (Test-Path -LiteralPath $pathBk)) { [IO.File]::WriteAllText($pathBk, (Get-UserPath)) }
    $touched = @{}
    if ($script:Cfg.setup -is [hashtable] -and $script:Cfg.setup.touched -is [hashtable]) { $touched = $script:Cfg.setup.touched }
    foreach ($k in $ans.Keys) {
      if (-not $touched.ContainsKey($k)) { if ($script:Cfg.settings.ContainsKey($k)) { $touched[$k] = $script:Cfg.settings[$k] } else { $touched[$k] = $null } }
    }
    # 2 save
    $n++; Progress $n $total 'Saving config.json'
    foreach ($k in $ans.Keys) { Set-Val (Get-Setting $k) $ans[$k] }
    # 3 shim
    $n++; Progress $n $total 'Creating the opencode command'
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Official) | Out-Null
    if ($Self -ne $Official) { Copy-Item -LiteralPath $Self -Destination $Official -Force }
    New-Item -ItemType Directory -Force -Path $ShimDir | Out-Null
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($ShimPath, (Shim-Original (Find-Original-Oc)), $utf8)
    [IO.File]::WriteAllText($ShimInfPath, (Shim-Text ''), $utf8)
    [IO.File]::WriteAllText($ShimAutoPath, (Shim-Text '--auto'), $utf8)
    # 4 shortcuts
    $n++; Progress $n $total 'Creating shortcuts'
    $made = @()
    $wsh = New-Object -ComObject WScript.Shell
    foreach ($dir in (Get-LinkDirs)) {
      if (-not $dir) { continue }
      $lnk = Join-Path $dir 'OpenCode Infinite (egress).lnk'
      $sc = $wsh.CreateShortcut($lnk)
      $sc.TargetPath = $env:SystemRoot + '\System32\cmd.exe'
      $sc.Arguments = '/d /k ""' + $ShimInfPath + '""'
      $sc.WorkingDirectory = $env:USERPROFILE
      $sc.Description = 'OpenCode Infinite: the launcher menu (opencodeinf)'
      $ico = Join-Path $env:LOCALAPPDATA 'Programs\ai.opencode.desktop\OpenCode.exe'
      if (Test-Path -LiteralPath $ico) { $sc.IconLocation = $ico }
      $sc.Save()
      $made += $lnk
    }
    # 5 PATH
    $n++; Progress $n $total 'Adding the command to your PATH'
    $pathAdded = $false
    $pr = Set-ShimPath
    if ($pr -eq 'added' -or ($pr -eq 'there' -and $script:Cfg.setup.pathAdded -eq $true)) { $pathAdded = $true }
    $script:Cfg.setup = @{ done = $true; method = $method; launcher = $Official; shim = $ShimPath; shimInf = $ShimInfPath; shortcuts = $made; pathAdded = $pathAdded; touched = $touched; createdUtc = (Get-Date).ToUniversalTime().ToString('o'); verified = $false }
    Save-Cfg
    Log ('setup applied: method ' + $method + ', shim ' + $ShimPath)
  } catch {
    Log ('setup stopped: ' + $_.Exception.Message) 'error'
    Say 'err' (Tf 'Setup stopped: {0}' $_.Exception.Message)
    Say 'warn' 'Nothing was left half done that Uninstall cannot remove. Fix the problem and run setup again.'
    Wait-Key; return $false
  }
  # 6 verify
  $n++; Progress $n $total 'Checking that it works'
  $rc = Run-Child 'Checking the connection' '--verify' (Join-Path $State 'verify.log') 300
  Log ('setup verify rc=' + $rc)
  WL ''
  if ($rc -eq 0) {
    $script:Cfg.setup.verified = $true; $script:Cfg.setup.verifiedUtc = (Get-Date).ToUniversalTime().ToString('o'); Save-Cfg
    Remove-Item -LiteralPath (Join-Path $State 'renew_needed.txt') -Force -ErrorAction SilentlyContinue
    Say 'ok' (Tf 'Connected: opencode now starts through {0}.' $method)
  } else {
    Say 'err' (Tf 'The check failed (code {0}). Setup is saved; fix the cause and use Renew or Connect again.' $rc)
    Show-LogTail (Join-Path $State 'verify.log') 8
  }
  WL ''
  Say 'ok' 'Type "opencode" in a NEW terminal, or use the "OpenCode Infinite (egress)" shortcut.'
  Wait-Key
  return $true
}
# v3.6: Status lists every method and command with installed or not installed. Enter on a
# missing one installs it; an installed one has nothing to do. Auto uses the installed methods.
function Method-Found {
  $w = $null; $t = $null
  foreach ($b in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:ProgramW6432, $env:LOCALAPPDATA)) {
    if ($b -and -not $w) { $p = Join-Path $b 'Cloudflare\Cloudflare WARP\warp-cli.exe'; if (Test-Path -LiteralPath $p) { $w = $p } }
  }
  $td = Join-Path $env:LOCALAPPDATA 'opencode-infinite\tor'
  if (Test-Path -LiteralPath $td) { $tf = Get-ChildItem -LiteralPath $td -Recurse -Filter tor.exe -ErrorAction SilentlyContinue | Select-Object -First 1; if ($tf) { $t = $tf.FullName } }
  return @{ WARP = $w; TOR = $t }
}
function Show-Status {
  $pos = 0; $msg = $null
  while ($true) {
    $found = Method-Found
    $cmdOk = ((Test-Path -LiteralPath $ShimInfPath) -and (Test-Path -LiteralPath $ShimAutoPath))
    $dirOk = ((Test-Path -LiteralPath $ShimWarpPath) -and (Test-Path -LiteralPath $ShimTorPath) -and (Test-Path -LiteralPath $ShimProxyPath))
    $rows = @(
      @{ L = 'WARP'; Ok = [bool]$found.WARP; A = 'none'; B = 'setup'; H = 'Cloudflare WARP: the fastest method, with a new IP on each renewal. Missing: Enter runs the setup, which installs it (admin once).' },
      @{ L = 'Tor'; Ok = [bool]$found.TOR; A = 'none'; B = 'setup'; H = 'Tor: free, no account, slowest to connect. Missing: Enter runs the setup, which downloads it once.' },
      @{ L = 'Proxy list'; Ok = $true; A = 'none'; B = 'none'; H = 'Free HTTP proxies from the list. Nothing to install; it needs internet to fetch the list.' },
      @{ L = 'opencode command'; Ok = (Test-Path -LiteralPath $ShimPath); A = 'none'; B = 'setup'; H = 'The opencode command that starts OpenCode with your connection. Missing: Enter runs the setup to repair it.' },
      @{ L = 'opencodeinf, opencode-auto'; Ok = $cmdOk; A = 'none'; B = 'commands'; H = 'The launcher commands. Missing: Enter writes them and adds their folder to PATH.' },
      @{ L = 'opencode-warp, -tor, -proxy'; Ok = $dirOk; A = 'none'; B = 'direct'; H = 'One command per connection, no menu. Missing: Enter writes all three.' },
      @{ L = 'Connection setup'; Ok = (Test-Configured); A = 'setup'; B = 'setup'; H = 'The guided setup: method, command and shortcuts. Enter runs it again to change the method.' },
      @{ L = 'Support report'; Ok = $true; A = 'report'; B = 'report'; H = 'Collect system info, versions, settings and the recent log into one text file you can send for help.' }
    )
    $items = @(); $acts = @()
    foreach ($row in $rows) {
      $items += @{ L = $row.L; V = $(if ($row.A -eq 'report') { '' } elseif ($row.Ok) { (T 'installed') } else { (T 'not installed') }); S = $(if ($row.Ok) { 'ok' } else { 'warn' }); H = $row.H }
      $acts += $(if ($row.Ok) { $row.A } else { $row.B })
    }
    $backAt = $items.Count
    $items += @{ L = ($script:I.back + ' Back'); H = 'Return to the main menu.' }; $acts += 'back'
    $head = @(); if ($msg) { $head += $msg; $head += '' }
    $r = Show-Menu ($script:I.link + ' ' + (T 'Status')) $items 'Installed methods are the ones Auto can use. Enter on a missing one installs it.' $head $pos
    if ($r -eq -1 -or $r -eq $backAt) { return }
    $pos = $r; $msg = $null
    switch ($acts[$r]) {
      'setup' { [void](Run-Setup) }
      'commands' { [void](Commands-Install); $msg = (P (Style 'ok') ($script:I.ok + ' ' + (T 'Commands installed: opencodeinf and opencode-auto.'))) }
      'direct' {
        $utf8 = New-Object Text.UTF8Encoding($false)
        New-Item -ItemType Directory -Force -Path $ShimDir | Out-Null
        foreach ($x in @(@('warp', $ShimWarpPath), @('tor', $ShimTorPath), @('proxy', $ShimProxyPath))) { [IO.File]::WriteAllText($x[1], (Shim-Preset $x[0]), $utf8) }
        $msg = (P (Style 'ok') ($script:I.ok + ' ' + (T 'Direct commands installed: opencode-warp, opencode-tor, opencode-proxy.')))
      }
      'report' { Show-Report }
      'none' { $msg = (P (Style 'dim') (T 'Already installed. Nothing to do.')) }
    }
  }
}
function Do-Renew {
  if (-not (Confirm-Box 'Renew the session?' @('Closes the opencode this launcher started.', 'Your saved tokens and the cache are kept.', 'Gets a new IP / WARP registration / Tor circuit / proxy.'))) { return }
  Clear-Screen
  WL (P (Style 'title') ($script:I.renew + ' ' + (T 'Renewing')))
  $log = Join-Path $State 'renew.log'
  Log 'renew start'
  $rc = Run-Child 'Renewing the session' '--renew' $log 420
  Log ('renew rc=' + $rc)
  WL ''
  if ($rc -eq 0) {
    Remove-Item -LiteralPath (Join-Path $State 'renew_needed.txt') -Force -ErrorAction SilentlyContinue
    Say 'ok' 'Renewed. Open opencode again.'
  } else {
    Say 'err' (Tf 'Renew did not finish (code {0}).' $rc)
    Show-LogTail $log 8
    # v2.55 (N85): renew.log carries the failed step, not the daemon's own answer; wcli.log has it.
    Show-LogTail (Join-Path $State 'wcli.log') 4
    Say 'warn' 'Try again in a minute, or pick another connection method in Connect with opencode.'
  }
  Wait-Key
}
function Do-Uninstall {
  $s = $script:Cfg.setup
  if (-not (Confirm-Box 'Uninstall the opencode connection?' @('Removes only what setup added: the opencode command, the shortcuts and the PATH entry.', 'Restores the settings setup changed. Your other settings and your opencode files are kept.'))) { return }
  Clear-Screen
  WL (P (Style 'title') ($script:I.trash + ' ' + (T 'Uninstalling')))
  WL ''
  $total = 4; $n = 0
  try {
    $n++; Progress $n $total 'Removing shortcuts'
    foreach ($l in @($s.shortcuts)) { if ($l -and (Test-Path -LiteralPath $l)) { Remove-Item -LiteralPath $l -Force } }
    $n++; Progress $n $total 'Removing the opencode command'
    if (Test-Path -LiteralPath $ShimPath) { Remove-Item -LiteralPath $ShimPath -Force }
    if (Test-Path -LiteralPath $ShimInfPath) { Remove-Item -LiteralPath $ShimInfPath -Force }
    if (Test-Path -LiteralPath $ShimAutoPath) { Remove-Item -LiteralPath $ShimAutoPath -Force }
    # D04: the three direct commands are part of what the launcher put in bin, so an
    # uninstall takes them too. A missing one is not an error.
    foreach ($x in @($ShimWarpPath, $ShimTorPath, $ShimProxyPath)) {
      if (Test-Path -LiteralPath $x) { Remove-Item -LiteralPath $x -Force }
    }
    if ($Self -ne $Official -and (Test-Path -LiteralPath $Official)) { Remove-Item -LiteralPath $Official -Force; Remove-Item -LiteralPath (Split-Path -Parent $Official) -Force -ErrorAction SilentlyContinue }
    if ((Test-Path -LiteralPath $ShimDir) -and -not (Get-ChildItem -LiteralPath $ShimDir -Force)) { Remove-Item -LiteralPath $ShimDir -Force }
    $n++; Progress $n $total 'Restoring PATH'
    if ($s.pathAdded -eq $true) { Remove-PathEntry $ShimDir }
    $n++; Progress $n $total 'Restoring settings'
    if ($s.touched -is [hashtable]) {
      foreach ($k in $s.touched.Keys) {
        if ($null -eq $s.touched[$k]) { [void]$script:Cfg.settings.Remove($k) } else { $script:Cfg.settings[$k] = $s.touched[$k] }
      }
    }
    $script:Cfg.setup = @{}
    Save-Cfg
    Init-Ui
    WL ''
    Say 'ok' (Tf 'Uninstalled. Backups stay in {0}' $BackDir)
    Log 'uninstalled'
  } catch { Log ('uninstall stopped: ' + $_.Exception.Message) 'error'; Say 'err' (Tf 'Uninstall stopped: {0}' $_.Exception.Message) }
  Wait-Key
}


# ---------------------------------------------------------------- activity log and support report
# launcher.log is the one place every part of the launcher writes to (the batch through :log, this UI
# through Log). The support report gathers it with the system, versions and settings into one text file.
function Safe-Val($key) {
  $s = Get-Setting $key
  $v = [string](Get-Val $key)
  if ($s.Type -eq 'listsrc' -or $s.Type -eq 'url') {
    $v = $v -replace '(://)[^/\s:@]+:[^/\s@]+@', '$1***@'
    $v = $v -replace '\?.*$', '?...'
  }
  return $v
}
function Probe-Cmd([string]$exe, [string]$cmdArgs, [int]$ms = 6000) {
  try {
    $psi = New-Object Diagnostics.ProcessStartInfo
    if ($exe -match '\.(cmd|bat)$') { $psi.FileName = $env:SystemRoot + '\System32\cmd.exe'; $psi.Arguments = '/d /s /c ""' + $exe + '" ' + $cmdArgs + '"' }
    else { $psi.FileName = $exe; $psi.Arguments = $cmdArgs }
    $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.RedirectStandardInput = $true
    $p = [Diagnostics.Process]::Start($psi)
    # v3.1 (N48): a child that had already exited made Close() throw and the tool read as
    # "(could not run)". Kill now waits and every path disposes the process.
    try { $p.StandardInput.Close() } catch { }
    $out = $p.StandardOutput.ReadToEndAsync(); $err = $p.StandardError.ReadToEndAsync()
    if (-not $p.WaitForExit($ms)) { try { $p.Kill(); [void]$p.WaitForExit(2000) } catch { }; try { $p.Dispose() } catch { }; return ('(no answer in ' + [int]($ms / 1000) + 's)') }
    $t = ([string]$out.Result + ' ' + [string]$err.Result).Trim()
    if (-not $t) { try { $p.Dispose() } catch { }; return '(no output)' }
    return ((@($t -split '\r?\n' | Where-Object { $_.Trim() } | Select-Object -First 3)) -join ' | ')
  } catch { return ('(could not run: ' + $_.Exception.Message + ')') }
}
function Redact([string]$text) {
  $t = $text
  $up = [string]$env:USERPROFILE
  if ($up) { $t = [regex]::Replace($t, [regex]::Escape($up), '%USERPROFILE%', 'IgnoreCase') }
  foreach ($pair in @(@($env:USERNAME, '<user>'), @($env:COMPUTERNAME, '<pc>'))) {
    if ($pair[0] -and ([string]$pair[0]).Length -ge 3) { $t = [regex]::Replace($t, '\b' + [regex]::Escape([string]$pair[0]) + '\b', $pair[1], 'IgnoreCase') }
  }
  # v3.1 (N49): header credentials and user:pass@host without a scheme reached the report.
  $t = [regex]::Replace($t, '(?im)^(\s*(?:Proxy-)?Authorization:\s*)\S.*$', '$1<redacted>')
  $t = [regex]::Replace($t, '(?<![\w:/@.-])[\w.~%+-]+:[^\s@/]+@(?=[\w.\[\]:-]+)', '***@')
  $t = [regex]::Replace($t, '(://)[^/\s:@]+:[^/\s@]+@', '$1***@')
  $t = [regex]::Replace($t, '[\w.+-]+@[\w-]+\.[\w.-]+', '<email>')
  $t = [regex]::Replace($t, '(?i)(bearer\s+)[A-Za-z0-9._~+/=-]{12,}', '$1<token>')
  $t = [regex]::Replace($t, '\b(?:sk|pk|ghp|gho|ghu|ghs|xox[bap])[-_][A-Za-z0-9_-]{16,}\b', '<token>')
  $t = [regex]::Replace($t, 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}', '<jwt>')
  $t = [regex]::Replace($t, '(?i)([?&](?:key|token|api_key|apikey|auth|password|pass|secret)=)[^&\s"]+', '$1***')
  $t = [regex]::Replace($t, '(?im)^\s*(ID|Device ID|Account ID|License|Public key):\s*\S+', '$1: <redacted>')
  if ([int](Get-Val 'LOG_MASK_IP') -eq 1) {
    $ev = [Text.RegularExpressions.MatchEvaluator] {
      param($m)
      $o = @($m.Groups[1].Value, $m.Groups[2].Value, $m.Groups[3].Value, $m.Groups[4].Value) | ForEach-Object { [int]$_ }
      if (($o | Where-Object { $_ -gt 255 }).Count) { return $m.Value }
      if ($o[0] -eq 127 -or $o[0] -eq 10 -or $o[0] -eq 0 -or $o[0] -eq 255 -or ($o[0] -eq 192 -and $o[1] -eq 168) -or ($o[0] -eq 172 -and $o[1] -ge 16 -and $o[1] -le 31) -or ($o[0] -eq 169 -and $o[1] -eq 254)) { return $m.Value }
      return ([string]$o[0] + '.' + [string]$o[1] + '.x.x')
    }
    $lines = @()
    foreach ($l in ($t -split "`r?`n")) {
      $lines += [regex]::Replace($l, '(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.])', $ev)
    }
    $t = $lines -join "`r`n"
    $t = [regex]::Replace($t, '\b(?:[0-9A-Fa-f]{1,4}:){5,7}[0-9A-Fa-f]{1,4}\b|\b(?:[0-9A-Fa-f]{1,4}:){1,6}:(?:[0-9A-Fa-f]{1,4})?\b', '<ipv6>')
  }
  return $t
}
function Tail-Of([string]$path, [int]$n) {
  if (-not (Test-Path -LiteralPath $path)) { return '(missing)' }
  $t = @(Get-Content -LiteralPath $path -Tail $n -ErrorAction SilentlyContinue)
  if (-not $t.Count) { return '(empty)' }
  return ($t -join "`r`n")
}
function Safe-Section([scriptblock]$body, $A) {
  try { & $body } catch { & $A ('(this section failed: ' + $_.Exception.Message + ')'); Log ('report section failed: ' + $_.Exception.Message) 'error' }
}
function New-Report {
  $sb = New-Object Text.StringBuilder
  $A = { param($s) [void]$sb.AppendLine([string]$s) }
  $H = { param($s) [void]$sb.AppendLine(''); [void]$sb.AppendLine('=== ' + $s + ' ==='); }
  $noProbe = [bool]$env:OC_TUI_NOPROBE
  $total = 6
  & $A 'OpenCode Infinite - support report'
  & $A ('Generated   ' + (Get-Date).ToString('o'))
  & $A 'Launcher    v2.60.19'
  & $A ('File        ' + $Self)
  try { $fi = Get-Item -LiteralPath $Self; & $A ('Size/date   ' + $fi.Length + ' bytes, ' + $fi.LastWriteTime.ToString('s')); & $A ('SHA-256     ' + (Get-FileHash -LiteralPath $Self -Algorithm SHA256).Hash) } catch { }
  & $A 'Personal data (user name, PC name, e-mails, tokens, passwords, and by default public IPs) is removed from this file. Read it before sharing.'

  Progress 1 $total 'System'
  & $H 'System'
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    & $A ('Windows     ' + $os.Caption + ' ' + $os.Version + ' (build ' + $os.BuildNumber + ') ' + $os.OSArchitecture)
  } catch { & $A 'Windows     (unknown)' }
  & $A ('PowerShell  ' + $PSVersionTable.PSVersion + '   process arch ' + $env:PROCESSOR_ARCHITECTURE)
  & $A ('Culture     ' + (Get-Culture).Name + ' / UI ' + (Get-UICulture).Name + '   time zone ' + (Get-TimeZone).Id)
  $term = 'classic console'
  if ($env:WT_SESSION) { $term = 'Windows Terminal' } elseif ($env:TERM_PROGRAM) { $term = $env:TERM_PROGRAM } elseif ($env:VSCODE_PID) { $term = 'VS Code' }
  & $A ('Terminal    ' + $term + '   code page ' + [Console]::OutputEncoding.CodePage + '   colors ' + $script:Color + '   icons ' + $script:IconMode + '   width ' + $script:Width)
  & $A ('Elevated    ' + ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))

  Progress 2 $total 'Tools and versions'
  & $H 'Tools and versions'
  Safe-Section {
  if ($noProbe) { & $A '(tool probes skipped)' } else {
    $oc = @(Get-Command opencode, opencode.cmd, opencode.exe -All -ErrorAction SilentlyContinue | Where-Object { $_.Source -match '\.(exe|cmd|bat)$' } | Select-Object -ExpandProperty Source -Unique | Select-Object -First 4)
    if (-not $oc.Count) { & $A 'opencode    not found on PATH' }
    foreach ($o in $oc) { & $A ('opencode    ' + $o + '  ->  ' + (Probe-Cmd $o '--version' 8000)) }
    $stub = Join-Path $env:APPDATA 'npm\node_modules\@opencode\cli\bin\opencode.exe'
    if (Test-Path -LiteralPath $stub) { $len = (Get-Item -LiteralPath $stub).Length; & $A ('npm @opencode/cli exe  ' + $len + ' bytes' + $(if ($len -lt 100000) { '   <-- a stub: its postinstall did not run' } else { '' })) }
    $dsk = Join-Path $env:LOCALAPPDATA 'Programs\ai.opencode.desktop\OpenCode.exe'
    if (Test-Path -LiteralPath $dsk) { & $A ('desktop app ' + $dsk + '  version ' + (Get-Item -LiteralPath $dsk).VersionInfo.FileVersion) } else { & $A 'desktop app not in the default folder' }
    $wc = Join-Path $env:ProgramFiles 'Cloudflare\Cloudflare WARP\warp-cli.exe'
    if (Test-Path -LiteralPath $wc) { & $A ('warp-cli    ' + (Probe-Cmd $wc '--version' 5000)); & $A ('WARP status ' + (Probe-Cmd $wc '--accept-tos status' 5000)) } else { & $A 'warp-cli    not installed' }
    $tor = @(Get-ChildItem -LiteralPath (Join-Path $State 'tor') -Recurse -Filter tor.exe -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($tor.Count) { & $A ('tor         ' + (Probe-Cmd $tor[0].FullName '--version' 5000)) } else { & $A 'tor         not installed by the launcher' }
    foreach ($pair in @(@('node', '--version'), @('npm.cmd', '--version'), @('curl.exe', '--version'))) {
      $c = Get-Command $pair[0] -ErrorAction SilentlyContinue
      if ($c) { & $A (($pair[0].PadRight(11)) + ' ' + (Probe-Cmd $c.Source $pair[1] 5000)) } else { & $A (($pair[0].PadRight(11)) + ' not found') }
    }
  }
  } $A

  Progress 3 $total 'Connection'
  & $H 'Connection'
  Safe-Section {
  $ports = @(40000, 9050, 9150, 8118, [int](Get-Val 'PROXY_PORT'), [int](Get-Val 'TOR_SOCKS_PORT'), [int](Get-Val 'TOR_HTTP_PORT')) | Sort-Object -Unique
  try {
    $ls = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $ports -contains $_.LocalPort })
    foreach ($pt in $ports) {
      $m = @($ls | Where-Object { $_.LocalPort -eq $pt } | Select-Object -First 1)
      if ($m.Count) { $pn = (Get-Process -Id $m[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName; & $A ('port ' + $pt + ' listening (' + $pn + ')') } else { & $A ('port ' + $pt + ' not listening') }
    }
  } catch { & $A '(listening ports unavailable)' }
  $pr = @(Get-Process -Name opencode, OpenCode, opencode-cli, warp-svc, 'Cloudflare WARP', tor -ErrorAction SilentlyContinue)
  if ($pr.Count) {
    foreach ($x in $pr) {
      $since = ''
      try { $since = ' since ' + $x.StartTime.ToString('s') } catch { }
      & $A ('process ' + $x.ProcessName + ' pid ' + $x.Id + $since)
    }
  } else { & $A 'no opencode / WARP / Tor process running' }
  $mk = Join-Path $State 'renew_needed.txt'
  if (Test-Path -LiteralPath $mk) { & $A ('renew needed: ' + (Get-Content -LiteralPath $mk -TotalCount 1)) }
  } $A

  Progress 4 $total 'Settings and setup'
  & $H 'Settings changed from the default'
  $n = 0
  foreach ($s in $Schema) { if ($script:Cfg.settings.ContainsKey($s.Key)) { & $A ($s.Key + ' = ' + (Safe-Val $s.Key)); $n++ } }
  if (-not $n) { & $A '(none: every setting is at its default)' }
  & $H 'Setup'
  $su = $script:Cfg.setup
  if ($su -is [hashtable] -and $su.done -eq $true) {
    & $A ('configured: method ' + $su.method + ', verified ' + $su.verified + ', created ' + $su.createdUtc)
    & $A ('command ' + (Test-Path -LiteralPath $ShimPath) + ', on PATH ' + ([bool](@((Get-UserPath) -split ';') | Where-Object { $_.TrimEnd('\') -ieq $ShimDir.TrimEnd('\') })) + ', launcher still there ' + (Test-Path -LiteralPath $su.launcher))
  } else { & $A 'not configured' }
  if ($script:Cfg.font.Count) { & $A ('font changes recorded: ' + (($script:Cfg.font.Keys) -join ', ')) }

  Progress 5 $total 'Logs'
  & $H 'launcher.log (newest 400 lines)'
  & $A (Tail-Of (Join-Path $State 'launcher.log') 400)
  foreach ($f in @('startup.log', 'install.log', 'wcli.log', 'verify.log', 'renew.log', 'resume.err', 'probe.err')) {
    & $H ($f + ' (newest 60 lines)')
    & $A (Tail-Of (Join-Path $State $f) 60)
  }
  foreach ($f in @('tor\tor.log', 'tor\bridge.log')) {
    & $H ($f + ' (newest 60 lines)')
    & $A (Tail-Of (Join-Path $State $f) 60)
  }

  Progress 6 $total 'Writing the report'
  $dir = Join-Path $State 'reports'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $out = Join-Path $dir ('support-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
  [IO.File]::WriteAllText($out, (Redact $sb.ToString()), (New-Object Text.UTF8Encoding($false)))
  Log ('support report written: ' + $out) 'report'
  return $out
}
function Show-Report {
  Clear-Screen
  WL (P (Style 'title') ($script:I.gear + ' ' + (T 'Support report')))
  WL ''
  $path = New-Report
  WL ''
  Say 'ok' 'Report ready. Personal data was removed; read it once before you share it.'
  WL (P (Style 'dim') ('   ' + $path))
  $items = @(
    @{ L = 'Open the folder'; H = 'Show the report in Explorer so you can attach or paste it.' },
    @{ L = 'Copy the file path'; H = 'Put the full path on the clipboard.' },
    @{ L = ($script:I.back + ' Back'); H = 'Return to the main menu.' })
  while ($true) {
    $r = Show-Menu 'Support report' $items $null @('', ('   ' + (P (Style 'dim') $path)), '') 0
    if ($r -eq -1 -or $r -eq 2) { return }
    if ($r -eq 0) { if (-not $Scripted) { try { Start-Process explorer.exe -ArgumentList ('/select,"' + $path + '"') } catch { } } }
    if ($r -eq 1) { try { Set-Clipboard -Value $path } catch { } }
  }
}

# ---------------------------------------------------------------- launcher menus (v2.29)
# One screen per call. The exit code is the number of the chosen row, what `choice` returned in the old
# menus, so the batch keeps its own dispatch. 20 = no usable console (the batch falls back to `choice`).
function Header-Lines {
  $h = @()
  foreach ($p in @(@('Folder', $env:OC_H_FOLDER), @('Egress', $env:OC_H_EGRESS), @('Mode', $env:OC_H_MODE), @('Proxy', $env:OC_H_PROXY), @('WARP', $env:OC_H_WARP), @('Version', $env:OC_H_VER), @('Exit IP', $env:OC_H_IP))) {
    if ($p[1]) { $h += ('   ' + (P (Style 'dim') (Pad (T $p[0]) 9)) + (P (Style 'accent') ([string]$p[1]))) }
  }
  if ($h.Count) { $h += '' }
  return $h
}
function Menu-Mode {
  $dsk = [string]$env:OC_DESKTOP
  $items = @(
    @{ L = ($script:I.play + ' CLI'); V = 'terminal'; H = 'Run opencode in this terminal. After a new IP the chat resumes by itself.' },
    @{ L = ($script:I.link + ' Desktop app'); V = $(if ($dsk) { 'installed' } else { 'not installed' }); S = $(if ($dsk) { 'ok' } else { 'warn' })
       H = $(if ($dsk) { Tf 'Run the OpenCode desktop app ({0}). It is restarted after every new IP.' $dsk } else { 'The OpenCode desktop app was not found. Choosing this offers to download and install it.' }) },
    @{ L = 'Detect the desktop app again'; H = 'Search again for OpenCode Desktop (install folders, registry, your OC_APP path).' },
    @{ L = ($script:I.err + ' Exit'); H = 'Close the launcher.' })
  $r = Show-Menu 'How do you want to run OpenCode?' $items $null $null 0
  if ($r -eq -1) { exit 3 }
  # 3 is Esc (back to the home screen). Rows: 0 CLI -> 1, 1 Desktop -> 2, 2 detect again -> 5, 3 Exit -> 4
  exit $(switch ($r) { 0 { 1 } 1 { 2 } 2 { 5 } default { 4 } })
}
function Menu-Folder {
  $last = [string]$env:OC_LASTPATH; $cwd = [string]$env:OC_CWD
  $hf = Join-Path ([string]$env:OC_STATE) 'folders.txt'
  $hist = @()
  if (Test-Path -LiteralPath $hf) { $hist = @(Get-Content -LiteralPath $hf -Encoding UTF8 | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } | Select-Object -First 15) }
  while ($true) {
    # C = the exit code the batch dispatches on: 1 last, 2 here, 3 browse, 6 a recent folder (path in folder_pick.txt), 4 exit, 5 Esc
    $items = @(
      @{ L = 'Reopen the last folder'; V = $(if ($last) { $last } else { '(nothing saved yet)' }); D = (-not $last); C = 1; H = $(if ($last) { Tf 'Work in {0}' $last } else { 'There is no saved folder yet. Use one of the other options once.' }) },
      @{ L = 'Use this folder'; V = $cwd; C = 2; H = (Tf 'Work in the folder the launcher was started from: {0}' $cwd) },
      @{ L = 'Browse for a folder...'; C = 3; H = 'Open the Windows folder picker and choose where to work.' },
      @{ L = 'Recent folders'; V = $(if ($hist.Count) { Tf '{0} saved' $hist.Count } else { '(nothing saved yet)' }); D = ($hist.Count -eq 0); C = 6; H = 'Pick a folder you worked in before. Its earlier chats are listed under Sessions by folder.' },
      @{ L = ($script:I.back + ' Back'); C = 5; H = 'Return to the home screen.' },
      @{ L = ($script:I.err + ' Exit'); C = 4; H = 'Close the launcher.' })
    $r = Show-Menu 'Choose a folder to work in' $items $null $null $(if ($last) { 0 } else { 1 })
    if ($r -eq -1) { exit 5 }
    if ($items[$r].C -ne 6) { exit $items[$r].C }
    if ($hist.Count -eq 0) { continue }
    $sub = @()
    foreach ($h in $hist) { $leaf = Split-Path -Leaf $h; if (-not $leaf) { $leaf = $h }; $sub += @{ L = $leaf; H = $h } }
    $sub += @{ L = ($script:I.back + ' Back'); H = 'Return to the folder screen.' }
    $q = Show-Menu 'Recent folders' $sub $null $null 0
    if ($q -ge 0 -and $q -lt $hist.Count) {
      [IO.File]::WriteAllText((Join-Path ([string]$env:OC_STATE) 'folder_pick.txt'), [string]$hist[$q])
      exit 6
    }
  }
}
function Menu-Egress {
  $items = @(
    @{ L = 'WARP'; V = 'Cloudflare'; H = 'Cloudflare WARP in proxy mode. A new registration gives a new exit IP. Rotation supported.' },
    @{ L = 'TOR'; V = ('bridge :' + $env:TOR_HTTP_PORT); H = 'Local Tor with a built-in HTTP bridge. A portable Tor is installed automatically if missing.' },
    @{ L = 'PROXY'; V = 'free list'; H = 'Free HTTP proxies from your list (any format) or the default one. Each is tested before use.' },
    @{ L = 'NONE'; V = 'direct'; H = 'No proxy: opencode uses your real connection and nothing is rotated.' },
    @{ L = 'WIREGUARD'; V = 'wireproxy'; H = 'Your WireGuard .conf files through wireproxy, a local proxy that only opencode uses. Each switch takes the next file. No administrator prompt.' },
    @{ L = 'VPNGATE'; V = 'OpenVPN'; H = 'VPN Gate servers through OpenVPN. Only OpenCode''s hosts go through the tunnel. Needs a window that is already administrator: this script never asks for it.' })
  $head = @()
  if ($env:OC_H_FOLDER) { $head = @(('   ' + (P (Style 'dim') (Pad (T 'Folder') 9)) + (P (Style 'accent') $env:OC_H_FOLDER)), '') }
  $r = Show-Menu 'Choose the connection for OpenCode' $items $null $head 0
  # 1-6 = the row, 9 = Esc (back to the folder screen; never a quit)
  if ($r -eq -1) { exit 9 }
  exit ($r + 1)
}
function Menu-Main {
  # C = the exit code the batch dispatches on. Esc and "Back" are 10 (back to the home screen).
  $items = @(
    @{ L = 'New IP and start OpenCode'; V = 'new IP'; C = 1; H = 'Get a new IP or proxy, then open OpenCode. Your chats and history stay untouched.' },
    @{ L = 'Clear tokens, then start'; V = 'keeps chats'; S = 'warn'; C = 7; H = 'Close the opencode this launcher started, copy the login file (auth.json) to a private backup folder, remove it, then open OpenCode. Chats and cache stay.' },
    @{ L = 'Change IP (test)'; C = 3; H = 'Rotate the connection only, without opening OpenCode.' },
    @{ L = 'Sessions by folder'; V = 'open or delete'; C = 8; H = 'Open an earlier chat or delete old ones, grouped by the folder they belong to.' },
    @{ L = 'Deep reset or restore chats'; V = 'submenu'; C = 4; H = 'Deep reset moves your chats to the Desktop and clears tokens and cache. Restore brings chats back from an earlier reset.' },
    @{ L = 'Mode (CLI or Desktop)'; C = 9; H = 'Switch between the terminal and the desktop app.' },
    @{ L = ($script:I.back + ' Back'); C = 10; H = 'Return to the home screen.' },
    @{ L = ($script:I.err + ' Exit'); C = 6; H = 'Close the launcher.' })
  $head = Header-Lines
  $r = Show-Menu 'OpenCode' $items ('v2.60.19   ' + $Repo) $head 0
  if ($r -eq -1) { exit 10 }
  exit $items[$r].C
}
# Deep reset or restore chats. 1 = deep reset, 2 = restore, 10 = back.
function Menu-Deep {
  $items = @(
    @{ L = 'Deep reset'; V = 'asks first'; S = 'err'; H = 'Move your chats to the Desktop archive, clear tokens and cache, then start fresh.' },
    @{ L = 'Restore chats'; V = 'from the Desktop'; H = 'Bring chats back from an earlier deep reset.' },
    @{ L = 'Clear cache'; V = 'keeps tokens'; H = 'Delete the opencode cache folder only. The login file (auth.json) and the chats are not touched.' },
    @{ L = 'Clear instance lock'; V = 'if a start says already open'; H = 'Remove the single-instance lock left by a window that crashed or was closed.' },
    @{ L = 'Discard pending resume'; V = 'after a quota stop'; H = 'Forget the chat that was waiting to resume after a quota stop. The chat itself is not touched.' },
    @{ L = ($script:I.back + ' Back'); H = 'Return to the main menu.' })
  $r = Show-Menu 'Deep reset or restore chats' $items $null (Header-Lines) 0
  if ($r -eq 0) { exit 1 }
  if ($r -eq 1) { exit 2 }
  if ($r -eq 2) { exit 3 }
  if ($r -eq 3) { exit 4 }
  if ($r -eq 4) { exit 5 }
  exit 10
}
# Pick an archived backup (one folder per deep reset). Exit 1 = picked, its path is in restore_pick.txt; 10 = back.
function Menu-Restore {
  $root = [string]$env:OC_ARCH
  $pick = Join-Path ([string]$env:OC_STATE) 'restore_pick.txt'
  $dirs = @()
  if ($root -and (Test-Path -LiteralPath $root)) { $dirs = @(Get-ChildItem -LiteralPath $root -Directory | Sort-Object Name -Descending) }
  $items = @()
  foreach ($d in $dirs) {
    $n = @(Get-ChildItem -LiteralPath $d.FullName -Recurse -File -ErrorAction SilentlyContinue).Count
    $items += @{ L = $d.Name; V = $(if ($n -eq 1) { Tf '{0} file' $n } else { Tf '{0} files' $n }); H = $d.FullName }
  }
  $items += @{ L = ($script:I.back + ' Back'); H = 'Return to the deep reset menu.' }
  $head = Header-Lines
  if ($dirs.Count -eq 0) { $head = @((P (Style 'warn') (T 'No archived chats yet. A deep reset creates one on the Desktop.')), '') + $head }
  $r = Show-Menu 'Restore chats from a backup' $items $null $head 0
  if ($r -lt 0 -or $r -ge $dirs.Count) { exit 10 }
  [IO.File]::WriteAllText($pick, [string]$dirs[$r].FullName)
  exit 1
}
# Sessions grouped by folder: first the folders worked in (this one, then the saved history), then the chats of one
# folder. Exit 1 = open a chat (its id is in session_pick.txt, its folder in session_dir.txt); 0 = back.
# Deleting a whole folder of chats goes first (outer level); one chat at a time is the inner level.
function Menu-Sessions {
  $pick = Join-Path ([string]$env:OC_STATE) 'session_pick.txt'
  $pickDir = Join-Path ([string]$env:OC_STATE) 'session_dir.txt'
  $exe = [string]$env:OC_CMD; if (-not $exe) { $exe = 'opencode' }
  $cwd = [string]$env:OC_H_FOLDER
  $head = Header-Lines
  if ($env:OC_H_MODE -eq 'DESKTOP') {
    $null = Show-Menu 'Sessions by folder' @(@{ L = ($script:I.back + ' Back'); H = 'Return to the main menu.' }) $null (@((P (Style 'warn') (T 'The desktop app has no session list. Switch to CLI to pick a chat.')), '') + $head) 0
    exit 0
  }
  $dirs = @(); if ($cwd) { $dirs += $cwd }
  $hf = Join-Path ([string]$env:OC_STATE) 'folders.txt'
  if (Test-Path -LiteralPath $hf) { foreach ($x in (Get-Content -LiteralPath $hf -Encoding UTF8)) { if ($x -and ($dirs -notcontains $x) -and (Test-Path -LiteralPath $x -PathType Container)) { $dirs += $x } } }
  $dirs = @($dirs | Select-Object -First 12)
  function Get-Sessions([string]$dir, [int]$n) {
    Push-Location -LiteralPath $dir
    try { $raw = (& $exe session list --format json -n $n 2>$null | Out-String).Trim(); return @((ConvertFrom-Json -InputObject $raw) | Where-Object { $_ -and $_.id }) }
    catch { return @() } finally { Pop-Location }
  }
  $pos = 0
  while ($true) {
    $items = @()
    foreach ($dd in $dirs) { $leaf = Split-Path -Leaf $dd; if (-not $leaf) { $leaf = $dd }; $items += @{ L = $leaf; V = $(if ($dd -eq $cwd) { T 'this folder' } else { '' }); H = $dd } }
    $items += @{ L = ($script:I.back + ' Back'); H = 'Return to the main menu.' }
    $r = Show-Menu 'Sessions by folder' $items $null $head $pos
    if ($r -lt 0 -or $r -ge $dirs.Count) { exit 0 }
    $pos = $r
    $dir = [string]$dirs[$r]
    $sp = 0
    while ($true) {
      $list = @(Get-Sessions $dir 200)
      $its = @()
      foreach ($x in $list) {
        $t = if ($x.title) { [string]$x.title } else { T 'Untitled session' }
        # v3.1 (N50): a row without a numeric updated field used to throw and abort the menu.
        $ums = [int64]0
        if (-not [int64]::TryParse([string]$x.updated, [ref]$ums)) { $ums = 0 }
        $when = if ($ums -gt 0) { [DateTimeOffset]::FromUnixTimeMilliseconds($ums).LocalDateTime.ToString('yyyy-MM-dd HH:mm') } else { '' }
        $its += @{ L = $t; V = $when; H = [string]$x.id }
      }
      $its += @{ L = 'Delete every chat of this folder'; S = 'err'; D = ($list.Count -eq 0); H = 'Deletes all the chats listed above, with the chats started from them. Asks first.' }
      $its += @{ L = ($script:I.back + ' Back'); H = 'Return to the folder list.' }
      $hd = @(('   ' + (P (Style 'dim') (Pad (T 'Folder') 9)) + (P (Style 'accent') $dir)))
      if ($list.Count -eq 0) { $hd += (P (Style 'warn') ('   ' + (T 'No sessions in this folder yet.'))) }
      $hd += ''
      $q = Show-Menu 'Sessions in this folder' $its $null $hd $sp
      if ($q -lt 0 -or $q -eq ($its.Count - 1)) { break }
      $sp = $q
      if ($q -eq ($its.Count - 2)) {
        if ($list.Count -gt 0 -and (Confirm-Box 'Delete every chat of this folder?' @($dir))) {
          # v3.1 (N14): the menu lists at most 200 chats, so deleting only those left the
          # rest behind while the UI said everything was gone. It pages until empty and
          # logs the real total.
          Push-Location -LiteralPath $dir
          $delTotal = 0; $delOk = 0
          try {
            while ($true) {
              $batch = @(Get-Sessions $dir 200)
              if ($batch.Count -eq 0) { break }
              $before = $delTotal
              foreach ($x in $batch) { & $exe session delete ([string]$x.id) 2>&1 | Out-Null; $delTotal++; if ($LASTEXITCODE -eq 0) { $delOk++ } }
              if ($delTotal -eq $before) { break }
            }
          } finally { Pop-Location }
          Log ('sessions deleted for ' + $dir + ': ' + $delOk + ' of ' + $delTotal) 'ui'
          $sp = 0
        }
        continue
      }
      $one = $list[$q]
      $act = Show-Menu ([string]$its[$q].L) @(
        @{ L = ($script:I.play + ' Open this chat'); H = 'Continue this chat in the folder it belongs to.' },
        @{ L = ($script:I.trash + ' Delete this chat'); S = 'err'; H = 'Deletes the chat and the chats started from it. Asks first.' },
        @{ L = ($script:I.back + ' Back'); H = 'Return to the chat list.' }) $null $null 0
      if ($act -eq 0) {
        [IO.File]::WriteAllText($pick, [string]$one.id)
        [IO.File]::WriteAllText($pickDir, $dir)
        exit 1
      }
      if ($act -eq 1 -and (Confirm-Box 'Delete this chat?' @([string]$one.title))) {
        Push-Location -LiteralPath $dir
        $drc = 1
        try { & $exe session delete ([string]$one.id) 2>&1 | Out-Null; $drc = $LASTEXITCODE } finally { Pop-Location }
        # v3.1 (N15): a failed delete counted as a success; the exit code decides now.
        if ($drc -eq 0) { Log ('session deleted: ' + [string]$one.id) 'ui' } else { Log ('session delete failed (' + $drc + '): ' + [string]$one.id) 'error' }
        if ($sp -gt 0) { $sp-- }
      }
    }
  }
}
# Yes/No under the text already printed by the batch. Exit 1 = yes, 2 = no (what `choice /c yn` returned).
function Menu-Confirm {
  $q = T (([string]$env:OC_Q -replace '\s*\[Y/N\]:?\s*$', '').Trim())
  $head = @('', (P (Style 'warn') ($script:I.warn + ' ' + $q)))
  if ($env:OC_QT) { $script:KeyTimeout = [int]$env:OC_QT; $head += (P (Style 'dim') ('   ' + (Tf 'No answer in {0}s counts as No.' $env:OC_QT))) }
  $items = @(@{ L = 'Yes'; K = 'y'; S = 'warn'; H = 'Go ahead.' }, @{ L = 'No'; K = 'n'; H = 'Cancel. Nothing is changed.' })
  if ($env:OC_UPD) { $items += @{ L = 'No, never ask about updates'; H = 'Stop the update checks and prompts. Change it back in Settings, Updates.' } }
  $r = Show-Menu 'Confirm' $items $null $head 1 $false $true
  if ($r -eq 0) { exit 1 }
  if ($r -eq 2) { Set-Val (Get-Setting 'UPDATE_ASK') 'never'; exit 3 }
  exit 2
}

# ---------------------------------------------------------------- home
# First start only. The detected language comes first and is selected; "Automatic" follows Windows on every start.
function First-Lang {
  $mark = Join-Path $State 'lang.chosen'
  if (Test-Path -LiteralPath $mark) { return }
  $det = Detect-Lang
  $codes = @($det, 'auto') + @($Langs | Where-Object { $_ -ne $det -and $_ -ne 'en' })
  $items = @()
  foreach ($c in $codes) {
    if ($c -eq 'auto') { $items += @{ L = 'Automatic (follow Windows)'; H = 'Use the language Windows is set to on every start; English when there is no translation.' } }
    elseif ($c -eq $det) { $items += @{ L = ((Lang-Name $c) + ' (detected)'); H = 'Detected from Windows and selected. You can change it in Settings, Appearance.' } }
    else { $items += @{ L = (Lang-Name $c); H = 'You can change it in Settings, Appearance.' } }
  }
  $r = Show-Menu 'Choose your language' $items $null $null 0
  $pick = if ($r -lt 0) { 'auto' } else { $codes[$r] }
  Set-Val (Get-Setting 'OCUI_LANG') $pick
  New-Item -ItemType Directory -Force -Path $State | Out-Null
  [IO.File]::WriteAllText($mark, $pick)
  Fetch-Lang $(if ($pick -eq 'auto') { $det } else { $pick })
  Init-Ui
  Write-I18n
}
# the folder the launcher opened last, when it still exists; the quick-start row uses it
function Get-Last-Folder {
  $f = Join-Path $State 'lastfolder.txt'
  if (-not (Test-Path -LiteralPath $f)) { return '' }
  $p = ([string](Get-Content -LiteralPath $f -TotalCount 1 -ErrorAction SilentlyContinue)).Trim().Trim('"')
  if ($p -and (Test-Path -LiteralPath $p -PathType Container)) { return $p }
  return ''
}
function Home-Loop {
  $pos = 0
  while ($true) {
    $conf = Test-Configured
    $items = @(); $acts = @()
    # v3.6: Auto opencode = a new IP and a new session in the last folder, no screens (see :auto_menu).
    $last = Get-Last-Folder
    $items += @{ L = ($script:I.play + ' ' + (T 'Auto opencode')); V = $(if ($last) { [string]$last } else { '' }); H = 'New IP and a new session in the last folder, with the saved method. If that fails it tries the others. No questions.' }; $acts += 'auto'
    $items += @{ L = ($script:I.play + ' Launch OpenCode'); H = 'Pick a folder and a connection method, then start the opencode CLI or the desktop app.' }; $acts += 'launch'
    # v3.6: Status shows what is installed and what is missing, and sets up or repairs it from here.
    if ($conf) { $items += @{ L = ($script:I.link + ' ' + (T 'Status')); V = (Tf 'Configured - {0}' $script:Cfg.setup.method); S = 'ok'; H = 'See what is installed and what is missing, and repair the opencode command or the connection.' } }
    else { $items += @{ L = ($script:I.link + ' ' + (T 'Status')); V = 'Not configured'; S = 'warn'; H = 'Guided setup: choose WARP, Tor, a proxy list or direct, then get an "opencode" command and a shortcut that start with it. It is tested at the end.' } }
    $acts += 'connect'
    if ($conf) {
      $items += @{ L = ($script:I.renew + ' Renew session'); H = 'Use it when the free limit is hit or the login expired: closes opencode, keeps the saved tokens and cache, and gets a new IP, WARP registration, Tor circuit or proxy.' }; $acts += 'renew'
    }
    $items += @{ L = ($script:I.gear + ' ' + (T 'Settings')); H = 'View and change every launcher option, uninstall the connection, and send a support report. Saved instantly, no files to edit.' }; $acts += 'settings'
    # v3.6: the commands (opencodeinf, opencode-auto) can be installed from here, no setup needed.
    $cmdHave = ((Test-Path -LiteralPath $ShimInfPath) -and (Test-Path -LiteralPath $ShimAutoPath))
    $items += @{ L = ($script:I.link + ' ' + (T 'Commands')); V = $(if ($cmdHave) { (T 'installed') } else { (T 'not installed') }); S = $(if ($cmdHave) { 'ok' } else { 'warn' }); H = 'Install opencodeinf and opencode-auto now and put their folder on your PATH, so they work from any terminal. Same as Settings, Launch, Install commands.' }; $acts += 'commands'
    $items += @{ L = ($script:I.err + ' Exit'); H = 'Close the launcher.' }; $acts += 'exit'
    $head = @()
    $marker = Join-Path $State 'renew_needed.txt'
    if ($conf -and (Test-Path -LiteralPath $marker)) {
      $why = (Get-Content -LiteralPath $marker -TotalCount 1 -ErrorAction SilentlyContinue)
      $head += (P (Style 'warn') ($script:I.renewE + ' ' + $script:I.warn + ' ' + (Tf 'Your session needs renewing: {0}' $why)))
      $head += (P (Style 'warn') ('   ' + (T 'Choose "Renew session" below. It gets a new IP and clears the saved login;')))
      $head += (P (Style 'warn') ('   ' + (T 'no other step is needed.')))
      $head += ''
    }
    if ($script:Notice) { $head += (P (Style $script:Notice[0]) ($script:I.warn + ' ' + (T $script:Notice[1]))); $head += ''; $script:Notice = $null }
    $r = Show-Menu 'Main menu' $items ('v2.60.19   ' + $Self) $head $pos $true
    if ($r -eq -1) { continue }
    $pos = $r
    Log ('home -> ' + $acts[$r])
    switch ($acts[$r]) {
      'quick' { return 11 }
      'auto' { if (-not $conf) { [void](Run-Setup) }; if (Test-Configured) { return 12 } }
      'launch' { return 10 }
      'report' { Show-Report }
      'connect' { if ($conf) { Show-Status } else { [void](Run-Setup) } }
      'renew' { Do-Renew }
      'commands' { Commands-Menu }
      'settings' { Settings-Menu }
      'exit' { return 0 }
    }
  }
}

# Every setting must accept a good value, reject a bad one and reach config.env (OC_TUI=selftest).
function Self-Test {
  $fails = 0; $i = 0
  foreach ($s in $Schema) {
    $i++
    $good = ''; $bad = 'zzz'
    switch ($s.Type) {
      'bool' { $good = $(if ([int]$s.Default -eq 1) { 'off' } else { 'on' }); $bad = 'maybe' }
      'int' { $good = [string][Math]::Min([int]$s.Max, [Math]::Max([int]$s.Min, [int]$s.Default + 1)); if ($good -eq [string]$s.Default) { $good = [string]$s.Min }; $bad = [string]([int]$s.Max + 1) }
      'port' { $good = [string](41000 + $i); $bad = '70000' }
      'enum' { $good = [string]($s.Values | Where-Object { $_ -ne $s.Default } | Select-Object -First 1); $bad = 'zzz' }
      'string' { $good = 'test value'; $bad = 'a"b' }
      'url' { $good = 'https://example.com/x'; $bad = 'not a url' }
      'listsrc' { $good = 'https://example.com/list.json'; $bad = 'C:\definitely\missing.txt' }
      'path' { $good = ''; $bad = 'C:\definitely\missing.exe' }
      'dir' { $good = ''; $bad = 'C:\definitely\missing_folder' }
      'ostring' { $good = 'test value'; $bad = 'a"b' }
      'proxyaddr' { $good = '203.0.113.5:8080'; $bad = 'not a proxy' }
      'country' { $good = 'DE'; $bad = '1x' }
      'ipprefix' { $good = '104.28.'; $bad = 'abc' }
      'font' { $good = 'Consolas'; $bad = 'a"b' }
      'key' { $good = @{ KEY_ROTATE = 'J'; KEY_MENU = 'K'; KEY_QUIT = 'L' }[$s.Key]; $bad = 'zzz' }
    }
    $r = Test-Val $s $good
    $r2 = Test-Val $s $bad
    if ($r.ok -and -not $r2.ok) { Set-Val $s $r.v; [Console]::WriteLine('PASS ' + $s.Key + ' [' + $s.Type + '] ' + $good + ' (bad rejected: ' + $r2.err + ')') }
    else { $fails++; [Console]::WriteLine('FAIL ' + $s.Key + ' [' + $s.Type + '] good=' + $good + ' ok=' + $r.ok + ' bad=' + $bad + ' badOk=' + $r2.ok) }
  }
  return $fails
}

# ---------------------------------------------------------------- batch messages
# v2.31: the launcher's own echo lines read their text from i18n.cmd, one 'set "T_n=..."' per line,
# written here from the same language table as the menus. Values are escaped for cmd (% doubled,
# ^ before & | < > ( )); a message without a translation keeps its English default in the launcher.
# Writes lang\messages.txt: one NAME=value line per translated batch message. The batch loads it with
# 'for /f ... set', so the file is data only. Quotes become single quotes (they would end the value early).
function Write-I18n {
  $dir = Join-Path $State 'lang'
  $tmp = Join-Path $dir 'messages.txt.tmp'
  $out = New-Object Collections.Generic.List[string]
  foreach ($l in [IO.File]::ReadAllLines($Self)) {
    if ($l -notmatch '^set "(T_\d+)=(.*)"$') { continue }
    $name = $Matches[1]; $raw = $Matches[2]
    $key = ($raw -replace '%%', '%') -replace '\^(.)', '$1'
    if ($script:Tr.ContainsKey($key)) {
      $v = ($script:Tr[$key] -replace '"', "'") -replace '([\^&|<>()])', '^$1'
      $out.Add($name + '=' + $v)
    }
  }
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  [IO.File]::WriteAllLines($tmp, [string[]]$out, (New-Object Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $tmp -Destination (Join-Path $dir 'messages.txt') -Force
  Remove-Item -LiteralPath (Join-Path $State 'i18n.cmd') -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------- main
if ($Mode -eq 'probe') { if ([Console]::IsInputRedirected -and -not $Scripted) { exit 20 } else { exit 0 } }
if ($Mode -eq 'mki18n') { try { Load-Cfg; Init-Ui; Write-I18n; exit 0 } catch { exit 0 } }
# Reading keys from a redirected stdin leaves the console input in a state that makes the batch
# `choice` wait forever, so with no real console the UI steps aside before touching it.
if (-not $Scripted -and $Mode -ne 'export' -and $Mode -ne 'selftest' -and $Mode -ne 'install' -and [Console]::IsInputRedirected) { exit 20 }
try {
  Load-Cfg
  if ($Mode -ne 'selftest' -and $Mode -ne 'export') { Refresh-Shims }
  Init-Ui
  Log ('ui ' + $Mode + ' start; color ' + $script:Color + ', icons ' + $script:IconMode + ', width ' + $script:Width)
  if ((Get-Val 'OCUI_FONT') -and -not $env:WT_SESSION -and -not $env:TERM_PROGRAM -and -not $Scripted) { try { [void](Apply-ConsoleFont ([string](Get-Val 'OCUI_FONT')) ([int](Get-Val 'OCUI_FONT_SIZE'))) } catch { } }
  switch ($Mode) {
    'export' { Save-Cfg; exit 0 }
    'install' {
      $res = Commands-Install
      Log ('commands installed by --install, PATH ' + $res)
      Write-Host ''
      Write-Host ('  ' + $script:I.ok + ' ' + (T 'Commands installed: opencodeinf and opencode-auto.'))
      if ($res -eq 'added') { Write-Host ('  ' + (T 'The folder was added to your PATH. Open a new terminal to use them.')) }
      if ($res -eq 'skipped') { Write-Host ('  ' + (T 'PATH not changed: this copy is not the installed launcher.')) }
      exit 0
    }
    'selftest' { exit (Self-Test) }
    'settings' { Settings-Menu; exit 0 }
    'mode' { Menu-Mode }
    'folder' { Menu-Folder }
    'sessions' { Menu-Sessions }
    'egress' { Menu-Egress }
    'main' { Menu-Main }
    'deep' { Menu-Deep }
    'restore' { Menu-Restore }
    'confirm' { Menu-Confirm }
    default { First-Lang; $rc = Home-Loop; exit $rc }
  }
} catch {
  if ($_.Exception.Message -eq 'keys exhausted') { exit 30 }
  if ($_.Exception.Message -eq 'ctrl-c') { try { [Console]::TreatControlCAsInput = $false } catch { }; Log 'ctrl-c: leaving'; exit 0 }
  Log ('ui error: ' + $_.Exception.Message + ' at line ' + $_.InvocationInfo.ScriptLineNumber) 'error'
  [Console]::Error.WriteLine('ui: ' + $_.Exception.Message)
  exit 20
} finally {
  # v2.60 (N12): Ctrl+C is handed back to the console on all three exits (leave, continue,
  # no console). A frozen screen could not be interrupted once the launcher had run the UI.
  if ($null -ne $script:OldCtrlC) { try { [Console]::TreatControlCAsInput = [bool]$script:OldCtrlC } catch { } }
}
#>>>OC_ENDTUI
#>>>OC_PLIST_PS
# Proxy list normalizer. Reads OC_PRAW (any text: plain, CSV, JSON, NDJSON,
# XML, HTML, sorted or not, ip:port or split fields), writes OC_PLIST with one
# http://host:port per line (first-seen order, no duplicates, no SOCKS) and
# prints the count. Prints nothing when no proxy was found.
try {
  $ErrorActionPreference = 'Stop'
  $b = [IO.File]::ReadAllBytes($env:OC_PRAW)
  if ($b.Length -ge 2 -and $b[0] -eq 0xFF -and $b[1] -eq 0xFE) { $t = [Text.Encoding]::Unicode.GetString($b, 2, $b.Length - 2) }
  elseif ($b.Length -ge 2 -and $b[0] -eq 0xFE -and $b[1] -eq 0xFF) { $t = [Text.Encoding]::BigEndianUnicode.GetString($b, 2, $b.Length - 2) }
  elseif ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) { $t = [Text.Encoding]::UTF8.GetString($b, 3, $b.Length - 3) }
  else { $t = [Text.Encoding]::UTF8.GetString($b) }
  $out = New-Object 'Collections.Generic.List[string]'
  $seen = New-Object 'Collections.Generic.HashSet[string]'
  $oct = '(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)'
  $ipPat = "(?:$oct\.){3}$oct"
  # v3.1 (N52): a bracketed IPv6 literal did not match at all, so a v6-only list came
  # out as 0 proxies with no warning.
  $ip6Pat = '\[[0-9A-Fa-f:.]+\]'
  $hostPat = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}'
  $sep = '[\s,;|"'']{1,6}'
  $hostRe = New-Object Text.RegularExpressions.Regex("^($ipPat|$ip6Pat|$hostPat)$")
  $credRe = New-Object Text.RegularExpressions.Regex('^[A-Za-z0-9._~%-]+:[A-Za-z0-9._~%-]+$')

  function Add-P($scheme, $cred, $h, $p) {
    $n = 0
    if (-not [int]::TryParse([string]$p, [ref]$n)) { return }
    if ($n -lt 1 -or $n -gt 65535) { return }
    $h = ([string]$h).Trim().ToLowerInvariant()
    if (-not $hostRe.IsMatch($h)) { return }
    $s = ([string]$scheme).ToLowerInvariant()
    if ($s -like 'socks*') { return }
    if ($s -ne 'https') { $s = 'http' }
    $u = ''
    if ($cred) {
      if (-not $credRe.IsMatch($cred)) { return }
      $u = $cred + '@'
    }
    if ($seen.Add($s + '://' + $u + $h + ':' + $n)) { $out.Add($s + '://' + $u + $h + ':' + $n) }
  }

  # Free text: scheme://user:pass@host:port, host:port, then "ip<sep>port"
  # (CSV, tables, tabs) and "port<sep>ip". A line that names socks is skipped
  # unless it carries an explicit http(s):// proxy.
  function Scan-Text([string]$s) {
    $s = $s -replace '<[^>]+>', ' ' -replace '&nbsp;|&#160;', ' '
    $re = "(?i)(?<![\w.@-])(?:(https?|socks[45]h?)://)?(?:([A-Za-z0-9._~%-]+:[A-Za-z0-9._~%-]+)@)?($ipPat|$hostPat):(\d{1,5})(?!\d)"
    $reB = "(?<![\d.])($ipPat)$sep(\d{2,5})(?![\d.A-Za-z])"
    $reC = "(?<![\d.])(\d{2,5})$sep($ipPat)(?![\d.])"
    $evA = [Text.RegularExpressions.MatchEvaluator]{
      param($m)
      $isIp = $m.Groups[3].Value -match "^$ipPat$"
      if ($isIp -or $m.Groups[1].Success -or $script:curLine -eq $m.Value) { Add-P $m.Groups[1].Value $m.Groups[2].Value $m.Groups[3].Value $m.Groups[4].Value; return ' ' }
      return $m.Value
    }
    $evB = [Text.RegularExpressions.MatchEvaluator]{ param($m) Add-P 'http' '' $m.Groups[1].Value $m.Groups[2].Value; return ' ' }
    $evC = [Text.RegularExpressions.MatchEvaluator]{ param($m) Add-P 'http' '' $m.Groups[2].Value $m.Groups[1].Value; return ' ' }
    foreach ($line in ($s -split '\r?\n')) {
      $line = $line.Trim()
      if (-not $line -or $line.StartsWith('#') -or $line.StartsWith(';')) { continue }
      $script:curLine = $line
      $rest = [regex]::Replace($line, $re, $evA)
      # v3.1 (N77): any line containing "socks" was dropped whole, even a valid ip port pair.
      if ($rest -match '(?i)^socks[45]h?://') { continue }
      $rest = [regex]::Replace($rest, $reB, $evB)
      [void][regex]::Replace($rest, $reC, $evC)
    }
  }

  $hostKeys = @('ip', 'ip_address', 'ipaddress', 'host', 'hostname', 'address', 'proxy_address', 'proxy_ip', 'proxyip', 'server')
  $portKeys = @('port', 'proxy_port', 'proxyport')
  $typeKeys = @('protocol', 'protocols', 'type', 'scheme', 'proxy_type', 'proxytype')
  function Pick($pairs, $keys) {
    foreach ($k in $keys) { foreach ($pr in $pairs) { if ($pr.Key -ieq $k -and $null -ne $pr.Value -and "$($pr.Value)" -ne '') { return $pr.Value } } }
    return $null
  }
  # one record = a flat list of @{Key;Value} pairs (JSON object or XML element)
  function Add-Record($pairs) {
    $h = Pick $pairs $hostKeys; $p = Pick $pairs $portKeys
    if ($null -eq $h -or $null -eq $p -or "$h" -match ':\d+$') { return $false }
    $ty = ''
    $tv = Pick $pairs $typeKeys
    if ($null -ne $tv) { foreach ($x in @($tv)) { $ty += " $x" } }
    if ($ty -match '(?i)socks' -and $ty -notmatch '(?i)http') { return $true }
    $us = Pick $pairs @('username', 'user'); $pw = Pick $pairs @('password', 'pass')
    $cred = ''
    if ($us -and $pw) { $cred = "$us`:$pw" }
    Add-P 'http' $cred $h $p
    return $true
  }
  $recKeys = $hostKeys + $portKeys + $typeKeys
  function Walk-Json($o) {
    if ($null -eq $o) { return }
    if ($o -is [string]) { Scan-Text $o; return }
    if ($o -is [System.Management.Automation.PSCustomObject]) {
      $pairs = @(); $flat = @()
      foreach ($pr in $o.PSObject.Properties) {
        $e = @{ Key = $pr.Name; Value = $pr.Value }
        $pairs += $e
        if ($pr.Value -isnot [System.Management.Automation.PSCustomObject]) { $flat += $e }
      }
      $used = Add-Record $flat
      foreach ($pr in $pairs) {
        $v = $pr.Value
        if ($v -is [string]) { if (-not ($used -and ($recKeys -contains $pr.Key))) { Scan-Text $v } }
        elseif ($v -is [System.Management.Automation.PSCustomObject] -or $v -is [array]) { Walk-Json $v }
      }
      return
    }
    if ($o -is [System.Collections.IEnumerable]) { foreach ($x in $o) { Walk-Json $x } }
  }
  function Walk-Xml($n) {
    if ($n.NodeType -ne 'Element') { return }
    $kids = @(); $pairs = @()
    foreach ($a in $n.Attributes) { $pairs += @{ Key = $a.Name; Value = $a.Value } }
    foreach ($k in $n.ChildNodes) {
      if ($k.NodeType -eq 'Element') {
        $kids += $k
        $leaf = $true
        foreach ($g in $k.ChildNodes) { if ($g.NodeType -eq 'Element') { $leaf = $false; break } }
        if ($leaf) { $pairs += @{ Key = $k.Name; Value = $k.InnerText } }
      }
    }
    [void](Add-Record $pairs)
    if ($kids.Count -eq 0) { Scan-Text $n.InnerText; return }
    foreach ($k in $kids) { Walk-Xml $k }
  }

  $tt = $t.TrimStart()
  if ($tt.StartsWith('{') -or $tt.StartsWith('[')) {
    $j = $null
    try { $j = $tt | ConvertFrom-Json } catch { $j = $null }
    if ($null -ne $j) { Walk-Json $j }
    else {
      foreach ($line in ($tt -split '\r?\n')) {
        $l = $line.Trim().TrimEnd(',')
        if ($l.StartsWith('{') -or $l.StartsWith('[')) { try { Walk-Json ($l | ConvertFrom-Json) } catch { } }
      }
    }
  }
  elseif ($tt.StartsWith('<')) {
    # v3.1 (N78): a downloaded list must not expand DTD entities. XmlReaderSettings
    # prohibits the DTD and bounds the entity expansion before anything is walked.
    try { $xs = New-Object Xml.XmlReaderSettings; $xs.DtdProcessing = [Xml.DtdProcessing]::Prohibit; $xs.XmlResolver = $null; $xs.MaxCharactersFromEntities = 100000; $sr = New-Object IO.StringReader($tt); $xr = [Xml.XmlReader]::Create($sr, $xs); $x = New-Object Xml.XmlDocument; $x.Load($xr); $xr.Close(); Walk-Xml $x.DocumentElement } catch { }
  }
  if ($out.Count -eq 0) { Scan-Text $t }
  if ($out.Count -gt 0) {
    # v3.1 (N16): writing straight to OC_PLIST truncated the previous list when the write
    # failed halfway. The list is written beside it and moved into place.
    $tmp = $env:OC_PLIST + '.tmp'
    [IO.File]::WriteAllLines($tmp, $out.ToArray(), (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $tmp -Destination $env:OC_PLIST -Force
    Write-Output $out.Count
  } else {
    # v3.1 (N16): "0 proxies" is an empty list and a success, not silence.
    [IO.File]::WriteAllLines($env:OC_PLIST, [string[]]@(), (New-Object Text.UTF8Encoding($false)))
    Write-Output 0
  }
} catch {
  # v3.1 (N16): an unreadable file, bad XML or a failed write used to print nothing and
  # exit 0, which the caller read as "0 proxies".
  [Console]::Error.WriteLine('plist: ' + $_.Exception.Message)
  exit 1
}
#>>>OC_ENDPLIST
#>>>OC_VPN_PS
# WireGuard egress (v2.37): wireproxy, a user-mode WireGuard client, serves a local HTTP proxy that only OpenCode uses.
# No adapter, no route change, no administrator prompt. Run by :vpn_run from the launcher.
# In (env): OC_STATE, OC_VPN_ACT (switch|status|stop), WG_DIR, VPN_TIMEOUT, OC_SID, OC_VPN_M_TRY / _SAME / _NOANS.
# Out: STATE\vpn_result.txt (STATUS, IP, LOC, NAME, TRIED, TOOL, DIR, PORT). Exit 0 = proxy up and the exit IP changed.
# Test hooks: OC_WP_EXE (wireproxy path), OC_WP_ARCHIVE (local .tar.gz instead of the download), OC_VPN_FAKEIPS (file,
# one "ip loc" per check), OC_VPN_FAKEUP (1|0 for status), OC_VPN_FAST (one IP check per attempt, no waiting).
$ErrorActionPreference = 'Stop'
$State = $env:OC_STATE
$Act = $env:OC_VPN_ACT
$Sid = $env:OC_SID; if (-not $Sid) { $Sid = '-' }
$ResF = Join-Path $State 'vpn_result.txt'
$CurF = Join-Path $State 'vpn_current.txt'
$PidF = Join-Path $State 'wireproxy.pid'
$LogF = Join-Path $State 'vpn.log'
$FailF = Join-Path $State 'vpn_failed.txt'
$BinDir = Join-Path $State 'bin'
$RunDir = Join-Path $State 'wireproxy'
$WpVer = '1.1.3'
$WpSha = 'bce041ea9fe0f8a3351301dcbe29cdf6a523bb25cf9c62f17ebb5699a8051d0f'
$Port = 25345
$Nap = $(if ($env:OC_VPN_FAST) { 0 } else { 3 })
function VLog([string]$m) { try { Add-Content -LiteralPath $LogF -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] [' + $Sid + '] [vpn] ' + $m) } catch { } }
function Say([string]$tpl, $a0, $a1) { if ($tpl) { Write-Host ('  ' + ($tpl -f $a0, $a1)) } }
function Fin([string]$status, [string]$ip = '', [string]$loc = '', [string]$name = '', [int]$tried = 0, [string]$tool = '', [string]$dir = '') {
  [IO.File]::WriteAllLines($ResF, [string[]]@(('STATUS=' + $status), ('IP=' + $ip), ('LOC=' + $loc), ('NAME=' + $name), ('TRIED=' + $tried), ('TOOL=' + $tool), ('DIR=' + $dir), ('PORT=' + $Port)))
  VLog ('result ' + $status + ' ip=' + $ip + ' name=' + $name + ' tried=' + $tried)
  if ($status -eq 'OK') { exit 0 } else { exit 1 }
}
# wireproxy: the pinned release, checked by SHA-256 before it is unpacked. Kept in the state folder, never installed.
function Get-Wp {
  if ($env:OC_WP_EXE) { if (Test-Path -LiteralPath $env:OC_WP_EXE) { return $env:OC_WP_EXE }; return $null }
  $exe = Join-Path $BinDir 'wireproxy.exe'
  if (Test-Path -LiteralPath $exe) { return $exe }
  $tgz = Join-Path $BinDir 'wireproxy.tar.gz'
  try {
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
    if ($env:OC_WP_ARCHIVE) { Copy-Item -LiteralPath $env:OC_WP_ARCHIVE -Destination $tgz -Force }
    else {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -UseBasicParsing -Uri ('https://github.com/windtf/wireproxy/releases/download/v' + $WpVer + '/wireproxy_windows_amd64.tar.gz') -OutFile $tgz -TimeoutSec 120
    }
    $h = (Get-FileHash -LiteralPath $tgz -Algorithm SHA256).Hash.ToLower()
    if ($h -ne $WpSha) { VLog ('wireproxy archive hash ' + $h + ' is not ' + $WpSha); return $null }
    & (Join-Path $env:SystemRoot 'System32\tar.exe') -xzf $tgz -C $BinDir wireproxy.exe
    if ($LASTEXITCODE -ne 0) { VLog 'tar could not unpack wireproxy'; return $null }
    VLog ('wireproxy ' + $WpVer + ' installed')
  } catch { VLog ('wireproxy download failed: ' + $_.Exception.Message); return $null }
  finally { Remove-Item -LiteralPath $tgz -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $exe) { return $exe }
  return $null
}
function Get-FreePort {
  for ($p = 25345; $p -lt 25355; $p++) {
    try { $l = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $p); $l.Start(); $l.Stop(); return $p } catch { }
  }
  return 0
}
# the proxy this launcher started: pid and start time, so a reused pid is never stopped
function Proxy-Pid {
  if (-not (Test-Path -LiteralPath $PidF)) { return $null }
  $p = @((Get-Content -LiteralPath $PidF -TotalCount 1) -split '\|')
  try { $pr = Get-Process -Id ([int]$p[0]) -ErrorAction Stop; if ($pr.StartTime.Ticks -eq [long]$p[1]) { return $pr } } catch { }
  return $null
}
function Stop-Wp {
  $pr = Proxy-Pid
  if ($pr) { Stop-Process -Id $pr.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $PidF -Force -ErrorAction SilentlyContinue
  # v3.1 (N58): run.conf carries PrivateKey and only the .pid was removed before.
  foreach ($f in @('run.conf', 'out.log', 'err.log')) {
    try { $rp = Join-Path $RunDir $f; if (Test-Path -LiteralPath $rp) { Remove-Item -LiteralPath $rp -Force -ErrorAction SilentlyContinue } } catch { }
  }
}
function Start-Wp([string]$exe, [string]$conf) {
  New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
  $run = Join-Path $RunDir 'run.conf'
  $txt = [IO.File]::ReadAllText($conf).TrimEnd() + "`r`n`r`n[http]`r`nBindAddress = 127.0.0.1:" + $Port + "`r`n"
  [IO.File]::WriteAllText($run, $txt, [Text.UTF8Encoding]::new($false))
  $p = Start-Process -FilePath $exe -ArgumentList @('-s', '-c', ('"' + $run + '"')) -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $RunDir 'out.log') -RedirectStandardError (Join-Path $RunDir 'err.log')
  Set-Content -LiteralPath $PidF -Value ([string]$p.Id + '|' + [string]$p.StartTime.Ticks)
  $end = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $end) {
    if ($p.HasExited) { VLog ('wireproxy exited at start, code ' + $p.ExitCode); return $false }
    try { $c = [Net.Sockets.TcpClient]::new(); $c.Connect('127.0.0.1', $Port); $c.Close(); return $true } catch { }
    Start-Sleep -Milliseconds 300
  }
  return $false
}
# the exit IP seen through the proxy on port $via (0 = this PC's own route)
function Get-ExitIp([int]$via = 0) {
  if ($env:OC_VPN_FAKEIPS) {
    if (-not (Test-Path -LiteralPath $env:OC_VPN_FAKEIPS)) { return $null }
    $q = @(Get-Content -LiteralPath $env:OC_VPN_FAKEIPS | Where-Object { $_ })
    if ($q.Count -eq 0) { return $null }
    Set-Content -LiteralPath $env:OC_VPN_FAKEIPS -Value @($q | Select-Object -Skip 1)
    $p = @($q[0] -split '\s+')
    if ($p[0] -eq 'none') { return $null }
    return @{ ip = $p[0]; loc = $(if ($p.Count -gt 1) { $p[1] } else { '??' }) }
  }
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $r = [Net.HttpWebRequest]::Create('https://www.cloudflare.com/cdn-cgi/trace')
    $r.Proxy = $(if ($via -gt 0) { New-Object Net.WebProxy('http://127.0.0.1:' + $via) } else { $null })
    # v3.1 (N54): Timeout bounds the response; ReadToEnd uses ReadWriteTimeout (300 s).
    $r.ReadWriteTimeout = 8000
    $r.Timeout = 8000
    $resp = $r.GetResponse(); $sr = New-Object IO.StreamReader($resp.GetResponseStream()); $t = $sr.ReadToEnd(); $sr.Close(); $resp.Close()
    $ip = ''; $loc = ''
    foreach ($ln in ($t -split "`n")) { if ($ln -like 'ip=*') { $ip = $ln.Substring(3).Trim() } elseif ($ln -like 'loc=*') { $loc = $ln.Substring(4).Trim() } }
    if ($ip) { return @{ ip = $ip; loc = $loc } }
  } catch { }
  return $null
}
# polls until the exit IP differs from $prev. state: new | same (answered, unchanged) | none (no answer)
function Wait-NewIp([string]$prev, [int]$secs, [int]$via) {
  $end = (Get-Date).AddSeconds($secs); $last = $null
  while ($true) {
    $r = Get-ExitIp $via
    if ($r) { $last = $r; if ($r.ip -ne $prev) { return @{ state = 'new'; r = $r } } }
    if ($env:OC_VPN_FAST -or ((Get-Date) -ge $end)) { break }
    Start-Sleep -Seconds $Nap
  }
  if ($last) { return @{ state = 'same'; r = $last } }
  return @{ state = 'none'; r = $null }
}
# failures count for this launcher session only
function Mark-Failed([string]$name, [string]$why) {
  try { Add-Content -LiteralPath $FailF -Value ($Sid + '|WG|' + $name + '|' + $why + '|' + (Get-Date -Format 's')) } catch { }
  VLog ('failed ' + $name + ': ' + $why)
}
function Get-Failed {
  $set = @{}
  if (Test-Path -LiteralPath $FailF) {
    foreach ($ln in (Get-Content -LiteralPath $FailF)) {
      $p = @($ln -split '\|')
      if ($p.Count -ge 5 -and $p[0] -eq $Sid -and $p[1] -eq 'WG') { $set[$p[2]] = 1 }
    }
  }
  return $set
}
function Read-Cur {
  if (-not (Test-Path -LiteralPath $CurF)) { return $null }
  $p = @((Get-Content -LiteralPath $CurF -TotalCount 1) -split '\|')
  if ($p.Count -lt 2 -or $p[0] -ne 'WIREGUARD') { return $null }
  return @{ name = $p[1]; ip = $(if ($p.Count -gt 2) { $p[2] } else { '' }); port = $(if ($p.Count -gt 3 -and $p[3]) { [int]$p[3] } else { 0 }) }
}

if ($Act -eq 'stop' -or $Act -eq 'stopkeep') { Stop-Wp; Remove-Item -LiteralPath $CurF -Force -ErrorAction SilentlyContinue; Fin 'DOWN' }
if ($Act -eq 'status') {
  $c = Read-Cur
  if (-not $c) { Fin 'DOWN' }
  $up = [bool](Proxy-Pid)
  if ($env:OC_VPN_FAKEUP) { $up = ($env:OC_VPN_FAKEUP -eq '1') }
  if ($c.port -gt 0) { $Port = $c.port }
  if ($up) { Fin 'OK' $c.ip '' $c.name } else { Fin 'DOWN' '' '' $c.name }
}

$timeout = [int]$(if ($env:VPN_TIMEOUT) { $env:VPN_TIMEOUT } else { 45 })
$exe = Get-Wp
if (-not $exe) { Fin 'NOTOOL' -tool 'wireproxy' }
$dir = $(if ($env:WG_DIR) { $env:WG_DIR } else { Join-Path $State 'wireguard' })
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$confs = @(Get-ChildItem -LiteralPath $dir -Filter '*.conf' -File | Where-Object { $_.Length -gt 0 -and $_.BaseName -match '^[A-Za-z0-9_=+.-]{1,32}$' } | Sort-Object Name)
if ($confs.Count -eq 0) { Fin 'NOCONF' -tool 'WireGuard' -dir $dir }
$cur = Read-Cur
$curName = $(if ($cur) { $cur.name } else { '' })
# the exit IP to beat: the current proxy's if it is running, else this PC's own
$prevR = $null
if ($cur -and $cur.port -gt 0 -and (Proxy-Pid)) { $prevR = Get-ExitIp $cur.port }
if (-not $prevR) { $prevR = Get-ExitIp }
$prev = $(if ($prevR) { $prevR.ip } else { '' })
$failed = Get-Failed
# next file after the active one, wrapping around; the active one and the failed ones are skipped
$start = 0
for ($i = 0; $i -lt $confs.Count; $i++) { if ($confs[$i].BaseName -eq $curName) { $start = $i + 1 } }
$order = @(); for ($i = 0; $i -lt $confs.Count; $i++) { $order += $confs[($start + $i) % $confs.Count] }
$cands = @($order | Where-Object { -not $failed.ContainsKey($_.BaseName) -and $_.BaseName -ne $curName })
if ($env:OC_POOL_PREFER) { $cands = @(@($cands | Where-Object { $_.BaseName -eq $env:OC_POOL_PREFER }) + @($cands | Where-Object { $_.BaseName -ne $env:OC_POOL_PREFER })) }
if ($cands.Count -eq 0) { Stop-Wp; Remove-Item -LiteralPath $CurF -Force -ErrorAction SilentlyContinue; Fin 'ALLFAIL' -tool 'WireGuard' -dir $dir }
$tried = 0
foreach ($c in $cands) {
  $tried++
  Say $env:OC_VPN_M_TRY $c.BaseName
  Stop-Wp
  $Port = Get-FreePort
  if ($Port -eq 0) { Fin 'ALLFAIL' -tool 'wireproxy' -tried $tried }
  if (-not (Start-Wp $exe $c.FullName)) { Mark-Failed $c.BaseName 'proxy did not start'; Stop-Wp; continue }
  Set-Content -LiteralPath $CurF -Value ('WIREGUARD|' + $c.BaseName + '||' + $Port)
  $w = Wait-NewIp $prev $timeout $Port
  if ($w.state -eq 'new') {
    Set-Content -LiteralPath $CurF -Value ('WIREGUARD|' + $c.BaseName + '|' + $w.r.ip + '|' + $Port)
    Fin 'OK' $w.r.ip $w.r.loc $c.BaseName $tried
  }
  if ($w.state -eq 'same') { Say $env:OC_VPN_M_SAME $c.BaseName; Mark-Failed $c.BaseName 'same exit IP' }
  else { Say $env:OC_VPN_M_NOANS $c.BaseName $timeout; Mark-Failed $c.BaseName 'no answer' }
  Stop-Wp
}
Stop-Wp
Remove-Item -LiteralPath $CurF -Force -ErrorAction SilentlyContinue
Fin 'ALLFAIL' -tool 'WireGuard' -tried $tried -dir $dir
#>>>OC_ENDVPN
#>>>OC_VGATE_PS
# VPN Gate egress (v2.38): OpenVPN (openvpn.exe, community build) with the VPN Gate server configs.
# Only OpenCode's hosts go through the tunnel: the config gets route-nopull and one route per IP that the hosts
# resolve to right now. Everything else stays direct. No administrator prompt: the VPN Gate helper (#>>>OC_VGHELP) runs only when this window is administrator and
# OpenVPN for every start and stop of this session.
# Installs OpenVPN with winget when it is missing (only from an administrator window).
# In (env): OC_STATE, OC_VPN_ACT (switch|status|stop), VPN_TIMEOUT, OC_SID, VPNGATE_COUNTRY, VPNGATE_MAX, OC_VPN_M_TRY / _SAME / _NOANS.
# Out: STATE\vpn_result.txt (STATUS, IP, LOC, NAME, TRIED, TOOL, DIR, PORT=0). Exit 0 = tunnel up and the exit IP changed.
# Test hooks: OC_OVPN_EXE (openvpn path), OC_VG_CSV (local API csv), OC_VG_NOELEV (no UAC, for tests),
# OC_VG_IPS (comma list of IPs instead of DNS), OC_VPN_FAKEIPS, OC_VPN_FAKEUP, OC_VPN_FAST.
$ErrorActionPreference = 'Stop'
$State = $env:OC_STATE
$Act = $env:OC_VPN_ACT
$Sid = $env:OC_SID; if (-not $Sid) { $Sid = '-' }
$ResF = Join-Path $State 'vpn_result.txt'
$CurF = Join-Path $State 'vpn_current.txt'
$RtF = Join-Path $State 'vpn_routes.txt'
$Pipe = 'opencode-infinite-vgate'
$ClientSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$LogF = Join-Path $State 'vpn.log'
$FailF = Join-Path $State 'vpn_failed.txt'
$CacheF = Join-Path $State 'vgate.csv'
$CfgDir = Join-Path $State 'vgate'
$Api = 'https://www.vpngate.net/api/iphone/'
# the hosts OpenCode talks to; their current IPs are the only ones routed through the tunnel
$OcHosts = @('opencode.ai', 'models.opencode.ai', 'opentunnel.xyz')
# checked through a routed host, so a request that leaves by the physical route shows the old IP
$TraceUrl = 'https://opencode.ai/cdn-cgi/trace'
$Nap = $(if ($env:OC_VPN_FAST) { 0 } else { 3 })
function VLog([string]$m) { try { Add-Content -LiteralPath $LogF -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] [' + $Sid + '] [vpn] ' + $m) } catch { } }
function Say([string]$tpl, $a0, $a1) { if ($tpl) { Write-Host ('  ' + ($tpl -f $a0, $a1)) } }
function Fin([string]$status, [string]$ip = '', [string]$loc = '', [string]$name = '', [int]$tried = 0, [string]$tool = '', [string]$dir = '') {
  [IO.File]::WriteAllLines($ResF, [string[]]@(('STATUS=' + $status), ('IP=' + $ip), ('LOC=' + $loc), ('NAME=' + $name), ('TRIED=' + $tried), ('TOOL=' + $tool), ('DIR=' + $dir), 'PORT=0'))
  VLog ('result ' + $status + ' ip=' + $ip + ' name=' + $name + ' tried=' + $tried)
  if ($status -eq 'OK') { exit 0 } else { exit 1 }
}
# OpenVPN community build: the installed exe, or the one from winget. Missing and not installable = NOTOOL.
function Get-Ovpn {
  if ($env:OC_OVPN_EXE) { if (Test-Path -LiteralPath $env:OC_OVPN_EXE) { return $env:OC_OVPN_EXE }; return $null }
  foreach ($c in @((Join-Path $env:ProgramFiles 'OpenVPN\bin\openvpn.exe'), (Join-Path ${env:ProgramFiles(x86)} 'OpenVPN\bin\openvpn.exe'))) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  $w = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $w) { VLog 'winget is missing, OpenVPN cannot be installed'; return $null }
  VLog 'OpenVPN is missing, installing OpenVPNTechnologies.OpenVPN with winget'
  try {
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { VLog 'OpenVPN is missing and needs administrator rights: not asking; install it yourself or run this script as administrator'; return $null }
    $p = Start-Process -FilePath $w.Source -ArgumentList @('install', '--id', 'OpenVPNTechnologies.OpenVPN', '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements') -Wait -PassThru -WindowStyle Hidden
    VLog ('winget install exit ' + $p.ExitCode)
  } catch { VLog ('winget install failed: ' + $_.Exception.Message) }
  $c = Join-Path $env:ProgramFiles 'OpenVPN\bin\openvpn.exe'
  if (Test-Path -LiteralPath $c) { return $c }
  return $null
}
# the IPv4 addresses OpenCode's hosts resolve to right now, on this PC
function Get-OcIps {
  if ($env:OC_VG_IPS) { return @($env:OC_VG_IPS -split ',' | Where-Object { $_ }) }
  $ips = @()
  foreach ($h in $OcHosts) {
    # v2.40: IPv6 too, so Build-Ovpn can keep it off the physical route
    try { $ips += @([Net.Dns]::GetHostAddresses($h) | Where-Object { $_.AddressFamily -eq 'InterNetwork' -or ($_.AddressFamily -eq 'InterNetworkV6' -and -not $_.IsIPv6LinkLocal) } | ForEach-Object { $_.IPAddressToString }) }
    catch { VLog ('resolve failed ' + $h + ': ' + $_.Exception.Message) }
  }
  return @($ips | Sort-Object -Unique)
}
# the VPN Gate config with the server's own routes removed, and one route per OpenCode IP added.
# The server IP is never routed through the tunnel: that would loop the tunnel onto itself.
function Build-Ovpn([string]$text, [string[]]$ips) {
  $keep = @(); $server = @()
  foreach ($ln in ($text -split "`r?`n")) {
    if ($ln -match '^\s*remote\s+(\S+)') { $server += $matches[1] }
    if ($ln -match '^\s*(--)?(redirect-gateway|route|route-ipv6|route-nopull|dhcp-option|block-outside-dns|pull-filter)\b') { continue }
    # v2.40: openvpn runs elevated, so drop server-supplied directives that run programs, load code or touch local files
    if ($ln -match '^\s*(--)?(script-security|up|down|ipchange|plugin|tls-verify|auth-user-pass-verify|client-connect|client-disconnect|learn-address|tls-crypt-v2-verify|tls-export-cert|config|cd|chroot|log|log-append|status|writepid|tmp-dir|management\S*|win-sys|iproute|askpass|auth-user-pass|daemon|setenv|setenv-safe)(\s|$)') { continue }
    $keep += $ln
  }
  $srvIps = @()
  foreach ($s in $server) {
    if ($s -match '^\d{1,3}(\.\d{1,3}){3}$') { $srvIps += $s }
    else { try { $srvIps += @([Net.Dns]::GetHostAddresses($s) | ForEach-Object { $_.IPAddressToString }) } catch { } }
  }
  $keep += 'route-nopull'
  $keep += 'pull-filter ignore "redirect-gateway"'
  $keep += 'pull-filter ignore "dhcp-option"'
  $n = 0; $v6 = @()
  foreach ($ip in $ips) {
    if ($srvIps -contains $ip) { continue }
    if ($ip -like '*:*') { $v6 += $ip } else { $keep += ('route ' + $ip + ' 255.255.255.255') }
    $n++
  }
  # v2.40: Bun may ignore NODE_OPTIONS (not verified), so opencode's IPv6 left by the physical route. Its IPv6 goes into the tunnel and is refused there (block-ipv6): IPv4 wins, nothing leaks.
  if ($v6.Count -gt 0) {
    $keep += 'ignore-unknown-option block-ipv6'
    $keep += 'ifconfig-ipv6 fd15:53b6:dead::2/64 fd15:53b6:dead::1'
    $keep += 'block-ipv6'
    foreach ($ip in $v6) { $keep += ('route-ipv6 ' + $ip + '/128') }
  }
  return @{ text = ($keep -join "`r`n"); routes = $n }
}
# the VPN Gate list: fresh from the API, else the last saved copy (the API is slow and sometimes down)
function Get-Servers {
  $txt = $null
  if ($env:OC_VG_CSV) { try { $txt = [IO.File]::ReadAllText($env:OC_VG_CSV) } catch { } }
  else {
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      $txt = (Invoke-WebRequest -UseBasicParsing -Uri $Api -TimeoutSec 60).Content
      [IO.File]::WriteAllText($CacheF, $txt)
    } catch { VLog ('VPN Gate list download failed: ' + $_.Exception.Message) }
  }
  if (-not $txt -and (Test-Path -LiteralPath $CacheF)) { $txt = [IO.File]::ReadAllText($CacheF) }
  if (-not $txt) { return $null }
  $lines = @($txt -split "`r?`n")
  $hdr = @($lines | Where-Object { $_ -like '#HostName*' }) | Select-Object -First 1
  if (-not $hdr) { return $null }
  $body = @($lines | Where-Object { $_ -and $_[0] -ne '#' -and $_[0] -ne '*' })
  return @(($hdr.Substring(1) + "`n" + ($body -join "`n")) | ConvertFrom-Csv)
}
function Mark-Failed([string]$name, [string]$why) {
  try { Add-Content -LiteralPath $FailF -Value ($Sid + '|VG|' + $name + '|' + $why + '|' + (Get-Date -Format 's')) } catch { }
  VLog ('failed ' + $name + ': ' + $why)
}
function Get-Failed {
  $set = @{}
  if (Test-Path -LiteralPath $FailF) {
    foreach ($ln in (Get-Content -LiteralPath $FailF)) {
      $p = @($ln -split '\|')
      if ($p.Count -ge 5 -and $p[0] -eq $Sid -and $p[1] -eq 'VG') { $set[$p[2]] = 1 }
    }
  }
  return $set
}
# The VPN Gate helper (#>>>OC_VGHELP): one elevated process per session, reached through a named pipe that only
# this user can open. Vg-Call sends one line and returns the one-line answer, or $null when there is no helper.
function Vg-Call([string]$req, [int]$ms) {
  # retries while the helper turns to its next pipe instance (a short gap between two requests)
  $end = (Get-Date).AddMilliseconds($ms); $c = $null
  while ($null -eq $c) {
    $t = New-Object IO.Pipes.NamedPipeClientStream('.', $Pipe, [IO.Pipes.PipeDirection]::InOut)
    try { $t.Connect(200); $c = $t } catch { $t.Dispose(); if ((Get-Date) -ge $end) { return $null }; Start-Sleep -Milliseconds 100 }
  }
  try {
    $w = New-Object IO.StreamWriter($c, (New-Object Text.UTF8Encoding $false), 65536, $true); $w.AutoFlush = $true; $w.NewLine = "`n"
    $w.WriteLine($req)
    $r = New-Object IO.StreamReader($c, [Text.Encoding]::UTF8, $false, 65536, $true)
    $ans = $r.ReadLine()
    if ($ans) { return $ans }
    return $null
  } catch { return $null } finally { $c.Dispose() }
}
# starts the helper if it is not there. Never prompts for administrator rights. $false = not running or not up.
function Vg-Ensure {
  if ($null -ne (Vg-Call 'STATUS' 400)) { return $true }
  $l = Get-Content -LiteralPath $env:OCI_SELF
  $i = [Array]::IndexOf($l, '#>>>OC_VGHELP'); $e = [Array]::IndexOf($l, '#>>>OC_ENDVGHELP')
  if (($i -lt 0) -or ($e -le $i)) { VLog 'helper block is missing'; return $false }
  # v2.60 (N56): $VgTest is a switch inside the encoded command, not an environment
  # variable the caller can set. It is only on in the no-elevation test path.
  $pre = '$Pipe = ''' + $Pipe + '''; $ClientSid = ''' + $ClientSid + '''; $IdleSec = 600; $VgTest = $false'
  if ($env:OC_VG_NOELEV) { $pre += '; $VgTest = $true; $OvpnExe = ''' + $env:OC_OVPN_EXE + '''' }
  $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($pre + "`r`n" + (($l[($i+1)..($e-1)]) -join "`r`n")))
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $al = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ' + $enc
  # v2.60.4: no UAC prompt from this script. The helper starts only if this window is already administrator.
  if (-not $env:OC_VG_NOELEV -and -not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { VLog 'VPN Gate needs administrator rights: not asking; run this script as administrator to use it'; return $false }
  $hp = $null
  try {
    $hp = Start-Process -FilePath $ps -ArgumentList $al -WindowStyle Hidden -PassThru
  } catch { VLog 'the helper did not start'; return $false }
  # v3.1 (N17): the process object was thrown away, so a helper that died at once looked
  # like a prompt that never answered. A dead or absent helper is reported as such.
  if (-not $hp) { VLog 'the helper process did not start'; return $false }
  $end = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $end) { if ($hp.HasExited) { VLog ('the helper exited, code ' + $hp.ExitCode); return $false }; if ($null -ne (Vg-Call 'STATUS' 400)) { return $true }; Start-Sleep -Milliseconds 700 }
  return $false
}
# the config is sent as base64; the helper checks it and runs OpenVPN. $true = tunnel up.
function Vg-Start([string]$cfgText, [string[]]$ips, [int]$secs) {
  $ipsB = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($ips -join ' ')))
  $cfgB = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($cfgText))
  $r = Vg-Call ('START ' + $ipsB + ' ' + $cfgB + ' ' + $secs) (($secs + 30) * 1000)
  VLog ('helper: ' + $r)
  return ($r -eq 'OK')
}
# v2.60 (N18): 300 ms was shorter than a tunnel that is coming up, so STOP looked
# unanswered and the caller dropped the routes behind a live tunnel. It now waits
# for the answer and records it.
function Vg-Stop {
  $a = Vg-Call 'STOP' 5000
  if ($a -eq 'OK') { return $true }
  VLog ('stop: ' + $(if ($a) { $a } else { 'no answer' }))
  return $false
}
function Read-Cur {
  if (-not (Test-Path -LiteralPath $CurF)) { return $null }
  $p = @((Get-Content -LiteralPath $CurF -TotalCount 1) -split '\|')
  if ($p.Count -lt 2 -or $p[0] -ne 'VPNGATE') { return $null }
  return @{ name = $p[1]; ip = $(if ($p.Count -gt 2) { $p[2] } else { '' }) }
}
# the exit IP as OpenCode's own host sees it (through the tunnel when it is up)
function Get-ExitIp {
  if ($env:OC_VPN_FAKEIPS) {
    if (-not (Test-Path -LiteralPath $env:OC_VPN_FAKEIPS)) { return $null }
    $q = @(Get-Content -LiteralPath $env:OC_VPN_FAKEIPS | Where-Object { $_ })
    if ($q.Count -eq 0) { return $null }
    Set-Content -LiteralPath $env:OC_VPN_FAKEIPS -Value @($q | Select-Object -Skip 1)
    $p = @($q[0] -split '\s+')
    if ($p[0] -eq 'none') { return $null }
    return @{ ip = $p[0]; loc = $(if ($p.Count -gt 1) { $p[1] } else { '??' }) }
  }
  # IPv4 first: HttpWebRequest prefers IPv6 for opencode.ai, and an IPv6 request leaves by the physical route
  # (not the tunnel), so the check reported the old IP for a working tunnel
  $c4 = [string]::Join("`n", @(& curl.exe -4 -s --max-time 8 --noproxy '*' $TraceUrl 2>$null))
  $ip4 = ''; $loc4 = ''
  foreach ($ln in ($c4 -split "`n")) { if ($ln -like 'ip=*') { $ip4 = $ln.Substring(3).Trim() } elseif ($ln -like 'loc=*') { $loc4 = $ln.Substring(4).Trim() } }
  if ($ip4) { return @{ ip = $ip4; loc = $loc4 } }
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $r = [Net.HttpWebRequest]::Create($TraceUrl)
    # v3.1 (N54): Timeout bounds the response; ReadToEnd uses ReadWriteTimeout (300 s).
    $r.ReadWriteTimeout = 8000
    $r.Timeout = 8000
    $resp = $r.GetResponse(); $sr = New-Object IO.StreamReader($resp.GetResponseStream()); $t = $sr.ReadToEnd(); $sr.Close(); $resp.Close()
    $ip = ''; $loc = ''
    foreach ($ln in ($t -split "`n")) { if ($ln -like 'ip=*') { $ip = $ln.Substring(3).Trim() } elseif ($ln -like 'loc=*') { $loc = $ln.Substring(4).Trim() } }
    if ($ip) { return @{ ip = $ip; loc = $loc } }
  } catch { }
  return $null
}
# polls until the exit IP differs from $prev. state: new | same (answered, unchanged) | none (no answer)
function Wait-NewIp([string]$prev, [int]$secs) {
  $end = (Get-Date).AddSeconds($secs); $last = $null
  while ($true) {
    $r = Get-ExitIp
    if ($r) { $last = $r; if ($r.ip -ne $prev) { return @{ state = 'new'; r = $r } } }
    if ($env:OC_VPN_FAST -or ((Get-Date) -ge $end)) { break }
    Start-Sleep -Seconds $Nap
  }
  if ($last) { return @{ state = 'same'; r = $last } }
  return @{ state = 'none'; r = $null }
}
if ($Act -eq 'stop') { Vg-Call 'QUIT' 300 | Out-Null; Remove-Item -LiteralPath $CurF, $RtF -Force -ErrorAction SilentlyContinue; Fin 'DOWN' }
if ($Act -eq 'stopkeep') { Vg-Call 'STOP' 300 | Out-Null; Remove-Item -LiteralPath $CurF, $RtF -Force -ErrorAction SilentlyContinue; Fin 'DOWN' }
if ($Act -eq 'status') {
  $c = Read-Cur
  if (-not $c) { Fin 'DOWN' }
  $up = ((Vg-Call 'STATUS' 400) -eq 'UP')
  if ($env:OC_VPN_FAKEUP) { $up = ($env:OC_VPN_FAKEUP -eq '1') }
  if ($up -and -not $env:OC_VPN_FAKEUP) {
    $routed = @(); if (Test-Path -LiteralPath $RtF) { $routed = @(Get-Content -LiteralPath $RtF) }
    if (@(Get-OcIps | Where-Object { $routed -notcontains $_ }).Count -gt 0) { VLog 'opencode IPs changed since the routes were set'; $up = $false }
  }
  if ($up) { Fin 'OK' $c.ip '' $c.name } else { Fin 'DOWN' '' '' $c.name }
}

$exe = Get-Ovpn
if (-not $exe) { Fin 'NOTOOL' -tool 'OpenVPN' }
$ocIps = @(Get-OcIps)
if ($ocIps.Count -eq 0) { Fin 'NOIP' -tool 'OpenCode hosts' }
VLog ('opencode hosts resolve to: ' + ($ocIps -join ' '))
$cc = $(if ($env:VPNGATE_COUNTRY) { $env:VPNGATE_COUNTRY.Trim().ToUpper() } else { '' })
$max = [int]$(if ($env:VPNGATE_MAX) { $env:VPNGATE_MAX } else { 8 })
$timeout = [int]$(if ($env:VPN_TIMEOUT) { $env:VPN_TIMEOUT } else { 45 })
New-Item -ItemType Directory -Force -Path $CfgDir | Out-Null
$all = Get-Servers
if (-not $all) { Fin 'NOLIST' -tool 'VPN Gate' }
$failed = Get-Failed
$cands = @($all | Where-Object { $_.OpenVPN_ConfigData_Base64 -and -not $failed.ContainsKey($_.HostName) -and ($cc -eq '' -or $_.CountryShort -eq $cc) } | Sort-Object { $n = 0.0; if ([double]::TryParse([string]$_.Score, [ref]$n)) { $n } else { 0.0 } } -Descending | Select-Object -First $max)
if ($cands.Count -eq 0) { Fin 'NOCONF' -tool 'VPN Gate' -dir $cc }
$cur = Read-Cur
$curName = $(if ($cur) { $cur.name } else { '' })
$cands = @($cands | Where-Object { $_.HostName -ne $curName })
if ($env:OC_POOL_PREFER) { $cands = @(@($cands | Where-Object { $_.HostName -eq $env:OC_POOL_PREFER }) + @($cands | Where-Object { $_.HostName -ne $env:OC_POOL_PREFER })) }
if ($cands.Count -eq 0) { Vg-Stop; Remove-Item -LiteralPath $CurF -Force -ErrorAction SilentlyContinue; Fin 'ALLFAIL' -tool 'VPN Gate' -dir $cc }
if (-not (Vg-Ensure)) { Fin 'NOADMIN' -tool 'VPN Gate' }
# the exit IP to beat: OpenCode's host as seen from this PC right now (the old tunnel, if any, is still up until the switch)
$prevR = Get-ExitIp
$prev = $(if ($prevR) { $prevR.ip } else { '' })
$tried = 0
foreach ($s in $cands) {
  $tried++
  try {
  Say $env:OC_VPN_M_TRY $s.HostName
  Vg-Stop
  $raw = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($s.OpenVPN_ConfigData_Base64))
  $built = Build-Ovpn $raw $ocIps
  VLog ('config ' + $s.HostName + ': ' + $built.routes + ' opencode routes')
  [IO.File]::WriteAllText($RtF, ($ocIps -join "`r`n"))
  if (-not (Vg-Start $built.text $ocIps $timeout)) { Mark-Failed $s.HostName 'tunnel did not start'; Vg-Stop; continue }
  Set-Content -LiteralPath $CurF -Value ('VPNGATE|' + $s.HostName + '|')
  $w = Wait-NewIp $prev $timeout
  if ($w.state -eq 'new') {
    Set-Content -LiteralPath $CurF -Value ('VPNGATE|' + $s.HostName + '|' + $w.r.ip)
    Fin 'OK' $w.r.ip $w.r.loc $s.HostName $tried
  }
  if ($w.state -eq 'same') { Say $env:OC_VPN_M_SAME $s.HostName; Mark-Failed $s.HostName 'same exit IP' }
  else { Say $env:OC_VPN_M_NOANS $s.HostName $timeout; Mark-Failed $s.HostName 'no answer' }
  Vg-Stop
  } catch {
    Mark-Failed $s.HostName ('row error: ' + $_.Exception.Message)
    try { Vg-Stop } catch { }
    continue
  }
}
Vg-Stop
Remove-Item -LiteralPath $CurF -Force -ErrorAction SilentlyContinue
Fin 'ALLFAIL' -tool 'VPN Gate' -tried $tried -dir $cc
#>>>OC_ENDVGATE
#>>>OC_VGHELP
# VPN Gate helper (v2.54). Runs elevated ONCE per session (one UAC prompt), then serves the requests
# of the launcher user only: the named pipe accepts that user's SID alone. It never takes an exe or a
# folder from a request. Every config is checked against an allow-list and written to an
# administrator-only folder before OpenVPN reads it, so the user cannot change it in between.
# Input (set by the launcher above this text): $Pipe, $ClientSid, $IdleSec, and in tests only
# $VgTest and $OvpnExe. Test mode no longer comes from the environment, which the elevated
# process inherits from the unprivileged caller (N56).
$ErrorActionPreference = 'Stop'
$Test = [bool]$VgTest
$Dir = $(if ($Test) { $env:OC_VG_RUNDIR } else { Join-Path $env:ProgramData 'opencode-infinite\vgate-run' })
$Allowed = @('client', 'dev', 'dev-type', 'proto', 'remote', 'remote-random', 'nobind', 'persist-key', 'persist-tun', 'resolv-retry', 'cipher', 'data-ciphers', 'data-ciphers-fallback', 'auth', 'auth-nocache', 'comp-lzo', 'compress', 'verb', 'remote-cert-tls', 'key-direction', 'tls-client', 'tls-cipher', 'tls-version-min', 'verify-x509-name', 'ping', 'ping-restart', 'ping-exit', 'connect-retry', 'connect-retry-max', 'connect-timeout', 'keepalive', 'mssfix', 'tun-mtu', 'link-mtu', 'float', 'reneg-sec', 'explicit-exit-notify', 'allow-recursive-routing', 'ignore-unknown-option', 'route', 'route-nopull', 'route-ipv6', 'route-method', 'route-delay', 'pull-filter', 'ifconfig-ipv6', 'block-ipv6', 'fragment', 'sndbuf', 'rcvbuf', 'tcp-nodelay', 'tls-timeout')
$Blocks = @('ca', 'cert', 'key', 'tls-auth', 'tls-crypt')
function Harden([string]$d) {
  # v2.60 (N56): the hardening depended on the caller's environment variable, so any
  # process of the user could switch it off. It runs whenever the helper is elevated.
  $elev = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $elev) { return }
  $own = (Get-Acl -LiteralPath $d).GetOwner([Security.Principal.SecurityIdentifier]).Value
  if ($own -ne 'S-1-5-32-544' -and $own -ne 'S-1-5-18') { throw 'the run folder is not owned by administrators' }
  & icacls.exe $d /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
}
$Parent = Split-Path -Parent $Dir
foreach ($d in @($Parent, $Dir)) { if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d | Out-Null }; Harden $d }
# '' when every directive is allowed, else the first one that is not
# v2.60 (N57): the check used to look at the first token only, so a crafted entry could add
# any remote, any route or any pull-filter and the elevated helper would install it. Every
# directive that takes an argument is checked now, and the ones that run programs are
# refused by name.
function Cfg-Error([string]$t, [string[]]$ips) {
  $blk = ''
  $deny = @('route-up', 'up-restart', 'tls-crypt-v2', 'plugin', 'script-security', 'up', 'down', 'ipchange', 'learn-address', 'client-connect', 'client-disconnect', 'auth-user-pass-verify', 'tls-verify', 'tls-crypt-v2-verify', 'tls-export-cert', 'config', 'cd', 'chroot', 'log', 'log-append', 'status', 'writepid', 'tmp-dir', 'management', 'win-sys', 'askpass', 'setenv', 'setenv-safe')
  foreach ($ln in ($t -split "`r?`n")) {
    $s = $ln.Trim()
    if ($blk) { if ($s -eq ('</' + $blk + '>')) { $blk = '' }; continue }
    if ($s -match '^<([A-Za-z-]+)>$') { if ($Blocks -notcontains $matches[1]) { return ('block ' + $matches[1]) }; $blk = $matches[1]; continue }
    if ($s -eq '' -or $s[0] -eq '#' -or $s[0] -eq ';') { continue }
    $w = @($s -split '\s+')
    $k = $w[0]
    if ($deny -contains $k) { return ('directive ' + $k) }
    if ($Allowed -notcontains $k) { return ('directive ' + $k) }
    switch ($k) {
      'remote' {
        if ($w.Count -lt 2) { return 'remote without host' }
        if ($w[1] -notmatch '^[A-Za-z0-9][A-Za-z0-9.:_-]*$') { return ('remote host ' + $w[1]) }
        if ($w.Count -gt 2 -and $w[2] -notmatch '^\d{1,5}$') { return ('remote port ' + $w[2]) }
      }
      'route' {
        if ($w.Count -lt 2 -or -not ($ips -contains $w[1])) { return ('route ' + [string]$w[1]) }
      }
      'route-ipv6' {
        $ok = $false
        if ($w.Count -ge 2) { foreach ($ip in $ips) { if ($w[1] -eq ($ip + '/128')) { $ok = $true } } }
        if (-not $ok) { return ('route-ipv6 ' + [string]$w[1]) }
      }
      'ifconfig-ipv6' {
        if ($s -ne 'ifconfig-ipv6 fd15:53b6:dead::2/64 fd15:53b6:dead::1') { return 'ifconfig-ipv6' }
      }
      'pull-filter' {
        $arg = ''
        if ($w.Count -ge 3) { $arg = $w[1] + ' ' + $w[2].Trim('"') }
        if (@('ignore redirect-gateway', 'ignore dhcp-option') -notcontains $arg) { return 'pull-filter' }
      }
      'remote-cert-tls' {
        if ($w.Count -lt 2 -or @('server', 'client') -notcontains $w[1]) { return 'remote-cert-tls' }
      }
    }
  }
  if ($blk) { return 'unclosed block' }
  return ''
}
function Drop-Routes {
  $f = Join-Path $Dir 'routes.txt'
  if (-not (Test-Path -LiteralPath $f)) { return }
  foreach ($ip in @(Get-Content -LiteralPath $f)) {
    if ($ip) { Get-NetRoute -DestinationPrefix ($ip + $(if ($ip -like '*:*') { '/128' } else { '/32' })) -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -like 'OpenVPN*' } | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue }
  }
  Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
}
$script:Tun = $null
function Tun-Up { return ($null -ne $script:Tun -and -not $script:Tun.HasExited) }
function Stop-Tun {
  if ($script:Tun) { try { if (-not $script:Tun.HasExited) { Stop-Process -Id $script:Tun.Id -Force } } catch { }; $script:Tun = $null }
  Drop-Routes
  # v3.1 (N58): run.ovpn holds <key> and <tls-crypt> in the clear and used to survive
  # Stop-Tun, so the next candidate inherited the previous config.
  foreach ($f in @('run.ovpn', 'openvpn.log')) {
    try { $rp = Join-Path $Dir $f; if (Test-Path -LiteralPath $rp) { Remove-Item -LiteralPath $rp -Force -ErrorAction SilentlyContinue } } catch { }
  }
}
function Find-Ovpn {
  if ($Test) { return $OvpnExe }
  foreach ($c in @((Join-Path $env:ProgramFiles 'OpenVPN\bin\openvpn.exe'), (Join-Path ${env:ProgramFiles(x86)} 'OpenVPN\bin\openvpn.exe'))) { if (Test-Path -LiteralPath $c) { return $c } }
  return ''
}
# shared read: OpenVPN keeps its log open while it runs
function Read-Shared([string]$p) {
  $fs = [IO.File]::Open($p, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]'ReadWrite,Delete'))
  try { $sr = New-Object IO.StreamReader($fs); return $sr.ReadToEnd() } finally { $fs.Dispose() }
}
function Start-Vpn([string]$ipsText, [string]$cfgText, [int]$secs) {
  Stop-Tun
  $ovpn = Find-Ovpn
  if (-not $ovpn) { return 'FAIL openvpn is missing' }
  $ips = @($ipsText -split ' ' | Where-Object { $_ })
  if ($ips.Count -eq 0) { return 'FAIL no ip' }
  foreach ($ip in $ips) { $a = $null; if (-not [Net.IPAddress]::TryParse($ip, [ref]$a)) { return 'FAIL bad ip' } }
  # v2.60 (N57): the IP list is checked first, because route and route-ipv6 are only
  # allowed for those addresses.
  $err = Cfg-Error $cfgText $ips
  if ($err) { return ('FAIL config rejected: ' + $err) }
  $cfg = Join-Path $Dir 'run.ovpn'
  $log = Join-Path $Dir 'openvpn.log'
  Remove-Item -LiteralPath $log -Force -ErrorAction SilentlyContinue
  [IO.File]::WriteAllText($cfg, $cfgText, (New-Object Text.UTF8Encoding $false))
  [IO.File]::WriteAllText((Join-Path $Dir 'routes.txt'), ($ips -join "`r`n"))
  $p = Start-Process -FilePath $ovpn -ArgumentList @('--config', ('"' + $cfg + '"'), '--log', ('"' + $log + '"'), '--verb', '3', '--connect-retry-max', '2', '--auth-nocache') -WindowStyle Hidden -PassThru
  $script:Tun = $p
  $end = (Get-Date).AddSeconds($secs)
  while ((Get-Date) -lt $end) {
    if (Test-Path -LiteralPath $log) {
      $t = Read-Shared $log
      if ($t -match 'Initialization Sequence Completed') { return 'OK' }
      if ($t -match 'AUTH_FAILED|Exiting due to fatal error|SIGTERM') { break }
    }
    if ($p.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }
  Stop-Tun
  return 'FAIL tunnel did not start'
}
function Handle([string]$req) {
  $p = @($req -split ' ', 5)
  switch ($p[0]) {
    'STATUS' { if (Tun-Up) { return 'UP' } else { return 'DOWN' } }
    'STOP' { Stop-Tun; return 'OK' }
    'QUIT' { Stop-Tun; return 'OK' }
    'START' {
      if ($p.Count -lt 4) { return 'FAIL bad request' }
      $secs = 0; if (-not [int]::TryParse($p[3], [ref]$secs) -or $secs -lt 5 -or $secs -gt 300) { return 'FAIL bad timeout' }
      $ipsText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[1]))
      $cfgText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[2]))
      return (Start-Vpn $ipsText $cfgText $secs)
    }
    default { return 'FAIL unknown request' }
  }
}
$sec = New-Object IO.Pipes.PipeSecurity
$sec.AddAccessRule((New-Object IO.Pipes.PipeAccessRule((New-Object Security.Principal.SecurityIdentifier($ClientSid)), [IO.Pipes.PipeAccessRights]::ReadWrite, [Security.AccessControl.AccessControlType]::Allow)))
$lastUse = Get-Date
while ($true) {
  # v2.60 (N18): two instances, so a client that connects and stalls no longer holds
  # the only pipe while the launcher waits for its answer.
  $srv = New-Object IO.Pipes.NamedPipeServerStream -ArgumentList @($Pipe, [IO.Pipes.PipeDirection]::InOut, 2, [IO.Pipes.PipeTransmissionMode]::Byte, [IO.Pipes.PipeOptions]::Asynchronous, 65536, 65536, $sec)
  $task = $srv.WaitForConnectionAsync()
  $idle = $false
  while (-not $task.Wait(1000)) { if (((Get-Date) - $lastUse).TotalSeconds -gt $IdleSec) { $idle = $true; break } }
  if ($idle) { $srv.Dispose(); Stop-Tun; break }
  $quit = $false
  try {
    $r = New-Object IO.StreamReader($srv, [Text.Encoding]::UTF8, $false, 65536, $true)
    $w = New-Object IO.StreamWriter($srv, (New-Object Text.UTF8Encoding $false), 65536, $true)
    $w.AutoFlush = $true; $w.NewLine = "`n"
    # v2.60 (N18): a synchronous ReadLine with no deadline let one client that never
    # finished its line hang the whole helper. The read is async and gives up after 10 s.
    $req = ''
    $rt = $r.ReadLineAsync()
    if ($rt.Wait(10000)) {
      $req = [string]$rt.Result
      try { $res = [string](Handle $req) } catch { $res = 'FAIL ' + ($_.Exception.Message -replace '\s+', ' ') }
    } else { $res = 'FAIL timeout' }
    $w.WriteLine($res)
    $quit = ($req -like 'QUIT*')
    $lastUse = Get-Date
  } catch { } finally { try { $srv.WaitForPipeDrain() } catch { }; try { $srv.Disconnect() } catch { }; $srv.Dispose() }
  if ($quit) { break }
}
#>>>OC_ENDVGHELP
#>>>OC_POOL_PS
# Pool worker (v2.54). Runs only while Settings is open (see :pool_start / :pool_stop).
# Keeps tested IPs in <STATE>\pool\ip_pool.txt, one line per entry: mode TAB id TAB ip TAB loc.
# OC_POOL_ACT=take: prints the id of one saved entry of OC_POOL_MODE whose ip is not OC_POOL_CUR, and removes it.
$ErrorActionPreference = 'Continue'
$st = $env:OC_STATE
$pool = Join-Path $st 'pool'
New-Item -ItemType Directory -Force -Path $pool | Out-Null
$pfile = Join-Path $pool 'ip_pool.txt'
$stopF = Join-Path $pool 'stop.flag'
$doneF = Join-Path $pool 'done.flag'
$max = [int]$(if ($env:POOL_MAX) { $env:POOL_MAX } else { 5 })
$iv = [Math]::Max(5, [int]$(if ($env:POOL_INTERVAL) { $env:POOL_INTERVAL } else { 60 }))
$psx = $(if ($env:PSX) { $env:PSX } else { 'powershell' })

function Pool-Load { if (Test-Path -LiteralPath $pfile) { return @(Get-Content -LiteralPath $pfile -Encoding UTF8 | Where-Object { ($_ -split "`t").Count -eq 4 }) }; return @() }
function Pool-Save([string[]]$l) { [IO.File]::WriteAllLines($pfile, [string[]]@($l), (New-Object Text.UTF8Encoding($false))) }
function Pool-Count([string]$mode) { return @(Pool-Load | Where-Object { ($_ -split "`t")[0] -eq $mode }).Count }
function Pool-Add([string]$mode, [string]$id, [string]$ip, [string]$loc) {
  $l = @(Pool-Load)
  foreach ($x in $l) { $p = $x -split "`t"; if ($p[0] -eq $mode -and ($p[1] -eq $id -or $p[2] -eq $ip)) { return } }
  $new = (@($mode, $id, $ip, $loc) -join "`t")
  $mine = @($l | Where-Object { ($_ -split "`t")[0] -eq $mode }) + $new
  $others = @($l | Where-Object { ($_ -split "`t")[0] -ne $mode })
  Pool-Save (@($others) + @($mine | Select-Object -Last $max))
}
function Pool-Take([string]$mode, [string]$cur) {
  $l = @(Pool-Load)
  $hit = $null
  foreach ($x in $l) { $p = $x -split "`t"; if ($p[0] -eq $mode -and $p[2] -ne $cur) { $hit = $x; break } }
  if ($null -eq $hit) { return '' }
  Pool-Save @($l | Where-Object { $_ -ne $hit })
  return [string](($hit -split "`t")[1])
}

# rotation: the id to try first, removed from the pool; prints nothing when the pool has none
if ($env:OC_POOL_ACT -eq 'take') { Write-Output (Pool-Take $env:OC_POOL_MODE $env:OC_POOL_CUR); exit 0 }

function Stopping { return (Test-Path -LiteralPath $stopF) }

# the helper's pipe, one request one answer; '' = helper not running (never starts it, never asks for administrator)
function Vg-Quick([string]$req) {
  try {
    $c = New-Object System.IO.Pipes.NamedPipeClientStream('.', 'opencode-infinite-vgate', [System.IO.Pipes.PipeDirection]::InOut)
    $c.Connect(400)
    $w = New-Object System.IO.StreamWriter($c)
    $w.AutoFlush = $true
    $w.Write($req + "`n")
    $r = New-Object System.IO.StreamReader($c)
    $ans = [string]$r.ReadLine()
    $c.Dispose()
    return $ans
  } catch { return '' }
}

# one VPN block as a hidden child (it calls exit): its messages stay off the Settings screen
function Run-Vpn([string]$startM, [string]$endM, [string]$act) {
  $oldAct = $env:OC_VPN_ACT; $oldState = $env:OC_STATE; $oldSid = $env:OC_SID
  $env:OC_VPN_ACT = $act; $env:OC_STATE = $pool; $env:OC_SID = 'pool'
  $cmd = '$l=Get-Content -LiteralPath $env:OCI_SELF; $i=[Array]::IndexOf($l,''' + $startM + '''); $e=[Array]::IndexOf($l,''' + $endM + '''); if(($i -lt 0) -or ($e -le $i)){exit 90}; Invoke-Expression (($l[($i+1)..($e-1)]) -join [Environment]::NewLine)'
  $p = Start-Process -FilePath $psx -ArgumentList ('-NoProfile -Command "' + $cmd + '"') -WindowStyle Hidden -PassThru
  # v3.1 (N59): -Wait with no pid meant :pool_stop could only give up after 120 s. The
  # child is recorded in pool\fill.pid while it runs; :pool_stop kills that tree.
  if ($p) { try { Set-Content -LiteralPath (Join-Path $pool 'fill.pid') -Value ([string]$p.Id) } catch { }; [void]$p.WaitForExit() }
  try { Remove-Item -LiteralPath (Join-Path $pool 'fill.pid') -Force -ErrorAction SilentlyContinue } catch { }
  $env:OC_VPN_ACT = $oldAct; $env:OC_STATE = $oldState; $env:OC_SID = $oldSid
  if ($p) { return $p.ExitCode } else { return 1 }
}

function Fill-Vpn([string]$mode) {
  if ($mode -eq 'VPNGATE') { $sM = '#>>>OC_VGATE_PS'; $eM = '#>>>OC_ENDVGATE' } else { $sM = '#>>>OC_VPN_PS'; $eM = '#>>>OC_ENDVPN' }
  Remove-Item -LiteralPath (Join-Path $pool 'vpn_result.txt') -Force -ErrorAction SilentlyContinue
  [void](Run-Vpn $sM $eM 'switch')
  $r = @{}
  $rf = Join-Path $pool 'vpn_result.txt'
  if (Test-Path -LiteralPath $rf) { foreach ($x in @(Get-Content -LiteralPath $rf)) { $kv = $x -split '=', 2; if ($kv.Count -eq 2) { $r[$kv[0]] = $kv[1] } } }
  if ($r['STATUS'] -eq 'OK' -and $r['IP']) { Pool-Add $mode $r['NAME'] $r['IP'] $r['LOC'] }
  [void](Run-Vpn $sM $eM 'stopkeep')
}

# proxy list: the same download and normalizer as the launcher; refreshed every 30 minutes
function Get-Plist {
  $src = ([string]$env:PROXY_LIST_URL).Trim().Trim('"')
  $raw = Join-Path $pool 'proxy_list_raw.txt'
  $plist = Join-Path $pool 'proxy_list.txt'
  $age = 9999
  if (Test-Path -LiteralPath $raw) { $age = ((Get-Date) - (Get-Item -LiteralPath $raw).LastWriteTime).TotalMinutes }
  if ($src -and $age -gt 30) {
    # v2.55 (N60): download to .tmp, check the exit code, size and format, and only then
    # replace the list and drop the tested history. A failed download or an error page used
    # to erase both files and leave the pool without a list or a record of what was tried.
    $dtmp = $raw + '.tmp'
    $ptmp = $plist + '.new'
    Remove-Item -LiteralPath $dtmp, $ptmp -Force -ErrorAction SilentlyContinue
    $got = $false
    if ($src -match '^(https?|ftp)://') {
      if ($env:HAVE_CURL -eq '1') { & curl.exe -L -f -s --max-time 20 --noproxy '*' -o $dtmp $src 2>$null; $got = ($LASTEXITCODE -eq 0) }
      else { try { Invoke-WebRequest -UseBasicParsing -Uri $src -OutFile $dtmp -TimeoutSec 20 -ErrorAction Stop; $got = $true } catch {} }
    } elseif ($src -notmatch '^file://') { Copy-Item -LiteralPath $src -Destination $dtmp -Force -ErrorAction SilentlyContinue; $got = (Test-Path -LiteralPath $dtmp) }
    if ($got -and (Test-Path -LiteralPath $dtmp) -and (Get-Item -LiteralPath $dtmp).Length -ge [int]$(if ($env:PROXY_LIST_MIN_BYTES) { $env:PROXY_LIST_MIN_BYTES } else { 20 })) {
      $env:OC_PRAW = $dtmp; $env:OC_PLIST = $ptmp
      $nl = Get-Content -LiteralPath $env:OCI_SELF
      $ni = [Array]::IndexOf($nl, '#>>>OC_PLIST_PS'); $ne = [Array]::IndexOf($nl, '#>>>OC_ENDPLIST')
      $n = 0
      if (($ni -ge 0) -and ($ne -gt $ni)) {
        $cnt = @(Invoke-Expression (($nl[($ni+1)..($ne-1)]) -join [Environment]::NewLine))
        if ($cnt.Count -gt 0) { [void][int]::TryParse([string]$cnt[$cnt.Count - 1], [ref]$n) }
      }
      if ($n -gt 0) {
        Move-Item -LiteralPath $dtmp -Destination $raw -Force -ErrorAction SilentlyContinue
        Move-Item -LiteralPath $ptmp -Destination $plist -Force -ErrorAction SilentlyContinue
        if ((Test-Path -LiteralPath $raw) -and (Test-Path -LiteralPath $plist)) {
          Remove-Item -LiteralPath (Join-Path $pool 'proxy_tested.txt') -Force -ErrorAction SilentlyContinue
        }
      }
    }
    Remove-Item -LiteralPath $dtmp, $ptmp -Force -ErrorAction SilentlyContinue
    $env:OC_PRAW = $raw; $env:OC_PLIST = $plist
  }
  return (Test-Path -LiteralPath $plist)
}

function Fill-Proxy {
  if (-not (Get-Plist)) { return }
  $plist = Join-Path $pool 'proxy_list.txt'
  $tf = Join-Path $pool 'proxy_tested.txt'
  $tested = @(); if (Test-Path -LiteralPath $tf) { $tested = @(Get-Content -LiteralPath $tf) }
  $burnF = Join-Path $st 'proxy_burned.txt'
  $burn = @(); if (Test-Path -LiteralPath $burnF) { $burn = @(Get-Content -LiteralPath $burnF) }
  $tryMax = [int]$(if ($env:PROXY_TRY_MAX) { $env:PROXY_TRY_MAX } else { 40 })
  $to = [int]$(if ($env:PROXY_PROBE_TIMEOUT) { $env:PROXY_PROBE_TIMEOUT } else { 8 })
  $trace = $(if ($env:TRACE_URL) { $env:TRACE_URL } else { 'https://www.cloudflare.com/cdn-cgi/trace' })
  # Candidates: list entries not tried yet, in random order. When every entry was tried, the record restarts.
  $cands = @()
  for ($round = 0; $round -lt 2 -and $cands.Count -eq 0; $round++) {
    $hpSeen = @{}
    $cands = @(Get-Content -LiteralPath $plist | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -and $_ -notmatch '^[#;]' -and $_ -notmatch 'socks' } | ForEach-Object { $(if ($_ -match '^https?://') { $_ } else { 'http://' + $_ }) } | Where-Object { ($tested -notcontains $_) -and ($burn -notcontains $_) -and ($burn -notcontains ($_ -replace '^https?://', '')) } | Where-Object { $k = ($_ -replace '^https?://([^@]*@)?', ''); if ($hpSeen.ContainsKey($k)) { $false } else { $hpSeen[$k] = 1; $true } } | Sort-Object { Get-Random })
    if ($cands.Count -eq 0) { Remove-Item -LiteralPath $tf -Force -ErrorAction SilentlyContinue; $tested = @() }
  }
  $tries = 0
  foreach ($url in $cands) {
    if ((Stopping) -or $tries -ge $tryMax -or (Pool-Count 'PROXY') -ge $max) { break }
    $tries++
    Add-Content -LiteralPath $tf -Value $url
    $tr = & curl.exe -s -f --max-time $to --proxy $url --noproxy 'none.invalid' $trace 2>$null
    if (($LASTEXITCODE -ne 0) -or -not $tr) { continue }
    $ip = ''; $loc = ''
    foreach ($ln in @($tr)) { if ($ln -match '^ip=(.+)$') { $ip = $Matches[1].Trim() }; if ($ln -match '^loc=(.+)$') { $loc = $Matches[1].Trim() } }
    if ($ip) { Pool-Add 'PROXY' $url $ip $loc }
  }
}

Remove-Item -LiteralPath $doneF -Force -ErrorAction SilentlyContinue
try {
  while (-not (Stopping)) {
    if ($env:PROXY_LIST_URL -and $env:HAVE_CURL -eq '1' -and (Pool-Count 'PROXY') -lt $max) { Fill-Proxy }
    if (Stopping) { break }
    # VPN Gate only when its helper already runs and no tunnel is up (the pool never asks for administrator)
    if ((Pool-Count 'VPNGATE') -lt $max) { $ah = Vg-Quick 'STATUS'; if ($ah -and $ah -ne 'UP') { Fill-Vpn 'VPNGATE' } }
    if (Stopping) { break }
    if ((Pool-Count 'WIREGUARD') -lt $max) { Fill-Vpn 'WIREGUARD' }
    for ($s = 0; ($s -lt $iv) -and -not (Stopping); $s++) { Start-Sleep -Seconds 1 }
  }
} finally {
  Set-Content -LiteralPath $doneF -Value 'done'
}
#>>>OC_ENDPOOL
#>>>OC_CHAT_PS
# Reads the chat of the current folder through the opencode CLI. Run by :chat_run.
# In (env): OC_CHAT_ACT = snapshot | empty | resume | typed, OC_EXE (opencode), OC_STATE.
#   resume also reads OC_RMODE (continue | last | custom), OC_BASE (the message for continue / custom),
#   OC_SKIP1 / OC_SKIP2 (texts that never count as "your last message": the resume message itself).
# Out: STATE\chat_result.txt (KEY=value lines; nothing written on any failure) and, for snapshot, the
# last messages printed on the console. Text that reaches the batch is stripped of cmd metacharacters,
# except MSG (the text that is sent): v2.40 keeps its & | < > ^ % \ and only SHOW (for echo) is stripped.
# Test hook: OC_CHAT_FILE = a session export (JSON) read instead of calling the CLI.
$ErrorActionPreference = 'Stop'
$Act = $env:OC_CHAT_ACT
$Out = Join-Path $env:OC_STATE 'chat_result.txt'
function Put([string[]]$lines) { [IO.File]::WriteAllLines($Out, $lines) }
function Clean([string]$t, [int]$max) {
  $t = ($t -replace '[\r\n]+', ' ') -replace ('[&|<>^%\\' + [char]34 + '\x00-\x1f]'), ' '
  $t = ($t -replace '\s{2,}', ' ').Trim()
  if ($t.Length -gt $max) { $t = $t.Substring(0, $max) }
  return $t
}
# v2.40: the message that is SENT. Only control chars, double quotes (they break set "..." and the argument)
# and trailing backslashes (they would escape the closing quote) change; it travels via env vars, not echo.
function CleanMsg([string]$t, [int]$max) {
  $t = ($t -replace '[\r\n]+', ' ') -replace '[\x00-\x1f]', ' '
  $t = ($t.Replace([string][char]34, "'") -replace '\s{2,}', ' ').Trim()
  if ($t.Length -gt $max) { $t = $t.Substring(0, $max) }
  return ($t -replace '\\+$', '')
}
# v2.40: a CLI call bounded to 20 s (a hung one used to freeze the launcher); returns its stdout or $null.
function Run-Cli([string[]]$a) {
  $f = Join-Path $env:OC_STATE ('chat_cli_' + $PID + '.txt')
  try {
    $exe = $env:OC_EXE; $al = $a
    if ($exe -match '[.](cmd|bat)$') { $al = @('/s', '/c', ([char]34 + [char]34 + $exe + [char]34 + ' ' + ($a -join ' ') + [char]34)); $exe = 'cmd.exe' }
    $p = Start-Process -FilePath $exe -ArgumentList $al -NoNewWindow -PassThru -RedirectStandardOutput $f -RedirectStandardError ($f + '.err')
    if (-not $p) { return $null }
    $null = $p.Handle
    if (-not $p.WaitForExit(20000)) { & taskkill.exe /T /F /PID $p.Id *> $null; return $null }
    return (Get-Content -LiteralPath $f -Raw -Encoding UTF8)
  } finally { Remove-Item -LiteralPath $f, ($f + '.err') -ErrorAction SilentlyContinue }
}
# the newest chat of the folder opencode runs in (the same one --continue picks), as its export
function Get-Chat {
  if ($env:OC_CHAT_FILE) { return (Get-Content -LiteralPath $env:OC_CHAT_FILE -Raw -Encoding UTF8 | ConvertFrom-Json) }
  $j = @((Run-Cli @('session', 'list', '--format', 'json', '-n', '1')) | ConvertFrom-Json)
  if ($j.Count -eq 0 -or -not $j[0].id -or ([string]$j[0].id) -notmatch '^[A-Za-z0-9_-]+$') { return $null }
  return ((Run-Cli @('session', 'export', [string]$j[0].id)) | ConvertFrom-Json)
}
try {
  if ($Act -eq 'typed') {
    # keys typed while the batch was busy are still waiting in the console: Enter ends the text
    $sb = New-Object Text.StringBuilder
    while ([Console]::KeyAvailable) {
      $k = [Console]::ReadKey($true)
      if ($k.Key -eq 'Enter') { break }
      if ($k.Key -eq 'Backspace') { if ($sb.Length) { $sb.Length = $sb.Length - 1 }; continue }
      if ($k.KeyChar -ge [char]32) { [void]$sb.Append($k.KeyChar) }
    }
    $t = Clean $sb.ToString() 500
    if ($t) { Put @('TYPED=' + $t) }
    exit 0
  }
  if ($Act -eq 'sid') {
    $j = @((Run-Cli @('session', 'list', '--format', 'json', '-n', '1')) | ConvertFrom-Json)
    if ($j.Count -and ([string]$j[0].id) -match '^[A-Za-z0-9_-]+$') { Put @('SID=' + [string]$j[0].id) }
    exit 0
  }
  $e = Get-Chat
  if ($Act -eq 'empty') {
    $n = $(if ($e) { @($e.messages | Where-Object { $_.type -eq 'user' }).Count } else { 1 })
    Put @('EMPTY=' + $(if ($n -eq 0) { '1' } else { '0' }))
    exit 0
  }
  if (-not $e) { exit 0 }
  if ($Act -eq 'snapshot') {
    $u = @($e.messages | Where-Object { $_.type -eq 'user' -and $_.text })
    $a = @($e.messages | Where-Object { $_.type -eq 'assistant' })
    if ($u.Count) { Write-Host ('  > ' + ((([string]$u[-1].text).Trim() -replace '\r?\n', "`n    ") | ForEach-Object { if ($_.Length -gt 1500) { $_.Substring(0, 1500) + ' ...' } else { $_ } })) }
    if ($a.Count) {
      $tx = @($a[-1].content | Where-Object { $_.type -eq 'text' -and $_.text })
      if ($tx.Count) { Write-Host ''; Write-Host ('  < ' + ((([string]$tx[-1].text).Trim() -replace '\r?\n', "`n    ") | ForEach-Object { if ($_.Length -gt 1500) { $_.Substring(0, 1500) + ' ...' } else { $_ } })) }
    }
    exit 0
  }
  if ($Act -eq 'resume') {
    $msg = CleanMsg ([string]$env:OC_BASE) 1500
    $users = @($e.messages | Where-Object { $_.type -eq 'user' -and $_.text })
    if ($env:OC_RMODE -eq 'last') {
      # your last real message: the resume message sent earlier does not count
      $skip = @($env:OC_SKIP1, $env:OC_SKIP2 | Where-Object { $_ } | ForEach-Object { $_.Trim() })
      $real = @($users | Where-Object { $skip -notcontains ([string]$_.text).Trim() })
      if ($real.Count) { $m = CleanMsg ([string]$real[-1].text) 1500; if ($m) { $msg = $m } }
    }
    # already waiting: the last thing in the chat is this very message and nothing answered it
    $turns = @($e.messages | Where-Object { $_.type -eq 'user' -or $_.type -eq 'assistant' })
    $dup = '0'
    if ($turns.Count -and $turns[-1].type -eq 'user' -and (CleanMsg ([string]$turns[-1].text) 1500) -eq $msg) { $dup = '1' }
    Put @(('DUP=' + $dup), ('MSG=' + $msg), ('SHOW=' + (Clean $msg 80)))
    exit 0
  }
} catch { if ($env:OC_CHAT_DEBUG) { Write-Host ('chat module error: ' + $_ + ' at line ' + $_.InvocationInfo.ScriptLineNumber) } }
exit 0
#>>>OC_ENDCHAT

#>>>OC_PICKER_PS
$ErrorActionPreference = 'Stop'
$start = $env:OC_START
if ($env:OC_MODE -eq 'classic') {
    Add-Type -AssemblyName System.Windows.Forms
    $d = New-Object System.Windows.Forms.FolderBrowserDialog
    $d.Description = 'Folder to open OpenCode in'
    $d.ShowNewFolderButton = $true
    if ($start -and (Test-Path -LiteralPath $start)) { $d.SelectedPath = $start }
    if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::Out.WriteLine($d.SelectedPath)
    }
    exit 0
}
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

[ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
public class FileOpenDialog { }

[ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IShellItem
{
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, out IntPtr ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
}

[ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IFileDialog
{
    [PreserveSig] int Show(IntPtr hwndParent);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint pfos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName(out IntPtr pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
    void AddPlace(IShellItem psi, int fdap);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr pFilter);
}

public static class Shell
{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    public static extern void SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
        IntPtr pbc,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);

    public static string PickFolder(string title, string start)
    {
        IFileDialog dlg = (IFileDialog)new FileOpenDialog();
        uint opt;
        dlg.GetOptions(out opt);
        dlg.SetOptions(opt | 0x20 | 0x40);
        dlg.SetTitle(title);
        if (!string.IsNullOrEmpty(start) && Directory.Exists(start))
        {
            try
            {
                IShellItem folder;
                SHCreateItemFromParsingName(start, IntPtr.Zero, typeof(IShellItem).GUID, out folder);
                dlg.SetFolder(folder);
            }
            catch { }
        }
        int hr = dlg.Show(IntPtr.Zero);
        if (hr != 0) return null;
        IShellItem item;
        dlg.GetResult(out item);
        IntPtr ptr;
        item.GetDisplayName(0x80058000, out ptr);
        try { return Marshal.PtrToStringUni(ptr); }
        finally { Marshal.FreeCoTaskMem(ptr); }
    }
}
"@
$path = [Shell]::PickFolder('Folder to open OpenCode in', $start)
if ($path -and (Test-Path -LiteralPath $path)) {
    [Console]::Out.WriteLine($path)
}
