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
}
