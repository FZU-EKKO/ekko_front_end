import { CSSProperties, FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AuthResponse,
  Channel,
  ChannelAnalysisResponse,
  Domain,
  DomainMemberInfo,
  UserInfo,
  UserSettingsResponse,
  VoiceConnectionState,
  VoiceJoinResponse,
  VoiceMessage,
  VoiceMessagePage,
  VoiceParticipant,
} from "./types";
import { createPortal } from "react-dom";
import type { ChangeEvent } from "react";
import { RoomEvent, Track, type LocalAudioTrack, type RemoteAudioTrack, type RemoteParticipant, type Room } from "livekit-client";
import hark from "hark";
import {
  attachRemoteAudioTrack,
  buildMicrophoneCaptureOptions,
  createMicrophoneTrack,
  createPublishedMicrophoneTrack,
  createVoiceRoom,
  detachRemoteAudioElements,
  disconnectVoiceRoom,
  syncLocalMicrophoneMute,
  unpublishLocalMicrophoneTrack,
} from "./livekit";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";
const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE).origin;
  } catch {
    return "";
  }
})();
const ENABLE_VOICE_JOIN_MOCK = (import.meta.env.VITE_ENABLE_VOICE_JOIN_MOCK ?? "false") === "true";
const TEMP_VOICE_DEBUG_UI = false;
const TOKEN_KEY = "ekko.desktop.token";
const SETTINGS_KEY = "ekko.desktop.settings";
const ASSET_BASE = import.meta.env.BASE_URL;
const APP_LOGO_URL = `${ASSET_BASE}assets/EKKO.png`;
const WORKSPACE_LOGO_URL = `${ASSET_BASE}assets/EKKO.png`;
const WINDOW_MIN_URL = `${ASSET_BASE}assets/min.svg`;
const WINDOW_MAX_URL = `${ASSET_BASE}assets/max.svg`;
const WINDOW_CLOSE_URL = `${ASSET_BASE}assets/close.svg`;
const PASSWORD_EYE_URL = `${ASSET_BASE}assets/eye.svg`;
const PASSWORD_EYE_CLOSED_URL = `${ASSET_BASE}assets/eye-closed.svg`;
const SIDEBAR_SET_URL = `${ASSET_BASE}assets/gear-six-fill.svg`;
const SIDEBAR_ADD_URL = `${ASSET_BASE}assets/plus-circle-fill.svg`;
const SIDEBAR_OUT_URL = `${ASSET_BASE}assets/power-fill.svg`;
const DOMAIN_DOTS_URL = `${ASSET_BASE}assets/dots.svg`;
const DOMAIN_COPY_URL = `${ASSET_BASE}assets/copy.svg`;
const INFO_LIGHT_URL = `${ASSET_BASE}assets/info-light.svg`;
const USER_CIRCLE_GEAR_LIGHT_URL = `${ASSET_BASE}assets/user-circle-gear-light.svg`;
const ERASER_LIGHT_URL = `${ASSET_BASE}assets/eraser-light.svg`;
const MICROPHONE_URL = `${ASSET_BASE}assets/microphone.svg`;
const MICROPHONE_SLASH_URL = `${ASSET_BASE}assets/microphone-slash.svg`;
const USER_GLYPH_URL = `${ASSET_BASE}assets/user.svg`;
const GEAR_LIGHT_URL = `${ASSET_BASE}assets/gear-six-light.svg`;
const CARET_LEFT_LIGHT_URL = `${ASSET_BASE}assets/caret-left-light.svg`;
const CARET_DOWN_LIGHT_URL = `${ASSET_BASE}assets/caret-down-light.svg`;
const HEADPHONES_URL = `${ASSET_BASE}assets/headphones.svg`;
const SIGN_OUT_URL = `${ASSET_BASE}assets/sign-out.svg`;
const SPEAKER_HIGH_URL = `${ASSET_BASE}assets/speaker-high.svg`;
const SPEAKER_SLASH_URL = `${ASSET_BASE}assets/speaker-slash.svg`;
const AI_SUMMARY_URL = `${ASSET_BASE}assets/ai.svg`;
const PLANE_URL = `${ASSET_BASE}assets/plane.svg`;
const PLAY_LIGHT_URL = `${ASSET_BASE}assets/play-light.svg`;
const DOWNLOAD_URL = `${ASSET_BASE}assets/download.svg`;
const PLUS_CIRCLE_LIGHT_URL = `${ASSET_BASE}assets/plus-circle-light.svg`;
const USERS_LIGHT_URL = `${ASSET_BASE}assets/users-light.svg`;
const MAGNIFYING_GLASS_LIGHT_URL = `${ASSET_BASE}assets/magnifying-glass-light.svg`;

const VIEWPORTS = {
  login: { width: 420, height: 420 },
  register: { width: 500, height: 640 },
  reset: { width: 500, height: 560 },
  workspace: { width: 850, height: 540 },
  settings: { width: 850, height: 540 },
} as const;

type AuthMode = "login" | "register" | "reset";
type DesktopView = keyof typeof VIEWPORTS;
type SettingsSection = "account" | "audio" | "system";
type DomainSettingsSection = "info" | "members" | "danger";
type DomainRole = "owner" | "admin" | "member";
type AudioDeviceOption = {
  id: string;
  label: string;
};
type TempMicPermissionState = "idle" | "granted" | "denied" | "unknown";
type TempMicProbeState = "idle" | "requesting" | "ready" | "failed";
type DomainMemberRecord = {
  id: string;
  userId: string | null;
  globalName: string;
  domainNickname: string;
  role: DomainRole;
  avatar: string | null;
};
type DomainMenuActionKey = "domain-settings" | "create-channel" | "domain-nickname" | "leave-domain";
type DomainMenuAction = {
  key: DomainMenuActionKey;
  label: string;
  danger?: boolean;
};
type CreateChannelFormState = {
  name: string;
  maxCapacity: string;
};
type DomainInfoDraftState = {
  name: string;
  avatar: string | null;
};
type AnalysisRangeFormState = {
  startTime: string;
  endTime: string;
};
type ChannelContextMenuState = {
  channelId: number;
  x: number;
  y: number;
} | null;

type SettingsState = {
  noiseSuppression: boolean;
  autoJoinLastChannel: boolean;
  cleanupDays: number;
  micLevel: number;
  monitorMix: number;
  inputDevice: string;
  outputDevice: string;
  downloadPath: string;
  autoLaunch: boolean;
  minimizeOnClose: boolean;
};

type LoginFormState = {
  email: string;
  pwd: string;
};

type RegisterFormState = {
  nick_name: string;
  email: string;
  verificationCode: string;
  pwd: string;
  confirmPwd: string;
};

type ResetPasswordFormState = {
  email: string;
  verificationCode: string;
  pwd: string;
  confirmPwd: string;
};

type ChangeEmailFormState = {
  currentEmail: string;
  currentVerificationCode: string;
  nextEmail: string;
  nextVerificationCode: string;
};

type ChangeNameFormState = {
  nickName: string;
};

type ChangeAvatarFormState = {
  source: string | null;
  avatar: string | null;
  zoom: number;
  offsetX: number;
  offsetY: number;
  fileName: string;
  imageWidth: number;
  imageHeight: number;
};

type IconMaskStyle = CSSProperties;
type RawVoiceJoinResponse = VoiceJoinResponse & {
  server_url?: string;
  livekit_url?: string;
  room_name?: string;
  participant_identity?: string;
  participant_name?: string;
};

function iconMask(url: string): IconMaskStyle {
  return {
    WebkitMaskImage: `url(${url})`,
    maskImage: `url(${url})`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
  };
}

function formatCount(current: number, max: number) {
  return `${String(current).padStart(2, "0")}/${String(max).padStart(2, "0")}`;
}

function getVisibleChannelCount(channel: Channel, joinedChannelId: number | null, joinedVoiceCount: number | null) {
  if (channel.id === joinedChannelId && joinedVoiceCount !== null) {
    return joinedVoiceCount;
  }
  return channel.current_voice_count;
}

function formatDomainId(domainId: string) {
  return domainId.length <= 8 ? domainId.padStart(8, "0") : domainId;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function supportsSetSinkId(element: HTMLMediaElement): element is HTMLMediaElement & { setSinkId: (deviceId: string) => Promise<void> } {
  return typeof (element as HTMLMediaElement & { setSinkId?: unknown }).setSinkId === "function";
}

let channelJoinSoundUrl: string | null = null;

function createChannelJoinSoundUrl() {
  if (channelJoinSoundUrl) {
    return channelJoinSoundUrl;
  }

  const sampleRate = 44100;
  const durationSeconds = 0.58;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + sampleCount * bytesPerSample);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + sampleCount * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(36, "data");
  view.setUint32(40, sampleCount * bytesPerSample, true);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const time = sampleIndex / sampleRate;
    const firstTone = time < 0.22;
    const secondTone = time >= 0.29 && time < 0.52;
    let sample = 0;

    if (firstTone || secondTone) {
      const toneStart = firstTone ? 0 : 0.29;
      const toneTime = time - toneStart;
      const frequency = firstTone ? 392 : 523.25;
      const envelope = Math.min(1, toneTime / 0.035) * Math.max(0, 1 - toneTime / 0.28);
      sample = Math.sin(2 * Math.PI * frequency * toneTime) * envelope * 0.28;
      sample += Math.sin(2 * Math.PI * frequency * 1.5 * toneTime) * envelope * 0.025;
    }

    view.setInt16(44 + sampleIndex * bytesPerSample, Math.round(sample * 32767), true);
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  channelJoinSoundUrl = `data:audio/wav;base64,${btoa(binary)}`;
  return channelJoinSoundUrl;
}

async function playChannelJoinSound(settings: Pick<SettingsState, "outputDevice">) {
  const player = new Audio(createChannelJoinSoundUrl());
  player.volume = 0.42;

  if (supportsSetSinkId(player)) {
    try {
      await player.setSinkId(settings.outputDevice === "default" ? "" : settings.outputDevice);
    } catch {
      // Use the runtime default output if the selected device cannot be routed.
    }
  }

  try {
    await player.play();
  } catch {
    // Joining a channel should not fail just because the runtime blocks notification playback.
  }
}

function normalizeVoiceJoinResponse(payload: RawVoiceJoinResponse): VoiceJoinResponse {
  return {
    serverUrl: payload.serverUrl ?? payload.server_url ?? payload.livekit_url ?? "",
    token: payload.token ?? "",
    roomName: payload.roomName ?? payload.room_name ?? "",
    participantIdentity: payload.participantIdentity ?? payload.participant_identity ?? "",
    participantName: payload.participantName ?? payload.participant_name ?? "",
  };
}

function resolveMediaUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (/^(https?:|data:|blob:)/i.test(value)) {
    return value;
  }

  if (value.startsWith("/") && API_ORIGIN) {
    return `${API_ORIGIN}${value}`;
  }

  return value;
}

function formatVoiceMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getDefaultAnalysisStartTime(endDate: Date) {
  return new Date(endDate.getTime() - 3 * 60 * 1000);
}

function formatAnalysisRangeLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getVoiceMessageFileExtension(item: VoiceMessage) {
  const mediaPath = item.audio_path.split("?")[0] ?? "";
  const mediaExtension = mediaPath.match(/\.([a-z0-9]{2,8})$/i)?.[1];
  if (mediaExtension) {
    return mediaExtension.toLowerCase();
  }

  if (item.mime_type?.includes("mpeg")) {
    return "mp3";
  }
  if (item.mime_type?.includes("ogg")) {
    return "ogg";
  }
  if (item.mime_type?.includes("webm")) {
    return "webm";
  }
  return "wav";
}

function getVoiceMessageDownloadFileName(item: VoiceMessage) {
  const createdAt = new Date(item.created_at);
  const timestamp = Number.isNaN(createdAt.getTime())
    ? String(item.id)
    : createdAt.toISOString().replace(/[:.]/g, "-");
  return `ekko-voice-${item.channel_id}-${timestamp}-${item.id}.${getVoiceMessageFileExtension(item)}`;
}

function encodePcm16Wav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    const pcmValue = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, Math.round(pcmValue), true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function resampleFloat32ToSampleRate(samples: Float32Array, sourceSampleRate: number, targetSampleRate: number) {
  if (!samples.length || sourceSampleRate === targetSampleRate) {
    return samples;
  }
  const ratio = sourceSampleRate / targetSampleRate;
  const targetLength = Math.max(1, Math.round(samples.length / ratio));
  const result = new Float32Array(targetLength);
  for (let index = 0; index < targetLength; index += 1) {
    const sourcePosition = index * ratio;
    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const mix = sourcePosition - leftIndex;
    result[index] = samples[leftIndex] * (1 - mix) + samples[rightIndex] * mix;
  }
  return result;
}

function computeRms(samples: Float32Array) {
  if (!samples.length) {
    return 0;
  }
  let energy = 0;
  for (let index = 0; index < samples.length; index += 1) {
    energy += samples[index] * samples[index];
  }
  return Math.sqrt(energy / samples.length);
}

function buildWaveform(samples: Float32Array, bucketCount = 48) {
  if (!samples.length) {
    return [];
  }

  const bucketSize = Math.max(1, Math.floor(samples.length / bucketCount));
  const waveform: number[] = [];

  for (let start = 0; start < samples.length && waveform.length < bucketCount; start += bucketSize) {
    let peak = 0;
    const end = Math.min(samples.length, start + bucketSize);
    for (let index = start; index < end; index += 1) {
      peak = Math.max(peak, Math.abs(samples[index]));
    }
    waveform.push(Math.max(0, Math.min(100, Math.round(peak * 100))));
  }

  return waveform;
}

function areVoiceMessagesEquivalent(left: VoiceMessage[], right: VoiceMessage[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const prev = left[index];
    const next = right[index];
    if (
      prev.id !== next.id ||
      prev.updated_at !== next.updated_at ||
      prev.audio_path !== next.audio_path ||
      prev.audio_duration_ms !== next.audio_duration_ms ||
      prev.transcript_text !== next.transcript_text ||
      prev.is_excited !== next.is_excited
    ) {
      return false;
    }
  }

  return true;
}

function mergeVoiceMessages(current: VoiceMessage[], incoming: VoiceMessage[]) {
  if (!current.length) {
    return incoming;
  }
  if (!incoming.length) {
    return current;
  }

  const currentById = new Map(current.map((item) => [item.id, item]));
  let changed = false;

  for (const nextItem of incoming) {
    const prevItem = currentById.get(nextItem.id);
    if (!prevItem) {
      currentById.set(nextItem.id, nextItem);
      changed = true;
      continue;
    }
    if (
      prevItem.updated_at !== nextItem.updated_at ||
      prevItem.audio_path !== nextItem.audio_path ||
      prevItem.audio_duration_ms !== nextItem.audio_duration_ms ||
      prevItem.transcript_text !== nextItem.transcript_text ||
      prevItem.is_excited !== nextItem.is_excited
    ) {
      currentById.set(nextItem.id, nextItem);
      changed = true;
    }
  }

  if (!changed && current.length === incoming.length) {
    return current;
  }

  return [...currentById.values()].sort(
    (left, right) =>
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime() ||
      left.id - right.id,
  );
}

function isViewportNearBottom(viewport: HTMLDivElement, threshold = 32) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= threshold;
}

function countVoiceMessageDiffs(current: VoiceMessage[], incoming: VoiceMessage[]) {
  const currentById = new Map(current.map((item) => [item.id, item]));
  let diffCount = 0;

  for (const nextItem of incoming) {
    const prevItem = currentById.get(nextItem.id);
    if (!prevItem || prevItem.updated_at !== nextItem.updated_at || prevItem.transcript_text !== nextItem.transcript_text) {
      diffCount += 1;
    }
  }

  return diffCount;
}

function areChannelsEquivalent(left: Channel[], right: Channel[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const prev = left[index];
    const next = right[index];
    if (
      prev.id !== next.id ||
      prev.domain_id !== next.domain_id ||
      prev.channel_name !== next.channel_name ||
      prev.description !== next.description ||
      prev.create_id !== next.create_id ||
      prev.max_capacity !== next.max_capacity ||
      prev.current_voice_count !== next.current_voice_count ||
      prev.channel_type !== next.channel_type ||
      prev.sort_order !== next.sort_order ||
      prev.updated_at !== next.updated_at
    ) {
      return false;
    }
  }

  return true;
}

const defaultSettings: SettingsState = {
  noiseSuppression: true,
  autoJoinLastChannel: true,
  cleanupDays: 30,
  micLevel: 76,
  monitorMix: 24,
  inputDevice: "default",
  outputDevice: "default",
  downloadPath: "",
  autoLaunch: true,
  minimizeOnClose: true,
};

function loadStoredSettings(): SettingsState {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return defaultSettings;
    }

    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    return {
      ...defaultSettings,
      ...parsed,
      cleanupDays: Math.max(1, Number(parsed.cleanupDays ?? defaultSettings.cleanupDays) || defaultSettings.cleanupDays),
      micLevel: Math.max(0, Math.min(100, Number(parsed.micLevel ?? defaultSettings.micLevel) || defaultSettings.micLevel)),
      monitorMix: Math.max(0, Math.min(100, Number(parsed.monitorMix ?? defaultSettings.monitorMix) || defaultSettings.monitorMix)),
      downloadPath: typeof parsed.downloadPath === "string" ? parsed.downloadPath : defaultSettings.downloadPath,
    };
  } catch {
    return defaultSettings;
  }
}

function normalizeSettings(value: unknown): SettingsState {
  const parsed = typeof value === "object" && value !== null ? (value as Partial<SettingsState>) : {};
  return {
    ...defaultSettings,
    ...parsed,
    noiseSuppression: parsed.noiseSuppression ?? defaultSettings.noiseSuppression,
    autoJoinLastChannel: parsed.autoJoinLastChannel ?? defaultSettings.autoJoinLastChannel,
    cleanupDays: Math.max(1, Number(parsed.cleanupDays ?? defaultSettings.cleanupDays) || defaultSettings.cleanupDays),
    micLevel: Math.max(0, Math.min(100, Number(parsed.micLevel ?? defaultSettings.micLevel) || defaultSettings.micLevel)),
    monitorMix: Math.max(0, Math.min(100, Number(parsed.monitorMix ?? defaultSettings.monitorMix) || defaultSettings.monitorMix)),
    inputDevice: typeof parsed.inputDevice === "string" ? parsed.inputDevice : defaultSettings.inputDevice,
    outputDevice: typeof parsed.outputDevice === "string" ? parsed.outputDevice : defaultSettings.outputDevice,
    downloadPath: typeof parsed.downloadPath === "string" ? parsed.downloadPath : defaultSettings.downloadPath,
    autoLaunch: parsed.autoLaunch ?? defaultSettings.autoLaunch,
    minimizeOnClose: parsed.minimizeOnClose ?? defaultSettings.minimizeOnClose,
  };
}

type PasswordFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
};

function PasswordField({ label, placeholder, value, onChange }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const glyphUrl = visible ? PASSWORD_EYE_URL : PASSWORD_EYE_CLOSED_URL;

  return (
    <label>
      <span>{label}</span>
      <div className="password-input-shell">
        <input
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className="password-visibility-button"
          type="button"
          aria-label={visible ? "\u9690\u85cf\u5bc6\u7801" : "\u663e\u793a\u5bc6\u7801"}
          title={visible ? "\u9690\u85cf\u5bc6\u7801" : "\u663e\u793a\u5bc6\u7801"}
          onClick={() => setVisible((current) => !current)}
        >
          <span className="password-visibility-glyph" style={iconMask(glyphUrl)} aria-hidden="true" />
        </button>
      </div>
    </label>
  );
}

type HoverVolumeControlProps = {
  buttonClassName?: string;
  buttonTitle: string;
  glyphUrl: string;
  value: number;
  onChange: (value: number) => void;
  danger?: boolean;
  active?: boolean;
  onClick?: () => void;
};

function HoverVolumeControl({
  buttonClassName = "",
  buttonTitle,
  glyphUrl,
  value,
  onChange,
  danger = false,
  active = false,
  onClick,
}: HoverVolumeControlProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const updatePanelPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    setPanelStyle({
      position: "fixed",
      left: rect.left + rect.width / 2,
      top: rect.bottom + 10,
      transform: "translateX(-50%)",
    });
  }, []);

  const openPanel = useCallback(() => {
    clearCloseTimer();
    updatePanelPosition();
    setOpen(true);
  }, [clearCloseTimer, updatePanelPosition]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [clearCloseTimer]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleViewportChange = () => updatePanelPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return (
    <div
      ref={anchorRef}
      className={`icon-hover-control ${danger ? "danger" : ""}`}
      onMouseEnter={openPanel}
      onMouseLeave={scheduleClose}
    >
      <button
        className={`channel-icon-button ${buttonClassName} ${active ? "is-active" : ""}`.trim()}
        type="button"
        title={buttonTitle}
        onClick={onClick}
        onFocus={openPanel}
        onBlur={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && panelRef.current?.contains(nextTarget)) {
            return;
          }
          scheduleClose();
        }}
      >
        <span className="channel-icon-glyph" style={iconMask(glyphUrl)} aria-hidden="true" />
      </button>
      {open && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              className="icon-hover-panel icon-hover-panel-portal volume-hover-panel"
              style={panelStyle}
              onMouseEnter={openPanel}
              onMouseLeave={scheduleClose}
              onFocus={openPanel}
              onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (nextTarget instanceof Node && anchorRef.current?.contains(nextTarget)) {
                  return;
                }
                if (nextTarget instanceof Node && panelRef.current?.contains(nextTarget)) {
                  return;
                }
                scheduleClose();
              }}
            >
              <input
                type="range"
                min="0"
                max="100"
                value={value}
                style={{ "--range-progress": `${value}%` } as CSSProperties}
                onChange={(event) => onChange(Number(event.target.value))}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function HoverTextControl({
  buttonTitle,
  glyphUrl,
  text,
  danger = false,
  onClick,
}: {
  buttonTitle: string;
  glyphUrl: string;
  text: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const updatePanelPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    setPanelStyle({
      position: "fixed",
      left: rect.left + rect.width / 2,
      top: rect.bottom + 10,
      transform: "translateX(-50%)",
    });
  }, []);

  const openPanel = useCallback(() => {
    clearCloseTimer();
    updatePanelPosition();
    setOpen(true);
  }, [clearCloseTimer, updatePanelPosition]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [clearCloseTimer]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleViewportChange = () => updatePanelPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return (
    <div
      ref={anchorRef}
      className={`icon-hover-control ${danger ? "danger" : ""}`}
      onMouseEnter={openPanel}
      onMouseLeave={scheduleClose}
    >
      <button
        className={`channel-icon-button ${danger ? "danger" : ""}`.trim()}
        type="button"
        title={buttonTitle}
        onClick={onClick}
        onFocus={openPanel}
        onBlur={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && panelRef.current?.contains(nextTarget)) {
            return;
          }
          scheduleClose();
        }}
      >
        <span className="channel-icon-glyph" style={iconMask(glyphUrl)} aria-hidden="true" />
      </button>
      {open && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              className="icon-hover-panel icon-hover-panel-portal text-hover-panel"
              style={panelStyle}
              onMouseEnter={openPanel}
              onMouseLeave={scheduleClose}
              onFocus={openPanel}
              onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (nextTarget instanceof Node && anchorRef.current?.contains(nextTarget)) {
                  return;
                }
                if (nextTarget instanceof Node && panelRef.current?.contains(nextTarget)) {
                  return;
                }
                scheduleClose();
              }}
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}


type ScrollAreaProps = {
  className?: string;
  viewportClassName?: string;
  viewportRef?: { current: HTMLDivElement | null };
  children: ReactNode;
};

