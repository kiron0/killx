# killx

> Find and kill the process using a port.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

```console
$ killx 3000
✓ Killed node (PID 18342) on :3000
```

## Install

```bash
npm install -g killx
```

Or run directly with `npx`:

```bash
npx killx 3000
```

## Use

```bash
killx 3000                 # graceful kill (SIGTERM)
killx 3000 --force         # force kill (SIGKILL)
killx 3000 --timeout 3     # force after 3 seconds
killx 3000 5173 8080       # multiple ports
killx kill 3000-3010       # port range
```

Inspect ports:

```bash
killx info 3000
killx check 3000
killx list
killx list 3000-4000
killx free 3000
```

Find processes:

```bash
killx ps node
killx ps node --kill
killx dev
```

Wait or watch:

```bash
killx wait 3000
killx wait 3000 --occupied
killx watch 3000
```

## Commands

| Command                | Description                     |
| ---------------------- | ------------------------------- |
| `killx <port...>`      | Kill listeners                  |
| `killx kill <port...>` | Explicit kill command           |
| `killx info <port>`    | Show listener details           |
| `killx check <port>`   | Check port availability         |
| `killx list [range]`   | List listening ports            |
| `killx free [port]`    | Find a free port                |
| `killx ps [query]`     | Search processes                |
| `killx dev`            | Stop common development servers |
| `killx wait <port>`    | Wait for port state             |
| `killx watch <port>`   | Watch port changes              |

Aliases: `i` (`info`), `c` (`check`), `ls` (`list`), and `ps` (`process`).

## Safety

`killx` sends `SIGTERM` by default. `--force` sends `SIGKILL`.

Ranges, multiple matches, and protected processes require confirmation. Use `--yes` to skip confirmation.

PID 1 is never terminated.

## Scripts & CI

```bash
killx info 3000 --json
killx list --json
killx 3000 --quiet
PORT=$(killx free 3000)
```

Exit codes:

| Code | Meaning            |
| ---: | ------------------ |
|  `0` | Success            |
|  `1` | General error      |
|  `2` | Invalid arguments  |
|  `3` | No process found   |
|  `4` | Permission denied  |
|  `5` | Termination failed |

## Platforms

- macOS: `lsof`
- Linux: `lsof` or `ss`
- Windows: `netstat`, PowerShell, and `taskkill`

TCP listeners are supported. UDP is not supported.

## License

[MIT](LICENSE)
