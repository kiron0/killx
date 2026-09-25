# killx

> Find and kill the process using a port.

[![npm version](https://img.shields.io/npm/v/killx.svg)](https://www.npmjs.com/package/killx)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-killx.js.org-blue)](https://killx.js.org)

Full documentation and guides available at **[killx.js.org](https://killx.js.org)**.

---

## Quick Install

```bash
npm install -g killx
```

Or run without install:

```bash
npx killx 3000
```

Requires Node.js 20+.

## Common Commands

```bash
# Interactive port selection (Clack UI)
killx

# Graceful termination (SIGTERM)
killx 3000

# Force termination (SIGKILL)
killx 3000 --force

# Timed escalation (SIGTERM -> SIGKILL after 3s)
killx 3000 --timeout 3

# Multiple ports & ranges
killx 3000 5173 8080
killx kill 3000-3010 --yes

# Check port availability
killx check 3000
killx check 3000 --json

# Check & install updates
killx check-update
killx update

# Inspect listener metadata
killx info 3000
killx list
killx list 3000-4000

# Find next available port
PORT=$(killx free 3000)

# Process search & stop dev servers
killx ps node
killx ps node --kill --yes
killx dev
```

## Features

- **Safe termination**: sends `SIGTERM` by default; escalates to `SIGKILL` only with `--force` or `--timeout`.
- **Destructive safety**: requires confirmation for port ranges, multiple listeners, or privileged processes (skip with `--yes`). PID 1 protected.
- **Port utilities**: inspect listeners (`info`), check availability (`check`), list TCP sockets (`list`), find open ports (`free`).
- **Dev-first**: instant cleanup of common development servers with `killx dev` (Node, Vite, Next.js, Python, Rails, PHP, Java).
- **Automation-friendly**: clean JSON output with `--json`, quiet exit codes with `--quiet`.
- **Cross-platform**: macOS (`lsof`), Linux (`lsof` / `ss`), Windows (`netstat`, PowerShell, `taskkill`).

## Documentation

- [Getting Started](https://killx.js.org/docs)
- [CLI Reference](https://killx.js.org/docs/cli)
- [Platform Support](https://killx.js.org/docs/platforms)
- [Exit Codes & Scripting](https://killx.js.org/docs/scripts)

## License

[MIT](LICENSE)
