import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', '.data');
const DB_FILE = path.join(DATA_DIR, 'polytechnic_hub.json');

export type UserRole = 'student' | 'admin';

export interface DbUser {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  avatarUrl: string;
  gender: '' | 'male' | 'female';
  showGender: boolean;
  bio: string;
  department: string;
  semester: number;
  collegeName: string;
  instituteName: string;
  rollNumber: string;
  profileVisibility: 'public' | 'department' | 'private';
  createdAt: string;
  updatedAt: string;
}

export type PublicUser = Omit<DbUser, 'passwordHash'>;

export interface DbFormulaSymbol {
  symbol: string;
  meaningBn: string;
  meaningEn: string;
  unit?: string;
}

export interface DbFormulaItem {
  id: string;
  subject: 'physics' | 'mathematics';
  chapter: string;
  chapterBn: string;
  nameEn: string;
  nameBn: string;
  expressionLatex: string;
  expressionPlain: string;
  symbols: DbFormulaSymbol[];
  explanationBn: string;
  explanationEn: string;
  exampleProblemBn: string;
  exampleProblemEn: string;
  exampleSolutionBn: string;
  exampleSolutionEn: string;
  isCustom?: boolean;
  updatedAt?: string;
}

export interface DbNotice {
  id: string;
  title: string;
  body: string;
  category: 'general' | 'exam' | 'result' | 'urgent';
  officialLink: string;
  pinned: boolean;
  createdAt: string;
}

export interface DbSharedNote {
  id: string;
  title: string;
  department: string;
  semester: number;
  subjectCode: string;
  summary: string;
  pdfUrl: string;
  downloadPermitted: boolean;
  createdAt: string;
}

export interface DbMcq {
  id: string;
  category: string;
  department: string;
  semester: number;
  questionBn: string;
  optionsBn: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanationBn: string;
  createdAt: string;
}

export interface DbCommunityReply {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  body: string;
  createdAt: string;
}

export interface DbCommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorDepartment: string;
  authorRole: UserRole;
  department: string;
  semester: number;
  subjectTag: string;
  title: string;
  body: string;
  reportsCount: number;
  isHidden: boolean;
  replies: DbCommunityReply[];
  createdAt: string;
}

export interface DbAiConfig {
  activeModel: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  thinkingLevel: 'LOW' | 'MEDIUM';
  conciseByDefault: boolean;
  maxHistoryTurns: number;
  customSystemAddon: string;
  updatedAt: string;
}

export interface DbUsageStats {
  totalAiRequests: number;
  aiErrorsCount: number;
  totalAiLatencyMs: number;
  lastAiRequestAt: string;
  requestsByMode: Record<'general' | 'explain' | 'math' | 'power' | 'recommend', number>;
}

export interface DbAppConfig {
  appVersion: string;
  apkStatus: 'coming_soon' | 'available';
  apkDownloadUrl: string;
  apkReleaseNotes: string;
  btebResultUrl: string;
  officialWebsiteUrl: string;
  updatedAt: string;
}

export interface DatabaseSchema {
  users: DbUser[];
  notices: DbNotice[];
  sharedNotes: DbSharedNote[];
  mcqs: DbMcq[];
  communityPosts: DbCommunityPost[];
  customFormulas: DbFormulaItem[];
  deletedFormulaIds: string[];
  aiConfig: DbAiConfig;
  usageStats: DbUsageStats;
  appConfig: DbAppConfig;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const keyBuf = Buffer.from(key, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(keyBuf, derived);
}

export function toPublicUser(user: DbUser): PublicUser {
  const { passwordHash: _omitted, ...rest } = user;
  return rest;
}

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'CHANGE_ME_IN_PRODUCTION_32_CHARS_MIN') {
    return process.env.SESSION_SECRET;
  }
  const fallbackSeed = process.env.GEMINI_API_KEY || 'polytechnic-hub-local-dev-secret-v2';
  return crypto.createHash('sha256').update(fallbackSeed).digest('hex');
}

