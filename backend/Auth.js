import jwt from "jsonwebtoken";
import { supabase } from "./supabaseClient.js";

export async function getApplicantIdFromToken(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;

  const token = auth.replace("Bearer ", "");

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  return data.user.id;
}
