# Changelog

## 1.0.0

### Production Release & Architecture Overhaul

- **Process Tree Killing (`--tree`)**:
  - Automatically climb process hierarchy above the listening process to identify and terminate supervisor roots (e.g. `npm`, `pnpm`, `yarn`, `bun`, `cargo`, `docker-compose`, `go`, `python`).
  - Safe interactive login shell detection stopping climb at shells (`zsh`, `bash`, `fish`, `sh`) while correctly traversing intermediate subshell wrappers spawned by npm scripts (`/bin/sh -c`).
  - Gracefully terminates descending process trees top-down (root to leaves) with SIGTERM escalation to SIGKILL.
  - Interactive confirmation prompt displays a formatted tree preview with PID, depth indentation, and truncated commands before kill.
  - Port deduplication when multiple listening ports share the same supervisor root process.

- **Atomic Run Command (`killx run`)**:
  - One-shot command execution that guarantees port availability prior to launching target processes: `killx run <port...> [--tree] [-f] -- <cmd...>`.
  - Terminates conflicting listeners on specified ports, waits for ports to fully clear, and spawns the command in inherited stdio.
  - Cross-platform signal forwarding (`SIGINT`, `SIGTERM`, `SIGHUP`, `SIGQUIT`) propagating shutdown cleanly to the child process.
  - Preserves standard POSIX signal exit codes (`128 + signalNumber`) on signal termination.

- **Docker-Aware Container Inspection & Termination**:
  - Automatically detects containerized listeners on macOS (`com.docker.backend`), Linux (`docker-proxy`), and Windows (`com.docker.backend`, `wslhost.exe`).
  - Resolves host port bindings to container ID, container name, image, and status.
  - Contextual kill prompt offering `docker stop <container>` or host proxy kill, honoring timeout flag `-t, --timeout <seconds>`.
  - Formatted container metadata display in `killx info` and `killx trace`.

- **Deep Process Tracing (`killx trace`)**:
  - Visual ancestry diagnostic explaining why a port is held: `killx trace <port>`.
  - Renders process tree from parent supervisor down to target listener with PID, PPID, and truncated command.
  - Evaluates root supervisor detection, Docker bindings, and provides tailored kill recommendations (`killx <port> --tree`).

- **Project-Scoped Dev Server Cleanup (`killx dev .`)**:
  - Scope detection supporting current project directory (`killx dev .` or `killx dev ./path`) vs global dev cleanup.
  - Resolves process working directory across macOS (`lsof`), Linux (`/proc/<pid>/cwd`), and Windows (`Get-Process`).
  - Matches processes running within or spawned from the specified project root path.
  - Displays relative project paths (`./my-app`) in interactive selection menus.

- **Interactive TUI Enhancements**:
  - Added `--tree` supervisor kill and `trace` diagnostic actions to port selection menu.
  - Added interactive project scope selection (`current project` vs `global machine`) when running `killx dev` without arguments.

- **Performance & Reliability**:
  - High-precision cross-platform process tree discovery and cwd resolution.
  - 100% test pass rate across 653 test suites.

## 0.1.1

- Fix global and npx binary execution when invoked as `killx` (binary alias without `.js` extension).
- Ensure CLI auto-executes across global installs, npx runner, and package managers.

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
