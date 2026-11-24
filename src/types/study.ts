export type DepartmentId =
  | 'power'
  | 'eee'
  | 'cst'
  | 'civil'
  | 'mech'
  | 'ent'
  | 'rac'
  | 'auto'
  | 'telecom'
  | 'arch'
  | 'survey'
  | 'chem'
  | 'env'
  | 'food'
  | 'textile';

export type SemesterNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type AppView =
  | 'dashboard'
  | 'notifications'
  | 'pdf-library'
  | 'formulas'
  | 'result'
  | 'ai'
  | 'tools'
  | 'profile'
  | 'subjects'
  | 'routine'
  | 'timer'
  | 'quiz'
  | 'notes'
  | 'community'
  | 'progress'
  | 'install'
  | 'settings'
  | 'admin';

export type ThemeMode = 'dark' | 'light';
export type LanguageMode = 'bn' | 'en';
export type UserRole = 'student' | 'admin';

export type DayOfWeek =
  | 'শনিবার'
  | 'রবিবার'
  | 'সোমবার'
  | 'মঙ্গলবার'
  | 'বুধবার'
  | 'বৃহস্পতিবার'
  | 'শুক্রবার';

export interface Department {
  id: DepartmentId;
  shortName: string;
  nameBn: string;
  nameEn: string;
  descriptionBn: string;
  descriptionEn: string;
}

export interface StudyMaterial {
  id: string;
  titleBn: string;
  type: 'pdf-guide' | 'formula-sheet' | 'syllabus';
  summaryBn: string;
  keyPointsBn: string[];
  formulas?: string[];
  externalUrl?: string;
}

export interface PracticalGuide {
  id: string;
  titleBn: string;
  objectiveBn: string;
  apparatusBn: string[];
  stepsBn: string[];
  precautionsBn: string[];
}

export type CircuitDiagramType =
  | 'power-grid-single-line'
  | 'steam-power-plant'
  | 'star-delta-3phase'
  | 'dc-series-parallel'
  | 'transformer-circuit'
  | 'bridge-rectifier';

export interface Chapter {
  id: string;
  number: number;
  titleBn: string;
  topicsBn: string[];
  estimatedMinutes: number;
}

export interface SubjectOffering {
  department: DepartmentId;
  semester: SemesterNumber;
}

export interface Subject {
  id: string;
  code: string;
  nameBn: string;
  nameEn?: string;
  department: DepartmentId | 'common';
  semester: SemesterNumber;
  offerings?: SubjectOffering[];
  credits: number;
  theoryPeriods?: number;
  practicalPeriods?: number;
  probidhan?: '2022';
  chapters: Chapter[];
  materials: StudyMaterial[];
  practicalGuides?: PracticalGuide[];
  diagramTypes?: CircuitDiagramType[];
}

export interface StudyTask {
  id: string;
  title: string;
  subjectCode?: string;
  subjectName: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  completed: boolean;
  priority: 'উচ্চ' | 'মধ্যম' | 'সাধারণ';
  createdAt: string;
}

export interface ScheduledStudySession {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  reminderEnabled: boolean;
}

export type AlarmTone = 'classic' | 'chime' | 'gentle';

export interface StudyAlarm {
  id: string;
  time: string; // HH:MM (24-hour Asia/Dhaka)
  label: string;
  enabled: boolean;
  days: DayOfWeek[]; // empty = one-time alarm, non-empty = repeats on selected days
  tone: AlarmTone;
  snoozedUntil?: string | null;
  createdAt: string;
}

export interface TimeSettings {
  studyStartTime: string;
  studyEndTime: string;
  dailyDurationMinutes: number;
  notificationsEnabled: boolean;
  reminderMinutesBefore: number;
  sessions: ScheduledStudySession[];
  alarms: StudyAlarm[];
}

export interface CompletedTimerSession {
  id: string;
  label: string;
  plannedMinutes: number;
  completedMinutes: number;
  completedAt: string;
  mode?: 'countdown' | 'pomodoro' | 'stopwatch';
}

