import { afterEach, describe, expect, it, vi } from "vitest";
import { Logger } from "../../src/utils/logger";

describe("Logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs info messages with optional args", () => {
    const logger = new Logger();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const payload = { event: "click", index: 1 };

    logger.info("Dashboard Event", payload);

    expect(logSpy).toHaveBeenCalledWith("[info] Dashboard Event", payload);
  });

  it("logs debug messages with optional args", () => {
    const logger = new Logger();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.debug("Debug Trace", "extra", 42);

    expect(logSpy).toHaveBeenCalledWith("[debug] Debug Trace", "extra", 42);
  });

  it("logs warnings through console.warn", () => {
    const logger = new Logger();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logger.warn("Feed slow", 1200);

    expect(warnSpy).toHaveBeenCalledWith("[warn] Feed slow", 1200);
  });

  it("logs errors through console.error so failures reach the host console", () => {
    const logger = new Logger();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("Failed to fetch");

    logger.error("RSS refresh failed", cause);

    expect(errorSpy).toHaveBeenCalledWith("[error] RSS refresh failed", cause);
  });
});
