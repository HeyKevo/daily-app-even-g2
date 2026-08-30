export type TodoSpeechStatus = "starting" | "listening" | "hearing" | "recognized" | "error";

export interface TodoSpeechSnapshot {
  status: TodoSpeechStatus;
  transcript: string;
  message: string;
}

export interface TodoSpeechSession {
  stop(): Promise<void>;
}

export interface TodoSpeechService {
  start(options: {
    onSnapshot(snapshot: TodoSpeechSnapshot): void;
    onFinalText(text: string): void;
    onError(error: Error): void;
  }): Promise<TodoSpeechSession>;
}

export interface AudioCaptureBridge {
  audioControl(isOpen: boolean): Promise<boolean>;
  onAudioChunk(handler: ((chunk: Uint8Array) => void) | null): void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0?: { transcript?: string };
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
  message?: string;
}

export class SdkTodoSpeechService implements TodoSpeechService {
  constructor(
    private readonly bridge: AudioCaptureBridge,
    private readonly speechRecognitionFactory = resolveSpeechRecognitionFactory
  ) {}

  async start(options: {
    onSnapshot(snapshot: TodoSpeechSnapshot): void;
    onFinalText(text: string): void;
    onError(error: Error): void;
  }): Promise<TodoSpeechSession> {
    options.onSnapshot({
      status: "starting",
      transcript: "",
      message: "Starting microphone...",
    });

    const microphoneStarted = await this.bridge.audioControl(true);
    if (!microphoneStarted) {
      throw new Error("Unable to start the G2 microphone.");
    }

    const Recognition = this.speechRecognitionFactory();
    if (!Recognition) {
      await this.bridge.audioControl(false);
      throw new Error("Voice input is not available in this WebView.");
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let stopped = false;
    let finalText = "";
    let interimText = "";

    const publishSnapshot = (status: TodoSpeechStatus, message: string) => {
      options.onSnapshot({
        status,
        transcript: `${finalText} ${interimText}`.trim(),
        message,
      });
    };

    this.bridge.onAudioChunk((chunk) => {
      if (chunk.length > 0) {
        publishSnapshot("hearing", "Receiving audio...");
      }
    });

    recognition.onresult = (event) => {
      interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() ?? "";
        if (!transcript) {
          continue;
        }

        if (result.isFinal) {
          finalText = `${finalText} ${transcript}`.trim();
        } else {
          interimText = `${interimText} ${transcript}`.trim();
        }
      }

      const combined = `${finalText} ${interimText}`.trim();
      if (combined) {
        publishSnapshot(finalText ? "recognized" : "listening", "Todo recognized. Click to save.");
      }

      if (finalText) {
        options.onFinalText(finalText);
      }
    };

    recognition.onerror = (event) => {
      const message = event.message || event.error || "Voice input failed.";
      options.onError(new Error(message));
    };
    recognition.onend = () => {
      if (!stopped) {
        publishSnapshot("listening", "Waiting for speech...");
      }
    };

    recognition.start();
    publishSnapshot("listening", "Say the new todo.");

    return {
      stop: async () => {
        if (stopped) {
          return;
        }
        stopped = true;
        this.bridge.onAudioChunk(null);
        recognition.stop();
        await this.bridge.audioControl(false);
      },
    };
  }
}

function resolveSpeechRecognitionFactory(): SpeechRecognitionConstructor | null {
  const host = globalThis as typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}
