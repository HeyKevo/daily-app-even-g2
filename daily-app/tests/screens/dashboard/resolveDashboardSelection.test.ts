import { describe, expect, it, vi } from "vitest";
import { createDashboardScreen } from "../../../src/screens/DashboardScreen";
import type { InputEvent } from "../../../src/input/keyBindings";
import type {
  DashboardItem,
  DashboardData,
  DataService,
  DetailData,
  ListData,
} from "../../../src/services/data/DataService";
import {
  RSS_LIST_ID,
  SHOPPING_LIST_ID,
} from "../../../src/services/data/RssAppDataService";
import {
  clickByItemNameFirst,
  clickByItemNameSecond,
  clickByJsonDataZeroBasedSecond,
  clickByLabelRss,
  clickByLabelShopping,
  explicitClickByZeroBasedIndexSecond,
  explicitClickByLabelShopping,
  clickByOneBasedIndexSecond,
  clickByZeroBasedIndexFirst,
  clickByZeroBasedIndexSecond,
  clickWithUnknownPayload,
  downEvent,
  hoverByLabelShopping,
  hoverByProtoIndexSecond,
  upEvent,
} from "./__fixtures__/dashboardInputEvents";
import { resolveDashboardSelection } from "../../../src/screens/dashboard/resolveDashboardSelection";

const dashboardItems: DashboardItem[] = [
  {
    id: "dashboard-rss",
    label: "RSS Feeds",
    listId: RSS_LIST_ID,
    description: "RSS description",
  },
  {
    id: "dashboard-shopping-list",
    label: "Shopping List",
    listId: SHOPPING_LIST_ID,
    description: "Shopping description",
  },
];

describe("resolveDashboardSelection", () => {
  it("routes RSS by selected name", () => {
    const result = runResolver(clickByLabelRss, 0);
    expect(result.targetListId).toBe(RSS_LIST_ID);
  });

  it("routes Shopping List by selected name", () => {
    const result = runResolver(clickByLabelShopping, 0);
    expect(result.targetListId).toBe(SHOPPING_LIST_ID);
  });

  it("maps item1/item2 naming to first/second entry", () => {
    expect(runResolver(clickByItemNameFirst, 1).targetListId).toBe(RSS_LIST_ID);
    expect(runResolver(clickByItemNameSecond, 0).targetListId).toBe(SHOPPING_LIST_ID);
  });

  it("maps click indexes from listEvent/jsonData", () => {
    expect(runResolver(clickByZeroBasedIndexFirst, 1).targetListId).toBe(RSS_LIST_ID);
    expect(runResolver(clickByZeroBasedIndexSecond, 0).targetListId).toBe(SHOPPING_LIST_ID);
    expect(runResolver(clickByJsonDataZeroBasedSecond, 0).targetListId).toBe(SHOPPING_LIST_ID);
  });

  it("supports 1-based click index variants", () => {
    const result = runResolver(clickByOneBasedIndexSecond, 0);
    expect(result.targetListId).toBe(SHOPPING_LIST_ID);
  });

  it("clamps up/down navigation", () => {
    expect(runResolver(upEvent, 0).nextSelectedIndex).toBe(0);
    expect(runResolver(downEvent, 1).nextSelectedIndex).toBe(1);
  });

  it("returns null target for empty item list", () => {
    const result = resolveDashboardSelection({
      items: [],
      currentSelectedIndex: 0,
      event: clickByLabelRss,
      logger: createLogger(),
    });
    expect(result).toEqual({ nextSelectedIndex: 0, targetListId: null });
  });

  it("logs resolver decisions through injected logger", () => {
    const { logger, debug } = createSpyLogger();
    const result = resolveDashboardSelection({
      items: dashboardItems,
      currentSelectedIndex: 0,
      event: clickByLabelShopping,
      logger,
    });

    expect(result.targetListId).toBe(SHOPPING_LIST_ID);
    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining("Dashboard resolver result -> click, nextIndex:1, target:shopping-list")
    );
  });

  it("keeps current index when click payload is unknown", () => {
    const result = runResolver(clickWithUnknownPayload, 1);
    expect(result.targetListId).toBe(SHOPPING_LIST_ID);
    expect(result.nextSelectedIndex).toBe(1);
  });

  it("updates selection on hover-like selection-change payload without navigation target", () => {
    const result = runResolver(hoverByLabelShopping, 0);
    expect(result.nextSelectedIndex).toBe(1);
    expect(result.targetListId).toBeNull();
  });

  it("maps selection-change from proto-style index payload", () => {
    const result = runResolver(hoverByProtoIndexSecond, 0);
    expect(result.nextSelectedIndex).toBe(1);
    expect(result.targetListId).toBeNull();
  });
});

