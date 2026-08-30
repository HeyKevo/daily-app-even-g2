export class Logger {
  info(message: string, ...args: unknown[]): void {
    console.log(`[info] ${message}`, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    console.log(`[debug] ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[warn] ${message}`, ...args);
  }

  // Failures must reach the host console (and the simulator /api/console feed),
  // otherwise a broken feed load is indistinguishable from an empty one.
  error(message: string, ...args: unknown[]): void {
    console.error(`[error] ${message}`, ...args);
  }
}
