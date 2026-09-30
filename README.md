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

## Usage

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

## Features

- **Safe signals**: SIGTERM by default; escalates to SIGKILL with `--force` or `--timeout`.
- **Tree & supervisor killing**: `--tree` traverses ancestry to terminate root supervisor (npm, turbo, nodemon) so servers don't auto-respawn.
- **Run after freeing**: `killx run <ports...> -- <cmd>` safely frees ports, waits until open, and spawns command forwarding signals.
- **Docker-aware**: recognizes container port bindings; `killx <port>` safely stops container via `docker stop` rather than killing Docker Desktop.
- **Process tracing**: `killx trace <port>` visually prints the full process ancestry tree with PIDs, commands, cwds, and supervisor detection.
- **Project-scoped dev clean**: `killx dev .` scopes dev process cleanup strictly to the current project/git root.
- **Interactive TUI**: visual port picker with process names, PIDs, and listeners.
- **Cross-platform**: native engine for macOS (`lsof`), Linux (`lsof` / `ss`), Windows (`netstat`, `taskkill`).
- **Protected**: PID 1 and system critical processes protected.

## License

[MIT](LICENSE)
