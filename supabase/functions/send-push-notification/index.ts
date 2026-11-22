// Supabase Edge Function: send-push-notification
// Verifies Admin authorization, validates payload, resolves target users & preferences,
// inserts notifications + user_notifications, dispatches FCM HTTP v1 pushes, and cleans invalid tokens.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  getFcmAccessToken,
  parseServiceAccount,
  sendSingleFcmMessage,
  type PushCategory,
} from '../_shared/fcm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_CATEGORIES: PushCategory[] = [
  'APP_UPDATE',
  'IMPORTANT',
  'EDUCATION',
  'EMERGENCY',
  'GENERAL',
];

function preferenceAllowsCategory(
  pref: Record<string, unknown> | undefined,
  category: PushCategory
): { allowInApp: boolean; allowPush: boolean; allowSound: boolean } {
  if (!pref) {
    return { allowInApp: true, allowPush: true, allowSound: true };
  }
  const pushEnabled = pref.push_enabled !== false;
  const soundEnabled = pref.sound_enabled !== false;
  let catAllowed = true;
  if (category === 'APP_UPDATE') catAllowed = pref.allow_app_update !== false;
  if (category === 'IMPORTANT') catAllowed = pref.allow_important !== false;
  if (category === 'EDUCATION') catAllowed = pref.allow_education !== false;
  if (category === 'EMERGENCY') catAllowed = pref.allow_emergency !== false;
  if (category === 'GENERAL') catAllowed = pref.allow_general !== false;

  return {
    allowInApp: true,
    allowPush: pushEnabled && catAllowed,
    allowSound: pushEnabled && catAllowed && soundEnabled,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const adminEmailEnv = (Deno.env.get('ADMIN_EMAIL') ?? '').trim().toLowerCase();

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Supabase Edge environment not configured.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. Verify Bearer token and Admin role
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Missing Bearer token.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid user token.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const caller = userData.user;
  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('role, email')
    .eq('id', caller.id)
    .maybeSingle();

  const isCallerAdmin =
    callerProfile?.role === 'admin' ||
    (adminEmailEnv && caller.email?.toLowerCase() === adminEmailEnv);

  if (!isCallerAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden: Administrator role required.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 2. Simple Rate Limit (max 25 admin notification sends in last 5 minutes)
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count: recentCount } = await adminClient
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', caller.id)
    .gte('created_at', fiveMinsAgo);

  if ((recentCount ?? 0) >= 25) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Wait a few minutes before sending more campaigns.' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 3. Validate Payload
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    category?: PushCategory;
    imageUrl?: string;
    targetView?: string;
    actionUrl?: string;
    audienceType?: 'all' | 'selected_users' | 'department_semester';
    targetUserIds?: string[];
    targetDepartment?: string;
    targetSemester?: number | null;
    soundMode?: 'custom' | 'default' | 'silent';
    scheduledFor?: string | null;
  };

  const cleanTitle = String(body.title || '').trim();
  const cleanBody = String(body.body || '').trim();
  const category = VALID_CATEGORIES.includes(body.category as PushCategory)
    ? (body.category as PushCategory)
    : null;

  if (cleanTitle.length < 2 || cleanTitle.length > 140) {
    return new Response(JSON.stringify({ error: 'Title must be between 2 and 140 characters.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (cleanBody.length < 2 || cleanBody.length > 1000) {
    return new Response(JSON.stringify({ error: 'Message body must be between 2 and 1000 characters.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!category) {
    return new Response(JSON.stringify({ error: 'Invalid notification category.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const audienceType = body.audienceType ?? 'all';
  const targetUserIds = Array.isArray(body.targetUserIds) ? body.targetUserIds : [];
  const targetDepartment = String(body.targetDepartment || '').trim();
  const targetSemester =
    body.targetSemester !== undefined && body.targetSemester !== null
      ? Number(body.targetSemester)
      : null;
  const imageUrl = String(body.imageUrl || '').trim();
  const targetView = String(body.targetView || 'notifications').trim() || 'notifications';
  const actionUrl = String(body.actionUrl || '').trim();
  const soundMode =
    body.soundMode === 'default' || body.soundMode === 'silent' ? body.soundMode : 'custom';

  // 4. Handle Scheduled Delivery
  if (body.scheduledFor) {
    const scheduledDate = new Date(body.scheduledFor);
    if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now() + 15000) {
      return new Response(JSON.stringify({ error: 'Scheduled time must be in the future.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: scheduledRow, error: schedErr } = await adminClient
      .from('scheduled_notifications')
      .insert({
        title: cleanTitle,
        body: cleanBody,
        category,
        image_url: imageUrl,
        target_view: targetView,
        action_url: actionUrl,
        audience_type: audienceType,
        target_user_ids: targetUserIds,
        target_department: targetDepartment,
        target_semester: targetSemester,
        sound_mode: soundMode,
        scheduled_for: scheduledDate.toISOString(),
        status: 'pending',
        created_by: caller.id,
      })
      .select()
      .single();

    if (schedErr) {
      return new Response(JSON.stringify({ error: schedErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ scheduled: true, scheduledNotification: scheduledRow }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 5. Resolve Matching Users
  let profileQuery = adminClient.from('profiles').select('id, department, semester');
  if (audienceType === 'selected_users') {
    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ error: 'Select at least one recipient user.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    profileQuery = profileQuery.in('id', targetUserIds);
  } else if (audienceType === 'department_semester') {
    if (targetDepartment) profileQuery = profileQuery.eq('department', targetDepartment);
    if (targetSemester && targetSemester >= 1 && targetSemester <= 8) {
      profileQuery = profileQuery.eq('semester', targetSemester);
    }
  }

  const { data: recipients, error: recErr } = await profileQuery;
  if (recErr) {
    return new Response(JSON.stringify({ error: recErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const recipientIds = (recipients ?? []).map((r) => String(r.id));

  // 6. Create Notification Campaign Row
  const { data: notifRow, error: notifErr } = await adminClient
    .from('notifications')
    .insert({
      title: cleanTitle,
      body: cleanBody,
      category,
      image_url: imageUrl,
      target_view: targetView,
      action_url: actionUrl,
      audience_type: audienceType,
      target_user_ids: targetUserIds,
      target_department: targetDepartment,
      target_semester: targetSemester,
      sound_mode: soundMode,
      total_recipients: recipientIds.length,
      created_by: caller.id,
    })
    .select()
    .single();

  if (notifErr || !notifRow) {
    return new Response(JSON.stringify({ error: notifErr?.message || 'Insert failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 7. Load User Preferences & Active Device Tokens
  const { data: prefsRows } = recipientIds.length
    ? await adminClient
        .from('notification_preferences')
        .select('*')
        .in('user_id', recipientIds)
    : { data: [] };

  const prefsMap = new Map<string, Record<string, unknown>>();
  for (const p of prefsRows ?? []) {
    prefsMap.set(String(p.user_id), p as Record<string, unknown>);
  }

  const { data: tokenRows } = recipientIds.length
    ? await adminClient
        .from('device_tokens')
        .select('id, user_id, token, platform')
        .in('user_id', recipientIds)
        .eq('is_active', true)
    : { data: [] };

  const creds = parseServiceAccount(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON'));
  let fcmSentCount = 0;
  let fcmFailedCount = 0;
  const invalidTokenIds: string[] = [];

  if (creds && (tokenRows?.length ?? 0) > 0) {
    try {
      const accessToken = await getFcmAccessToken(creds);
      for (const dev of tokenRows ?? []) {
        const uid = String(dev.user_id);
        const prefCheck = preferenceAllowsCategory(prefsMap.get(uid), category);
        if (!prefCheck.allowPush) continue;

        const effectiveSound =
          soundMode === 'silent' || !prefCheck.allowSound
            ? 'silent'
            : soundMode === 'default'
              ? 'default'
              : 'custom';

        const result = await sendSingleFcmMessage(creds, accessToken, {
          token: String(dev.token),
          platform: (dev.platform as 'web' | 'android' | 'ios') || 'web',
          title: cleanTitle,
          body: cleanBody,
          category,
          notificationId: String(notifRow.id),
          targetView,
          actionUrl,
          imageUrl,
          soundMode: effectiveSound,
        });

        if (result.ok) {
          fcmSentCount += 1;
        } else {
          fcmFailedCount += 1;
          if (result.invalidToken) {
            invalidTokenIds.push(String(dev.id));
          }
        }
      }
    } catch (fcmInitErr) {
      console.error('FCM batch error:', fcmInitErr);
      fcmFailedCount = tokenRows?.length ?? 0;
    }
  }

  if (invalidTokenIds.length > 0) {
    await adminClient
      .from('device_tokens')
      .update({ is_active: false })
      .in('id', invalidTokenIds);
  }

  // 8. Insert User Inbox Rows (respecting category opt-out on push, keeping inbox record)
  if (recipientIds.length > 0) {
    const inboxRows = recipientIds.map((uid) => ({
      notification_id: notifRow.id,
      user_id: uid,
      title: cleanTitle,
      body: cleanBody,
      category,
      image_url: imageUrl,
      target_view: targetView,
      action_url: actionUrl,
      delivered_via: fcmSentCount > 0 ? 'fcm_and_in_app' : 'in_app',
    }));
    await adminClient.from('user_notifications').insert(inboxRows);
  }

  const finalStatus =
    fcmFailedCount > 0 && fcmSentCount === 0 && (tokenRows?.length ?? 0) > 0
      ? 'partial'
      : 'sent';

  await adminClient
    .from('notifications')
    .update({
      status: finalStatus,
      fcm_sent_count: fcmSentCount,
      fcm_failed_count: fcmFailedCount,
    })
    .eq('id', notifRow.id);

  return new Response(
    JSON.stringify({
      scheduled: false,
      fcmConfigured: Boolean(creds),
      notification: {
        ...notifRow,
        status: finalStatus,
        fcm_sent_count: fcmSentCount,
        fcm_failed_count: fcmFailedCount,
      },
      invalidTokensCleaned: invalidTokenIds.length,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
