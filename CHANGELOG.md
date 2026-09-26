# Changelog

## 0.1.0

- Safe port-based process termination with graceful SIGTERM escalation to SIGKILL via `--timeout <seconds>`.
- Immediate force termination mode using `-f, --force` sending SIGKILL directly.
- Interactive multi-select port killer on bare `killx` invocation.
- Interactive command menu launcher via `-i, --interactive` or automatic fallback when no listeners are found.
- Interactive menu actions: inspect/kill ports, direct port kill, stop dev servers, process search & kill, port inspect, port check, find free port, and update check.
- Fast batch multi-port and range parsing (e.g. `killx 3000 8080`, `killx 3000-3005`).
- Detailed inspection command `killx info <port>` (alias: `i`) showing process name, PID, user, protocol, state, and command line.
- Availability checking command `killx check <port>` (alias: `c`) with boolean JSON output and visual status indicators.
- Listening port enumeration `killx list [range]` (alias: `ls`) with `--process <name>` and `--port <port>` filter flags.
- Free ephemeral port discovery `killx free [port]` with auto-increment search.
- Process search and termination command `killx ps [query]` (alias: `process`) with `--kill` flag and interactive confirmation.
- Automated development server cleanup `killx dev` targeting node, bun, deno, vite, next, python, rails, ruby, php, and java.
- Port state polling `killx wait <port>` with `--occupied` detection and configurable timeout.
- Real-time port monitoring `killx watch <port>` with `--interval <ms>`, timestamped logs, and abortable signal handling.
- Self-updating system `killx update` and `killx check-update` with 60-second manual rate limiting and local cache.
- Structured `-j, --json` machine-readable output for all commands.
- Silent execution mode `-q, --quiet` suppressing successful non-error output for scripting.
- Color disabling support via `--no-color` flag and standard `NO_COLOR` environment variable.
- Standardized exit codes: 0 (Success), 1 (Generic error), 2 (Invalid arguments), 3 (Not found), 4 (Permission denied), 5 (Termination failed).
- Contextual failure remediation suggestions (`sudo killx <port>`, `killx <port> --force`).
- Self PID protection preventing accidental self-termination.
- Cross-platform inspection engine supporting macOS (`lsof`), Linux (`lsof` and `ss` fallback), and Windows (`netstat` and PowerShell).
- High-performance cached metadata queries on Windows avoiding redundant PowerShell calls.
- Zero runtime dependencies in non-interactive mode; standalone single-file bundled executable (`dist/cli.js`).
