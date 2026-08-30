import { describe, expect, it, vi } from "vitest";
import { SdkTodoSpeechService, type AudioCaptureBridge } from "../../../src/services/speech/TodoSpeechService";

class MockRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }> }) => void) | null = null;
  onerror: ((event: { error?: string; message?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
}

describe("SdkTodoSpeechService", () => {
  it("starts sdk audio and browser speech recognition", async () => {
    const bridge = createBridge();
    const recognition = new MockRecognition();
    const Recognition = vi.fn(() => recognition) as unknown as new () => MockRecognition;
    const service = new SdkTodoSpeechService(bridge, () => Recognition);

    const snapshots = vi.fn();
    const finalText = vi.fn();
    const session = await service.start({
      onSnapshot: snapshots,
      onFinalText: finalText,
      onError: vi.fn(),
    });

    expect(bridge.audioControl).toHaveBeenCalledWith(true);
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(bridge.onAudioChunk).toHaveBeenCalledWith(expect.any(Function));
    expect(snapshots).toHaveBeenCalledWith(expect.objectContaining({ status: "listening" }));

    await session.stop();

    expect(bridge.onAudioChunk).toHaveBeenLastCalledWith(null);
    expect(bridge.audioControl).toHaveBeenLastCalledWith(false);
  });

  it("publishes final text from recognition results", async () => {
    const bridge = createBridge();
    const recognition = new MockRecognition();
    const Recognition = vi.fn(() => recognition) as unknown as new () => MockRecognition;
    const service = new SdkTodoSpeechService(bridge, () => Recognition);
    const finalText = vi.fn();

    await service.start({
      onSnapshot: vi.fn(),
      onFinalText: finalText,
      onError: vi.fn(),
    });

    recognition.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "Brot kaufen" } }],
    });

    expect(finalText).toHaveBeenCalledWith("Brot kaufen");
  });

  it("stops sdk audio when speech recognition is unavailable", async () => {
    const bridge = createBridge();
    const service = new SdkTodoSpeechService(bridge, () => null);

    await expect(
      service.start({
        onSnapshot: vi.fn(),
        onFinalText: vi.fn(),
        onError: vi.fn(),
      })
    ).rejects.toThrow("Voice input is not available in this WebView.");

    expect(bridge.audioControl).toHaveBeenCalledWith(true);
    expect(bridge.audioControl).toHaveBeenLastCalledWith(false);
  });
});

function createBridge(): AudioCaptureBridge & {
  audioControl: ReturnType<typeof vi.fn>;
  onAudioChunk: ReturnType<typeof vi.fn>;
} {
  return {
    audioControl: vi.fn(async () => true),
    onAudioChunk: vi.fn(),
  };
}
