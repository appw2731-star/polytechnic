import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  dbStore,
  hashPassword,
  signAuthToken,
  toPublicUser,
  verifyAuthToken,
  verifyPassword,
  type DbAiConfig,
  type DbAiSession,
  type DbCommunityPost,
  type DbDeviceToken,
  type DbFormulaItem,
  type DbMcq,
  type DbNotice,
  type DbNotificationCampaign,
  type DbNotificationPreference,
  type DbScheduledNotification,
  type DbSharedNote,
  type DbUser,
  type DbUserNotification,
  type PublicUser,
  type PushAudienceType,
  type PushCategory,
  type PushSoundMode,
  type UserRole,
} from './server/database.ts';
import { dispatchFcmMessage, isFcmAdminConfigured } from './server/fcmAdmin.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const SERVER_STARTED_AT = Date.now();
const PRIMARY_ADMIN_EMAIL = (process.env.ADMIN_EMAIL?.trim() || 'webrokib@gmail.com').toLowerCase();

function isPrimaryAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL);
}

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const FIREBASE_APPLET_CONFIG = (() => {
  try {
    const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
        projectId?: string;
        apiKey?: string;
      };
    }
  } catch {
    // ignore invalid config json
  }
  return {};
})();
const FIREBASE_PROJECT_ID = (() => {
  const direct = (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();
  if (direct) return direct;
  if (FIREBASE_APPLET_CONFIG.projectId) {
    return String(FIREBASE_APPLET_CONFIG.projectId).trim();
  }
  try {
    const rawSa = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
    if (rawSa) {
      const parsed = JSON.parse(rawSa) as { project_id?: string };
      return String(parsed.project_id || '').trim();
    }
  } catch {
    // ignore malformed json
  }
  return '';
})();
const FIREBASE_API_KEY =
  (process.env.VITE_FIREBASE_API_KEY || '').trim() ||
  String(FIREBASE_APPLET_CONFIG.apiKey || '').trim();
const PDF_FILES_DIR = path.resolve(__dirname, '.data', 'pdfs');

type AiMode = 'general' | 'explain' | 'math' | 'power' | 'recommend';
type LanguageCode = 'bn' | 'en';

interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

interface AiAskBody {
  sessionId?: string;
  isRetry?: boolean;
  message?: string;
  mode?: AiMode;
  language?: LanguageCode;
  departmentName?: string;
  semesterLabel?: string;
  concise?: boolean;
  history?: ChatHistoryTurn[];
}

interface AuthenticatedRequest extends Request {
  authUser?: PublicUser;
  supabaseAccessToken?: string;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildSystemInstruction(
  mode: AiMode,
  language: LanguageCode,
  departmentName: string | undefined,
  semesterLabel: string | undefined,
  aiConfig: DbAiConfig,
  conciseOverride?: boolean
): string {
  const isEn = language === 'en';
  const contextLine =
    departmentName && semesterLabel
      ? isEn
        ? `The student is studying Diploma-in-Engineering under BTEB (${departmentName}, ${semesterLabel}).`
        : `শিক্ষার্থী বাংলাদেশ কারিগরি শিক্ষা বোর্ডের (BTEB) ডিপ্লোমা-ইন-ইঞ্জিনিয়ারিং (${departmentName}, ${semesterLabel}) পর্যায়ের।`
      : isEn
        ? 'The student is studying Diploma-in-Engineering under BTEB.'
        : 'শিক্ষার্থী বাংলাদেশ কারিগরি শিক্ষা বোর্ডের (BTEB) ডিপ্লোমা-ইন-ইঞ্জিনিয়ারিং পর্যায়ের।';

  const modeGuidanceBn: Record<AiMode, string> = {
    general:
      'সহজ, স্পষ্ট ও প্রাসঙ্গিক বাংলা ভাষায় উত্তর দাও। প্রয়োজনীয় প্রযুক্তিগত ইংরেজি টার্ম বাংলা ব্যাখ্যার পাশে বন্ধনীতে উল্লেখ করো।',
    explain:
      'জটিল একাডেমিক বা ইঞ্জিনিয়ারিং টপিককে ধাপে ধাপে, বাস্তব ইন্ডাস্ট্রিয়াল উদাহরণসহ সহজ বাংলায় ভেঙে বুঝিয়ে দাও। সংজ্ঞা, মূলনীতি ও পরীক্ষার জন্য গুরুত্বপূর্ণ পয়েন্ট আলাদা করে দেখাও।',
    math:
      'গণিত বা ইঞ্জিনিয়ারিং ম্যাথমেটিক্স/সার্কিট/পদার্থবিজ্ঞানের সমস্যা ধাপে ধাপে সমাধান করো। প্রথমে প্রদত্ত তথ্য (Given), এরপর সূত্র (Formula), প্রতিটি গণনার ধাপ এবং শেষে স্পষ্ট এককসহ (Unit) চূড়ান্ত উত্তর দেখাও।',
    power:
      'পাওয়ার টেকনোলজি, ইলেকট্রিক্যাল পাওয়ার প্ল্যান্ট, বয়লার, আইসি ইঞ্জিন, থার্মোডায়নামিক্স, ওহমের সূত্র, এসি/ডিসি সার্কিট ও সুইচগিয়ার বিষয়ে বিশেষজ্ঞের মতো ব্যবহারিক ও সেফটি-সম্মত ব্যাখ্যা দাও।',
    recommend:
      'শিক্ষার্থীর ডিপার্টমেন্ট ও সেমিস্টার বিবেচনা করে বোর্ড পরীক্ষার প্রস্তুতি পরিকল্পনা, গুরুত্বপূর্ণ অধ্যায় অগ্রাধিকার, রুটিন টিপস ও স্মার্ট স্টাডি কৌশল প্রস্তাব করো।',
  };

  const modeGuidanceEn: Record<AiMode, string> = {
    general: 'Answer clearly in concise technical English tailored to BTEB Diploma Engineering students.',
    explain:
      'Break down complex engineering topics step-by-step with real-world industrial examples, definitions, working principles, and exam tips.',
    math: 'Solve math, circuit, or physics numericals step-by-step: Given Data, Formula, Step-by-Step Calculation, and Final Answer with proper SI units.',
    power:
      'Respond as a senior Power & Electrical Technology instructor covering power plants, boilers, IC engines, circuits, switchgear, and electrical safety.',
    recommend:
      'Provide a structured BTEB exam study plan, priority chapters, practical prep strategy, and weekly time allocation.',
  };

  const isConcise = conciseOverride ?? aiConfig.conciseByDefault;
  const parts = [
    isEn
      ? 'You are Polytechnic Hub AI Tutor — a fast, knowledgeable engineering mentor for BTEB Diploma students.'
      : 'তুমি Polytechnic Hub-এর এআই টিউটর — বাংলাদেশের ডিপ্লোমা ইঞ্জিনিয়ারিং শিক্ষার্থীদের জন্য একজন দ্রুত ও দক্ষ শিক্ষক।',
    contextLine,
    isEn ? modeGuidanceEn[mode] : modeGuidanceBn[mode],
    isConcise
      ? isEn
        ? 'Be concise and direct: give the core answer, key formula, and brief bullets without long preambles.'
        : 'উত্তর সংক্ষিপ্ত ও সরাসরি রাখো: মূল সূত্র, প্রয়োজনীয় ধাপ ও সংক্ষিপ্ত বুলেট পয়েন্ট দাও।'
      : isEn
        ? 'Keep formatting clean with clear headings, bullet points, and formula blocks. Go straight to the answer without filler.'
        : 'উত্তর সর্বদা সুগঠিত রাখো: বুলেট পয়েন্ট, পরিষ্কার শিরোনাম এবং সূত্র ব্লক ব্যবহার করো। অপ্রয়োজনীয় ভূমিকা ছাড়াই সরাসরি মূল বিষয়ে যাও।',
  ];

  if (aiConfig.customSystemAddon?.trim()) {
    parts.push(aiConfig.customSystemAddon.trim());
  }

  return parts.join('\n');
}

async function verifySupabaseToken(token: string): Promise<PublicUser | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!authRes.ok) return null;
    const authUser = (await authRes.json()) as {
      id: string;
      email?: string;
      created_at?: string;
      updated_at?: string;
      user_metadata?: Record<string, unknown>;
    };
    if (!authUser?.id) return null;

    let profileRole: UserRole = 'student';
    let profileRow: Record<string, unknown> | null = null;

    try {
      const profRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=*`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (profRes.ok) {
        const rows = (await profRes.json()) as Record<string, unknown>[];
        if (rows.length > 0) {
          profileRow = rows[0];
          if (profileRow.role === 'admin') {
            profileRole = 'admin';
          }
        }
      }
    } catch {
      // profiles table may not exist yet; continue with defaults
    }

    if (isPrimaryAdminEmail(authUser.email)) {
      profileRole = 'admin';
    }

    const meta = authUser.user_metadata ?? {};
    const now = new Date().toISOString();
    return {
      id: authUser.id,
      fullName: String(
        profileRow?.full_name || meta.full_name || meta.name || authUser.email?.split('@')[0] || 'Student'
      ),
      email: String(profileRow?.email || authUser.email || ''),
      role: profileRole,
      avatarUrl: String(profileRow?.avatar_url || meta.avatar_url || ''),
      gender: (profileRow?.gender === 'male' || profileRow?.gender === 'female'
        ? profileRow.gender
        : '') as '' | 'male' | 'female',
      showGender: Boolean(profileRow?.show_gender),
      bio: String(profileRow?.bio || ''),
      department: String(profileRow?.department || meta.department || 'power'),
      semester: Number(profileRow?.semester || meta.semester || 4),
      collegeName: String(profileRow?.college_name || profileRow?.institute_name || meta.college_name || ''),
      instituteName: String(profileRow?.institute_name || profileRow?.college_name || ''),
      rollNumber: String(profileRow?.roll_number || ''),
      profileVisibility:
        profileRow?.profile_visibility === 'public' || profileRow?.profile_visibility === 'private'
          ? profileRow.profile_visibility
          : 'department',
      createdAt: String(profileRow?.created_at || authUser.created_at || now),
      updatedAt: String(profileRow?.updated_at || authUser.updated_at || now),
    };
  } catch {
    return null;
  }
}

let cachedFirebaseCerts: { certs: Record<string, string>; expiresAtMs: number } | null = null;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  if (cachedFirebaseCerts && Date.now() < cachedFirebaseCerts.expiresAtMs) {
    return cachedFirebaseCerts.certs;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) {
    throw new Error(`Failed to fetch Firebase public keys (${resp.status})`);
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlSec = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) : 3600;
  const certs = (await resp.json()) as Record<string, string>;
  cachedFirebaseCerts = {
    certs,
    expiresAtMs: Date.now() + ttlSec * 1000,
  };
  return certs;
}

interface VerifiedFirebaseClaims {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string;
  provider: 'google' | 'facebook' | 'email';
}

const ACCEPTED_FIREBASE_PROJECT_IDS = Array.from(
  new Set(
    [
      FIREBASE_PROJECT_ID,
      String(FIREBASE_APPLET_CONFIG.projectId || '').trim(),
      (process.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
      (process.env.FIREBASE_PROJECT_ID || '').trim(),
    ].filter(Boolean)
  )
);

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseClaims | null> {
  if (ACCEPTED_FIREBASE_PROJECT_IDS.length === 0) {
    throw new Error(
      'Server VITE_FIREBASE_PROJECT_ID (or firebase-applet-config.json) is not configured for Firebase token verification.'
    );
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
      alg?: string;
      kid?: string;
    };
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }

  if (header.alg !== 'RS256' || !header.kid) {
    return null;
  }

  const certs = await getFirebasePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    return null;
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const isValidSig = verifier.verify(certPem, Buffer.from(sigB64, 'base64url'));
  if (!isValidSig) {
    return null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp || 0);
  const iat = Number(payload.iat || 0);
  const aud = String(payload.aud || '');
  const iss = String(payload.iss || '');
  const sub = String(payload.sub || '');

  if (!sub || sub.length > 128) return null;
  if (!ACCEPTED_FIREBASE_PROJECT_IDS.includes(aud)) return null;
  if (iss !== `https://securetoken.google.com/${aud}`) return null;
  if (exp <= nowSec || iat > nowSec + 300) return null;

  const fbMeta =
    payload.firebase && typeof payload.firebase === 'object'
      ? (payload.firebase as { sign_in_provider?: string })
      : {};
  const signInProvider = String(fbMeta.sign_in_provider || '').toLowerCase();
  const provider: 'google' | 'facebook' | 'email' =
    signInProvider === 'facebook.com'
      ? 'facebook'
      : signInProvider === 'google.com'
        ? 'google'
        : 'email';

  return {
    uid: sub,
    email: String(payload.email || '').trim().toLowerCase(),
    emailVerified: Boolean(payload.email_verified),
    name: String(payload.name || ''),
    picture: String(payload.picture || ''),
    provider,
  };
}

function deterministicUuidFromFirebaseUid(uid: string): string {
  const hash = crypto.createHash('sha256').update(`polytechnic-hub-firebase:${uid}`).digest('hex');
  const p1 = hash.slice(0, 8);
  const p2 = hash.slice(8, 12);
  const p3 = `5${hash.slice(13, 16)}`;
  const variantNibble = ['8', '9', 'a', 'b'][parseInt(hash[16], 16) % 4];
  const p4 = `${variantNibble}${hash.slice(17, 20)}`;
  const p5 = hash.slice(20, 32);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

async function resolveBearerUser(
  req: Request
): Promise<{ user: PublicUser; supabaseAccessToken?: string } | null> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;

  const localPayload = verifyAuthToken(token);
  if (localPayload) {
    const db = dbStore.load();
    let localUser =
      db.users.find((u) => u.id === localPayload.sub) ??
      (localPayload.firebaseUid
        ? db.users.find((u) => u.firebaseUid === localPayload.firebaseUid)
        : undefined) ??
      (localPayload.email
        ? db.users.find((u) => u.email.toLowerCase() === localPayload.email!.toLowerCase())
        : undefined);

    if (localUser) {
      if (localUser.isDisabled) return null;
      return { user: toPublicUser(localUser) };
    }

    // Re-hydrate user cleanly when the token signature is valid (e.g., after container restart)
    if (localPayload.email || localPayload.firebaseUid) {
      const now = new Date().toISOString();
      const hydrated = dbStore.mutate((draft) => {
        const existing = draft.users.find(
          (u) =>
            u.id === localPayload.sub ||
            (localPayload.firebaseUid && u.firebaseUid === localPayload.firebaseUid) ||
            (localPayload.email && u.email && u.email.toLowerCase() === localPayload.email.toLowerCase())
        );
        if (existing) return existing;
        const created: DbUser = {
          id: localPayload.sub,
          firebaseUid: localPayload.firebaseUid,
          authProvider: localPayload.authProvider,
          fullName:
            localPayload.fullName?.trim() ||
            (localPayload.email ? localPayload.email.split('@')[0] : '') ||
            'Student',
          email: (localPayload.email || '').trim().toLowerCase(),
          passwordHash: '',
          role: localPayload.role === 'admin' ? 'admin' : 'student',
          avatarUrl: '',
          coverUrl: '',
          gender: '',
          showGender: false,
          bio: '',
          department: localPayload.department || 'power',
          semester: Math.min(8, Math.max(1, Number(localPayload.semester || 4) || 4)),
          collegeName: '',
          instituteName: '',
          rollNumber: '',
          profileVisibility: 'public',
          isDisabled: false,
          createdAt: now,
          updatedAt: now,
        };
        draft.users.push(created);
        return created;
      });
      if (hydrated && !hydrated.isDisabled) {
        return { user: toPublicUser(hydrated) };
      }
    }
  }

  // Direct Firebase ID token support (eliminates 401s for Google/Facebook Firebase users across refreshes or restarts)
  if (token.split('.').length === 3 && ACCEPTED_FIREBASE_PROJECT_IDS.length > 0) {
    try {
      const fbClaims = await verifyFirebaseIdToken(token);
      if (fbClaims && fbClaims.uid) {
        const isVerifiedPrimaryAdmin = Boolean(
          fbClaims.emailVerified && isPrimaryAdminEmail(fbClaims.email)
        );
        const now = new Date().toISOString();
        const fbUser = dbStore.mutate((draft) => {
          let existing =
            draft.users.find((u) => u.firebaseUid === fbClaims.uid) ??
            (fbClaims.email
              ? draft.users.find((u) => u.email && u.email.toLowerCase() === fbClaims.email)
              : undefined);
          if (existing) {
            if (!existing.firebaseUid) existing.firebaseUid = fbClaims.uid;
            if (!existing.email && fbClaims.email) existing.email = fbClaims.email;
            if (!existing.authProvider) existing.authProvider = fbClaims.provider;
            if (!existing.avatarUrl && fbClaims.picture) existing.avatarUrl = fbClaims.picture;
            if (isVerifiedPrimaryAdmin && existing.role !== 'admin') {
              existing.role = 'admin';
              existing.updatedAt = now;
            }
            return existing;
          }
          const canonicalId = deterministicUuidFromFirebaseUid(fbClaims.uid);
          const created: DbUser = {
            id: canonicalId,
            firebaseUid: fbClaims.uid,
            authProvider: fbClaims.provider,
            fullName:
              fbClaims.name?.trim() ||
              (fbClaims.email ? fbClaims.email.split('@')[0] : '') ||
              'Student',
            email: fbClaims.email || '',
            passwordHash: '',
            role: isVerifiedPrimaryAdmin ? 'admin' : 'student',
            avatarUrl: fbClaims.picture || '',
            coverUrl: '',
            gender: '',
            showGender: false,
            bio: '',
            department: 'power',
            semester: 4,
            collegeName: '',
            instituteName: '',
            rollNumber: '',
            profileVisibility: 'public',
            isDisabled: false,
            createdAt: now,
            updatedAt: now,
          };
          draft.users.push(created);
          return created;
        });
        if (fbUser && !fbUser.isDisabled) {
          return { user: toPublicUser(fbUser) };
        }
      }
    } catch {
      // Fall through to Supabase token check
    }
  }

  const supabaseUser = await verifySupabaseToken(token);
  if (supabaseUser) {
    return { user: supabaseUser, supabaseAccessToken: token };
  }

  return null;
}

async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const resolved = await resolveBearerUser(req);
  if (!resolved) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  req.authUser = resolved.user;
  req.supabaseAccessToken = resolved.supabaseAccessToken;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden: Administrator role required.' });
    return;
  }
  next();
}

