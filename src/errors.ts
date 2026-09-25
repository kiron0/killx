export const EXIT_SUCCESS = 0;
export const EXIT_GENERIC = 1;
export const EXIT_INVALID_ARGUMENTS = 2;
export const EXIT_NOT_FOUND = 3;
export const EXIT_PERMISSION = 4;
export const EXIT_TERMINATION = 5;

export class CliError extends Error {
  readonly code: number;
  readonly causeError?: unknown;

  constructor(code: number, message = "", causeError?: unknown) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.causeError = causeError;
  }
}

export function invalid(message: string | Error): CliError {
  const text = typeof message === "string" ? message : message.message;
  return new CliError(EXIT_INVALID_ARGUMENTS, `✗ ${text}`, message);
}
