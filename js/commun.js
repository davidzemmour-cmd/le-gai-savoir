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
  ];
  if (etat.profil.est_parent) liens.push({ route: "parents", libelle: "Parents", icone: "parents" });
  return liens;
}

export function miseEnPage(routeActive, contenuHtml, options = {}) {
  const defilement = window.scrollY;
  const p = etat.profil;
  const liens = menus();
  const initiale = echapper(p.prenom.charAt(0).toUpperCase());
  const lien = (l, taille) =>
    '<a href="#/' + l.route + '" class="' + (l.route === routeActive ? "actif" : "") + '">' +
    icone(l.icone, taille) + "<span>" + l.libelle + "</span></a>";

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
