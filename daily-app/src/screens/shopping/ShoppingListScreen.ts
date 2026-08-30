import type { Screen } from "../../navigation/screen";
import type { InputEvent } from "../../input/keyBindings";
import type { Logger } from "../../utils/logger";
import type { Router } from "../../navigation/router";
import type { DataService, ListData, ListItem } from "../../services/data/DataService";
import { SHOPPING_DIVIDER_ITEM_ID } from "../../services/data/RssAppDataService";
import type { TodoSpeechService, TodoSpeechSession, TodoSpeechSnapshot } from "../../services/speech/TodoSpeechService";
import { clamp } from "../../utils/clamp";
import { buildListViewModel } from "../../ui/components/ListView";
import type { ViewModel } from "../../ui/render/renderPipeline";
import { readEventType, readSelectedIndex, readSelectedItemName } from "../shared/readSelectedIndex";

const STATUS_ITEM_ID = "__shopping-status__";
const ADD_TODO_ITEM_ID = "__shopping-add-todo__";

export function createShoppingListScreen(
  listId: string,
  dataService: DataService,
  logger: Logger,
  router: Router,
  requestRender: () => void,
  todoSpeechService?: TodoSpeechService
): Screen {
  let selectedIndex = 0;
  let isLoading = false;
  let loadError: string | null = null;
  let refreshSequence = 0;
  let mode: "list" | "voice" = "list";
  let speechSession: TodoSpeechSession | null = null;
  let speechSnapshot: TodoSpeechSnapshot = {
    status: "starting",
    transcript: "",
    message: "Voice input ready.",
  };
  let isSavingSpeechTodo = false;

  async function refresh(): Promise<void> {
    const sequence = refreshSequence + 1;
    refreshSequence = sequence;

    isLoading = true;
    loadError = null;
    requestRender();

    try {
      await dataService.refreshList(listId);
      if (sequence !== refreshSequence) {
        return;
      }
      const list = dataService.getList(listId);
      selectedIndex = clamp(selectedIndex, 0, Math.max(0, list.items.length - 1));
    } catch (error) {
      if (sequence !== refreshSequence) {
        return;
      }
      loadError = error instanceof Error ? error.message : "Unknown shopping list error";
    } finally {
      if (sequence !== refreshSequence) {
        return;
      }
      isLoading = false;
      requestRender();
    }
  }

  async function toggleSelectedItem(item: ListItem): Promise<void> {
    if (item.id === ADD_TODO_ITEM_ID) {
      await beginSpeechTodoInput();
      return;
    }

    if (item.id === STATUS_ITEM_ID || item.id === SHOPPING_DIVIDER_ITEM_ID) {
      return;
    }

    logger.debug(`Shopping toggle trigger -> id:${item.id} label:${item.label}`);
    const beforeState = readLabelState(item.label);
    const previousSelectedIndex = selectedIndex;

    try {
      await dataService.toggleShoppingItem(item.id);
      loadError = null;
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Unable to update this item.";
    }

    const nextList = dataService.getList(listId);
    selectedIndex = resolveInteractiveIndex(nextList.items, previousSelectedIndex, previousSelectedIndex);

    const nextItem = nextList.items.find((entry) => entry.id === item.id);
    const afterState = nextItem ? readLabelState(nextItem.label) : "missing";
    logger.debug(
      `Shopping toggle result -> id:${item.id} before:${beforeState} after:${afterState} nextSelected:${selectedIndex}`
    );
    logger.debug(`Shopping list items after toggle -> ${formatListItems(nextList.items)}`);
    requestRender();
  }

  async function beginSpeechTodoInput(): Promise<void> {
    if (!todoSpeechService || speechSession || isSavingSpeechTodo) {
      return;
    }

    mode = "voice";
    speechSnapshot = {
      status: "starting",
      transcript: "",
      message: "Starting voice input...",
    };
    requestRender();

    try {
      speechSession = await todoSpeechService.start({
        onSnapshot(snapshot) {
          speechSnapshot = snapshot;
          requestRender();
        },
        onFinalText(text) {
          void saveSpeechTodo(text);
        },
        onError(error) {
          speechSnapshot = {
            status: "error",
            transcript: speechSnapshot.transcript,
            message: error.message,
          };
          requestRender();
        },
      });
    } catch (error) {
      speechSession = null;
      speechSnapshot = {
        status: "error",
        transcript: "",
        message: error instanceof Error ? error.message : "Unable to start voice input.",
      };
      requestRender();
    }
  }

  async function saveSpeechTodo(rawTitle: string): Promise<void> {
    const title = rawTitle.trim();
    if (!title || isSavingSpeechTodo) {
      return;
    }

    isSavingSpeechTodo = true;
    speechSnapshot = {
      status: "recognized",
      transcript: title,
      message: "Saving todo...",
    };
    requestRender();

    try {
      await dataService.addShoppingItem(title);
      await speechSession?.stop();
      speechSession = null;
      mode = "list";
      loadError = null;
      const list = withAddTodoAction(dataService.getList(listId), todoSpeechService !== undefined);
      selectedIndex = resolveInteractiveIndex(list.items, 1, 1);
    } catch (error) {
      speechSnapshot = {
        status: "error",
        transcript: title,
        message: error instanceof Error ? error.message : "Unable to save the todo.",
      };
    } finally {
      isSavingSpeechTodo = false;
      requestRender();
    }
  }

  async function cancelSpeechTodoInput(): Promise<void> {
    await speechSession?.stop();
    speechSession = null;
    mode = "list";
    isSavingSpeechTodo = false;
    requestRender();
  }

  return {
    id: `list:${listId}`,
    onEnter() {
      logger.info(`Enter List ${listId}`);
      void refresh();
    },
    onExit() {
      refreshSequence += 1;
      void cancelSpeechTodoInput();
      logger.info(`Exit List ${listId}`);
    },
    onInput(event: InputEvent) {
      if (mode === "voice") {
        if (event.type === "DoubleClick") {
          void cancelSpeechTodoInput();
          return;
        }

        if (event.type === "Click") {
          if (speechSnapshot.status === "error") {
            void cancelSpeechTodoInput();
            return;
          }

          if (speechSnapshot.transcript.trim()) {
            void saveSpeechTodo(speechSnapshot.transcript);
          }
        }
        return;
      }

      const list = dataService.getList(listId);
      const visibleList = withAddTodoAction(withStatusState(list, isLoading, loadError), todoSpeechService !== undefined);
      logger.debug(`Shopping list items -> ${formatListItems(visibleList.items)}`);
      const hasItems = visibleList.items.length > 0;
      const maxIndex = Math.max(0, visibleList.items.length - 1);
      const payloadIndex = readSelectedIndex(event);
      const payloadName = readSelectedItemName(event);
      const payloadType = readEventType(event);
      const previousSelectedIndex = selectedIndex;
      let nextSelectedIndex = selectedIndex;

      if (hasItems) {
        const resolvedIndex = resolveListSelectionIndex(visibleList.items, event);
        if (resolvedIndex !== null) {
          nextSelectedIndex = clamp(resolvedIndex, 0, maxIndex);
        }
      }

      if (event.type === "Up" && hasItems) {
        nextSelectedIndex = clamp(nextSelectedIndex - 1, 0, maxIndex);
      }

      if (event.type === "Down" && hasItems) {
        nextSelectedIndex = clamp(nextSelectedIndex + 1, 0, maxIndex);
      }

      if (hasItems) {
        nextSelectedIndex = resolveInteractiveIndex(visibleList.items, nextSelectedIndex, previousSelectedIndex);
        selectedIndex = nextSelectedIndex;

        const hoverItem = visibleList.items[selectedIndex];
        if (hoverItem) {
          logger.debug(
            `Shopping hover -> index:${selectedIndex} id:${hoverItem.id} label:${hoverItem.label} ` +
              `payload(index:${payloadIndex ?? "-"}, name:${payloadName ?? "-"}, type:${String(payloadType)})`
          );
        }
      }

      if (event.type === "Click" && hasItems) {
        if (
          isImplicitClickSelectionUpdate(
            event,
            previousSelectedIndex,
            selectedIndex,
            payloadIndex,
            payloadName
          )
        ) {
          logger.debug(
            `Shopping click skipped (ambiguous/implicit) prev:${previousSelectedIndex} next:${selectedIndex} ` +
              `payload(index:${payloadIndex ?? "-"}, name:${payloadName ?? "-"}, type:${String(payloadType)})`
          );
          return;
        }
        const item = visibleList.items[selectedIndex];
        if (item) {
          logger.debug(
            `Shopping click -> index:${selectedIndex} id:${item.id} label:${item.label} ` +
              `payload(index:${payloadIndex ?? "-"}, name:${payloadName ?? "-"}, type:${String(payloadType)})`
          );
          void toggleSelectedItem(item);
        }
      }

      if (event.type === "DoubleClick") {
        router.back();
      }
    },
    getViewModel(): ViewModel {
      if (mode === "voice") {
        return buildSpeechTodoViewModel(speechSnapshot);
      }

      const visible = withStatusState(dataService.getList(listId), isLoading, loadError);
      const withAction = withAddTodoAction(visible, todoSpeechService !== undefined);
      const boundedIndex = clamp(selectedIndex, 0, Math.max(0, withAction.items.length - 1));
      return buildListViewModel(withAction, boundedIndex);
    },
  };
}

