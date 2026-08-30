import { describe, expect, it, vi } from "vitest";
import {
  RssAppDataService,
  SHOPPING_DIVIDER_ITEM_ID,
  SHOPPING_LIST_ID,
} from "../../../src/services/data/RssAppDataService";
import type { EditableShoppingItem } from "../../../src/services/data/shoppingConfig";

describe("RssAppDataService shopping list", () => {
  it("adds EvenHub runtime status to dashboard data", () => {
    const service = new RssAppDataService(createRssConfigServiceStub() as any, {
      loadEditableItems: vi.fn(async () => []),
      saveEditableItems: vi.fn(async () => {}),
    } as any);

    service.setLaunchSource("glassesMenu");
    service.setUserName("Ada");
    service.setDeviceStatus({
      sn: "G2-1",
      connectType: "connected",
      batteryLevel: 84,
      isWearing: true,
    });

    expect(service.getDashboard().statusLine).toBe("G2: connected 84% worn | Start: glassesMenu | User: Ada");
  });

  it("loads shopping list entries from shopping config service", async () => {
    const shoppingItems: EditableShoppingItem[] = [
      { id: "eggs", title: "Eier", done: false, position: 1 },
      { id: "milk", title: "Milch", done: false, position: 0 },
      { id: "soap", title: "Seife", done: true, position: 2 },
    ];

    const shoppingConfigService = {
      loadEditableItems: vi.fn(async () => shoppingItems),
      saveEditableItems: vi.fn(async () => {}),
    };
    const service = new RssAppDataService(createRssConfigServiceStub() as any, shoppingConfigService as any);

    await service.refreshList(SHOPPING_LIST_ID);

    const list = service.getList(SHOPPING_LIST_ID);
    expect(list.items).toEqual([
      { id: "milk", label: "[ ] Milch" },
      { id: "eggs", label: "[ ] Eier" },
      { id: SHOPPING_DIVIDER_ITEM_ID, label: "-------- Done --------" },
      { id: "soap", label: "[x] Seife" },
    ]);
    expect(shoppingConfigService.loadEditableItems).toHaveBeenCalledTimes(1);
  });

  it("toggles shopping item and persists updated state", async () => {
    const initialItems: EditableShoppingItem[] = [
      { id: "milk", title: "Milch", done: false, position: 0 },
      { id: "bread", title: "Brot", done: false, position: 1 },
    ];
    const saveEditableItems = vi.fn(async (_items: EditableShoppingItem[]) => {});
    let persistedItems = initialItems.map((item) => ({ ...item }));
    const loadEditableItems = vi.fn(async () => persistedItems);
    const shoppingConfigService = {
      loadEditableItems,
      saveEditableItems: vi.fn(async (items: EditableShoppingItem[]) => {
        saveEditableItems(items);
        persistedItems = items.map((item) => ({ ...item }));
      }),
    };
    const service = new RssAppDataService(createRssConfigServiceStub() as any, shoppingConfigService as any);
    await service.refreshList(SHOPPING_LIST_ID);

    await service.toggleShoppingItem("milk");

    expect(saveEditableItems).toHaveBeenCalledTimes(1);
    const persisted = saveEditableItems.mock.calls[0]?.[0] ?? [];
    expect(persisted).toEqual([
      { id: "milk", title: "Milch", done: true, position: 0 },
      { id: "bread", title: "Brot", done: false, position: 1 },
    ]);
    const list = service.getList(SHOPPING_LIST_ID);
    expect(list.items).toEqual([
      { id: "bread", label: "[ ] Brot" },
      { id: SHOPPING_DIVIDER_ITEM_ID, label: "-------- Done --------" },
      { id: "milk", label: "[x] Milch" },
    ]);
    expect(loadEditableItems).toHaveBeenCalledTimes(2);
  });

  it("ignores toggle requests for unknown shopping IDs", async () => {
    const initialItems: EditableShoppingItem[] = [
      { id: "milk", title: "Milch", done: false, position: 0 },
    ];
    const saveEditableItems = vi.fn(async () => {});
    const shoppingConfigService = {
      loadEditableItems: vi.fn(async () => initialItems),
      saveEditableItems,
    };
    const service = new RssAppDataService(createRssConfigServiceStub() as any, shoppingConfigService as any);
    await service.refreshList(SHOPPING_LIST_ID);

    await service.toggleShoppingItem("unknown-item");

    expect(saveEditableItems).not.toHaveBeenCalled();
    expect(service.getList(SHOPPING_LIST_ID).items).toEqual([{ id: "milk", label: "[ ] Milch" }]);
  });

  it("keeps done items below divider as regression guard", async () => {
    const shoppingConfigService = {
      loadEditableItems: vi.fn(async () => [
        { id: "done-a", title: "A", done: true, position: 0 },
        { id: "open-a", title: "B", done: false, position: 1 },
        { id: "done-b", title: "C", done: true, position: 2 },
      ]),
      saveEditableItems: vi.fn(async () => {}),
    };
    const service = new RssAppDataService(createRssConfigServiceStub() as any, shoppingConfigService as any);
    await service.refreshList(SHOPPING_LIST_ID);

    const list = service.getList(SHOPPING_LIST_ID);
    const dividerIndex = list.items.findIndex((item) => item.id === SHOPPING_DIVIDER_ITEM_ID);
    expect(dividerIndex).toBeGreaterThan(0);
    const doneLabels = list.items.slice(dividerIndex + 1).map((item) => item.label);
    expect(doneLabels).toEqual(["[x] A", "[x] C"]);
  });

  it("keeps all entries as done when no open entries exist", async () => {
    const shoppingConfigService = {
      loadEditableItems: vi.fn(async () => [
        { id: "done-a", title: "A", done: true, position: 0 },
        { id: "done-b", title: "B", done: true, position: 1 },
      ]),
      saveEditableItems: vi.fn(async () => {}),
    };
    const service = new RssAppDataService(createRssConfigServiceStub() as any, shoppingConfigService as any);
    await service.refreshList(SHOPPING_LIST_ID);

    const list = service.getList(SHOPPING_LIST_ID);
    expect(list.items).toEqual([
      { id: "done-a", label: "[x] A" },
      { id: "done-b", label: "[x] B" },
    ]);
  });

  it("adds shopping item through config service and reloads list", async () => {
    let items = [{ id: "milk", title: "Milch", done: false, position: 0 }];
    const shoppingConfigService = {
      loadEditableItems: vi.fn(async () => items),
      saveEditableItems: vi.fn(async () => {}),
      addEditableItem: vi.fn(async (title: string) => {
        items = [
          ...items,
          { id: "bread", title, done: false, position: 1 },
        ];
        return items[1]!;
      }),
    };
    const service = new RssAppDataService(createRssConfigServiceStub() as any, shoppingConfigService as any);
    await service.refreshList(SHOPPING_LIST_ID);

    await service.addShoppingItem("Brot");

    expect(shoppingConfigService.addEditableItem).toHaveBeenCalledWith("Brot");
    expect(service.getList(SHOPPING_LIST_ID).items).toEqual([
      { id: "milk", label: "[ ] Milch" },
      { id: "bread", label: "[ ] Brot" },
    ]);
  });
});

function createRssConfigServiceStub() {
  return {
    loadRuntimeFeeds: vi.fn(async () => []),
  };
}
