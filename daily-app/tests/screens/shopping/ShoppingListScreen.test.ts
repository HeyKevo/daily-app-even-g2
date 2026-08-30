import { describe, expect, it, vi } from "vitest";
import { createShoppingListScreen } from "../../../src/screens/shopping/ShoppingListScreen";
import type { DataService, DashboardData, DetailData, ListData } from "../../../src/services/data/DataService";
import { SHOPPING_DIVIDER_ITEM_ID, SHOPPING_LIST_ID } from "../../../src/services/data/RssAppDataService";
import type { TodoSpeechService, TodoSpeechSnapshot } from "../../../src/services/speech/TodoSpeechService";
import type { ViewModel } from "../../../src/ui/render/renderPipeline";

describe("ShoppingListScreen", () => {
  it("toggles selected shopping item on click", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [{ id: "milk", label: "[ ] Milch" }],
    });
    const router = { toList: vi.fn(), toDetail: vi.fn(), back: vi.fn() };
    const logger = createLogger();
    const requestRender = vi.fn();

    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      logger,
      router,
      requestRender
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({ type: "Click" });
    await flushAsync();

    expect(dataService.toggleShoppingItem).toHaveBeenCalledWith("milk");
  });

  it("clamps selection for up/down navigation", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "milk", label: "[ ] Milch" },
        { id: "bread", label: "[ ] Brot" },
      ],
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({ type: "Up" });
    expect(readSelectedIndex(screen.getViewModel())).toBe(0);

    screen.onInput({ type: "Down" });
    expect(readSelectedIndex(screen.getViewModel())).toBe(1);

    screen.onInput({ type: "Down" });
    expect(readSelectedIndex(screen.getViewModel())).toBe(1);
  });

  it("does not toggle divider or status rows", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "milk", label: "[ ] Milch" },
        { id: SHOPPING_DIVIDER_ITEM_ID, label: "-------- Done --------" },
      ],
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({ type: "Down" });
    screen.onInput({ type: "Click" });
    await flushAsync();

    expect(dataService.toggleShoppingItem).toHaveBeenCalledWith("milk");
  });

  it("routes back on double click", () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [{ id: "milk", label: "[ ] Milch" }],
    });
    const router = createRouter();
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      router,
      vi.fn()
    );

    screen.onInput({ type: "DoubleClick" });

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("moves selection to the next interactive row after list reorder", async () => {
    let list: ListData = {
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "milk", label: "[ ] Milch" },
        { id: "bread", label: "[ ] Brot" },
      ],
    };

    const dataService = createDataService(list);
    dataService.toggleShoppingItem.mockImplementation(async (itemId: string) => {
      if (itemId !== "milk") {
        return;
      }
      list = {
        id: SHOPPING_LIST_ID,
        title: "Shopping List",
        items: [
          { id: "bread", label: "[ ] Brot" },
          { id: SHOPPING_DIVIDER_ITEM_ID, label: "-------- Done --------" },
          { id: "milk", label: "[x] Milch" },
        ],
      };
      dataService.getList.mockImplementation(() => list);
    });

    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({ type: "Click" });
    await flushAsync();

    expect(readSelectedIndex(screen.getViewModel())).toBe(0);
  });

  it("toggles currently selected item on click without payload/type", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "milk", label: "[ ] Milch" },
        { id: "bread", label: "[ ] Brot" },
      ],
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({ type: "Click", raw: { jsonData: { containerID: 2, containerName: "list-1" } } });
    await flushAsync();

    expect(dataService.toggleShoppingItem).toHaveBeenCalledWith("milk");
    expect(readSelectedIndex(screen.getViewModel())).toBe(0);
  });

  it("never keeps divider as selected target when payload index points divider", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "bread", label: "[ ] B" },
        { id: SHOPPING_DIVIDER_ITEM_ID, label: "-------- Done --------" },
        { id: "a", label: "[x] A" },
      ],
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({
      type: "Click",
      raw: { jsonData: { containerID: 2, containerName: "list-1", currentSelectItemIndex: 1 } },
    });
    await flushAsync();

    expect(dataService.toggleShoppingItem).toHaveBeenCalledWith("bread");
    expect(readSelectedIndex(screen.getViewModel())).toBe(0);
  });

  it("toggles on explicit click event after selection changed", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "milk", label: "[ ] Milch" },
        { id: "bread", label: "[ ] Brot" },
      ],
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({
      type: "Click",
      raw: { listEvent: { currentSelectItemIndex: 1, eventType: 0 } },
    });
    await flushAsync();

    expect(dataService.toggleShoppingItem).toHaveBeenCalledWith("bread");
  });

  it("toggles currently hovered first item when host sends item-name payload", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "milk", label: "[ ] Milch" },
        { id: "bread", label: "[ ] Brot" },
      ],
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    // Move local selection away from first entry to prove payload-based resolution.
    screen.onInput({ type: "Down" });
    expect(readSelectedIndex(screen.getViewModel())).toBe(1);

    screen.onInput({
      type: "Click",
      raw: {
        listEvent: {
          currentSelectItemName: "item1",
          currentSelectItemIndex: 1,
          eventType: 0,
        },
      },
    });
    await flushAsync();

    expect(dataService.toggleShoppingItem).toHaveBeenCalledWith("milk");
  });

  it("toggles second item when clicking B with two todos and index=1 payload", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "milk", label: "[ ] Milch" },
        { id: "bread", label: "[ ] Brot" },
      ],
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({
      type: "Click",
      raw: { listEvent: { currentSelectItemIndex: 1, eventType: 0 } },
    });
    await flushAsync();

    expect(dataService.toggleShoppingItem).toHaveBeenCalledWith("bread");
  });

  it("toggles second item with index payload even when eventType is missing", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "milk", label: "[ ] Milch" },
        { id: "bread", label: "[ ] Brot" },
      ],
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({
      type: "Click",
      raw: { jsonData: { containerID: 2, containerName: "list-1", currentSelectItemIndex: 1 } },
    });
    await flushAsync();

    expect(dataService.toggleShoppingItem).toHaveBeenCalledWith("bread");
  });

  it("toggles A after toggling B when next click has no payload", async () => {
    let list: ListData = {
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "a", label: "[ ] A" },
        { id: "b", label: "[ ] B" },
      ],
    };

    const dataService = createDataService(list);
    dataService.toggleShoppingItem.mockImplementation(async (itemId: string) => {
      if (itemId === "b") {
        list = {
          id: SHOPPING_LIST_ID,
          title: "Shopping List",
          items: [
            { id: "a", label: "[ ] A" },
            { id: SHOPPING_DIVIDER_ITEM_ID, label: "-------- Done --------" },
            { id: "b", label: "[x] B" },
          ],
        };
        dataService.getList.mockImplementation(() => list);
        return;
      }

      if (itemId === "a") {
        list = {
          id: SHOPPING_LIST_ID,
          title: "Shopping List",
          items: [
            { id: SHOPPING_DIVIDER_ITEM_ID, label: "-------- Done --------" },
            { id: "a", label: "[x] A" },
            { id: "b", label: "[x] B" },
          ],
        };
        dataService.getList.mockImplementation(() => list);
      }
    });

    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({
      type: "Click",
      raw: { jsonData: { containerID: 2, containerName: "list-1", currentSelectItemIndex: 1 } },
    });
    await flushAsync();

    screen.onInput({
      type: "Click",
      raw: { jsonData: { containerID: 2, containerName: "list-1" } },
    });
    await flushAsync();

    expect(dataService.toggleShoppingItem.mock.calls[0]?.[0]).toBe("b");
    expect(dataService.toggleShoppingItem.mock.calls[1]?.[0]).toBe("a");
  });

  it("toggles hovered second item on no-payload click after moving selection", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "milk", label: "[ ] Milch" },
        { id: "bread", label: "[ ] Brot" },
      ],
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({ type: "Down" });
    expect(readSelectedIndex(screen.getViewModel())).toBe(1);

    screen.onInput({
      type: "Click",
      raw: { jsonData: { containerID: 2, containerName: "list-1" } },
    });
    await flushAsync();

    expect(dataService.toggleShoppingItem).toHaveBeenCalledWith("bread");
  });

  it("logs hover element and click target for shopping clicks", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "milk", label: "[ ] Milch" },
        { id: "bread", label: "[ ] Brot" },
      ],
    });
    const logger = createLogger();
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      logger,
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({
      type: "Click",
      raw: { listEvent: { currentSelectItemIndex: 1, eventType: 0 } },
    });
    await flushAsync();

    const debugMessages = logger.debug.mock.calls.map((call) => String(call[0] ?? ""));
    expect(debugMessages.some((message) => message.includes("Shopping list items ->"))).toBe(true);
    expect(debugMessages.some((message) => message.includes("Shopping hover ->"))).toBe(true);
    expect(debugMessages.some((message) => message.includes("Shopping click ->"))).toBe(true);
    expect(debugMessages.some((message) => message.includes("Shopping toggle trigger ->"))).toBe(true);
    expect(debugMessages.some((message) => message.includes("Shopping toggle result ->"))).toBe(true);
    expect(debugMessages.some((message) => message.includes("Shopping list items after toggle ->"))).toBe(true);
    expect(debugMessages.some((message) => message.includes("id:bread"))).toBe(true);
  });

  it("toggles second item when click payload comes via listEvent.toJson object", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "milk", label: "[ ] Milch" },
        { id: "bread", label: "[ ] Brot" },
      ],
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({
      type: "Click",
      raw: {
        listEvent: {
          toJson: () => ({
            CurrentSelect_ItemIndex: "1",
            Event_Type: 0,
          }),
        },
      },
    });
    await flushAsync();

    expect(dataService.toggleShoppingItem).toHaveBeenCalledWith("bread");
  });

  it("supports one-based fallback index when payload is out of range", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "milk", label: "[ ] Milch" },
        { id: "bread", label: "[ ] Brot" },
      ],
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({
      type: "Click",
      raw: { listEvent: { currentSelectItemIndex: 2, eventType: 0 } },
    });
    await flushAsync();

    expect(dataService.toggleShoppingItem).toHaveBeenCalledWith("bread");
  });

  it("toggles by plain title name payload without checkbox prefix", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [
        { id: "milk", label: "[ ] Milch" },
        { id: "bread", label: "[ ] Brot" },
      ],
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn()
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({
      type: "Click",
      raw: { listEvent: { currentSelectItemName: "Milk", eventType: 0 } },
    });
    await flushAsync();

    expect(dataService.toggleShoppingItem).toHaveBeenCalledWith("milk");
  });

  it("renders add todo action as first row when speech input is available", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [{ id: "milk", label: "[ ] Milch" }],
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn(),
      createTodoSpeechService()
    );
    screen.onEnter();
    await flushAsync();

    const listContainer = screen.getViewModel().containers[0];
    expect(listContainer?.type).toBe("list");
    if (listContainer?.type === "list") {
      expect(listContainer.items[0]).toBe("+ Add todo by voice");
      expect(listContainer.items[1]).toBe("[ ] Milch");
    }
  });

  it("starts speech input from first row and saves recognized todo", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [{ id: "milk", label: "[ ] Milch" }],
    });
    let finalTextHandler: (text: string) => void = vi.fn();
    const speechService = createTodoSpeechService({
      async start(options) {
        finalTextHandler = options.onFinalText;
        options.onSnapshot({
          status: "listening",
          transcript: "",
          message: "Say the new todo.",
        });
        return { stop: vi.fn(async () => {}) };
      },
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn(),
      speechService
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({ type: "Click" });
    await flushAsync();
    expect(screen.getViewModel().containers[0]?.type).toBe("text");

    finalTextHandler("  Hafermilch kaufen  ");
    await flushAsync();

    expect(dataService.addShoppingItem).toHaveBeenCalledWith("Hafermilch kaufen");
    expect(screen.getViewModel().containers[0]?.type).toBe("list");
  });

  it("shows speech startup errors and returns to list on click", async () => {
    const dataService = createDataService({
      id: SHOPPING_LIST_ID,
      title: "Shopping List",
      items: [{ id: "milk", label: "[ ] Milch" }],
    });
    const speechService = createTodoSpeechService({
      async start() {
        throw new Error("Voice input not available");
      },
    });
    const screen = createShoppingListScreen(
      SHOPPING_LIST_ID,
      dataService,
      createLogger(),
      createRouter(),
      vi.fn(),
      speechService
    );
    screen.onEnter();
    await flushAsync();

    screen.onInput({ type: "Click" });
    await flushAsync();

    const errorView = screen.getViewModel();
    expect(errorView.containers[0]?.type).toBe("text");
    if (errorView.containers[0]?.type === "text") {
      expect(errorView.containers[0].content).toContain("Voice input not available");
    }

    screen.onInput({ type: "Click" });
    await flushAsync();

    expect(screen.getViewModel().containers[0]?.type).toBe("list");
  });
});

