/** Existing Supabase project (Brief §3) — anon key only, acceptable for this prototype. */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://sibqtofjaptfwkvhlrik.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_G8McJNxu7460ZHecyEeYTw_udAHMIAa';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
