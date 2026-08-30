import { describe, expect, it, vi } from "vitest";
import { RenderPipeline, type ViewModel } from "../../../src/ui/render/renderPipeline";
import type { EvenHubBridge } from "../../../src/bridge/evenHubBridge";
import type { Logger } from "../../../src/utils/logger";

function createBridgeStub() {
  return {
    createStartup: vi.fn().mockResolvedValue(true),
    rebuild: vi.fn().mockResolvedValue(true),
    updateText: vi.fn().mockResolvedValue(true),
    updateImage: vi.fn().mockResolvedValue(true),
  };
}

function createLoggerStub(): Logger {
  return {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  } as unknown as Logger;
}

describe("RenderPipeline", () => {
  it("pushes image raw data after startup creates image containers", async () => {
    const bridge = createBridgeStub();
    const logger = createLoggerStub();
    const pipeline = new RenderPipeline(bridge as unknown as EvenHubBridge, logger);
    const viewModel: ViewModel = {
      title: "Image",
      containers: [
        {
          type: "image",
          id: "image-1",
          imageData: [1, 2, 3],
          width: 120,
          height: 80,
        },
      ],
    };

    await pipeline.render(viewModel);

    expect(bridge.createStartup).toHaveBeenCalledWith({
      containerTotalNum: 1,
      imageObject: [
        {
          xPosition: 0,
          yPosition: 0,
          width: 120,
          height: 80,
          containerID: 10,
          containerName: "img-1",
        },
      ],
    });
    expect(bridge.updateImage).toHaveBeenCalledWith({
      containerID: 10,
      containerName: "img-1",
      imageData: [1, 2, 3],
    });
  });

  it("pushes image updates sequentially after rebuild", async () => {
    const bridge = createBridgeStub();
    const logger = createLoggerStub();
    const pipeline = new RenderPipeline(bridge as unknown as EvenHubBridge, logger);
    const textViewModel: ViewModel = {
      title: "Text",
      containers: [{ type: "text", id: "text", content: "hello", eventCapture: 1 }],
    };
    const imageViewModel: ViewModel = {
      title: "Images",
      containers: [
        { type: "image", id: "image-1", imageData: [1] },
        { type: "image", id: "image-2", imageData: [2] },
      ],
    };

    await pipeline.render(textViewModel);
    await pipeline.render(imageViewModel);

    expect(bridge.rebuild).toHaveBeenCalledTimes(1);
    expect(bridge.updateImage).toHaveBeenNthCalledWith(1, {
      containerID: 10,
      containerName: "img-1",
      imageData: [1],
    });
    expect(bridge.updateImage).toHaveBeenNthCalledWith(2, {
      containerID: 11,
      containerName: "img-2",
      imageData: [2],
    });
  });

  it("updates all matching text-only containers without full rebuild", async () => {
    const bridge = createBridgeStub();
    const logger = createLoggerStub();
    const pipeline = new RenderPipeline(bridge as unknown as EvenHubBridge, logger);
    const first: ViewModel = {
      title: "Detail",
      layoutMode: "text-pager",
      containers: [
        { type: "text", id: "body", content: "Page 1", eventCapture: 1 },
        { type: "text", id: "pager", content: "1/2", eventCapture: 0 },
      ],
    };
    const second: ViewModel = {
      title: "Detail",
      layoutMode: "text-pager",
      containers: [
        { type: "text", id: "body", content: "Page 2", eventCapture: 1 },
        { type: "text", id: "pager", content: "2/2", eventCapture: 0 },
      ],
    };

    await pipeline.render(first);
    await pipeline.render(second);

    expect(bridge.rebuild).not.toHaveBeenCalled();
    expect(bridge.updateText).toHaveBeenNthCalledWith(1, {
      containerID: 1,
      containerName: "text-1",
      contentOffset: 0,
      contentLength: 6,
      content: "Page 2",
    });
    expect(bridge.updateText).toHaveBeenNthCalledWith(2, {
      containerID: 3,
      containerName: "text-2",
      contentOffset: 0,
      contentLength: 3,
      content: "2/2",
    });
  });

  it("pushes image updates after matching text-container delta updates", async () => {
    const bridge = createBridgeStub();
    const logger = createLoggerStub();
    const pipeline = new RenderPipeline(bridge as unknown as EvenHubBridge, logger);
    const first: ViewModel = {
      title: "Detail",
      layoutMode: "text-pager",
      containers: [
        { type: "text", id: "title", content: "Title 1", eventCapture: 0 },
        { type: "text", id: "body", content: "Page 1", eventCapture: 1 },
        {
          type: "image",
          id: "footer-left",
          imageData: [1],
          xPosition: 0,
          yPosition: 250,
          width: 288,
          height: 30,
        },
      ],
    };
    const second: ViewModel = {
      ...first,
      containers: [
        { type: "text", id: "title", content: "Title 2", eventCapture: 0 },
        { type: "text", id: "body", content: "Page 2", eventCapture: 1 },
        {
          type: "image",
          id: "footer-left",
          imageData: [2],
          xPosition: 0,
          yPosition: 250,
          width: 288,
          height: 30,
        },
      ],
    };

    await pipeline.render(first);
    await pipeline.render(second);

    expect(bridge.rebuild).not.toHaveBeenCalled();
    expect(bridge.updateText).toHaveBeenCalledTimes(2);
    expect(bridge.updateImage).toHaveBeenNthCalledWith(1, {
      containerID: 10,
      containerName: "img-1",
      imageData: [1],
    });
    expect(bridge.updateImage).toHaveBeenNthCalledWith(2, {
      containerID: 10,
      containerName: "img-1",
      imageData: [2],
    });
  });

  it("updates dashboard info text without rebuilding the list layout", async () => {
    const bridge = createBridgeStub();
    const logger = createLoggerStub();
    const pipeline = new RenderPipeline(bridge as unknown as EvenHubBridge, logger);
    const nextDashboardInfo = "Shopping List\n\nShopping-Beschreibung";
    const first: ViewModel = {
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
          content: "RSS-Feeds\n\nRSS-Beschreibung",
          eventCapture: 0,
        },
      ],
    };
    const second: ViewModel = {
      ...first,
      containers: [
        first.containers[0]!,
        {
          type: "text",
          id: "dashboard-info",
          content: nextDashboardInfo,
          eventCapture: 0,
        },
      ],
    };

    await pipeline.render(first);
    await pipeline.render(second);

    expect(bridge.rebuild).not.toHaveBeenCalled();
    expect(bridge.updateText).toHaveBeenCalledTimes(1);
    expect(bridge.updateText).toHaveBeenCalledWith({
      containerID: 1,
      containerName: "text-1",
      contentOffset: 0,
      contentLength: nextDashboardInfo.length,
      content: nextDashboardInfo,
    });
  });

  it("rebuilds dashboard text menu when selected row and info panel change", async () => {
    const bridge = createBridgeStub();
    const logger = createLoggerStub();
    const pipeline = new RenderPipeline(bridge as unknown as EvenHubBridge, logger);
    const first: ViewModel = {
      title: "Dashboard",
      layoutMode: "dashboard-menu",
      containers: [
        { type: "text", id: "dashboard-event-layer", content: "", eventCapture: 1 },
        { type: "text", id: "dashboard-menu-item-0-selected", content: "RSS-Feeds", eventCapture: 0 },
        { type: "text", id: "dashboard-menu-item-1", content: "Shopping List", eventCapture: 0 },
        { type: "text", id: "dashboard-info", content: "RSS-Feeds\n\nRSS-Beschreibung", eventCapture: 0 },
      ],
    };
    const second: ViewModel = {
      title: "Dashboard",
      layoutMode: "dashboard-menu",
      containers: [
        { type: "text", id: "dashboard-event-layer", content: "", eventCapture: 1 },
        { type: "text", id: "dashboard-menu-item-0", content: "RSS-Feeds", eventCapture: 0 },
        { type: "text", id: "dashboard-menu-item-1-selected", content: "Shopping List", eventCapture: 0 },
        {
          type: "text",
          id: "dashboard-info",
          content: "Shopping List\n\nShopping-Beschreibung",
          eventCapture: 0,
        },
      ],
    };

    await pipeline.render(first);
    await pipeline.render(second);

    expect(bridge.updateText).not.toHaveBeenCalled();
    expect(bridge.rebuild).toHaveBeenCalledTimes(1);
    expect(bridge.rebuild).toHaveBeenCalledWith({
      containerTotalNum: 4,
      textObject: [
        expect.objectContaining({
          containerID: 1,
          containerName: "text-1",
          content: "",
          isEventCapture: 1,
        }),
        expect.objectContaining({
          containerID: 3,
          containerName: "text-2",
          content: "RSS-Feeds",
          isEventCapture: 0,
        }),
        expect.objectContaining({
          containerID: 4,
          containerName: "text-3",
          content: "Shopping List",
          isEventCapture: 0,
          borderWidth: 1,
        }),
        expect.objectContaining({
          containerID: 5,
          containerName: "text-4",
          content: "Shopping List\n\nShopping-Beschreibung",
          isEventCapture: 0,
        }),
      ],
    });
  });

  it("falls back to rebuild when mixed-layout text update fails", async () => {
    const bridge = createBridgeStub();
    bridge.updateText.mockResolvedValue(false);
    const logger = createLoggerStub();
    const pipeline = new RenderPipeline(bridge as unknown as EvenHubBridge, logger);
    const first: ViewModel = {
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
          content: "RSS-Feeds\n\nRSS-Beschreibung",
          eventCapture: 0,
        },
      ],
    };
    const second: ViewModel = {
      ...first,
      containers: [
        first.containers[0]!,
        {
          type: "text",
          id: "dashboard-info",
          content: "Shopping List\n\nShopping-Beschreibung",
          eventCapture: 0,
        },
      ],
    };

    await pipeline.render(first);
    await pipeline.render(second);

    expect(bridge.updateText).toHaveBeenCalledTimes(1);
    expect(bridge.rebuild).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("textContainerUpgrade failed, fallback to rebuild");
  });

  it("rebuilds when the list structure changes in a mixed layout", async () => {
    const bridge = createBridgeStub();
    const logger = createLoggerStub();
    const pipeline = new RenderPipeline(bridge as unknown as EvenHubBridge, logger);
    const first: ViewModel = {
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
          content: "RSS-Feeds\n\nRSS-Beschreibung",
          eventCapture: 0,
        },
      ],
    };
    const second: ViewModel = {
      title: "Dashboard",
      layoutMode: "two-column",
      containers: [
        {
          type: "list",
          id: "dashboard-list",
          title: "Dashboard",
          items: ["RSS-Feeds", "Shopping List", "Neu"],
          selectedIndex: 0,
          eventCapture: 1,
        },
        {
          type: "text",
          id: "dashboard-info",
          content: "RSS-Feeds\n\nRSS-Beschreibung",
          eventCapture: 0,
        },
      ],
    };

    await pipeline.render(first);
    await pipeline.render(second);

    expect(bridge.updateText).not.toHaveBeenCalled();
    expect(bridge.rebuild).toHaveBeenCalledTimes(1);
  });
});
