declare module "hark" {
  export interface HarkSpeechEvents {
    on(event: "speaking" | "stopped_speaking" | "volume_change", handler: (...args: unknown[]) => void): void;
    stop(): void;
    setInterval?(interval: number): void;
    setThreshold?(threshold: number): void;
  }

  export interface HarkOptions {
    interval?: number;
    threshold?: number;
    play?: boolean;
    audioContext?: AudioContext;
  }

  export default function hark(stream: MediaStream | HTMLAudioElement, options?: HarkOptions): HarkSpeechEvents;
}
