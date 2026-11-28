// =====================================================================
// Le Gai Savoir - etat partage et mise en page commune aux ecrans
// =====================================================================

import { echapper, icone } from "./outils.js";
import { marked } from "https://cdn.jsdelivr.net/npm/marked@15/+esm";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3/+esm";

// Etat de la session (rempli par app.js)
export const etat = {
  supabase: null,
  profil: null,
  matieres: null,
  preselection: null, // demande pre-remplie (ex. "S'entrainer" sur une notion)
  nonLus: {},         // messages non lus par conversation
  canalMessages: null,
  ecouteursMessages: new Set(), // ecrans a prevenir quand un message arrive
  brouillonLien: null, // travail joint au prochain message
};

export const racine = () => document.getElementById("app");

// ---------------------------------------------------------------------
// Menus : menu lateral (ordinateur) et onglets du bas (telephone)
// ---------------------------------------------------------------------

function menus() {
  const liens = [
    { route: "accueil", libelle: "Accueil", icone: "accueil" },
    { route: "apprendre", libelle: "Apprendre", icone: "apprendre" },
    { route: "parcours", libelle: "Parcours", icone: "parcours" },
    { route: "documents", libelle: "Mes cours", icone: "documents" },
    { route: "messages", libelle: "Messages", icone: "messages", compteur: true },
  ];
  if (etat.profil.est_parent) liens.push({ route: "parents", libelle: "Parents", icone: "parents" });
  return liens;
}

export function miseEnPage(routeActive, contenuHtml, options = {}) {
  const defilement = window.scrollY;
  const dialogue = document.getElementById("dlgInvitation");
  if (dialogue && dialogue.open) dialogue.close();
  const p = etat.profil;
  const liens = menus();
  const initiale = echapper(p.prenom.charAt(0).toUpperCase());
  const total = totalNonLus();
  const lien = (l, taille) =>
    '<a href="#/' + l.route + '" class="' + (l.route === routeActive ? "actif" : "") + '">' +
    '<span class="icone-onglet">' + icone(l.icone, taille) +
    (l.compteur ? '<span class="compteur-messages"' + (total ? "" : " hidden") + ">" + total + "</span>" : "") +
    "</span><span>" + l.libelle + "</span></a>";

  racine().innerHTML =
    '<div class="mise-en-page">' +
    '<aside class="menu-lateral">' +
    '<div class="nom-app">Le Gai Savoir</div>' +
    "<nav>" + liens.map((l) => lien(l, 22)).join("") + "</nav>" +
    '<div class="profil"><div class="pastille">' + initiale + "</div>" +
    "<div><b>" + echapper(p.prenom) + "</b><br>" +
    '<button class="lien-bouton" data-action="deconnexion">Se déconnecter</button></div></div>' +
    "</aside>" +
    '<main class="contenu papier"><div class="contenu-interieur">' +
    '<header class="entete-mobile"><span class="nom-app">Le Gai Savoir</span>' +
    '<div class="pastille">' + initiale + "</div></header>" +
    contenuHtml +
    "</div></main>" +
    '<nav class="onglets">' + liens.map((l) => lien(l, 24)).join("") + "</nav>" +
    "</div>";

  racine().querySelectorAll('[data-action="deconnexion"]').forEach((b) =>
    b.addEventListener("click", () => etat.supabase.auth.signOut()));
  if (options.garderDefilement) window.scrollTo(0, defilement); else window.scrollTo(0, 0);
}

// En-tete d'un ecran interieur : fleche de retour + titre manuscrit
export function entete(titre, retour = "#/accueil") {
  return '<header class="entete-ecran ne-pas-imprimer">' +
    '<a href="' + retour + '" class="retour" aria-label="Retour">' +
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></a>' +
    '<h1 class="titre-main moyen">' + echapper(titre) + "</h1></header>";
}

// ---------------------------------------------------------------------
// Donnees de reference
// ---------------------------------------------------------------------

