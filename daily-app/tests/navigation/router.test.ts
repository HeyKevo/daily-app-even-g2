import { describe, expect, it, vi } from "vitest";
import { createRouter } from "../../src/navigation/router";
import type { ScreenStack } from "../../src/navigation/stack";
import type { DataService } from "../../src/services/data/DataService";
import type { Logger } from "../../src/utils/logger";

describe("createRouter", () => {
  it("calls root back handler when stack cannot pop", () => {
    const stack = {
      pop: vi.fn(() => false),
    } as unknown as ScreenStack;
    const logger = createLogger();
    const onRootBack = vi.fn();

    const router = createRouter(stack, createDataService(), logger, onRootBack);
    router.back();

    expect(stack.pop).toHaveBeenCalledTimes(1);
    expect(onRootBack).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("Back requested at root");
  });

  it("does not call root back handler when stack pops", () => {
    const stack = {
      pop: vi.fn(() => true),
    } as unknown as ScreenStack;
    const onRootBack = vi.fn();

    const router = createRouter(stack, createDataService(), createLogger(), onRootBack);
    router.back();

    expect(onRootBack).not.toHaveBeenCalled();
  });
});

function createDataService(): DataService {
  return {
    getDashboard: vi.fn(() => ({ title: "Dashboard", items: [] })),
    refreshList: vi.fn(async () => {}),
    getList: vi.fn(() => ({ id: "list", title: "List", items: [] })),
    toggleShoppingItem: vi.fn(async () => {}),
    addShoppingItem: vi.fn(async () => {}),
    getDetail: vi.fn(() => ({
      id: "detail",
      title: "Detail",
      description: "Detail",
      pages: ["Detail"],
      source: "Test",
    })),
    getAdjacentItemId: vi.fn(() => null),
  };
}

function createLogger(): Logger {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}