function ScrollArea({ className = "", viewportClassName = "", viewportRef: externalViewportRef, children }: ScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startY: number; startScrollTop: number } | null>(null);
  const moveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const upHandlerRef = useRef<(() => void) | null>(null);
  const [metrics, setMetrics] = useState({ visible: false, thumbHeight: 0, thumbTop: 0 });

  const updateMetrics = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const { clientHeight, scrollHeight, scrollTop } = viewport;
    const canScroll = scrollHeight > clientHeight + 1;

    if (!canScroll) {
      setMetrics((current) => (current.visible ? { visible: false, thumbHeight: 0, thumbTop: 0 } : current));
      return;
    }

    const thumbHeight = Math.max((clientHeight / scrollHeight) * clientHeight, 24);
    const maxThumbTop = Math.max(clientHeight - thumbHeight, 0);
    const thumbTop = maxThumbTop > 0 ? (scrollTop / (scrollHeight - clientHeight)) * maxThumbTop : 0;

    setMetrics((current) => {
      if (current.visible && Math.abs(current.thumbHeight - thumbHeight) < 0.5 && Math.abs(current.thumbTop - thumbTop) < 0.5) {
        return current;
      }

      return { visible: true, thumbHeight, thumbTop };
    });
  }, []);

  useEffect(() => {
    updateMetrics();
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) {
      return;
    }

    const handleScroll = () => updateMetrics();
    const handleResize = () => updateMetrics();
    const resizeObserver = new ResizeObserver(handleResize);

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    resizeObserver.observe(viewport);
    resizeObserver.observe(content);
    window.addEventListener("resize", handleResize);

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      if (moveHandlerRef.current) {
        document.removeEventListener("mousemove", moveHandlerRef.current);
      }
      if (upHandlerRef.current) {
        document.removeEventListener("mouseup", upHandlerRef.current);
      }
    };
  }, [children, updateMetrics]);

  const handleTrackMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport || !metrics.visible) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const clickY = event.clientY - rect.top;
    const maxThumbTop = Math.max(viewport.clientHeight - metrics.thumbHeight, 0);
    const nextThumbTop = Math.max(0, Math.min(clickY - metrics.thumbHeight / 2, maxThumbTop));
    const scrollRange = viewport.scrollHeight - viewport.clientHeight;

    if (maxThumbTop > 0 && scrollRange > 0) {
      viewport.scrollTop = (nextThumbTop / maxThumbTop) * scrollRange;
    }
  };

  const handleThumbMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || !metrics.visible) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    dragStateRef.current = { startY: event.clientY, startScrollTop: viewport.scrollTop };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const activeViewport = viewportRef.current;
      const dragState = dragStateRef.current;
      if (!activeViewport || !dragState) {
        return;
      }

      const trackRange = activeViewport.clientHeight - metrics.thumbHeight;
      const scrollRange = activeViewport.scrollHeight - activeViewport.clientHeight;
      if (trackRange <= 0 || scrollRange <= 0) {
        return;
      }

      const deltaY = moveEvent.clientY - dragState.startY;
      activeViewport.scrollTop = dragState.startScrollTop + (deltaY / trackRange) * scrollRange;
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
      if (moveHandlerRef.current) {
        document.removeEventListener("mousemove", moveHandlerRef.current);
        moveHandlerRef.current = null;
      }
      if (upHandlerRef.current) {
        document.removeEventListener("mouseup", upHandlerRef.current);
        upHandlerRef.current = null;
      }
    };

    moveHandlerRef.current = handleMouseMove;
    upHandlerRef.current = handleMouseUp;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div className={`scroll-area ${className}`.trim()}>
      <div
        ref={(node) => {
          viewportRef.current = node;
          if (externalViewportRef) {
            externalViewportRef.current = node;
          }
        }}
        className="scroll-area-viewport"
      >
        <div ref={contentRef} className={viewportClassName}>
          {children}
        </div>
      </div>
      {metrics.visible ? (
        <div className="scroll-area-bar" onMouseDown={handleTrackMouseDown}>
          <div
            className="scroll-area-thumb"
            style={{ height: `${metrics.thumbHeight}px`, transform: `translateY(${metrics.thumbTop}px)` }}
            onMouseDown={handleThumbMouseDown}
          />
        </div>
      ) : null}
    </div>
  );
}
const defaultLoginForm: LoginFormState = { email: "", pwd: "" };
const defaultRegisterForm: RegisterFormState = {
  nick_name: "",
  email: "",
  verificationCode: "",
  pwd: "",
  confirmPwd: "",
};
const defaultResetPasswordForm: ResetPasswordFormState = {
  email: "",
  verificationCode: "",
  pwd: "",
  confirmPwd: "",
};
const defaultChangeEmailForm: ChangeEmailFormState = {
  currentEmail: "",
  currentVerificationCode: "",
  nextEmail: "",
  nextVerificationCode: "",
};
const defaultChangeNameForm: ChangeNameFormState = {
  nickName: "",
};
const defaultChangeAvatarForm: ChangeAvatarFormState = {
  source: null,
  avatar: null,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  fileName: "",
  imageWidth: 0,
  imageHeight: 0,
};
const defaultCreateChannelForm: CreateChannelFormState = {
  name: "",
  maxCapacity: "8",
};
const defaultDomainInfoDraft: DomainInfoDraftState = {
  name: "",
  avatar: null,
};
const defaultAnalysisRangeForm: AnalysisRangeFormState = {
  startTime: "",
  endTime: "",
};

function ProfileAvatar({
  name,
  avatar,
  className,
}: {
  name: string;
  avatar: string | null;
  className: string;
}) {
  return (
    <div className={`${className} ${avatar ? "has-image" : ""}`.trim()}>
      {avatar ? <img src={resolveMediaUrl(avatar) ?? ""} alt={`${name} avatar`} /> : name.slice(0, 1).toUpperCase()}
    </div>
  );
}

async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function loadImage(source: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("头像图片加载失败。"));
    image.src = resolveMediaUrl(source) ?? source;
  });
}

async function dataUrlToFile(dataUrl: string, filename: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
}

async function renderCroppedAvatar(source: string, zoom: number, offsetX: number, offsetY: number) {
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  const size = 256;
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("头像画布初始化失败。");
  }

  const containScale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
  const scaledWidth = image.naturalWidth * containScale * zoom;
  const scaledHeight = image.naturalHeight * containScale * zoom;
  const drawX = (size - scaledWidth) / 2 + offsetX;
  const drawY = (size - scaledHeight) / 2 + offsetY;
  const radius = 24;

  context.clearRect(0, 0, size, size);
  context.beginPath();
  context.moveTo(radius, 0);
  context.lineTo(size - radius, 0);
  context.quadraticCurveTo(size, 0, size, radius);
  context.lineTo(size, size - radius);
  context.quadraticCurveTo(size, size, size - radius, size);
  context.lineTo(radius, size);
  context.quadraticCurveTo(0, size, 0, size - radius);
  context.lineTo(0, radius);
  context.quadraticCurveTo(0, 0, radius, 0);
  context.closePath();
  context.clip();
  context.drawImage(image, drawX, drawY, scaledWidth, scaledHeight);
  return canvas.toDataURL("image/png");
}

function clampAvatarOffsets(form: ChangeAvatarFormState, nextOffsetX: number, nextOffsetY: number, stageSize: number) {
  if (!form.imageWidth || !form.imageHeight || !stageSize) {
    return { offsetX: nextOffsetX, offsetY: nextOffsetY };
  }

  const containScale = Math.min(stageSize / form.imageWidth, stageSize / form.imageHeight);
  const scaledWidth = form.imageWidth * containScale * form.zoom;
  const scaledHeight = form.imageHeight * containScale * form.zoom;
  const maxOffsetX = Math.max((scaledWidth - stageSize) / 2, 0);
  const maxOffsetY = Math.max((scaledHeight - stageSize) / 2, 0);

  return {
    offsetX: clampNumber(nextOffsetX, -maxOffsetX, maxOffsetX),
    offsetY: clampNumber(nextOffsetY, -maxOffsetY, maxOffsetY),
  };
}

function omitRecordKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

function mapDomainMemberRecord(member: DomainMemberInfo): DomainMemberRecord {
  const domainNickname = member.alias?.trim() || member.nick_name?.trim() || member.member_id;
  return {
    id: member.member_id,
    userId: member.member_id,
    globalName: member.nick_name?.trim() || member.member_id,
    domainNickname,
    role: member.role,
    avatar: member.avatar ?? null,
  };
}

type ApiEnvelope<T> = {
  code?: number;
  message?: string;
  data?: T;
};

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Content-Type") && init?.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    let detail = response.statusText;
    const rawBody = await response.text();
    if (rawBody) {
      try {
        const body = JSON.parse(rawBody) as { detail?: string };
        detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body);
      } catch {
        detail = rawBody;
      }
    }
    throw new Error(detail || "Request failed");
  }

  const body = (await response.json()) as T | ApiEnvelope<T>;
  if (body && typeof body === "object" && "data" in body) {
    return (body as ApiEnvelope<T>).data as T;
  }

  return body as T;
}

async function fetchVoiceMessages(channelId: number, token: string) {
  return request<VoiceMessagePage>(`/voice-messages/channel/${channelId}`, undefined, token);
}

async function transcribeVoiceMessage(voiceMessageId: number, token: string) {
  return request<VoiceMessage>(`/voice-messages/${voiceMessageId}/transcribe`, { method: "POST" }, token);
}

async function analyzeChannelWithRange(
  channelId: number,
  prompt: string,
  startTime: string | null,
  endTime: string | null,
  token: string,
) {
  return request<ChannelAnalysisResponse>(
    `/channels/${channelId}/analyze`,
    {
      method: "POST",
      body: JSON.stringify({
        prompt,
        start_time: startTime,
        end_time: endTime,
      }),
    },
    token,
  );
}

async function uploadAvatarAsset(dataUrl: string, scope: "user" | "domain", token: string) {
  const file = await dataUrlToFile(dataUrl, `${scope}-avatar.png`);
  const formData = new FormData();
  formData.set("scope", scope);
  formData.set("file", file);

  const response = await request<{ path: string }>(
    "/uploads/avatar",
    {
      method: "POST",
      body: formData,
    },
    token,
  );

  return response.path;
}

async function uploadVoiceMessageAsset(
  params: {
    channelId: number;
    durationMs: number;
    wavBlob: Blob;
    clientMessageId: string;
    waveform?: number[];
  },
  token: string,
) {
  const formData = new FormData();
  formData.set("channel_id", String(params.channelId));
  formData.set("duration_ms", String(params.durationMs));
  formData.set("client_message_id", params.clientMessageId);
  if (params.waveform?.length) {
    formData.set("waveform", JSON.stringify(params.waveform));
  }
  formData.set("file", new File([params.wavBlob], `${params.clientMessageId}.wav`, { type: "audio/wav" }));

  return request<VoiceMessage | null>(
    "/voice-messages/upload",
    {
      method: "POST",
      body: formData,
    },
    token,
  );
}

async function uploadVoiceStreamChunkAsset(
  params: {
    channelId: number;
    streamId: string;
    sequence: number;
    wavBlob: Blob;
    isFinal: boolean;
  },
  token: string,
) {
  const formData = new FormData();
  formData.set("channel_id", String(params.channelId));
  formData.set("stream_id", params.streamId);
  formData.set("sequence", String(params.sequence));
  formData.set("is_final", String(params.isFinal));
  formData.set("file", new File([params.wavBlob], `${params.streamId}-${params.sequence}.wav`, { type: "audio/wav" }));

  return request<{
    stream_id: string;
    emitted_count: number;
    voice_messages: VoiceMessage[];
    session_active: boolean;
    buffered_ms: number;
  }>(
    "/voice-messages/stream/chunk",
    {
      method: "POST",
      body: formData,
    },
    token,
  );
}

function formatApiError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const detail = error.message.trim();
  if (!detail) {
    return fallback;
  }

  if (detail.includes("Failed to fetch")) {
    return "\u65e0\u6cd5\u8fde\u63a5\u5230\u540e\u7aef\u670d\u52a1\uff0c\u8bf7\u786e\u8ba4\u63a5\u53e3\u5df2\u542f\u52a8\u3002";
  }

  if (detail.includes("Invalid email or password")) {
    return "\u90ae\u7bb1\u6216\u5bc6\u7801\u9519\u8bef\u3002";
  }

  if (detail.includes("Email already exists")) {
    return "\u8be5\u90ae\u7bb1\u5df2\u6ce8\u518c\u3002";
  }

  if (detail.includes("Missing authorization header")) {
    return "\u767b\u5f55\u72b6\u6001\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002";
  }

  if (detail.includes("Invalid or expired token")) {
    return "\u767b\u5f55\u72b6\u6001\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002";
  }

  return detail;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatMediaAccessError(error: unknown) {
  if (!(error instanceof Error)) {
    return "麦克风检测失败。";
  }

  if (error.name === "NotAllowedError") {
    return "麦克风权限被拒绝。";
  }

  if (error.name === "NotFoundError") {
    return "未找到可用的输入设备。";
  }

  if (error.name === "NotReadableError") {
    return "麦克风当前被其他程序占用。";
  }

  return error.message.trim() || "麦克风检测失败。";
}

function useSceneScale(view: DesktopView) {
  const target = VIEWPORTS[view];
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      const nextScale = Math.min(window.innerWidth / target.width, window.innerHeight / target.height);
      setScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [target.height, target.width]);

  return { ...target, scale };
}

function WindowControls({ view }: { view: DesktopView }) {
  const stopPointer = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const showMaximize = view === "workspace" || view === "settings";

  return (
    <div className="window-controls no-drag">
      <button
        className="window-control-button"
        type="button"
        aria-label="Minimize window"
        onMouseDown={stopPointer}
        onClick={(event) => {
          stopPointer(event);
          void window.electronAPI?.minimizeWindow();
        }}
      >
        <img className="window-control-icon-image" src={WINDOW_MIN_URL} alt="" aria-hidden="true" />
      </button>
      {showMaximize ? (
        <button
          className="window-control-button"
          type="button"
          aria-label="Maximize window"
          onMouseDown={stopPointer}
          onClick={(event) => {
            stopPointer(event);
            void window.electronAPI?.toggleMaximizeWindow();
          }}
        >
          <img className="window-control-icon-image" src={WINDOW_MAX_URL} alt="" aria-hidden="true" />
        </button>
      ) : null}
      <button
        className="window-control-button close"
        type="button"
        aria-label="Close window"
        onMouseDown={stopPointer}
        onClick={(event) => {
          stopPointer(event);
          void window.electronAPI?.closeWindow();
        }}
      >
        <img className="window-control-icon-image" src={WINDOW_CLOSE_URL} alt="" aria-hidden="true" />
      </button>
    </div>
  );
}

