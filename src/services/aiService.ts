import { isSupabaseMissingRelationError, supabase } from '../lib/supabaseClient';
import { AiAssistantMode, AiChatMessage, AiChatSession, LanguageMode } from '../types/study';

interface AskAiPayload {
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
  mode: AiAssistantMode;
  timestamp: string;
}

export const aiService = {
  async streamAssistant(
    payload: AskAiPayload,
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<{ model?: string; timestamp: string }> {
    const response = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        message: payload.message,
        mode: payload.mode,
        language: payload.language,
        departmentName: payload.departmentName,
        semesterLabel: payload.semesterLabel,
        concise: payload.concise,
        history: payload.history
          .filter((item) => !item.isError)
          .slice(-8)
          .map((item) => ({
            role: item.role,
            text: item.text,
          })),
      }),
    });

    if (!response.ok) {
      const errData = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        errData.error ||
          (payload.language === 'en'
            ? 'Failed to connect to AI Tutor.'
            : 'এআই টিউটরের সাথে সংযোগে সমস্যা হয়েছে।')
      );
    }

    if (!response.body) {
      const fallback = await this.askAssistant(payload);
      onChunk(fallback.reply);
      return { timestamp: fallback.timestamp };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completedTimestamp = new Date().toISOString();
    let modelUsed: string | undefined;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const lines = event.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const parsed = JSON.parse(jsonStr) as {
              type: 'chunk' | 'done' | 'error';
              text?: string;
              error?: string;
              model?: string;
              timestamp?: string;
            };
            if (parsed.type === 'chunk' && parsed.text) {
              onChunk(parsed.text);
            } else if (parsed.type === 'error') {
              throw new Error(parsed.error || 'AI stream error');
            } else if (parsed.type === 'done') {
              if (parsed.timestamp) completedTimestamp = parsed.timestamp;
              if (parsed.model) modelUsed = parsed.model;
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
              if (!jsonStr.startsWith('{')) continue;
              throw parseErr;
            }
          }
        }
      }
    }

    return { model: modelUsed, timestamp: completedTimestamp };
  },

  async askAssistant(payload: AskAiPayload): Promise<AskAiResponse> {
    const response = await fetch('/api/ai/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: payload.message,
        mode: payload.mode,
        language: payload.language,
        departmentName: payload.departmentName,
        semesterLabel: payload.semesterLabel,
        concise: payload.concise,
        history: payload.history
          .filter((item) => !item.isError)
          .slice(-8)
          .map((item) => ({
            role: item.role,
            text: item.text,
          })),
      }),
    });

    const data = (await response.json().catch(() => ({}))) as Partial<AskAiResponse> & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(
        data.error ||
          (payload.language === 'en'
            ? 'Failed to reach AI Tutor.'
            : 'এআই টিউটরের উত্তর পেতে সমস্যা হয়েছে।')
      );
    }

    if (!data.reply) {
      throw new Error(
        payload.language === 'en' ? 'Empty AI response received.' : 'এআই থেকে কোনো উত্তর পাওয়া যায়নি।'
      );
    }

    return {
      reply: data.reply,
      mode: data.mode ?? payload.mode,
      timestamp: data.timestamp ?? new Date().toISOString(),
    };
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