export interface StudyNote {
  id: string;
  title: string;
  content: string;
  subjectId?: string;
  subjectName?: string;
  pinned: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface McqQuestion {
  id: string;
  category: string;
  department: DepartmentId | 'common';
  semester?: SemesterNumber;
  questionBn: string;
  optionsBn: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanationBn: string;
}

export interface QuizAttempt {
  id: string;
  category: string;
  totalQuestions: number;
  correctAnswers: number;
  scorePercent: number;
  timeTakenSeconds: number;
  completedAt: string;
}

export type AiAssistantMode = 'general' | 'explain' | 'math' | 'power' | 'recommend';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  mode: AiAssistantMode;
  timestamp: string;
  isError?: boolean;
}

export interface AiChatSession {
  id: string;
  title: string;
  messages: AiChatMessage[];
  updatedAt: string;
  createdAt: string;
}

export interface UserSettings {
  studentName: string;
  collegeName?: string;
  avatarDataUrl?: string;
  coverDataUrl?: string;
  department: DepartmentId;
  semester: SemesterNumber;
  theme: ThemeMode;
  language: LanguageMode;
  showEnglishTerms: boolean;
  weeklyStudyGoalHours?: number;
}

export interface StudyMateState {
  settings: UserSettings;
  timeSettings: TimeSettings;
  timerHistory: CompletedTimerSession[];
  tasks: StudyTask[];
  notes: StudyNote[];
  completedChapterIds: string[];
  quizHistory: QuizAttempt[];
  aiMessages: AiChatMessage[];
  aiSessions: AiChatSession[];
  activeAiSessionId: string;
  favoriteFormulaIds: string[];
  recentPdfIds: string[];
  readNoticeIds: string[];
}

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  avatarUrl: string;
  coverUrl?: string;
  gender: '' | 'male' | 'female';
  showGender: boolean;
  bio: string;
  department: string;
  semester: number;
  collegeName: string;
  instituteName: string;
  rollNumber: string;
  profileVisibility: 'public' | 'department' | 'private';
  firebaseUid?: string;
  isDisabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicStudentProfile {
  id: string;
  fullName: string;
  role: UserRole;
  avatarUrl: string;
  coverUrl: string;
  bio: string;
  department: string;
  semester: number;
  collegeName: string;
  gender?: '' | 'male' | 'female';
  showGender?: boolean;
  profileVisibility: 'public' | 'department' | 'private';
  createdAt: string;
  postsCount: number;
}

export type FormulaSubjectCategory = 'physics' | 'mathematics';

export interface FormulaSymbol {
  symbol: string;
  meaningBn: string;
  meaningEn: string;
  unit?: string;
}

export interface FormulaItem {
  id: string;
  subject: FormulaSubjectCategory;
  chapter: string;
  chapterBn: string;
  nameEn: string;
  nameBn: string;
  expressionLatex: string;
  expressionPlain: string;
  symbols: FormulaSymbol[];
  explanationBn: string;
  explanationEn: string;
  exampleProblemBn: string;
  exampleProblemEn: string;
  exampleSolutionBn: string;
  exampleSolutionEn: string;
  isCustom?: boolean;
  updatedAt?: string;
}

export interface UserPdfRecord {
  id: string;
  userId: string;
  customTitle: string;
  originalFilename: string;
  storagePath: string;
  fileSizeBytes: number;
  mimeType: string;
  department?: string;
  semester?: number;
  subjectName?: string;
  sourceBackend?: 'supabase' | 'server';
  createdAt: string;
  updatedAt: string;
}

export interface PlatformNotice {
  id: string;
  title: string;
  body: string;
  category: 'general' | 'exam' | 'result' | 'urgent';
  officialLink: string;
  pinned: boolean;
  createdAt: string;
}

export interface SharedPdfNote {
  id: string;
  title: string;
  department: string;
  semester: number;
  subjectCode: string;
  summary: string;
  pdfUrl: string;
  storagePath?: string;
  fileSizeBytes?: number;
  downloadPermitted: boolean;
  createdAt: string;
}

export interface CommunityReply {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  authorAvatarUrl?: string;
  body: string;
  createdAt: string;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  authorCollegeName?: string;
  authorDepartment: string;
  authorRole: UserRole;
  department: string;
  semester: number;
  subjectTag: string;
  title: string;
  body: string;
  imageUrl?: string;
  likedByUserIds?: string[];
  reportsCount: number;
  isHidden: boolean;
  replies: CommunityReply[];
  createdAt: string;
}

