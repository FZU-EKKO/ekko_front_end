export interface UserInfo {
  id: string;
  avatar: string | null;
  nick_name: string;
  email: string;
  status?: string;
  voice_settings?: Record<string, unknown> | null;
  last_online_time?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuthResponse {
  token: string;
  user_info: UserInfo;
}

export interface UserSettingsResponse {
  settings: Record<string, unknown>;
}

export interface Domain {
  id: string;
  create_id: string;
  avatar?: string | null;
  domain_name: string;
  slug?: string;
  description: string | null;
  is_public: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Channel {
  id: number;
  domain_id: string;
  channel_name: string;
  description: string | null;
  create_id: string;
  max_capacity: number;
  current_voice_count: number;
  channel_type: string;
  sort_order?: number;
  is_private?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DomainMemberInfo {
  domain_id: string;
  member_id: string;
  alias: string | null;
  join_time: string;
  role: "owner" | "admin" | "member";
  nick_name?: string | null;
  avatar?: string | null;
  email?: string | null;
}

export type VoiceConnectionState = "idle" | "joining" | "connected" | "reconnecting" | "disconnected" | "failed";

export interface VoiceJoinResponse {
  serverUrl: string;
  token: string;
  roomName: string;
  participantIdentity: string;
  participantName?: string;
}

export interface VoiceParticipant {
  identity: string;
  displayName: string;
  isSelf: boolean;
  isMuted: boolean;
  audioEnabled: boolean;
  isSpeaking: boolean;
}

export interface VoiceMessageUserInfo {
  id: string;
  nick_name: string;
  avatar: string | null;
}

export interface VoiceMessage {
  id: number;
  channel_id: number;
  user_id: string;
  client_message_id?: string | null;
  audio_path: string;
  audio_duration_ms: number;
  audio_format: string;
  mime_type?: string | null;
  file_size: number;
  transcript_text?: string | null;
  transcription_status: "pending" | "processing" | "done" | "failed" | "dropped";
  waveform?: number[] | null;
  avg_amplitude?: number | null;
  avg_frequency?: number | null;
  is_excited: boolean;
  created_at: string;
  updated_at: string;
  user: VoiceMessageUserInfo;
}

export interface VoiceMessagePage {
  total: number;
  voice_messages: VoiceMessage[];
}

export interface ChannelAnalysisResponse {
  report: string;
  prompt: string;
  source_count: number;
  truncated: boolean;
  start_time?: string | null;
  end_time?: string | null;
}