export interface TokenPayload {
  sub: string;
  role: UserRole;
  exp: number;
}

export function signAuthToken(user: DbUser): string {
  const payload: TokenPayload = {
    sub: user.id,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAuthToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.sub || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function createInitialDb(): DatabaseSchema {
  const now = new Date().toISOString();
  return {
    users: [],
    notices: [
      {
        id: 'notice-bteb-probidhan',
        title: 'BTEB প্রবিধান-২০২২ ও অফিশিয়াল ওয়েবসাইট পোর্টাল',
        body: 'ডিপ্লোমা-ইন-ইঞ্জিনিয়ারিং প্রবিধান-২০২২ অনুযায়ী সিলেবাস ও একাডেমিক বিজ্ঞপ্তির জন্য বাংলাদেশ কারিগরি শিক্ষা বোর্ডের (BTEB) অফিশিয়াল ওয়েবসাইট অনুসরণ করুন। আপনার ব্যক্তিগত PDF সমূহ "আমার PDF লাইব্রেরি" তে নিরাপদে সংরক্ষণ করুন।',
        category: 'general',
        officialLink: 'https://bteb.gov.bd/',
        pinned: true,
        createdAt: now,
      },
      {
        id: 'notice-bteb-result-portal',
        title: 'BTEB অফিশিয়াল রেজাল্ট যাচাই নির্দেশিকা',
        body: 'যেকোনো সেমিস্টার পরীক্ষার ফলাফল দেখতে Polytechnic Hub-এর BTEB Result সেকশন ব্যবহার করে সরাসরি অফিশিয়াল রেজাল্ট পোর্টালে (result.bteb.gov.bd) রোল ও রেগুলেশন দিয়ে যাচাই করুন।',
        category: 'result',
        officialLink: 'https://result.bteb.gov.bd/result-search',
        pinned: false,
        createdAt: now,
      },
    ],
    sharedNotes: [],
    mcqs: [],
    communityPosts: [
      {
        id: 'post-welcome-power',
        authorId: 'system-guide',
        authorName: 'Polytechnic Hub Editorial',
        authorDepartment: 'power',
        authorRole: 'admin',
        department: 'power',
        semester: 4,
        subjectTag: '27141 — IC Engine',
        title: 'ফোর-স্ট্রোক ডিজেল ইঞ্জিনে ভালভ ওভারল্যাপ (Valve Overlap) কেন রাখা হয়?',
        body: 'পাওয়ার টেকনোলজির শিক্ষার্থীদের জন্য পরীক্ষার একটি গুরুত্বপূর্ণ প্রশ্ন: Exhaust স্ট্রোকের শেষ প্রান্তে এবং Suction স্ট্রোকের শুরুতে ইনলেট ও এগজস্ট ভালভ কিছু ডিগ্রি একসাথে খোলা থাকে। এতে সিলিন্ডার থেকে পোড়া গ্যাস সম্পূর্ণ বের হতে (Scavenging) সাহায্য করে। আপনাদের প্র্যাকটিক্যাল ক্লাসের অভিজ্ঞতা বা প্রশ্ন এখানে শেয়ার করুন।',
        reportsCount: 0,
        isHidden: false,
        replies: [],
        createdAt: now,
      },
    ],
    customFormulas: [],
    deletedFormulaIds: [],
    aiConfig: {
      activeModel: 'gemini-3.1-flash-lite',
      thinkingLevel: 'LOW',
      conciseByDefault: false,
      maxHistoryTurns: 8,
      customSystemAddon: '',
      updatedAt: now,
    },
    usageStats: {
      totalAiRequests: 0,
      aiErrorsCount: 0,
      totalAiLatencyMs: 0,
      lastAiRequestAt: '',
      requestsByMode: {
        general: 0,
        explain: 0,
        math: 0,
        power: 0,
        recommend: 0,
      },
    },
    appConfig: {
      appVersion: '2.0.0',
      apkStatus: 'coming_soon',
      apkDownloadUrl: '',
      apkReleaseNotes:
        'Android Capacitor প্রজেক্ট কনফিগার করা হয়েছে। রিলিজ APK বিল্ড ও হোস্ট সম্পন্ন হলে এখান থেকে সরাসরি ডাউনলোড করা যাবে।',
      btebResultUrl: 'https://result.bteb.gov.bd/result-search',
      officialWebsiteUrl: 'https://bteb.gov.bd/',
      updatedAt: now,
    },
  };
}

function ensureAdminFromEnv(db: DatabaseSchema): boolean {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword || adminPassword.length < 6) {
    return false;
  }
  const existing = db.users.find((u) => u.email.toLowerCase() === adminEmail);
  const now = new Date().toISOString();
  if (existing) {
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      existing.updatedAt = now;
      return true;
    }
    return false;
  }
  db.users.push({
    id: `usr-${crypto.randomUUID()}`,
    fullName: 'Polytechnic Hub Admin',
    email: adminEmail,
    passwordHash: hashPassword(adminPassword),
    role: 'admin',
    avatarUrl: '',
    gender: '',
    showGender: false,
    bio: 'Platform Administrator',
    department: 'power',
    semester: 4,
    collegeName: 'Polytechnic Hub HQ',
    instituteName: 'Polytechnic Hub HQ',
    rollNumber: '',
    profileVisibility: 'department',
    createdAt: now,
    updatedAt: now,
  });
  return true;
}

