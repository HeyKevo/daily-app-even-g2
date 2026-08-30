import { describe, expect, it } from "vitest";
import { buildDetailViewModel } from "../../../src/ui/components/RssDetailView";

describe("buildDetailViewModel", () => {
  it("renders detail with separate title, body, and dimmable footer image containers", () => {
    const viewModel = buildDetailViewModel(
      {
        id: "item-1",
        title: "Title",
        description: "Description",
        pages: ["Page one", "Page two"],
        source: "RSS",
        pubDateText: "Today",
      },
      { pageIndex: 1, autoScrollEnabled: true }
    );

    expect(viewModel.layoutMode).toBe("text-pager");
    expect(viewModel.containers).toHaveLength(4);
    expect(viewModel.containers[0]).toMatchObject({
      type: "text",
      id: "title",
      content: "Title",
      eventCapture: 0,
    });
    expect(viewModel.containers[1]).toMatchObject({
      type: "text",
      id: "body",
      content: "Page two",
      eventCapture: 1,
    });
    expect(viewModel.containers[2]).toMatchObject({
      type: "image",
      id: "footer-left",
      xPosition: 0,
      yPosition: 250,
      width: 288,
      height: 30,
    });
    expect(viewModel.containers[3]).toMatchObject({
      type: "image",
      id: "footer-right",
      xPosition: 288,
      yPosition: 250,
      width: 288,
      height: 30,
    });
    const footerLeft = viewModel.containers[2];
    const footerRight = viewModel.containers[3];
    expect(footerLeft?.type).toBe("image");
    expect(footerRight?.type).toBe("image");
    if (footerLeft?.type !== "image" || footerRight?.type !== "image") {
      throw new Error("Expected footer image containers");
    }
    expect(typeof footerLeft.imageData).toBe("string");
    expect(typeof footerRight.imageData).toBe("string");
  });

  it("keeps a long RSS title inside its own bounded container content", () => {
    const viewModel = buildDetailViewModel(
      {
        id: "item-1",
        title: "A".repeat(220),
        description: "Description",
        pages: ["Page one"],
        source: "RSS",
      },
      { pageIndex: 0, autoScrollEnabled: false }
    );

    expect(viewModel.containers[0]).toMatchObject({
      type: "text",
      id: "title",
      eventCapture: 0,
    });
    const titleContainer = viewModel.containers[0];
    if (titleContainer.type !== "text") {
      throw new Error("Expected title text container");
    }
    expect(titleContainer.content).toHaveLength(180);
    expect(titleContainer.content).toContain("[truncated]");
    expect(viewModel.containers[1]).toMatchObject({
      type: "text",
      id: "body",
      content: "Page one",
      eventCapture: 1,
    });
  });
});
