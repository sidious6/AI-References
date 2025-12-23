import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const supabaseKey = config.database.supabaseServiceRoleKey || config.database.supabaseAnonKey;
  if (!config.database.supabaseUrl || !supabaseKey) {
    console.warn('Supabase configuration missing, running in local-only mode');
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(config.database.supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          'x-client-info': 'ai-references-server',
        },
      },
    });

    if (!config.database.supabaseServiceRoleKey) {
      console.warn('Supabase service role key missing, falling back to anon key with limited privileges');
    }
  }

  return supabaseClient;
}

export async function testSupabaseConnection(): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from('settings').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}