function isImplicitClickSelectionUpdate(
  event: InputEvent,
  previousSelectedIndex: number,
  nextSelectedIndex: number,
  payloadIndex: number | null,
  payloadName: string | null
): boolean {
  if (event.type !== "Click") {
    return false;
  }

  const rawType = readEventType(event);
  if (rawType !== undefined) {
    return false;
  }

  // If host provides explicit selection payload, treat as an intentional click target.
  if (payloadIndex !== null || payloadName !== null) {
    return false;
  }

  // If the selection did not move, this is a click on the currently highlighted row.
  if (previousSelectedIndex === nextSelectedIndex) {
    return false;
  }

  // Without explicit type + payload and with a selection jump, treat as implicit selection update.
  return previousSelectedIndex !== nextSelectedIndex;
}

function withStatusState(list: ListData, isLoading: boolean, loadError: string | null): ListData {
  if (list.items.length > 0) {
    if (isLoading) {
      return { ...list, title: `${list.title} (loading...)` };
    }

    if (loadError) {
      return { ...list, title: `${list.title} (last update)` };
    }

    return list;
  }

  const message = isLoading
    ? "Loading shopping list..."
    : loadError
      ? `Error: ${loadError}`
      : "No shopping items yet.";

  return {
    ...list,
    items: [{ id: STATUS_ITEM_ID, label: message }],
  };
}