export async function chargerMatieres() {
  if (etat.matieres) return etat.matieres;
  const { data, error } = await etat.supabase
    .from("matieres").select("id, code, libelle, ordre").eq("actif", true).order("ordre");
  if (error) throw error;
  etat.matieres = data ?? [];
  return etat.matieres;
}

export async function libelleMatiere(id) {
  const m = (await chargerMatieres()).find((x) => x.id === id);
  return m ? m.libelle : "";
}

export function libelleNiveau(niveau) {
  return niveau === "adulte" ? "Adulte" : niveau;
}

export function dateCourte(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// ---------------------------------------------------------------------
// Appel d'une Edge Function, avec un message d'erreur lisible
// ---------------------------------------------------------------------

export async function appelerFonction(nom, corps) {
  const { data, error } = await etat.supabase.functions.invoke(nom, { body: corps });
  if (error) {
    let detail = error.message;
    try {
      const json = await error.context.json();
      detail = json.erreur ?? JSON.stringify(json);
      // Detail technique (utile pour comprendre une panne)
      if (Array.isArray(json.details) && json.details.length) detail += " [" + json.details.join(" | ").slice(0, 400) + "]";
    } catch (e) { /* on garde le message d'origine */ }
    throw new Error(detail);
  }
  return data;
}

// ---------------------------------------------------------------------
// Affichage des contenus produits par les IA
// ---------------------------------------------------------------------

// Markdown -> HTML nettoye (les IA ne peuvent pas injecter de script)
export function markdown(texte) {
  return DOMPurify.sanitize(marked.parse(String(texte ?? ""), { breaks: false, gfm: true }));
}

export function figure(ill) {
  if (!ill || !ill.url) return "";
  const credit = [ill.auteur, ill.licence].filter(Boolean).map(echapper).join(" · ");
  return '<figure class="illustration">' +
    '<img src="' + echapper(ill.url) + '" alt="' + echapper(ill.legende) + '" loading="lazy">' +
    "<figcaption>" + echapper(ill.legende) +
    '<small>' + credit +
    (ill.page_source ? ' · <a href="' + echapper(ill.page_source) + '" target="_blank" rel="noopener">Wikimedia Commons</a>' : "") +
    "</small></figcaption></figure>";
}

export function blocSources(sources) {
  const liste = (Array.isArray(sources) ? sources : []).filter((s) => s && (s.titre || s.url));
  if (liste.length === 0) return "";
  return '<section class="sources"><h2>Sources</h2><ul>' +
    liste.map((s) => "<li>" + (s.url
      ? '<a href="' + echapper(s.url) + '" target="_blank" rel="noopener">' + echapper(s.titre || s.url) + "</a>"
      : echapper(s.titre)) + "</li>").join("") +
    "</ul></section>";
}

export function ecranAttente(route, texte = "Chargement…") {
  miseEnPage(route, '<div class="attente">' + echapper(texte) + "</div>");
}

export function ecranErreur(route, titre, texte) {
  miseEnPage(route,
    '<section class="carte pointillee"><h1 class="titre-main moyen rouge">' + echapper(titre) + "</h1>" +
    "<p>" + echapper(texte) + '</p><a class="bouton" href="#/accueil">Revenir à l\'accueil</a></section>');
}

// ---------------------------------------------------------------------
// Preparation d'un cours avant envoi : les photos sont converties en JPEG
// (format lu par toutes les IA) et reduites a 2000 pixels au plus.
// ---------------------------------------------------------------------

const TYPES_PAR_EXTENSION = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heic", pdf: "application/pdf" };

export async function preparerFichier(fichier) {
  const extension = (String(fichier.name || "").split(".").pop() || "").toLowerCase();
  const type = fichier.type || TYPES_PAR_EXTENSION[extension] || "";
  const nomBase = String(fichier.name || "photo").replace(/\.[^.]+$/, "") || "photo";

  if (type === "application/pdf") return { blob: fichier, type, nom: fichier.name || "document.pdf", extension: "pdf" };
  if (!type.startsWith("image/") && type !== "") throw new Error("Format non pris en charge : choisissez une photo ou un PDF.");

  try {
    const image = await createImageBitmap(fichier);
    const echelle = Math.min(1, 2000 / Math.max(image.width, image.height));
    const toile = document.createElement("canvas");
    toile.width = Math.round(image.width * echelle);
    toile.height = Math.round(image.height * echelle);
    const ctx = toile.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, toile.width, toile.height);
    ctx.drawImage(image, 0, 0, toile.width, toile.height);
    const blob = await new Promise((ok) => toile.toBlob(ok, "image/jpeg", 0.88));
    if (blob) return { blob, type: "image/jpeg", nom: nomBase + ".jpg", extension: "jpg" };
  } catch (e) { /* image illisible par le navigateur (ex. HEIC) : on envoie l'original */ }

  if (!type) throw new Error("Format de fichier inconnu : choisissez une photo (JPEG, PNG) ou un PDF.");
  return { blob: fichier, type, nom: fichier.name || "photo." + extension, extension: extension || "jpg" };
}

