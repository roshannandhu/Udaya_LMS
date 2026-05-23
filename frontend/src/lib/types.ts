export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  is_admin: boolean;
  created_at: string;
}

export interface Standard {
  id: string;
  name: string;
  short?: string;
  emoji: string;
  teacher_id: string;
  start_date?: string;
  end_date?: string;
  auto_delete_days?: number;
  created_at: string;
}

export interface SubjectClass {
  id: string;
  standard_id: string;
  name: string;
  emoji: string;
  end_date?: string;
  created_at: string;
}

export interface Student {
  id: string;
  supabase_user_id: string;
  name: string;
  username: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  standard_id: string;
  points: number;
  attendance: number;
  avg_score: number;
  blocked: boolean;
  first_login: boolean;
  created_at: string;
}

export interface StudentSession {
  id: string;
  student_id: string;
  device_fingerprint: string;
  last_active_at: string;
  created_at: string;
}

export interface Video {
  id: string;
  class_id: string;
  title: string;
  description?: string;
  storage_path?: string;
  cloudflare_video_id?: string;
  duration_secs?: number;
  size_bytes?: number;
  allow_download: boolean;
  created_by: string;
  created_at: string;
}

export interface VideoProgress {
  video_id: string;
  student_id: string;
  progress_secs: number;
  completed: boolean;
  downloaded: boolean;
  last_watched_at: string;
}

export interface Test {
  id: string;
  class_id: string;
  title: string;
  duration_mins: number;
  total_marks: number;
  negative_marking: boolean;
  penalty: number;
  status: 'draft' | 'scheduled' | 'active' | 'completed';
  scheduled_for?: string;
  created_by: string;
  created_at: string;
}

export interface Question {
  id: string;
  test_id: string;
  question: string;
  options: string[];
  correct_idx: number;
  order_num: number;
}

export interface TestAttempt {
  id: string;
  test_id: string;
  student_id: string;
  answers: Record<string, number>;
  score?: number;
  correct_count?: number;
  wrong_count?: number;
  marks_deducted: number;
  points_earned: number;
  flagged: boolean;
  cheat_events: CheatEvent[];
  started_at: string;
  submitted_at?: string;
}

export interface CheatEvent {
  type: 'blur' | 'visibility' | 'copy' | 'paste';
  timestamp: string;
  detail?: string;
}

export interface Broadcast {
  id: string;
  standard_id: string;
  sender_id: string;
  text?: string;
  attachments: BroadcastAttachment[];
  pinned: boolean;
  deleted: boolean;
  edited: boolean;
  scheduled_for?: string;
  created_at: string;
  updated_at: string;
}

export interface BroadcastAttachment {
  name: string;
  url: string;
  type: 'image' | 'pdf' | 'doc' | 'other';
}

export interface BroadcastRead {
  broadcast_id: string;
  student_id: string;
  read_at: string;
}

export interface InviteLink {
  id: string;
  code: string;
  standard_id: string;
  created_by: string;
  expires_at?: string;
  max_uses: number;
  use_count: number;
  created_at: string;
}

export interface InviteRequest {
  id: string;
  invite_code: string;
  student_name: string;
  student_email?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface Reminder {
  id: string;
  teacher_id: string;
  title: string;
  scheduled_for: string;
  context?: string;
  done: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  recipient_id: string;
  recipient_type: 'teacher' | 'student';
  type: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'teacher' | 'student';
  username?: string;
  student_id?: string;
  teacher_id?: string;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  username: string;
  avatar_url?: string;
  points: number;
  rank: number;
}