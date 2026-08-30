import { describe, expect, it, vi } from "vitest";
import { createRssFeedListScreen } from "../../../src/screens/rss/RssFeedListScreen";
import type { DataService, DashboardData, DetailData, ListData } from "../../../src/services/data/DataService";
import type { ViewModel } from "../../../src/ui/render/renderPipeline";

describe("RssFeedListScreen", () => {
  it("paginates RSS list with next/back controls and page status", async () => {
    const list = createList(25);
    const dataService = createDataService(list);
    const router = createRouter();

    const screen = createRssFeedListScreen("rss", dataService, createLogger(), router, vi.fn());
    screen.onEnter();
    await flushAsync();

    const firstPage = screen.getViewModel();
    expect(readListLabels(firstPage)).toHaveLength(20);
    expect(readListLabels(firstPage).at(0)).toBe("Item 1");
    expect(readListLabels(firstPage).at(-1)).toBe("[Next page]");
    expect(readPageStatus(firstPage)).toBe("1/2");

    screen.onInput({
      type: "Click",
      raw: { listEvent: { currentSelectItemIndex: 19, eventType: 0 } },
    });

    const secondPage = screen.getViewModel();
    expect(readListLabels(secondPage).at(0)).toBe("[Previous page]");
    expect(readListLabels(secondPage).at(1)).toBe("Item 20");
    expect(readPageStatus(secondPage)).toBe("2/2");

    screen.onInput({
      type: "Click",
      raw: { listEvent: { currentSelectItemIndex: 1, eventType: 0 } },
    });

    expect(router.toDetail).toHaveBeenCalledWith("item-20");

    screen.onInput({
      type: "Click",
      raw: { listEvent: { currentSelectItemIndex: 0, eventType: 0 } },
    });

    expect(readPageStatus(screen.getViewModel())).toBe("1/2");
  });

  it("uses top-row selection after page switch so click without payload triggers [Previous page]", async () => {
    const list = createList(25);
    const dataService = createDataService(list);
    const router = createRouter();

    const screen = createRssFeedListScreen("rss", dataService, createLogger(), router, vi.fn());
    screen.onEnter();
    await flushAsync();

    screen.onInput({
      type: "Click",
      raw: { listEvent: { currentSelectItemIndex: 19, eventType: 0 } },
    });

    expect(readPageStatus(screen.getViewModel())).toBe("2/2");

    screen.onInput({ type: "Click" });

    expect(readPageStatus(screen.getViewModel())).toBe("1/2");
    expect(router.toDetail).not.toHaveBeenCalled();
  });

  it("re-syncs to top-row selection when re-entering list from detail", async () => {
    const list = createList(25);
    const dataService = createDataService(list);
    const router = createRouter();

    const screen = createRssFeedListScreen("rss", dataService, createLogger(), router, vi.fn());
    screen.onEnter();
    await flushAsync();

    screen.onInput({
      type: "Click",
      raw: { listEvent: { currentSelectItemIndex: 19, eventType: 0 } },
    });
    expect(readPageStatus(screen.getViewModel())).toBe("2/2");

    screen.onInput({
      type: "Click",
      raw: { listEvent: { currentSelectItemIndex: 1, eventType: 0 } },
    });
    expect(router.toDetail).toHaveBeenCalledWith("item-20");

    screen.onExit();
    screen.onEnter();
    await flushAsync();

    screen.onInput({ type: "Click" });

    expect(readPageStatus(screen.getViewModel())).toBe("1/2");
  });

  it("keeps detail opening behavior for regular RSS rows", async () => {
    const dataService = createDataService({
      id: "rss",
      title: "RSS Feeds",
      items: [
        { id: "a", label: "Item A" },
        { id: "b", label: "Item B" },
      ],
    });
    const router = createRouter();

    const screen = createRssFeedListScreen("rss", dataService, createLogger(), router, vi.fn());
    screen.onEnter();
    await flushAsync();

    screen.onInput({ type: "Click" });

    expect(router.toDetail).toHaveBeenCalledWith("a");
  });

  it("renders error status as single row with stable page status", async () => {
    const dataService = createDataService({
      id: "rss",
      title: "RSS Feeds",
      items: [],
    });
    dataService.refreshList.mockRejectedValue(new Error("offline"));
    const router = createRouter();

    const screen = createRssFeedListScreen("rss", dataService, createLogger(), router, vi.fn());
    screen.onEnter();
    await flushAsync();

    const viewModel = screen.getViewModel();
    expect(readListLabels(viewModel)).toEqual(["Error: offline"]);
    expect(readPageStatus(viewModel)).toBe("1/1");

    screen.onInput({ type: "Click" });

    expect(router.toDetail).not.toHaveBeenCalled();
  });
});

function createList(count: number): ListData {
  return {
    id: "rss",
    title: "RSS Feeds",
    items: Array.from({ length: count }, (_, index) => ({
      id: `item-${index + 1}`,
      label: `Item ${index + 1}`,
    })),
  };
}

function createDataService(list: ListData) {
  const getList = vi.fn(() => list);
  const refreshList = vi.fn(async (_listId: string) => {});

  const dataService: DataService = {
    getDashboard(): DashboardData {
      return { title: "Dashboard", items: [] };
    },
    refreshList,
    getList,
    toggleShoppingItem: vi.fn(async (_itemId: string) => {}),
    addShoppingItem: vi.fn(async (_title: string) => {}),
    getDetail(_itemId: string): DetailData {
      return {
        id: "unused",
        title: "unused",
        description: "unused",
        pages: ["unused"],
        source: "unused",
      };
    },
    getAdjacentItemId(): string | null {
      return null;
    },
  };

  return {
    ...dataService,
    getList,
    refreshList,
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
  };
}

function readListLabels(viewModel: ViewModel): string[] {
  const listContainer = viewModel.containers.find((container) => container.type === "list");
  if (!listContainer || listContainer.type !== "list") {
    throw new Error("Expected list container");
  }
  return listContainer.items;
}

function readPageStatus(viewModel: ViewModel): string {
  const textContainer = viewModel.containers.find((container) => container.type === "text");
  if (!textContainer || textContainer.type !== "text") {
    throw new Error("Expected text container");
  }
  return textContainer.content;
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
