// =====================================================================
// Le Gai Savoir - connexion a Supabase
// =====================================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_CLE_PUBLIQUE } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Profil de la personne connectee (prenom, niveau, role...)
export async function chargerMonProfil() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profils")
    .select("id, famille_id, prenom, niveau, est_parent, est_apprenant, controles_actifs")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
