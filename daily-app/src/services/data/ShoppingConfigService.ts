import type { StorageService } from "../storage/StorageService";
import {
  DEFAULT_SHOPPING_ITEMS,
  SHOPPING_STORAGE_KEY,
  SHOPPING_STORAGE_VERSION,
  type EditableShoppingItem,
} from "./shoppingConfig";

interface StoredShoppingConfig {
  version: number;
  items: unknown;
}

interface NormalizedResult {
  items: EditableShoppingItem[];
  changed: boolean;
}

export class ShoppingConfigService {
  constructor(private readonly storage: StorageService) {}

  async ensureSeededDefaults(): Promise<void> {
    await this.loadEditableItems();
  }

  async loadEditableItems(): Promise<EditableShoppingItem[]> {
    const stored = await this.storage.get(SHOPPING_STORAGE_KEY);
    if (!stored.trim()) {
      const seeded = cloneItems(DEFAULT_SHOPPING_ITEMS);
      await this.persistEditableItems(seeded);
      return seeded;
    }

    let parsed: StoredShoppingConfig;
    try {
      parsed = JSON.parse(stored) as StoredShoppingConfig;
    } catch {
      const seeded = cloneItems(DEFAULT_SHOPPING_ITEMS);
      await this.persistEditableItems(seeded);
      return seeded;
    }

    if (!parsed || parsed.version !== SHOPPING_STORAGE_VERSION || !Array.isArray(parsed.items)) {
      const seeded = cloneItems(DEFAULT_SHOPPING_ITEMS);
      await this.persistEditableItems(seeded);
      return seeded;
    }

    const normalized = normalizeEditableItems(parsed.items);
    if (normalized.changed) {
      await this.persistEditableItems(normalized.items);
    }

    return normalized.items;
  }

  async saveEditableItems(items: EditableShoppingItem[]): Promise<void> {
    const normalized = normalizeEditableItems(items);
    await this.persistEditableItems(normalized.items);
  }

  async addEditableItem(title: string): Promise<EditableShoppingItem> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      throw new Error("The todo title cannot be empty.");
    }

    const items = await this.loadEditableItems();
    const nextPosition =
      items.length === 0 ? 0 : Math.max(...items.map((item) => item.position)) + 1;
    const usedIds = new Set(items.map((item) => item.id));
    const item: EditableShoppingItem = {
      id: dedupeId(createItemId(normalizedTitle, items.length), usedIds),
      title: normalizedTitle,
      done: false,
      position: nextPosition,
    };

    await this.persistEditableItems([...items, item]);
    return { ...item };
  }

  private async persistEditableItems(items: EditableShoppingItem[]): Promise<void> {
    const payload = JSON.stringify({
      version: SHOPPING_STORAGE_VERSION,
      items,
    });
    const ok = await this.storage.set(SHOPPING_STORAGE_KEY, payload);
    if (!ok) {
      throw new Error("Unable to save the shopping configuration.");
    }
  }
}

function normalizeEditableItems(items: unknown[]): NormalizedResult {
  const normalized: EditableShoppingItem[] = [];
  const usedIds = new Set<string>();
  let changed = false;

  for (let index = 0; index < items.length; index += 1) {
    const candidate = items[index];
    if (!candidate || typeof candidate !== "object") {
      changed = true;
      continue;
    }

    const entry = candidate as Record<string, unknown>;
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    if (!title) {
      changed = true;
      continue;
    }

    const done =
      typeof entry.done === "boolean"
        ? entry.done
        : typeof entry.done === "number"
          ? entry.done !== 0
          : false;
    if (typeof entry.done !== "boolean") {
      changed = true;
    }

    const rawPosition = entry.position;
    const position = readPosition(rawPosition, index);
    if (position !== rawPosition) {
      changed = true;
    }

    const rawId = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!rawId) {
      changed = true;
    }

    const baseId = rawId || createItemId(title, index);
    const finalId = dedupeId(baseId, usedIds);
    if (finalId !== rawId) {
      changed = true;
    }

    normalized.push({
      id: finalId,
      title,
      done,
      position,
    });
  }

  return { items: normalized, changed };
}

function readPosition(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  if (value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

function dedupeId(baseId: string, usedIds: Set<string>): string {
  let candidate = baseId;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function createItemId(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeSlug = slug || "item";
  const hash = hashString(`${title}:${index}`).slice(0, 8);
  return `${safeSlug}-${hash}`;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function cloneItems(items: EditableShoppingItem[]): EditableShoppingItem[] {
  return items.map((item) => ({ ...item }));
}
