// =====================================================================
// Le Gai Savoir - petits outils communs
// =====================================================================

// Protege un texte avant de l'inserer dans le HTML
export function echapper(texte) {
  return String(texte ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Icones en trait (SVG), sans emoji
const TRAITS = {
  accueil: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  apprendre: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  parcours: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  documents: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
  parents: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 20c0-2.5 1.5-4.5 4-4.5"/>',
  lecon: '<path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/>',
  fiche: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  controle: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  messages: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/>',
  sortie: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
};

export function icone(nom, taille = 24) {
  return '<svg width="' + taille + '" height="' + taille + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (TRAITS[nom] ?? "") + "</svg>";
}

// Le livre ouvert du logo
export const LOGO_LIVRE =
  '<svg class="logo-livre" viewBox="0 0 64 64" aria-hidden="true">' +
  '<path d="M8 18l24 4 24-4v30l-24 4-24-4z" fill="#FFF" stroke="#1E3A8A" stroke-width="3" stroke-linejoin="round"/>' +
  '<path d="M32 22v30" stroke="#1E3A8A" stroke-width="3"/>' +
  '<path d="M13 28l14 2M13 34l14 2M13 40l14 2" stroke="#1E3A8A" stroke-width="2"/>' +
  '<path d="M37 30l14-2M37 36l14-2M37 42l14-2" stroke="#C0392B" stroke-width="2"/></svg>';

// Traduit les messages d'erreur courants de Supabase
export function messageErreur(erreur) {
  const m = String(erreur?.message ?? erreur ?? "");
  if (/Invalid login credentials/i.test(m)) return "Email ou mot de passe incorrect.";
  if (/Email not confirmed/i.test(m)) return "Votre adresse email n'a pas encore été confirmée.";
  if (/Password should be at least/i.test(m)) return "Le mot de passe doit contenir au moins 6 caractères.";
  if (/rate limit|too many/i.test(m)) return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Impossible de joindre le serveur. Vérifiez votre connexion Internet.";
  return "Une erreur est survenue : " + m;
}
