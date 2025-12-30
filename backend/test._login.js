// test-login.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ✅ Initialize Supabase with your env variables
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Replace these with the scholar's email and temp password you want to test
const TEST_EMAIL = "scholar@example.com";
const TEMP_PASSWORD = "ISKOLAREAN123";

async function testLogin(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error("❌ Login failed:", error.message);
      return;
    }

    console.log("✅ Login success!");
    console.log("User info:", data.user);

    // Optional: fetch scholar profile
    const { data: scholar, error: profileError } = await supabase
      .from('scholars')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError) {
      console.error("❌ Scholar profile not found:", profileError.message);
    } else {
      console.log("✅ Scholar profile:", scholar);
    }

  } catch (err) {
    console.error("❌ Unexpected error:", err);
  }
}

// Run test
testLogin(TEST_EMAIL, TEMP_PASSWORD);
