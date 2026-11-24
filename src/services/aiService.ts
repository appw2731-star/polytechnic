import { isSupabaseMissingRelationError, supabase } from '../lib/supabaseClient';
import { AiAssistantMode, AiChatMessage, AiChatSession, LanguageMode } from '../types/study';
import { getStoredToken } from './apiClient';

interface AskAiPayload {
  sessionId?: string;
  isRetry?: boolean;
  message: string;
  mode: AiAssistantMode;
  language: LanguageMode;
  departmentName: string;
  semesterLabel: string;
  concise?: boolean;
  history: AiChatMessage[];
}

export interface AskAiResponse {
  reply: string;
  sessionId?: string;
  turnCount?: number;
  mode: AiAssistantMode;
  model?: string;
  timestamp: string;
}

export interface AiStreamStatusEvent {
  type: 'retrying' | 'fallback';
  attempt: number;
  maxAttempts: number;
  model?: string;
  retryInMs?: number;
}

const STREAM_IDLE_TIMEOUT_MS = 28_000;
const MAX_SSE_ATTEMPTS = 2;
const MAX_FALLBACK_ATTEMPTS = 2;

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getStoredToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function buildCleanHistory(history: AiChatMessage[], currentMessage: string) {
  const trimmedCurrent = currentMessage.trim();
  const filtered = (Array.isArray(history) ? history : [])
    .filter((item) => item && !item.isError && typeof item.text === 'string' && item.text.trim().length > 0)
    .slice(-10)
    .map((item) => ({
      role: item.role,
      text: item.text.trim(),
    }));

  // Prevent duplicating the current user question if already present at the tail
  if (
    filtered.length > 0 &&
    filtered[filtered.length - 1].role === 'user' &&
    filtered[filtered.length - 1].text === trimmedCurrent
  ) {
    filtered.pop();
  }

  return filtered.slice(-8);
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

function isRetryableClientError(err: unknown): boolean {
  if (isAbortError(err)) return false;
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
  if (
    code === 'API_KEY_MISSING' ||
    code === 'API_KEY_INVALID' ||
    code === 'RATE_LIMIT' ||
    code === 'QUOTA_EXHAUSTED'
  ) {
    return false;
  }
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  if (
    msg.includes('api_key') ||
    msg.includes('api key') ||
    msg.includes('কনফিগার করা নেই') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('সীমা অতিক্রম')
  ) {
    return false;
  }
  return true;
}

async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export const aiService = {
  async streamAssistant(
    payload: AskAiPayload,
    onChunk: (delta: string) => void,
    signal?: AbortSignal,
    onStatus?: (status: AiStreamStatusEvent) => void
  ): Promise<{ sessionId?: string; model?: string; timestamp: string }> {
    const cleanHistory = buildCleanHistory(payload.history, payload.message);
    let emittedAnyChunk = false;

    const runSseAttempt = async (): Promise<{
      sessionId?: string;
      model?: string;
      timestamp: string;
    }> => {
      const attemptController = new AbortController();
      let timedOut = false;

      const forwardExternalAbort = () => attemptController.abort();
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      signal?.addEventListener('abort', forwardExternalAbort, { once: true });

      let idleTimer: number | null = null;
      const resetIdleTimer = () => {
        if (idleTimer !== null) window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => {
          timedOut = true;
          attemptController.abort();
        }, STREAM_IDLE_TIMEOUT_MS);
      };

      resetIdleTimer();

      try {
        const response = await fetch('/api/ai/stream', {
          method: 'POST',
          headers: buildAuthHeaders(),
          signal: attemptController.signal,
          body: JSON.stringify({
            sessionId: payload.sessionId,
            isRetry: payload.isRetry,
            message: payload.message,
            mode: payload.mode,
            language: payload.language,
            departmentName: payload.departmentName,
            semesterLabel: payload.semesterLabel,
            concise: payload.concise,
            history: cleanHistory,
          }),
        });

        if (!response.ok) {
          const errData = (await response.json().catch(() => ({}))) as {
            error?: string;
            code?: string;
          };
          const error = new Error(
            errData.error ||
              (payload.language === 'en'
                ? 'Failed to connect to AI Tutor.'
                : 'এআই টিউটরের সাথে সংযোগে সমস্যা হয়েছে।')
          ) as Error & { code?: string };
          error.code = errData.code;
          throw error;
        }

        if (!response.body) {
          onStatus?.({ type: 'fallback', attempt: 1, maxAttempts: MAX_FALLBACK_ATTEMPTS });
          const fallback = await this.askAssistant(payload, signal);
          emittedAnyChunk = true;
          onChunk(fallback.reply);
          return {
            sessionId: fallback.sessionId,
            model: fallback.model,
            timestamp: fallback.timestamp,
          };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let completedTimestamp = new Date().toISOString();
        let modelUsed: string | undefined;
        let resolvedSessionId: string | undefined = payload.sessionId;

        const processEventBlock = (eventBlock: string) => {
          const lines = eventBlock.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const jsonStr = line.slice(5).trim();
            if (!jsonStr) continue;
            try {
              const parsed = JSON.parse(jsonStr) as {
                type: 'chunk' | 'done' | 'error' | 'status';
                text?: string;
                error?: string;
                code?: string;
                model?: string;
                sessionId?: string;
                timestamp?: string;
                status?: 'retrying' | 'fallback';
                attempt?: number;
                maxAttempts?: number;
              };
              if (parsed.type === 'chunk' && parsed.text) {
                emittedAnyChunk = true;
                onChunk(parsed.text);
              } else if (parsed.type === 'status') {
                onStatus?.({
                  type: parsed.status ?? 'retrying',
                  attempt: parsed.attempt ?? 2,
                  maxAttempts: parsed.maxAttempts ?? 4,
                  model: parsed.model,
                });
              } else if (parsed.type === 'error') {
                const streamErr = new Error(parsed.error || 'AI stream error') as Error & {
                  code?: string;
                };
                streamErr.code = parsed.code;
                throw streamErr;
              } else if (parsed.type === 'done') {
                if (parsed.timestamp) completedTimestamp = parsed.timestamp;
                if (parsed.model) modelUsed = parsed.model;
                if (parsed.sessionId) resolvedSessionId = parsed.sessionId;
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
                if (!jsonStr.startsWith('{')) continue;
                throw parseErr;
              }
            }
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          resetIdleTimer();
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const event of events) {
            processEventBlock(event);
          }
        }

        // Flush any trailing bytes/events left in buffer when stream ends cleanly
        const remaining = buffer + decoder.decode();
        if (remaining.trim()) {
          processEventBlock(remaining);
        }

        if (!emittedAnyChunk) {
          throw new Error(
            payload.language === 'en'
              ? 'Empty response received from AI stream.'
              : 'এআই থেকে কোনো উত্তর পাওয়া যায়নি।'
          );
        }

        return {
          sessionId: resolvedSessionId,
          model: modelUsed,
          timestamp: completedTimestamp,
        };
      } catch (err: unknown) {
        if (timedOut && !signal?.aborted) {
          const timeoutErr = new Error(
            payload.language === 'en'
              ? 'AI stream timed out before responding.'
              : 'এআই সার্ভার থেকে উত্তর আসতে দেরি হয়েছে।'
          ) as Error & { code?: string };
          timeoutErr.code = 'STREAM_TIMEOUT';
          throw timeoutErr;
        }
        throw err;
      } finally {
        if (idleTimer !== null) window.clearTimeout(idleTimer);
        signal?.removeEventListener('abort', forwardExternalAbort);
      }
    };

    // Stage 1: Streaming SSE attempts with exponential backoff + jitter
    let lastErr: unknown = null;
    for (let sseAttempt = 1; sseAttempt <= MAX_SSE_ATTEMPTS; sseAttempt += 1) {
      if (sseAttempt > 1) {
        const delayMs = 900 * (sseAttempt - 1) + Math.floor(Math.random() * 250);
        onStatus?.({
          type: 'retrying',
          attempt: sseAttempt,
          maxAttempts: MAX_SSE_ATTEMPTS + MAX_FALLBACK_ATTEMPTS,
          retryInMs: delayMs,
        });
        await sleepWithAbort(delayMs, signal);
      }

      try {
        return await runSseAttempt();
      } catch (streamErr: unknown) {
        lastErr = streamErr;
        if (emittedAnyChunk || isAbortError(streamErr) || !isRetryableClientError(streamErr)) {
          throw streamErr;
        }
      }
    }

    // Stage 2: Automatic non-streaming JSON fallback retries if SSE failed before first token
    for (let fallbackAttempt = 1; fallbackAttempt <= MAX_FALLBACK_ATTEMPTS; fallbackAttempt += 1) {
      const delayMs = fallbackAttempt === 1 ? 750 : 1650;
      onStatus?.({
        type: 'fallback',
        attempt: MAX_SSE_ATTEMPTS + fallbackAttempt,
        maxAttempts: MAX_SSE_ATTEMPTS + MAX_FALLBACK_ATTEMPTS,
        retryInMs: delayMs,
      });
      await sleepWithAbort(delayMs, signal);

      try {
        const fallback = await this.askAssistant(payload, signal);
        emittedAnyChunk = true;
        onChunk(fallback.reply);
        return {
          sessionId: fallback.sessionId,
          model: fallback.model,
          timestamp: fallback.timestamp,
        };
      } catch (fallbackErr: unknown) {
        if (isAbortError(fallbackErr) || !isRetryableClientError(fallbackErr)) {
          throw fallbackErr;
        }
        lastErr = fallbackErr;
      }
    }

    throw lastErr;
  },

  async askAssistant(payload: AskAiPayload, signal?: AbortSignal): Promise<AskAiResponse> {
    const cleanHistory = buildCleanHistory(payload.history, payload.message);
    const response = await fetch('/api/ai/ask', {
      method: 'POST',
      headers: buildAuthHeaders(),
      signal,
      body: JSON.stringify({
        sessionId: payload.sessionId,
        isRetry: payload.isRetry,
        message: payload.message,
        mode: payload.mode,
        language: payload.language,
        departmentName: payload.departmentName,
        semesterLabel: payload.semesterLabel,
        concise: payload.concise,
        history: cleanHistory,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as Partial<AskAiResponse> & {
      error?: string;
      code?: string;
    };

    if (!response.ok) {
      const err = new Error(
        data.error ||
          (payload.language === 'en'
            ? 'Failed to reach AI Tutor.'
            : 'এআই টিউটরের উত্তর পেতে সমস্যা হয়েছে।')
      ) as Error & { code?: string };
      err.code = data.code;
      throw err;
    }

    if (!data.reply) {
      throw new Error(
        payload.language === 'en' ? 'Empty AI response received.' : 'এআই থেকে কোনো উত্তর পাওয়া যায়নি।'
      );
    }

    return {
      reply: data.reply,
      sessionId: data.sessionId ?? payload.sessionId,
      turnCount: data.turnCount,
      mode: data.mode ?? payload.mode,
      model: data.model,
      timestamp: data.timestamp ?? new Date().toISOString(),
    };
  },

  async loadServerSessions(sessionId?: string): Promise<AiChatSession[]> {
    try {
      const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
      const response = await fetch(`/api/ai/sessions${qs}`, {
        method: 'GET',
        headers: buildAuthHeaders(),
      });
      if (!response.ok) return [];
      const data = (await response.json().catch(() => ({}))) as { sessions?: AiChatSession[] };
      if (!Array.isArray(data.sessions)) return [];
      return data.sessions.map((s) => ({
        id: String(s.id),
        title: String(s.title || 'Chat Session'),
        messages: Array.isArray(s.messages) ? s.messages : [],
        createdAt: String(s.createdAt || new Date().toISOString()),
        updatedAt: String(s.updatedAt || new Date().toISOString()),
      }));
    } catch {
      return [];
    }
  },

  async clearServerSession(sessionId: string): Promise<void> {
    if (!sessionId) return;
    try {
      await fetch(`/api/ai/sessions/${encodeURIComponent(sessionId)}/clear`, {
        method: 'POST',
        headers: buildAuthHeaders(),
      });
    } catch {
      // keep local session clear resilient offline
    }
  },

  async deleteServerSession(sessionId: string): Promise<void> {
    if (!sessionId) return;
    try {
      await fetch(`/api/ai/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });
    } catch {
      // keep local session delete resilient offline
    }
  },

  async loadCloudChatSessions(userId: string): Promise<AiChatSession[]> {
    if (!supabase || userId.startsWith('usr-')) return [];
    try {
      const { data, error } = await supabase
        .from('chat_history')
        .select('id, title, messages, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(20);
      if (error) {
        if (!isSupabaseMissingRelationError(error)) {
          console.warn('Cloud chat load skipped:', error.message);
        }
        return [];
      }
      return (data ?? []).map((row) => ({
        id: String(row.id),
        title: String(row.title || 'Chat Session'),
        messages: Array.isArray(row.messages) ? (row.messages as AiChatMessage[]) : [],
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }));
    } catch {
      return [];
    }
  },

  async saveCloudChatSession(userId: string, session: AiChatSession): Promise<void> {
    if (!supabase || userId.startsWith('usr-')) return;
    try {
      await supabase.from('chat_history').upsert(
        {
          id: session.id,
          user_id: userId,
          title: session.title,
          messages: session.messages,
          updated_at: session.updatedAt,
        },
        { onConflict: 'id' }
      );
    } catch {
      // keep local persistence seamless
    }
  },

  async deleteCloudChatSession(userId: string, sessionId: string): Promise<void> {
    if (!supabase || userId.startsWith('usr-')) return;
    try {
      await supabase.from('chat_history').delete().eq('id', sessionId).eq('user_id', userId);
    } catch {
      // ignore
    }
  },
};
