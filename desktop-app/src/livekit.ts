import {
  Room,
  createLocalAudioTrack,
  type AudioCaptureOptions,
  type LocalAudioTrack,
  type RemoteAudioTrack,
  type RoomOptions,
  type TrackPublishOptions,
} from "livekit-client";

export const defaultVoiceRoomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  stopLocalTrackOnUnpublish: true,
};

export function createVoiceRoom(options: RoomOptions = defaultVoiceRoomOptions) {
  return new Room(options);
}

export function buildMicrophoneCaptureOptions(inputDeviceId: string, noiseSuppression: boolean): AudioCaptureOptions {
  return {
    deviceId: inputDeviceId === "default" ? undefined : inputDeviceId,
    noiseSuppression,
    echoCancellation: true,
    autoGainControl: true,
  };
}

export async function createMicrophoneTrack(captureOptions?: AudioCaptureOptions): Promise<LocalAudioTrack> {
  return createLocalAudioTrack(captureOptions);
}

export async function createPublishedMicrophoneTrack(
  room: Room,
  captureOptions?: AudioCaptureOptions,
  publishOptions?: TrackPublishOptions,
): Promise<LocalAudioTrack> {
  const track = await createLocalAudioTrack(captureOptions);
  await room.localParticipant.publishTrack(track, publishOptions);
  return track;
}

export async function syncLocalMicrophoneMute(track: LocalAudioTrack, muted: boolean) {
  if (muted) {
    await track.mute();
    return;
  }

  await track.unmute();
}

export function attachRemoteAudioTrack(track: RemoteAudioTrack): HTMLAudioElement {
  const element = track.attach() as HTMLAudioElement;
  element.autoplay = true;
  return element;
}

export function detachRemoteAudioElements(track: RemoteAudioTrack, element?: HTMLMediaElement | null) {
  if (element) {
    track.detach(element);
    element.srcObject = null;
    element.remove();
    return;
  }

  track.detach().forEach((detached) => {
    if (detached instanceof HTMLMediaElement) {
      detached.srcObject = null;
      detached.remove();
    }
  });
}

export function disconnectVoiceRoom(room: Room | null | undefined) {
  if (!room) {
    return;
  }

  room.disconnect();
}

export async function unpublishLocalMicrophoneTrack(room: Room | null | undefined, track: LocalAudioTrack | null | undefined) {
  if (!room || !track) {
    return;
  }

  try {
    await room.localParticipant.unpublishTrack(track);
  } catch {
    // Ignore unpublish failures during teardown and continue cleaning up local media.
  }
}
