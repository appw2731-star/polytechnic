import type { AuthUser, SemesterNumber } from '../types/study';
import { apiClient, getStoredToken } from './apiClient';
import { syncUserProfileToFirestore } from './firestoreService';

export interface HeroProfileUpdatePayload {
  fullName?: string;
  avatarUrl?: string;
  collegeName?: string;
  department?: string;
  semester?: SemesterNumber;
}

export interface ProfileUpdateResult {
  user?: AuthUser;
  syncedToBackend: boolean;
  error?: string;
}

export class ProfileUpdateService {
  async updateHeroProfile(
    payload: HeroProfileUpdatePayload,
    isOnline: boolean
  ): Promise<ProfileUpdateResult> {
    const cleanPayload: {
      fullName?: string;
      avatarUrl?: string;
      collegeName?: string;
      instituteName?: string;
      department?: string;
      semester?: number;
    } = {};

    if (typeof payload.fullName === 'string') {
      const trimmed = payload.fullName.trim();
      if (trimmed.length < 2) {
        return {
          syncedToBackend: false,
          error: 'নাম কমপক্ষে ২ অক্ষরের হতে হবে।',
        };
      }
      cleanPayload.fullName = trimmed.slice(0, 100);
    }

    if (typeof payload.collegeName === 'string') {
      const trimmedCollege = payload.collegeName.trim().slice(0, 160);
      if (trimmedCollege.length < 2) {
        return {
          syncedToBackend: false,
          error: 'পলিটেকনিক ইনস্টিটিউটের সঠিক নাম নির্বাচন করুন বা লিখুন।',
        };
      }
      cleanPayload.collegeName = trimmedCollege;
      cleanPayload.instituteName = trimmedCollege;
    }

    if (typeof payload.department === 'string' && payload.department.trim()) {
      cleanPayload.department = payload.department.trim().slice(0, 60);
    }

    if (payload.semester !== undefined) {
      const sem = Math.min(8, Math.max(1, Math.trunc(Number(payload.semester) || 1)));
      cleanPayload.semester = sem;
    }

    if (typeof payload.avatarUrl === 'string') {
      cleanPayload.avatarUrl = payload.avatarUrl.trim();
    }

    if (!isOnline || !getStoredToken()) {
      return { syncedToBackend: false };
    }

    try {
      const res = await apiClient.updateProfile(cleanPayload);
      // Mirror updated profile fields cleanly into Cloud Firestore if user is verified
      void syncUserProfileToFirestore(res.user).catch((err) => {
        console.warn('Firestore profile mirror notice:', err instanceof Error ? err.message : err);
      });
      return {
        user: res.user,
        syncedToBackend: true,
      };
    } catch (err) {
      return {
        syncedToBackend: false,
        error: err instanceof Error ? err.message : 'সার্ভারে প্রোফাইল আপডেট সংরক্ষণ করা যায়নি।',
      };
    }
  }
}

export const profileUpdateService = new ProfileUpdateService();
