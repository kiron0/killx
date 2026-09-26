# Changelog

## 0.1.0

- Safe port-based process termination with SIGTERM, force SIGKILL mode, and timed escalation.
- Interactive multi-select port killer and interactive command menu launcher with `-i, --interactive`.
- Comprehensive CLI commands: kill, info, check, list, free, ps, dev, wait, watch, and update.
- Multiple-port and range parsing, `--process` and `--port` filters, `--no-color`, and quiet mode.
- Structured JSON output, remediation hints, self PID protection, and standardized exit codes.
- Cross-platform support for macOS (lsof), Linux (lsof and ss fallback), and Windows (netstat and PowerShell).
- Modern TypeScript CLI package with zero non-interactive runtime dependencies.
