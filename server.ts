import 'dotenv/config';
import crypto from 'crypto';
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
  type DbCommunityPost,
  type DbFormulaItem,
  type DbMcq,
  type DbNotice,
  type DbSharedNote,
  type DbUser,
  type PublicUser,
  type UserRole,
} from './server/database.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const SERVER_STARTED_AT = Date.now();

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();

type AiMode = 'general' | 'explain' | 'math' | 'power' | 'recommend';
type LanguageCode = 'bn' | 'en';

interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

interface AiAskBody {
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

    const adminEnvEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (adminEnvEmail && authUser.email?.toLowerCase() === adminEnvEmail) {
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
    const localUser = db.users.find((u) => u.id === localPayload.sub);
    if (localUser) {
      return { user: toPublicUser(localUser) };
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
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

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
      timestamp: new Date().toISOString(),
    });
  });

  // =========================================================================
  // PUBLIC BOOTSTRAP DATA
  // =========================================================================
  app.get('/api/bootstrap', (_req: Request, res: Response) => {
    const db = dbStore.load();
    let hasAdmin = db.users.some((u) => u.role === 'admin');
    if (!hasAdmin && process.env.ADMIN_EMAIL) {
      hasAdmin = true;
    }

    res.json({
      notices: [...db.notices].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt)
      ),
      sharedNotes: db.sharedNotes,
      mcqs: db.mcqs,
      customFormulas: db.customFormulas,
      deletedFormulaIds: db.deletedFormulaIds,
      appConfig: db.appConfig,
      hasAdmin,
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
    const token = signAuthToken(user);
    res.json({
      token,
      user: toPublicUser(user),
    });
  });

  app.post('/api/auth/bootstrap-admin', (req: Request, res: Response) => {
    const { fullName = 'Polytechnic Hub Admin', email, password, setupSecret } = req.body ?? {};
    const db = dbStore.load();
    const adminExists = db.users.some((u) => u.role === 'admin');
    const configuredSecret = process.env.ADMIN_SETUP_SECRET?.trim();

    if (adminExists) {
      if (!configuredSecret || setupSecret !== configuredSecret) {
        res.status(403).json({
          error:
            'Admin account already exists. Ask an existing Admin to promote your role or supply ADMIN_SETUP_SECRET.',
        });
        return;
      }
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

  app.patch('/api/auth/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
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
    } = req.body ?? {};

    const updated = dbStore.mutate((draft) => {
      const target = draft.users.find((u) => u.id === auth.id);
      if (!target) return null;
      if (typeof fullName === 'string' && fullName.trim().length >= 2) {
        target.fullName = fullName.trim();
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
        target.avatarUrl = avatarUrl.trim();
      }
      target.updatedAt = new Date().toISOString();
      return toPublicUser(target);
    });

    res.json({ user: updated ?? auth });
  });

  // =========================================================================
  // COMMUNITY Q&A FORUM
  // =========================================================================
  app.get('/api/community/posts', async (req: Request, res: Response) => {
    const db = dbStore.load();
    const resolved = await resolveBearerUser(req);
    const includeHidden =
      resolved?.user.role === 'admin' && req.query.includeHidden === '1';

    const posts = db.communityPosts
      .filter((p) => (includeHidden ? true : !p.isHidden))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json({ posts });
  });

  app.post('/api/community/posts', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const auth = req.authUser!;
    const { title, body, department = auth.department, semester = auth.semester, subjectTag = '' } =
      req.body ?? {};
    if (typeof title !== 'string' || title.trim().length < 4) {
      res.status(400).json({ error: 'শিরোনাম কমপক্ষে ৪ অক্ষরের হতে হবে।' });
      return;
    }
    if (typeof body !== 'string' || body.trim().length < 8) {
      res.status(400).json({ error: 'প্রশ্ন বা বিবরণ কমপক্ষে ৮ অক্ষরের লিখুন।' });
      return;
    }

    const post: DbCommunityPost = {
      id: `post-${crypto.randomUUID()}`,
      authorId: auth.id,
      authorName: auth.fullName,
      authorDepartment: auth.department,
      authorRole: auth.role,
      department: String(department),
      semester: Math.min(8, Math.max(1, Number(semester) || 4)),
      subjectTag: String(subjectTag || '').trim(),
      title: title.trim(),
      body: body.trim(),
      reportsCount: 0,
      isHidden: false,
      replies: [],
      createdAt: new Date().toISOString(),
    };

    dbStore.mutate((draft) => {
      draft.communityPosts.unshift(post);
    });
    res.status(201).json({ post });
  });

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
          body: body.trim(),
          createdAt: new Date().toISOString(),
        });
        return post;
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
      downloadPermitted = false,
    } = req.body ?? {};
    if (!title) {
      res.status(400).json({ error: 'Title is required.' });
      return;
    }
    const sharedNote: DbSharedNote = {
      id: `snote-${crypto.randomUUID()}`,
      title: String(title).trim(),
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

  app.delete('/api/admin/shared-notes/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
    dbStore.mutate((draft) => {
      draft.sharedNotes = draft.sharedNotes.filter((s) => s.id !== req.params.id);
    });
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

      if (SUPABASE_URL && SUPABASE_ANON_KEY && req.supabaseAccessToken) {
        try {
          const patchRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(req.params.id)}`,
            {
              method: 'PATCH',
              headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${req.supabaseAccessToken}`,
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
  // FAST STREAMING AI TUTOR (SSE) + NON-STREAMING FALLBACK
  // =========================================================================
  app.post('/api/ai/stream', async (req: Request<unknown, unknown, AiAskBody>, res: Response) => {
    const startedAt = Date.now();
    const {
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

    const db = dbStore.load();
    const aiConfig = db.aiConfig;
    const historyLimit = Math.min(20, Math.max(2, aiConfig.maxHistoryTurns || 8));
    const recentHistory = Array.isArray(history) ? history.slice(-historyLimit) : [];
    const formattedHistory = recentHistory
      .map((turn) => `${turn.role === 'user' ? 'Student' : 'Polytechnic Hub AI'}: ${turn.text}`)
      .join('\n\n');

    const promptText = formattedHistory
      ? `Previous Conversation:\n${formattedHistory}\n\nCurrent Question:\n${message.trim()}`
      : message.trim();

    const modelName =
      aiConfig.activeModel === 'gemini-4-hydrogen'
        ? 'gemini-4-hydrogen'
        : 'gemini-3.1-flash-lite';

    const thinkingLevel =
      modelName === 'gemini-4-hydrogen'
        ? concise || aiConfig.thinkingLevel === 'LOW'
          ? ThinkingLevel.LOW
          : mode === 'math' || mode === 'power'
            ? ThinkingLevel.MEDIUM
            : ThinkingLevel.LOW
        : ThinkingLevel.MINIMAL;

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

    try {
      const stream = await ai.models.generateContentStream({
        model: modelName,
        contents: promptText,
        config: {
          systemInstruction: buildSystemInstruction(
            mode,
            language,
            departmentName,
            semesterLabel,
            aiConfig,
            concise
          ),
          thinkingConfig: { thinkingLevel },
        },
      });

      if (clientAborted) {
        if (!res.writableEnded) res.end();
        return;
      }

      for await (const chunk of stream) {
        if (clientAborted) break;
        const delta = chunk.text;
        if (delta) {
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: delta })}\n\n`);
        }
      }

      if (!clientAborted) {
        recordAiUsage(mode, Date.now() - startedAt, false);
        res.write(
          `data: ${JSON.stringify({
            type: 'done',
            mode,
            model: modelName,
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('AI Stream Error:', errorMessage);
      recordAiUsage(mode, Date.now() - startedAt, true);

      if (!clientAborted && !res.writableEnded) {
        const friendly =
          errorMessage.includes('403') ||
          errorMessage.includes('PERMISSION_DENIED') ||
          errorMessage.includes('API_KEY_INVALID') ||
          errorMessage.includes('400')
            ? 'API Key সঠিক নয় বা অনুমতি পাওয়া যায়নি। Settings > Secrets প্যানেল থেকে কী যাচাই করুন।'
            : errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')
              ? 'অনুরোধের সীমা অতিক্রম করেছে। কিছুক্ষণ পর আবার চেষ্টা করুন।'
              : errorMessage.includes('404') || errorMessage.includes('NOT_FOUND')
                ? `নির্বাচিত মডেল (${modelName}) পাওয়া যায়নি। Admin প্যানেল থেকে মডেল পরিবর্তন করুন।`
                : language === 'en'
                  ? 'Connection issue while streaming response. Please retry.'
                  : 'এআই টিউটরের সাথে সংযোগে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।';

        res.write(`data: ${JSON.stringify({ type: 'error', error: friendly })}\n\n`);
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  app.post('/api/ai/ask', async (req: Request<unknown, unknown, AiAskBody>, res: Response) => {
    const startedAt = Date.now();
    try {
      const {
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

      const db = dbStore.load();
      const aiConfig = db.aiConfig;
      const historyLimit = Math.min(20, Math.max(2, aiConfig.maxHistoryTurns || 8));
      const recentHistory = Array.isArray(history) ? history.slice(-historyLimit) : [];
      const formattedHistory = recentHistory
        .map((turn) => `${turn.role === 'user' ? 'Student' : 'Polytechnic Hub AI'}: ${turn.text}`)
        .join('\n\n');

      const promptText = formattedHistory
        ? `Previous Conversation:\n${formattedHistory}\n\nCurrent Question:\n${message.trim()}`
        : message.trim();

      const modelName =
        aiConfig.activeModel === 'gemini-4-hydrogen'
          ? 'gemini-4-hydrogen'
          : 'gemini-3.1-flash-lite';

      const thinkingLevel =
        modelName === 'gemini-4-hydrogen'
          ? concise || aiConfig.thinkingLevel === 'LOW'
            ? ThinkingLevel.LOW
            : ThinkingLevel.MEDIUM
          : ThinkingLevel.MINIMAL;

      const response = await ai.models.generateContent({
        model: modelName,
        contents: promptText,
        config: {
          systemInstruction: buildSystemInstruction(
            mode,
            language,
            departmentName,
            semesterLabel,
            aiConfig,
            concise
          ),
          thinkingConfig: { thinkingLevel },
        },
      });

      const answerText = response.text?.trim();
      if (!answerText) {
        recordAiUsage(mode, Date.now() - startedAt, true);
        res.status(502).json({
          error:
            language === 'en'
              ? 'No response received from AI. Please try again.'
              : 'এআই থেকে উত্তর পাওয়া যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।',
        });
        return;
      }

      recordAiUsage(mode, Date.now() - startedAt, false);
      res.json({
        reply: answerText,
        mode,
        language,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('AI Ask Error:', errorMessage);
      recordAiUsage('general', Date.now() - startedAt, true);

      if (
        errorMessage.includes('403') ||
        errorMessage.includes('PERMISSION_DENIED') ||
        errorMessage.includes('API_KEY_INVALID')
      ) {
        res.status(403).json({
          error: 'API Key সঠিক নয় বা অনুমতি পাওয়া যায়নি। Secrets প্যানেল থেকে কী যাচাই করুন।',
        });
        return;
      }

      if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'অনুরোধের সীমা অতিক্রম করেছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।',
        });
        return;
      }

      res.status(500).json({
        error: 'এআই টিউটরের সাথে সংযোগে সমস্যা হয়েছে। অনুগ্রহ করে পুনরায় চেষ্টা করুন।',
      });
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
