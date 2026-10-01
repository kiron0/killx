# killx

> Find and kill the process using a port.

[![npm version](https://img.shields.io/npm/v/killx.svg)](https://www.npmjs.com/package/killx)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-killx.js.org-blue)](https://killx.js.org)

## Install

```bash
npm install -g killx
# or run directly without install
npx killx 3000
```

## Quick Start

```bash
# Interactive port selector (Clack TUI)
killx

# Kill port gracefully (SIGTERM) or force (SIGKILL)
killx 3000
killx 3000 --force
killx 3000 --timeout 3

# Kill supervisor and entire process tree (e.g. npm -> vite)
killx 3000 --tree

# Free port(s) and execute dev command cleanly
killx run 3000 -- npm run dev
killx run 3000 5173 -- pnpm dev

# Explain process ancestry tree and supervisor loop
killx trace 3000

# Multiple ports and ranges
killx 3000 5173 8080
killx kill 3000-3010 --yes

# Sweep hung dev servers (project-scoped or global)
killx dev .
killx dev --cwd .

# Check status and find free port (Docker-aware)
killx check 3000
killx info 3000
PORT=$(killx free 3000)
```

## Core Features

### 1. Process Tree & Supervisor Killing (`--tree`)

Dev servers are typically run under package managers or supervisors (`npm -> sh -> next -> node`). Terminating only the listener leaves the supervisor alive, which often immediately restarts the server.

```bash
killx 3000 --tree
```

Traverses process ancestry to find the root supervisor, renders an aligned tree preview, and terminates the entire tree. On Windows, uses native `taskkill /T`.

### 2. Project-Scoped Dev Server Sweeper (`killx dev .`)

Standard `killx dev` sweeps hung servers globally. To protect other projects running on your machine, scope cleanup directly to the current repository:

```bash
killx dev .
# or
killx dev --cwd /path/to/project
```

Inspects process working directories, command paths, and ancestry trees, terminating only processes belonging to the targeted project root.

### 3. Atomic Run Command (`killx run`)

Avoid manually checking and killing ports before starting local development. Perfect for `package.json` scripts:

```bash
killx run 3000 -- npm run dev
killx run 3000 5173 -- pnpm dev
```

Verifies port availability, terminates existing listeners, waits until ports are genuinely free, and spawns the target command forwarding all signals (`SIGINT`, `SIGTERM`, `SIGHUP`, `SIGQUIT`) and exit codes.

### 4. Docker-Aware Port Handling

Published container ports are recognized automatically:

- `killx check 5432` / `killx info 5432`: reports the container name, image, and published ports.
- `killx 5432`: prompts to stop the container using `docker stop` rather than killing Docker Desktop or host proxy processes. Supports `--timeout` to pass custom stop timeouts.

### 5. Deep Process Tracing (`killx trace`)

Answers _"Why does this port keep coming back after I kill it?"_

```bash
killx trace 3000
```

Renders the complete process ancestry tree with PIDs, PPIDs, working directories, start times, commands, and highlights detected supervisors. Also outputs full JSON with `--json`.

## Command Reference

| Command                         | Description                                                              |
| ------------------------------- | ------------------------------------------------------------------------ |
| `killx [ports...]`              | Interactive port picker (no args) or kill specified ports                |
| `killx 3000 --tree`             | Terminate listener and root supervisor process tree                      |
| `killx run <ports...> -- <cmd>` | Free ports and spawn command with signal forwarding                      |
| `killx trace <port>`            | Map process ancestry tree, PIDs, PPIDs, and supervisors                  |
| `killx dev [dir]`               | Stop hung dev servers (global or project-scoped with `[dir]` or `--cwd`) |
| `killx check <port>`            | Check port availability (exit 0 if free, 1 if occupied)                  |
| `killx info <port>`             | Inspect process, PID, user, command, and Docker metadata                 |
| `killx list [range]`            | List all active listening ports                                          |
| `killx free [port]`             | Find the next available TCP port                                         |
| `killx ps [query]`              | Search running processes and terminate with `--kill`                     |
| `killx wait <port>`             | Wait until port becomes available or occupied (`--occupied`)             |
| `killx watch <port>`            | Live monitor port state changes                                          |

## Options

| Flag                | Description                                      |
| ------------------- | ------------------------------------------------ |
| `-f, --force`       | Send `SIGKILL` immediately                       |
| `-t, --tree`        | Terminate entire process tree and supervisor     |
| `-y, --yes`         | Skip safety confirmation prompts                 |
| `-q, --quiet`       | Suppress successful console output               |
| `-j, --json`        | Output structured JSON                           |
| `-v, --verbose`     | Show extra error details                         |
| `--timeout <sec>`   | Seconds before escalating `SIGTERM` to `SIGKILL` |
| `--cwd <path>`      | Project root for `killx dev` scoping             |
| `-i, --interactive` | Launch interactive command menu                  |

## License

[MIT](LICENSE)