function SceneFrame({ view, children }: { view: DesktopView; children: ReactNode }) {
  const { width, height, scale } = useSceneScale(view);
  const isWorkspace = view === "workspace" || view === "settings";
  const isAuthScene = view === "login" || view === "register" || view === "reset";

  return (
    <div className="scene-shell">
      <div
        className={`scene-frame ${isWorkspace ? "scene-frame-workspace" : ""} ${isAuthScene ? "scene-frame-auth" : ""}`.trim()}
        style={isWorkspace ? undefined : { width, height, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {children}
      </div>
      <WindowControls view={view} />
    </div>
  );
}

function LoginView({
  loginForm,
  isSubmitting,
  message,
  onChange,
  onSubmit,
  onSwitchToRegister,
  onSwitchToReset,
}: {
  loginForm: LoginFormState;
  isSubmitting: boolean;
  message: string;
  onChange: (field: keyof LoginFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchToRegister: () => void;
  onSwitchToReset: () => void;
}) {
  return (
    <div className="login-shell drag-region">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <main className="auth-card auth-card-login">
        <div className="login-card-header">
          <img className="login-card-logo" src={APP_LOGO_URL} alt="EKKO logo" />
        </div>

        <form onSubmit={onSubmit} className="login-form">
          <label>
            <span>{"\u90ae\u7bb1"}</span>
            <input
              type="email"
              placeholder={"\u8bf7\u8f93\u5165\u90ae\u7bb1"}
              value={loginForm.email}
              onChange={(event) => onChange("email", event.target.value)}
            />
          </label>
          <PasswordField
            label={"\u5bc6\u7801"}
            placeholder={"\u8bf7\u8f93\u5165\u5bc6\u7801"}
            value={loginForm.pwd}
            onChange={(value) => onChange("pwd", value)}
          />
          <div className="auth-inline-row">
            {message ? <p className="message-line auth-inline-message">{message}</p> : <span className="auth-inline-placeholder" aria-hidden="true" />}
            <button className="auth-inline-action" type="button" onClick={onSwitchToReset}>
              {"\u627e\u56de\u5bc6\u7801"}
            </button>
          </div>
          <div className="auth-actions">
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "\u767b\u5f55\u4e2d..." : "\u767b\u5f55"}
            </button>
            <button className="ghost-button" type="button" onClick={onSwitchToRegister}>
              {"\u6ce8\u518c"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function RegisterView({
  registerForm,
  isSubmitting,
  message,
  onChange,
  onSubmit,
  onSendCode,
  onBackToLogin,
}: {
  registerForm: RegisterFormState;
  isSubmitting: boolean;
  message: string;
  onChange: (field: keyof RegisterFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSendCode: () => void;
  onBackToLogin: () => void;
}) {
  return (
    <div className="login-shell drag-region">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <main className="auth-card auth-card-register">
        <div className="login-card-header">
          <img className="login-card-logo" src={APP_LOGO_URL} alt="EKKO logo" />
        </div>

        <form onSubmit={onSubmit} className="login-form">
          <label>
            <span>{"\u6635\u79f0"}</span>
            <input
              type="text"
              placeholder={"\u8bf7\u8f93\u5165\u6635\u79f0"}
              value={registerForm.nick_name}
              onChange={(event) => onChange("nick_name", event.target.value)}
            />
          </label>
          <label>
            <span>{"\u90ae\u7bb1"}</span>
            <input
              type="email"
              placeholder={"\u8bf7\u8f93\u5165\u90ae\u7bb1"}
              value={registerForm.email}
              onChange={(event) => onChange("email", event.target.value)}
            />
          </label>
          <label>
            <span>{"\u9a8c\u8bc1\u7801"}</span>
            <div className="verification-row">
              <input
                type="text"
                placeholder={"\u8bf7\u8f93\u5165\u9a8c\u8bc1\u7801"}
                value={registerForm.verificationCode}
                onChange={(event) => onChange("verificationCode", event.target.value)}
              />
              <button className="ghost-button verification-button" type="button" onClick={onSendCode}>
                {"\u53d1\u9001\u9a8c\u8bc1\u7801"}
              </button>
            </div>
          </label>
          <PasswordField
            label={"\u5bc6\u7801"}
            placeholder={"\u8bf7\u8f93\u5165\u5bc6\u7801"}
            value={registerForm.pwd}
            onChange={(value) => onChange("pwd", value)}
          />
          <PasswordField
            label={"\u786e\u8ba4\u5bc6\u7801"}
            placeholder={"\u8bf7\u518d\u6b21\u8f93\u5165\u5bc6\u7801"}
            value={registerForm.confirmPwd}
            onChange={(value) => onChange("confirmPwd", value)}
          />
          {message ? <p className="message-line">{message}</p> : null}
          <div className="auth-actions auth-actions-register">
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "\u6ce8\u518c\u4e2d..." : "\u6ce8\u518c"}
            </button>
            <button className="ghost-button" type="button" onClick={onBackToLogin}>
              {"\u8fd4\u56de\u767b\u5f55"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function ResetPasswordView({
  resetForm,
  isSubmitting,
  message,
  onChange,
  onSubmit,
  onSendCode,
  onBackToLogin,
}: {
  resetForm: ResetPasswordFormState;
  isSubmitting: boolean;
  message: string;
  onChange: (field: keyof ResetPasswordFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSendCode: () => void;
  onBackToLogin: () => void;
}) {
  return (
    <div className="login-shell drag-region">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <main className="auth-card auth-card-reset">
        <div className="login-card-header">
          <img className="login-card-logo" src={APP_LOGO_URL} alt="EKKO logo" />
        </div>

        <ResetPasswordForm
          resetForm={resetForm}
          isSubmitting={isSubmitting}
          message={message}
          onChange={onChange}
          onSubmit={onSubmit}
          onSendCode={onSendCode}
          submitLabel="修改密码"
          secondaryLabel="返回登录"
          onSecondaryAction={onBackToLogin}
        />
      </main>
    </div>
  );
}

function ResetPasswordForm({
  resetForm,
  isSubmitting,
  message,
  onChange,
  onSubmit,
  onSendCode,
  submitLabel,
  secondaryLabel,
  onSecondaryAction,
}: {
  resetForm: ResetPasswordFormState;
  isSubmitting: boolean;
  message: string;
  onChange: (field: keyof ResetPasswordFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSendCode: () => void;
  submitLabel: string;
  secondaryLabel: string;
  onSecondaryAction: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="login-form">
      <label>
        <span>{"\u90ae\u7bb1"}</span>
        <input
          type="email"
          placeholder={"\u8bf7\u8f93\u5165\u90ae\u7bb1"}
          value={resetForm.email}
          onChange={(event) => onChange("email", event.target.value)}
        />
      </label>
      <label>
        <span>{"\u9a8c\u8bc1\u7801"}</span>
        <div className="verification-row">
          <input
            type="text"
            placeholder={"\u8bf7\u8f93\u5165\u9a8c\u8bc1\u7801"}
            value={resetForm.verificationCode}
            onChange={(event) => onChange("verificationCode", event.target.value)}
          />
          <button className="ghost-button verification-button" type="button" onClick={onSendCode}>
            {"\u53d1\u9001\u9a8c\u8bc1\u7801"}
          </button>
        </div>
      </label>
      <PasswordField
        label={"\u65b0\u5bc6\u7801"}
        placeholder={"\u8bf7\u8f93\u5165\u65b0\u5bc6\u7801"}
        value={resetForm.pwd}
        onChange={(value) => onChange("pwd", value)}
      />
      <PasswordField
        label={"\u786e\u8ba4\u65b0\u5bc6\u7801"}
        placeholder={"\u8bf7\u518d\u6b21\u8f93\u5165\u65b0\u5bc6\u7801"}
        value={resetForm.confirmPwd}
        onChange={(value) => onChange("confirmPwd", value)}
      />
      {message ? <p className="message-line">{message}</p> : null}
      <div className="auth-actions auth-actions-register">
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "\u63d0\u4ea4\u4e2d..." : submitLabel}
        </button>
        <button className="ghost-button" type="button" onClick={onSecondaryAction}>
          {secondaryLabel}
        </button>
      </div>
    </form>
  );
}

function ChangeEmailForm({
  emailForm,
  isSubmitting,
  message,
  onChange,
  onSubmit,
  onSendCurrentCode,
  onSendNextCode,
  onSecondaryAction,
}: {
  emailForm: ChangeEmailFormState;
  isSubmitting: boolean;
  message: string;
  onChange: (field: keyof ChangeEmailFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSendCurrentCode: () => void;
  onSendNextCode: () => void;
  onSecondaryAction: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="login-form">
      <label>
        <span>{"\u539f\u90ae\u7bb1"}</span>
        <input
          type="email"
          placeholder={"\u8bf7\u8f93\u5165\u5f53\u524d\u7ed1\u5b9a\u90ae\u7bb1"}
          value={emailForm.currentEmail}
          onChange={(event) => onChange("currentEmail", event.target.value)}
        />
      </label>
      <label>
        <span>{"\u539f\u90ae\u7bb1\u9a8c\u8bc1\u7801"}</span>
        <div className="verification-row">
          <input
            type="text"
            placeholder={"\u8bf7\u8f93\u5165\u539f\u90ae\u7bb1\u9a8c\u8bc1\u7801"}
            value={emailForm.currentVerificationCode}
            onChange={(event) => onChange("currentVerificationCode", event.target.value)}
          />
          <button className="ghost-button verification-button" type="button" onClick={onSendCurrentCode}>
            {"\u53d1\u9001\u9a8c\u8bc1\u7801"}
          </button>
        </div>
      </label>
      <label>
        <span>{"\u65b0\u90ae\u7bb1"}</span>
        <input
          type="email"
          placeholder={"\u8bf7\u8f93\u5165\u65b0\u90ae\u7bb1"}
          value={emailForm.nextEmail}
          onChange={(event) => onChange("nextEmail", event.target.value)}
        />
      </label>
      <label>
        <span>{"\u65b0\u90ae\u7bb1\u9a8c\u8bc1\u7801"}</span>
        <div className="verification-row">
          <input
            type="text"
            placeholder={"\u8bf7\u8f93\u5165\u65b0\u90ae\u7bb1\u9a8c\u8bc1\u7801"}
            value={emailForm.nextVerificationCode}
            onChange={(event) => onChange("nextVerificationCode", event.target.value)}
          />
          <button className="ghost-button verification-button" type="button" onClick={onSendNextCode}>
            {"\u53d1\u9001\u9a8c\u8bc1\u7801"}
          </button>
        </div>
      </label>
      {message ? <p className="message-line">{message}</p> : null}
      <div className="auth-actions auth-actions-register">
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "\u63d0\u4ea4\u4e2d..." : "\u4fee\u6539\u90ae\u7bb1"}
        </button>
        <button className="ghost-button" type="button" onClick={onSecondaryAction}>
          {"\u8fd4\u56de\u8bbe\u7f6e"}
        </button>
      </div>
    </form>
  );
}

function ChangeNameForm({
  nameForm,
  isSubmitting,
  message,
  onChange,
  onSubmit,
  onSecondaryAction,
}: {
  nameForm: ChangeNameFormState;
  isSubmitting: boolean;
  message: string;
  onChange: (field: keyof ChangeNameFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSecondaryAction: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="login-form">
      <label>
        <span>{"\u65b0\u7528\u6237\u540d"}</span>
        <input
          type="text"
          placeholder={"\u8bf7\u8f93\u5165\u65b0\u7684\u6635\u79f0"}
          value={nameForm.nickName}
          maxLength={24}
          onChange={(event) => onChange("nickName", event.target.value)}
        />
      </label>
      <p className="settings-form-footnote">修改会直接同步到当前账号信息。</p>
      {message ? <p className="message-line">{message}</p> : null}
      <div className="auth-actions auth-actions-register">
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "\u63d0\u4ea4\u4e2d..." : "\u4fdd\u5b58\u540d\u79f0"}
        </button>
        <button className="ghost-button" type="button" onClick={onSecondaryAction}>
          {"\u8fd4\u56de\u8bbe\u7f6e"}
        </button>
      </div>
    </form>
  );
}

function AvatarCropStage({
  avatarForm,
  onChange,
  onChooseFile,
  className = "",
  emptyLabel = "选择图片",
}: {
  avatarForm: ChangeAvatarFormState;
  onChange: (field: keyof ChangeAvatarFormState, value: string | number | null) => void;
  onChooseFile: (event: ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  emptyLabel?: string;
}) {
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const clickSuppressedRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      if (Math.abs(event.clientX - dragState.startX) > 3 || Math.abs(event.clientY - dragState.startY) > 3) {
        clickSuppressedRef.current = true;
      }

      const stageSize = stageRef.current?.clientWidth ?? 0;
      const nextOffsets = clampAvatarOffsets(
        avatarForm,
        dragState.originX + event.clientX - dragState.startX,
        dragState.originY + event.clientY - dragState.startY,
        stageSize,
      );
      onChange("offsetX", nextOffsets.offsetX);
      onChange("offsetY", nextOffsets.offsetY);
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
      setDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [avatarForm, dragging, onChange]);

  return (
    <>
      <input
        ref={fileInputRef}
        className="avatar-file-input"
        style={{ display: "none" }}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={onChooseFile}
      />
      <div
        ref={stageRef}
        className={`avatar-crop-stage ${className} ${avatarForm.source ? "is-interactive" : ""} ${dragging ? "is-dragging" : ""}`.trim()}
        onClick={() => {
          if (clickSuppressedRef.current) {
            clickSuppressedRef.current = false;
            return;
          }
          fileInputRef.current?.click();
        }}
        onMouseDown={(event) => {
          if (!avatarForm.source) {
            return;
          }

          event.preventDefault();
          clickSuppressedRef.current = false;
          dragStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            originX: avatarForm.offsetX,
            originY: avatarForm.offsetY,
          };
          setDragging(true);
        }}
        onWheel={(event) => {
          if (!avatarForm.source) {
            return;
          }

          event.preventDefault();
          const nextZoom = Number(clampNumber(avatarForm.zoom - event.deltaY * 0.0015, 1, 3).toFixed(3));
          const stageSize = stageRef.current?.clientWidth ?? 0;
          const nextOffsets = clampAvatarOffsets({ ...avatarForm, zoom: nextZoom }, avatarForm.offsetX, avatarForm.offsetY, stageSize);
          onChange("zoom", nextZoom);
          onChange("offsetX", nextOffsets.offsetX);
          onChange("offsetY", nextOffsets.offsetY);
        }}
      >
        {avatarForm.source ? (
          <img
            className="avatar-crop-image"
            src={resolveMediaUrl(avatarForm.source) ?? avatarForm.source}
            alt="avatar crop preview"
            style={{
              transform: `translate(calc(-50% + ${avatarForm.offsetX}px), calc(-50% + ${avatarForm.offsetY}px)) scale(${avatarForm.zoom})`,
            }}
          />
        ) : (
          <div className="avatar-crop-empty">{emptyLabel}</div>
        )}
        <div className="avatar-crop-mask" aria-hidden="true" />
      </div>
    </>
  );
}

function ChangeAvatarForm({
  avatarForm,
  isSubmitting,
  message,
  onChange,
  onChooseFile,
  onSubmit,
  onSecondaryAction,
  submitLabel,
  secondaryLabel,
  emptyLabel,
}: {
  avatarForm: ChangeAvatarFormState;
  isSubmitting: boolean;
  message: string;
  onChange: (field: keyof ChangeAvatarFormState, value: string | number | null) => void;
  onChooseFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSecondaryAction: () => void;
  submitLabel: string;
  secondaryLabel: string;
  emptyLabel: string;
}) {
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragMovedRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const stageSize = stageRef.current?.clientWidth ?? 0;
      if (Math.abs(event.clientX - dragState.startX) > 3 || Math.abs(event.clientY - dragState.startY) > 3) {
        dragMovedRef.current = true;
      }
      const nextOffsets = clampAvatarOffsets(
        avatarForm,
        dragState.originX + event.clientX - dragState.startX,
        dragState.originY + event.clientY - dragState.startY,
        stageSize,
      );
      onChange("offsetX", nextOffsets.offsetX);
      onChange("offsetY", nextOffsets.offsetY);
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
      setDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [avatarForm, dragging, onChange]);

  return (
    <form onSubmit={onSubmit} className="login-form">
      <div className="avatar-crop-shell">
        <div
          ref={stageRef}
          className={`avatar-crop-stage ${avatarForm.source ? "is-interactive" : ""} ${dragging ? "is-dragging" : ""}`.trim()}
          onClick={() => {
            if (dragMovedRef.current) {
              dragMovedRef.current = false;
              return;
            }

            fileInputRef.current?.click();
          }}
          onMouseDown={(event) => {
            if (!avatarForm.source) {
              return;
            }

            event.preventDefault();
            dragMovedRef.current = false;
            dragStateRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              originX: avatarForm.offsetX,
              originY: avatarForm.offsetY,
            };
            setDragging(true);
          }}
          onWheel={(event) => {
            if (!avatarForm.source) {
              return;
            }

            event.preventDefault();
            const nextZoom = Number(clampNumber(avatarForm.zoom - event.deltaY * 0.0015, 1, 3).toFixed(3));
            const stageSize = stageRef.current?.clientWidth ?? 0;
            const nextOffsets = clampAvatarOffsets({ ...avatarForm, zoom: nextZoom }, avatarForm.offsetX, avatarForm.offsetY, stageSize);
            onChange("zoom", nextZoom);
            onChange("offsetX", nextOffsets.offsetX);
            onChange("offsetY", nextOffsets.offsetY);
          }}
        >
          <input
            ref={fileInputRef}
            className="avatar-file-input avatar-file-input-stage"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onChooseFile}
          />
          {avatarForm.source ? (
            <img
              className="avatar-crop-image"
              src={resolveMediaUrl(avatarForm.source) ?? avatarForm.source}
              alt="avatar crop preview"
              style={{
                transform: `translate(calc(-50% + ${avatarForm.offsetX}px), calc(-50% + ${avatarForm.offsetY}px)) scale(${avatarForm.zoom})`,
              }}
            />
          ) : (
            <div className="avatar-crop-empty">{emptyLabel}</div>
          )}
          <div className="avatar-crop-mask" aria-hidden="true" />
        </div>
      </div>
      {message ? <p className="message-line">{message}</p> : null}
      <div className="auth-actions auth-actions-register">
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "\u63d0\u4ea4\u4e2d..." : submitLabel}
        </button>
        <button className="ghost-button" type="button" onClick={onSecondaryAction}>
          {secondaryLabel}
        </button>
      </div>
    </form>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainMembersByDomain, setDomainMembersByDomain] = useState<Record<string, DomainMemberRecord[]>>({});
  const [domainAvatars, setDomainAvatars] = useState<Record<string, string | null>>({});
  const [channelsByDomain, setChannelsByDomain] = useState<Record<string, Channel[]>>({});
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [joinedChannelId, setJoinedChannelId] = useState<number | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [appVersion, setAppVersion] = useState("dev");
  const [loginForm, setLoginForm] = useState<LoginFormState>(defaultLoginForm);
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(defaultRegisterForm);
  const [resetForm, setResetForm] = useState<ResetPasswordFormState>(defaultResetPasswordForm);
  const [changeEmailForm, setChangeEmailForm] = useState<ChangeEmailFormState>(defaultChangeEmailForm);
  const [changeNameForm, setChangeNameForm] = useState<ChangeNameFormState>(defaultChangeNameForm);
  const [changeAvatarForm, setChangeAvatarForm] = useState<ChangeAvatarFormState>(defaultChangeAvatarForm);
  const [domainMenuOpen, setDomainMenuOpen] = useState(false);
  const [channelContextMenu, setChannelContextMenu] = useState<ChannelContextMenuState>(null);
  const [domainEntryCardOpen, setDomainEntryCardOpen] = useState(false);
  const [createDomainModalOpen, setCreateDomainModalOpen] = useState(false);
  const [createDomainDraft, setCreateDomainDraft] = useState<DomainInfoDraftState>(defaultDomainInfoDraft);
  const [createDomainAvatarForm, setCreateDomainAvatarForm] = useState<ChangeAvatarFormState>(defaultChangeAvatarForm);
  const [createDomainError, setCreateDomainError] = useState("");
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [createChannelForm, setCreateChannelForm] = useState<CreateChannelFormState>(defaultCreateChannelForm);
  const [createChannelError, setCreateChannelError] = useState("");
  const [domainNicknameModalOpen, setDomainNicknameModalOpen] = useState(false);
  const [domainNicknameDraft, setDomainNicknameDraft] = useState("");
  const [domainSettingsOpen, setDomainSettingsOpen] = useState(false);
  const [domainSettingsSection, setDomainSettingsSection] = useState<DomainSettingsSection>("info");
  const [domainInfoDraft, setDomainInfoDraft] = useState<DomainInfoDraftState>(defaultDomainInfoDraft);
  const [domainAvatarForm, setDomainAvatarForm] = useState<ChangeAvatarFormState>(defaultChangeAvatarForm);
  const [deleteDomainConfirmOpen, setDeleteDomainConfirmOpen] = useState(false);
  const [joinDomainQuery, setJoinDomainQuery] = useState("");
  const [joinDomainSearched, setJoinDomainSearched] = useState(false);
  const [joinDomainResults, setJoinDomainResults] = useState<Domain[]>([]);
  const [domainIdCopied, setDomainIdCopied] = useState(false);
  const [userIdCopied, setUserIdCopied] = useState(false);
  const [selfMicMuted, setSelfMicMuted] = useState(false);
  const [selfMonitorMuted, setSelfMonitorMuted] = useState(false);
  const [mutedPeers, setMutedPeers] = useState<Record<string, boolean>>({});
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({});
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("account");
  const [settingsDeviceMenu, setSettingsDeviceMenu] = useState<"input" | "output" | null>(null);
  const [accountModal, setAccountModal] = useState<"password" | "email" | "name" | "avatar" | null>(null);
  const [accountModalMessage, setAccountModalMessage] = useState("");
  const [domainAvatarModalOpen, setDomainAvatarModalOpen] = useState(false);
  const [domainAvatarMessage, setDomainAvatarMessage] = useState("");
  const [domainInfoMessage, setDomainInfoMessage] = useState("");
  const [audioInputDevices, setAudioInputDevices] = useState<AudioDeviceOption[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<AudioDeviceOption[]>([]);
  const [settings, setSettings] = useState<SettingsState>(() => loadStoredSettings());
  const [voiceConnectionState, setVoiceConnectionState] = useState<VoiceConnectionState>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [localParticipantIdentity, setLocalParticipantIdentity] = useState<string | null>(null);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([]);
  const [voiceMessages, setVoiceMessages] = useState<VoiceMessage[]>([]);
  const [voiceMessagesLoading, setVoiceMessagesLoading] = useState(false);
  const [playingVoiceMessageId, setPlayingVoiceMessageId] = useState<number | null>(null);
  const [downloadingVoiceMessageId, setDownloadingVoiceMessageId] = useState<number | null>(null);
  const [downloadedVoiceMessageId, setDownloadedVoiceMessageId] = useState<number | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ChannelAnalysisResponse | null>(null);
  const [analysisRangeModalOpen, setAnalysisRangeModalOpen] = useState(false);
  const [analysisRangeForm, setAnalysisRangeForm] = useState<AnalysisRangeFormState>(defaultAnalysisRangeForm);
  const [analysisRangeError, setAnalysisRangeError] = useState("");
  const [joinDebugStatus, setJoinDebugStatus] = useState("Join idle");
  const [vadDebugStatus, setVadDebugStatus] = useState("VAD idle");
  const [localInputLevel, setLocalInputLevel] = useState(0);
  const [tempMicPermissionState, setTempMicPermissionState] = useState<TempMicPermissionState>("idle");
  const [tempMicProbeState, setTempMicProbeState] = useState<TempMicProbeState>("idle");
  const [tempMicProbeDetail, setTempMicProbeDetail] = useState("");
  const [tempAppliedInputDeviceLabel, setTempAppliedInputDeviceLabel] = useState("未验证");
  const [tempAppliedOutputDeviceLabel, setTempAppliedOutputDeviceLabel] = useState("未验证");
  const [noiseFilterPending, setNoiseFilterPending] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const localMicrophoneTrackRef = useRef<LocalAudioTrack | null>(null);
  const temporaryMicrophoneTrackRef = useRef(false);
  const remoteAudioElementsRef = useRef(new Map<string, HTMLAudioElement>());
  const voiceMessagePlayerRef = useRef<HTMLAudioElement | null>(null);
  const voiceMessagesViewportRef = useRef<HTMLDivElement | null>(null);
  const pendingTranscriptionIdsRef = useRef<Set<number>>(new Set());
  const latestVoiceMessagesRef = useRef<VoiceMessage[]>([]);
  const deferredVoiceMessagesRef = useRef<VoiceMessage[] | null>(null);
  const voiceMessagesChannelIdRef = useRef<number | null>(null);
  const voiceMessagesShouldStickToBottomRef = useRef(false);
  const sentenceRecorderRef = useRef<{
    stop: () => Promise<void>;
  } | null>(null);
  const uploadSentenceQueueRef = useRef(Promise.resolve());
  const tokenRef = useRef<string | null>(null);
  const joinedChannelIdRef = useRef<number | null>(null);
  const selfMicMutedRef = useRef(false);
  const voiceDisconnectingRef = useRef(false);
  const activeChannelLeavePromiseRef = useRef<Promise<void> | null>(null);
  const joinFlowActiveRef = useRef(false);
  const downloadFeedbackTimerRef = useRef<number | null>(null);
  const autoLaunchSyncReadyRef = useRef(false);
  const settingsSyncReadyRef = useRef(false);
  const settingsSyncTimerRef = useRef<number | null>(null);

  const currentView: DesktopView = user ? (settingsOpen || domainSettingsOpen ? "settings" : "workspace") : authMode;

  useEffect(() => {
    window.electronAPI?.getVersion().then(setAppVersion).catch(() => setAppVersion("dev"));
    window.electronAPI?.getAutoLaunch()
      .then((enabled) => {
        autoLaunchSyncReadyRef.current = true;
        setSettings((current) => (current.autoLaunch === enabled ? current : { ...current, autoLaunch: enabled }));
      })
      .catch(() => {
        autoLaunchSyncReadyRef.current = true;
      });

    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (!savedToken) {
      setIsBooting(false);
      return;
    }

    hydrateWorkspace(savedToken).finally(() => setIsBooting(false));
  }, []);

  useEffect(() => {
    window.electronAPI?.setMinimizeOnClose(settings.minimizeOnClose).catch(() => undefined);
  }, [settings.minimizeOnClose]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    joinedChannelIdRef.current = joinedChannelId;
  }, [joinedChannelId]);

  useEffect(() => {
    selfMicMutedRef.current = selfMicMuted;
  }, [selfMicMuted]);

  useEffect(() => {
    if (!autoLaunchSyncReadyRef.current) {
      return;
    }

    window.electronAPI?.setAutoLaunch(settings.autoLaunch)
      .then((enabled) => {
        setSettings((current) => (current.autoLaunch === enabled ? current : { ...current, autoLaunch: enabled }));
      })
      .catch(() => undefined);
  }, [settings.autoLaunch]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore local persistence errors and keep in-memory settings usable.
    }
  }, [settings]);

  useEffect(() => {
    if (!token || !user || !settingsSyncReadyRef.current) {
      return;
    }

    if (settingsSyncTimerRef.current !== null) {
      window.clearTimeout(settingsSyncTimerRef.current);
    }

    settingsSyncTimerRef.current = window.setTimeout(() => {
      void request<UserSettingsResponse>(
        "/users/settings",
        {
          method: "PUT",
          body: JSON.stringify({ settings }),
        },
        token,
      ).catch(() => undefined);
      settingsSyncTimerRef.current = null;
    }, 500);

    return () => {
      if (settingsSyncTimerRef.current !== null) {
        window.clearTimeout(settingsSyncTimerRef.current);
        settingsSyncTimerRef.current = null;
      }
    };
  }, [settings, token, user]);

  useEffect(() => {
    window.electronAPI?.setView(currentView).catch(() => undefined);
  }, [currentView]);

  useEffect(
    () => () => {
      const player = voiceMessagePlayerRef.current;
      if (player) {
        player.pause();
        voiceMessagePlayerRef.current = null;
      }
      if (downloadFeedbackTimerRef.current !== null) {
        window.clearTimeout(downloadFeedbackTimerRef.current);
        downloadFeedbackTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    latestVoiceMessagesRef.current = voiceMessages;
  }, [voiceMessages]);

  useEffect(
    () => {
      const leaveActiveChannel = () => {
        void leaveCurrentChannel({ keepalive: true, clearLocal: false });
      };
      const removePrepareQuitListener = window.electronAPI?.onPrepareQuit(() => leaveCurrentChannel({ keepalive: false, clearLocal: false }));

      window.addEventListener("pagehide", leaveActiveChannel);
      window.addEventListener("beforeunload", leaveActiveChannel);
      return () => {
        window.removeEventListener("pagehide", leaveActiveChannel);
        window.removeEventListener("beforeunload", leaveActiveChannel);
        removePrepareQuitListener?.();
      };
    },
    [],
  );

  function requestLeaveChannel(channelId: number, sessionToken: string, keepalive = false) {
    return fetch(`${API_BASE}/channels/leave`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ channel_id: channelId }),
      keepalive,
    })
      .then(() => undefined)
      .catch(() => undefined);
  }

  async function leaveCurrentChannel({
    nextState = "disconnected",
    keepalive = false,
    clearLocal = true,
  }: {
    nextState?: VoiceConnectionState;
    keepalive?: boolean;
    clearLocal?: boolean;
  } = {}) {
    const activeToken = tokenRef.current;
    const activeChannelId = joinedChannelIdRef.current;

    if (activeToken && activeChannelId) {
      if (!activeChannelLeavePromiseRef.current) {
        const leavePromise = requestLeaveChannel(activeChannelId, activeToken, keepalive)
          .finally(() => {
            if (activeChannelLeavePromiseRef.current === leavePromise) {
              activeChannelLeavePromiseRef.current = null;
            }
          });

        activeChannelLeavePromiseRef.current = leavePromise;
      }

      await activeChannelLeavePromiseRef.current;
    }

    joinedChannelIdRef.current = null;
    setJoinedChannelId(null);

    if (clearLocal) {
      await clearVoiceSessionState(nextState);
    }
  }

  async function handleSelectDownloadPath() {
    try {
      const selectedPath = await window.electronAPI?.selectDownloadPath(settings.downloadPath);
      if (!selectedPath) {
        return;
      }

      setSettings((current) => ({ ...current, downloadPath: selectedPath }));
    } catch {
      // Keep the existing path if the native picker cannot be opened.
    }
  }

  async function triggerVoiceMessageTranscription(voiceMessageId: number, accessToken: string) {
    if (pendingTranscriptionIdsRef.current.has(voiceMessageId)) {
      return;
    }

    pendingTranscriptionIdsRef.current.add(voiceMessageId);
    try {
      const updated = await transcribeVoiceMessage(voiceMessageId, accessToken);
      if (updated.channel_id !== voiceMessagesChannelIdRef.current) {
        return;
      }
      setVoiceMessages((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      // Keep silent here. Upload route already attempts ASR automatically.
    } finally {
      pendingTranscriptionIdsRef.current.delete(voiceMessageId);
    }
  }

  function triggerPendingVoiceMessageTranscriptions(messages: VoiceMessage[], accessToken: string, channelId: number) {
    messages
      .filter((item) => item.channel_id === channelId && !item.transcript_text?.trim())
      .forEach((item) => {
        void triggerVoiceMessageTranscription(item.id, accessToken);
      });
  }

  function applyDeferredVoiceMessages() {
    const deferred = deferredVoiceMessagesRef.current;
    if (!deferred) {
      return;
    }

    deferredVoiceMessagesRef.current = null;
    setVoiceMessages((current) => mergeVoiceMessages(current.filter((item) => item.channel_id === voiceMessagesChannelIdRef.current), deferred));
  }

  function stickVoiceMessagesToBottomAfterRender() {
    voiceMessagesShouldStickToBottomRef.current = true;
  }

  async function loadVoiceMessagesForChannel(channelId: number, accessToken: string, silent = false) {
    if (!silent) {
      setVoiceMessagesLoading(true);
    }

    try {
      const page = await fetchVoiceMessages(channelId, accessToken);
      if (voiceMessagesChannelIdRef.current !== channelId) {
        return;
      }

      const nextMessages = page.voice_messages ?? [];
      const viewport = voiceMessagesViewportRef.current;
      const shouldApplyUpdate = !silent || !viewport || isViewportNearBottom(viewport);
      if (shouldApplyUpdate) {
        deferredVoiceMessagesRef.current = null;
        setVoiceMessages((current) => (silent ? mergeVoiceMessages(current.filter((item) => item.channel_id === channelId), nextMessages) : nextMessages));
        if (!silent) {
          stickVoiceMessagesToBottomAfterRender();
        }
      } else {
        const diffCount = countVoiceMessageDiffs(latestVoiceMessagesRef.current.filter((item) => item.channel_id === channelId), nextMessages);
        if (diffCount > 0) {
          deferredVoiceMessagesRef.current = nextMessages;
        }
      }

      triggerPendingVoiceMessageTranscriptions(nextMessages, accessToken, channelId);
    } catch (error) {
      if (!silent && voiceMessagesChannelIdRef.current === channelId) {
        setMessage(formatApiError(error, "语音消息加载失败，请稍后重试。"));
      }
    } finally {
      if (!silent && voiceMessagesChannelIdRef.current === channelId) {
        setVoiceMessagesLoading(false);
      }
    }
  }

  async function handlePlayVoiceMessage(item: VoiceMessage) {
    const src = resolveMediaUrl(item.audio_path) ?? item.audio_path;
    if (!src) {
      setMessage("当前语音文件地址无效。");
      return;
    }

    const currentPlayer = voiceMessagePlayerRef.current;
    if (currentPlayer && playingVoiceMessageId === item.id && !currentPlayer.paused) {
      currentPlayer.pause();
      currentPlayer.currentTime = 0;
      setPlayingVoiceMessageId(null);
      return;
    }

    if (currentPlayer) {
      currentPlayer.pause();
      currentPlayer.currentTime = 0;
    }

    const player = new Audio(src);
    voiceMessagePlayerRef.current = player;
    player.onended = () => setPlayingVoiceMessageId((current) => (current === item.id ? null : current));
    player.onerror = () => {
      setPlayingVoiceMessageId(null);
      setMessage("语音播放失败。");
    };

    try {
      await player.play();
      setPlayingVoiceMessageId(item.id);
    } catch (error) {
      setPlayingVoiceMessageId(null);
      setMessage(formatApiError(error, "语音播放失败。"));
    }
  }

  async function handleDownloadVoiceMessage(item: VoiceMessage) {
    const src = resolveMediaUrl(item.audio_path) ?? item.audio_path;
    if (!src) {
      setMessage("当前语音文件地址无效。");
      return;
    }

    if (downloadingVoiceMessageId === item.id) {
      return;
    }

    setDownloadingVoiceMessageId(item.id);
    setDownloadedVoiceMessageId(null);
    if (downloadFeedbackTimerRef.current !== null) {
      window.clearTimeout(downloadFeedbackTimerRef.current);
      downloadFeedbackTimerRef.current = null;
    }

    try {
      const response = await fetch(src, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        throw new Error(response.statusText || "Download failed");
      }

      const data = await response.arrayBuffer();
      const fileName = getVoiceMessageDownloadFileName(item);
      const result = await window.electronAPI?.saveVoiceMessage({
        directory: settings.downloadPath,
        fileName,
        data,
      });

      if (result?.path) {
        setMessage(`已下载语音到 ${result.path}`);
        setDownloadedVoiceMessageId(item.id);
        downloadFeedbackTimerRef.current = window.setTimeout(() => {
          setDownloadedVoiceMessageId((current) => (current === item.id ? null : current));
          downloadFeedbackTimerRef.current = null;
        }, 1800);
        return;
      }

      const url = URL.createObjectURL(new Blob([data], { type: item.mime_type ?? "audio/wav" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("已开始下载语音。");
      setDownloadedVoiceMessageId(item.id);
      downloadFeedbackTimerRef.current = window.setTimeout(() => {
        setDownloadedVoiceMessageId((current) => (current === item.id ? null : current));
        downloadFeedbackTimerRef.current = null;
      }, 1800);
    } catch (error) {
      setMessage(formatApiError(error, "语音下载失败。"));
    } finally {
      setDownloadingVoiceMessageId((current) => (current === item.id ? null : current));
    }
  }

  function stopSentenceRecorder() {
    void sentenceRecorderRef.current?.stop();
    sentenceRecorderRef.current = null;
    setLocalInputLevel(0);
  }

  function queueSentenceUpload(samples: Float32Array, sampleRate: number) {
    const activeToken = tokenRef.current;
    const activeChannelId = joinedChannelIdRef.current;
    const minSentenceSamples = Math.floor(sampleRate * 0.8);
    if (!activeToken || !activeChannelId) {
      setVadDebugStatus(
        `VAD upload blocked: token=${Boolean(activeToken)} channel=${Boolean(activeChannelId)} samples=${samples.length}`,
      );
      return;
    }
    if (samples.length < minSentenceSamples) {
      setVadDebugStatus(`VAD sentence dropped: too short (${Math.round((samples.length / sampleRate) * 1000)}ms)`);
      return;
    }

    const wavBlob = encodePcm16Wav(samples, sampleRate);
    const waveform = buildWaveform(samples);
    const durationMs = Math.max(1, Math.round((samples.length / sampleRate) * 1000));
    const clientMessageId = `voice-${activeChannelId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    uploadSentenceQueueRef.current = uploadSentenceQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        setVadDebugStatus(`VAD uploading: channel=${activeChannelId} durationMs=${durationMs}`);
        const uploaded = await uploadVoiceMessageAsset(
          {
            channelId: activeChannelId,
            durationMs,
            wavBlob,
            clientMessageId,
            waveform,
          },
          activeToken,
        );
        if (!uploaded) {
          setVadDebugStatus("VAD upload dropped by audio event");
          return;
        }

        if (voiceMessagesChannelIdRef.current !== activeChannelId) {
          setVadDebugStatus(`VAD upload success outside active channel: message=${uploaded.id}`);
          return;
        }

        const viewport = voiceMessagesViewportRef.current;
        const shouldApplyUpdate = !viewport || isViewportNearBottom(viewport);
        if (shouldApplyUpdate) {
          deferredVoiceMessagesRef.current = null;
          setVoiceMessages((current) => mergeVoiceMessages(current.filter((item) => item.channel_id === activeChannelId), [uploaded]));
          setVadDebugStatus(`VAD upload success: message=${uploaded.id}`);
          return;
        }

        const mergedDeferred = mergeVoiceMessages(
          deferredVoiceMessagesRef.current ?? latestVoiceMessagesRef.current.filter((item) => item.channel_id === activeChannelId),
          [uploaded],
        );
        deferredVoiceMessagesRef.current = mergedDeferred;
        setVadDebugStatus(`VAD upload success (deferred): message=${uploaded.id}`);
      })
      .catch((error) => {
        setVadDebugStatus(`VAD upload failed: ${formatApiError(error, "unknown error")}`);
        setMessage(formatApiError(error, "语音分句上传失败，请稍后重试。"));
      });
  }

  async function startSentenceRecorder(track: LocalAudioTrack) {
    stopSentenceRecorder();

    const mediaStreamTrack = track.mediaStreamTrack;
    if (!mediaStreamTrack) {
      setVadDebugStatus("VAD missing mediaStreamTrack");
      return;
    }

    const clonedTrack = mediaStreamTrack.clone();
    let stream: MediaStream | null = null;
    let stopped = false;
    let audioContext: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let processorNode: ScriptProcessorNode | null = null;
    let speechEvents: ReturnType<typeof hark> | null = null;
    let processedFrames = 0;
    let isSpeaking = false;
    let activeSamples: Float32Array[] = [];
    let preSpeechSamples: Float32Array[] = [];
    let preSpeechSampleCount = 0;
    let preSpeechSampleLimit = 0;
    let finalizeTimerId: number | null = null;
    const preSpeechMs = 300;
    const sentenceThreshold = -62;
    setVadDebugStatus("VAD sentence uploader init");
    const stopAudioStreamTracks = (activeStream: { getTracks: () => MediaStreamTrack[] } | null | undefined) => {
      activeStream?.getTracks().forEach((activeTrack) => activeTrack.stop());
    };
    const mergeBufferedSamples = (chunks: Float32Array[]) => {
      const totalSamples = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      if (!totalSamples) {
        return null;
      }
      const merged = new Float32Array(totalSamples);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      return merged;
    };
    const resetPreSpeechSamples = () => {
      preSpeechSamples = [];
      preSpeechSampleCount = 0;
    };
    const pushPreSpeechChunk = (chunk: Float32Array) => {
      if (!preSpeechSampleLimit) {
        return;
      }
      preSpeechSamples.push(chunk);
      preSpeechSampleCount += chunk.length;

      let extraSamples = preSpeechSampleCount - preSpeechSampleLimit;
      while (extraSamples > 0 && preSpeechSamples.length) {
        const firstChunk = preSpeechSamples[0];
        if (firstChunk.length <= extraSamples) {
          preSpeechSamples.shift();
          preSpeechSampleCount -= firstChunk.length;
          extraSamples -= firstChunk.length;
          continue;
        }

        preSpeechSamples[0] = firstChunk.slice(extraSamples);
        preSpeechSampleCount -= extraSamples;
        break;
      }
    };
    const finalizeSentence = () => {
      if (!isSpeaking && activeSamples.length === 0) {
        return;
      }
      if (finalizeTimerId !== null) {
        window.clearTimeout(finalizeTimerId);
        finalizeTimerId = null;
      }
      const chunks = activeSamples;
      activeSamples = [];
      isSpeaking = false;
      resetPreSpeechSamples();
      const merged = mergeBufferedSamples(chunks);
      if (!merged || !audioContext) {
        setVadDebugStatus("VAD speech end: empty");
        return;
      }
      setVadDebugStatus(`VAD speech end: samples=${merged.length}`);
      queueSentenceUpload(merged, audioContext.sampleRate);
    };

    try {
      if (!stream) {
        stream = new MediaStream([clonedTrack]);
      }
      audioContext = new AudioContext();
      preSpeechSampleLimit = Math.floor(audioContext.sampleRate * (preSpeechMs / 1000));
      setVadDebugStatus(`VAD audio context: ${audioContext.state}`);
      if (audioContext.state !== "running") {
        await audioContext.resume();
        setVadDebugStatus(`VAD audio context resumed: ${audioContext.state}`);
      }
      sourceNode = audioContext.createMediaStreamSource(stream);
      processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      processorNode.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        if (!input.length || selfMicMutedRef.current) {
          setLocalInputLevel(0);
          return;
        }
        const rms = computeRms(input);
        setLocalInputLevel(rms);
        processedFrames += 1;
        if (processedFrames === 1 || processedFrames % 20 === 0) {
          setVadDebugStatus(`VAD frames: ${processedFrames} speaking=${isSpeaking} rms=${rms.toFixed(4)}`);
        }
        const chunk = new Float32Array(input);
        if (!isSpeaking) {
          pushPreSpeechChunk(chunk);
        }
        if (isSpeaking) {
          activeSamples.push(chunk);
        }
      };
      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);
      speechEvents = hark(stream, {
        play: false,
        audioContext,
        threshold: sentenceThreshold,
        interval: 80,
      });
      speechEvents.on("speaking", () => {
        if (stopped || selfMicMutedRef.current) {
          return;
        }
        if (finalizeTimerId !== null) {
          window.clearTimeout(finalizeTimerId);
          finalizeTimerId = null;
        }
        if (!isSpeaking) {
          isSpeaking = true;
          activeSamples = [...preSpeechSamples];
          const sampleRate = audioContext?.sampleRate ?? 1;
          setVadDebugStatus(`VAD speech start: prebufferMs=${Math.round((preSpeechSampleCount / sampleRate) * 1000)}`);
        }
      });
      speechEvents.on("stopped_speaking", () => {
        if (stopped) {
          return;
        }
        if (!isSpeaking) {
          return;
        }
        setVadDebugStatus("VAD stop pending");
        finalizeTimerId = window.setTimeout(() => finalizeSentence(), 220);
      });
      setVadDebugStatus("VAD sentence uploader started");

      if (sentenceRecorderRef.current) {
        stopped = true;
        clonedTrack.stop();
        return;
      }
      sentenceRecorderRef.current = {
        stop: async () => {
          if (stopped) {
            return;
          }
          stopped = true;
          setLocalInputLevel(0);
          if (finalizeTimerId !== null) {
            window.clearTimeout(finalizeTimerId);
            finalizeTimerId = null;
          }
          finalizeSentence();
          speechEvents?.stop();
          processorNode?.disconnect();
          sourceNode?.disconnect();
          await audioContext?.close().catch(() => undefined);
          clonedTrack.stop();
          stopAudioStreamTracks(stream as { getTracks: () => MediaStreamTrack[] } | null);
          stream = null;
        },
      };
    } catch (error) {
      console.error("voice sentence uploader init failed", error);
      setVadDebugStatus(`VAD init failed: ${formatApiError(error, "unknown error")}`);
      setLocalInputLevel(0);
      setVoiceError(formatApiError(error, "语音分句上传初始化失败。"));
      setMessage(formatApiError(error, "语音分句上传初始化失败。"));
      if (finalizeTimerId !== null) {
        window.clearTimeout(finalizeTimerId);
      }
      speechEvents?.stop();
      processorNode?.disconnect();
      sourceNode?.disconnect();
      await audioContext?.close().catch(() => undefined);
      clonedTrack.stop();
      stopAudioStreamTracks(stream as { getTracks: () => MediaStreamTrack[] } | null);
      stream = null;
      throw error;
    }
  }

  useEffect(() => {
    if (!selectedDomainId || Object.prototype.hasOwnProperty.call(channelsByDomain, selectedDomainId) || !token) {
      return;
    }

    void loadChannels(selectedDomainId, token);
  }, [selectedDomainId, channelsByDomain, token]);

  useEffect(() => {
    if (!selectedDomainId || !token) {
      return;
    }

    const syncChannels = () => {
      void loadChannels(selectedDomainId, token, true);
    };

    const timerId = window.setInterval(syncChannels, 3000);
    return () => window.clearInterval(timerId);
  }, [selectedDomainId, token]);

  useEffect(() => {
    if (!selectedDomainId || !token) {
      return;
    }

    void loadDomainMembers(selectedDomainId, token);
  }, [selectedDomainId, token]);

  useEffect(() => {
    if (!selectedDomainId || !token) {
      return;
    }

    const timerId = window.setInterval(() => {
      void loadDomainMembers(selectedDomainId, token, true);
    }, 10000);

    return () => window.clearInterval(timerId);
  }, [selectedDomainId, token]);

  const sortedDomains = useMemo(
    () =>
      [...domains].sort(
        (left, right) =>
          new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime() || left.id.localeCompare(right.id),
      ),
    [domains],
  );
  const selectedDomain = useMemo(() => sortedDomains.find((domain) => domain.id === selectedDomainId) ?? null, [sortedDomains, selectedDomainId]);
  const selectedDomainMembers = useMemo(
    () => (selectedDomainId ? domainMembersByDomain[selectedDomainId] ?? [] : []),
    [domainMembersByDomain, selectedDomainId],
  );
  const selfDomainMember = useMemo(
    () => selectedDomainMembers.find((member) => member.userId === user?.id) ?? null,
    [selectedDomainMembers, user?.id],
  );
  const selectedDomainRole: DomainRole = selectedDomain?.create_id === user?.id ? "owner" : selfDomainMember?.role ?? "member";
  const selectedChannels = selectedDomainId ? channelsByDomain[selectedDomainId] ?? [] : [];
  const orderedChannels = useMemo(
    () =>
      [...selectedChannels].sort(
        (left, right) =>
          (left.sort_order ?? 0) - (right.sort_order ?? 0) ||
          new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime() ||
          left.id - right.id,
      ),
    [selectedChannels],
  );
  const selectedChannel = orderedChannels.find((channel) => channel.id === selectedChannelId) ?? null;
  const contextMenuChannel = orderedChannels.find((channel) => channel.id === channelContextMenu?.channelId) ?? null;
  const activeVoiceChannel = useMemo(
    () =>
      Object.values(channelsByDomain)
        .flat()
        .find((channel) => channel.id === joinedChannelId && channel.channel_type === "voice") ?? null,
    [channelsByDomain, joinedChannelId],
  );
  const joinedChannel = useMemo(
    () =>
      Object.values(channelsByDomain)
        .flat()
        .find((channel) => channel.id === joinedChannelId) ?? null,
    [channelsByDomain, joinedChannelId],
  );
  const conversationChannel = selectedChannel?.id === joinedChannelId ? (joinedChannel ?? selectedChannel) : null;
  const conversationChannelId = conversationChannel?.id ?? null;
  const conversationChannelType = conversationChannel?.channel_type ?? null;
  const connected = Boolean(activeVoiceChannel);
  const joinedVoiceCount = activeVoiceChannel?.id === joinedChannelId ? voiceParticipants.length : null;
  const domainMembers = useMemo(() => {
    const owner = selectedDomainMembers.filter((member) => member.role === "owner");
    const admins = selectedDomainMembers.filter((member) => member.role === "admin");
    const members = selectedDomainMembers.filter((member) => member.role === "member");

    return {
      owner,
      admins,
      members,
    };
  }, [selectedDomainMembers]);
  const voiceMessageNameByUserId = useMemo(
    () =>
      selectedDomainMembers.reduce<Record<string, string>>((accumulator, member) => {
        if (member.userId) {
          accumulator[member.userId] = member.domainNickname;
        }
        return accumulator;
      }, {}),
    [selectedDomainMembers],
  );
  const displayedVoiceMessages = useMemo(
    () =>
      voiceMessages.filter((item) => item.channel_id === conversationChannelId).sort(
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime() ||
          left.id - right.id,
      ),
    [conversationChannelId, voiceMessages],
  );
  const activeVoiceInputParticipants = useMemo(
    () => voiceParticipants.filter((participant) => participant.audioEnabled && participant.isSpeaking),
    [voiceParticipants],
  );
  const normalizedLocalInputLevel = Math.max(0, Math.min(1, localInputLevel * 42));
  const hasActiveVoiceInput = normalizedLocalInputLevel > 0.12 || activeVoiceInputParticipants.length > 0;
  const voiceInputIndicatorLabel = normalizedLocalInputLevel > 0.06
    ? `本地输入电平：${Math.round(localInputLevel * 1000)}`
    : activeVoiceInputParticipants.length > 0
      ? `输入中：${activeVoiceInputParticipants.map((participant) => participant.displayName).join("、")}`
      : "当前没有音频输入";
  useEffect(() => {
    voiceMessagesChannelIdRef.current = conversationChannelType === "text" ? null : conversationChannelId;
    setVoiceMessages([]);
    setVoiceMessagesLoading(false);
    pendingTranscriptionIdsRef.current.clear();
    deferredVoiceMessagesRef.current = null;
    voiceMessagesShouldStickToBottomRef.current = false;

    if (!conversationChannelId || !token || conversationChannelType === "text") {
      return;
    }

    void loadVoiceMessagesForChannel(conversationChannelId, token);
  }, [conversationChannelId, conversationChannelType, token]);

  useEffect(() => {
    if (!conversationChannelId || !token || conversationChannelType === "text") {
      return;
    }

    const timerId = window.setInterval(() => {
      void loadVoiceMessagesForChannel(conversationChannelId, token, true);
    }, 2500);

    return () => window.clearInterval(timerId);
  }, [conversationChannelId, conversationChannelType, token]);

  useEffect(() => {
    if (!voiceMessagesShouldStickToBottomRef.current || voiceMessagesLoading) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const viewport = voiceMessagesViewportRef.current;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
      voiceMessagesShouldStickToBottomRef.current = false;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [displayedVoiceMessages, voiceMessagesLoading]);

  useEffect(() => {
    const viewport = voiceMessagesViewportRef.current;
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      if (deferredVoiceMessagesRef.current && isViewportNearBottom(viewport)) {
        applyDeferredVoiceMessages();
      }
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [conversationChannelId, conversationChannelType]);
  const settingsNavItems = useMemo(
    () => [
      { key: "account" as const, group: "用户设置", label: "账号设置", iconUrl: USER_GLYPH_URL },
      { key: "audio" as const, group: "应用设置", label: "语言设置", iconUrl: MICROPHONE_URL },
      { key: "system" as const, group: "应用设置", label: "系统设置", iconUrl: GEAR_LIGHT_URL },
    ],
    [],
  );
  const domainSettingsNavItems = useMemo(
    () => [
      { key: "info" as const, label: "详细信息", iconUrl: INFO_LIGHT_URL },
      { key: "members" as const, label: "成员管理", iconUrl: USER_CIRCLE_GEAR_LIGHT_URL },
      { key: "danger" as const, label: "删除域", iconUrl: ERASER_LIGHT_URL, danger: true },
    ],
    [],
  );
  const activeSettingsItem = settingsNavItems.find((item) => item.key === settingsSection) ?? settingsNavItems[0];
  const activeDomainSettingsItem = domainSettingsNavItems.find((item) => item.key === domainSettingsSection) ?? domainSettingsNavItems[0];
  const domainMenuItems = useMemo<DomainMenuAction[]>(() => {
    if (selectedDomainRole === "owner") {
      return [
        { key: "domain-settings", label: "域设置" },
        { key: "create-channel", label: "创建频道" },
        { key: "domain-nickname", label: "我在本域的昵称" },
      ];
    }

    if (selectedDomainRole === "admin") {
      return [
        { key: "create-channel", label: "创建频道" },
        { key: "domain-nickname", label: "我在本域的昵称" },
        { key: "leave-domain", label: "退出域", danger: true },
      ];
    }

    return [
      { key: "domain-nickname", label: "我在本域的昵称" },
      { key: "leave-domain", label: "退出域", danger: true },
    ];
  }, [selectedDomainRole]);
  const selectedInputDeviceLabel = audioInputDevices.find((device) => device.id === settings.inputDevice)?.label ?? "未检测到输入设备";
  const selectedOutputDeviceLabel = audioOutputDevices.find((device) => device.id === settings.outputDevice)?.label ?? "未检测到输出设备";
  const settingsGroups = useMemo(
    () => [
      {
        title: "用户设置",
        items: settingsNavItems.filter((item) => item.group === "用户设置"),
      },
      {
        title: "应用设置",
        items: settingsNavItems.filter((item) => item.group === "应用设置"),
      },
    ],
    [settingsNavItems],
  );
  const tempMicPermissionLabel = useMemo(() => {
    switch (tempMicPermissionState) {
      case "granted":
        return "已授权";
      case "denied":
        return "已拒绝";
      case "unknown":
        return "未知";
      default:
        return "未请求";
    }
  }, [tempMicPermissionState]);
  const tempMicProbeLabel = useMemo(() => {
    switch (tempMicProbeState) {
      case "requesting":
        return "检测中";
      case "ready":
        return "已创建";
      case "failed":
        return "失败";
      default:
        return "未检测";
    }
  }, [tempMicProbeState]);

  useEffect(() => {
    if (!user) {
      setDomainMembersByDomain({});
      return;
    }

    setDomainMembersByDomain((current) => {
      const next: Record<string, DomainMemberRecord[]> = {};

      sortedDomains.forEach((domain) => {
        if (current[domain.id]) {
          next[domain.id] = current[domain.id];
        }
      });

      return next;
    });
  }, [sortedDomains, user]);

  useEffect(() => {
    setDomainInfoDraft({
      name: selectedDomain?.domain_name ?? "",
      avatar: selectedDomain ? domainAvatars[selectedDomain.id] ?? selectedDomain.avatar ?? null : null,
    });
    setDomainInfoMessage("");
  }, [domainAvatars, selectedDomain]);

  useEffect(() => {
    setDomainMenuOpen(false);
    setChannelContextMenu(null);
    setDomainIdCopied(false);
  }, [selectedDomainId]);

  useEffect(() => {
    if (domainSettingsOpen && !selectedDomain) {
      setDomainSettingsOpen(false);
    }
  }, [domainSettingsOpen, selectedDomain]);

  useEffect(() => {
    setUserIdCopied(false);
  }, [settingsSection, user?.id]);

  useEffect(() => {
    if (!domainMenuOpen && !channelContextMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setDomainMenuOpen(false);
        setChannelContextMenu(null);
        return;
      }

      if (target.closest(".domain-menu-anchor") || target.closest(".channel-context-menu")) {
        return;
      }

      setDomainMenuOpen(false);
      setChannelContextMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDomainMenuOpen(false);
        setChannelContextMenu(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [channelContextMenu, domainMenuOpen]);

  useEffect(() => {
    if (!settingsDeviceMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".settings-device-picker")) {
        return;
      }
      setSettingsDeviceMenu(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [settingsDeviceMenu]);

  useEffect(() => {
    if (!accountModal) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountModal(null);
        setAccountModalMessage("");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [accountModal]);

  useEffect(() => {
    if (settingsSection !== "audio" || typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    let cancelled = false;

    const syncDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) {
          return;
        }

        const inputDevices = devices
          .filter((device) => device.kind === "audioinput")
          .map((device, index) => ({
            id: device.deviceId,
            label: device.label || `输入设备 ${index + 1}`,
          }));
        const outputDevices = devices
          .filter((device) => device.kind === "audiooutput")
          .map((device, index) => ({
            id: device.deviceId,
            label: device.label || `输出设备 ${index + 1}`,
          }));

        setAudioInputDevices(inputDevices);
        setAudioOutputDevices(outputDevices);
        setSettings((current) => ({
          ...current,
          inputDevice: inputDevices.some((device) => device.id === current.inputDevice) ? current.inputDevice : (inputDevices[0]?.id ?? "default"),
          outputDevice: outputDevices.some((device) => device.id === current.outputDevice) ? current.outputDevice : (outputDevices[0]?.id ?? "default"),
        }));
      } catch {
        if (!cancelled) {
          setAudioInputDevices([]);
          setAudioOutputDevices([]);
        }
      }
    };

    void syncDevices();
    const handleDeviceChange = () => {
      void syncDevices();
    };
    navigator.mediaDevices.addEventListener?.("devicechange", handleDeviceChange);

    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, [settingsSection]);

  useEffect(() => {
    remoteAudioElementsRef.current.forEach((element, identity) => {
      void applyRemoteAudioElementState(identity, element);
    });
  }, [mutedPeers, peerVolumes, selfMonitorMuted, settings.monitorMix, settings.outputDevice]);

  useEffect(() => {
    if (!roomRef.current || voiceConnectionState !== "connected") {
      return;
    }

    const nextDeviceId = settings.inputDevice === "default" ? "default" : settings.inputDevice;
    roomRef.current
      .switchActiveDevice("audioinput", nextDeviceId)
      .then(() => {
        setTempAppliedInputDeviceLabel(selectedInputDeviceLabel);
      })
      .catch((error) => {
        setVoiceError(formatMediaAccessError(error));
      });
  }, [selectedInputDeviceLabel, settings.inputDevice, voiceConnectionState]);

  useEffect(() => {
    if (!localMicrophoneTrackRef.current) {
      return;
    }

    let cancelled = false;
    setNoiseFilterPending(true);

    const activeRoom = temporaryMicrophoneTrackRef.current ? null : roomRef.current;
    void prepareLocalMicrophoneTrack(activeRoom)
      .catch((error) => {
        if (!cancelled) {
          setVoiceError(formatMediaAccessError(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setNoiseFilterPending(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [settings.noiseSuppression]);

  useEffect(() => {
    return () => {
      void clearVoiceSessionState();
    };
  }, []);

  async function clearWorkspace(nextMessage = "") {
    await leaveCurrentChannel();
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setDomains([]);
    setDomainMembersByDomain({});
    setDomainAvatars({});
    setChannelsByDomain({});
    setSelectedDomainId(null);
    setSelectedChannelId(null);
    setJoinedChannelId(null);
    setSettingsOpen(false);
    setDomainSettingsOpen(false);
    setDomainSettingsSection("info");
    setDomainMenuOpen(false);
    setChannelContextMenu(null);
    setDomainEntryCardOpen(false);
    setCreateDomainModalOpen(false);
    setCreateDomainDraft(defaultDomainInfoDraft);
    setCreateDomainAvatarForm(defaultChangeAvatarForm);
    setCreateChannelModalOpen(false);
    setCreateChannelForm(defaultCreateChannelForm);
    setDomainNicknameModalOpen(false);
    setDomainNicknameDraft("");
    setDomainInfoDraft(defaultDomainInfoDraft);
    setDeleteDomainConfirmOpen(false);
    setDomainIdCopied(false);
    setUserIdCopied(false);
    setAccountModal(null);
    setAccountModalMessage("");
    setSettingsSection("account");
    setSelfMicMuted(false);
    setSelfMonitorMuted(false);
    setMutedPeers({});
    setLoginForm(defaultLoginForm);
    setRegisterForm(defaultRegisterForm);
    setResetForm(defaultResetPasswordForm);
    setChangeEmailForm(defaultChangeEmailForm);
    setChangeNameForm(defaultChangeNameForm);
    setChangeAvatarForm(defaultChangeAvatarForm);
    setMessage(nextMessage);
  }

  async function hydrateWorkspace(sessionToken: string) {
    try {
      const profile = await request<UserInfo>("/users/info", undefined, sessionToken);
      setToken(sessionToken);
      setUser(profile);
      settingsSyncReadyRef.current = false;
      localStorage.setItem(TOKEN_KEY, sessionToken);
      try {
        const remoteSettings = await request<UserSettingsResponse>("/users/settings", undefined, sessionToken);
        setSettings(normalizeSettings(remoteSettings.settings));
      } catch {
        setSettings(normalizeSettings(profile.voice_settings ?? loadStoredSettings()));
      }
      settingsSyncReadyRef.current = true;
      await loadDomains(sessionToken, profile);
      setAuthMode("login");
    } catch (error) {
      clearWorkspace(error instanceof Error ? error.message : "登录状态已失效，请重新登录。");
    }
  }

  async function loadDomains(sessionToken: string, profile: UserInfo) {
    try {
      const nextDomainPage = await request<{ total: number; domain_infos: Domain[] }>("/domains/get_domain_info_by_member_id", undefined, sessionToken);
      const nextDomains = nextDomainPage.domain_infos ?? [];
      setDomains(nextDomains);
      setSelectedDomainId(nextDomains[0]?.id ?? null);
      setChannelsByDomain({});
      setMessage(nextDomains.length ? `已同步 ${nextDomains.length} 个域。` : "当前账号下还没有域。");
    } catch (error) {
      setDomains([]);
      setChannelsByDomain({});
      setSelectedDomainId(null);
      setMessage(formatApiError(error, "域数据加载失败，请检查后端服务或登录状态。"));
    }
  }

  async function loadChannels(domainId: string, sessionToken: string, silent = false) {
    try {
      const channelPage = await request<{ total: number; channel_infos: Channel[] }>(`/channels/list_by_domain/${domainId}`, undefined, sessionToken);
      const channels = channelPage.channel_infos ?? [];
      setChannelsByDomain((current) => {
        const previous = current[domainId] ?? [];
        if (areChannelsEquivalent(previous, channels)) {
          return current;
        }
        return { ...current, [domainId]: channels };
      });
    } catch (error) {
      if (silent) {
        return;
      }

      setChannelsByDomain((current) => ({
        ...current,
        [domainId]: [],
      }));
      setMessage(formatApiError(error, "频道列表加载失败，请稍后重试。"));
    }
  }

  function getParticipantDisplayName(identity: string, fallbackName?: string, isSelf = false) {
    const domainMemberName = selectedDomainMembers.find((member) => member.userId === identity)?.domainNickname?.trim();
    if (domainMemberName) {
      return domainMemberName;
    }

    if (isSelf) {
      return selfDomainMember?.domainNickname?.trim() || user?.nick_name || fallbackName?.trim() || identity;
    }

    return fallbackName?.trim() || identity;
  }

  function getCurrentMicrophoneCaptureOptions() {
    return buildMicrophoneCaptureOptions(settings.inputDevice, settings.noiseSuppression);
  }

  function buildVoiceParticipant(participant: RemoteParticipant | Room["localParticipant"], isSelf: boolean): VoiceParticipant {
    const displayName = getParticipantDisplayName(participant.identity, participant.name, isSelf);
    const audioEnabled = isSelf ? !selfMicMuted : participant.isMicrophoneEnabled;
    return {
      identity: participant.identity,
      displayName,
      isSelf,
      isMuted: !audioEnabled,
      audioEnabled,
      isSpeaking: Boolean(participant.isSpeaking && audioEnabled),
    };
  }

  function syncVoiceParticipantsFromRoom(room: Room) {
    const nextParticipants: VoiceParticipant[] = [];
    if (room.localParticipant.identity) {
      nextParticipants.push(buildVoiceParticipant(room.localParticipant, true));
    }

    room.remoteParticipants.forEach((participant) => {
      nextParticipants.push(buildVoiceParticipant(participant, false));
    });

    setVoiceParticipants(nextParticipants);
  }

  async function applyRemoteAudioElementState(identity: string, element: HTMLAudioElement) {
    element.muted = selfMonitorMuted || Boolean(mutedPeers[identity]);
    element.volume = clampNumber((settings.monitorMix / 100) * ((peerVolumes[identity] ?? 76) / 100), 0, 1);

    if (!supportsSetSinkId(element)) {
      return;
    }

    try {
      await element.setSinkId(settings.outputDevice === "default" ? "" : settings.outputDevice);
    } catch {
      // Keep playback on the browser-selected default device if explicit output routing fails.
    }
  }

  async function attachRemoteParticipantAudio(identity: string, track: RemoteAudioTrack) {
    const existingElement = remoteAudioElementsRef.current.get(identity);
    if (existingElement) {
      existingElement.srcObject = null;
      existingElement.remove();
      remoteAudioElementsRef.current.delete(identity);
    }

    const element = attachRemoteAudioTrack(track);
    remoteAudioElementsRef.current.set(identity, element);
    await applyRemoteAudioElementState(identity, element);
    try {
      await element.play();
    } catch {
      // Autoplay can be blocked by the runtime; keep the element attached and let the user retry.
    }
  }

  function detachRemoteParticipantAudio(identity: string, track?: RemoteAudioTrack | null) {
    const element = remoteAudioElementsRef.current.get(identity);
    if (track) {
      detachRemoteAudioElements(track, element);
    } else if (element) {
      element.srcObject = null;
      element.remove();
    }
    remoteAudioElementsRef.current.delete(identity);
  }

  async function prepareLocalMicrophoneTrack(room: Room | null) {
    setJoinDebugStatus(room ? "Prepare mic: begin (room)" : "Prepare mic: begin (local)");
    const existingTrack = localMicrophoneTrackRef.current;
    if (existingTrack) {
      if (room) {
        await unpublishLocalMicrophoneTrack(room, existingTrack);
      }
      existingTrack.stop();
      localMicrophoneTrackRef.current = null;
    }

    const captureOptions = getCurrentMicrophoneCaptureOptions();
    try {
      setJoinDebugStatus("Prepare mic: requesting track");
      setTempMicProbeState("requesting");
      setTempMicProbeDetail("");
      const nextTrack = room
        ? await createPublishedMicrophoneTrack(room, captureOptions)
        : await createMicrophoneTrack(captureOptions);

      setJoinDebugStatus("Prepare mic: track ready");
      await syncLocalMicrophoneMute(nextTrack, selfMicMuted);
      localMicrophoneTrackRef.current = nextTrack;
      temporaryMicrophoneTrackRef.current = !room;
      if (room) {
        setJoinDebugStatus("Prepare mic: starting VAD");
        setVadDebugStatus("VAD starting from microphone");
        try {
          await startSentenceRecorder(nextTrack);
          setVadDebugStatus((current) => (current === "VAD starting from microphone" ? "VAD ready" : current));
        } catch (error) {
          const detail = formatApiError(error, "语音分句上传初始化失败。");
          console.warn("voice sentence recorder init failed", error);
          setVoiceError(`已加入语音房间，但自动分句上传不可用：${detail}`);
        }
      } else {
        setVadDebugStatus("VAD not started: no voice room");
        stopSentenceRecorder();
      }
      setTempMicPermissionState("granted");
      setTempMicProbeState("ready");
      setTempAppliedInputDeviceLabel(selectedInputDeviceLabel);
      setTempAppliedOutputDeviceLabel(selectedOutputDeviceLabel);
      setTempMicProbeDetail(room ? "本地麦克风轨已准备，待 LiveKit 房间发布验证。" : "本地麦克风轨已创建，可用于输入设备联调。");
      setJoinDebugStatus(room ? "Prepare mic: completed" : "Prepare mic: local-only completed");
      return nextTrack;
    } catch (error) {
      const detail = formatMediaAccessError(error);
      setJoinDebugStatus(`Prepare mic failed: ${detail}`);
      setTempMicPermissionState(error instanceof Error && error.name === "NotAllowedError" ? "denied" : "unknown");
      setTempMicProbeState("failed");
      setTempMicProbeDetail(detail);
      throw error;
    }
  }

  async function clearVoiceSessionState(nextState: VoiceConnectionState = "idle") {
    voiceDisconnectingRef.current = true;
    const room = roomRef.current;
    const localTrack = localMicrophoneTrackRef.current;

    localMicrophoneTrackRef.current = null;
    temporaryMicrophoneTrackRef.current = false;
    stopSentenceRecorder();

    if (localTrack) {
      await unpublishLocalMicrophoneTrack(room, localTrack);
      localTrack.stop();
    }

    if (room) {
      room.removeAllListeners();
      disconnectVoiceRoom(room);
    }

    roomRef.current = null;
    remoteAudioElementsRef.current.forEach((element) => {
      element.srcObject = null;
      element.remove();
    });
    remoteAudioElementsRef.current.clear();
    setLocalParticipantIdentity(null);
    setVoiceParticipants([]);
    setVoiceError("");
    setVoiceConnectionState(nextState);
    voiceDisconnectingRef.current = false;
  }

  // TEMP: removable voice verification helpers for local device testing before backend wiring is complete.
  async function runTemporaryMicrophoneProbe() {
    try {
      await prepareLocalMicrophoneTrack(null);
      setMessage("临时麦克风检测已完成。");
    } catch (error) {
      const detail = formatMediaAccessError(error);
      setVoiceError(detail);
      setMessage(detail);
    }
  }

  function stopTemporaryMicrophoneProbe() {
    if (!temporaryMicrophoneTrackRef.current) {
      setMessage("当前没有可停止的临时麦克风检测轨道。");
      return;
    }

    localMicrophoneTrackRef.current?.stop();
    localMicrophoneTrackRef.current = null;
    temporaryMicrophoneTrackRef.current = false;
    stopSentenceRecorder();
    setTempMicProbeState("idle");
    setTempMicProbeDetail("临时麦克风检测轨道已停止。");
    setMessage("已停止临时麦克风检测。");
  }

  function buildMockVoiceJoinResponse(channel: Channel): VoiceJoinResponse {
    const identityBase = user?.id ? `user-${user.id}` : "local-user";
    return {
      serverUrl: "wss://mock.livekit.local",
      token: `mock-token-${channel.id}`,
      roomName: `channel-${channel.id}`,
      participantIdentity: identityBase,
    };
  }

  async function joinVoiceChannel(channel: Channel): Promise<VoiceJoinResponse> {
    if (!token) {
      throw new Error("登录状态已失效，请重新登录。");
    }

    if (ENABLE_VOICE_JOIN_MOCK) {
      return buildMockVoiceJoinResponse(channel);
    }

    const response = await request<RawVoiceJoinResponse>(
      "/channels/livekit/token",
      {
        method: "POST",
        body: JSON.stringify({ channel_id: channel.id }),
      },
      token,
    );
    return normalizeVoiceJoinResponse(response);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = loginForm.email.trim();
    const pwd = loginForm.pwd.trim();

    if (!email) {
      setMessage("\u8bf7\u8f93\u5165\u90ae\u7bb1\u3002");
      return;
    }

    if (!isValidEmail(email)) {
      setMessage("\u8bf7\u8f93\u5165\u6b63\u786e\u7684\u90ae\u7bb1\u683c\u5f0f\u3002");
      return;
    }

    if (!pwd) {
      setMessage("\u8bf7\u8f93\u5165\u5bc6\u7801\u3002");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const auth = await request<AuthResponse>("/users/login", {
        method: "POST",
        body: JSON.stringify({ email, pwd }),
      });
      setToken(auth.token);
      setUser(auth.user_info);
      settingsSyncReadyRef.current = false;
      localStorage.setItem(TOKEN_KEY, auth.token);
      try {
        const remoteSettings = await request<UserSettingsResponse>("/users/settings", undefined, auth.token);
        setSettings(normalizeSettings(remoteSettings.settings));
      } catch {
        setSettings(normalizeSettings(auth.user_info.voice_settings ?? loadStoredSettings()));
      }
      settingsSyncReadyRef.current = true;
      await loadDomains(auth.token, auth.user_info);
    } catch (error) {
      setMessage(formatApiError(error, "\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nickName = registerForm.nick_name.trim();
    const email = registerForm.email.trim();
    const verificationCode = registerForm.verificationCode.trim();
    const pwd = registerForm.pwd.trim();
    const confirmPwd = registerForm.confirmPwd.trim();

    if (!nickName) {
      setMessage("\u8bf7\u8f93\u5165\u6635\u79f0\u3002");
      return;
    }

    if (!email) {
      setMessage("\u8bf7\u8f93\u5165\u90ae\u7bb1\u3002");
      return;
    }

    if (!isValidEmail(email)) {
      setMessage("\u8bf7\u8f93\u5165\u6b63\u786e\u7684\u90ae\u7bb1\u683c\u5f0f\u3002");
      return;
    }

    if (!verificationCode) {
      setMessage("\u8bf7\u8f93\u5165\u9a8c\u8bc1\u7801\u3002");
      return;
    }

    if (!pwd) {
      setMessage("\u8bf7\u8f93\u5165\u5bc6\u7801\u3002");
      return;
    }

    if (pwd.length < 6) {
      setMessage("\u5bc6\u7801\u957f\u5ea6\u4e0d\u80fd\u5c11\u4e8e 6 \u4f4d\u3002");
      return;
    }

    if (!confirmPwd) {
      setMessage("\u8bf7\u518d\u6b21\u8f93\u5165\u5bc6\u7801\u3002");
      return;
    }

    if (pwd !== confirmPwd) {
      setMessage("\u4e24\u6b21\u8f93\u5165\u7684\u5bc6\u7801\u4e0d\u4e00\u81f4\u3002");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const auth = await request<AuthResponse>("/users/register", {
        method: "POST",
        body: JSON.stringify({
          nick_name: nickName,
          email,
          verify_code: verificationCode,
          pwd,
        }),
      });
      setToken(auth.token);
      setUser(auth.user_info);
      settingsSyncReadyRef.current = false;
      localStorage.setItem(TOKEN_KEY, auth.token);
      setSettings(normalizeSettings(auth.user_info.voice_settings ?? loadStoredSettings()));
      settingsSyncReadyRef.current = true;
      setRegisterForm(defaultRegisterForm);
      await loadDomains(auth.token, auth.user_info);
    } catch (error) {
      setMessage(formatApiError(error, "\u6ce8\u518c\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendCode(email: string) {
    await handleSendCodeFeedback(email, setMessage);
  }

  async function loadDomainMembers(domainId: string, sessionToken: string, silent = false) {
    try {
      const pageSize = 100;
      let currentPage = 1;
      let total = 0;
      const allMembers: DomainMemberInfo[] = [];

      do {
        const memberPage = await request<{ total: number; domain_infos: DomainMemberInfo[] }>(
          `/domains/get_domain_member_infos?current_page=${currentPage}&page_size=${pageSize}`,
          {
            method: "POST",
            body: JSON.stringify({ domain_id: domainId }),
          },
          sessionToken,
        );
        const pageMembers = memberPage.domain_infos ?? [];
        total = memberPage.total ?? pageMembers.length;
        allMembers.push(...pageMembers);

        if (!pageMembers.length) {
          break;
        }

        currentPage += 1;
      } while (allMembers.length < total);

      const members = allMembers.map(mapDomainMemberRecord);
      setDomainMembersByDomain((current) => ({ ...current, [domainId]: members }));
    } catch (error) {
      if (silent) {
        return;
      }

      setDomainMembersByDomain((current) => ({
        ...current,
        [domainId]: [],
      }));
      setMessage(formatApiError(error, "域成员列表加载失败，请稍后重试。"));
    }
  }

  async function searchJoinableDomains(keyword: string, sessionToken: string) {
    const query = keyword.trim();
    if (!query) {
      setJoinDomainResults([]);
      setJoinDomainSearched(true);
      return;
    }

    try {
      const result = await request<{ total: number; domain_infos: Domain[] }>(
        "/domains/",
        {
          method: "POST",
          body: JSON.stringify({
            id: query.length === 8 ? query : null,
            domain_name: query,
          }),
        },
        sessionToken,
      );
      setJoinDomainResults(result.domain_infos ?? []);
    } catch (error) {
      setJoinDomainResults([]);
      setMessage(formatApiError(error, "域搜索失败，请稍后重试。"));
    } finally {
      setJoinDomainSearched(true);
    }
  }

  async function handleSendCodeFeedback(email: string, setFeedback: (value: string) => void) {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setFeedback("\u8bf7\u5148\u8f93\u5165\u90ae\u7bb1\uff0c\u518d\u53d1\u9001\u9a8c\u8bc1\u7801\u3002");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setFeedback("\u8bf7\u8f93\u5165\u6b63\u786e\u7684\u90ae\u7bb1\u683c\u5f0f\u3002");
      return;
    }

    try {
      await request<null>(`/email/send/get_verify_code?email=${encodeURIComponent(normalizedEmail)}&name=user`);
      setFeedback("\u9a8c\u8bc1\u7801\u5df2\u53d1\u9001\uff0c\u8bf7\u67e5\u6536\u90ae\u7bb1\u3002");
    } catch (error) {
      setFeedback(formatApiError(error, "\u9a8c\u8bc1\u7801\u53d1\u9001\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"));
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = resetForm.email.trim();
    const verificationCode = resetForm.verificationCode.trim();
    const pwd = resetForm.pwd.trim();
    const confirmPwd = resetForm.confirmPwd.trim();

    if (!email) {
      setAccountModalMessage("\u8bf7\u8f93\u5165\u90ae\u7bb1\u3002");
      return;
    }

    if (!isValidEmail(email)) {
      setAccountModalMessage("\u8bf7\u8f93\u5165\u6b63\u786e\u7684\u90ae\u7bb1\u683c\u5f0f\u3002");
      return;
    }

    if (!verificationCode) {
      setAccountModalMessage("\u8bf7\u8f93\u5165\u9a8c\u8bc1\u7801\u3002");
      return;
    }

    if (!pwd) {
      setAccountModalMessage("\u8bf7\u8f93\u5165\u65b0\u5bc6\u7801\u3002");
      return;
    }

    if (pwd.length < 6) {
      setAccountModalMessage("\u5bc6\u7801\u957f\u5ea6\u4e0d\u80fd\u5c11\u4e8e 6 \u4f4d\u3002");
      return;
    }

    if (!confirmPwd) {
      setAccountModalMessage("\u8bf7\u518d\u6b21\u8f93\u5165\u65b0\u5bc6\u7801\u3002");
      return;
    }

    if (pwd !== confirmPwd) {
      setAccountModalMessage("\u4e24\u6b21\u8f93\u5165\u7684\u5bc6\u7801\u4e0d\u4e00\u81f4\u3002");
      return;
    }

    setIsSubmitting(true);
    setAccountModalMessage("");

    try {
      await request<null>("/users/find_password", {
        method: "PUT",
        body: JSON.stringify({
          email: { name: "user", email },
          verify_code: verificationCode,
          new_password: pwd,
        }),
      });
      setResetForm(defaultResetPasswordForm);
      setAuthMode("login");
      setAccountModalMessage("\u5bc6\u7801\u5df2\u91cd\u7f6e\uff0c\u8bf7\u4f7f\u7528\u65b0\u5bc6\u7801\u767b\u5f55\u3002");
      setMessage("\u5bc6\u7801\u5df2\u91cd\u7f6e\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002");
    } catch (error) {
      setAccountModalMessage(formatApiError(error, "\u4fee\u6539\u5bc6\u7801\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleChangeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      return;
    }

    const currentEmail = changeEmailForm.currentEmail.trim();
    const currentVerificationCode = changeEmailForm.currentVerificationCode.trim();
    const nextEmail = changeEmailForm.nextEmail.trim();
    const nextVerificationCode = changeEmailForm.nextVerificationCode.trim();

    if (!currentEmail) {
      setAccountModalMessage("\u8bf7\u8f93\u5165\u539f\u90ae\u7bb1\u3002");
      return;
    }

    if (!isValidEmail(currentEmail)) {
      setAccountModalMessage("\u8bf7\u8f93\u5165\u6b63\u786e\u7684\u539f\u90ae\u7bb1\u683c\u5f0f\u3002");
      return;
    }

    if (currentEmail !== user.email) {
      setAccountModalMessage("\u539f\u90ae\u7bb1\u5fc5\u987b\u4e0e\u5f53\u524d\u7ed1\u5b9a\u90ae\u7bb1\u4e00\u81f4\u3002");
      return;
    }

    if (!currentVerificationCode) {
      setAccountModalMessage("\u8bf7\u8f93\u5165\u539f\u90ae\u7bb1\u9a8c\u8bc1\u7801\u3002");
      return;
    }

    if (!nextEmail) {
      setAccountModalMessage("\u8bf7\u8f93\u5165\u65b0\u90ae\u7bb1\u3002");
      return;
    }

    if (!isValidEmail(nextEmail)) {
      setAccountModalMessage("\u8bf7\u8f93\u5165\u6b63\u786e\u7684\u65b0\u90ae\u7bb1\u683c\u5f0f\u3002");
      return;
    }

    if (nextEmail === currentEmail) {
      setAccountModalMessage("\u65b0\u90ae\u7bb1\u4e0d\u80fd\u4e0e\u539f\u90ae\u7bb1\u76f8\u540c\u3002");
      return;
    }

    if (!nextVerificationCode) {
      setAccountModalMessage("\u8bf7\u8f93\u5165\u65b0\u90ae\u7bb1\u9a8c\u8bc1\u7801\u3002");
      return;
    }

    setIsSubmitting(true);
    setAccountModalMessage("");

    try {
      if (!token) {
        throw new Error("登录状态已失效，请重新登录。");
      }
      const nextUser = await request<UserInfo>(
        "/users/change_email",
        {
          method: "PUT",
          body: JSON.stringify({
            current_email: currentEmail,
            current_verify_code: currentVerificationCode,
            new_email: nextEmail,
            new_verify_code: nextVerificationCode,
          }),
        },
        token,
      );
      setUser(nextUser);
      setChangeEmailForm(defaultChangeEmailForm);
      setAccountModalMessage("\u90ae\u7bb1\u5df2\u66f4\u65b0\u3002");
      setMessage("\u90ae\u7bb1\u5df2\u66f4\u65b0\u3002");
    } catch (error) {
      setAccountModalMessage(formatApiError(error, "\u4fee\u6539\u90ae\u7bb1\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleChangeName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      return;
    }

    const nickName = changeNameForm.nickName.trim();

    if (!nickName) {
      setAccountModalMessage("\u8bf7\u8f93\u5165\u65b0\u7684\u6635\u79f0\u3002");
      return;
    }

    if (nickName.length < 2) {
      setAccountModalMessage("\u6635\u79f0\u957f\u5ea6\u4e0d\u80fd\u5c11\u4e8e 2 \u4f4d\u3002");
      return;
    }

    if (nickName === user.nick_name) {
      setAccountModalMessage("\u65b0\u6635\u79f0\u4e0e\u5f53\u524d\u6635\u79f0\u76f8\u540c\u3002");
      return;
    }

    setIsSubmitting(true);
    setAccountModalMessage("");

    try {
      if (!token) {
        throw new Error("登录状态已失效，请重新登录。");
      }
      const nextUser = await request<UserInfo>(
        "/users/update",
        {
          method: "PUT",
          body: JSON.stringify({ nick_name: nickName }),
        },
        token,
      );
      setUser(nextUser);
      setAccountModalMessage("\u540d\u79f0\u5df2\u66f4\u65b0\u3002");
      setMessage("\u540d\u79f0\u5df2\u66f4\u65b0\u3002");
    } catch (error) {
      setAccountModalMessage(formatApiError(error, "\u6635\u79f0\u66f4\u65b0\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleChangeAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      return;
    }

    if (!changeAvatarForm.source) {
      if (!token) {
        setAccountModalMessage("\u767b\u5f55\u72b6\u6001\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002");
        return;
      }
      try {
        const nextUser = await request<UserInfo>(
          "/users/update",
          {
            method: "PUT",
            body: JSON.stringify({ avatar: null }),
          },
          token,
        );
        setUser(nextUser);
        setAccountModalMessage("\u5934\u50cf\u5df2\u6e05\u7a7a\u3002");
        setMessage("\u5934\u50cf\u5df2\u6e05\u7a7a\u3002");
      } catch (error) {
        setAccountModalMessage(formatApiError(error, "\u5934\u50cf\u66f4\u65b0\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"));
      }
      return;
    }

    setIsSubmitting(true);
    setAccountModalMessage("");

    try {
      const croppedAvatar = await renderCroppedAvatar(
        changeAvatarForm.source,
        changeAvatarForm.zoom,
        changeAvatarForm.offsetX,
        changeAvatarForm.offsetY,
      );
      if (!token) {
        throw new Error("登录状态已失效，请重新登录。");
      }
      const nextAvatar = await uploadAvatarAsset(croppedAvatar, "user", token);
      const nextUser = await request<UserInfo>(
        "/users/update",
        {
          method: "PUT",
          body: JSON.stringify({ avatar: nextAvatar }),
        },
        token,
      );
      setChangeAvatarForm((current) => ({ ...current, avatar: nextAvatar }));
      setUser(nextUser);
      setAccountModalMessage("\u5934\u50cf\u5df2\u66f4\u65b0\u3002");
      setMessage("\u5934\u50cf\u5df2\u66f4\u65b0\u3002");
    } catch (error) {
      setAccountModalMessage(formatApiError(error, error instanceof Error ? error.message : "\u5934\u50cf\u5904\u7406\u5931\u8d25\u3002"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleChooseAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const source = await readFileAsDataUrl(file);
      const image = await loadImage(source);
      setChangeAvatarForm({
        source,
        avatar: changeAvatarForm.avatar,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        fileName: file.name,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
      });
      setAccountModalMessage("");
    } catch {
      setAccountModalMessage("\u672c\u5730\u56fe\u7247\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002");
    } finally {
      event.target.value = "";
    }
  }

  function logout() {
    settingsSyncReadyRef.current = false;
    clearWorkspace("已退出登录。");
    setAuthMode("login");
  }

  function openResetPasswordModal() {
    if (!user) {
      return;
    }

    setResetForm({
      email: user.email,
      verificationCode: "",
      pwd: "",
      confirmPwd: "",
    });
    setAccountModalMessage("");
    setAccountModal("password");
  }

  function openChangeEmailModal() {
    if (!user) {
      return;
    }

    setChangeEmailForm({
      currentEmail: user.email,
      currentVerificationCode: "",
      nextEmail: "",
      nextVerificationCode: "",
    });
    setAccountModalMessage("");
    setAccountModal("email");
  }

  function openChangeNameModal() {
    if (!user) {
      return;
    }

    setChangeNameForm({
      nickName: user.nick_name,
    });
    setAccountModalMessage("");
    setAccountModal("name");
  }

  function openChangeAvatarModal() {
    if (!user) {
      return;
    }

    setChangeAvatarForm({
      source: user.avatar,
      avatar: user.avatar,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      fileName: "",
      imageWidth: 0,
      imageHeight: 0,
    });
    setAccountModalMessage("");
    setAccountModal("avatar");
    if (user.avatar) {
      void loadImage(user.avatar)
        .then((image) => {
          setChangeAvatarForm((current) => {
            if (current.source !== user.avatar) {
              return current;
            }

            return {
              ...current,
              imageWidth: image.naturalWidth,
              imageHeight: image.naturalHeight,
            };
          });
        })
        .catch(() => undefined);
    }
  }

  function openDomainAvatarModal() {
    if (!selectedDomain) {
      return;
    }

    const currentAvatar = domainInfoDraft.avatar;
    setDomainAvatarForm({
      source: currentAvatar,
      avatar: currentAvatar,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      fileName: "",
      imageWidth: 0,
      imageHeight: 0,
    });
    setDomainAvatarMessage("");
    setDomainAvatarModalOpen(true);
    if (currentAvatar) {
      void loadImage(currentAvatar)
        .then((image) => {
          setDomainAvatarForm((current) => {
            if (current.source !== currentAvatar) {
              return current;
            }

            return {
              ...current,
              imageWidth: image.naturalWidth,
              imageHeight: image.naturalHeight,
            };
          });
        })
        .catch(() => undefined);
    }
  }

  function closeDomainAvatarModal() {
    setDomainAvatarModalOpen(false);
    setDomainAvatarMessage("");
    setDomainAvatarForm(defaultChangeAvatarForm);
  }

  function closeAccountModal() {
    setAccountModal(null);
    setAccountModalMessage("");
  }

  function openDomainEntryCard() {
    setDomainEntryCardOpen(true);
    setDomainMenuOpen(false);
  }

  function closeDomainEntryCard() {
    setDomainEntryCardOpen(false);
    setJoinDomainQuery("");
    setJoinDomainSearched(false);
    setJoinDomainResults([]);
  }

  function openCreateDomainModal() {
    closeDomainEntryCard();
    setCreateDomainDraft(defaultDomainInfoDraft);
    setCreateDomainAvatarForm(defaultChangeAvatarForm);
    setCreateDomainModalOpen(true);
  }

  function closeCreateDomainModal() {
    setCreateDomainModalOpen(false);
    setCreateDomainDraft(defaultDomainInfoDraft);
    setCreateDomainAvatarForm(defaultChangeAvatarForm);
    setCreateDomainError("");
  }

  async function handleLeaveChannel() {
    const channelId = joinedChannelId;
    await leaveCurrentChannel();
    if (token && selectedDomainId && channelId) {
      void loadChannels(selectedDomainId, token);
    }
    setMessage("已离开当前语音会话。");
  }

  function closeCreateChannelModal() {
    setCreateChannelModalOpen(false);
    setCreateChannelForm(defaultCreateChannelForm);
    setCreateChannelError("");
  }

  function closeDomainNicknameModal() {
    setDomainNicknameModalOpen(false);
    setDomainNicknameDraft("");
  }

  function closeDomainSettings() {
    setDomainSettingsOpen(false);
    setDomainSettingsSection("info");
    setDeleteDomainConfirmOpen(false);
    closeDomainAvatarModal();
  }

  async function removeDomainFromWorkspace(domainId: string, successMessage: string) {
    await leaveCurrentChannel();
    const nextDomains = domains.filter((domain) => domain.id !== domainId);
    const nextSelectedDomainId = sortedDomains.find((domain) => domain.id !== domainId)?.id ?? null;

    setDomains(nextDomains);
    setChannelsByDomain((current) => omitRecordKey(current, domainId));
    setDomainMembersByDomain((current) => omitRecordKey(current, domainId));
    setDomainAvatars((current) => omitRecordKey(current, domainId));
    setSelectedDomainId(nextSelectedDomainId);
    setSelectedChannelId(null);
    setJoinedChannelId(null);
    setDomainMenuOpen(false);
    setChannelContextMenu(null);
    closeCreateDomainModal();
    closeCreateChannelModal();
    closeDomainNicknameModal();
    closeDomainSettings();
    setMessage(successMessage);
  }

  function handleCreateDomain() {
    if (!user) {
      return;
    }

    const now = new Date().toISOString();
    const domainId = String(Date.now());
    const count = domains.length + 1;
    const domain: Domain = {
      id: domainId,
      create_id: user.id,
      domain_name: `新域 ${count}`,
      slug: `workspace-${count}`,
      description: "新创建的域。",
      is_public: true,
      created_at: now,
      updated_at: now,
    };

    setDomains((current) => [domain, ...current]);
    setChannelsByDomain((current) => ({
      ...current,
      [domainId]: [],
    }));
    if (token) {
      void loadDomainMembers(domain.id, token);
    }
    setSelectedDomainId(domainId);
    setSelectedChannelId(null);
    setJoinedChannelId(null);
    setMessage(`已创建域 ${domain.domain_name}。`);
  }

  function handleCreateDomainFromCard() {
    openCreateDomainModal();
  }

  async function handleSubmitCreateDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      return;
    }

    const nextName = createDomainDraft.name.trim();
    if (!nextName) {
      setCreateDomainError("请输入域名。");
      setMessage("请输入域名。");
      return;
    }

    setCreateDomainError("");
    setIsSubmitting(true);

    let nextAvatar: string | null = null;
    try {
      const source = createDomainAvatarForm.source;
      if (source) {
        const croppedAvatar = await renderCroppedAvatar(
          source,
          createDomainAvatarForm.zoom,
          createDomainAvatarForm.offsetX,
          createDomainAvatarForm.offsetY,
        );
        if (!token) {
          throw new Error("登录状态已失效，请重新登录。");
        }
        nextAvatar = await uploadAvatarAsset(croppedAvatar, "domain", token);
      }
    } catch (error) {
      setMessage(formatApiError(error, "域头像处理失败，请重试。"));
      setIsSubmitting(false);
      return;
    }

    try {
      if (!token) {
        throw new Error("登录状态已失效，请重新登录。");
      }
      const domain = await request<Domain>(
        "/domains/create_domain",
        {
          method: "POST",
          body: JSON.stringify({
            avatar: nextAvatar,
            domain_name: nextName,
            description: `${nextName} 工作区`,
            is_public: true,
          }),
        },
        token,
      );

      setDomains((current) => [domain, ...current.filter((item) => item.id !== domain.id)]);
      setChannelsByDomain((current) => ({ ...current, [domain.id]: [] }));
      void loadDomainMembers(domain.id, token);
      setDomainAvatars((current) => ({ ...current, [domain.id]: nextAvatar ?? domain.avatar ?? null }));
      setSelectedDomainId(domain.id);
      setSelectedChannelId(null);
      setJoinedChannelId(null);
      closeCreateDomainModal();
      setMessage(`已创建域 ${domain.domain_name}。`);
    } catch (error) {
      setCreateDomainError(formatApiError(error, "创建域失败，请稍后重试。"));
      setMessage(formatApiError(error, "创建域失败，请稍后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleChooseCreateDomainAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const source = await readFileAsDataUrl(file);
      const image = await loadImage(source);
      setCreateDomainAvatarForm({
        source,
        avatar: null,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        fileName: file.name,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
      });
      setMessage("");
    } catch {
      setMessage("域头像读取失败，请稍后重试。");
    } finally {
      event.target.value = "";
    }
  }

  async function handleSearchJoinDomain() {
    if (!token) {
      setMessage("登录状态已失效，请重新登录。");
      return;
    }
    await searchJoinableDomains(joinDomainQuery, token);
  }

  function handleClearJoinDomainQuery() {
    setJoinDomainQuery("");
    setJoinDomainSearched(false);
    setJoinDomainResults([]);
  }

  async function handleJoinDomain(domain: Domain) {
    if (!token || !user) {
      setMessage("登录状态已失效，请重新登录。");
      return;
    }

    if (!domains.some((item) => item.id === domain.id)) {
      try {
        await request<null>(`/domains/join_domain/${domain.id}`, undefined, token);
      } catch (error) {
        setMessage(formatApiError(error, "加入域失败，请稍后重试。"));
        return;
      }
    }

    await loadDomains(token, user);
    await leaveCurrentChannel();
    setSelectedDomainId(domain.id);
    setSelectedChannelId(null);
    setJoinedChannelId(null);
    setMessage(`已切换到域 ${domain.domain_name}。`);
    closeDomainEntryCard();
  }

  function handleOpenDomain(domainId: string) {
    setSelectedDomainId(domainId);
    setChannelContextMenu(null);
    setDomainMenuOpen(false);
  }

  function handleSelectChannel(_channel: Channel) {
    return;
  }

  async function handleJoinChannel(channel: Channel) {
    if (joinFlowActiveRef.current) {
      return;
    }

    joinFlowActiveRef.current = true;
    setSelectedChannelId(channel.id);
    setChannelContextMenu(null);
    const wasJoinedToTargetChannel = joinedChannelId === channel.id;

    try {
      if (channel.channel_type === "voice") {
        if (wasJoinedToTargetChannel && voiceConnectionState === "connected") {
          return;
        }

        setVoiceError("");
        setVoiceConnectionState("joining");
        setJoinDebugStatus("Join voice: begin");
        setVadDebugStatus("VAD idle");

      try {
        if (joinedChannelId && joinedChannelId !== channel.id) {
          await leaveCurrentChannel({ nextState: "joining" });
        }

        const joinSession = await joinVoiceChannel(channel);
        window.electronAPI?.logDiagnostic("LiveKit join session", {
          channelId: channel.id,
          channelName: channel.channel_name,
          serverUrl: joinSession.serverUrl,
          roomName: joinSession.roomName,
          participantIdentity: joinSession.participantIdentity,
        });
        await clearVoiceSessionState();

        if (ENABLE_VOICE_JOIN_MOCK) {
          await prepareLocalMicrophoneTrack(null);
          setLocalParticipantIdentity(joinSession.participantIdentity);
          setVoiceParticipants([
            {
              identity: joinSession.participantIdentity,
              displayName: getParticipantDisplayName(joinSession.participantIdentity, joinSession.participantName, true),
              isSelf: true,
              isMuted: selfMicMuted,
              audioEnabled: !selfMicMuted,
              isSpeaking: false,
            },
          ]);
          setVoiceConnectionState("connected");
          setJoinedChannelId(channel.id);
          joinedChannelIdRef.current = channel.id;
          void playChannelJoinSound(settings);
          if (selectedDomain && token) {
            await loadChannels(selectedDomain.id, token);
          }
          setMessage(`已为 ${channel.channel_name} 准备本地语音入会数据，等待后端联调。`);
          return;
        }

        if (!joinSession.serverUrl || !joinSession.token) {
          throw new Error("语音入会接口返回缺少 serverUrl 或 token。");
        }

        setJoinDebugStatus("Join voice: creating room");
        const room = createVoiceRoom();
        roomRef.current = room;

        room
          .on(RoomEvent.ParticipantConnected, (participant) => {
            syncVoiceParticipantsFromRoom(room);
            participant.audioTrackPublications.forEach((publication) => {
              const track = publication.track;
              if (track?.kind === Track.Kind.Audio) {
                void attachRemoteParticipantAudio(participant.identity, track as RemoteAudioTrack);
              }
            });
          })
          .on(RoomEvent.ParticipantDisconnected, (participant) => {
            detachRemoteParticipantAudio(participant.identity);
            syncVoiceParticipantsFromRoom(room);
          })
          .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
            if (track.kind === Track.Kind.Audio) {
              void attachRemoteParticipantAudio(participant.identity, track as RemoteAudioTrack);
            }
            syncVoiceParticipantsFromRoom(room);
          })
          .on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
            if (track.kind === Track.Kind.Audio) {
              detachRemoteParticipantAudio(participant.identity, track as RemoteAudioTrack);
            }
            syncVoiceParticipantsFromRoom(room);
          })
          .on(RoomEvent.Reconnecting, () => {
            setVoiceConnectionState("reconnecting");
            setJoinDebugStatus("Join voice: reconnecting");
          })
          .on(RoomEvent.Reconnected, () => {
            setVoiceConnectionState("connected");
            setJoinDebugStatus("Join voice: reconnected");
            syncVoiceParticipantsFromRoom(room);
          })
          .on(RoomEvent.ActiveSpeakersChanged, () => {
            syncVoiceParticipantsFromRoom(room);
          })
          .on(RoomEvent.Disconnected, () => {
            if (voiceDisconnectingRef.current) {
              return;
            }
            void leaveCurrentChannel({ nextState: "disconnected" });
            if (selectedDomain && token) {
              void loadChannels(selectedDomain.id, token);
            }
            setJoinedChannelId(null);
            setMessage("语音连接已断开。");
            setJoinDebugStatus("Join voice: disconnected");
          });

        setJoinDebugStatus("Join voice: connecting room");
        await room.connect(joinSession.serverUrl, joinSession.token);
        setJoinDebugStatus("Join voice: room connected");
        await prepareLocalMicrophoneTrack(room);
        setLocalParticipantIdentity(joinSession.participantIdentity || room.localParticipant.identity);
        syncVoiceParticipantsFromRoom(room);
        setVoiceConnectionState("connected");
        setJoinedChannelId(channel.id);
        joinedChannelIdRef.current = channel.id;
        void playChannelJoinSound(settings);
        setJoinDebugStatus("Join voice: ready");
        if (selectedDomain && token) {
          await loadChannels(selectedDomain.id, token);
        }
        setMessage(`已连接到 ${channel.channel_name} 的语音房间。`);
      } catch (error) {
        await clearVoiceSessionState();
        if (token && !wasJoinedToTargetChannel) {
          await requestLeaveChannel(channel.id, token);
          if (selectedDomain) {
            await loadChannels(selectedDomain.id, token).catch(() => undefined);
          }
        }
        setJoinedChannelId(null);
        setVoiceConnectionState("failed");
        setJoinDebugStatus(`Join voice failed: ${formatApiError(error, "unknown error")}`);
        setVoiceError(formatApiError(error, "语音频道入会信息获取失败。"));
        setMessage(formatApiError(error, "语音频道入会信息获取失败。"));
      }

      return;
    }

    await leaveCurrentChannel();
    setJoinedChannelId(channel.id);
    joinedChannelIdRef.current = channel.id;
    void playChannelJoinSound(settings);
    setMessage(`已进入文字频道 ${channel.channel_name}。`);
    } finally {
      joinFlowActiveRef.current = false;
    }
  }

  async function handleCopyDomainId() {
    if (!selectedDomain) {
      return;
    }

    const formattedDomainId = formatDomainId(selectedDomain.id);

    try {
      await navigator.clipboard.writeText(formattedDomainId);
      setDomainIdCopied(true);
      setMessage(`已复制域 ID：${formattedDomainId}`);
      window.setTimeout(() => setDomainIdCopied(false), 1400);
    } catch {
      setMessage("\u590d\u5236\u57df ID \u5931\u8d25\u3002");
    }
  }

  async function handleCopyUserId() {
    if (!user) {
      return;
    }

    try {
      await navigator.clipboard.writeText(String(user.id));
      setUserIdCopied(true);
      setMessage("用户 ID 已复制。");
    } catch {
      setMessage("复制用户 ID 失败，请稍后重试。");
    }
  }

  function rangeProgressStyle(value: number): CSSProperties {
    return { "--range-progress": `${value}%` } as CSSProperties;
  }

  function openCreateChannelModal() {
    if (!selectedDomain || selectedDomainRole === "member") {
      return;
    }

    setCreateChannelForm(defaultCreateChannelForm);
    setCreateChannelModalOpen(true);
    setDomainMenuOpen(false);
  }

  function openDomainNicknameModal() {
    if (!selectedDomain || !user) {
      return;
    }

    setDomainNicknameDraft(selfDomainMember?.domainNickname ?? user.nick_name);
    setDomainNicknameModalOpen(true);
    setDomainMenuOpen(false);
  }

  function openDomainSettings() {
    if (!selectedDomain || selectedDomainRole !== "owner") {
      return;
    }

    setDomainSettingsSection("info");
    setDomainSettingsOpen(true);
    setSettingsOpen(false);
    setDomainMenuOpen(false);
  }

  async function handleLeaveDomain() {
    if (!selectedDomain || !token || !user) {
      return;
    }

    try {
      await request<null>(`/domains/leave_domain/${selectedDomain.id}`, undefined, token);
      removeDomainFromWorkspace(selectedDomain.id, `已退出域 ${selectedDomain.domain_name}。`);
    } catch (error) {
      setMessage(formatApiError(error, "退出域失败，请稍后重试。"));
    }
  }

  function handleDomainMenuAction(action: DomainMenuActionKey) {
    setDomainMenuOpen(false);

    if (action === "domain-settings") {
      openDomainSettings();
      return;
    }

    if (action === "create-channel") {
      openCreateChannelModal();
      return;
    }

    if (action === "domain-nickname") {
      openDomainNicknameModal();
      return;
    }

    if (action === "leave-domain") {
      handleLeaveDomain();
    }
  }

  async function handleCreateChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDomain || !user || !token) {
      return;
    }

    const channelName = createChannelForm.name.trim();
    const maxCapacity = clampNumber(Number(createChannelForm.maxCapacity) || 1, 1, 20);

    if (!channelName) {
      setCreateChannelError("请输入频道名。");
      setMessage("请输入频道名称。");
      return;
    }

    setCreateChannelError("");
    setIsSubmitting(true);
    try {
      const channel = await request<Channel>(
        "/channels/create_channel",
        {
          method: "POST",
          body: JSON.stringify({
            domain_id: selectedDomain.id,
            channel_name: channelName,
            description: `${selectedDomain.domain_name} 频道`,
            max_capacity: maxCapacity,
            channel_type: "voice",
          }),
        },
        token,
      );

      await loadChannels(selectedDomain.id, token);
      setSelectedChannelId(channel.id);
      closeCreateChannelModal();
      setMessage(`已创建频道 ${channel.channel_name}。`);
    } catch (error) {
      const detail = formatApiError(error, "创建频道失败，请稍后重试。");
      setCreateChannelError(detail);
      setMessage(detail);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleChooseDomainAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const source = await readFileAsDataUrl(file);
      const image = await loadImage(source);
      setDomainAvatarForm({
        source,
        avatar: domainAvatarForm.avatar,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        fileName: file.name,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
      });
      setDomainAvatarMessage("");
    } catch {
      setDomainAvatarMessage("域头像读取失败，请稍后重试。");
    } finally {
      event.target.value = "";
    }
  }

  async function handleSaveDomainAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDomain || !token) {
      setDomainAvatarMessage("登录状态已失效，请重新登录。");
      return;
    }

    setIsSubmitting(true);
    setDomainAvatarMessage("");

    try {
      const nextAvatar = domainAvatarForm.source
        ? await renderCroppedAvatar(
            domainAvatarForm.source,
            domainAvatarForm.zoom,
            domainAvatarForm.offsetX,
            domainAvatarForm.offsetY,
          )
        : null;
      const persistedInputAvatar = nextAvatar ? await uploadAvatarAsset(nextAvatar, "domain", token) : null;

      const updatedDomain = await request<Domain>(
        "/domains/update_domain",
        {
          method: "PUT",
          body: JSON.stringify({
            id: selectedDomain.id,
            avatar: persistedInputAvatar,
          }),
        },
        token,
      );

      const persistedAvatar = updatedDomain.avatar ?? persistedInputAvatar;
      setDomainAvatarForm((current) => ({ ...current, avatar: persistedAvatar }));
      setDomainInfoDraft((current) => ({ ...current, avatar: persistedAvatar }));
      setDomains((current) => current.map((domain) => (domain.id === selectedDomain.id ? { ...domain, ...updatedDomain } : domain)));
      setDomainAvatars((current) => ({ ...current, [selectedDomain.id]: persistedAvatar }));
      setDomainAvatarMessage(persistedAvatar ? "域头像已更新。" : "域头像已清空。");
      setMessage(persistedAvatar ? "域头像已更新。" : "域头像已清空。");
      closeDomainAvatarModal();
    } catch (error) {
      setDomainAvatarMessage(formatApiError(error, error instanceof Error ? error.message : "域头像处理失败。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClearDomainAvatar() {
    setDomainAvatarForm((current) => ({
      ...current,
      source: null,
      avatar: null,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      fileName: "",
      imageWidth: 0,
      imageHeight: 0,
    }));
    setDomainInfoDraft((current) => ({ ...current, avatar: null }));
    setDomainAvatarMessage("");
  }

  async function handleSaveDomainInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDomain || !token) {
      setDomainInfoMessage("登录状态已失效，请重新登录。");
      return;
    }

    const nextName = domainInfoDraft.name.trim();
    if (!nextName) {
      setDomainInfoMessage("请输入域名。");
      setMessage("请输入域名。");
      return;
    }

    try {
      const updatedDomain = await request<Domain>(
        "/domains/update_domain",
        {
          method: "PUT",
          body: JSON.stringify({
            id: selectedDomain.id,
            domain_name: nextName,
            avatar: domainInfoDraft.avatar,
          }),
        },
        token,
      );
      setDomains((current) => current.map((domain) => (domain.id === selectedDomain.id ? { ...domain, ...updatedDomain } : domain)));
      setDomainInfoDraft({
        name: updatedDomain.domain_name,
        avatar: updatedDomain.avatar ?? null,
      });
      setDomainAvatars((current) => ({ ...current, [selectedDomain.id]: updatedDomain.avatar ?? null }));
      setDomainInfoMessage("域信息已保存。");
      setMessage(`已更新域 ${nextName} 的详细信息。`);
    } catch (error) {
      setDomainInfoMessage(formatApiError(error, "更新域失败，请稍后重试。"));
      setMessage(formatApiError(error, "更新域失败，请稍后重试。"));
    }
  }

  async function handleSaveDomainNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDomain || !user || !token) {
      return;
    }

    const nextNickname = domainNicknameDraft.trim();
    if (!nextNickname) {
      setMessage("请输入本域昵称。");
      return;
    }

    setIsSubmitting(true);
    try {
      await request<null>(
        "/domains/member/alias",
        {
          method: "PUT",
          body: JSON.stringify({
            domain_id: selectedDomain.id,
            alias: nextNickname,
          }),
        },
        token,
      );
      await loadDomainMembers(selectedDomain.id, token);
      closeDomainNicknameModal();
      setMessage(`已将本域昵称更新为 ${nextNickname}。`);
    } catch (error) {
      setMessage(formatApiError(error, "更新本域昵称失败，请稍后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetMemberAsAdmin(memberId: string) {
    if (!selectedDomain || !token) {
      return;
    }

    setIsSubmitting(true);
    try {
      await request<null>(
        "/domains/change_role",
        {
          method: "PUT",
          body: JSON.stringify({
            domain_id: selectedDomain.id,
            member_id: memberId,
            role: "admin",
          }),
        },
        token,
      );
      await loadDomainMembers(selectedDomain.id, token);
      setMessage("成员已设为管理员。");
    } catch (error) {
      setMessage(formatApiError(error, "修改成员权限失败，请稍后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveDomainMember(memberId: string) {
    if (!selectedDomain || !token) {
      return;
    }

    const member = selectedDomainMembers.find((item) => item.id === memberId);
    if (!member) {
      return;
    }

    if (member.userId === user?.id) {
      await handleLeaveDomain();
      return;
    }

    setIsSubmitting(true);
    try {
      await request<null>(
        "/domains/kick_domain_member",
        {
          method: "DELETE",
          body: JSON.stringify({
            domain_id: selectedDomain.id,
            member_id: memberId,
          }),
        },
        token,
      );
      await loadDomainMembers(selectedDomain.id, token);
      setMessage(`已将 ${member.domainNickname} 移出域。`);
    } catch (error) {
      setMessage(formatApiError(error, "移除成员失败，请稍后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenDeleteDomainConfirm() {
    if (!selectedDomain) {
      return;
    }

    setDeleteDomainConfirmOpen(true);
  }

  async function handleConfirmDeleteDomain() {
    if (!selectedDomain || !token) {
      return;
    }

    try {
      await request<null>(`/domains/delete_domain/${selectedDomain.id}`, { method: "DELETE" }, token);
      removeDomainFromWorkspace(selectedDomain.id, `已删除域 ${selectedDomain.domain_name}。`);
    } catch (error) {
      setMessage(formatApiError(error, "删除域失败，请稍后重试。"));
    }
  }

  function handleChannelContextMenu(event: React.MouseEvent<HTMLButtonElement>, channel: Channel) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedChannelId(channel.id);

    if (selectedDomainRole === "member") {
      setChannelContextMenu(null);
      return;
    }

    const menuWidth = 136;
    const menuHeight = 52;
    const viewportWidth = typeof window === "undefined" ? menuWidth : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? menuHeight : window.innerHeight;
    setChannelContextMenu({
      channelId: channel.id,
      x: clampNumber(event.clientX, 12, Math.max(12, viewportWidth - menuWidth - 12)),
      y: clampNumber(event.clientY, 12, Math.max(12, viewportHeight - menuHeight - 12)),
    });
  }

  async function handleDeleteChannel(channel: Channel) {
    if (!selectedDomain || !token) {
      return;
    }

    setIsSubmitting(true);
    try {
      await request<null>(`/channels/delete_channel/${channel.id}`, { method: "DELETE" }, token);
      await loadChannels(selectedDomain.id, token);

      if (selectedChannelId === channel.id) {
        setSelectedChannelId(null);
      }

      if (joinedChannelId === channel.id) {
        void leaveCurrentChannel();
      }

      setChannelContextMenu(null);
      setMessage(`已删除频道 ${channel.channel_name}。`);
    } catch (error) {
      setMessage(formatApiError(error, "删除频道失败，请稍后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleToggleSelfMic() {
    setSelfMicMuted((current) => {
      const next = !current;
      const localTrack = localMicrophoneTrackRef.current;
      if (localTrack) {
        void syncLocalMicrophoneMute(localTrack, next);
      }
      if (token && joinedChannelId) {
        void request<null>(
          "/channels/member/state",
          {
            method: "PUT",
            body: JSON.stringify({
              channel_id: joinedChannelId,
              microphone_state: !next,
            }),
          },
          token,
        ).catch(() => undefined);
      }
      setVoiceParticipants((participants) =>
        participants.map((participant) =>
          participant.isSelf
            ? {
                ...participant,
                isMuted: next,
                audioEnabled: !next,
                isSpeaking: next ? false : participant.isSpeaking,
              }
            : participant,
        ),
      );
      setMessage(next ? "\u5df2\u5173\u95ed\u9ea6\u514b\u98ce\u3002" : "\u5df2\u5f00\u542f\u9ea6\u514b\u98ce\u3002");
      return next;
    });
  }

  function handleToggleSelfMonitor() {
    setSelfMonitorMuted((current) => {
      const next = !current;
      remoteAudioElementsRef.current.forEach((element, identity) => {
        element.muted = next || Boolean(mutedPeers[identity]);
      });
      if (token && joinedChannelId) {
        void request<null>(
          "/channels/member/state",
          {
            method: "PUT",
            body: JSON.stringify({
              channel_id: joinedChannelId,
              speaker_state: !next,
            }),
          },
          token,
        ).catch(() => undefined);
      }
      setMessage(next ? "\u5df2\u5173\u95ed\u603b\u76d1\u542c\u3002" : "\u5df2\u5f00\u542f\u603b\u76d1\u542c\u3002");
      return next;
    });
  }

  function handleTogglePeerMute(identity: string, displayName: string) {
    setMutedPeers((current) => {
      const next = !current[identity];
      const nextState = { ...current, [identity]: next };
      const element = remoteAudioElementsRef.current.get(identity);
      if (element) {
        element.muted = selfMonitorMuted || next;
      }
      setMessage(next ? `已静音 ${displayName}。` : `已恢复 ${displayName}。`);
      return nextState;
    });
  }

  function handleSummarizeConversation() {
    const now = new Date();
    const lastMessageTime = displayedVoiceMessages.length ? new Date(displayedVoiceMessages[displayedVoiceMessages.length - 1].created_at) : null;
    const endTime = lastMessageTime && !Number.isNaN(lastMessageTime.getTime()) ? lastMessageTime : now;
    setAnalysisRangeError("");
    setAnalysisRangeForm({
      startTime: formatDateTimeInputValue(getDefaultAnalysisStartTime(endTime)),
      endTime: formatDateTimeInputValue(endTime),
    });
    setAnalysisRangeModalOpen(true);
  }

  async function handleAnalyzeConversationWithRange(prompt: string, startTime: string | null, endTime: string | null) {
    const channelId = conversationChannel?.id;
    if (!channelId) {
      setMessage("请先选择一个频道。");
      return;
    }
    if (!token) {
      setMessage("登录状态已失效，请重新登录。");
      return;
    }

    setAnalysisLoading(true);
    try {
      const result = await analyzeChannelWithRange(channelId, prompt, startTime, endTime, token);
      setAnalysisResult(result);
      setAnalysisRangeModalOpen(false);
      setAnalysisRangeError("");
    } catch (error) {
      setMessage(formatApiError(error, "频道判定失败，请稍后重试。"));
    } finally {
      setAnalysisLoading(false);
    }
  }

  function handleCloseAnalysisRangeModal() {
    if (analysisLoading) {
      return;
    }
    setAnalysisRangeModalOpen(false);
    setAnalysisRangeError("");
  }

  function handleSubmitAnalysisRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startTime = analysisRangeForm.startTime.trim();
    const endTime = analysisRangeForm.endTime.trim();

    if (!startTime || !endTime) {
      setAnalysisRangeError("请选择完整的开始和结束时间。");
      return;
    }

    if (new Date(startTime).getTime() > new Date(endTime).getTime()) {
      setAnalysisRangeError("开始时间不能晚于结束时间。");
      return;
    }

    setAnalysisRangeError("");
    void handleAnalyzeConversationWithRange("", startTime, endTime);
  }

  const domainEntryCard = domainEntryCardOpen ? (
    <div className="domain-entry-layer no-drag" role="presentation" onClick={closeDomainEntryCard}>
      <div
        className={`domain-entry-card ${joinDomainResults.length ? "expanded" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="domain-entry-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="domain-entry-close" type="button" aria-label="关闭" title="关闭" onClick={closeDomainEntryCard}>
          <span className="domain-entry-close-glyph" style={iconMask(WINDOW_CLOSE_URL)} aria-hidden="true" />
        </button>
        <h2 id="domain-entry-title">创建或加入域</h2>

        <button className="domain-entry-option domain-entry-option-create" type="button" onClick={handleCreateDomainFromCard}>
          <span className="domain-entry-option-icon" style={iconMask(PLUS_CIRCLE_LIGHT_URL)} aria-hidden="true" />
          <span className="domain-entry-option-copy">
            <strong>创建</strong>
            <small>自己创建一个域</small>
          </span>
        </button>

        <section className="domain-entry-join-panel" aria-label="加入域">
          <div className="domain-entry-option domain-entry-option-static">
            <span className="domain-entry-option-icon" style={iconMask(USERS_LIGHT_URL)} aria-hidden="true" />
            <span className="domain-entry-option-copy">
              <strong>加入</strong>
              <small>输入域 ID 加入一个域</small>
            </span>
          </div>

          <div className="domain-entry-search-shell">
            <input
              className="domain-entry-search-input"
              type="text"
              inputMode="numeric"
              placeholder="输入 8 位域 ID"
              value={joinDomainQuery}
              onChange={(event) => setJoinDomainQuery(event.target.value.replace(/[^\d]/g, "").slice(0, 8))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSearchJoinDomain();
                }
              }}
            />
            {joinDomainQuery ? (
              <button className="domain-entry-search-action subtle" type="button" aria-label="清除输入" title="清除输入" onClick={handleClearJoinDomainQuery}>
                <span className="domain-entry-search-glyph" style={iconMask(WINDOW_CLOSE_URL)} aria-hidden="true" />
              </button>
            ) : null}
            <button className="domain-entry-search-action" type="button" aria-label="搜索域" title="搜索域" onClick={handleSearchJoinDomain}>
              <span className="domain-entry-search-glyph" style={iconMask(MAGNIFYING_GLASS_LIGHT_URL)} aria-hidden="true" />
            </button>
          </div>

          {joinDomainResults.length ? (
            <div className="domain-entry-search-results">
              {joinDomainResults.map((domain) => (
                <button key={domain.id} className="domain-entry-search-result" type="button" onClick={() => handleJoinDomain(domain)}>
                  <span className="domain-entry-search-result-avatar" aria-hidden="true">
                    {domain.domain_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="domain-entry-search-result-copy">
                    <strong>{domain.domain_name}</strong>
                    <small>ID:{formatDomainId(domain.id)}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : joinDomainSearched ? (
            <p className="domain-entry-search-empty">未搜索到匹配的域。</p>
          ) : null}
        </section>
      </div>
    </div>
  ) : null;
  const createDomainModal = createDomainModalOpen ? (
    <div className="settings-modal-layer create-domain-layer no-drag" role="presentation" onClick={closeCreateDomainModal}>
      <div className="settings-modal-card create-domain-modal" role="dialog" aria-modal="true" aria-labelledby="create-domain-title" onClick={(event) => event.stopPropagation()}>
        <form className="create-domain-form" onSubmit={handleSubmitCreateDomain}>
          <div className="create-domain-avatar-block">
            <AvatarCropStage
              avatarForm={createDomainAvatarForm}
              onChange={(field, value) => setCreateDomainAvatarForm((current) => ({ ...current, [field]: value }))}
              onChooseFile={handleChooseCreateDomainAvatarFile}
              className="create-domain-avatar-stage"
              emptyLabel="上传头像"
            />
          </div>
          <label className="underline-field create-domain-name-field">
            <span id="create-domain-title">域名称</span>
            <div className="underline-field-control">
              <input
                type="text"
                maxLength={20}
                value={createDomainDraft.name}
                onChange={(event) => {
                  setCreateDomainError("");
                  setCreateDomainDraft((current) => ({ ...current, name: event.target.value.slice(0, 20) }));
                }}
                placeholder="输入域名称"
              />
              <small className="underline-field-count">{String(createDomainDraft.name.length).padStart(2, "0")}/20</small>
            </div>
          </label>
          {createDomainError ? <p className="message-line">{createDomainError}</p> : null}
          <div className="underline-action-row create-domain-action-row">
            <button className="channel-text-button" type="button" onClick={closeCreateDomainModal}>取消</button>
            <button className="channel-text-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "创建中..." : "创建"}</button>
          </div>
        </form>
      </div>
    </div>
  ) : null;
  const createChannelModal = createChannelModalOpen && selectedDomain ? (
    <div className="settings-modal-layer no-drag" role="presentation" onClick={closeCreateChannelModal}>
      <div className="settings-modal-card channel-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-channel-title" onClick={(event) => event.stopPropagation()}>
        <div className="settings-modal-head channel-create-head">
          <h2 id="create-channel-title">创建频道</h2>
        </div>
        <form className="channel-create-form" onSubmit={handleCreateChannel}>
          <label className="underline-field">
            <div className="underline-field-head">
              <span>频道名称</span>
            </div>
            <div className="underline-field-control">
              <input
                type="text"
                maxLength={20}
                value={createChannelForm.name}
                onChange={(event) => {
                  setCreateChannelError("");
                  setCreateChannelForm((current) => ({ ...current, name: event.target.value.slice(0, 20) }));
                }}
                placeholder="输入频道名称"
              />
              <small className="underline-field-count">{String(createChannelForm.name.length).padStart(2, "0")}/20</small>
            </div>
          </label>
          {createChannelError ? <p className="message-line">{createChannelError}</p> : null}
          <label className="underline-field">
            <span>频道最大人数</span>
            <div className="underline-field-control underline-field-control-single">
              <input
                type="number"
                min="1"
                max="20"
                value={createChannelForm.maxCapacity}
                onChange={(event) =>
                  setCreateChannelForm((current) => ({
                    ...current,
                    maxCapacity: event.target.value.replace(/[^\d]/g, "").slice(0, 2),
                  }))
                }
                placeholder="最大 20"
              />
            </div>
          </label>
          <div className="underline-action-row">
            <button className="channel-text-button" type="button" onClick={closeCreateChannelModal} disabled={isSubmitting}>取消</button>
            <button className="channel-text-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "创建中..." : "创建频道"}</button>
          </div>
        </form>
      </div>
    </div>
  ) : null;
  const domainNicknameModal = domainNicknameModalOpen && selectedDomain ? (
    <div className="settings-modal-layer no-drag" role="presentation" onClick={closeDomainNicknameModal}>
      <div className="settings-modal-card channel-create-modal domain-nickname-modal" role="dialog" aria-modal="true" aria-labelledby="domain-nickname-title" onClick={(event) => event.stopPropagation()}>
        <div className="settings-modal-head channel-create-head">
          <h2 id="domain-nickname-title">我在本域的昵称</h2>
        </div>
        <form className="channel-create-form domain-nickname-form" onSubmit={handleSaveDomainNickname}>
          <label className="underline-field">
            <div className="underline-field-head">
              <span>本域昵称</span>
            </div>
            <div className="underline-field-control">
              <input
                type="text"
                maxLength={20}
                value={domainNicknameDraft}
                onChange={(event) => setDomainNicknameDraft(event.target.value.slice(0, 20))}
                placeholder="输入新的本域昵称"
              />
              <small className="underline-field-count">{String(domainNicknameDraft.length).padStart(2, "0")}/20</small>
            </div>
          </label>
          <div className="underline-action-row">
            <button className="channel-text-button" type="button" onClick={closeDomainNicknameModal} disabled={isSubmitting}>取消</button>
            <button className="channel-text-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "保存中..." : "保存"}</button>
          </div>
        </form>
      </div>
    </div>
  ) : null;
  const deleteDomainConfirm = deleteDomainConfirmOpen && selectedDomain ? (
    <div className="settings-modal-layer no-drag" role="presentation" onClick={() => setDeleteDomainConfirmOpen(false)}>
      <div className="settings-modal-card domain-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-domain-title" onClick={(event) => event.stopPropagation()}>
        <div className="settings-modal-head channel-create-head">
          <h2 id="delete-domain-title">删除域</h2>
        </div>
        <p className="domain-delete-copy">
          是否确认删除 <strong>{selectedDomain.domain_name}</strong>，删除后域<span>无法复原</span>。
        </p>
        <div className="underline-action-row">
          <button className="channel-text-button" type="button" onClick={() => setDeleteDomainConfirmOpen(false)}>取消</button>
          <button className="channel-text-button danger" type="button" onClick={handleConfirmDeleteDomain}>确认删除</button>
        </div>
      </div>
    </div>
  ) : null;
  const domainAvatarModal = domainAvatarModalOpen ? (
    <div className="settings-modal-layer no-drag" role="presentation" onClick={closeDomainAvatarModal}>
      <div
        className="settings-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-domain-avatar-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-head">
          <div>
            <h2 id="settings-domain-avatar-modal">修改域头像</h2>
          </div>
        </div>
        <ChangeAvatarForm
          avatarForm={domainAvatarForm}
          isSubmitting={isSubmitting}
          message={domainAvatarMessage}
          onChange={(field, value) => setDomainAvatarForm((current) => ({ ...current, [field]: value }))}
          onChooseFile={handleChooseDomainAvatarFile}
          onSubmit={handleSaveDomainAvatar}
          onSecondaryAction={closeDomainAvatarModal}
          submitLabel="保存域头像"
          secondaryLabel="返回域设置"
          emptyLabel="点击上传域头像"
        />
      </div>
    </div>
  ) : null;
  const analysisModal = analysisResult ? (
    <div className="settings-modal-layer no-drag" role="presentation" onClick={() => setAnalysisResult(null)}>
      <div
        className="settings-modal-card channel-analysis-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-analysis-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-head channel-analysis-head">
          <h2 id="channel-analysis-title">频道判定结果</h2>
          <button className="settings-modal-back channel-analysis-close" type="button" aria-label="关闭" title="关闭" onClick={() => setAnalysisResult(null)}>
            <span className="settings-modal-back-icon" style={iconMask(WINDOW_CLOSE_URL)} aria-hidden="true" />
          </button>
        </div>
        <div className="channel-analysis-meta">
          {analysisResult.start_time || analysisResult.end_time ? (
            <span>
              时间范围: {formatAnalysisRangeLabel(analysisResult.start_time) ?? "最早"} - {formatAnalysisRangeLabel(analysisResult.end_time) ?? "最新"}
            </span>
          ) : (
            <span>时间范围: 全部可用记录</span>
          )}
        </div>
        <div className="channel-analysis-report">{analysisResult.report}</div>
      </div>
    </div>
  ) : null;
  const analysisRangeModal = analysisRangeModalOpen ? (
    <div className="settings-modal-layer no-drag" role="presentation" onClick={handleCloseAnalysisRangeModal}>
      <div
        className="settings-modal-card channel-analysis-range-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-analysis-range-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-head channel-create-head">
          <h2 id="channel-analysis-range-title">选择总结时间范围</h2>
        </div>
        <form className="channel-create-form channel-analysis-range-form" onSubmit={handleSubmitAnalysisRange}>
          <label className="underline-field">
            <span>开始时间</span>
            <div className="underline-field-control underline-field-control-single">
              <input
                type="datetime-local"
                value={analysisRangeForm.startTime}
                onChange={(event) => {
                  setAnalysisRangeError("");
                  setAnalysisRangeForm((current) => ({ ...current, startTime: event.target.value }));
                }}
                disabled={analysisLoading}
              />
            </div>
          </label>
          <label className="underline-field">
            <span>结束时间</span>
            <div className="underline-field-control underline-field-control-single">
              <input
                type="datetime-local"
                value={analysisRangeForm.endTime}
                onChange={(event) => {
                  const nextEndTime = event.target.value;
                  const nextEndDate = new Date(nextEndTime);
                  setAnalysisRangeError("");
                  setAnalysisRangeForm((current) => ({
                    ...current,
                    endTime: nextEndTime,
                    startTime: Number.isNaN(nextEndDate.getTime())
                      ? current.startTime
                      : formatDateTimeInputValue(getDefaultAnalysisStartTime(nextEndDate)),
                  }));
                }}
                disabled={analysisLoading}
              />
            </div>
          </label>
          {analysisRangeError ? <p className="message-line">{analysisRangeError}</p> : null}
          <div className="underline-action-row">
            <button className="channel-text-button" type="button" onClick={handleCloseAnalysisRangeModal} disabled={analysisLoading}>取消</button>
            <button className="channel-text-button" type="submit" disabled={analysisLoading}>{analysisLoading ? "总结中..." : "开始总结"}</button>
          </div>
        </form>
      </div>
    </div>
  ) : null;
  const channelContextMenuNode =
    channelContextMenu && contextMenuChannel && typeof document !== "undefined"
      ? createPortal(
          <div className="floating-menu channel-context-menu" style={{ left: channelContextMenu.x, top: channelContextMenu.y }}>
            <button className="danger" type="button" onClick={() => handleDeleteChannel(contextMenuChannel)}>删除频道</button>
          </div>,
          document.body,
        )
      : null;


  if (isBooting) {
    return (
      <SceneFrame view="login">
        <div className="boot-screen">EKKO 启动中...</div>
      </SceneFrame>
    );
  }

  if (!user) {
    return (
      <SceneFrame view={authMode}>
        {authMode === "login" ? (
          <LoginView
            loginForm={loginForm}
            isSubmitting={isSubmitting}
            message={message}
            onChange={(field, value) => setLoginForm((current) => ({ ...current, [field]: value }))}
            onSubmit={handleLogin}
            onSwitchToRegister={() => {
              setAuthMode("register");
              setMessage("");
            }}
            onSwitchToReset={() => {
              setAuthMode("reset");
              setMessage("");
            }}
          />
        ) : authMode === "register" ? (
          <RegisterView
            registerForm={registerForm}
            isSubmitting={isSubmitting}
            message={message}
            onChange={(field, value) => setRegisterForm((current) => ({ ...current, [field]: value }))}
            onSubmit={handleRegister}
            onSendCode={() => handleSendCode(registerForm.email)}
            onBackToLogin={() => {
              setAuthMode("login");
              setMessage("");
            }}
          />
        ) : (
          <ResetPasswordView
            resetForm={resetForm}
            isSubmitting={isSubmitting}
            message={message}
            onChange={(field, value) => setResetForm((current) => ({ ...current, [field]: value }))}
            onSubmit={handleResetPassword}
            onSendCode={() => handleSendCode(resetForm.email)}
            onBackToLogin={() => {
              setAuthMode("login");
              setMessage("");
            }}
          />
        )}
      </SceneFrame>
    );
  }

  if (domainSettingsOpen) {
    return (
      <SceneFrame view="settings">
        <div className="app-shell">
          <div className="app-noise" />
          {domainEntryCard}
          {createDomainModal}
          {createChannelModal}
          {domainNicknameModal}
          {deleteDomainConfirm}
          {domainAvatarModal}
          {channelContextMenuNode}
          <div className="workspace-grid workspace-grid-compact">
            <aside className="sidebar-merged no-drag">
              <div className="sidebar-merged-head drag-region">
                <div className="rail-brand">
                  <img src={WORKSPACE_LOGO_URL} alt="EKKO logo" />
                </div>
                <ProfileAvatar name={user.nick_name} avatar={user.avatar} className="user-avatar no-drag" />
              </div>

              <div className="sidebar-merged-body">
                <aside className="domain-rail">
                  <ScrollArea className="domain-list-scroll no-drag" viewportClassName="domain-list">
                    {sortedDomains.map((domain) => (
                      <button
                        key={domain.id}
                        className={`domain-avatar-button ${domain.id === selectedDomainId ? "active" : ""}`}
                        onClick={() => handleOpenDomain(domain.id)}
                        title={domain.domain_name}
                      >
                        <span className={`domain-avatar-tile ${domainAvatars[domain.id] ?? domain.avatar ? "has-image" : ""}`.trim()} aria-hidden="true">
                          {domainAvatars[domain.id] ?? domain.avatar ? <img src={resolveMediaUrl(domainAvatars[domain.id] ?? domain.avatar) ?? ""} alt="" /> : domain.domain_name.slice(0, 1).toUpperCase()}
                        </span>
                      </button>
                    ))}
                  </ScrollArea>

                  <div className="rail-footer no-drag">
                    <div className="action-strip">
                      <button
                        className="action-square-button"
                        type="button"
                        title="设置"
                        onClick={() => {
                          setDomainSettingsOpen(false);
                          setSettingsSection("account");
                          setSettingsOpen(true);
                        }}
                      >
                        <span className="action-square-glyph" style={iconMask(SIDEBAR_SET_URL)} aria-hidden="true" />
                      </button>
                      <button className="action-square-button" type="button" title="创建或加入域" onClick={openDomainEntryCard}>
                        <span className="action-square-glyph" style={iconMask(SIDEBAR_ADD_URL)} aria-hidden="true" />
                      </button>
                      <button className="action-square-button" type="button" title="退出登录" onClick={logout}>
                        <span className="action-square-glyph" style={iconMask(SIDEBAR_OUT_URL)} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </aside>

                <section className="settings-nav-panel">
                  <button className="settings-back-button" type="button" onClick={closeDomainSettings}>
                    <img src={CARET_LEFT_LIGHT_URL} alt="" aria-hidden="true" />
                    <span>返回</span>
                  </button>

                  <ScrollArea className="settings-nav-scroll" viewportClassName="settings-nav-list">
                    <section className="settings-nav-group">
                      <strong className="settings-nav-group-title">域设置</strong>
                      {domainSettingsNavItems.map((item) => (
                        <button
                          key={item.key}
                          className={`settings-nav-button ${domainSettingsSection === item.key ? "active" : ""} ${item.danger ? "danger" : ""}`.trim()}
                          type="button"
                          onClick={() => setDomainSettingsSection(item.key)}
                        >
                          <span className="settings-nav-glyph" style={iconMask(item.iconUrl)} aria-hidden="true" />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </section>
                  </ScrollArea>
                </section>
              </div>
            </aside>

            <main className="settings-stage no-drag">
              <header className="settings-stage-header">
                <div className={`settings-stage-title ${activeDomainSettingsItem.danger ? "danger" : ""}`.trim()}>
                  <span className="settings-stage-icon" style={iconMask(activeDomainSettingsItem.iconUrl)} aria-hidden="true" />
                  <h1>{activeDomainSettingsItem.label}</h1>
                </div>
              </header>

              <ScrollArea className="settings-stage-scroll" viewportClassName="settings-stage-body">
                {domainSettingsSection === "info" ? (
                  <form className="settings-card domain-detail-form" onSubmit={handleSaveDomainInfo}>
                    <section className="account-hero-card domain-settings-hero">
                      <ProfileAvatar name={selectedDomain?.domain_name ?? "域"} avatar={domainInfoDraft.avatar} className="settings-account-avatar" />
                      <div className="settings-account-copy">
                        <strong>{selectedDomain?.domain_name ?? "未选择域"}</strong>
                        <span>ID:{selectedDomain ? formatDomainId(selectedDomain.id) : "00000000"}</span>
                      </div>
                      <div className="domain-info-avatar-actions">
                        <button className="channel-text-button" type="button" onClick={openDomainAvatarModal}>修改头像</button>
                      </div>
                    </section>

                    <label className="underline-field">
                      <div className="underline-field-head">
                        <span>域名称</span>
                      </div>
                      <div className="underline-field-control">
                        <input
                          type="text"
                          maxLength={20}
                          value={domainInfoDraft.name}
                          onChange={(event) => {
                            setDomainInfoMessage("");
                            setDomainInfoDraft((current) => ({ ...current, name: event.target.value.slice(0, 20) }));
                          }}
                          placeholder="输入域名称"
                        />
                        <small className="underline-field-count">{String(domainInfoDraft.name.length).padStart(2, "0")}/20</small>
                      </div>
                    </label>

                    <div className="settings-detail-row">
                      <div>
                        <span className="settings-detail-label">域 ID</span>
                        <strong>{selectedDomain ? formatDomainId(selectedDomain.id) : "00000000"}</strong>
                      </div>
                      <button className="channel-text-button" type="button" onClick={handleCopyDomainId}>
                        {domainIdCopied ? "已复制" : "复制"}
                      </button>
                    </div>

                    {domainInfoMessage ? <p className="message-line">{domainInfoMessage}</p> : null}
                    <div className="underline-action-row">
                      <button className="channel-text-button" type="submit">保存变更</button>
                    </div>
                  </form>
                ) : null}

                {domainSettingsSection === "members" ? (
                  <section className="settings-card domain-members-card">
                    {selectedDomainMembers.map((member) => (
                      <div key={member.id} className="domain-member-manage-row">
                        <ProfileAvatar
                          name={member.domainNickname}
                          avatar={member.avatar}
                          className="domain-member-manage-avatar"
                        />
                        <span className="domain-member-manage-name" title={member.domainNickname}>{member.domainNickname}</span>
                        <span className="domain-member-manage-role">{member.role === "owner" ? "域主" : member.role === "admin" ? "管理员" : "成员"}</span>
                        <div className="domain-member-manage-actions">
                          {member.role === "member" ? (
                            <button className="channel-text-button" type="button" onClick={() => handleSetMemberAsAdmin(member.id)}>设为管理员</button>
                          ) : null}
                          {member.role !== "owner" ? (
                            <button className="channel-text-button danger" type="button" onClick={() => handleRemoveDomainMember(member.id)}>移除域</button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </section>
                ) : null}

                {domainSettingsSection === "danger" ? (
                  <section className="settings-card domain-danger-card">
                    <div className="settings-detail-row">
                      <div>
                        <span className="settings-detail-label">危险操作</span>
                        <strong>{selectedDomain?.domain_name ?? "当前域"}</strong>
                      </div>
                      <button className="channel-text-button danger" type="button" onClick={handleOpenDeleteDomainConfirm}>删除域</button>
                    </div>
                    <p className="settings-form-footnote">
                      删除后域<span className="danger-inline-text">无法复原</span>，请确认当前域内内容已经完成迁移。
                    </p>
                  </section>
                ) : null}
              </ScrollArea>
            </main>
          </div>
        </div>
      </SceneFrame>
    );
  }

  if (settingsOpen) {
    return (
      <SceneFrame view="settings">
        <div className="app-shell">
          <div className="app-noise" />
          {domainEntryCard}
          <div className="workspace-grid workspace-grid-compact">
            <aside className="sidebar-merged no-drag">
              <div className="sidebar-merged-head drag-region">
                <div className="rail-brand">
                  <img src={WORKSPACE_LOGO_URL} alt="EKKO logo" />
                </div>
                <ProfileAvatar name={user.nick_name} avatar={user.avatar} className="user-avatar no-drag" />
              </div>

              <div className="sidebar-merged-body">
                <aside className="domain-rail">
                  <ScrollArea className="domain-list-scroll no-drag" viewportClassName="domain-list">
                    {sortedDomains.map((domain) => (
                      <button
                        key={domain.id}
                        className={`domain-avatar-button ${domain.id === selectedDomainId ? "active" : ""}`}
                        onClick={() => handleOpenDomain(domain.id)}
                        title={domain.domain_name}
                      >
                        <span className={`domain-avatar-tile ${domainAvatars[domain.id] ?? domain.avatar ? "has-image" : ""}`.trim()} aria-hidden="true">
                          {domainAvatars[domain.id] ?? domain.avatar ? <img src={resolveMediaUrl(domainAvatars[domain.id] ?? domain.avatar) ?? ""} alt="" /> : domain.domain_name.slice(0, 1).toUpperCase()}
                        </span>
                      </button>
                    ))}
                  </ScrollArea>

                  <div className="rail-footer no-drag">
                    <div className="action-strip">
                      <button className="action-square-button is-current" type="button" title="设置">
                        <span className="action-square-glyph" style={iconMask(SIDEBAR_SET_URL)} aria-hidden="true" />
                      </button>
                      <button className="action-square-button" type="button" title="创建或加入域" onClick={openDomainEntryCard}>
                        <span className="action-square-glyph" style={iconMask(SIDEBAR_ADD_URL)} aria-hidden="true" />
                      </button>
                      <button className="action-square-button" type="button" title="退出登录" onClick={logout}>
                        <span className="action-square-glyph" style={iconMask(SIDEBAR_OUT_URL)} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </aside>

                <section className="settings-nav-panel">
                  <button className="settings-back-button" type="button" onClick={() => setSettingsOpen(false)}>
                    <img src={CARET_LEFT_LIGHT_URL} alt="" aria-hidden="true" />
                    <span>返回</span>
                  </button>

                  <ScrollArea className="settings-nav-scroll" viewportClassName="settings-nav-list">
                    {settingsGroups.map((group) => (
                      <section key={group.title} className="settings-nav-group">
                        <strong className="settings-nav-group-title">{group.title}</strong>
                        {group.items.map((item) => (
                          <button
                            key={item.key}
                            className={`settings-nav-button ${settingsSection === item.key ? "active" : ""}`}
                            type="button"
                            onClick={() => setSettingsSection(item.key)}
                          >
                            <span className="settings-nav-glyph" style={iconMask(item.iconUrl)} aria-hidden="true" />
                            <span>{item.label}</span>
                          </button>
                        ))}
                      </section>
                    ))}
                  </ScrollArea>
                </section>
              </div>
            </aside>

            <main className="settings-stage no-drag">
              <header className="settings-stage-header">
                <div className="settings-stage-title">
                  <span className="settings-stage-icon" style={iconMask(activeSettingsItem.iconUrl)} aria-hidden="true" />
                  <h1>{activeSettingsItem.label}</h1>
                </div>
              </header>

              <ScrollArea className="settings-stage-scroll" viewportClassName="settings-stage-body">
                {settingsSection === "account" ? (
                  <>
                    <section className="settings-card account-hero-card">
                      <ProfileAvatar name={user.nick_name} avatar={user.avatar} className="settings-account-avatar" />
                      <div className="settings-account-copy">
                        <strong>{user.nick_name}</strong>
                        <span>{user.email}</span>
                      </div>
                      <button className="ghost-button compact-button" type="button" onClick={openChangeAvatarModal}>
                        修改头像
                      </button>
                    </section>

                    <section className="settings-card account-details-card">
                      <div className="settings-detail-row">
                        <div>
                          <span className="settings-detail-label">用户名</span>
                          <strong>{user.nick_name}</strong>
                        </div>
                        <button className="ghost-button compact-button" type="button" onClick={openChangeNameModal}>
                          修改
                        </button>
                      </div>

                      <div className="settings-detail-row">
                        <div>
                          <span className="settings-detail-label">用户 ID</span>
                          <strong>{String(user.id)}</strong>
                        </div>
                        <button className="ghost-button compact-button" type="button" onClick={handleCopyUserId}>
                          {userIdCopied ? "已复制" : "复制"}
                        </button>
                      </div>

                      <div className="settings-divider" />

                      <div className="settings-detail-row">
                        <div>
                          <span className="settings-detail-label">邮箱号</span>
                          <strong>{user.email}</strong>
                        </div>
                        <button className="ghost-button compact-button" type="button" onClick={openChangeEmailModal}>
                          修改邮箱
                        </button>
                      </div>

                      <div className="settings-detail-row">
                        <div>
                          <span className="settings-detail-label">安全</span>
                          <strong>密码与账号保护</strong>
                        </div>
                        <button className="primary-button compact-button" type="button" onClick={openResetPasswordModal}>
                          设置密码
                        </button>
                      </div>
                    </section>
                  </>
                ) : null}

                {settingsSection === "audio" ? (
                  <>
                    <section className="settings-card settings-audio-card">
                      <div className="settings-audio-row">
                        <div className="settings-field settings-device-picker">
                          <label>输入设备</label>
                          <button
                            className="settings-device-button"
                            type="button"
                            aria-expanded={settingsDeviceMenu === "input"}
                            disabled={!audioInputDevices.length}
                            onClick={() => setSettingsDeviceMenu((current) => (current === "input" ? null : "input"))}
                          >
                            <span>{selectedInputDeviceLabel}</span>
                            <span className="settings-device-caret" style={iconMask(CARET_DOWN_LIGHT_URL)} aria-hidden="true" />
                          </button>
                          {settingsDeviceMenu === "input" ? (
                            <div className="settings-device-menu">
                              {audioInputDevices.map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  className={`settings-device-option ${settings.inputDevice === option.id ? "active" : ""}`}
                                  onClick={() => {
                                    setSettings((current) => ({ ...current, inputDevice: option.id }));
                                    setSettingsDeviceMenu(null);
                                  }}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="settings-slider-inline">
                          <div className="settings-slider-head">
                            <div>
                              <span className="settings-detail-label">输入音量</span>
                              <span className="settings-slider-value">{settings.micLevel}%</span>
                            </div>
                            <span className="settings-slider-icon" style={iconMask(MICROPHONE_URL)} aria-hidden="true" />
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={settings.micLevel}
                            style={rangeProgressStyle(settings.micLevel)}
                            onChange={(event) => setSettings((current) => ({ ...current, micLevel: Number(event.target.value) }))}
                          />
                        </div>
                      </div>

                      <div className="settings-audio-row">
                        <div className="settings-field settings-device-picker">
                          <label>输出设备</label>
                          <button
                            className="settings-device-button"
                            type="button"
                            aria-expanded={settingsDeviceMenu === "output"}
                            disabled={!audioOutputDevices.length}
                            onClick={() => setSettingsDeviceMenu((current) => (current === "output" ? null : "output"))}
                          >
                            <span>{selectedOutputDeviceLabel}</span>
                            <span className="settings-device-caret" style={iconMask(CARET_DOWN_LIGHT_URL)} aria-hidden="true" />
                          </button>
                          {settingsDeviceMenu === "output" ? (
                            <div className="settings-device-menu">
                              {audioOutputDevices.map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  className={`settings-device-option ${settings.outputDevice === option.id ? "active" : ""}`}
                                  onClick={() => {
                                    setSettings((current) => ({ ...current, outputDevice: option.id }));
                                    setSettingsDeviceMenu(null);
                                  }}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="settings-slider-inline">
                          <div className="settings-slider-head">
                            <div>
                              <span className="settings-detail-label">监听音量</span>
                              <span className="settings-slider-value">{settings.monitorMix}%</span>
                            </div>
                            <span className="settings-slider-icon" style={iconMask(HEADPHONES_URL)} aria-hidden="true" />
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={settings.monitorMix}
                            style={rangeProgressStyle(settings.monitorMix)}
                            onChange={(event) => setSettings((current) => ({ ...current, monitorMix: Number(event.target.value) }))}
                          />
                        </div>
                      </div>
                    </section>

                    <section className="settings-card settings-toggle-list">
                      <div className="settings-toggle-row">
                        <div>
                          <strong>噪声抑制</strong>
                          <span>降低环境底噪，保持人声更清晰。</span>
                        </div>
                        <button
                          className={`settings-toggle ${settings.noiseSuppression ? "on" : ""}`}
                          type="button"
                          aria-pressed={settings.noiseSuppression}
                          disabled={noiseFilterPending}
                          onClick={() => setSettings((current) => ({ ...current, noiseSuppression: !current.noiseSuppression }))}
                        >
                          <span className="settings-toggle-knob" />
                        </button>
                      </div>
                    </section>

                    {TEMP_VOICE_DEBUG_UI ? (
                      <section className="settings-card settings-temp-voice-debug-card">
                        <div className="settings-temp-voice-debug-head">
                          <div>
                            <strong>联调验证</strong>
                            <span>这块 UI 仅用于当前 LiveKit 前端联调，后续完成正式对接后可整块删除。</span>
                          </div>
                          <div className="settings-temp-voice-debug-actions">
                            <button className="ghost-button compact-button" type="button" onClick={runTemporaryMicrophoneProbe}>
                              测试麦克风
                            </button>
                            <button className="ghost-button compact-button" type="button" onClick={stopTemporaryMicrophoneProbe}>
                              停止测试
                            </button>
                          </div>
                        </div>

                        <div className="settings-temp-voice-debug-grid">
                          <div className="settings-temp-voice-debug-row">
                            <span>权限状态</span>
                            <strong>{tempMicPermissionLabel}</strong>
                          </div>
                          <div className="settings-temp-voice-debug-row">
                            <span>轨道状态</span>
                            <strong>{tempMicProbeLabel}</strong>
                          </div>
                          <div className="settings-temp-voice-debug-row">
                            <span>实际输入设备</span>
                            <strong title={tempAppliedInputDeviceLabel}>{tempAppliedInputDeviceLabel}</strong>
                          </div>
                          <div className="settings-temp-voice-debug-row">
                            <span>设置中的输出设备</span>
                            <strong title={tempAppliedOutputDeviceLabel}>{tempAppliedOutputDeviceLabel}</strong>
                          </div>
                        </div>

                        {tempMicProbeDetail ? <p className="settings-temp-voice-debug-note">{tempMicProbeDetail}</p> : null}
                        {voiceError ? <p className="message-line settings-temp-voice-debug-note">{voiceError}</p> : null}
                        <p className="settings-temp-voice-debug-note">输入设备当前已接入真实采集参数；输出设备尚未接入远端播放链路，因此这里只能显示设置值，不能证明播放切换已生效。</p>
                      </section>
                    ) : null}
                  </>
                ) : null}

                {settingsSection === "system" ? (
                  <>
                    <section className="settings-card settings-toggle-list settings-system-toggle-list">
                      <div className="settings-toggle-row">
                        <div>
                          <strong>开机自启动</strong>
                          <span>开机后自动启动 EKKO 桌面端。</span>
                        </div>
                        <button
                          className={`settings-toggle ${settings.autoLaunch ? "on" : ""}`}
                          type="button"
                          aria-pressed={settings.autoLaunch}
                          onClick={() => setSettings((current) => ({ ...current, autoLaunch: !current.autoLaunch }))}
                        >
                          <span className="settings-toggle-knob" />
                        </button>
                      </div>

                      <div className="settings-toggle-row">
                        <div>
                          <strong>关闭时最小化</strong>
                          <span>点击关闭按钮时最小化到托盘而不是退出。</span>
                        </div>
                        <button
                          className={`settings-toggle ${settings.minimizeOnClose ? "on" : ""}`}
                          type="button"
                          aria-pressed={settings.minimizeOnClose}
                          onClick={() => setSettings((current) => ({ ...current, minimizeOnClose: !current.minimizeOnClose }))}
                        >
                          <span className="settings-toggle-knob" />
                        </button>
                      </div>

                      <div className="settings-toggle-row">
                        <div>
                          <strong>选择下载路径</strong>
                          <span>下载音频的默认保存位置。</span>
                        </div>
                        <div className="settings-path-control">
                          <strong className="settings-row-value" title={settings.downloadPath || "系统默认下载目录"}>
                            {settings.downloadPath || "系统默认下载目录"}
                          </strong>
                          <button className="ghost-button compact-button" type="button" onClick={handleSelectDownloadPath}>
                            选择
                          </button>
                        </div>
                      </div>

                    </section>
                  </>
                ) : null}
              </ScrollArea>
            </main>
          </div>
        </div>
        {accountModal ? (
          <div className="settings-modal-layer no-drag" role="presentation" onClick={closeAccountModal}>
            <div
              className="settings-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`settings-account-modal-${accountModal}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="settings-modal-head">
                <div>
                  <h2 id={`settings-account-modal-${accountModal}`}>
                    {accountModal === "password"
                      ? "设置密码"
                      : accountModal === "email"
                        ? "修改邮箱"
                        : accountModal === "name"
                          ? "修改名称"
                          : "修改用户头像"}
                  </h2>
                </div>
              </div>
              {accountModal === "password" ? (
                <ResetPasswordForm
                  resetForm={resetForm}
                  isSubmitting={isSubmitting}
                  message={accountModalMessage}
                  onChange={(field, value) => setResetForm((current) => ({ ...current, [field]: value }))}
                  onSubmit={handleResetPassword}
                  onSendCode={() => handleSendCodeFeedback(resetForm.email, setAccountModalMessage)}
                  submitLabel="修改密码"
                  secondaryLabel="返回设置"
                  onSecondaryAction={closeAccountModal}
                />
              ) : accountModal === "email" ? (
                <ChangeEmailForm
                  emailForm={changeEmailForm}
                  isSubmitting={isSubmitting}
                  message={accountModalMessage}
                  onChange={(field, value) => setChangeEmailForm((current) => ({ ...current, [field]: value }))}
                  onSubmit={handleChangeEmail}
                  onSendCurrentCode={() => handleSendCodeFeedback(changeEmailForm.currentEmail, setAccountModalMessage)}
                  onSendNextCode={() => handleSendCodeFeedback(changeEmailForm.nextEmail, setAccountModalMessage)}
                  onSecondaryAction={closeAccountModal}
                />
              ) : accountModal === "name" ? (
                <ChangeNameForm
                  nameForm={changeNameForm}
                  isSubmitting={isSubmitting}
                  message={accountModalMessage}
                  onChange={(field, value) => setChangeNameForm((current) => ({ ...current, [field]: value }))}
                  onSubmit={handleChangeName}
                  onSecondaryAction={closeAccountModal}
                />
              ) : accountModal === "avatar" ? (
                <ChangeAvatarForm
                  avatarForm={changeAvatarForm}
                  isSubmitting={isSubmitting}
                  message={accountModalMessage}
                  onChange={(field, value) => setChangeAvatarForm((current) => ({ ...current, [field]: value }))}
                  onChooseFile={handleChooseAvatarFile}
                  onSubmit={handleChangeAvatar}
                  onSecondaryAction={closeAccountModal}
                  submitLabel="保存用户头像"
                  secondaryLabel="返回设置"
                  emptyLabel="点击上传用户头像"
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </SceneFrame>
    );
  }

  return (
    <SceneFrame view="workspace">
      <div className="app-shell">
        <div className="app-noise" />
        {domainEntryCard}
        {createDomainModal}
        {createChannelModal}
        {domainNicknameModal}
        {deleteDomainConfirm}
        {channelContextMenuNode}
        <div className="workspace-grid workspace-grid-compact">
          <aside className="sidebar-merged no-drag">
            <div className="sidebar-merged-head drag-region">
              <div className="rail-brand">
                <img src={WORKSPACE_LOGO_URL} alt="EKKO logo" />
              </div>
              <ProfileAvatar name={user.nick_name} avatar={user.avatar} className="user-avatar no-drag" />
            </div>

            <div className="sidebar-merged-body">
              <aside className="domain-rail">
                <ScrollArea className="domain-list-scroll no-drag" viewportClassName="domain-list">
                  {sortedDomains.map((domain) => (
                    <button
                      key={domain.id}
                      className={`domain-avatar-button ${domain.id === selectedDomainId ? "active" : ""}`}
                      onClick={() => handleOpenDomain(domain.id)}
                      title={domain.domain_name}
                    >
                      <span className={`domain-avatar-tile ${domainAvatars[domain.id] ?? domain.avatar ? "has-image" : ""}`.trim()} aria-hidden="true">
                        {domainAvatars[domain.id] ?? domain.avatar ? <img src={resolveMediaUrl(domainAvatars[domain.id] ?? domain.avatar) ?? ""} alt="" /> : domain.domain_name.slice(0, 1).toUpperCase()}
                      </span>
                    </button>
                  ))}
                </ScrollArea>

                <div className="rail-footer no-drag">
                  <div className="action-strip">
                    <button
                      className="action-square-button"
                      type="button"
                      title={"\u8bbe\u7f6e"}
                      onClick={() => {
                        setSettingsSection("account");
                        setSettingsOpen(true);
                      }}
                    >
                      <span className="action-square-glyph" style={iconMask(SIDEBAR_SET_URL)} aria-hidden="true" />
                    </button>
                    <button className="action-square-button" type="button" title={"\u521b\u5efa\u6216\u52a0\u5165\u57df"} onClick={openDomainEntryCard}>
                      <span className="action-square-glyph" style={iconMask(SIDEBAR_ADD_URL)} aria-hidden="true" />
                    </button>
                    <button className="action-square-button" type="button" title={"\u9000\u51fa\u767b\u5f55"} onClick={logout}>
                      <span className="action-square-glyph" style={iconMask(SIDEBAR_OUT_URL)} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </aside>

              <section className="channel-panel">
                <div className="channel-panel-head">
                  <div className="channel-panel-title-group">
                    <h2>{selectedDomain?.domain_name ?? "\u672a\u9009\u62e9\u57df"}</h2>
                    <div className="domain-id-row">
                      <span>{selectedDomain ? `ID:${formatDomainId(selectedDomain.id)}` : "ID:00000000"}</span>
                      <button className="inline-icon-button domain-copy-button" type="button" title={"\u590d\u5236\u57df ID"} onClick={handleCopyDomainId}>
                        <span className="inline-icon-glyph" style={iconMask(DOMAIN_COPY_URL)} aria-hidden="true" />
                      </button>
                      <small className={`domain-id-feedback ${domainIdCopied ? "visible" : ""}`}>{"\u5df2\u590d\u5236"}</small>
                    </div>
                  </div>
                  <div className="domain-menu-anchor">
                    <button className="inline-icon-button domain-menu-button" type="button" title={"\u66f4\u591a"} onClick={() => setDomainMenuOpen((current) => !current)}>
                      <span className="inline-icon-glyph" style={iconMask(DOMAIN_DOTS_URL)} aria-hidden="true" />
                    </button>
                    {domainMenuOpen ? (
                      <div className="floating-menu">
                        {domainMenuItems.map((item) => (
                          <button key={item.key} className={item.danger ? "danger" : ""} type="button" onClick={() => handleDomainMenuAction(item.key)}>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <ScrollArea className="channel-list-scroll" viewportClassName="channel-list">
                  {orderedChannels.length ? (
                    orderedChannels.map((channel) => (
                      <button
                        key={channel.id}
                        className={`channel-row channel-row-compact ${channel.id === joinedChannelId ? "active joined" : ""}`.trim()}
                        onClick={() => handleSelectChannel(channel)}
                        onDoubleClick={() => handleJoinChannel(channel)}
                        onContextMenu={(event) => handleChannelContextMenu(event, channel)}
                        title={`${channel.channel_name}（双击进入频道）`}
                      >
                        <strong>{channel.channel_name}</strong>
                        <small>{formatCount(getVisibleChannelCount(channel, joinedChannelId, joinedVoiceCount), channel.max_capacity)}</small>
                      </button>
                    ))
                  ) : (
                    <div className="empty-state">{"\u5f53\u524d\u57df\u4e0b\u8fd8\u6ca1\u6709\u9891\u9053\u3002"}</div>
                  )}
                </ScrollArea>
              </section>
            </div>
          </aside>

          <main className="stage-panel no-drag">
            <section className="conversation-panel">
              <div className="conversation-head window-drag-gap">
                <div className="conversation-head-main">
                  <h1>{conversationChannel?.channel_name ?? "\u672a\u8fdb\u5165\u9891\u9053"}</h1>
                  <span>{conversationChannel ? formatCount(getVisibleChannelCount(conversationChannel, joinedChannelId, joinedVoiceCount), conversationChannel.max_capacity) : "--/--"}</span>
                </div>
              </div>

              <div className="conversation-body">
                <section className="call-roster">
                  <ScrollArea className="call-roster-scroll" viewportClassName="call-roster-list">
                    {voiceParticipants.length ? (
                      voiceParticipants.map((participant) => {
                        const name = participant.displayName;
                        const isSelf = participant.isSelf;
                        const isPeerMuted = mutedPeers[participant.identity] ?? false;
                        return (
                          <div key={participant.identity} className={`call-member-row ${isSelf ? "self" : ""}`}>
                            <span className="call-member-name" title={name}>{name}</span>
                            {isSelf ? (
                              <div className="call-member-actions">
                                <HoverVolumeControl
                                  buttonTitle={selfMicMuted ? "\u5f00\u542f\u9ea6\u514b\u98ce" : "\u5173\u95ed\u9ea6\u514b\u98ce"}
                                  glyphUrl={selfMicMuted ? MICROPHONE_SLASH_URL : MICROPHONE_URL}
                                  value={settings.micLevel}
                                  onChange={(value) => setSettings((current) => ({ ...current, micLevel: value }))}
                                  onClick={handleToggleSelfMic}
                                />
                                <HoverVolumeControl
                                  buttonTitle={selfMonitorMuted ? "\u5f00\u542f\u603b\u76d1\u542c" : "\u5173\u95ed\u603b\u76d1\u542c"}
                                  glyphUrl={HEADPHONES_URL}
                                  value={settings.monitorMix}
                                  onChange={(value) => setSettings((current) => ({ ...current, monitorMix: value }))}
                                  active={selfMonitorMuted}
                                  onClick={handleToggleSelfMonitor}
                                />
                                <HoverTextControl buttonTitle="\u9000\u51fa\u9891\u9053" glyphUrl={SIGN_OUT_URL} text="退出通话" danger onClick={handleLeaveChannel} />
                              </div>
                            ) : (
                              <div className="call-member-actions">
                                <HoverVolumeControl
                                  buttonTitle={isPeerMuted ? `恢复 ${name}` : `静音 ${name}`}
                                  glyphUrl={isPeerMuted ? SPEAKER_SLASH_URL : SPEAKER_HIGH_URL}
                                  value={peerVolumes[participant.identity] ?? 76}
                                  onChange={(value) => setPeerVolumes((current) => ({ ...current, [participant.identity]: value }))}
                                  active={isPeerMuted}
                                  onClick={() => handleTogglePeerMute(participant.identity, name)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="empty-state">{"\u5f53\u524d\u6ca1\u6709\u901a\u8bdd\u6210\u5458\u3002"}</div>
                    )}
                  </ScrollArea>
                </section>

                <section className="chat-panel">
                  <div className="chat-panel-head">
                    <div className="chat-panel-title-stack">
                      <strong className="chat-panel-title">
                        <span className="chat-panel-title-icon" style={iconMask(PLANE_URL)} aria-hidden="true" />
                        <span>{"语音消息"}</span>
                        <span
                          className={`voice-input-indicator ${hasActiveVoiceInput ? "is-active" : ""}`.trim()}
                          title={voiceInputIndicatorLabel}
                          aria-label={voiceInputIndicatorLabel}
                          style={{ "--voice-input-level": normalizedLocalInputLevel.toFixed(3) } as CSSProperties}
                        >
                          <span className="voice-input-indicator-bars" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                        </span>
                      </strong>
                    </div>
                    <button
                      className={`summary-button chat-icon-button ${analysisLoading ? "is-busy" : ""}`.trim()}
                      type="button"
                      title="直接判定"
                      onClick={handleSummarizeConversation}
                      disabled={analysisLoading}
                    >
                      <span className="chat-icon-glyph" style={iconMask(AI_SUMMARY_URL)} aria-hidden="true" />
                    </button>
                  </div>
                  <ScrollArea className="chat-log-scroll" viewportClassName="chat-log-list" viewportRef={voiceMessagesViewportRef}>
                    {voiceMessagesLoading ? (
                      <div className="empty-state">正在加载语音消息…</div>
                    ) : displayedVoiceMessages.length ? (
                      displayedVoiceMessages.map((item) => (
                        <article key={item.id} className="voice-message-row">
                          <span className="voice-message-inline">
                            <strong className="voice-message-inline-name">
                              {voiceMessageNameByUserId[item.user.id] ?? item.user.nick_name}:
                            </strong>
                            <span
                              className={`voice-message-inline-text ${item.transcript_text ? "" : "is-pending"} ${item.is_excited ? "is-excited" : ""}`.trim()}
                              title={item.transcript_text || "识别中…"}
                            >
                              {item.transcript_text || "识别中…"}
                            </span>
                            <span className="voice-message-inline-meta">
                              ({formatVoiceMessageTime(item.created_at)})
                            </span>
                          </span>
                          <button
                            className={`voice-message-action-button ${playingVoiceMessageId === item.id ? "is-playing" : ""}`.trim()}
                            type="button"
                            title={playingVoiceMessageId === item.id ? "停止播放" : "播放"}
                            aria-label={playingVoiceMessageId === item.id ? "停止播放" : "播放"}
                            onClick={() => void handlePlayVoiceMessage(item)}
                          >
                            <span className="voice-message-action-glyph" style={iconMask(PLAY_LIGHT_URL)} aria-hidden="true" />
                          </button>
                          <button
                            className={`voice-message-action-button voice-message-download-button ${
                              downloadingVoiceMessageId === item.id ? "is-downloading" : ""
                            } ${downloadedVoiceMessageId === item.id ? "is-downloaded" : ""}`.trim()}
                            type="button"
                            title={downloadedVoiceMessageId === item.id ? "已保存" : "下载"}
                            aria-label={downloadedVoiceMessageId === item.id ? "已保存" : "下载"}
                            disabled={downloadingVoiceMessageId === item.id}
                            onClick={() => void handleDownloadVoiceMessage(item)}
                          >
                            <span className="voice-message-action-glyph" style={iconMask(DOWNLOAD_URL)} aria-hidden="true" />
                            <span className="voice-message-download-feedback" aria-hidden="true">已保存</span>
                          </button>
                        </article>
                      ))
                    ) : (
                      <div className="empty-state">当前频道还没有语音消息。</div>
                    )}
                  </ScrollArea>
                </section>
              </div>
            </section>

            <aside className="members-panel">
              <div className="members-panel-spacer" />
              <ScrollArea className="members-scroll" viewportClassName="members-list">
                <section className="member-role-group">
                  <h3>{"\u57df\u4e3b"}</h3>
                  {domainMembers.owner.map((member) => (
                    <div key={`owner-${member.id}`} className="member-directory-row">
                      <span className={`member-directory-avatar ${member.avatar ? "has-image" : ""}`.trim()} aria-hidden="true">
                        {member.avatar ? <img src={resolveMediaUrl(member.avatar) ?? ""} alt="" /> : member.domainNickname.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="member-directory-name" title={member.domainNickname}>{member.domainNickname}</span>
                    </div>
                  ))}
                </section>
                <section className="member-role-group">
                  <h3>{"\u7ba1\u7406\u5458"}</h3>
                  {domainMembers.admins.map((member) => (
                    <div key={`admin-${member.id}`} className="member-directory-row">
                      <span className={`member-directory-avatar ${member.avatar ? "has-image" : ""}`.trim()} aria-hidden="true">
                        {member.avatar ? <img src={resolveMediaUrl(member.avatar) ?? ""} alt="" /> : member.domainNickname.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="member-directory-name" title={member.domainNickname}>{member.domainNickname}</span>
                    </div>
                  ))}
                </section>
                <section className="member-role-group">
                  <h3>{"\u6210\u5458"}</h3>
                  {domainMembers.members.map((member) => (
                    <div key={`member-${member.id}`} className="member-directory-row">
                      <span className={`member-directory-avatar ${member.avatar ? "has-image" : ""}`.trim()} aria-hidden="true">
                        {member.avatar ? <img src={resolveMediaUrl(member.avatar) ?? ""} alt="" /> : member.domainNickname.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="member-directory-name" title={member.domainNickname}>{member.domainNickname}</span>
                    </div>
                  ))}
                </section>
              </ScrollArea>
            </aside>
          </main>
        </div>

        {analysisRangeModal}
        {analysisModal}
      </div>
    </SceneFrame>
  );
}










