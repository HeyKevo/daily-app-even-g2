import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRssFeedDetailScreen } from "../../../src/screens/rss/RssFeedDetailScreen";
import type { DashboardData, DataService, DetailData, ListData } from "../../../src/services/data/DataService";
import type { ViewModel } from "../../../src/ui/render/renderPipeline";

const AUTOSCROLL_INTERVAL_MS = 2500;

describe("RssFeedDetailScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installWindowShim();
  });

  afterEach(() => {
    vi.useRealTimers();
    removeWindowShim();
  });

  it("pages forward and backward inside the open article", () => {
    const { screen } = createScreen(["Page one", "Page two", "Page three"]);

    expect(readBody(screen.getViewModel())).toBe("Page one");

    screen.onInput({ type: "Down" });
    expect(readBody(screen.getViewModel())).toBe("Page two");

    screen.onInput({ type: "Down" });
    expect(readBody(screen.getViewModel())).toBe("Page three");

    screen.onInput({ type: "Up" });
    expect(readBody(screen.getViewModel())).toBe("Page two");
  });

  it("stays in the article at the first and last page", () => {
    const { screen, router } = createScreen(["Page one", "Page two"]);

    screen.onInput({ type: "Up" });
    expect(readBody(screen.getViewModel())).toBe("Page one");

    screen.onInput({ type: "Down" });
    screen.onInput({ type: "Down" });
    expect(readBody(screen.getViewModel())).toBe("Page two");

    expect(router.back).not.toHaveBeenCalled();
    expect(router.toDetail).not.toHaveBeenCalled();
  });

  it("returns to the list on double click", () => {
    const { screen, router } = createScreen(["Page one", "Page two"]);

    screen.onInput({ type: "DoubleClick" });

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("advances pages while auto scroll is on and stops on the final page", () => {
    const { screen, requestRender } = createScreen(["Page one", "Page two", "Page three"]);

    screen.onInput({ type: "Click" });

    vi.advanceTimersByTime(AUTOSCROLL_INTERVAL_MS);
    expect(readBody(screen.getViewModel())).toBe("Page two");

    vi.advanceTimersByTime(AUTOSCROLL_INTERVAL_MS);
    expect(readBody(screen.getViewModel())).toBe("Page three");

    // The next tick turns auto scroll off and renders the "Auto OFF" state once.
    vi.advanceTimersByTime(AUTOSCROLL_INTERVAL_MS);
    const rendersAfterStop = requestRender.mock.calls.length;

    // From then on the timer is cleared, so no further page or render happens.
    vi.advanceTimersByTime(AUTOSCROLL_INTERVAL_MS * 4);
    expect(requestRender).toHaveBeenCalledTimes(rendersAfterStop);
    expect(readBody(screen.getViewModel())).toBe("Page three");
  });

  it("stops auto scroll again on a second click", () => {
    const { screen, requestRender } = createScreen(["Page one", "Page two", "Page three"]);

    screen.onInput({ type: "Click" });
    screen.onInput({ type: "Click" });

    const rendersAfterToggle = requestRender.mock.calls.length;
    vi.advanceTimersByTime(AUTOSCROLL_INTERVAL_MS * 3);

    expect(requestRender).toHaveBeenCalledTimes(rendersAfterToggle);
    expect(readBody(screen.getViewModel())).toBe("Page one");
  });

  it("does nothing harmful when the article has a single page", () => {
    const { screen, router, requestRender } = createScreen(["Only page"]);

    screen.onInput({ type: "Click" });
    screen.onInput({ type: "Down" });
    screen.onInput({ type: "Up" });

    const rendersAfterInput = requestRender.mock.calls.length;
    vi.advanceTimersByTime(AUTOSCROLL_INTERVAL_MS * 3);

    expect(requestRender).toHaveBeenCalledTimes(rendersAfterInput);
    expect(readBody(screen.getViewModel())).toBe("Only page");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("starts a freshly opened article on page one", () => {
    const { screen } = createScreen(["Page one", "Page two"]);

    screen.onInput({ type: "Down" });
    expect(readBody(screen.getViewModel())).toBe("Page two");

    screen.onExit();
    screen.onEnter();

    expect(readBody(screen.getViewModel())).toBe("Page one");
  });

  it("clamps a stale page index when the feed reloads with fewer pages", () => {
    const detail = createDetail(["Page one", "Page two", "Page three"]);
    const { screen } = createScreen(detail.pages, detail);

    screen.onInput({ type: "Down" });
    screen.onInput({ type: "Down" });
    expect(readBody(screen.getViewModel())).toBe("Page three");

    detail.pages = ["Only page"];

    expect(readBody(screen.getViewModel())).toBe("Only page");
  });
});

function createScreen(pages: string[], sharedDetail?: DetailData) {
  const router = createRouter();
  const requestRender = vi.fn<() => void>();
  const screen = createRssFeedDetailScreen(
    "item-1",
    createDataService(sharedDetail ?? createDetail(pages)),
    createLogger(),
    router,
    requestRender
  );

  return { screen, router, requestRender };
}

function createDetail(pages: string[]): DetailData {
  return {
    id: "item-1",
    title: "Article title",
    description: pages.join("\n\n"),
    pages,
    source: "Demo Feed",
  };
}

function createDataService(detail: DetailData): DataService {
  return {
    getDashboard(): DashboardData {
      return { title: "Dashboard", items: [] };
    },
    refreshList: vi.fn(async (_listId: string) => {}),
    getList(listId: string): ListData {
      return { id: listId, title: "List", items: [] };
    },
    toggleShoppingItem: vi.fn(async (_itemId: string) => {}),
    addShoppingItem: vi.fn(async (_title: string) => {}),
    getDetail(): DetailData {
      return detail;
    },
    getAdjacentItemId(): string | null {
      return "item-2";
    },
  };
}

function createRouter() {
  return {
    toList: vi.fn<(listId: string) => void>(),
    toDetail: vi.fn<(itemId: string) => void>(),
    back: vi.fn<() => void>(),
  };
}

function createLogger() {
  return {
    info: vi.fn<(message: string) => void>(),
    debug: vi.fn<(message: string) => void>(),
    warn: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string, ...args: unknown[]) => void>(),
  };
}

function readBody(viewModel: ViewModel): string {
  const container = viewModel.containers.find(
    (candidate) => candidate.type === "text" && candidate.id === "body"
  );
  if (!container || container.type !== "text") {
    throw new Error("Expected body text container");
  }
  return container.content;
}

function installWindowShim(): void {
  const host = globalThis as unknown as { window?: unknown };
  if (!host.window) {
    // The detail screen drives auto scroll through window timers.
    host.window = globalThis;
  }
}

function removeWindowShim(): void {
  const host = globalThis as unknown as { window?: unknown };
  if (host.window === globalThis) {
    delete host.window;
  }
}
