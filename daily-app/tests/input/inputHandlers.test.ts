import { describe, expect, it, vi } from "vitest";
import { createInputDispatcher } from "../../src/input/inputHandlers";
import type { ScreenStack } from "../../src/navigation/stack";
import type { Logger } from "../../src/utils/logger";

function createLoggerStub(): Logger {
  return {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  } as unknown as Logger;
}

describe("createInputDispatcher", () => {
  it("drops system exit events without dispatching to the current screen", () => {
    const screen = {
      id: "screen",
      onInput: vi.fn(),
    };
    const stack = {
      current: vi.fn(() => screen),
      render: vi.fn(),
    } as unknown as ScreenStack;
    const logger = createLoggerStub();

    const dispatch = createInputDispatcher(stack, logger);
    dispatch({ type: "SystemExit" });

    expect(screen.onInput).not.toHaveBeenCalled();
    expect(stack.render).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("System exit event received");
  });
});