class FileDatabase {
  private cache: DatabaseSchema | null = null;

  load(): DatabaseSchema {
    if (this.cache) {
      return this.cache;
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) {
      const initial = createInitialDb();
      ensureAdminFromEnv(initial);
      this.save(initial);
      this.cache = initial;
      return initial;
    }
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
      const fallback = createInitialDb();
      const merged: DatabaseSchema = {
        users: Array.isArray(parsed.users)
          ? parsed.users.map((u) => ({
              ...u,
              avatarUrl: u.avatarUrl ?? '',
              gender: u.gender ?? '',
              showGender: u.showGender ?? false,
              bio: u.bio ?? '',
              collegeName: u.collegeName ?? u.instituteName ?? '',
              profileVisibility: u.profileVisibility ?? 'department',
            }))
          : [],
        notices: Array.isArray(parsed.notices) ? parsed.notices : fallback.notices,
        sharedNotes: Array.isArray(parsed.sharedNotes) ? parsed.sharedNotes : [],
        mcqs: Array.isArray(parsed.mcqs) ? parsed.mcqs : [],
        communityPosts: Array.isArray(parsed.communityPosts)
          ? parsed.communityPosts
          : fallback.communityPosts,
        customFormulas: Array.isArray(parsed.customFormulas) ? parsed.customFormulas : [],
        deletedFormulaIds: Array.isArray(parsed.deletedFormulaIds) ? parsed.deletedFormulaIds : [],
        aiConfig: {
          ...fallback.aiConfig,
          ...(parsed.aiConfig ?? {}),
        },
        usageStats: {
          ...fallback.usageStats,
          ...(parsed.usageStats ?? {}),
          requestsByMode: {
            ...fallback.usageStats.requestsByMode,
            ...(parsed.usageStats?.requestsByMode ?? {}),
          },
        },
        appConfig: {
          ...fallback.appConfig,
          ...(parsed.appConfig ?? {}),
        },
      };
      if (ensureAdminFromEnv(merged)) {
        this.save(merged);
      }
      this.cache = merged;
      return merged;
    } catch {
      const reset = createInitialDb();
      ensureAdminFromEnv(reset);
      this.save(reset);
      this.cache = reset;
      return reset;
    }
  }

  save(data: DatabaseSchema): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
    this.cache = data;
  }

  mutate<T>(updater: (db: DatabaseSchema) => T): T {
    const db = this.load();
    const result = updater(db);
    this.save(db);
    return result;
  }
}

export const dbStore = new FileDatabase();
