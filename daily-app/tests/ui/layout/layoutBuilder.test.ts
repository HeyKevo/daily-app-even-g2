import { describe, expect, it } from "vitest";
import { buildLayout } from "../../../src/ui/layout/layoutBuilder";
import type { ViewModel } from "../../../src/ui/render/renderPipeline";

describe("buildLayout", () => {
  it("renders dashboard in two columns with list on the left and info box on the right", () => {
    const viewModel: ViewModel = {
      title: "Dashboard",
      layoutMode: "two-column",
      containers: [
        {
          type: "list",
          id: "dashboard-list",
          title: "Dashboard",
          items: ["RSS-Feeds", "Shopping List"],
          selectedIndex: 0,
          eventCapture: 1,
        },
        {
          type: "text",
          id: "dashboard-info",
          content: "Info",
          eventCapture: 0,
        },
      ],
    };

    const layout = buildLayout(viewModel);
    const list = layout.listObject?.[0];
    const text = layout.textObject?.[0];

    expect(layout.containerTotalNum).toBe(2);
    expect(list).toMatchObject({
      xPosition: 0,
      yPosition: 0,
      width: 280,
      height: 288,
      isEventCapture: 1,
    });
    expect(text).toMatchObject({
      xPosition: 288,
      yPosition: 0,
      width: 288,
      height: 288,
      borderWidth: 1,
      borderColor: 15,
      borderRadius: 4,
      paddingLength: 6,
      isEventCapture: 0,
    });
    expect(list?.itemContainer?.itemWidth).toBe(269);
  });

  it("renders dashboard text menu with selected row border and info panel", () => {
    const viewModel: ViewModel = {
      title: "Dashboard",
      layoutMode: "dashboard-menu",
      containers: [
        {
          type: "text",
          id: "dashboard-event-layer",
          content: "",
          eventCapture: 1,
        },
        {
          type: "text",
          id: "dashboard-menu-item-0",
          content: "RSS-Feeds",
          eventCapture: 0,
        },
        {
          type: "text",
          id: "dashboard-menu-item-1-selected",
          content: "Shopping List",
          eventCapture: 0,
        },
        {
          type: "text",
          id: "dashboard-info",
          content: "Shopping List\n\nShopping-Beschreibung",
          eventCapture: 0,
        },
      ],
    };

    const layout = buildLayout(viewModel);

    expect(layout.containerTotalNum).toBe(4);
    expect(layout.textObject).toEqual([
      {
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 288,
        borderWidth: 0,
        borderColor: undefined,
        borderRadius: 0,
        paddingLength: 0,
        containerID: 1,
        containerName: "text-1",
        content: "",
        isEventCapture: 1,
      },
      {
        xPosition: 0,
        yPosition: 104,
        width: 270,
        height: 40,
        borderWidth: 0,
        borderColor: undefined,
        borderRadius: 0,
        paddingLength: 6,
        containerID: 3,
        containerName: "text-2",
        content: "RSS-Feeds",
        isEventCapture: 0,
      },
      {
        xPosition: 0,
        yPosition: 152,
        width: 270,
        height: 40,
        borderWidth: 1,
        borderColor: 15,
        borderRadius: 6,
        paddingLength: 6,
        containerID: 4,
        containerName: "text-3",
        content: "Shopping List",
        isEventCapture: 0,
      },
      {
        xPosition: 288,
        yPosition: 0,
        width: 288,
        height: 288,
        borderWidth: 1,
        borderColor: 15,
        borderRadius: 4,
        paddingLength: 6,
        containerID: 5,
        containerName: "text-4",
        content: "Shopping List\n\nShopping-Beschreibung",
        isEventCapture: 0,
      },
    ]);
  });

  it("keeps stacked split layout when no two-column mode is requested", () => {
    const viewModel: ViewModel = {
      title: "Any",
      containers: [
        {
          type: "text",
          id: "text-1",
          content: "Top",
          eventCapture: 0,
        },
        {
          type: "list",
          id: "list-1",
          title: "List",
          items: ["A"],
          selectedIndex: 0,
          eventCapture: 1,
        },
      ],
    };

    const layout = buildLayout(viewModel);
    const list = layout.listObject?.[0];
    const text = layout.textObject?.[0];

    expect(layout.containerTotalNum).toBe(2);
    expect(text).toMatchObject({ xPosition: 0, yPosition: 0, width: 576, height: 96 });
    expect(list).toMatchObject({ xPosition: 0, yPosition: 96, width: 576, height: 192 });
  });

  it("renders list-footer mode with full list and page status at bottom-right", () => {
    const viewModel: ViewModel = {
      title: "RSS",
      layoutMode: "list-footer",
      containers: [
        {
          type: "list",
          id: "rss-list",
          title: "RSS",
          items: ["Eintrag 1", "Eintrag 2"],
          selectedIndex: 0,
          eventCapture: 1,
        },
        {
          type: "text",
          id: "rss-page-status",
          content: "1/2",
          eventCapture: 0,
        },
      ],
    };

    const layout = buildLayout(viewModel);
    const list = layout.listObject?.[0];
    const text = layout.textObject?.[0];

    expect(layout.containerTotalNum).toBe(2);
    expect(list).toMatchObject({
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      isEventCapture: 1,
    });
    expect(text).toMatchObject({
      xPosition: 488,
      yPosition: 264,
      width: 88,
      height: 24,
      isEventCapture: 0,
      content: "1/2",
    });
  });

  it("renders text-pager mode with separate body and pager text containers", () => {
    const viewModel: ViewModel = {
      title: "Detail",
      layoutMode: "text-pager",
      containers: [
        { type: "text", id: "body", content: "Body", eventCapture: 1 },
        { type: "text", id: "pager", content: "1/2 | Auto AUS", eventCapture: 0 },
      ],
    };

    const layout = buildLayout(viewModel);

    expect(layout.containerTotalNum).toBe(2);
    expect(layout.textObject).toEqual([
      {
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 240,
        borderWidth: 0,
        borderColor: undefined,
        borderRadius: 0,
        paddingLength: 0,
        containerID: 1,
        containerName: "text-1",
        content: "Body",
        isEventCapture: 1,
      },
      {
        xPosition: 0,
        yPosition: 250,
        width: 576,
        height: 30,
        borderWidth: 0,
        borderColor: undefined,
        borderRadius: 0,
        paddingLength: 0,
        containerID: 3,
        containerName: "text-2",
        content: "1/2 | Auto AUS",
        isEventCapture: 0,
      },
    ]);
  });

  it("renders text-pager title as its own rounded bordered container", () => {
    const viewModel: ViewModel = {
      title: "Detail",
      layoutMode: "text-pager",
      containers: [
        { type: "text", id: "title", content: "Article title", eventCapture: 0 },
        { type: "text", id: "body", content: "Body", eventCapture: 1 },
        { type: "text", id: "pager", content: "1/2 | Auto AUS", eventCapture: 0 },
      ],
    };

    const layout = buildLayout(viewModel);

    expect(layout.containerTotalNum).toBe(3);
    expect(layout.textObject).toEqual([
      {
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 52,
        borderWidth: 1,
        borderColor: 15,
        borderRadius: 6,
        paddingLength: 6,
        containerID: 1,
        containerName: "text-1",
        content: "Article title",
        isEventCapture: 0,
      },
      {
        xPosition: 0,
        yPosition: 62,
        width: 576,
        height: 178,
        borderWidth: 0,
        borderColor: undefined,
        borderRadius: 0,
        paddingLength: 0,
        containerID: 3,
        containerName: "text-2",
        content: "Body",
        isEventCapture: 1,
      },
      {
        xPosition: 0,
        yPosition: 250,
        width: 576,
        height: 30,
        borderWidth: 0,
        borderColor: undefined,
        borderRadius: 0,
        paddingLength: 0,
        containerID: 4,
        containerName: "text-3",
        content: "1/2 | Auto AUS",
        isEventCapture: 0,
      },
    ]);
  });

  it("renders text-pager title and body above footer image containers", () => {
    const viewModel: ViewModel = {
      title: "Detail",
      layoutMode: "text-pager",
      containers: [
        { type: "text", id: "title", content: "Article title", eventCapture: 0 },
        { type: "text", id: "body", content: "Body", eventCapture: 1 },
        {
          type: "image",
          id: "footer-left",
          imageData: new Uint8Array([1]),
          xPosition: 0,
          yPosition: 250,
          width: 288,
          height: 30,
        },
        {
          type: "image",
          id: "footer-right",
          imageData: new Uint8Array([2]),
          xPosition: 288,
          yPosition: 250,
          width: 288,
          height: 30,
        },
      ],
    };

    const layout = buildLayout(viewModel);

    expect(layout.containerTotalNum).toBe(4);
    expect(layout.textObject).toEqual([
      {
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 52,
        borderWidth: 1,
        borderColor: 15,
        borderRadius: 6,
        paddingLength: 6,
        containerID: 1,
        containerName: "text-1",
        content: "Article title",
        isEventCapture: 0,
      },
      {
        xPosition: 0,
        yPosition: 62,
        width: 576,
        height: 178,
        borderWidth: 0,
        borderColor: undefined,
        borderRadius: 0,
        paddingLength: 0,
        containerID: 3,
        containerName: "text-2",
        content: "Body",
        isEventCapture: 1,
      },
    ]);
    expect(layout.imageObject).toEqual([
      {
        xPosition: 0,
        yPosition: 250,
        width: 288,
        height: 30,
        containerID: 10,
        containerName: "img-1",
      },
      {
        xPosition: 288,
        yPosition: 250,
        width: 288,
        height: 30,
        containerID: 11,
        containerName: "img-2",
      },
    ]);
    expect(layout.imageUpdates).toEqual([
      {
        containerID: 10,
        containerName: "img-1",
        imageData: new Uint8Array([1]),
      },
      {
        containerID: 11,
        containerName: "img-2",
        imageData: new Uint8Array([2]),
      },
    ]);
  });

  it("assigns event capture to the first eligible container only", () => {
    const viewModel: ViewModel = {
      title: "Dashboard",
      layoutMode: "two-column",
      containers: [
        {
          type: "text",
          id: "dashboard-info",
          content: "Info",
          eventCapture: 1,
        },
        {
          type: "list",
          id: "dashboard-list",
          title: "Dashboard",
          items: ["RSS-Feeds"],
          selectedIndex: 0,
          eventCapture: 1,
        },
      ],
    };

    const layout = buildLayout(viewModel);
    const text = layout.textObject?.[0];
    const list = layout.listObject?.[0];

    expect(text?.isEventCapture).toBe(1);
    expect(list?.isEventCapture).toBe(0);
  });

  it("uses a placeholder item when list is empty to satisfy sdk minimum itemCount", () => {
    const viewModel: ViewModel = {
      title: "Empty",
      containers: [
        {
          type: "list",
          id: "list-empty",
          title: "Empty",
          items: [],
          selectedIndex: 0,
          eventCapture: 1,
        },
      ],
    };

    const layout = buildLayout(viewModel);
    const list = layout.listObject?.[0];

    expect(list?.itemContainer?.itemCount).toBe(1);
    expect(list?.itemContainer?.itemName).toEqual(["No items available."]);
  });

  it("caps list entries at 20 items", () => {
    const items = Array.from({ length: 25 }, (_, index) => `Item ${index + 1}`);
    const viewModel: ViewModel = {
      title: "Capped",
      containers: [
        {
          type: "list",
          id: "list-capped",
          title: "Capped",
          items,
          selectedIndex: 0,
          eventCapture: 1,
        },
      ],
    };

    const layout = buildLayout(viewModel);
    const names = layout.listObject?.[0]?.itemContainer?.itemName ?? [];

    expect(names).toHaveLength(20);
    expect(names.at(-1)).toBe("Item 20");
  });

  it("truncates long list labels to sdk max length", () => {
    const longLabel = "A".repeat(100);
    const viewModel: ViewModel = {
      title: "Long label",
      containers: [
        {
          type: "list",
          id: "list-long",
          title: "Long label",
          items: [longLabel],
          selectedIndex: 0,
          eventCapture: 1,
        },
      ],
    };

    const layout = buildLayout(viewModel);
    const label = layout.listObject?.[0]?.itemContainer?.itemName?.[0];

    expect(label).toBeDefined();
    expect(new TextEncoder().encode(label).length).toBeLessThanOrEqual(63);
    expect(label?.endsWith("...")).toBe(true);
  });

  it("truncates multibyte list labels to the simulator byte limit", () => {
    const longLabel = `${"Ä".repeat(31)}ABCD`;
    const viewModel: ViewModel = {
      title: "Long multibyte label",
      containers: [
        {
          type: "list",
          id: "list-long-multibyte",
          title: "Long multibyte label",
          items: [longLabel],
          selectedIndex: 0,
          eventCapture: 1,
        },
      ],
    };

    const layout = buildLayout(viewModel);
    const label = layout.listObject?.[0]?.itemContainer?.itemName?.[0];

    expect(label).toBeDefined();
    expect(new TextEncoder().encode(label).length).toBeLessThanOrEqual(63);
    expect(label?.endsWith("...")).toBe(true);
  });

  it("creates image containers and sequential image update payloads", () => {
    const imageData = [0, 1, 2, 3];
    const viewModel: ViewModel = {
      title: "Image",
      containers: [
        {
          type: "image",
          id: "image-1",
          imageData,
          xPosition: 12,
          yPosition: 24,
          width: 260,
          height: 120,
        },
      ],
    };

    const layout = buildLayout(viewModel);

    expect(layout.containerTotalNum).toBe(1);
    expect(layout.imageObject?.[0]).toMatchObject({
      xPosition: 12,
      yPosition: 24,
      width: 260,
      height: 120,
      containerID: 10,
      containerName: "img-1",
    });
    expect(layout.imageUpdates).toEqual([
      {
        containerID: 10,
        containerName: "img-1",
        imageData,
      },
    ]);
  });

  it("caps image containers at the sdk maximum and clamps dimensions", () => {
    const viewModel: ViewModel = {
      title: "Images",
      containers: Array.from({ length: 5 }, (_, index) => ({
        type: "image" as const,
        id: `image-${index}`,
        imageData: [index],
        xPosition: -10,
        yPosition: 400,
        width: 500,
        height: 500,
      })),
    };

    const layout = buildLayout(viewModel);

    expect(layout.imageObject).toHaveLength(4);
    expect(layout.imageUpdates).toHaveLength(4);
    expect(layout.imageObject?.[0]).toMatchObject({
      xPosition: 0,
      yPosition: 288,
      width: 288,
      height: 144,
    });
  });
});
