import { describe, expect, it } from "vitest";
import { ShoppingConfigService } from "../../../src/services/data/ShoppingConfigService";
import type { StorageService } from "../../../src/services/storage/StorageService";

class MemoryStorageService implements StorageService {
  private readonly values = new Map<string, string>();
  private failSet = false;

  async get(key: string): Promise<string> {
    return this.values.get(key) ?? "";
  }

  async set(key: string, value: string): Promise<boolean> {
    if (this.failSet) {
      return false;
    }
    this.values.set(key, value);
    return true;
  }

  seed(key: string, value: string): void {
    this.values.set(key, value);
  }

  setFailSet(fail: boolean): void {
    this.failSet = fail;
  }
}

describe("ShoppingConfigService", () => {
  it("returns empty list and seeds storage when storage is empty", async () => {
    const storage = new MemoryStorageService();
    const service = new ShoppingConfigService(storage);

    const items = await service.loadEditableItems();

    expect(items).toEqual([]);
    const stored = await storage.get("shopping_config_v1");
    expect(stored).toContain('"version":1');
    expect(stored).toContain('"items":[]');
  });

  it("normalizes malformed payloads from storage", async () => {
    const storage = new MemoryStorageService();
    storage.seed(
      "shopping_config_v1",
      JSON.stringify({
        version: 1,
        items: [
          { id: "milk", title: "  Milch  ", done: 1, position: 5.8 },
          { id: "milk", title: "Brot", done: false, position: -1 },
          { id: "", title: "  ", done: false, position: 2 },
        ],
      })
    );
    const service = new ShoppingConfigService(storage);

    const items = await service.loadEditableItems();

    expect(items).toEqual([
      {
        id: "milk",
        title: "Milch",
        done: true,
        position: 5,
      },
      {
        id: "milk-2",
        title: "Brot",
        done: false,
        position: 1,
      },
    ]);
  });

  it("resets corrupt JSON payload to empty list", async () => {
    const storage = new MemoryStorageService();
    storage.seed("shopping_config_v1", "{ invalid json");
    const service = new ShoppingConfigService(storage);

    const items = await service.loadEditableItems();

    expect(items).toEqual([]);
    const stored = await storage.get("shopping_config_v1");
    expect(stored).toContain('"items":[]');
  });

  it("saves valid editable shopping entries", async () => {
    const storage = new MemoryStorageService();
    const service = new ShoppingConfigService(storage);

    await service.saveEditableItems([
      { id: "milk", title: "Milch", done: false, position: 0 },
      { id: "bread", title: "Brot", done: true, position: 1 },
    ]);

    const items = await service.loadEditableItems();
    expect(items).toEqual([
      { id: "milk", title: "Milch", done: false, position: 0 },
      { id: "bread", title: "Brot", done: true, position: 1 },
    ]);
  });

  it("adds a trimmed open item after existing positions", async () => {
    const storage = new MemoryStorageService();
    storage.seed(
      "shopping_config_v1",
      JSON.stringify({
        version: 1,
        items: [{ id: "milk", title: "Milch", done: false, position: 4 }],
      })
    );
    const service = new ShoppingConfigService(storage);

    const item = await service.addEditableItem("  Brot kaufen  ");

    expect(item).toMatchObject({
      title: "Brot kaufen",
      done: false,
      position: 5,
    });
    expect(item.id).toMatch(/^brot-kaufen-/);
    await expect(service.loadEditableItems()).resolves.toEqual([
      { id: "milk", title: "Milch", done: false, position: 4 },
      item,
    ]);
  });

  it("rejects empty added items", async () => {
    const storage = new MemoryStorageService();
    const service = new ShoppingConfigService(storage);

    await expect(service.addEditableItem("   ")).rejects.toThrow("The todo title cannot be empty.");
  });

  it("throws when storage refuses to persist data", async () => {
    const storage = new MemoryStorageService();
    storage.setFailSet(true);
    const service = new ShoppingConfigService(storage);

    await expect(
      service.saveEditableItems([{ id: "milk", title: "Milch", done: false, position: 0 }])
    ).rejects.toThrow("Unable to save the shopping configuration.");
  });
});