function withAddTodoAction(list: ListData, isEnabled: boolean): ListData {
  if (!isEnabled) {
    return list;
  }

  return {
    ...list,
    items: [
      { id: ADD_TODO_ITEM_ID, label: "+ Add todo by voice" },
      ...list.items,
    ],
  };
}

function buildSpeechTodoViewModel(snapshot: TodoSpeechSnapshot): ViewModel {
  const transcript = snapshot.transcript.trim() || "(nothing heard yet)";
  return {
    title: "New Todo",
    containers: [
      {
        type: "text",
        id: "speech-todo",
        eventCapture: 1,
        content: [
          "New Todo",
          "",
          snapshot.message,
          "",
          transcript,
        ].join("\n"),
      },
    ],
  };
}

function resolveListSelectionIndex(
  items: ListItem[],
  event: InputEvent
): number | null {
  if (items.length === 0) {
    return null;
  }

  const maxIndex = items.length - 1;
  const selectedName = readSelectedItemName(event);
  if (selectedName) {
    const normalizedName = selectedName.trim().toLowerCase();
    const matchedIndex = items.findIndex(
      (item) =>
        item.label.trim().toLowerCase() === normalizedName ||
        normalizeSelectableLabel(item.label) === normalizedName ||
        item.id.trim().toLowerCase() === normalizedName
    );
    if (matchedIndex >= 0) {
      return matchedIndex;
    }

    const numberedMatch = /^item\s*(\d+)$/i.exec(selectedName.trim());
    if (numberedMatch) {
      const oneBasedIndex = Number(numberedMatch[1]);
      if (Number.isFinite(oneBasedIndex) && oneBasedIndex >= 1) {
        return clamp(oneBasedIndex - 1, 0, maxIndex);
      }
    }
  }

  const selectedIndex = readSelectedIndex(event);
  if (selectedIndex === null) {
    return null;
  }

  return normalizeEventIndex(selectedIndex, maxIndex);
}

function normalizeEventIndex(selectedIndex: number, maxIndex: number): number {
  if (!Number.isFinite(selectedIndex)) {
    return 0;
  }

  if (selectedIndex < 0) {
    return 0;
  }

  // Prefer zero-based indexes when in-range.
  if (selectedIndex <= maxIndex) {
    return clamp(selectedIndex, 0, maxIndex);
  }

  // One-based fallback only for out-of-range payloads (e.g. 2 for second item in a 2-item list).
  return clamp(selectedIndex - 1, 0, maxIndex);
}

function normalizeSelectableLabel(label: string): string {
  return label.replace(/^\[[ xX]\]\s*/, "").trim().toLowerCase();
}

function resolveInteractiveIndex(
  items: ListItem[],
  candidateIndex: number,
  fallbackIndex: number
): number {
  const maxIndex = Math.max(0, items.length - 1);
  const boundedCandidate = clamp(candidateIndex, 0, maxIndex);
  const boundedFallback = clamp(fallbackIndex, 0, maxIndex);

  if (isInteractiveItem(items[boundedCandidate])) {
    return boundedCandidate;
  }

  if (isInteractiveItem(items[boundedFallback])) {
    return boundedFallback;
  }

  for (let index = boundedCandidate - 1; index >= 0; index -= 1) {
    if (isInteractiveItem(items[index])) {
      return index;
    }
  }

  for (let index = boundedCandidate + 1; index <= maxIndex; index += 1) {
    if (isInteractiveItem(items[index])) {
      return index;
    }
  }

  return boundedCandidate;
}

function isInteractiveItem(item: ListItem | undefined): boolean {
  if (!item) {
    return false;
  }
  return item.id !== STATUS_ITEM_ID && item.id !== SHOPPING_DIVIDER_ITEM_ID;
}

function formatListItems(items: ListItem[]): string {
  if (items.length === 0) {
    return "(empty)";
  }

  return items.map((item, index) => `${index}:${item.id}:${item.label}`).join(" | ");
}

function readLabelState(label: string): "open" | "done" | "other" {
  if (label.startsWith("[ ] ")) {
    return "open";
  }
  if (label.startsWith("[x] ") || label.startsWith("[X] ")) {
    return "done";
  }
  return "other";
}