describe("DashboardScreen integration", () => {
  it("calls router.toList with shopping when explicit click payload arrives", () => {
    const toList = vi.fn<(listId: string) => void>();
    const router = { toList, toDetail: vi.fn(), back: vi.fn() };
    const screen = createDashboardScreen(router, createDataService(dashboardItems), createLogger());

    screen.onInput(explicitClickByLabelShopping);

    expect(toList).toHaveBeenCalledWith(SHOPPING_LIST_ID);
  });

  it("routes by index payload for shopping without requiring prior up/down", () => {
    const toList = vi.fn<(listId: string) => void>();
    const router = { toList, toDetail: vi.fn(), back: vi.fn() };
    const screen = createDashboardScreen(router, createDataService(dashboardItems), createLogger());

    const clickEvent: InputEvent = explicitClickByZeroBasedIndexSecond;
    screen.onInput(clickEvent);

    expect(toList).toHaveBeenCalledWith(SHOPPING_LIST_ID);
  });

  it("opens the selected shopping app on a payload-less click after down navigation", () => {
    const toList = vi.fn<(listId: string) => void>();
    const router = { toList, toDetail: vi.fn(), back: vi.fn() };
    const screen = createDashboardScreen(router, createDataService(dashboardItems), createLogger());

    screen.onInput(downEvent);
    screen.onInput({ type: "Click", raw: { jsonData: { eventSource: 1 } } });

    expect(toList).toHaveBeenCalledWith(SHOPPING_LIST_ID);
  });

  it("renders text menu and shows description for selected menu item", () => {
    const screen = createDashboardScreen(
      createRouter(),
      createDataService(dashboardItems),
      createLogger()
    );

    const viewModel = screen.getViewModel();
    expect(viewModel.layoutMode).toBe("dashboard-menu");
    expect(viewModel.containers).toHaveLength(4);
    expect(viewModel.containers[0]).toMatchObject({
      type: "text",
      id: "dashboard-event-layer",
      content: "",
      eventCapture: 1,
    });
    expect(viewModel.containers[1]).toMatchObject({
      type: "text",
      id: "dashboard-menu-item-0-selected",
      content: "RSS Feeds",
      eventCapture: 0,
    });
    expect(viewModel.containers[2]).toMatchObject({
      type: "text",
      id: "dashboard-menu-item-1",
      content: "Shopping List",
      eventCapture: 0,
    });
    const infoContainer = viewModel.containers[3];
    if (!infoContainer || infoContainer.type !== "text") {
      throw new Error("Expected text info container");
    }
    expect(infoContainer.content).toContain("RSS description");
  });

  it("renders runtime status line in dashboard info", () => {
    const screen = createDashboardScreen(
      createRouter(),
      createDataService(dashboardItems, "G2: connected 84%"),
      createLogger()
    );

    const viewModel = screen.getViewModel();
    const infoContainer = viewModel.containers[3];
    if (!infoContainer || infoContainer.type !== "text") {
      throw new Error("Expected text info container");
    }
    expect(infoContainer.content).toContain("G2: connected 84%");
  });

  it("updates description when selected dashboard item changes", () => {
    const screen = createDashboardScreen(
      createRouter(),
      createDataService(dashboardItems),
      createLogger()
    );

    screen.onInput(downEvent);
    const viewModel = screen.getViewModel();
    expect(viewModel.containers[1]).toMatchObject({
      type: "text",
      id: "dashboard-menu-item-0",
      eventCapture: 0,
    });
    expect(viewModel.containers[2]).toMatchObject({
      type: "text",
      id: "dashboard-menu-item-1-selected",
      eventCapture: 0,
    });
    const infoContainer = viewModel.containers[3];
    if (!infoContainer || infoContainer.type !== "text") {
      throw new Error("Expected text info container");
    }
    expect(infoContainer.content).toContain("Shopping description");
  });

  it("logs marked item on down navigation", () => {
    const { logger, debug } = createSpyLogger();
    const screen = createDashboardScreen(createRouter(), createDataService(dashboardItems), logger);

    screen.onInput(downEvent);

    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining("Dashboard Down marked -> index:1 item:dashboard-shopping-list|Shopping List|list:shopping-list")
    );
  });

  it("logs clamped marked item on up navigation at top", () => {
    const { logger, debug } = createSpyLogger();
    const screen = createDashboardScreen(createRouter(), createDataService(dashboardItems), logger);

    screen.onInput(upEvent);

    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining("Dashboard Up marked -> index:0 item:dashboard-rss|RSS Feeds|list:rss")
    );
  });

  it("routes root double click through router.back", () => {
    const router = createRouter();
    const screen = createDashboardScreen(router, createDataService(dashboardItems), createLogger());

    screen.onInput({ type: "DoubleClick" });

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("routes on legacy click payload selection change like shopping list behavior", () => {
    const toList = vi.fn<(listId: string) => void>();
    const { logger, debug } = createSpyLogger();
    const screen = createDashboardScreen(
      { toList, toDetail: vi.fn(), back: vi.fn() },
      createDataService(dashboardItems),
      logger
    );

    screen.onInput(clickByLabelShopping);
    const viewModel = screen.getViewModel();
    const infoContainer = viewModel.containers[3];
    if (!infoContainer || infoContainer.type !== "text") {
      throw new Error("Expected text info container");
    }

    expect(infoContainer.content).toContain("Shopping description");
    expect(toList).toHaveBeenCalledWith(SHOPPING_LIST_ID);
    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining(
        "Dashboard click target -> index:1 item:dashboard-shopping-list|Shopping List|list:shopping-list list:shopping-list"
      )
    );
  });

  it("resets dashboard selection on re-enter and opens RSS on click without payload", () => {
    const toList = vi.fn<(listId: string) => void>();
    const { logger, debug } = createSpyLogger();
    const screen = createDashboardScreen(
      { toList, toDetail: vi.fn(), back: vi.fn() },
      createDataService(dashboardItems),
      logger
    );

    screen.onEnter();
    screen.onInput(downEvent);
    screen.onExit();
    screen.onEnter();
    screen.onInput({ type: "Click" });

    expect(toList).toHaveBeenLastCalledWith(RSS_LIST_ID);
    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining("Dashboard selection reset -> index:0 item:dashboard-rss|RSS Feeds|list:rss")
    );
  });

  it("updates description on selection-change event without opening target list", () => {
    const toList = vi.fn<(listId: string) => void>();
    const { logger, debug } = createSpyLogger();
    const screen = createDashboardScreen(
      { toList, toDetail: vi.fn(), back: vi.fn() },
      createDataService(dashboardItems),
      logger
    );

    screen.onInput(hoverByLabelShopping);
    const viewModel = screen.getViewModel();
    const infoContainer = viewModel.containers[3];
    if (!infoContainer || infoContainer.type !== "text") {
      throw new Error("Expected text info container");
    }

    expect(infoContainer.content).toContain("Shopping description");
    expect(toList).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining(
        "Dashboard hover -> index:1 item:dashboard-shopping-list|Shopping List|list:shopping-list"
      )
    );
  });

  it("updates description on proto-style selection-change index payload", () => {
    const toList = vi.fn<(listId: string) => void>();
    const screen = createDashboardScreen(
      { toList, toDetail: vi.fn(), back: vi.fn() },
      createDataService(dashboardItems),
      createLogger()
    );

    screen.onInput(hoverByProtoIndexSecond);
    const viewModel = screen.getViewModel();
    const infoContainer = viewModel.containers[3];
    if (!infoContainer || infoContainer.type !== "text") {
      throw new Error("Expected text info container");
    }

    expect(infoContainer.content).toContain("Shopping description");
    expect(toList).not.toHaveBeenCalled();
  });

  it("uses fallback text when no description exists", () => {
    const screen = createDashboardScreen(
      createRouter(),
      createDataService([
        { id: "dashboard-rss", label: "RSS Feeds", listId: RSS_LIST_ID },
      ]),
      createLogger()
    );

    const viewModel = screen.getViewModel();
    const infoContainer = viewModel.containers[2];
    if (!infoContainer || infoContainer.type !== "text") {
      throw new Error("Expected text info container");
    }
    expect(infoContainer.content).toContain("No description available.");
  });
});

function runResolver(event: InputEvent, currentSelectedIndex: number) {
  return resolveDashboardSelection({
    items: dashboardItems,
    currentSelectedIndex,
    event,
    logger: createLogger(),
  });
}

function createDataService(items: DashboardItem[], statusLine?: string): DataService {
  const dashboard: DashboardData = {
    title: "Dashboard",
    items,
    statusLine,
  };

  return {
    getDashboard(): DashboardData {
      return dashboard;
    },
    async refreshList(): Promise<void> {},
    getList(): ListData {
      return {
        id: "unused",
        title: "unused",
        items: [],
      };
    },
    async toggleShoppingItem(): Promise<void> {},
    async addShoppingItem(): Promise<void> {},
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
}

function createLogger() {
  return {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };
}

function createSpyLogger() {
  const info = vi.fn<(message: string) => void>();
  const debug = vi.fn<(message: string) => void>();
  const warn = vi.fn<(message: string) => void>();
  const error = vi.fn<(message: string, ...args: unknown[]) => void>();

  return {
    logger: { info, debug, warn, error },
    info,
    debug,
    warn,
    error,
  };
}

function createRouter() {
  return { toList: vi.fn(), toDetail: vi.fn(), back: vi.fn() };
}
