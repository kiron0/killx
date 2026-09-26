# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-26

### Added

- **Core Port Termination**:
  - Graceful termination using `SIGTERM` with configurable escalation timeout (`--timeout <seconds>`).
  - Immediate termination via `-f, --force` sending `SIGKILL` directly.
  - Multi-port and port range parsing (e.g. `killx 3000 8080`, `killx 3000-3005`).
  - Confirmation safety guard with `-y, --yes` flag to bypass for automated scripts.
  - Formatted failure feedback with remediation hints (`sudo killx <port>`, `killx <port> --force`).

- **Interactive UI (Clack)**:
  - Interactive multi-select port killer on `killx` with zero arguments.
  - Interactive command launcher via `-i, --interactive` flag or fallback when zero listeners are found.
  - Direct actions in interactive menu:
    - Inspect / kill listening ports.
    - Kill specific port or range with validation.
    - Stop common development servers (`node`, `bun`, `deno`, `vite`, `next`, `python`, `rails`, etc.).
    - Search & terminate processes with confirmation prompt.
    - Inspect listener details and check port availability.
    - Find free random ports and trigger self-updates.

- **CLI Commands**:
  - `killx kill <port...>`: Terminate listeners on specified ports or ranges.
  - `killx info <port>` (alias: `i`): Display listener process name, PID, user, protocol, state, and command line.
  - `killx check <port>` (alias: `c`): Check whether a port is occupied or available.
  - `killx list [range]` (alias: `ls`): List listening ports with optional `--process <name>` and `--port <port>` filters.
  - `killx free [port]`: Find next available ephemeral or starting port.
  - `killx ps [query]` (alias: `process`): Search running processes by command line or name, with optional `--kill`.
  - `killx dev`: Scan and stop common dev servers with single command.
  - `killx wait <port>`: Wait until a port becomes available or `--occupied`, with timeout support.
  - `killx watch <port>`: Stream state changes for a port with timestamped output and abortable signal handling.
  - `killx update`: Check registry and install updates globally with rate-limiting and cache support.
  - `killx check-update`: Check npm registry for new versions without installing.

- **Cross-Platform Support**:
  - **macOS**: Native `lsof -nP -iTCP -sTCP:LISTEN` parser with process command-line enrichment.
  - **Linux**: High-speed `lsof` with multi-distribution `ss -H -lptn` fallback and `/proc` enrichment.
  - **Windows**: `netstat -ano -p tcp` with cached parallel PowerShell CIM metadata lookup and `taskkill /PID <pid> /T /F` support.

- **Production Tooling & Output**:
  - Structured `-j, --json` output for all inspection and termination commands.
  - Silent `-q, --quiet` mode suppressing non-error output for scripting.
  - `--no-color` flag and standard `NO_COLOR` environment variable support.
  - Robust exit codes: `0` (Success), `1` (Generic error), `2` (Invalid arguments), `3` (Not found), `4` (Permission denied), `5` (Termination failure).
  - Self PID protection preventing accidental self-termination.
  - Graceful `SIGINT` interruption handling.