function createDataService(list: ListData) {
  const getList = vi.fn(() => list);
  const toggleShoppingItem = vi.fn(async (_itemId: string) => {});
  const addShoppingItem = vi.fn(async (_title: string) => {});
  const refreshList = vi.fn(async (_listId: string) => {});

  const dataService: DataService = {
    getDashboard(): DashboardData {
      return { title: "Dashboard", items: [] };
    },
    refreshList,
    getList,
    toggleShoppingItem,
    addShoppingItem,
    getDetail(): DetailData {
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
    toggleShoppingItem,
    addShoppingItem,
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

function readSelectedIndex(viewModel: ViewModel): number {
  const listContainer = viewModel.containers[0];
  if (!listContainer || listContainer.type !== "list") {
    throw new Error("Expected list container");
  }
  return listContainer.selectedIndex;
}

function createTodoSpeechService(overrides?: Partial<TodoSpeechService>): TodoSpeechService {
  return {
    async start(options: {
      onSnapshot(snapshot: TodoSpeechSnapshot): void;
      onFinalText(text: string): void;
      onError(error: Error): void;
    }) {
      options.onSnapshot({
        status: "listening",
        transcript: "",
        message: "Say the new todo.",
      });
      return { stop: vi.fn(async () => {}) };
    },
    ...overrides,
  };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
