import type { InputEvent } from "../../../../src/input/keyBindings";

export const clickByLabelRss: InputEvent = {
  type: "Click",
  raw: { listEvent: { currentSelectItemName: "RSS Feeds" } },
};

export const clickByLabelShopping: InputEvent = {
  type: "Click",
  raw: { listEvent: { currentSelectItemName: "Shopping List" } },
};

export const explicitClickByLabelShopping: InputEvent = {
  type: "Click",
  raw: { listEvent: { currentSelectItemName: "Shopping List", eventType: 0 } },
};

export const clickByItemNameFirst: InputEvent = {
  type: "Click",
  raw: { listEvent: { currentSelectItemName: "item1" } },
};

export const clickByItemNameSecond: InputEvent = {
  type: "Click",
  raw: { listEvent: { currentSelectItemName: "item2" } },
};

export const clickByZeroBasedIndexFirst: InputEvent = {
  type: "Click",
  raw: { listEvent: { currentSelectItemIndex: 0 } },
};

export const clickByZeroBasedIndexSecond: InputEvent = {
  type: "Click",
  raw: { listEvent: { currentSelectItemIndex: 1 } },
};

export const explicitClickByZeroBasedIndexSecond: InputEvent = {
  type: "Click",
  raw: { listEvent: { currentSelectItemIndex: 1, eventType: 0 } },
};

export const clickByOneBasedIndexSecond: InputEvent = {
  type: "Click",
  raw: { listEvent: { currentSelectItemIndex: 2 } },
};

export const clickByJsonDataZeroBasedSecond: InputEvent = {
  type: "Click",
  raw: { jsonData: { currentSelectItemIndex: 1 } },
};

export const clickWithUnknownPayload: InputEvent = {
  type: "Click",
  raw: { listEvent: { currentSelectItemName: "unknown" } },
};

export const hoverByLabelShopping: InputEvent = {
  type: "SelectionChange",
  raw: { listEvent: { currentSelectItemName: "Shopping List" } },
};

export const hoverByProtoIndexSecond: InputEvent = {
  type: "SelectionChange",
  raw: { listEvent: { CurrentSelect_ItemIndex: "2" } },
};

export const upEvent: InputEvent = {
  type: "Up",
};

export const downEvent: InputEvent = {
  type: "Down",
};