// ---------------------------------------------------------------------
// Messagerie : compteur de messages non lus et arrivee en direct
// ---------------------------------------------------------------------

export function cleConversation(a, b) {
  if (!b) return "famille";
  return a < b ? a + "_" + b : b + "_" + a;
}

export function totalNonLus() {
  return Object.values(etat.nonLus).reduce((s, n) => s + n, 0);
}

function afficherCompteur() {
  const total = totalNonLus();
  document.querySelectorAll(".compteur-messages").forEach((el) => {
    el.textContent = total > 99 ? "99+" : String(total);
    el.hidden = total === 0;
  });
}

export async function majNonLus() {
  const { data, error } = await etat.supabase.rpc("messages_non_lus");
  if (error) return; // script 10 pas encore execute : pas de compteur
  etat.nonLus = Object.fromEntries((data ?? []).map((x) => [x.conversation, x.nb]));
  afficherCompteur();
}

export async function marquerLu(conversation) {
  await etat.supabase.from("lectures_messages").upsert(
    { profil_id: etat.profil.id, conversation, lu_jusqu_a: new Date().toISOString() },
    { onConflict: "profil_id,conversation" });
  delete etat.nonLus[conversation];
  afficherCompteur();
}

export function demarrerMessagerie() {
  if (etat.canalMessages) return;
  majNonLus();
  etat.canalMessages = etat.supabase
    .channel("messages-famille")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "messages_famille", filter: "famille_id=eq." + etat.profil.famille_id },
      (charge) => {
        const m = charge.new;
        let traite = false;
        for (const f of etat.ecouteursMessages) if (f(m)) traite = true;
        if (!traite && m.auteur_id !== etat.profil.id) {
          etat.nonLus[m.conversation] = (etat.nonLus[m.conversation] ?? 0) + 1;
          afficherCompteur();
        }
      })
    .on("postgres_changes",
      { event: "DELETE", schema: "public", table: "messages_famille" },
      (charge) => {
        const id = charge.old && charge.old.id;
        if (id) document.querySelectorAll('[data-message="' + id + '"]').forEach((el) => el.remove());
      })
    .subscribe();
}

export function arreterMessagerie() {
  if (etat.canalMessages) etat.supabase.removeChannel(etat.canalMessages);
  etat.canalMessages = null;
  etat.nonLus = {};
  etat.ecouteursMessages.clear();
}

// Bouton "Envoyer un message" sur une lecon, une fiche ou un controle
export function boutonMessage() {
  return '<button type="button" class="bouton" data-action="message">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/></svg>Envoyer un message</button>';
}

export function brancherBoutonMessage(lien, proprietaireId) {
  document.querySelectorAll('[data-action="message"]').forEach((b) => b.addEventListener("click", () => {
    etat.brouillonLien = lien;
    // Le travail d'un autre membre : on lui ecrit directement ; sinon on choisit le destinataire
    location.hash = proprietaireId && proprietaireId !== etat.profil.id
      ? "#/messages/" + cleConversation(etat.profil.id, proprietaireId)
      : "#/messages";
  }));
}

