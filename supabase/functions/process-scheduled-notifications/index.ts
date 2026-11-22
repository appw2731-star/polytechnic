// Supabase Edge Function: process-scheduled-notifications
// Executes due pending rows from public.scheduled_notifications via Cron or Admin invocation.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  getFcmAccessToken,
  parseServiceAccount,
  sendSingleFcmMessage,
  type PushCategory,
} from '../_shared/fcm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';

  const reqSecret = req.headers.get('x-cron-secret') || '';
  const authHeader = req.headers.get('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let authorized = Boolean(
    (cronSecret && reqSecret === cronSecret) || (serviceRoleKey && bearer === serviceRoleKey)
  );

  if (!authorized && bearer) {
    const { data: userData } = await adminClient.auth.getUser(bearer);
    if (userData?.user) {
      const { data: prof } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (prof?.role === 'admin') authorized = true;
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const nowIso = new Date().toISOString();
  const { data: dueRows, error } = await adminClient
    .from('scheduled_notifications')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .limit(20);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const creds = parseServiceAccount(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON'));
  const accessToken = creds ? await getFcmAccessToken(creds).catch(() => null) : null;
  let processed = 0;

  for (const job of dueRows ?? []) {
    await adminClient
      .from('scheduled_notifications')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', job.id);

    try {
      let profileQuery = adminClient.from('profiles').select('id');
      if (job.audience_type === 'selected_users' && Array.isArray(job.target_user_ids)) {
        profileQuery = profileQuery.in('id', job.target_user_ids);
      } else if (job.audience_type === 'department_semester') {
        if (job.target_department) profileQuery = profileQuery.eq('department', job.target_department);
        if (job.target_semester) profileQuery = profileQuery.eq('semester', job.target_semester);
      }
      const { data: recipients } = await profileQuery;
      const recipientIds = (recipients ?? []).map((r) => String(r.id));

      const { data: notifRow } = await adminClient
        .from('notifications')
        .insert({
          title: job.title,
          body: job.body,
          category: job.category,
          image_url: job.image_url || '',
          target_view: job.target_view || 'notifications',
          action_url: job.action_url || '',
          audience_type: job.audience_type,
          target_user_ids: job.target_user_ids || [],
          target_department: job.target_department || '',
          target_semester: job.target_semester || null,
          sound_mode: job.sound_mode || 'custom',
          total_recipients: recipientIds.length,
          created_by: job.created_by,
        })
        .select()
        .single();

      let fcmSent = 0;
      let fcmFailed = 0;
      const invalidIds: string[] = [];

      if (notifRow && recipientIds.length > 0) {
        const { data: tokens } = await adminClient
          .from('device_tokens')
          .select('id, user_id, token, platform')
          .in('user_id', recipientIds)
          .eq('is_active', true);

        if (creds && accessToken && tokens) {
          for (const dev of tokens) {
            const res = await sendSingleFcmMessage(creds, accessToken, {
              token: String(dev.token),
              platform: (dev.platform as 'web' | 'android' | 'ios') || 'web',
              title: job.title,
              body: job.body,
              category: job.category as PushCategory,
              notificationId: String(notifRow.id),
              targetView: job.target_view || 'notifications',
              actionUrl: job.action_url || '',
              imageUrl: job.image_url || '',
              soundMode: job.sound_mode || 'custom',
            });
            if (res.ok) fcmSent += 1;
            else {
              fcmFailed += 1;
              if (res.invalidToken) invalidIds.push(String(dev.id));
            }
          }
        }

        if (invalidIds.length > 0) {
          await adminClient.from('device_tokens').update({ is_active: false }).in('id', invalidIds);
        }

        await adminClient.from('user_notifications').insert(
          recipientIds.map((uid) => ({
            notification_id: notifRow.id,
            user_id: uid,
            title: job.title,
            body: job.body,
            category: job.category,
            image_url: job.image_url || '',
            target_view: job.target_view || 'notifications',
            action_url: job.action_url || '',
            delivered_via: fcmSent > 0 ? 'fcm_and_in_app' : 'in_app',
          }))
        );

        await adminClient
          .from('notifications')
          .update({ fcm_sent_count: fcmSent, fcm_failed_count: fcmFailed })
          .eq('id', notifRow.id);
      }

      await adminClient
        .from('scheduled_notifications')
        .update({
          status: 'sent',
          sent_notification_id: notifRow?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      processed += 1;
    } catch (jobErr) {
      await adminClient
        .from('scheduled_notifications')
        .update({
          status: 'failed',
          error_message: jobErr instanceof Error ? jobErr.message : String(jobErr),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    }
  }

  return new Response(JSON.stringify({ processed }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
