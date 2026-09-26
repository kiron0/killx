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

# Multiple ports and ranges
killx 3000 5173 8080
killx kill 3000-3010 --yes

# Sweep hung dev servers
killx dev

# Check status and find free port
killx check 3000
killx info 3000
PORT=$(killx free 3000)
```

## Features

- **Safe signals**: SIGTERM by default; escalates to SIGKILL with `--force` or `--timeout`.
- **Interactive TUI**: visual port picker with process names, PIDs, and listeners.
- **Dev-first**: instant dev server sweep with `killx dev` (Node, Vite, Next, Python, etc.).
- **Cross-platform**: native engine for macOS (`lsof`), Linux (`lsof` / `ss`), Windows (`netstat`, `taskkill`).
- **Protected**: PID 1 and system critical processes protected.

## License

[MIT](LICENSE)
