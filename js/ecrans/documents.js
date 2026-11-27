// =====================================================================
// Le Gai Savoir - ecran "Mes cours" : bibliotheque des documents joints
// =====================================================================

import { echapper } from "../outils.js";
import { etat, miseEnPage, chargerMatieres, appelerFonction, ecranAttente, ecranErreur, preparerFichier } from "../commun.js";

let documents = [];
let matieres = [];
let ouvert = null;         // document dont on affiche le texte lu
let enLecture = new Set(); // documents en cours de lecture par l'IA
let filtreMatiere = "";

const TAILLE_MAX = 10 * 1024 * 1024;

function taille(octets) {
  const o = Number(octets ?? 0);
  if (o >= 1024 * 1024) return String(Math.round(o / 104857.6) / 10).replace(".", ",") + " Mo";
  return Math.max(1, Math.round(o / 1024)) + " Ko";
}

function dateCourte(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

async function charger() {
  const { data, error } = await etat.supabase
    .from("documents")
    .select("id, nom, statut, chemin_stockage, type_fichier, taille_octets, matiere_id, texte_extrait, date_creation")
    .eq("profil_id", etat.profil.id)
    .order("date_creation", { ascending: false });
  if (error) throw error;
  documents = data ?? [];
}

export async function ecranDocuments() {
  ecranAttente("documents");
  try {
    matieres = await chargerMatieres();
    await charger();
  } catch (e) {
    return ecranErreur("documents", "Mes cours indisponibles", e.message);
  }
  dessiner();
}

// ---------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------

function dessiner(garderDefilement = false, message = "") {
  const parId = Object.fromEntries(matieres.map((m) => [m.id, m]));
  const utilisees = matieres.filter((m) => documents.some((d) => d.matiere_id === m.id));
  if (filtreMatiere && !utilisees.some((m) => m.id === filtreMatiere)) filtreMatiere = "";
  const visibles = documents.filter((d) => !filtreMatiere || d.matiere_id === filtreMatiere);
  const totalOctets = documents.reduce((s, d) => s + Number(d.taille_octets ?? 0), 0);

  const ajout =
    '<section class="cours-joints ajout-cours">' +
    '<div class="question">Ajouter un cours</div>' +
    '<label class="question-petite" for="cmbMatiereAjout">Matière du cours</label>' +
    '<select id="cmbMatiereAjout" class="saisie"><option value="">(sans matière)</option>' +
    matieres.map((m) => '<option value="' + m.id + '"' + (filtreMatiere === m.id ? " selected" : "") + ">" + echapper(m.libelle) + "</option>").join("") +
    "</select>" +
    '<div class="boutons-cours">' +
    '<label class="bouton ocre">' + iconePhoto() + "Photo" +
    '<input type="file" id="filPhoto" accept="image/*" capture="environment" hidden></label>' +
    '<label class="bouton ocre">' + iconeFichier() + "Fichier" +
    '<input type="file" id="filFichier" accept="image/*,application/pdf" hidden></label>' +
    "</div>" +
    '<div class="aide">Une photo par page du manuel ou du cahier, ou un PDF (10 Mo maximum). ' +
    "L'application lit le texte une seule fois, puis vous pouvez réutiliser ce cours autant que vous voulez.</div>" +
    "</section>";

  const liste = visibles.length
    ? '<div class="liste-cours">' + visibles.map((d) => carteDocument(d, parId)).join("") + "</div>"
    : '<div class="carte pointillee">' + (documents.length ? "Aucun cours dans cette matière." :
      "Vous n'avez encore joint aucun cours. Photographiez une page de votre manuel ou de votre cahier pour commencer.") + "</div>";

  miseEnPage("documents",
    '<h1 class="titre-main grand">Mes cours</h1>' +
    '<p class="sous-titre">' + documents.length + " document" + (documents.length > 1 ? "s" : "") +
    (documents.length ? " · " + taille(totalOctets) : "") + "</p>" +
    (message ? '<div class="message erreur">' + echapper(message) + "</div>" : "") +
    ajout +
    '<section class="bloc-parcours"><h2>Ma bibliothèque</h2>' +
    (utilisees.length > 1
      ? '<div class="filtres"><select id="cmbFiltre" class="saisie petit"><option value="">Toutes les matières</option>' +
        utilisees.map((m) => '<option value="' + m.id + '"' + (filtreMatiere === m.id ? " selected" : "") + ">" + echapper(m.libelle) + "</option>").join("") +
        "</select></div>"
      : "") +
    liste + "</section>",
    { garderDefilement });

  brancher();
}

function carteDocument(d, parId) {
  const lu = d.statut === "lu";
  const lecture = enLecture.has(d.id);
  const etatTexte = lecture ? "Lecture en cours…" : lu ? "Lu · " + (d.texte_extrait ?? "").length.toLocaleString("fr-FR") + " caractères"
    : d.statut === "erreur" ? "Lecture impossible" : "Pas encore lu";
  const classeEtat = lecture ? "" : lu ? "ok" : "ko";
  const estOuvert = ouvert === d.id;

  return '<article class="carte-cours">' +
    '<div class="ligne-cours">' +
    '<span class="pictogramme">' + (String(d.type_fichier).includes("pdf") ? iconeFichier() : iconePhoto()) + "</span>" +
    '<div class="texte"><span class="titre">' + echapper(d.nom) + "</span>" +
    '<span class="details">' + dateCourte(d.date_creation) + " · " + taille(d.taille_octets) + "</span>" +
    '<span class="etat ' + classeEtat + '">' + etatTexte + "</span></div>" +
    '<button type="button" class="supprimer" data-supprimer="' + d.id + '" aria-label="Supprimer ' + echapper(d.nom) + '">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>' +
    "</div>" +
    '<div class="actions-cours">' +
    '<select class="saisie petit" data-matiere-doc="' + d.id + '" aria-label="Matière de ' + echapper(d.nom) + '">' +
    '<option value="">(sans matière)</option>' +
    matieres.map((m) => '<option value="' + m.id + '"' + (d.matiere_id === m.id ? " selected" : "") + ">" + echapper(m.libelle) + "</option>").join("") +
    "</select>" +
    (lu ? '<button type="button" class="bouton petit plein" data-utiliser="' + d.id + '">Utiliser</button>' : "") +
    (lu ? '<button type="button" class="bouton petit" data-voir="' + d.id + '">' + (estOuvert ? "Masquer le texte" : "Texte lu") + "</button>" : "") +
    '<button type="button" class="bouton petit" data-original="' + d.id + '">Original</button>' +
    (!lu && !lecture ? '<button type="button" class="bouton petit ocre" data-relire="' + d.id + '">Relire</button>' : "") +
    "</div>" +
    (estOuvert ? '<pre class="texte-lu">' + echapper(d.texte_extrait ?? "") + "</pre>" : "") +
    "</article>";
}

function iconePhoto() {
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
}
function iconeFichier() {
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/></svg>';
}

// ---------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------

function brancher() {
  const tous = (sel, fn) => document.querySelectorAll(sel).forEach((el) => fn(el));

  document.getElementById("cmbFiltre")?.addEventListener("change", (e) => { filtreMatiere = e.target.value; dessiner(true); });
  document.getElementById("filPhoto").addEventListener("change", (e) => ajouter(e.target.files[0]));
  document.getElementById("filFichier").addEventListener("change", (e) => ajouter(e.target.files[0]));

  tous("[data-supprimer]", (b) => b.addEventListener("click", () => supprimer(b.dataset.supprimer)));
  tous("[data-voir]", (b) => b.addEventListener("click", () => {
    ouvert = ouvert === b.dataset.voir ? null : b.dataset.voir; dessiner(true);
  }));
  tous("[data-relire]", (b) => b.addEventListener("click", () => lire(b.dataset.relire, true)));
  tous("[data-original]", (b) => b.addEventListener("click", () => ouvrirOriginal(b.dataset.original)));
  tous("[data-matiere-doc]", (s) => s.addEventListener("change", () => changerMatiere(s.dataset.matiereDoc, s.value)));
  tous("[data-utiliser]", (b) => b.addEventListener("click", () => {
    const d = documents.find((x) => x.id === b.dataset.utiliser);
    const m = matieres.find((x) => x.id === d.matiere_id);
    etat.preselection = { documents: [d.id], matiere: m ? m.code : undefined, theme: "" };
    location.hash = "#/apprendre";
  }));
}

async function ajouter(fichier) {
  if (!fichier) return;
  if (fichier.size > TAILLE_MAX) return dessiner(true, "Ce fichier dépasse 10 Mo. Choisissez un fichier plus léger.");
  const sb = etat.supabase;
  const matiereId = document.getElementById("cmbMatiereAjout").value || null;

  try {
    const prepare = await preparerFichier(fichier);
    const chemin = etat.profil.id + "/" + crypto.randomUUID() + "." + prepare.extension;
    const { error: eEnvoi } = await sb.storage.from("documents").upload(chemin, prepare.blob, { contentType: prepare.type });
    if (eEnvoi) throw eEnvoi;
    const { data: doc, error: eDoc } = await sb.from("documents").insert({
      profil_id: etat.profil.id,
      matiere_id: matiereId,
      nom: prepare.nom,
      type_fichier: prepare.type,
      chemin_stockage: chemin,
      taille_octets: prepare.blob.size,
    }).select("id").single();
    if (eDoc) throw eDoc;
    if (matiereId) filtreMatiere = matiereId;
    await charger();
    await lire(doc.id, false);
  } catch (e) {
    dessiner(true, "L'envoi a échoué : " + (e.message ?? e));
  }
}

async function lire(id, relire) {
  enLecture.add(id);
  dessiner(true);
  let message = "";
  try {
    await appelerFonction("lire-document", { document_id: id, relire });
  } catch (e) {
    message = "Le cours n'a pas pu être lu : " + e.message;
  }
  enLecture.delete(id);
  try { await charger(); } catch (e) { /* rien */ }
  dessiner(true, message);
}

async function ouvrirOriginal(id) {
  const d = documents.find((x) => x.id === id);
  if (!d) return;
  // Fenetre ouverte tout de suite (sinon le telephone la bloque), puis remplie
  const fenetre = window.open("", "_blank");
  const { data, error } = await etat.supabase.storage.from("documents").createSignedUrl(d.chemin_stockage, 600);
  if (error || !data) {
    if (fenetre) fenetre.close();
    return dessiner(true, "Impossible d'ouvrir le fichier : " + (error ? error.message : ""));
  }
  if (fenetre) fenetre.location = data.signedUrl; else location.href = data.signedUrl;
}

async function changerMatiere(id, matiereId) {
  const { error } = await etat.supabase.from("documents").update({ matiere_id: matiereId || null }).eq("id", id);
  const d = documents.find((x) => x.id === id);
  if (!error && d) d.matiere_id = matiereId || null;
  dessiner(true, error ? "La matière n'a pas pu être changée : " + error.message : "");
}

async function supprimer(id) {
  const d = documents.find((x) => x.id === id);
  if (!d) return;
  if (!confirm("Supprimer définitivement « " + d.nom + " » ? Les leçons et contrôles déjà préparés à partir de ce cours sont conservés.")) return;
  const sb = etat.supabase;
  const { error: eFichier } = await sb.storage.from("documents").remove([d.chemin_stockage]);
  const { error: eLigne } = await sb.from("documents").delete().eq("id", id);
  if (ouvert === id) ouvert = null;
  try { await charger(); } catch (e) { /* rien */ }
  dessiner(true, eFichier || eLigne ? "La suppression a échoué : " + (eFichier || eLigne).message : "");
}