export interface AppReleaseConfig {
  appVersion: string;
  apkStatus: 'coming_soon' | 'available';
  apkDownloadUrl: string;
  apkReleaseNotes: string;
  btebResultUrl: string;
  officialWebsiteUrl: string;
  updatedAt: string;
}

export interface AdminAiConfig {
  activeModel: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  thinkingLevel: 'LOW' | 'MEDIUM';
  conciseByDefault: boolean;
  maxHistoryTurns: number;
  customSystemAddon: string;
  updatedAt: string;
}

export interface AdminUsageMetrics {
  totalAiRequests: number;
  aiErrorsCount: number;
  averageAiLatencyMs: number;
  lastAiRequestAt: string;
  requestsByMode: Record<AiAssistantMode, number>;
  serverUptimeSeconds: number;
  totalLocalUsers: number;
  totalUserPdfs: number;
  totalPhysicsFormulas: number;
  totalMathFormulas: number;
  totalCommunityPosts: number;
  totalMcqs: number;
  totalNotices: number;
}

export interface OfflinePdfRecord {
  id: string;
  title: string;
  subjectCode?: string;
  department?: string;
  semester?: number;
  sourceType: 'pdf-blob' | 'study-pack';
  mimeType: string;
  sizeBytes: number;
  blob?: Blob;
  textContent?: string;
  savedAt: string;
}

export type PushCategory = 'APP_UPDATE' | 'IMPORTANT' | 'EDUCATION' | 'EMERGENCY' | 'GENERAL';
export type PushAudienceType = 'all' | 'selected_users' | 'department_semester';
export type PushSoundMode = 'custom' | 'default' | 'silent';

export interface DeviceTokenRecord {
  id: string;
  userId: string;
  token: string;
  platform: 'web' | 'android' | 'ios';
  browserOrDevice: string;
  appVersion: string;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  pushEnabled: boolean;
  soundEnabled: boolean;
  soundStyle: 'chime' | 'alert' | 'soft' | 'bell' | 'system';
  allowAppUpdate: boolean;
  allowImportant: boolean;
  allowEducation: boolean;
  allowEmergency: boolean;
  allowGeneral: boolean;
  respectDnd: boolean;
  updatedAt: string;
}

export interface UserNotificationItem {
  id: string;
  notificationId: string;
  userId: string;
  title: string;
  body: string;
  category: PushCategory;
  imageUrl: string;
  targetView: string;
  actionUrl: string;
  isRead: boolean;
  readAt: string;
  deliveredVia: 'fcm_and_in_app' | 'in_app' | 'web_push';
  createdAt: string;
}

export interface PushNotificationCampaign {
  id: string;
  title: string;
  body: string;
  category: PushCategory;
  imageUrl: string;
  targetView: string;
  actionUrl: string;
  audienceType: PushAudienceType;
  targetUserIds: string[];
  targetDepartment: string;
  targetSemester: number | null;
  soundMode: PushSoundMode;
  status: 'sent' | 'partial' | 'failed';
  totalRecipients: number;
  fcmSentCount: number;
  fcmFailedCount: number;
  createdBy: string;
  createdAt: string;
}

export interface ScheduledPushNotification {
  id: string;
  title: string;
  body: string;
  category: PushCategory;
  imageUrl: string;
  targetView: string;
  actionUrl: string;
  audienceType: PushAudienceType;
  targetUserIds: string[];
  targetDepartment: string;
  targetSemester: number | null;
  soundMode: PushSoundMode;
  scheduledFor: string;
  status: 'pending' | 'processing' | 'sent' | 'cancelled' | 'failed';
  sentNotificationId: string;
  errorMessage: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPushStats {
  totalCampaigns: number;
  totalPendingScheduled: number;
  totalRecipientsReached: number;
  totalFcmSent: number;
  totalFcmFailed: number;
  totalInboxRead: number;
  totalInboxDelivered: number;
  activeWebDevices: number;
  activeAndroidDevices: number;
}

export interface AdminPushDashboardData {
  fcmConfigured: boolean;
  supabaseServiceConfigured: boolean;
  history: PushNotificationCampaign[];
  scheduled: ScheduledPushNotification[];
  stats: AdminPushStats;
}