function recordAiUsage(mode: AiMode, latencyMs: number, hadError: boolean): void {
  dbStore.mutate((draft) => {
    draft.usageStats.totalAiRequests += 1;
    if (hadError) {
      draft.usageStats.aiErrorsCount += 1;
    } else {
      draft.usageStats.totalAiLatencyMs += Math.max(1, Math.round(latencyMs));
    }
    draft.usageStats.lastAiRequestAt = new Date().toISOString();
    draft.usageStats.requestsByMode[mode] = (draft.usageStats.requestsByMode[mode] ?? 0) + 1;
  });
}

function mapSupabaseProfileRow(row: Record<string, unknown>): PublicUser {
  return {
    id: String(row.id),
    fullName: String(row.full_name || 'Student'),
    email: String(row.email || ''),
    role: row.role === 'admin' ? 'admin' : 'student',
    avatarUrl: String(row.avatar_url || ''),
    gender: (row.gender === 'male' || row.gender === 'female' ? row.gender : '') as
      | ''
      | 'male'
      | 'female',
    showGender: Boolean(row.show_gender),
    bio: String(row.bio || ''),
    department: String(row.department || 'power'),
    semester: Number(row.semester || 4),
    collegeName: String(row.college_name || row.institute_name || ''),
    instituteName: String(row.institute_name || row.college_name || ''),
    rollNumber: String(row.roll_number || ''),
    profileVisibility:
      row.profile_visibility === 'public' || row.profile_visibility === 'private'
        ? row.profile_visibility
        : 'department',
    firebaseUid: row.firebase_uid ? String(row.firebase_uid) : undefined,
    isDisabled: Boolean(row.is_disabled),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  dbStore.load();

  app.get('/api/health', (_req: Request, res: Response) => {
    const db = dbStore.load();
    res.json({
      status: 'ok',
      service: 'Polytechnic Hub API',
      version: db.appConfig.appVersion,
      aiConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ),
      supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
      firebaseAuthConfigured: Boolean(FIREBASE_PROJECT_ID && FIREBASE_API_KEY),
      fcmConfigured: isFcmAdminConfigured(),
      timestamp: new Date().toISOString(),
    });
  });

  // =========================================================================
  // PUBLIC BOOTSTRAP DATA
  // =========================================================================
  app.get('/api/bootstrap', (_req: Request, res: Response) => {
    const db = dbStore.load();

    res.json({
      notices: [...db.notices].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt)
      ),
      sharedNotes: db.sharedNotes,
      mcqs: db.mcqs,
      customFormulas: db.customFormulas,
      deletedFormulaIds: db.deletedFormulaIds,
      appConfig: db.appConfig,
      hasAdmin: true,
    });
  });

  // =========================================================================
  // LOCAL AUTH FALLBACK (When Supabase is not configured / local admin bootstrap)
  // =========================================================================
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const {
      fullName,
      email,
      password,
      department = 'power',
      semester = 4,
      instituteName = '',
      rollNumber = '',
    } = req.body ?? {};

    if (typeof fullName !== 'string' || fullName.trim().length < 2) {
      res.status(400).json({ error: 'অনুগ্রহ করে সঠিক নাম লিখুন (কমপক্ষে ২ অক্ষর)।' });
      return;
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: 'অনুগ্রহ করে একটি বৈধ ইমেইল ঠিকানা লিখুন।' });
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (isPrimaryAdminEmail(normalizedEmail)) {
      res.status(403).json({
        error: 'এই অ্যাডমিন ইমেইল দিয়ে লগইন করতে অনুগ্রহ করে Google (Gmail) সাইন-ইন ব্যবহার করুন।',
      });
      return;
    }
    const db = dbStore.load();
    if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      res.status(409).json({ error: 'এই ইমেইল দিয়ে ইতিমধ্যেই অ্যাকাউন্ট তৈরি করা আছে।' });
      return;
    }

    const now = new Date().toISOString();
    const newUser: DbUser = {
      id: `usr-${crypto.randomUUID()}`,
      fullName: fullName.trim(),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      role: 'student',
      avatarUrl: '',
      gender: '',
      showGender: false,
      bio: '',
      department: String(department || 'power'),
      semester: Math.min(8, Math.max(1, Number(semester) || 4)),
      collegeName: String(instituteName || '').trim(),
      instituteName: String(instituteName || '').trim(),
      rollNumber: String(rollNumber || '').trim(),
      profileVisibility: 'department',
      createdAt: now,
      updatedAt: now,
    };

    dbStore.mutate((draft) => {
      draft.users.push(newUser);
    });

    const token = signAuthToken(newUser);
    res.status(201).json({
      token,
      user: toPublicUser(newUser),
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'ইমেইল ও পাসওয়ার্ড প্রদান করুন।' });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const db = dbStore.load();
    const user = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।' });
      return;
    }
    if (user.isDisabled) {
      res.status(403).json({ error: 'এই অ্যাকাউন্টটি অ্যাডমিন কর্তৃক সাময়িকভাবে স্থগিত করা হয়েছে।' });
      return;
    }
    const token = signAuthToken(user);
    res.json({
      token,
      user: toPublicUser(user),
    });
  });

  // Unified Firebase Authentication -> Canonical Profile & Supabase Sync
  app.post('/api/auth/firebase-sync', async (req: Request, res: Response) => {
    const { idToken, fullName, department, semester, collegeName, rollNumber, authProvider } =
      req.body ?? {};
    if (typeof idToken !== 'string' || idToken.trim().length < 20) {
      res.status(400).json({ error: 'Valid Firebase ID token is required.' });
      return;
    }

    let claims: VerifiedFirebaseClaims | null = null;
    try {
      claims = await verifyFirebaseIdToken(idToken.trim());
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'Firebase token verification failed.',
      });
      return;
    }

    if (!claims || !claims.uid) {
      res.status(401).json({ error: 'Invalid or expired Firebase session. Please sign in again.' });
      return;
    }

    const normalizedEmail = claims.email || '';
    const resolvedProvider: 'google' | 'facebook' | 'email' =
      authProvider === 'facebook' || authProvider === 'google' || authProvider === 'email'
        ? authProvider
        : claims.provider;
    const isVerifiedPrimaryAdmin = Boolean(
      claims.emailVerified && isPrimaryAdminEmail(normalizedEmail)
    );
    const now = new Date().toISOString();

    let supabaseProfile: Record<string, unknown> | null = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const headers = {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        };
        const byUidRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?firebase_uid=eq.${encodeURIComponent(claims.uid)}&select=*`,
          { headers }
        );
        if (byUidRes.ok) {
          const rows = (await byUidRes.json()) as Record<string, unknown>[];
          if (rows[0]) supabaseProfile = rows[0];
        }
        if (!supabaseProfile && normalizedEmail) {
          const byEmailRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?email=ilike.${encodeURIComponent(normalizedEmail)}&select=*`,
            { headers }
          );
          if (byEmailRes.ok) {
            const rows = (await byEmailRes.json()) as Record<string, unknown>[];
            if (rows[0]) supabaseProfile = rows[0];
          }
        }
      } catch {
        // fallback cleanly to local profile store
      }
    }

    let syncedUser: DbUser | null = null;
    let disabledAccount = false;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    dbStore.mutate((draft) => {
      let existing =
        draft.users.find((u) => u.firebaseUid === claims!.uid) ??
        (normalizedEmail
          ? draft.users.find((u) => u.email && u.email.toLowerCase() === normalizedEmail)
          : undefined);

      if (existing?.isDisabled || supabaseProfile?.is_disabled === true) {
        disabledAccount = true;
        return;
      }

      const validExistingUuid = existing?.id && UUID_REGEX.test(existing.id) ? existing.id : null;
      const canonicalId = String(
        supabaseProfile?.id || validExistingUuid || deterministicUuidFromFirebaseUid(claims!.uid)
      );
      const resolvedRole: UserRole = isVerifiedPrimaryAdmin
        ? 'admin'
        : supabaseProfile?.role === 'admin' || existing?.role === 'admin'
          ? 'admin'
          : 'student';

      const cleanDisplayName =
        existing?.fullName?.trim() ||
        (supabaseProfile?.full_name ? String(supabaseProfile.full_name).trim() : '') ||
        claims!.name?.trim() ||
        (typeof fullName === 'string' && fullName.trim()) ||
        (normalizedEmail ? normalizedEmail.split('@')[0] : '') ||
        'Student';

      const cleanAvatar =
        existing?.avatarUrl ||
        (supabaseProfile?.avatar_url ? String(supabaseProfile.avatar_url) : '') ||
        claims!.picture ||
        '';

      const cleanDept =
        existing?.department ||
        (supabaseProfile?.department ? String(supabaseProfile.department) : '') ||
        (typeof department === 'string' && department.trim()) ||
        'power';

      const cleanSem = Math.min(
        8,
        Math.max(
          1,
          Number(existing?.semester || supabaseProfile?.semester || semester || 4) || 4
        )
      );

      const cleanCollege =
        existing?.collegeName ||
        existing?.instituteName ||
        (supabaseProfile?.college_name ? String(supabaseProfile.college_name) : '') ||
        (typeof collegeName === 'string' && collegeName.trim()) ||
        '';

      const cleanRoll =
        existing?.rollNumber ||
        (supabaseProfile?.roll_number ? String(supabaseProfile.roll_number) : '') ||
        (typeof rollNumber === 'string' && rollNumber.trim()) ||
        '';

      if (existing) {
        const previousId = existing.id;
        existing.id = canonicalId;
        existing.firebaseUid = claims!.uid;
        existing.authProvider = existing.authProvider || resolvedProvider;
        if (normalizedEmail) existing.email = normalizedEmail;
        if (!existing.fullName?.trim()) existing.fullName = cleanDisplayName;
        existing.role = resolvedRole;
        if (!existing.avatarUrl && cleanAvatar) existing.avatarUrl = cleanAvatar;
        if (!existing.department && cleanDept) existing.department = cleanDept;
        if (!existing.semester && cleanSem) existing.semester = cleanSem;
        if (!existing.collegeName && cleanCollege) {
          existing.collegeName = cleanCollege;
          existing.instituteName = cleanCollege;
        }
        if (!existing.rollNumber && cleanRoll) existing.rollNumber = cleanRoll;
        existing.updatedAt = now;
        if (previousId !== canonicalId) {
          for (const p of draft.communityPosts) {
            if (p.authorId === previousId) p.authorId = canonicalId;
            for (const r of p.replies || []) {
              if (r.authorId === previousId) r.authorId = canonicalId;
            }
          }
          for (const pdf of draft.userPdfs) {
            if (pdf.userId === previousId) pdf.userId = canonicalId;
          }
        }
        syncedUser = existing;
      } else {
        const created: DbUser = {
          id: canonicalId,
          firebaseUid: claims!.uid,
          authProvider: resolvedProvider,
          fullName: cleanDisplayName,
          email: normalizedEmail,
          passwordHash: '',
          role: resolvedRole,
          avatarUrl: cleanAvatar,
          gender: (supabaseProfile?.gender === 'male' || supabaseProfile?.gender === 'female'
            ? supabaseProfile.gender
            : '') as '' | 'male' | 'female',
          showGender: Boolean(supabaseProfile?.show_gender),
          bio: String(supabaseProfile?.bio || ''),
          department: cleanDept,
          semester: cleanSem,
          collegeName: cleanCollege,
          instituteName: cleanCollege,
          rollNumber: cleanRoll,
          profileVisibility:
            supabaseProfile?.profile_visibility === 'public' ||
            supabaseProfile?.profile_visibility === 'private'
              ? supabaseProfile.profile_visibility
              : 'department',
          isDisabled: false,
          createdAt: String(supabaseProfile?.created_at || now),
          updatedAt: now,
        };
        draft.users.push(created);
        syncedUser = created;
      }
    });

    if (disabledAccount) {
      res.status(403).json({
        error: 'This account has been disabled by an administrator.',
      });
      return;
    }

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && syncedUser) {
      try {
        const u = syncedUser as DbUser;
        const upsertPayload: Record<string, unknown> = {
          id: u.id,
          firebase_uid: claims.uid,
          full_name: u.fullName,
          email: u.email,
          role: u.role,
          avatar_url: u.avatarUrl,
          department: u.department,
          semester: u.semester,
          college_name: u.collegeName,
          institute_name: u.instituteName,
          roll_number: u.rollNumber,
          updated_at: now,
        };
        const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(upsertPayload),
        });
        if (!upsertRes.ok) {
          const errText = await upsertRes.text().catch(() => '');
          // If email already exists on another profile row, patch that row with firebase_uid to avoid duplicates
          if (upsertRes.status === 409 || errText.includes('23505')) {
            await fetch(
              `${SUPABASE_URL}/rest/v1/profiles?email=ilike.${encodeURIComponent(u.email)}`,
              {
                method: 'PATCH',
                headers: {
                  apikey: SUPABASE_SERVICE_ROLE_KEY,
                  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  firebase_uid: claims.uid,
                  full_name: u.fullName,
                  avatar_url: u.avatarUrl,
                  department: u.department,
                  semester: u.semester,
                  college_name: u.collegeName,
                  institute_name: u.instituteName,
                  roll_number: u.rollNumber,
                  updated_at: now,
                }),
              }
            ).catch(() => {});
          } else {
            // Retry without firebase_uid if migration 004 hasn't been applied yet
            delete upsertPayload.firebase_uid;
            await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
              method: 'POST',
              headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates',
              },
              body: JSON.stringify(upsertPayload),
            }).catch(() => {});
          }
        }
      } catch {
        // non-blocking fallback to local dbStore
      }
    }

    const token = signAuthToken(syncedUser!);
    res.json({
      token,
      user: toPublicUser(syncedUser!),
    });
  });

  app.post('/api/auth/bootstrap-admin', (req: Request, res: Response) => {
    const { fullName = 'Polytechnic Hub Admin', email, password, setupSecret } = req.body ?? {};
    const configuredSecret = process.env.ADMIN_SETUP_SECRET?.trim();

    if (!configuredSecret || setupSecret !== configuredSecret) {
      res.status(403).json({
        error:
          'Admin access is restricted to the designated owner Gmail account. Sign in with Google using the owner email.',
      });
      return;
    }

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: 'Valid admin email required.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Admin password must be at least 6 characters.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date().toISOString();
    let adminUser: DbUser | undefined;

    dbStore.mutate((draft) => {
      const existing = draft.users.find((u) => u.email.toLowerCase() === normalizedEmail);
      if (existing) {
        existing.role = 'admin';
        existing.passwordHash = hashPassword(password);
        existing.fullName = String(fullName).trim() || existing.fullName;
        existing.updatedAt = now;
        adminUser = existing;
      } else {
        const created: DbUser = {
          id: `usr-${crypto.randomUUID()}`,
          fullName: String(fullName).trim() || 'Polytechnic Hub Admin',
          email: normalizedEmail,
          passwordHash: hashPassword(password),
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
        };
        draft.users.push(created);
        adminUser = created;
      }
    });

    const token = signAuthToken(adminUser!);
    res.status(201).json({
      token,
      user: toPublicUser(adminUser!),
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.authUser! });
  });

  app.post('/api/auth/ensure-profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    const { fullName, department, semester, collegeName, rollNumber } = (req.body ?? {}) as {
      fullName?: string;
      department?: string;
      semester?: number;
      collegeName?: string;
      rollNumber?: string;
    };

    const now = new Date().toISOString();
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const canonicalUser = dbStore.mutate((draft) => {
      let target = draft.users.find((u) => u.id === auth.id);
      if (!target) {
        target = {
          id: auth.id,
          firebaseUid: auth.firebaseUid,
          fullName: (typeof fullName === 'string' && fullName.trim()) || auth.fullName,
          email: auth.email,
          passwordHash: '',
          role: auth.role,
          avatarUrl: auth.avatarUrl || '',
          coverUrl: auth.coverUrl || '',
          gender: auth.gender || '',
          showGender: Boolean(auth.showGender),
          bio: auth.bio || '',
          department: (typeof department === 'string' && department.trim()) || auth.department || 'power',
          semester: Math.min(8, Math.max(1, Number(semester || auth.semester || 4) || 4)),
          collegeName: (typeof collegeName === 'string' && collegeName.trim()) || auth.collegeName || auth.instituteName || '',
          instituteName: (typeof collegeName === 'string' && collegeName.trim()) || auth.instituteName || auth.collegeName || '',
          rollNumber: (typeof rollNumber === 'string' && rollNumber.trim()) || auth.rollNumber || '',
          profileVisibility: auth.profileVisibility || 'public',
          createdAt: auth.createdAt || now,
          updatedAt: now,
        };
        draft.users.push(target);
      }
      return toPublicUser(target);
    });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      res.json({
        exists: true,
        created: false,
        syncedToSupabase: false,
        user: canonicalUser,
      });
      return;
    }

    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };

    const supabaseProfileId = UUID_REGEX.test(canonicalUser.id)
      ? canonicalUser.id
      : canonicalUser.firebaseUid
        ? deterministicUuidFromFirebaseUid(canonicalUser.firebaseUid)
        : deterministicUuidFromFirebaseUid(`local:${canonicalUser.id}`);

    try {
      // 1. Verify existence in Supabase profiles by id, firebase_uid, or email
      let existingRow: Record<string, unknown> | null = null;
      const byIdRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(supabaseProfileId)}&select=*`,
        { headers }
      );
      if (byIdRes.ok) {
        const rows = (await byIdRes.json()) as Record<string, unknown>[];
        if (rows[0]) existingRow = rows[0];
      }

      if (!existingRow && canonicalUser.firebaseUid) {
        const byUidRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?firebase_uid=eq.${encodeURIComponent(canonicalUser.firebaseUid)}&select=*`,
          { headers }
        );
        if (byUidRes.ok) {
          const rows = (await byUidRes.json()) as Record<string, unknown>[];
          if (rows[0]) existingRow = rows[0];
        }
      }

      if (!existingRow && canonicalUser.email) {
        const byEmailRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?email=ilike.${encodeURIComponent(canonicalUser.email)}&select=*`,
          { headers }
        );
        if (byEmailRes.ok) {
          const rows = (await byEmailRes.json()) as Record<string, unknown>[];
          if (rows[0]) existingRow = rows[0];
        }
      }

      if (existingRow) {
        // Ensure firebase_uid link is populated if missing on an existing row
        if (canonicalUser.firebaseUid && !existingRow.firebase_uid && existingRow.id) {
          await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(String(existingRow.id))}`,
            {
              method: 'PATCH',
              headers,
              body: JSON.stringify({
                firebase_uid: canonicalUser.firebaseUid,
                updated_at: now,
              }),
            }
          ).catch(() => {});
        }

        res.json({
          exists: true,
          created: false,
          syncedToSupabase: true,
          user: canonicalUser,
        });
        return;
      }

      // 2. Profile missing in Supabase — create it now
      const insertPayload: Record<string, unknown> = {
        id: supabaseProfileId,
        full_name: canonicalUser.fullName,
        email: canonicalUser.email,
        role: canonicalUser.role,
        avatar_url: canonicalUser.avatarUrl,
        department: canonicalUser.department,
        semester: canonicalUser.semester,
        college_name: canonicalUser.collegeName,
        institute_name: canonicalUser.instituteName,
        roll_number: canonicalUser.rollNumber,
        bio: canonicalUser.bio,
        profile_visibility: canonicalUser.profileVisibility,
        updated_at: now,
      };
      if (canonicalUser.firebaseUid) {
        insertPayload.firebase_uid = canonicalUser.firebaseUid;
      }

      const createRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(insertPayload),
      });

      let createdOk = createRes.ok;
      if (!createdOk && insertPayload.firebase_uid) {
        delete insertPayload.firebase_uid;
        const retryRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
          method: 'POST',
          headers: {
            ...headers,
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(insertPayload),
        });
        createdOk = retryRes.ok;
      }

      res.json({
        exists: createdOk,
        created: createdOk,
        syncedToSupabase: createdOk,
        user: canonicalUser,
      });
    } catch {
      res.json({
        exists: false,
        created: false,
        syncedToSupabase: false,
        user: canonicalUser,
      });
    }
  });

  app.patch('/api/auth/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    const {
      fullName,
      department,
      semester,
      instituteName,
      collegeName,
      rollNumber,
      bio,
      gender,
      showGender,
      profileVisibility,
      avatarUrl,
      coverUrl,
    } = req.body ?? {};

    const updated = dbStore.mutate((draft) => {
      let target = draft.users.find((u) => u.id === auth.id);
      if (!target) {
        const now = new Date().toISOString();
        target = {
          id: auth.id,
          firebaseUid: auth.firebaseUid,
          fullName: auth.fullName,
          email: auth.email,
          passwordHash: '',
          role: auth.role,
          avatarUrl: auth.avatarUrl || '',
          coverUrl: auth.coverUrl || '',
          gender: auth.gender || '',
          showGender: Boolean(auth.showGender),
          bio: auth.bio || '',
          department: auth.department || 'power',
          semester: auth.semester || 4,
          collegeName: auth.collegeName || auth.instituteName || '',
          instituteName: auth.instituteName || auth.collegeName || '',
          rollNumber: auth.rollNumber || '',
          profileVisibility: auth.profileVisibility || 'public',
          createdAt: auth.createdAt || now,
          updatedAt: now,
        };
        draft.users.push(target);
      }
      if (typeof fullName === 'string' && fullName.trim().length >= 1) {
        target.fullName = fullName.trim().slice(0, 100);
      }
      if (typeof department === 'string' && department.trim()) {
        target.department = department.trim();
      }
      if (semester !== undefined) {
        target.semester = Math.min(8, Math.max(1, Number(semester) || target.semester));
      }
      if (typeof instituteName === 'string') {
        target.instituteName = instituteName.trim();
      }
      if (typeof collegeName === 'string') {
        target.collegeName = collegeName.trim();
        target.instituteName = collegeName.trim();
      }
      if (typeof rollNumber === 'string') {
        target.rollNumber = rollNumber.trim();
      }
      if (typeof bio === 'string') {
        target.bio = bio.trim().slice(0, 400);
      }
      if (gender === '' || gender === 'male' || gender === 'female') {
        target.gender = gender;
      }
      if (typeof showGender === 'boolean') {
        target.showGender = showGender;
      }
      if (
        profileVisibility === 'public' ||
        profileVisibility === 'department' ||
        profileVisibility === 'private'
      ) {
        target.profileVisibility = profileVisibility;
      }
      if (typeof avatarUrl === 'string') {
        const cleanAvatar = avatarUrl.trim();
        if (
          cleanAvatar === '' ||
          ((cleanAvatar.startsWith('data:image/') || cleanAvatar.startsWith('https://')) &&
            cleanAvatar.length <= 2_500_000)
        ) {
          target.avatarUrl = cleanAvatar;
        }
      }
      if (typeof coverUrl === 'string') {
        const cleanCover = coverUrl.trim();
        if (
          cleanCover === '' ||
          ((cleanCover.startsWith('data:image/') || cleanCover.startsWith('https://')) &&
            cleanCover.length <= 2_500_000)
        ) {
          target.coverUrl = cleanCover;
        }
      }
      target.updatedAt = new Date().toISOString();

      // Propagate updated profile info to the student's existing community posts
      for (const post of draft.communityPosts) {
        if (post.authorId === target.id) {
          post.authorName = target.fullName;
          post.authorAvatarUrl = target.avatarUrl || post.authorAvatarUrl;
          post.authorDepartment = target.department;
          post.authorCollegeName = target.collegeName || target.instituteName || post.authorCollegeName;
        }
      }

      return toPublicUser(target);
    });

    const finalUser = updated ?? auth;

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && !finalUser.id.startsWith('usr-')) {
      try {
        const sbBody: Record<string, unknown> = {
          id: finalUser.id,
          email: finalUser.email,
          full_name: finalUser.fullName,
          department: finalUser.department,
          semester: finalUser.semester,
          college_name: finalUser.collegeName,
          institute_name: finalUser.instituteName,
          roll_number: finalUser.rollNumber,
          bio: finalUser.bio,
          gender: finalUser.gender,
          show_gender: finalUser.showGender,
          profile_visibility: finalUser.profileVisibility,
          avatar_url: finalUser.avatarUrl,
          updated_at: finalUser.updatedAt,
        };
        if (finalUser.firebaseUid) {
          sbBody.firebase_uid = finalUser.firebaseUid;
        }
        const patchRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(finalUser.id)}`,
          {
            method: 'PATCH',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify(sbBody),
          }
        );
        const patchedRows = patchRes.ok ? ((await patchRes.json().catch(() => [])) as unknown[]) : [];
        if (!patchRes.ok || patchedRows.length === 0) {
          await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify(sbBody),
          }).catch(() => {});
        }
      } catch {
        // local dbStore remains consistent if Supabase network request fails
      }
    }

    res.json({ user: finalUser });
  });

  // =========================================================================
  // COMMUNITY Q&A FORUM
  // =========================================================================
  interface SupabaseProfileCardRow {
    id: string;
    full_name?: string | null;
    department?: string | null;
    semester?: number | null;
    college_name?: string | null;
    institute_name?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
    role?: string | null;
    profile_visibility?: string | null;
    created_at?: string | null;
  }

  const UUID_V_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const fetchSupabaseProfilesByIds = async (
    ids: string[]
  ): Promise<Map<string, SupabaseProfileCardRow>> => {
    const map = new Map<string, SupabaseProfileCardRow>();
    const supabaseKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !supabaseKey) return map;

    const uuidIds = Array.from(new Set(ids.filter((id) => UUID_V_REGEX.test(id)))).slice(0, 60);
    if (uuidIds.length === 0) return map;

    try {
      const inClause = `(${uuidIds.join(',')})`;
      const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/profiles?id=in.${encodeURIComponent(
        inClause
      )}&select=id,full_name,department,semester,college_name,institute_name,avatar_url,bio,role,profile_visibility,created_at`;
      const resp = await fetch(url, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (!resp.ok) return map;
      const rows = (await resp.json()) as SupabaseProfileCardRow[];
      if (Array.isArray(rows)) {
        for (const r of rows) {
          if (r?.id) map.set(r.id, r);
        }
      }
    } catch {
      // Graceful fallback to local dbStore
    }
    return map;
  };

  const enrichCommunityPost = (
    post: DbCommunityPost,
    users: DbUser[],
    sbMap?: Map<string, SupabaseProfileCardRow>
  ): DbCommunityPost => {
    const author = users.find((u) => u.id === post.authorId);
    const sbAuthor = sbMap?.get(post.authorId);
    return {
      ...post,
      authorName: sbAuthor?.full_name || author?.fullName || post.authorName,
      authorDepartment:
        sbAuthor?.department || author?.department || post.authorDepartment,
      authorAvatarUrl:
        sbAuthor?.avatar_url || author?.avatarUrl || post.authorAvatarUrl || '',
      authorCollegeName:
        sbAuthor?.college_name ||
        sbAuthor?.institute_name ||
        author?.collegeName ||
        author?.instituteName ||
        post.authorCollegeName ||
        '',
      likedByUserIds: Array.isArray(post.likedByUserIds) ? post.likedByUserIds : [],
      replies: (post.replies || []).map((rep) => {
        const repAuthor = users.find((u) => u.id === rep.authorId);
        const sbRep = sbMap?.get(rep.authorId);
        return {
          ...rep,
          authorName: sbRep?.full_name || repAuthor?.fullName || rep.authorName,
          authorAvatarUrl:
            sbRep?.avatar_url || repAuthor?.avatarUrl || rep.authorAvatarUrl || '',
        };
      }),
    };
  };

  app.get('/api/community/profiles', async (req: Request, res: Response) => {
    const rawIds = String(req.query.ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 60);

    if (rawIds.length === 0) {
      res.json({ profiles: {} });
      return;
    }

    const db = dbStore.load();
    const viewer = await resolveBearerUser(req);
    const sbProfiles = await fetchSupabaseProfilesByIds(rawIds);
    const profiles: Record<
      string,
      {
        id: string;
        fullName: string;
        department: string;
        semester: number;
        collegeName: string;
        avatarUrl: string;
        bio: string;
        role: UserRole;
        source: 'supabase' | 'server';
      }
    > = {};

    for (const id of rawIds) {
      const sb = sbProfiles.get(id);
      const local = db.users.find((u) => u.id === id);
      const isSelfOrAdmin = viewer?.user.id === id || viewer?.user.role === 'admin';

      if (sb) {
        const isPrivate = sb.profile_visibility === 'private' && !isSelfOrAdmin;
        profiles[id] = {
          id,
          fullName: String(sb.full_name || local?.fullName || 'Student').trim() || 'Student',
          department: String(sb.department || local?.department || 'power'),
          semester: Math.min(8, Math.max(1, Number(sb.semester || local?.semester || 4) || 4)),
          collegeName: isPrivate
            ? ''
            : String(sb.college_name || sb.institute_name || local?.collegeName || ''),
          avatarUrl: String(sb.avatar_url || local?.avatarUrl || ''),
          bio: isPrivate ? '' : String(sb.bio || local?.bio || ''),
          role: sb.role === 'admin' || local?.role === 'admin' ? 'admin' : 'student',
          source: 'supabase',
        };
      } else if (local) {
        const isPrivate = local.profileVisibility === 'private' && !isSelfOrAdmin;
        profiles[id] = {
          id: local.id,
          fullName: local.fullName,
          department: local.department,
          semester: Math.min(8, Math.max(1, Number(local.semester) || 4)),
          collegeName: isPrivate ? '' : local.collegeName || local.instituteName || '',
          avatarUrl: local.avatarUrl || '',
          bio: isPrivate ? '' : local.bio || '',
          role: local.role,
          source: 'server',
        };
      }
    }

    res.json({ profiles });
  });

  app.get('/api/users/:id/public-profile', async (req: Request, res: Response) => {
    const db = dbStore.load();
    const viewer = await resolveBearerUser(req);
    const targetId = String(req.params.id || '');
    const sbMap = await fetchSupabaseProfilesByIds([targetId]);
    const sbUser = sbMap.get(targetId);
    const user = db.users.find((u) => u.id === targetId);
    const userPosts = db.communityPosts
      .filter((p) => p.authorId === targetId && !p.isHidden)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => enrichCommunityPost(p, db.users, sbMap));

    if (!user && !sbUser) {
      if (userPosts.length > 0) {
        const sample = userPosts[0];
        res.json({
          profile: {
            id: targetId,
            fullName: sample.authorName,
            role: sample.authorRole,
            avatarUrl: sample.authorAvatarUrl || '',
            coverUrl: '',
            bio:
              targetId === 'system-guide'
                ? 'Polytechnic Hub Official Editorial & Student Support'
                : '',
            department: sample.authorDepartment,
            semester: sample.semester,
            collegeName: sample.authorCollegeName || 'Polytechnic Hub',
            profileVisibility: 'public',
            createdAt: sample.createdAt,
            postsCount: userPosts.length,
          },
          posts: userPosts,
        });
        return;
      }
      res.status(404).json({ error: 'Student profile not found.' });
      return;
    }

    const isSelfOrAdmin =
      viewer?.user.id === targetId || viewer?.user.role === 'admin';
    const rawVisibility = sbUser?.profile_visibility || user?.profileVisibility || 'department';
    const profileVisibility: 'public' | 'department' | 'private' =
      rawVisibility === 'public' || rawVisibility === 'private' ? rawVisibility : 'department';
    const isPrivate = profileVisibility === 'private' && !isSelfOrAdmin;

    res.json({
      profile: {
        id: targetId,
        fullName: String(sbUser?.full_name || user?.fullName || 'Student'),
        role: sbUser?.role === 'admin' || user?.role === 'admin' ? 'admin' : 'student',
        avatarUrl: String(sbUser?.avatar_url || user?.avatarUrl || ''),
        coverUrl: user?.coverUrl || '',
        bio: isPrivate ? '' : String(sbUser?.bio || user?.bio || ''),
        department: String(sbUser?.department || user?.department || 'power'),
        semester: Math.min(8, Math.max(1, Number(sbUser?.semester || user?.semester || 4) || 4)),
        collegeName: isPrivate
          ? ''
          : String(
              sbUser?.college_name ||
                sbUser?.institute_name ||
                user?.collegeName ||
                user?.instituteName ||
                ''
            ),
        gender: !isPrivate && user?.showGender ? user.gender : '',
        showGender: !isPrivate && Boolean(user?.showGender),
        profileVisibility,
        createdAt: String(sbUser?.created_at || user?.createdAt || new Date().toISOString()),
        postsCount: userPosts.length,
      },
      posts: userPosts,
    });
  });

  app.get('/api/community/posts', async (req: Request, res: Response) => {
    const db = dbStore.load();
    const resolved = await resolveBearerUser(req);
    const includeHidden =
      resolved?.user.role === 'admin' && req.query.includeHidden === '1';

    const visiblePosts = db.communityPosts
      .filter((p) => (includeHidden ? true : !p.isHidden))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const involvedIds = visiblePosts.flatMap((p) => [
      p.authorId,
      ...(p.replies || []).map((r) => r.authorId),
    ]);
    const sbMap = await fetchSupabaseProfilesByIds(involvedIds);
    const posts = visiblePosts.map((p) => enrichCommunityPost(p, db.users, sbMap));

    res.json({ posts });
  });

  app.post('/api/community/posts', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    const {
      title = '',
      body = '',
      imageUrl = '',
      department = auth.department,
      semester = auth.semester,
      subjectTag = '',
    } = req.body ?? {};

    const cleanBody = typeof body === 'string' ? body.trim() : '';
    const cleanImage =
      typeof imageUrl === 'string' &&
      (imageUrl.startsWith('data:image/') || imageUrl.startsWith('https://')) &&
      imageUrl.length <= 3_000_000
        ? imageUrl.trim()
        : '';

    if (cleanBody.length < 1 && !cleanImage) {
      res.status(400).json({ error: 'পোস্টের লেখা বা একটি ছবি যোগ করুন।' });
      return;
    }

    const rawTitle = typeof title === 'string' ? title.trim() : '';
    const derivedTitle =
      rawTitle.length > 0
        ? rawTitle.slice(0, 140)
        : cleanBody
            .split('\n')[0]
            .trim()
            .slice(0, 80) || 'ফটো পোস্ট';

    const post: DbCommunityPost = {
      id: `post-${crypto.randomUUID()}`,
      authorId: auth.id,
      authorName: auth.fullName,
      authorAvatarUrl: auth.avatarUrl || '',
      authorCollegeName: auth.collegeName || auth.instituteName || '',
      authorDepartment: auth.department,
      authorRole: auth.role,
      department: String(department || auth.department || 'power'),
      semester: Math.min(8, Math.max(1, Number(semester || auth.semester || 4) || 4)),
      subjectTag: String(subjectTag || '').trim(),
      title: derivedTitle,
      body: cleanBody,
      imageUrl: cleanImage || undefined,
      likedByUserIds: [],
      reportsCount: 0,
      isHidden: false,
      replies: [],
      createdAt: new Date().toISOString(),
    };

    const enriched = dbStore.mutate((draft) => {
      draft.communityPosts.unshift(post);
      return enrichCommunityPost(post, draft.users);
    });
    res.status(201).json({ post: enriched });
  });

  app.post(
    '/api/community/posts/:id/like',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const auth = req.authUser!;
      const updatedPost = dbStore.mutate((draft) => {
        const post = draft.communityPosts.find((p) => p.id === req.params.id);
        if (!post) return null;
        const currentLikes = Array.isArray(post.likedByUserIds) ? post.likedByUserIds : [];
        const hasLiked = currentLikes.includes(auth.id);
        post.likedByUserIds = hasLiked
          ? currentLikes.filter((uid) => uid !== auth.id)
          : [...currentLikes, auth.id];
        return enrichCommunityPost(post, draft.users);
      });

      if (!updatedPost) {
        res.status(404).json({ error: 'Post not found.' });
        return;
      }
      res.json({ post: updatedPost });
    }
  );

  app.post(
    '/api/community/posts/:id/reply',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const auth = req.authUser!;
      const { body } = req.body ?? {};
      if (typeof body !== 'string' || body.trim().length < 2) {
        res.status(400).json({ error: 'উত্তর কমপক্ষে ২ অক্ষরের হতে হবে।' });
        return;
      }

      const updatedPost = dbStore.mutate((draft) => {
        const post = draft.communityPosts.find((p) => p.id === req.params.id);
        if (!post) return null;
        post.replies.push({
          id: `rep-${crypto.randomUUID()}`,
          authorId: auth.id,
          authorName: auth.fullName,
          authorRole: auth.role,
          authorAvatarUrl: auth.avatarUrl || '',
          body: body.trim(),
          createdAt: new Date().toISOString(),
        });
        return enrichCommunityPost(post, draft.users);
      });

      if (!updatedPost) {
        res.status(404).json({ error: 'Post not found.' });
        return;
      }
      res.status(201).json({ post: updatedPost });
    }
  );

  app.post('/api/community/posts/:id/report', requireAuth, (req: Request, res: Response) => {
    const post = dbStore.mutate((draft) => {
      const found = draft.communityPosts.find((p) => p.id === req.params.id);
      if (!found) return null;
      found.reportsCount += 1;
      return found;
    });
    if (!post) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    res.json({ reportsCount: post.reportsCount });
  });

  app.delete('/api/community/posts/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    const result = dbStore.mutate((draft) => {
      const idx = draft.communityPosts.findIndex((p) => p.id === req.params.id);
      if (idx === -1) return 'not_found';
      const target = draft.communityPosts[idx];
      if (auth.role !== 'admin' && target.authorId !== auth.id) {
        return 'forbidden';
      }
      draft.communityPosts.splice(idx, 1);
      return 'deleted';
    });

    if (result === 'not_found') {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    if (result === 'forbidden') {
      res.status(403).json({ error: 'Permission denied.' });
      return;
    }
    res.json({ deleted: true });
  });

  // =========================================================================
  // STRICTLY PROTECTED ADMIN ROUTES
  // =========================================================================
  app.get('/api/admin/metrics', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const db = dbStore.load();
    let totalUsers = db.users.length;
    let totalUserPdfs = 0;

    if (SUPABASE_URL && SUPABASE_ANON_KEY && req.supabaseAccessToken) {
      try {
        const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id`, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${req.supabaseAccessToken}`,
          },
        });
        if (profRes.ok) {
          const rows = (await profRes.json()) as unknown[];
          totalUsers = Math.max(totalUsers, rows.length);
        }
      } catch {
        // ignore if profiles query unavailable
      }
      try {
        const pdfRes = await fetch(`${SUPABASE_URL}/rest/v1/user_pdfs?select=id`, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${req.supabaseAccessToken}`,
          },
        });
        if (pdfRes.ok) {
          const rows = (await pdfRes.json()) as unknown[];
          totalUserPdfs = rows.length;
        }
      } catch {
        // ignore
      }
    }

    const successfulReqs = Math.max(
      1,
      db.usageStats.totalAiRequests - db.usageStats.aiErrorsCount
    );
    const avgLatency =
      db.usageStats.totalAiRequests > 0
        ? Math.round(db.usageStats.totalAiLatencyMs / successfulReqs)
        : 0;

    res.json({
      metrics: {
        totalAiRequests: db.usageStats.totalAiRequests,
        aiErrorsCount: db.usageStats.aiErrorsCount,
        averageAiLatencyMs: avgLatency,
        lastAiRequestAt: db.usageStats.lastAiRequestAt,
        requestsByMode: db.usageStats.requestsByMode,
        serverUptimeSeconds: Math.round((Date.now() - SERVER_STARTED_AT) / 1000),
        totalLocalUsers: totalUsers,
        totalUserPdfs,
        totalPhysicsFormulas: db.customFormulas.filter((f) => f.subject === 'physics').length,
        totalMathFormulas: db.customFormulas.filter((f) => f.subject === 'mathematics').length,
        totalCommunityPosts: db.communityPosts.length,
        totalMcqs: db.mcqs.length,
        totalNotices: db.notices.length,
      },
    });
  });

  app.get('/api/admin/ai-config', requireAuth, requireAdmin, (_req: Request, res: Response) => {
    const db = dbStore.load();
    res.json({ aiConfig: db.aiConfig });
  });

  app.put('/api/admin/ai-config', requireAuth, requireAdmin, (req: Request, res: Response) => {
    const {
      activeModel,
      thinkingLevel,
      conciseByDefault,
      maxHistoryTurns,
      customSystemAddon,
    } = req.body ?? {};

    const updated = dbStore.mutate((draft) => {
      if (activeModel === 'gemini-4-hydrogen' || activeModel === 'gemini-3.1-flash-lite') {
        draft.aiConfig.activeModel = activeModel;
      }
      if (thinkingLevel === 'LOW' || thinkingLevel === 'MEDIUM') {
        draft.aiConfig.thinkingLevel = thinkingLevel;
      }
      if (typeof conciseByDefault === 'boolean') {
        draft.aiConfig.conciseByDefault = conciseByDefault;
      }
      if (maxHistoryTurns !== undefined) {
        draft.aiConfig.maxHistoryTurns = Math.min(20, Math.max(2, Number(maxHistoryTurns) || 8));
      }
      if (typeof customSystemAddon === 'string') {
        draft.aiConfig.customSystemAddon = customSystemAddon.trim().slice(0, 1200);
      }
      draft.aiConfig.updatedAt = new Date().toISOString();
      return draft.aiConfig;
    });

    res.json({ aiConfig: updated });
  });

  app.post('/api/admin/formulas', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const {
      id,
      subject,
      chapter,
      chapterBn,
      nameEn,
      nameBn,
      expressionLatex,
      expressionPlain,
      symbols,
      explanationBn,
      explanationEn,
      exampleProblemBn = '',
      exampleProblemEn = '',
      exampleSolutionBn = '',
      exampleSolutionEn = '',
    } = req.body ?? {};

    if (subject !== 'physics' && subject !== 'mathematics') {
      res.status(400).json({ error: 'Formula subject must be physics or mathematics.' });
      return;
    }
    if (!chapter || !nameEn || !expressionLatex) {
      res.status(400).json({ error: 'Chapter, formula name, and LaTeX expression are required.' });
      return;
    }

    const now = new Date().toISOString();
    const formulaId =
      typeof id === 'string' && id.trim()
        ? id.trim()
        : `${subject === 'physics' ? 'phy' : 'math'}-${crypto.randomUUID().slice(0, 8)}`;

    const record: DbFormulaItem = {
      id: formulaId,
      subject,
      chapter: String(chapter).trim(),
      chapterBn: String(chapterBn || chapter).trim(),
      nameEn: String(nameEn).trim(),
      nameBn: String(nameBn || nameEn).trim(),
      expressionLatex: String(expressionLatex).trim(),
      expressionPlain: String(expressionPlain || expressionLatex).trim(),
      symbols: Array.isArray(symbols) ? symbols : [],
      explanationBn: String(explanationBn || explanationEn || '').trim(),
      explanationEn: String(explanationEn || explanationBn || '').trim(),
      exampleProblemBn: String(exampleProblemBn || '').trim(),
      exampleProblemEn: String(exampleProblemEn || '').trim(),
      exampleSolutionBn: String(exampleSolutionBn || '').trim(),
      exampleSolutionEn: String(exampleSolutionEn || '').trim(),
      isCustom: true,
      updatedAt: now,
    };

    dbStore.mutate((draft) => {
      draft.deletedFormulaIds = draft.deletedFormulaIds.filter((fid) => fid !== formulaId);
      const idx = draft.customFormulas.findIndex((f) => f.id === formulaId);
      if (idx >= 0) {
        draft.customFormulas[idx] = record;
      } else {
        draft.customFormulas.unshift(record);
      }
    });

    if (SUPABASE_URL && SUPABASE_ANON_KEY && req.supabaseAccessToken) {
      const table = subject === 'physics' ? 'physics_formulas' : 'mathematics_formulas';
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${req.supabaseAccessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            id: record.id,
            chapter: record.chapter,
            chapter_bn: record.chapterBn,
            name_en: record.nameEn,
            name_bn: record.nameBn,
            expression_latex: record.expressionLatex,
            expression_plain: record.expressionPlain,
            symbols: record.symbols,
            explanation_bn: record.explanationBn,
            explanation_en: record.explanationEn,
            example_problem_bn: record.exampleProblemBn,
            example_problem_en: record.exampleProblemEn,
            example_solution_bn: record.exampleSolutionBn,
            example_solution_en: record.exampleSolutionEn,
            updated_at: now,
          }),
        });
      } catch {
        // local persistence remains intact
      }
    }

    res.status(201).json({ formula: record });
  });

  app.delete(
    '/api/admin/formulas/:subject/:id',
    requireAuth,
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const { subject, id } = req.params;
      dbStore.mutate((draft) => {
        draft.customFormulas = draft.customFormulas.filter((f) => f.id !== id);
        if (!draft.deletedFormulaIds.includes(id)) {
          draft.deletedFormulaIds.push(id);
        }
      });

      if (SUPABASE_URL && SUPABASE_ANON_KEY && req.supabaseAccessToken) {
        const table = subject === 'physics' ? 'physics_formulas' : 'mathematics_formulas';
        try {
          await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${req.supabaseAccessToken}`,
            },
          });
        } catch {
          // ignore
        }
      }

      res.json({ deleted: true });
    }
  );

  app.post('/api/admin/notices', requireAuth, requireAdmin, (req: Request, res: Response) => {
    const { title, body, category = 'general', officialLink = '', pinned = false } = req.body ?? {};
    if (!title || !body) {
      res.status(400).json({ error: 'Notice title and body are required.' });
      return;
    }
    const notice: DbNotice = {
      id: `notice-${crypto.randomUUID()}`,
      title: String(title).trim(),
      body: String(body).trim(),
      category: ['general', 'exam', 'result', 'urgent'].includes(category) ? category : 'general',
      officialLink: String(officialLink || '').trim(),
      pinned: Boolean(pinned),
      createdAt: new Date().toISOString(),
    };
    dbStore.mutate((draft) => {
      draft.notices.unshift(notice);
    });
    res.status(201).json({ notice });
  });

  app.delete('/api/admin/notices/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
    dbStore.mutate((draft) => {
      draft.notices = draft.notices.filter((n) => n.id !== req.params.id);
    });
    res.json({ deleted: true });
  });

  app.post('/api/admin/shared-notes', requireAuth, requireAdmin, (req: Request, res: Response) => {
    const {
      title,
      department = 'power',
      semester = 4,
      subjectCode = '',
      summary = '',
      pdfUrl = '',
      downloadPermitted = true,
    } = req.body ?? {};
    if (!title || typeof title !== 'string' || title.trim().length < 2) {
      res.status(400).json({ error: 'Book/Note title is required.' });
      return;
    }
    const sharedNote: DbSharedNote = {
      id: `snote-${crypto.randomUUID()}`,
      title: title.trim(),
      department: String(department),
      semester: Math.min(8, Math.max(1, Number(semester) || 4)),
      subjectCode: String(subjectCode).trim(),
      summary: String(summary).trim(),
      pdfUrl: String(pdfUrl).trim(),
      downloadPermitted: Boolean(downloadPermitted),
      createdAt: new Date().toISOString(),
    };
    dbStore.mutate((draft) => {
      draft.sharedNotes.unshift(sharedNote);
    });
    res.status(201).json({ sharedNote });
  });

  app.post(
    '/api/admin/shared-notes/upload',
    requireAuth,
    requireAdmin,
    express.raw({ type: 'application/pdf', limit: '52mb' }),
    (req: Request, res: Response) => {
      const fileBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (fileBuffer.length < 16 || fileBuffer.length > 50 * 1024 * 1024) {
        res.status(400).json({ error: 'PDF file must be between 16 bytes and 50 MB.' });
        return;
      }
      if (fileBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        res.status(400).json({ error: 'Invalid PDF signature (%PDF- header missing).' });
        return;
      }

      let meta: Record<string, unknown> = {};
      try {
        const rawMeta = String(req.headers['x-pdf-meta'] || '');
        if (rawMeta) {
          meta = JSON.parse(decodeURIComponent(rawMeta)) as Record<string, unknown>;
        }
      } catch {
        // ignore invalid metadata header
      }

      const title = String(meta.title || 'Department PDF Book').trim();
      const department = String(meta.department || 'power').trim();
      const semester = Math.min(8, Math.max(1, Number(meta.semester) || 4));
      const subjectCode = String(meta.subjectCode || '').trim();
      const summary = String(meta.summary || '').trim();
      const downloadPermitted = meta.downloadPermitted !== false;

      const id = `snote-${crypto.randomUUID()}`;
      const catalogDir = path.join(PDF_FILES_DIR, 'catalog');
      fs.mkdirSync(catalogDir, { recursive: true });
      const storagePath = `catalog/${id}.pdf`;
      fs.writeFileSync(path.join(PDF_FILES_DIR, storagePath), fileBuffer);

      const sharedNote: DbSharedNote = {
        id,
        title,
        department,
        semester,
        subjectCode,
        summary,
        pdfUrl: `/api/catalog-pdfs/${encodeURIComponent(id)}/file`,
        storagePath,
        fileSizeBytes: fileBuffer.length,
        downloadPermitted,
        createdAt: new Date().toISOString(),
      };

      dbStore.mutate((draft) => {
        draft.sharedNotes.unshift(sharedNote);
      });

      res.status(201).json({ sharedNote });
    }
  );

  app.patch('/api/admin/shared-notes/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
    const { title, department, semester, subjectCode, summary, pdfUrl, downloadPermitted } =
      req.body ?? {};
    const updated = dbStore.mutate((draft) => {
      const target = draft.sharedNotes.find((s) => s.id === req.params.id);
      if (!target) return null;
      if (typeof title === 'string' && title.trim().length >= 2) target.title = title.trim();
      if (typeof department === 'string' && department.trim()) target.department = department.trim();
      if (semester !== undefined) {
        target.semester = Math.min(8, Math.max(1, Number(semester) || target.semester));
      }
      if (typeof subjectCode === 'string') target.subjectCode = subjectCode.trim();
      if (typeof summary === 'string') target.summary = summary.trim();
      if (typeof pdfUrl === 'string' && pdfUrl.trim()) target.pdfUrl = pdfUrl.trim();
      if (typeof downloadPermitted === 'boolean') target.downloadPermitted = downloadPermitted;
      return target;
    });
    if (!updated) {
      res.status(404).json({ error: 'PDF Book / Note not found.' });
      return;
    }
    res.json({ sharedNote: updated });
  });

  app.get('/api/catalog-pdfs/:id/file', (req: Request, res: Response) => {
    const db = dbStore.load();
    const note = db.sharedNotes.find((s) => s.id === req.params.id);
    if (!note || !note.storagePath) {
      res.status(404).json({ error: 'Catalog PDF file not found.' });
      return;
    }
    const fullPath = path.resolve(PDF_FILES_DIR, note.storagePath);
    if (!fullPath.startsWith(PDF_FILES_DIR) || !fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'PDF binary missing on server.' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${note.id}.pdf"`);
    res.sendFile(fullPath);
  });

  app.delete('/api/admin/shared-notes/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
    let removedPath: string | undefined;
    dbStore.mutate((draft) => {
      const target = draft.sharedNotes.find((s) => s.id === req.params.id);
      removedPath = target?.storagePath;
      draft.sharedNotes = draft.sharedNotes.filter((s) => s.id !== req.params.id);
    });
    if (removedPath) {
      const fullPath = path.resolve(PDF_FILES_DIR, removedPath);
      if (fullPath.startsWith(PDF_FILES_DIR) && fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
    res.json({ deleted: true });
  });

  // =========================================================================
  // PERSONAL & CLOUD PDF LIBRARY ROUTES (Unified for Firebase & Local Auth)
  // =========================================================================
  app.get('/api/pdfs', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    const db = dbStore.load();
    const mergedMap = new Map<string, typeof db.userPdfs[number] & { sourceBackend?: 'supabase' | 'server' }>();

    for (const p of db.userPdfs) {
      if (p.userId === auth.id) {
        mergedMap.set(p.id, { ...p, sourceBackend: 'server' });
      }
    }

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const sbRes = await fetch(
          `${SUPABASE_URL}/rest/v1/user_pdfs?user_id=eq.${encodeURIComponent(auth.id)}&order=created_at.desc`,
          {
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
          }
        );
        if (sbRes.ok) {
          const rows = (await sbRes.json()) as Record<string, unknown>[];
          for (const row of rows) {
            const id = String(row.id);
            if (!mergedMap.has(id)) {
              mergedMap.set(id, {
                id,
                userId: String(row.user_id),
                customTitle: String(row.custom_title),
                originalFilename: String(row.original_filename),
                storagePath: String(row.storage_path),
                fileSizeBytes: Number(row.file_size_bytes),
                mimeType: String(row.mime_type || 'application/pdf'),
                department: String(row.department || 'power'),
                semester: Number(row.semester || 4),
                subjectName: String(row.subject_name || ''),
                sourceBackend: 'supabase',
                createdAt: String(row.created_at),
                updatedAt: String(row.updated_at),
              });
            }
          }
        }
      } catch {
        // local store fallback intact
      }
    }

    const pdfs = Array.from(mergedMap.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    res.json({ pdfs });
  });

  app.post(
    '/api/pdfs/upload',
    requireAuth,
    express.raw({ type: 'application/pdf', limit: '52mb' }),
    async (req: AuthenticatedRequest, res: Response) => {
      const auth = req.authUser!;
      const fileBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (fileBuffer.length < 16 || fileBuffer.length > 50 * 1024 * 1024) {
        res.status(400).json({ error: 'PDF file must be between 16 bytes and 50 MB.' });
        return;
      }
      if (fileBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        res.status(400).json({ error: 'Invalid PDF signature (%PDF- header missing).' });
        return;
      }

      let meta: Record<string, unknown> = {};
      try {
        const rawMeta = String(req.headers['x-pdf-meta'] || '');
        if (rawMeta) {
          meta = JSON.parse(decodeURIComponent(rawMeta)) as Record<string, unknown>;
        }
      } catch {
        // ignore invalid metadata header
      }

      const customTitle = String(meta.customTitle || 'Untitled Document').trim().slice(0, 140);
      const originalFilename = String(meta.originalFilename || 'document.pdf').trim().slice(0, 180);
      const department = String(meta.department || auth.department || 'power').trim();
      const semester = Math.min(8, Math.max(1, Number(meta.semester) || auth.semester || 4));
      const subjectName = String(meta.subjectName || '').trim().slice(0, 120);

      if (customTitle.length < 2) {
        res.status(400).json({ error: 'Please enter a valid book or document title.' });
        return;
      }

      const id = crypto.randomUUID();
      const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${auth.id}/${id}-${safeName}`;
      const userDir = path.join(PDF_FILES_DIR, auth.id);
      fs.mkdirSync(userDir, { recursive: true });
      const diskPath = path.resolve(PDF_FILES_DIR, storagePath);
      if (!diskPath.startsWith(PDF_FILES_DIR)) {
        res.status(400).json({ error: 'Invalid storage path.' });
        return;
      }
      fs.writeFileSync(diskPath, fileBuffer);

      const now = new Date().toISOString();
      const record = {
        id,
        userId: auth.id,
        customTitle,
        originalFilename,
        storagePath,
        fileSizeBytes: fileBuffer.length,
        mimeType: 'application/pdf',
        department,
        semester,
        subjectName,
        createdAt: now,
        updatedAt: now,
      };

      dbStore.mutate((draft) => {
        draft.userPdfs.unshift(record);
      });

      let sourceBackend: 'supabase' | 'server' = 'server';
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const encodedStorage = storagePath
            .split('/')
            .map((seg) => encodeURIComponent(seg))
            .join('/');
          const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/user-pdfs/${encodedStorage}`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/pdf',
              'x-upsert': 'true',
            },
            body: new Uint8Array(fileBuffer),
          });
          if (upRes.ok) {
            const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/user_pdfs`, {
              method: 'POST',
              headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                id: record.id,
                user_id: record.userId,
                custom_title: record.customTitle,
                original_filename: record.originalFilename,
                storage_path: record.storagePath,
                file_size_bytes: record.fileSizeBytes,
                mime_type: record.mimeType,
                department: record.department,
                semester: record.semester,
                subject_name: record.subjectName,
                created_at: now,
                updated_at: now,
              }),
            });
            if (dbRes.ok) sourceBackend = 'supabase';
          }
        } catch {
          // local server disk + dbStore already saved cleanly
        }
      }

      res.status(201).json({ pdf: { ...record, sourceBackend } });
    }
  );

  app.get('/api/pdfs/:id/file', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    const db = dbStore.load();
    const found = db.userPdfs.find((p) => p.id === req.params.id);

    if (found) {
      if (found.userId !== auth.id && auth.role !== 'admin') {
        res.status(403).json({ error: 'You do not have access to this private PDF.' });
        return;
      }
      const diskPath = path.resolve(PDF_FILES_DIR, found.storagePath);
      if (diskPath.startsWith(PDF_FILES_DIR) && fs.existsSync(diskPath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${found.originalFilename.replace(/["\\]/g, '_')}"`
        );
        res.sendFile(diskPath);
        return;
      }
    }

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const metaRes = await fetch(
          `${SUPABASE_URL}/rest/v1/user_pdfs?id=eq.${encodeURIComponent(req.params.id)}&select=*`,
          {
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
          }
        );
        if (metaRes.ok) {
          const rows = (await metaRes.json()) as Record<string, unknown>[];
          const row = rows[0];
          if (row) {
            if (String(row.user_id) !== auth.id && auth.role !== 'admin') {
              res.status(403).json({ error: 'Access denied.' });
              return;
            }
            const encodedStorage = String(row.storage_path)
              .split('/')
              .map((seg) => encodeURIComponent(seg))
              .join('/');
            const fileRes = await fetch(
              `${SUPABASE_URL}/storage/v1/object/authenticated/user-pdfs/${encodedStorage}`,
              {
                headers: {
                  apikey: SUPABASE_SERVICE_ROLE_KEY,
                  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
              }
            );
            if (fileRes.ok) {
              const arrayBuf = await fileRes.arrayBuffer();
              res.setHeader('Content-Type', 'application/pdf');
              res.send(Buffer.from(arrayBuf));
              return;
            }
          }
        }
      } catch {
        // fall through to 404
      }
    }

    res.status(404).json({ error: 'PDF file not found.' });
  });

  app.patch('/api/pdfs/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    const { customTitle, department, semester, subjectName } = req.body ?? {};
    const now = new Date().toISOString();

    const updated = dbStore.mutate((draft) => {
      const target = draft.userPdfs.find((p) => p.id === req.params.id && p.userId === auth.id);
      if (!target) return null;
      if (typeof customTitle === 'string' && customTitle.trim().length >= 2) {
        target.customTitle = customTitle.trim().slice(0, 140);
      }
      if (typeof department === 'string' && department.trim()) {
        target.department = department.trim();
      }
      if (semester !== undefined) {
        target.semester = Math.min(8, Math.max(1, Number(semester) || target.semester));
      }
      if (typeof subjectName === 'string') {
        target.subjectName = subjectName.trim().slice(0, 120);
      }
      target.updatedAt = now;
      return target;
    });

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const patchPayload: Record<string, unknown> = { updated_at: now };
      if (typeof customTitle === 'string' && customTitle.trim().length >= 2) {
        patchPayload.custom_title = customTitle.trim().slice(0, 140);
      }
      if (typeof department === 'string' && department.trim()) patchPayload.department = department.trim();
      if (semester !== undefined) patchPayload.semester = Math.min(8, Math.max(1, Number(semester) || 4));
      if (typeof subjectName === 'string') patchPayload.subject_name = subjectName.trim().slice(0, 120);

      await fetch(
        `${SUPABASE_URL}/rest/v1/user_pdfs?id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(auth.id)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(patchPayload),
        }
      ).catch(() => {});
    }

    if (!updated) {
      res.status(404).json({ error: 'PDF record not found.' });
      return;
    }
    res.json({ pdf: updated });
  });

  app.delete('/api/pdfs/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    let removedPath: string | null = null;
    dbStore.mutate((draft) => {
      const idx = draft.userPdfs.findIndex(
        (p) => p.id === req.params.id && (p.userId === auth.id || auth.role === 'admin')
      );
      if (idx >= 0) {
        removedPath = draft.userPdfs[idx].storagePath;
        draft.userPdfs.splice(idx, 1);
      }
    });

    if (removedPath) {
      const diskPath = path.resolve(PDF_FILES_DIR, removedPath);
      if (diskPath.startsWith(PDF_FILES_DIR) && fs.existsSync(diskPath)) {
        fs.unlinkSync(diskPath);
      }
    }

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      if (removedPath) {
        await fetch(`${SUPABASE_URL}/storage/v1/object/user-pdfs`, {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prefixes: [removedPath] }),
        }).catch(() => {});
      }
      await fetch(
        `${SUPABASE_URL}/rest/v1/user_pdfs?id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(auth.id)}`,
        {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      ).catch(() => {});
    }

    res.json({ deleted: true });
  });

  app.post('/api/admin/mcqs', requireAuth, requireAdmin, (req: Request, res: Response) => {
    const {
      category = 'পাওয়ার টেকনোলজি',
      department = 'power',
      semester = 4,
      questionBn,
      optionsBn,
      correctIndex = 0,
      explanationBn = '',
    } = req.body ?? {};

    if (!questionBn || !Array.isArray(optionsBn) || optionsBn.length !== 4) {
      res.status(400).json({ error: 'Question and 4 options are required.' });
      return;
    }

    const mcq: DbMcq = {
      id: `mcq-adm-${crypto.randomUUID()}`,
      category: String(category),
      department: String(department),
      semester: Math.min(8, Math.max(1, Number(semester) || 1)),
      questionBn: String(questionBn).trim(),
      optionsBn: [
        String(optionsBn[0]).trim(),
        String(optionsBn[1]).trim(),
        String(optionsBn[2]).trim(),
        String(optionsBn[3]).trim(),
      ],
      correctIndex: Math.min(3, Math.max(0, Number(correctIndex) || 0)) as 0 | 1 | 2 | 3,
      explanationBn: String(explanationBn).trim(),
      createdAt: new Date().toISOString(),
    };
    dbStore.mutate((draft) => {
      draft.mcqs.unshift(mcq);
    });
    res.status(201).json({ mcq });
  });

  app.delete('/api/admin/mcqs/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
    dbStore.mutate((draft) => {
      draft.mcqs = draft.mcqs.filter((m) => m.id !== req.params.id);
    });
    res.json({ deleted: true });
  });

  app.put('/api/admin/config', requireAuth, requireAdmin, (req: Request, res: Response) => {
    const {
      appVersion,
      apkStatus,
      apkDownloadUrl,
      apkReleaseNotes,
      btebResultUrl,
      officialWebsiteUrl,
    } = req.body ?? {};

    const updated = dbStore.mutate((draft) => {
      if (typeof appVersion === 'string' && appVersion.trim()) {
        draft.appConfig.appVersion = appVersion.trim();
      }
      if (apkStatus === 'coming_soon' || apkStatus === 'available') {
        draft.appConfig.apkStatus = apkStatus;
      }
      if (typeof apkDownloadUrl === 'string') {
        draft.appConfig.apkDownloadUrl = apkDownloadUrl.trim();
      }
      if (typeof apkReleaseNotes === 'string') {
        draft.appConfig.apkReleaseNotes = apkReleaseNotes.trim();
      }
      if (typeof btebResultUrl === 'string' && btebResultUrl.trim()) {
        draft.appConfig.btebResultUrl = btebResultUrl.trim();
      }
      if (typeof officialWebsiteUrl === 'string' && officialWebsiteUrl.trim()) {
        draft.appConfig.officialWebsiteUrl = officialWebsiteUrl.trim();
      }
      draft.appConfig.updatedAt = new Date().toISOString();
      return draft.appConfig;
    });

    res.json({ appConfig: updated });
  });

  app.get('/api/admin/users', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const db = dbStore.load();
    const mergedMap = new Map<string, PublicUser>();

    for (const u of db.users) {
      mergedMap.set(u.id, toPublicUser(u));
    }

    if (SUPABASE_URL && SUPABASE_ANON_KEY && req.supabaseAccessToken) {
      try {
        const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&order=created_at.desc`, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${req.supabaseAccessToken}`,
          },
        });
        if (profRes.ok) {
          const rows = (await profRes.json()) as Record<string, unknown>[];
          for (const row of rows) {
            mergedMap.set(String(row.id), mapSupabaseProfileRow(row));
          }
        }
      } catch {
        // fallback to local list
      }
    }

    res.json({ users: Array.from(mergedMap.values()) });
  });

  app.patch(
    '/api/admin/users/:id/role',
    requireAuth,
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const { role } = req.body ?? {};
      if (role !== 'student' && role !== 'admin') {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }
      if (req.params.id === req.authUser?.id && role !== 'admin') {
        res.status(400).json({ error: 'You cannot demote yourself.' });
        return;
      }

      let updatedUser: PublicUser | null = null;
      dbStore.mutate((draft) => {
        const user = draft.users.find((u) => u.id === req.params.id);
        if (!user) return;
        user.role = role;
        user.updatedAt = new Date().toISOString();
        updatedUser = toPublicUser(user);
      });

      const sbKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
      const sbAuth = SUPABASE_SERVICE_ROLE_KEY || req.supabaseAccessToken;
      if (SUPABASE_URL && sbKey && sbAuth) {
        try {
          const patchRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(req.params.id)}`,
            {
              method: 'PATCH',
              headers: {
                apikey: sbKey,
                Authorization: `Bearer ${sbAuth}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
              },
              body: JSON.stringify({ role, updated_at: new Date().toISOString() }),
            }
          );
          if (patchRes.ok) {
            const rows = (await patchRes.json()) as Record<string, unknown>[];
            if (rows[0]) {
              updatedUser = mapSupabaseProfileRow(rows[0]);
            }
          }
        } catch {
          // ignore
        }
      }

      if (!updatedUser) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      res.json({ user: updatedUser });
    }
  );

  app.patch(
    '/api/admin/users/:id/status',
    requireAuth,
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const { isDisabled } = req.body ?? {};
      if (typeof isDisabled !== 'boolean') {
        res.status(400).json({ error: 'isDisabled boolean is required.' });
        return;
      }
      if (req.params.id === req.authUser?.id && isDisabled) {
        res.status(400).json({ error: 'You cannot disable your own admin account.' });
        return;
      }

      let updatedUser: PublicUser | null = null;
      dbStore.mutate((draft) => {
        const user = draft.users.find((u) => u.id === req.params.id);
        if (!user) return;
        user.isDisabled = isDisabled;
        user.updatedAt = new Date().toISOString();
        updatedUser = toPublicUser(user);
      });

      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(req.params.id)}`,
          {
            method: 'PATCH',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ is_disabled: isDisabled, updated_at: new Date().toISOString() }),
          }
        ).catch(() => {});
      }

      if (!updatedUser) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      res.json({ user: updatedUser });
    }
  );

  app.patch('/api/admin/community/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
    const { isHidden, clearReports } = req.body ?? {};
    const post = dbStore.mutate((draft) => {
      const found = draft.communityPosts.find((p) => p.id === req.params.id);
      if (!found) return null;
      if (typeof isHidden === 'boolean') found.isHidden = isHidden;
      if (clearReports) found.reportsCount = 0;
      return found;
    });
    if (!post) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    res.json({ post });
  });

  // =========================================================================
  // ADVANCED PUSH NOTIFICATIONS (STUDENT INBOX, PREFERENCES, DEVICE TOKENS & ADMIN)
  // =========================================================================
  const VALID_PUSH_CATEGORIES: PushCategory[] = [
    'APP_UPDATE',
    'IMPORTANT',
    'EDUCATION',
    'EMERGENCY',
    'GENERAL',
  ];

  const rateLimitBuckets = new Map<string, number[]>();
  function checkRateLimit(key: string, maxHits: number, windowMs: number): boolean {
    const now = Date.now();
    const hits = (rateLimitBuckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
    if (hits.length >= maxHits) {
      rateLimitBuckets.set(key, hits);
      return false;
    }
    hits.push(now);
    rateLimitBuckets.set(key, hits);
    return true;
  }

  function defaultPreferencesForUser(userId: string): DbNotificationPreference {
    return {
      userId,
      pushEnabled: true,
      soundEnabled: true,
      soundStyle: 'chime',
      allowAppUpdate: true,
      allowImportant: true,
      allowEducation: true,
      allowEmergency: true,
      allowGeneral: true,
      respectDnd: true,
      updatedAt: new Date().toISOString(),
    };
  }

  function prefAllowsPush(
    pref: DbNotificationPreference | undefined,
    category: PushCategory
  ): { allowPush: boolean; allowSound: boolean } {
    if (!pref) return { allowPush: true, allowSound: true };
    const catAllowed =
      category === 'APP_UPDATE'
        ? pref.allowAppUpdate
        : category === 'IMPORTANT'
          ? pref.allowImportant
          : category === 'EDUCATION'
            ? pref.allowEducation
            : category === 'EMERGENCY'
              ? pref.allowEmergency
              : pref.allowGeneral;
    return {
      allowPush: pref.pushEnabled && catAllowed,
      allowSound: pref.pushEnabled && catAllowed && pref.soundEnabled,
    };
  }

  async function resolveAudienceRecipients(
    audienceType: PushAudienceType,
    targetUserIds: string[],
    targetDepartment: string,
    targetSemester: number | null,
    supabaseAuthToken?: string
  ): Promise<{ id: string; department: string; semester: number }[]> {
    const db = dbStore.load();
    const userMap = new Map<string, { id: string; department: string; semester: number }>();

    for (const u of db.users) {
      userMap.set(u.id, { id: u.id, department: u.department, semester: u.semester });
    }

    const sbKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    const sbAuth = SUPABASE_SERVICE_ROLE_KEY || supabaseAuthToken;
    if (SUPABASE_URL && sbKey && sbAuth) {
      try {
        const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,department,semester`, {
          headers: {
            apikey: sbKey,
            Authorization: `Bearer ${sbAuth}`,
          },
        });
        if (profRes.ok) {
          const rows = (await profRes.json()) as {
            id: string;
            department?: string;
            semester?: number;
          }[];
          for (const r of rows) {
            userMap.set(String(r.id), {
              id: String(r.id),
              department: String(r.department || 'power'),
              semester: Number(r.semester || 4),
            });
          }
        }
      } catch {
        // fallback to local users
      }
    }

    const all = Array.from(userMap.values());
    if (audienceType === 'selected_users') {
      const targetSet = new Set(targetUserIds);
      return all.filter((u) => targetSet.has(u.id));
    }
    if (audienceType === 'department_semester') {
      return all.filter((u) => {
        if (targetDepartment && u.department !== targetDepartment) return false;
        if (targetSemester && Number(u.semester) !== Number(targetSemester)) return false;
        return true;
      });
    }
    return all;
  }

  async function executeNotificationDispatch(input: {
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
    createdBy: string;
    supabaseAccessToken?: string;
  }): Promise<{
    campaign: DbNotificationCampaign;
    fcmConfigured: boolean;
    invalidTokensCleaned: number;
  }> {
    const recipients = await resolveAudienceRecipients(
      input.audienceType,
      input.targetUserIds,
      input.targetDepartment,
      input.targetSemester,
      input.supabaseAccessToken
    );

    const db = dbStore.load();
    const recipientIds = recipients.map((r) => r.id);
    const recipientSet = new Set(recipientIds);
    const activeTokens = db.deviceTokens.filter(
      (dt) => dt.isActive && recipientSet.has(dt.userId)
    );

    const notificationId = crypto.randomUUID();
    const now = new Date().toISOString();
    const fcmConfigured = isFcmAdminConfigured();

    let fcmSentCount = 0;
    let fcmFailedCount = 0;
    const invalidTokenIds: string[] = [];

    if (fcmConfigured && activeTokens.length > 0) {
      for (const dev of activeTokens) {
        const pref = db.notificationPreferences.find((p) => p.userId === dev.userId);
        const { allowPush, allowSound } = prefAllowsPush(pref, input.category);
        if (!allowPush) continue;

        const effectiveSound: PushSoundMode =
          input.soundMode === 'silent' || !allowSound
            ? 'silent'
            : input.soundMode === 'default'
              ? 'default'
              : 'custom';

        try {
          const result = await dispatchFcmMessage({
            token: dev.token,
            platform: dev.platform,
            title: input.title,
            body: input.body,
            category: input.category,
            notificationId,
            targetView: input.targetView,
            actionUrl: input.actionUrl,
            imageUrl: input.imageUrl,
            soundMode: effectiveSound,
          });
          if (result.ok) {
            fcmSentCount += 1;
          } else {
            fcmFailedCount += 1;
            if (result.invalidToken) invalidTokenIds.push(dev.id);
          }
        } catch {
          fcmFailedCount += 1;
        }
      }
    }

    const finalStatus: DbNotificationCampaign['status'] =
      fcmFailedCount > 0 && fcmSentCount === 0 && activeTokens.length > 0 ? 'partial' : 'sent';

    const campaign: DbNotificationCampaign = {
      id: notificationId,
      title: input.title,
      body: input.body,
      category: input.category,
      imageUrl: input.imageUrl,
      targetView: input.targetView,
      actionUrl: input.actionUrl,
      audienceType: input.audienceType,
      targetUserIds: input.targetUserIds,
      targetDepartment: input.targetDepartment,
      targetSemester: input.targetSemester,
      soundMode: input.soundMode,
      status: finalStatus,
      totalRecipients: recipientIds.length,
      fcmSentCount,
      fcmFailedCount,
      createdBy: input.createdBy,
      createdAt: now,
    };

    dbStore.mutate((draft) => {
      if (invalidTokenIds.length > 0) {
        const invalidSet = new Set(invalidTokenIds);
        for (const dt of draft.deviceTokens) {
          if (invalidSet.has(dt.id)) dt.isActive = false;
        }
      }

      draft.notifications.unshift(campaign);

      for (const uid of recipientIds) {
        const inboxItem: DbUserNotification = {
          id: crypto.randomUUID(),
          notificationId,
          userId: uid,
          title: input.title,
          body: input.body,
          category: input.category,
          imageUrl: input.imageUrl,
          targetView: input.targetView,
          actionUrl: input.actionUrl,
          isRead: false,
          readAt: '',
          deliveredVia: fcmSentCount > 0 ? 'fcm_and_in_app' : 'in_app',
          createdAt: now,
        };
        draft.userNotifications.unshift(inboxItem);
      }
      // Keep local inbox store bounded reasonably
      if (draft.userNotifications.length > 5000) {
        draft.userNotifications = draft.userNotifications.slice(0, 5000);
      }
    });

    // Optional mirror into Supabase tables when service role or admin token is present
    const sbKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    const sbAuth = SUPABASE_SERVICE_ROLE_KEY || input.supabaseAccessToken;
    if (SUPABASE_URL && sbKey && sbAuth) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
          method: 'POST',
          headers: {
            apikey: sbKey,
            Authorization: `Bearer ${sbAuth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: campaign.id,
            title: campaign.title,
            body: campaign.body,
            category: campaign.category,
            image_url: campaign.imageUrl,
            target_view: campaign.targetView,
            action_url: campaign.actionUrl,
            audience_type: campaign.audienceType,
            target_user_ids: campaign.targetUserIds,
            target_department: campaign.targetDepartment,
            target_semester: campaign.targetSemester,
            sound_mode: campaign.soundMode,
            status: campaign.status,
            total_recipients: campaign.totalRecipients,
            fcm_sent_count: campaign.fcmSentCount,
            fcm_failed_count: campaign.fcmFailedCount,
            created_by: campaign.createdBy.startsWith('usr-') ? null : campaign.createdBy,
            created_at: campaign.createdAt,
          }),
        });

        const uuidRecipients = recipientIds.filter((id) => !id.startsWith('usr-'));
        if (uuidRecipients.length > 0) {
          await fetch(`${SUPABASE_URL}/rest/v1/user_notifications`, {
            method: 'POST',
            headers: {
              apikey: sbKey,
              Authorization: `Bearer ${sbAuth}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(
              uuidRecipients.map((uid) => ({
                notification_id: campaign.id,
                user_id: uid,
                title: campaign.title,
                body: campaign.body,
                category: campaign.category,
                image_url: campaign.imageUrl,
                target_view: campaign.targetView,
                action_url: campaign.actionUrl,
                delivered_via: fcmSentCount > 0 ? 'fcm_and_in_app' : 'in_app',
              }))
            ),
          });
        }
      } catch {
        // Local storage remains authoritative fallback if Supabase migration isn't applied yet
      }
    }

    return {
      campaign,
      fcmConfigured,
      invalidTokensCleaned: invalidTokenIds.length,
    };
  }

  // Register or refresh a device FCM token (Web / Android / iOS)
  app.post('/api/notifications/device-token', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    if (!checkRateLimit(`token:${auth.id}`, 25, 5 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many device token requests. Try again shortly.' });
      return;
    }

    const { token, platform = 'web', browserOrDevice = '', appVersion = '2.0.0' } = req.body ?? {};
    if (typeof token !== 'string' || token.trim().length < 20 || token.trim().length > 4096) {
      res.status(400).json({ error: 'Valid FCM device token is required.' });
      return;
    }
    const cleanPlatform: 'web' | 'android' | 'ios' =
      platform === 'android' || platform === 'ios' ? platform : 'web';
    const cleanToken = token.trim();
    const now = new Date().toISOString();

    const saved = dbStore.mutate((draft) => {
      const existing = draft.deviceTokens.find((dt) => dt.token === cleanToken);
      if (existing) {
        existing.userId = auth.id;
        existing.platform = cleanPlatform;
        existing.browserOrDevice = String(browserOrDevice || existing.browserOrDevice).slice(0, 120);
        existing.appVersion = String(appVersion || existing.appVersion).slice(0, 32);
        existing.isActive = true;
        existing.lastSeenAt = now;
        return existing;
      }
      const created: DbDeviceToken = {
        id: crypto.randomUUID(),
        userId: auth.id,
        token: cleanToken,
        platform: cleanPlatform,
        browserOrDevice: String(browserOrDevice || '').slice(0, 120),
        appVersion: String(appVersion || '2.0.0').slice(0, 32),
        isActive: true,
        lastSeenAt: now,
        createdAt: now,
      };
      draft.deviceTokens.unshift(created);
      return created;
    });

    if (SUPABASE_URL && SUPABASE_ANON_KEY && req.supabaseAccessToken && !auth.id.startsWith('usr-')) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/device_tokens?on_conflict=token`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${req.supabaseAccessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            user_id: auth.id,
            token: cleanToken,
            platform: cleanPlatform,
            browser_or_device: saved.browserOrDevice,
            app_version: saved.appVersion,
            is_active: true,
            last_seen_at: now,
          }),
        });
      } catch {
        // ignore
      }
    }

    res.status(201).json({ deviceToken: saved });
  });

  app.delete('/api/notifications/device-token', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    const { token } = req.body ?? {};
    if (typeof token !== 'string' || !token.trim()) {
      res.status(400).json({ error: 'Token is required.' });
      return;
    }
    const cleanToken = token.trim();
    dbStore.mutate((draft) => {
      for (const dt of draft.deviceTokens) {
        if (dt.token === cleanToken && dt.userId === auth.id) {
          dt.isActive = false;
        }
      }
    });

    if (SUPABASE_URL && SUPABASE_ANON_KEY && req.supabaseAccessToken) {
      try {
        await fetch(
          `${SUPABASE_URL}/rest/v1/device_tokens?token=eq.${encodeURIComponent(cleanToken)}&user_id=eq.${encodeURIComponent(auth.id)}`,
          {
            method: 'PATCH',
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${req.supabaseAccessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ is_active: false }),
          }
        );
      } catch {
        // ignore
      }
    }
    res.json({ deactivated: true });
  });

  app.get('/api/notifications/inbox', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    const db = dbStore.load();
    const notifications = db.userNotifications
      .filter((n) => n.userId === auth.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const preferences =
      db.notificationPreferences.find((p) => p.userId === auth.id) ??
      defaultPreferencesForUser(auth.id);
    const devices = db.deviceTokens.filter((dt) => dt.userId === auth.id && dt.isActive);
    const unreadCount = notifications.filter((n) => !n.isRead).length;

    res.json({
      notifications,
      unreadCount,
      preferences,
      devices,
      fcmConfigured: isFcmAdminConfigured(),
    });
  });

  app.patch('/api/notifications/inbox/:id/read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    const now = new Date().toISOString();
    const updated = dbStore.mutate((draft) => {
      const item = draft.userNotifications.find(
        (n) => n.id === req.params.id && n.userId === auth.id
      );
      if (!item) return null;
      item.isRead = true;
      item.readAt = now;
      return item;
    });
    if (!updated) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    res.json({ notification: updated });
  });

  app.post('/api/notifications/inbox/read-all', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    const now = new Date().toISOString();
    let count = 0;
    dbStore.mutate((draft) => {
      for (const n of draft.userNotifications) {
        if (n.userId === auth.id && !n.isRead) {
          n.isRead = true;
          n.readAt = now;
          count += 1;
        }
      }
    });
    res.json({ markedCount: count });
  });

  app.delete('/api/notifications/inbox/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    dbStore.mutate((draft) => {
      draft.userNotifications = draft.userNotifications.filter(
        (n) => !(n.id === req.params.id && n.userId === auth.id)
      );
    });
    res.json({ deleted: true });
  });

  app.get('/api/notifications/preferences', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    const db = dbStore.load();
    const preferences =
      db.notificationPreferences.find((p) => p.userId === auth.id) ??
      defaultPreferencesForUser(auth.id);
    res.json({ preferences });
  });

  app.put('/api/notifications/preferences', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    const body = req.body ?? {};
    const now = new Date().toISOString();

    const updated = dbStore.mutate((draft) => {
      let pref = draft.notificationPreferences.find((p) => p.userId === auth.id);
      if (!pref) {
        pref = defaultPreferencesForUser(auth.id);
        draft.notificationPreferences.push(pref);
      }
      if (typeof body.pushEnabled === 'boolean') pref.pushEnabled = body.pushEnabled;
      if (typeof body.soundEnabled === 'boolean') pref.soundEnabled = body.soundEnabled;
      if (
        body.soundStyle === 'chime' ||
        body.soundStyle === 'alert' ||
        body.soundStyle === 'soft' ||
        body.soundStyle === 'bell' ||
        body.soundStyle === 'system'
      ) {
        pref.soundStyle = body.soundStyle;
      }
      if (typeof body.allowAppUpdate === 'boolean') pref.allowAppUpdate = body.allowAppUpdate;
      if (typeof body.allowImportant === 'boolean') pref.allowImportant = body.allowImportant;
      if (typeof body.allowEducation === 'boolean') pref.allowEducation = body.allowEducation;
      if (typeof body.allowEmergency === 'boolean') pref.allowEmergency = body.allowEmergency;
      if (typeof body.allowGeneral === 'boolean') pref.allowGeneral = body.allowGeneral;
      if (typeof body.respectDnd === 'boolean') pref.respectDnd = body.respectDnd;
      pref.updatedAt = now;
      return pref;
    });

    const sbKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    const sbAuth = SUPABASE_SERVICE_ROLE_KEY || req.supabaseAccessToken;
    if (SUPABASE_URL && sbKey && sbAuth && !auth.id.startsWith('usr-')) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/notification_preferences?on_conflict=user_id`, {
          method: 'POST',
          headers: {
            apikey: sbKey,
            Authorization: `Bearer ${sbAuth}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            user_id: auth.id,
            push_enabled: updated.pushEnabled,
            sound_enabled: updated.soundEnabled,
            sound_style: updated.soundStyle,
            allow_app_update: updated.allowAppUpdate,
            allow_important: updated.allowImportant,
            allow_education: updated.allowEducation,
            allow_emergency: updated.allowEmergency,
            allow_general: updated.allowGeneral,
            respect_dnd: updated.respectDnd,
            updated_at: now,
          }),
        });
      } catch {
        // ignore if migration not yet applied
      }
    }

    res.json({ preferences: updated });
  });

  // Admin Push Notification Management Endpoints
  app.get('/api/admin/notifications', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
    const db = dbStore.load();
    const activeDevices = db.deviceTokens.filter((dt) => dt.isActive);
    const totalReadCount = db.userNotifications.filter((n) => n.isRead).length;
    const totalDeliveredInbox = db.userNotifications.length;

    res.json({
      fcmConfigured: isFcmAdminConfigured(),
      supabaseServiceConfigured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
      history: [...db.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      scheduled: [...db.scheduledNotifications].sort((a, b) =>
        a.scheduledFor.localeCompare(b.scheduledFor)
      ),
      stats: {
        totalCampaigns: db.notifications.length,
        totalPendingScheduled: db.scheduledNotifications.filter((s) => s.status === 'pending').length,
        totalRecipientsReached: db.notifications.reduce((sum, n) => sum + n.totalRecipients, 0),
        totalFcmSent: db.notifications.reduce((sum, n) => sum + n.fcmSentCount, 0),
        totalFcmFailed: db.notifications.reduce((sum, n) => sum + n.fcmFailedCount, 0),
        totalInboxRead: totalReadCount,
        totalInboxDelivered: totalDeliveredInbox,
        activeWebDevices: activeDevices.filter((d) => d.platform === 'web').length,
        activeAndroidDevices: activeDevices.filter((d) => d.platform === 'android').length,
      },
    });
  });

  app.post('/api/admin/notifications/send', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    if (!checkRateLimit(`admin-send:${auth.id}`, 25, 5 * 60 * 1000)) {
      res.status(429).json({
        error: 'Rate limit reached (max 25 notification campaigns per 5 minutes).',
      });
      return;
    }

    const {
      title,
      body,
      category = 'GENERAL',
      imageUrl = '',
      targetView = 'notifications',
      actionUrl = '',
      audienceType = 'all',
      targetUserIds = [],
      targetDepartment = '',
      targetSemester = null,
      soundMode = 'custom',
      scheduledFor = null,
    } = req.body ?? {};

    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    const cleanBody = typeof body === 'string' ? body.trim() : '';
    if (cleanTitle.length < 2 || cleanTitle.length > 140) {
      res.status(400).json({ error: 'Notification title must be 2–140 characters.' });
      return;
    }
    if (cleanBody.length < 2 || cleanBody.length > 1000) {
      res.status(400).json({ error: 'Notification message must be 2–1000 characters.' });
      return;
    }
    if (!VALID_PUSH_CATEGORIES.includes(category)) {
      res.status(400).json({ error: 'Invalid notification category.' });
      return;
    }

    const cleanImage = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    if (cleanImage && !/^https?:\/\//i.test(cleanImage) && !cleanImage.startsWith('/')) {
      res.status(400).json({ error: 'Optional image URL must start with https:// or /' });
      return;
    }

    const cleanAudience: PushAudienceType =
      audienceType === 'selected_users' || audienceType === 'department_semester'
        ? audienceType
        : 'all';
    const cleanUserIds = Array.isArray(targetUserIds) ? targetUserIds.map(String) : [];
    if (cleanAudience === 'selected_users' && cleanUserIds.length === 0) {
      res.status(400).json({ error: 'Select at least one recipient user.' });
      return;
    }

    const cleanSemester =
      targetSemester !== null && targetSemester !== '' && Number(targetSemester) >= 1 && Number(targetSemester) <= 8
        ? Number(targetSemester)
        : null;
    const cleanSound: PushSoundMode =
      soundMode === 'default' || soundMode === 'silent' ? soundMode : 'custom';

    // Schedule for later if scheduledFor is provided
    if (scheduledFor) {
      const dt = new Date(scheduledFor);
      if (Number.isNaN(dt.getTime()) || dt.getTime() <= Date.now() + 10000) {
        res.status(400).json({ error: 'Scheduled time must be at least 10 seconds in the future.' });
        return;
      }

      const now = new Date().toISOString();
      const scheduledItem: DbScheduledNotification = {
        id: crypto.randomUUID(),
        title: cleanTitle,
        body: cleanBody,
        category,
        imageUrl: cleanImage,
        targetView: String(targetView || 'notifications').trim() || 'notifications',
        actionUrl: String(actionUrl || '').trim(),
        audienceType: cleanAudience,
        targetUserIds: cleanUserIds,
        targetDepartment: String(targetDepartment || '').trim(),
        targetSemester: cleanSemester,
        soundMode: cleanSound,
        scheduledFor: dt.toISOString(),
        status: 'pending',
        sentNotificationId: '',
        errorMessage: '',
        createdBy: auth.id,
        createdAt: now,
        updatedAt: now,
      };

      dbStore.mutate((draft) => {
        draft.scheduledNotifications.unshift(scheduledItem);
      });

      res.status(201).json({ scheduled: true, scheduledNotification: scheduledItem });
      return;
    }

    const result = await executeNotificationDispatch({
      title: cleanTitle,
      body: cleanBody,
      category,
      imageUrl: cleanImage,
      targetView: String(targetView || 'notifications').trim() || 'notifications',
      actionUrl: String(actionUrl || '').trim(),
      audienceType: cleanAudience,
      targetUserIds: cleanUserIds,
      targetDepartment: String(targetDepartment || '').trim(),
      targetSemester: cleanSemester,
      soundMode: cleanSound,
      createdBy: auth.id,
      supabaseAccessToken: req.supabaseAccessToken,
    });

    res.status(201).json({
      scheduled: false,
      fcmConfigured: result.fcmConfigured,
      campaign: result.campaign,
      invalidTokensCleaned: result.invalidTokensCleaned,
    });
  });

  app.patch('/api/admin/notifications/scheduled/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
    const {
      title,
      body,
      category,
      imageUrl,
      targetView,
      audienceType,
      targetUserIds,
      targetDepartment,
      targetSemester,
      soundMode,
      scheduledFor,
      status,
    } = req.body ?? {};

    const updated = dbStore.mutate((draft) => {
      const found = draft.scheduledNotifications.find((s) => s.id === req.params.id);
      if (!found || found.status === 'sent') return null;

      if (typeof title === 'string' && title.trim().length >= 2) found.title = title.trim().slice(0, 140);
      if (typeof body === 'string' && body.trim().length >= 2) found.body = body.trim().slice(0, 1000);
      if (VALID_PUSH_CATEGORIES.includes(category)) found.category = category;
      if (typeof imageUrl === 'string') found.imageUrl = imageUrl.trim();
      if (typeof targetView === 'string' && targetView.trim()) found.targetView = targetView.trim();
      if (audienceType === 'all' || audienceType === 'selected_users' || audienceType === 'department_semester') {
        found.audienceType = audienceType;
      }
      if (Array.isArray(targetUserIds)) found.targetUserIds = targetUserIds.map(String);
      if (typeof targetDepartment === 'string') found.targetDepartment = targetDepartment.trim();
      if (targetSemester !== undefined) {
        found.targetSemester =
          targetSemester !== null && targetSemester !== '' && Number(targetSemester) >= 1 && Number(targetSemester) <= 8
            ? Number(targetSemester)
            : null;
      }
      if (soundMode === 'custom' || soundMode === 'default' || soundMode === 'silent') {
        found.soundMode = soundMode;
      }
      if (scheduledFor) {
        const dt = new Date(scheduledFor);
        if (!Number.isNaN(dt.getTime())) found.scheduledFor = dt.toISOString();
      }
      if (status === 'pending' || status === 'cancelled') {
        found.status = status;
      }
      found.updatedAt = new Date().toISOString();
      return found;
    });

    if (!updated) {
      res.status(404).json({ error: 'Editable scheduled notification not found.' });
      return;
    }
    res.json({ scheduledNotification: updated });
  });

  app.delete('/api/admin/notifications/scheduled/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
    dbStore.mutate((draft) => {
      draft.scheduledNotifications = draft.scheduledNotifications.filter((s) => s.id !== req.params.id);
    });
    res.json({ deleted: true });
  });

  // Periodic background processor for due scheduled notifications (Node server mode)
  let schedulerRunning = false;
  const schedulerInterval = setInterval(async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      const nowMs = Date.now();
      const db = dbStore.load();
      const dueJobs = db.scheduledNotifications.filter(
        (s) => s.status === 'pending' && new Date(s.scheduledFor).getTime() <= nowMs
      );
      for (const job of dueJobs) {
        dbStore.mutate((draft) => {
          const target = draft.scheduledNotifications.find((s) => s.id === job.id);
          if (target) target.status = 'processing';
        });
        try {
          const result = await executeNotificationDispatch({
            title: job.title,
            body: job.body,
            category: job.category,
            imageUrl: job.imageUrl,
            targetView: job.targetView,
            actionUrl: job.actionUrl,
            audienceType: job.audienceType,
            targetUserIds: job.targetUserIds,
            targetDepartment: job.targetDepartment,
            targetSemester: job.targetSemester,
            soundMode: job.soundMode,
            createdBy: job.createdBy,
          });
          dbStore.mutate((draft) => {
            const target = draft.scheduledNotifications.find((s) => s.id === job.id);
            if (target) {
              target.status = 'sent';
              target.sentNotificationId = result.campaign.id;
              target.updatedAt = new Date().toISOString();
            }
          });
        } catch (err) {
          dbStore.mutate((draft) => {
            const target = draft.scheduledNotifications.find((s) => s.id === job.id);
            if (target) {
              target.status = 'failed';
              target.errorMessage = err instanceof Error ? err.message : String(err);
              target.updatedAt = new Date().toISOString();
            }
          });
        }
      }
    } finally {
      schedulerRunning = false;
    }
  }, 20000);
  schedulerInterval.unref?.();

  // =========================================================================
  // FAST STREAMING AI TUTOR (SSE) + NON-STREAMING FALLBACK + SESSION HISTORY
  // =========================================================================
  type SupportedAiModel = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

  function sanitizeAiSessionId(raw: unknown): string {
    if (typeof raw === 'string') {
      const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
      if (cleaned.length >= 4) {
        return cleaned;
      }
    }
    return `ai-sess-${crypto.randomUUID()}`;
  }

  function resolveSessionTurnsForContext(
    sessionId: string,
    ownerId: string | undefined,
    clientHistory: ChatHistoryTurn[] | undefined,
    currentMessage: string,
    isRetry: boolean | undefined,
    historyLimit: number
  ): ChatHistoryTurn[] {
    const db = dbStore.load();
    const existing = db.aiSessions.find((s) => s.id === sessionId);
    const canUseServerSession =
      Boolean(existing) && (!existing?.ownerId || !ownerId || existing.ownerId === ownerId);

    const serverTurns: ChatHistoryTurn[] =
      canUseServerSession && existing
        ? existing.messages.map((m) => ({ role: m.role, text: m.text }))
        : [];

    const clientTurns: ChatHistoryTurn[] = Array.isArray(clientHistory)
      ? clientHistory
          .filter(
            (turn): turn is ChatHistoryTurn =>
              Boolean(turn) &&
              (turn.role === 'user' || turn.role === 'assistant') &&
              typeof turn.text === 'string' &&
              turn.text.trim().length > 0
          )
          .map((turn) => ({ role: turn.role, text: turn.text.trim() }))
      : [];

    // Prefer the authoritative server-side session history when populated,
    // falling back to client history if the session was created offline or predates server sync.
    const merged = serverTurns.length >= clientTurns.length ? [...serverTurns] : [...clientTurns];
    const trimmedCurrent = currentMessage.trim();

    if (isRetry && merged.length > 0) {
      if (merged[merged.length - 1].role === 'assistant') {
        merged.pop();
      }
      if (
        merged.length > 0 &&
        merged[merged.length - 1].role === 'user' &&
        merged[merged.length - 1].text.trim() === trimmedCurrent
      ) {
        merged.pop();
      }
    }

    return merged.slice(-historyLimit);
  }

  function commitAiSessionTurn(params: {
    sessionId: string;
    ownerId?: string;
    userMessage: string;
    assistantReply: string;
    mode: AiMode;
    isRetry?: boolean;
  }): DbAiSession {
    const now = new Date().toISOString();
    const cleanUserText = params.userMessage.trim().slice(0, 6000);
    const cleanAssistantText = params.assistantReply.trim().slice(0, 20000);

    return dbStore.mutate((draft) => {
      if (!Array.isArray(draft.aiSessions)) {
        draft.aiSessions = [];
      }

      let session = draft.aiSessions.find((s) => s.id === params.sessionId);
      if (session && session.ownerId && params.ownerId && session.ownerId !== params.ownerId) {
        // Avoid overwriting another user's session if an ID collided
        session = undefined;
      }

      if (!session) {
        session = {
          id: params.sessionId,
          ownerId: params.ownerId,
          title: cleanUserText.slice(0, 48) || 'Chat Session',
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        draft.aiSessions.unshift(session);
      } else {
        if (!session.ownerId && params.ownerId) {
          session.ownerId = params.ownerId;
        }
        if (session.messages.length === 0) {
          session.title = cleanUserText.slice(0, 48) || session.title;
        }
      }

      if (params.isRetry && session.messages.length > 0) {
        if (session.messages[session.messages.length - 1].role === 'assistant') {
          session.messages.pop();
        }
        if (
          session.messages.length > 0 &&
          session.messages[session.messages.length - 1].role === 'user' &&
          session.messages[session.messages.length - 1].text.trim() === cleanUserText
        ) {
          session.messages.pop();
        }
      }

      session.messages.push(
        {
          id: `srv-u-${crypto.randomUUID().slice(0, 8)}`,
          role: 'user',
          text: cleanUserText,
          mode: params.mode,
          timestamp: now,
        },
        {
          id: `srv-a-${crypto.randomUUID().slice(0, 8)}`,
          role: 'assistant',
          text: cleanAssistantText,
          mode: params.mode,
          timestamp: now,
        }
      );

      if (session.messages.length > 40) {
        session.messages = session.messages.slice(-40);
      }
      session.updatedAt = now;

      // Keep server store compact (most recent 100 sessions)
      draft.aiSessions.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      if (draft.aiSessions.length > 100) {
        draft.aiSessions = draft.aiSessions.slice(0, 100);
      }

      return session;
    });
  }

  app.get('/api/ai/sessions', async (req: Request, res: Response) => {
    const authResolved = await resolveBearerUser(req).catch(() => null);
    const querySessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';
    const db = dbStore.load();

    if (authResolved?.user) {
      const owned = db.aiSessions
        .filter((s) => s.ownerId === authResolved.user.id)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
        .slice(0, 25);
      res.json({ sessions: owned });
      return;
    }

    if (querySessionId) {
      const match = db.aiSessions.find((s) => s.id === querySessionId && !s.ownerId);
      res.json({ sessions: match ? [match] : [] });
      return;
    }

    res.json({ sessions: [] });
  });

  app.get('/api/ai/sessions/:sessionId', async (req: Request, res: Response) => {
    const authResolved = await resolveBearerUser(req).catch(() => null);
    const sessionId = sanitizeAiSessionId(req.params.sessionId);
    const db = dbStore.load();
    const session = db.aiSessions.find((s) => s.id === sessionId);
    if (!session) {
      res.status(404).json({ error: 'Chat session not found.' });
      return;
    }
    if (session.ownerId && session.ownerId !== authResolved?.user?.id) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    res.json({ session });
  });

  app.post('/api/ai/sessions/:sessionId/clear', async (req: Request, res: Response) => {
    const authResolved = await resolveBearerUser(req).catch(() => null);
    const sessionId = sanitizeAiSessionId(req.params.sessionId);
    const result = dbStore.mutate((draft) => {
      const target = draft.aiSessions.find((s) => s.id === sessionId);
      if (!target) return 'not_found';
      if (target.ownerId && target.ownerId !== authResolved?.user?.id) return 'forbidden';
      target.messages = [];
      target.updatedAt = new Date().toISOString();
      return 'ok';
    });
    if (result === 'forbidden') {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    res.json({ ok: true, sessionId });
  });

  app.delete('/api/ai/sessions/:sessionId', async (req: Request, res: Response) => {
    const authResolved = await resolveBearerUser(req).catch(() => null);
    const sessionId = sanitizeAiSessionId(req.params.sessionId);
    const result = dbStore.mutate((draft) => {
      const idx = draft.aiSessions.findIndex((s) => s.id === sessionId);
      if (idx === -1) return 'not_found';
      const target = draft.aiSessions[idx];
      if (target.ownerId && target.ownerId !== authResolved?.user?.id) return 'forbidden';
      draft.aiSessions.splice(idx, 1);
      return 'ok';
    });
    if (result === 'forbidden') {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    res.json({ ok: true, sessionId });
  });

  function buildGeminiContents(
    history: ChatHistoryTurn[] | undefined,
    currentMessage: string,
    historyLimit: number
  ): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
    const trimmedCurrent = currentMessage.trim();
    const rawTurns = Array.isArray(history)
      ? history
          .filter(
            (turn): turn is ChatHistoryTurn =>
              Boolean(turn) &&
              (turn.role === 'user' || turn.role === 'assistant') &&
              typeof turn.text === 'string' &&
              turn.text.trim().length > 0
          )
          .slice(-historyLimit)
      : [];

    // Deduplicate trailing user turn if client already included current message in history
    if (
      rawTurns.length > 0 &&
      rawTurns[rawTurns.length - 1].role === 'user' &&
      rawTurns[rawTurns.length - 1].text.trim() === trimmedCurrent
    ) {
      rawTurns.pop();
    }

    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const turn of rawTurns) {
      const geminiRole: 'user' | 'model' = turn.role === 'user' ? 'user' : 'model';
      // Gemini requires conversation to start with a user turn
      if (contents.length === 0 && geminiRole !== 'user') continue;
      const cleanText = turn.text.trim().slice(0, 4000);
      const prev = contents[contents.length - 1];
      if (prev && prev.role === geminiRole) {
        prev.parts.push({ text: cleanText });
      } else {
        contents.push({ role: geminiRole, parts: [{ text: cleanText }] });
      }
    }

    const last = contents[contents.length - 1];
    if (last && last.role === 'user') {
      last.parts.push({ text: trimmedCurrent });
    } else {
      contents.push({ role: 'user', parts: [{ text: trimmedCurrent }] });
    }

    return contents;
  }

  function buildModelConfig(
    modelName: SupportedAiModel,
    systemInstruction: string,
    concise: boolean | undefined,
    mode: AiMode,
    aiConfig: DbAiConfig,
    includeThinking: boolean
  ): {
    systemInstruction: string;
    thinkingConfig?: { thinkingLevel: ThinkingLevel };
  } {
    if (!includeThinking || modelName === 'gemini-3.1-flash-lite') {
      return { systemInstruction };
    }
    const thinkingLevel =
      concise || aiConfig.thinkingLevel === 'LOW'
        ? ThinkingLevel.LOW
        : mode === 'math' || mode === 'power'
          ? ThinkingLevel.MEDIUM
          : ThinkingLevel.LOW;
    return {
      systemInstruction,
      thinkingConfig: { thinkingLevel },
    };
  }

  const modelQuotaCooldownUntil = new Map<SupportedAiModel, number>();

  function isQuotaExhaustedError(raw: string): boolean {
    return (
      raw.includes('429') ||
      raw.includes('RESOURCE_EXHAUSTED') ||
      raw.includes('Quota exceeded') ||
      raw.includes('GenerateRequestsPerDay')
    );
  }

  function recordModelQuotaCooldown(model: SupportedAiModel, rawError: string): void {
    const retryMatch = rawError.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
    const parsedSec = retryMatch ? Number(retryMatch[1]) : 900;
    // Clamp cooldown between 60 seconds and 6 hours so transient burst vs daily limit is handled cleanly
    const cooldownMs = Math.min(6 * 60 * 60 * 1000, Math.max(60 * 1000, parsedSec * 1000));
    const until = Date.now() + cooldownMs;
    const prev = modelQuotaCooldownUntil.get(model) ?? 0;
    if (until > prev + 10_000) {
      modelQuotaCooldownUntil.set(model, until);
      console.warn(
        `[AI Quota] Model ${model} hit 429 quota limit; routing around it for ~${Math.round(cooldownMs / 60000)}m.`
      );
    }
  }

  function isModelInQuotaCooldown(model: SupportedAiModel): boolean {
    const until = modelQuotaCooldownUntil.get(model);
    if (!until) return false;
    if (Date.now() >= until) {
      modelQuotaCooldownUntil.delete(model);
      return false;
    }
    return true;
  }

  function formatGeminiErrorForClient(err: unknown, language: LanguageCode, modelName: string): {
    status: number;
    code: string;
    message: string;
  } {
    const raw = err instanceof Error ? err.message : String(err);
    if (
      raw.includes('403') ||
      raw.includes('PERMISSION_DENIED') ||
      raw.includes('API_KEY_INVALID') ||
      raw.includes('API key not valid')
    ) {
      return {
        status: 403,
        code: 'API_KEY_INVALID',
        message:
          language === 'en'
            ? 'Gemini API Key is invalid or lacks permission. Please verify GEMINI_API_KEY in Settings > Secrets.'
            : 'GEMINI_API_KEY সঠিক নয় বা অনুমতি পাওয়া যায়নি। Settings > Secrets প্যানেল থেকে কী যাচাই করুন।',
      };
    }
    if (isQuotaExhaustedError(raw)) {
      const isDaily = raw.includes('PerDay') || raw.includes('Free Tier') || raw.includes('QUOTA_EXHAUSTED');
      return {
        status: 429,
        code: isDaily ? 'QUOTA_EXHAUSTED' : 'RATE_LIMIT',
        message:
          language === 'en'
            ? isDaily
              ? 'Free Tier daily AI quota has been reached for this API key. Select a billing-enabled API key in Settings > Secrets or retry after quota resets.'
              : 'AI rate limit reached. Please wait a few seconds and retry.'
            : isDaily
              ? 'এই API Key-এর দৈনিক Free Tier কোটা শেষ হয়ে গেছে। Settings > Secrets প্যানেলে বিলিং-সক্রিয় API Key যুক্ত করুন অথবা কোটা রিসেট হলে আবার চেষ্টা করুন।'
              : 'অনুরোধের সীমা অতিক্রম করেছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',
      };
    }
    if (raw.includes('404') || raw.includes('NOT_FOUND')) {
      return {
        status: 404,
        code: 'MODEL_NOT_FOUND',
        message:
          language === 'en'
            ? `Selected Gemini model (${modelName}) is unavailable for this API key.`
            : `নির্বাচিত মডেল (${modelName}) এই API Key-এর জন্য পাওয়া যায়নি। Admin প্যানেল থেকে মডেল পরিবর্তন করুন।`,
      };
    }
    if (
      raw.includes('503') ||
      raw.includes('UNAVAILABLE') ||
      raw.includes('high demand') ||
      raw.includes('overloaded') ||
      raw.includes('500') ||
      raw.includes('INTERNAL') ||
      raw.includes('DEADLINE_EXCEEDED')
    ) {
      return {
        status: 503,
        code: 'MODEL_BUSY',
        message:
          language === 'en'
            ? 'AI servers are temporarily busy due to high demand. Please retry in a few seconds.'
            : 'অতিরিক্ত চাপের কারণে এআই সার্ভার সাময়িকভাবে ব্যস্ত রয়েছে। কয়েক সেকেন্ড পর আবার চেষ্টা করুন।',
      };
    }
    return {
      status: 502,
      code: 'UPSTREAM_ERROR',
      message:
        language === 'en'
          ? 'Could not reach AI Tutor right now. Please try again.'
          : 'এআই টিউটরের সাথে সংযোগ করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।',
    };
  }

  function isRetryableAiError(msg: string): boolean {
    const lower = msg.toLowerCase();
    return (
      lower.includes('404') ||
      lower.includes('not_found') ||
      lower.includes('429') ||
      lower.includes('resource_exhausted') ||
      lower.includes('500') ||
      lower.includes('502') ||
      lower.includes('503') ||
      lower.includes('504') ||
      lower.includes('internal') ||
      lower.includes('unavailable') ||
      lower.includes('deadline_exceeded') ||
      lower.includes('high demand') ||
      lower.includes('overloaded') ||
      lower.includes('fetch failed') ||
      lower.includes('econnreset') ||
      lower.includes('etimedout') ||
      lower.includes('socket')
    );
  }

  function buildRetryPlan(
    primaryModel: SupportedAiModel,
    fallbackModel: SupportedAiModel
  ): Array<{ model: SupportedAiModel; delayMs: number; includeThinking: boolean }> {
    const primaryCooling = isModelInQuotaCooldown(primaryModel);
    const fallbackCooling = isModelInQuotaCooldown(fallbackModel);

    if (primaryCooling && fallbackCooling) {
      return [];
    }
    if (primaryCooling && !fallbackCooling) {
      return [
        { model: fallbackModel, delayMs: 0, includeThinking: false },
        { model: fallbackModel, delayMs: 800, includeThinking: false },
        { model: fallbackModel, delayMs: 1650, includeThinking: false },
      ];
    }
    if (!primaryCooling && fallbackCooling) {
      return [
        { model: primaryModel, delayMs: 0, includeThinking: true },
        { model: primaryModel, delayMs: 850, includeThinking: false },
      ];
    }

    return [
      { model: primaryModel, delayMs: 0, includeThinking: true },
      { model: fallbackModel, delayMs: 550, includeThinking: false },
      { model: primaryModel, delayMs: 1250, includeThinking: false },
      { model: fallbackModel, delayMs: 2100, includeThinking: false },
    ];
  }

  app.post('/api/ai/stream', async (req: Request<Record<string, string>, unknown, AiAskBody>, res: Response) => {
    const startedAt = Date.now();
    const {
      sessionId: rawSessionId,
      isRetry = false,
      message,
      mode = 'explain',
      language = 'bn',
      departmentName,
      semesterLabel,
      concise,
      history = [],
    } = req.body ?? {};

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({
        error: language === 'en' ? 'Please write a question.' : 'অনুগ্রহ করে একটি প্রশ্ন লিখুন।',
      });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          language === 'en'
            ? 'GEMINI_API_KEY is not configured on the server. Set it in Settings > Secrets.'
            : 'সার্ভারে GEMINI_API_KEY কনফিগার করা নেই। AI Studio Secrets প্যানেল অথবা .env ফাইলে GEMINI_API_KEY সেট করুন।',
        code: 'API_KEY_MISSING',
      });
      return;
    }

    const authResolved = await resolveBearerUser(req).catch(() => null);
    const ownerId = authResolved?.user?.id;
    const sessionId = sanitizeAiSessionId(rawSessionId);

    const db = dbStore.load();
    const aiConfig = db.aiConfig;
    const historyLimit = Math.min(20, Math.max(2, aiConfig.maxHistoryTurns || 8));
    const resolvedHistory = resolveSessionTurnsForContext(
      sessionId,
      ownerId,
      history,
      message,
      isRetry,
      historyLimit
    );
    const contents = buildGeminiContents(resolvedHistory, message, historyLimit);

    const primaryModel: SupportedAiModel =
      aiConfig.activeModel === 'gemini-3.1-flash-lite'
        ? 'gemini-3.1-flash-lite'
        : 'gemini-4-hydrogen';
    const fallbackModel: SupportedAiModel =
      primaryModel === 'gemini-4-hydrogen' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let clientAborted = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientAborted = true;
      }
    });

    // Periodic SSE keep-alive comment while awaiting first token
    const keepAliveTimer = setInterval(() => {
      if (!clientAborted && !res.writableEnded) {
        res.write(': keepalive\n\n');
      }
    }, 8000);

    const systemInstruction = buildSystemInstruction(
      mode,
      language,
      departmentName,
      semesterLabel,
      aiConfig,
      concise
    );

    const openStreamAttempt = async (
      candidateModel: SupportedAiModel,
      includeThinking: boolean
    ) => {
      const config = buildModelConfig(
        candidateModel,
        systemInstruction,
        concise,
        mode,
        aiConfig,
        includeThinking
      );
      try {
        return await ai.models.generateContentStream({
          model: candidateModel,
          contents,
          config,
        });
      } catch (innerErr: unknown) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        if (includeThinking && (msg.includes('thinking') || msg.includes('INVALID_ARGUMENT'))) {
          return await ai.models.generateContentStream({
            model: candidateModel,
            contents,
            config: { systemInstruction },
          });
        }
        throw innerErr;
      }
    };

    let hasEmittedChunk = false;
    let accumulatedReply = '';
    let streamModel: SupportedAiModel = primaryModel;
    const plan = buildRetryPlan(primaryModel, fallbackModel);

    try {
      let lastError: unknown = null;
      let succeeded = false;

      for (let i = 0; i < plan.length; i += 1) {
        if (clientAborted) break;
        const step = plan[i];
        if (i > 0) {
          if (!res.writableEnded) {
            res.write(
              `data: ${JSON.stringify({
                type: 'status',
                status: 'retrying',
                attempt: i + 1,
                maxAttempts: plan.length,
                model: step.model,
                sessionId,
              })}\n\n`
            );
          }
          const jitter = Math.floor(Math.random() * 250);
          await new Promise((r) => setTimeout(r, step.delayMs + jitter));
          if (clientAborted) break;
        }

        try {
          const stream = await openStreamAttempt(step.model, step.includeThinking);
          for await (const chunk of stream) {
            if (clientAborted) break;
            const delta = chunk.text;
            if (delta) {
              hasEmittedChunk = true;
              accumulatedReply += delta;
              res.write(`data: ${JSON.stringify({ type: 'chunk', text: delta })}\n\n`);
            }
          }

          if (clientAborted || hasEmittedChunk) {
            streamModel = step.model;
            succeeded = true;
            break;
          }

          throw new Error('UNAVAILABLE: Empty stream response from model');
        } catch (attemptErr: unknown) {
          lastError = attemptErr;
          const errMsg = attemptErr instanceof Error ? attemptErr.message : String(attemptErr);
          if (isQuotaExhaustedError(errMsg)) {
            recordModelQuotaCooldown(step.model, errMsg);
          } else {
            console.warn(`[AI Stream attempt ${i + 1}/${plan.length} ${step.model}] ${errMsg.slice(0, 180)}`);
          }

          if (hasEmittedChunk || clientAborted || !isRetryableAiError(errMsg)) {
            throw attemptErr;
          }
        }
      }

      if (clientAborted) {
        if (accumulatedReply.trim()) {
          commitAiSessionTurn({
            sessionId,
            ownerId,
            userMessage: message,
            assistantReply: accumulatedReply,
            mode,
            isRetry,
          });
        }
        if (!res.writableEnded) res.end();
        return;
      }

      if (plan.length === 0) {
        throw new Error('429 RESOURCE_EXHAUSTED QUOTA_EXHAUSTED: All configured models are in quota cooldown.');
      }

      if (!succeeded || !accumulatedReply.trim()) {
        throw lastError ?? new Error('UNAVAILABLE: AI Tutor failed to generate a response.');
      }

      const savedSession = commitAiSessionTurn({
        sessionId,
        ownerId,
        userMessage: message,
        assistantReply: accumulatedReply,
        mode,
        isRetry,
      });

      recordAiUsage(mode, Date.now() - startedAt, false);
      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          sessionId: savedSession.id,
          turnCount: savedSession.messages.length,
          mode,
          model: streamModel,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const mapped = formatGeminiErrorForClient(err, language, streamModel);
      if (mapped.code === 'MODEL_BUSY' || mapped.code === 'RATE_LIMIT' || mapped.code === 'QUOTA_EXHAUSTED') {
        console.warn(`[AI Stream ${mapped.code}] ${streamModel}`);
      } else {
        console.error('AI Stream Error:', errorMessage.slice(0, 300));
      }
      recordAiUsage(mode, Date.now() - startedAt, true);

      if (!clientAborted && !res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', error: mapped.message, code: mapped.code, sessionId })}\n\n`
        );
      }
    } finally {
      clearInterval(keepAliveTimer);
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  app.post('/api/ai/ask', async (req: Request<Record<string, string>, unknown, AiAskBody>, res: Response) => {
    const startedAt = Date.now();
    const {
      sessionId: rawSessionId,
      isRetry = false,
      message,
      mode = 'explain',
      language = 'bn',
      departmentName,
      semesterLabel,
      concise,
      history = [],
    } = req.body ?? {};

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({
        error: language === 'en' ? 'Please write a question.' : 'অনুগ্রহ করে একটি প্রশ্ন লিখুন।',
      });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          language === 'en'
            ? 'GEMINI_API_KEY is not configured on the server. Set it in Settings > Secrets.'
            : 'সার্ভারে GEMINI_API_KEY কনফিগার করা নেই। AI Studio Secrets প্যানেল অথবা .env ফাইলে GEMINI_API_KEY সেট করুন।',
        code: 'API_KEY_MISSING',
      });
      return;
    }

    const authResolved = await resolveBearerUser(req).catch(() => null);
    const ownerId = authResolved?.user?.id;
    const sessionId = sanitizeAiSessionId(rawSessionId);

    const db = dbStore.load();
    const aiConfig = db.aiConfig;
    const historyLimit = Math.min(20, Math.max(2, aiConfig.maxHistoryTurns || 8));
    const resolvedHistory = resolveSessionTurnsForContext(
      sessionId,
      ownerId,
      history,
      message,
      isRetry,
      historyLimit
    );
    const contents = buildGeminiContents(resolvedHistory, message, historyLimit);

    const primaryModel: SupportedAiModel =
      aiConfig.activeModel === 'gemini-3.1-flash-lite'
        ? 'gemini-3.1-flash-lite'
        : 'gemini-4-hydrogen';
    const fallbackModel: SupportedAiModel =
      primaryModel === 'gemini-4-hydrogen' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

    const systemInstruction = buildSystemInstruction(
      mode,
      language,
      departmentName,
      semesterLabel,
      aiConfig,
      concise
    );

    const askWithModel = async (
      candidateModel: SupportedAiModel,
      includeThinking: boolean
    ) => {
      const config = buildModelConfig(
        candidateModel,
        systemInstruction,
        concise,
        mode,
        aiConfig,
        includeThinking
      );
      try {
        return await ai.models.generateContent({
          model: candidateModel,
          contents,
          config,
        });
      } catch (innerErr: unknown) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        if (includeThinking && (msg.includes('thinking') || msg.includes('INVALID_ARGUMENT'))) {
          return await ai.models.generateContent({
            model: candidateModel,
            contents,
            config: { systemInstruction },
          });
        }
        throw innerErr;
      }
    };

    const plan = buildRetryPlan(primaryModel, fallbackModel);
    let usedModel: SupportedAiModel = primaryModel;

    try {
      let answerText = '';
      let lastError: unknown = null;

      for (let i = 0; i < plan.length; i += 1) {
        const step = plan[i];
        if (i > 0) {
          const jitter = Math.floor(Math.random() * 250);
          await new Promise((r) => setTimeout(r, step.delayMs + jitter));
        }

        try {
          const response = await askWithModel(step.model, step.includeThinking);
          const candidateText = response.text?.trim() || '';
          if (candidateText) {
            answerText = candidateText;
            usedModel = step.model;
            break;
          }
          throw new Error('UNAVAILABLE: Empty response from model');
        } catch (attemptErr: unknown) {
          lastError = attemptErr;
          const errMsg = attemptErr instanceof Error ? attemptErr.message : String(attemptErr);
          if (isQuotaExhaustedError(errMsg)) {
            recordModelQuotaCooldown(step.model, errMsg);
          } else {
            console.warn(`[AI Ask attempt ${i + 1}/${plan.length} ${step.model}] ${errMsg.slice(0, 180)}`);
          }

          if (!isRetryableAiError(errMsg)) {
            throw attemptErr;
          }
        }
      }

      if (plan.length === 0) {
        throw new Error('429 RESOURCE_EXHAUSTED QUOTA_EXHAUSTED: All configured models are in quota cooldown.');
      }

      if (!answerText) {
        throw lastError ?? new Error('UNAVAILABLE: No response received from AI.');
      }

      const savedSession = commitAiSessionTurn({
        sessionId,
        ownerId,
        userMessage: message,
        assistantReply: answerText,
        mode,
        isRetry,
      });

      recordAiUsage(mode, Date.now() - startedAt, false);
      res.json({
        reply: answerText,
        sessionId: savedSession.id,
        turnCount: savedSession.messages.length,
        mode,
        model: usedModel,
        language,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const mapped = formatGeminiErrorForClient(err, language, usedModel);
      if (mapped.code === 'MODEL_BUSY' || mapped.code === 'RATE_LIMIT' || mapped.code === 'QUOTA_EXHAUSTED') {
        console.warn(`[AI Ask ${mapped.code}] ${usedModel}`);
      } else {
        console.error('AI Ask Error:', errorMessage.slice(0, 300));
      }
      recordAiUsage(mode, Date.now() - startedAt, true);
      res.status(mapped.status).json({ error: mapped.message, code: mapped.code, sessionId });
    }
  });

  const httpServer = http.createServer(app);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Polytechnic Hub server running on http://localhost:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start Polytechnic Hub server:', err);
  process.exit(1);
});
