import { createClient } from "@supabase/supabase-js";

// Client for frontend / anon usage (RLS enforced)
export const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Client for server-side usage (service_role, bypasses RLS)
export const supabaseServer = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