// ---------------------------------------------------------------------
// Invitation d'un membre sans compte : le serveur prepare un lien,
// le parent l'envoie lui-meme (partage du telephone, SMS, email, copie).
// ---------------------------------------------------------------------

export async function inviterMembre(profilId) {
  let dialogue = document.getElementById("dlgInvitation");
  if (!dialogue) {
    dialogue = document.createElement("dialog");
    dialogue.id = "dlgInvitation";
    dialogue.className = "dialogue";
    document.body.appendChild(dialogue);
  }
  dialogue.innerHTML = '<p class="attente">Préparation de l\'invitation…</p>';
  dialogue.showModal();

  let r;
  try {
    r = await appelerFonction("inviter-membre", { profil_id: profilId });
  } catch (e) {
    dialogue.innerHTML = '<h2 class="titre-main moyen rouge">Invitation impossible</h2>' +
      "<p>" + echapper(e.message) + "</p>" +
      '<div class="barre-actions"><button class="bouton" data-fermer>Fermer</button></div>';
    dialogue.querySelector("[data-fermer]").addEventListener("click", () => dialogue.close());
    return;
  }

  const sujet = "Invitation au Gai Savoir";
  const texte = "Bonjour " + r.prenom + " !\n\n" +
    etat.profil.prenom + " t'invite à rejoindre Le Gai Savoir, l'application d'apprentissage de la famille.\n\n" +
    "1. Ouvre ce lien (valable " + r.valable_heures + " heures) et choisis ton mot de passe :\n" + r.lien + "\n\n" +
    "2. Ensuite, connecte-toi avec ton adresse " + r.email + " sur :\n" + location.origin + location.pathname + "\n\n" +
    "Sur téléphone, ajoute l'application à ton écran d'accueil depuis le menu du navigateur.";

  // SMS : seulement sur telephone (un ordinateur n'a pas d'application SMS) ;
  // l'iPhone et Android n'ecrivent pas le lien de la meme facon
  const ua = navigator.userAgent;
  const lienSms = /iPhone|iPad|iPod/i.test(ua) ? "sms:&body=" + encodeURIComponent(texte)
    : /Android/i.test(ua) ? "sms:?body=" + encodeURIComponent(texte) : "";

  dialogue.innerHTML =
    '<h2 class="titre-main moyen">Invitation pour ' + echapper(r.prenom) + "</h2>" +
    "<p>Le lien est prêt. Envoyez-le à " + echapper(r.prenom) + " par le moyen de votre choix. " +
    "Il est valable " + r.valable_heures + " heures et ne sert qu'une fois.</p>" +
    '<textarea class="texte-invitation" readonly rows="8">' + echapper(texte) + "</textarea>" +
    '<div class="barre-actions">' +
    (navigator.share ? '<button class="bouton plein" data-partager>Partager…</button>' : "") +
    '<a class="bouton" href="mailto:' + encodeURIComponent(r.email) + "?subject=" + encodeURIComponent(sujet) +
      "&body=" + encodeURIComponent(texte) + '">Email</a>' +
    (lienSms ? '<a class="bouton" href="' + lienSms + '">SMS</a>' : "") +
    '<button class="bouton" data-copier>Copier</button>' +
    '<button class="bouton rouge" data-fermer>Fermer</button>' +
    "</div>" +
    '<p class="aide" id="infoInvitation"></p>';

  const info = dialogue.querySelector("#infoInvitation");
  dialogue.querySelector("[data-fermer]").addEventListener("click", () => dialogue.close());
  dialogue.querySelector("[data-partager]")?.addEventListener("click", async () => {
    try { await navigator.share({ title: sujet, text: texte }); info.textContent = "Invitation partagée."; } catch (e) { /* annule */ }
  });
  dialogue.querySelector("[data-copier]").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(texte);
      info.textContent = "Texte copié : collez-le dans un message.";
    } catch (e) {
      const zone = dialogue.querySelector(".texte-invitation");
      zone.select();
      info.textContent = "Sélectionnez le texte puis copiez-le.";
    }
  });
}
