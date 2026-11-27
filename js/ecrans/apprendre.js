// =====================================================================
// Le Gai Savoir - ecran "Apprendre" : nouvelle demande
// (lecon, fiche de revision ou controle, cours joints, generation)
// =====================================================================

import { echapper } from "../outils.js";
import { etat, miseEnPage, entete, chargerMatieres, appelerFonction, ecranErreur } from "../commun.js";

const NIVEAUX = ["CP", "CE1", "CE2", "CM1", "CM2", "6e", "5e", "4e", "3e", "2nde", "1re", "Tle", "adulte"];
const NB_MATIERES_VISIBLES = 6;

const TYPES = {
  lecon: { libelle: "Leçon", bouton: "Préparer ma leçon" },
  fiche: { libelle: "Fiche", bouton: "Préparer ma fiche" },
  controle: { libelle: "Contrôle", bouton: "Préparer mon contrôle" },
};

// Choix en cours (gardes si l'on revient sur l'ecran pendant la session)
const choix = { type: "lecon", matiere: null, toutesMatieres: false, theme: "", niveau: null, documents: new Set(), mode: "documents_et_recherche" };
let documents = [];
let enCours = false;

export async function ecranApprendre(typeDemande) {
  const p = etat.profil;
  if (typeDemande && TYPES[typeDemande]) choix.type = typeDemande;
  if (etat.preselection) {
    const pre = etat.preselection;
    etat.preselection = null;
    if (pre.type && TYPES[pre.type]) choix.type = pre.type;
    if (pre.matiere) choix.matiere = pre.matiere;
    if (pre.theme !== undefined) choix.theme = pre.theme;
    choix.documents.clear();
    for (const id of pre.documents ?? []) choix.documents.add(id);
  }
  if (choix.type === "controle" && !p.controles_actifs) choix.type = "lecon";
  if (!choix.niveau) choix.niveau = p.niveau;

  let matieres;
  try {
    matieres = await chargerMatieres();
    await chargerDocuments();
  } catch (e) {
    return ecranErreur("apprendre", "Impossible de charger la page", e.message);
  }
  if (!choix.matiere && matieres.length) choix.matiere = matieres[0].code;
  dessiner(matieres);
}

async function chargerDocuments() {
  const { data, error } = await etat.supabase
    .from("documents").select("id, nom, statut, chemin_stockage, type_fichier, date_creation")
    .eq("profil_id", etat.profil.id).order("date_creation", { ascending: false });
  if (error) throw error;
  documents = data ?? [];
  // On oublie les documents qui ont ete supprimes
  for (const id of [...choix.documents]) if (!documents.some((d) => d.id === id)) choix.documents.delete(id);
}

// ---------------------------------------------------------------------
// Dessin de l'ecran
// ---------------------------------------------------------------------

function dessiner(matieres) {
  const p = etat.profil;
  const types = Object.keys(TYPES).filter((t) => t !== "controle" || p.controles_actifs);

  const indexChoisie = matieres.findIndex((m) => m.code === choix.matiere);
  const visibles = choix.toutesMatieres || indexChoisie >= NB_MATIERES_VISIBLES
    ? matieres : matieres.slice(0, NB_MATIERES_VISIBLES);

  const html =
    entete("Nouvelle demande") +
    '<form id="formDemande" class="demande" novalidate>' +

    // 1. Type
    '<section class="bloc"><div class="question">1. Que voulez-vous ?</div>' +
    '<div class="choix-type">' +
    types.map((t) => '<button type="button" class="pastille-choix type-' + t + (choix.type === t ? " choisi" : "") +
      '" data-type="' + t + '" aria-pressed="' + (choix.type === t) + '">' + TYPES[t].libelle + "</button>").join("") +
    "</div></section>" +

    // 2. Matiere
    '<section class="bloc"><div class="question">2. Dans quelle matière ?</div>' +
    '<div class="choix-matiere">' +
    visibles.map((m) => '<button type="button" class="pastille-choix' + (choix.matiere === m.code ? " choisi" : "") +
      '" data-matiere="' + echapper(m.code) + '" aria-pressed="' + (choix.matiere === m.code) + '">' +
      echapper(m.libelle) + "</button>").join("") +
    (visibles.length < matieres.length
      ? '<button type="button" class="pastille-choix autres" id="btnAutres">Autres matières…</button>' : "") +
    "</div></section>" +

    // 3. Theme
    '<section class="bloc"><label class="question" for="txtTheme">3. Sur quel thème ?</label>' +
    '<input id="txtTheme" class="saisie" type="text" maxlength="300" value="' + echapper(choix.theme) + '" ' +
    'placeholder="ex. les fractions, Jeanne d\'Arc, la photosynthèse">' +
    '<div class="aide">Un épisode, un personnage, une notion… Facultatif si vous joignez votre cours.</div></section>' +

    // Niveau (parents seulement)
    (p.est_parent
      ? '<section class="bloc"><label class="question" for="cmbNiveau">Pour quel niveau ?</label>' +
        '<select id="cmbNiveau" class="saisie">' +
        NIVEAUX.map((n) => '<option value="' + n + '"' + (choix.niveau === n ? " selected" : "") + ">" +
          (n === "adulte" ? "Adulte" : n) + (n === p.niveau ? " (mon niveau)" : "") + "</option>").join("") +
        "</select></section>"
      : "") +

    // 4. Cours joints
    '<section class="bloc cours-joints"><div class="question">4. Joindre mon cours <span class="facultatif">(facultatif)</span></div>' +
    '<div class="boutons-cours">' +
    '<label class="bouton ocre">' + iconePhoto() + "Photo" +
    '<input type="file" id="filPhoto" accept="image/*" capture="environment" hidden></label>' +
    '<label class="bouton ocre">' + iconeFichier() + "Fichier" +
    '<input type="file" id="filFichier" accept="image/*,application/pdf" hidden></label>' +
    "</div>" +
    '<div class="aide">Photo d\'une page du manuel ou du cahier, ou fichier PDF (10 Mo maximum).</div>' +
    '<div id="lstDocuments">' + listeDocuments() + "</div>" +
    '<fieldset id="grpMode" class="mode-sources"' + (choix.documents.size ? "" : " hidden") + ">" +
    "<legend>Utiliser :</legend>" +
    '<label><input type="radio" name="mode" value="documents_seuls"' + (choix.mode === "documents_seuls" ? " checked" : "") + ">Seulement mon cours</label>" +
    '<label><input type="radio" name="mode" value="documents_et_recherche"' + (choix.mode === "documents_et_recherche" ? " checked" : "") + ">Mon cours + les recherches de l'application</label>" +
    "</fieldset></section>" +

    '<div class="message erreur" id="msgDemande" hidden></div>' +
    '<button type="submit" class="bouton plein large grand-bouton" id="btnPreparer">' + TYPES[choix.type].bouton + "</button>" +
    '<div class="aide centre">Environ une minute : rédaction, puis vérification par une seconde intelligence artificielle.</div>' +
    "</form>" +
    '<section id="secProgression" class="progression" hidden></section>';

  miseEnPage("apprendre", html);
  brancher(matieres);
}

function listeDocuments() {
  if (documents.length === 0) return "";
  return documents.map((d) => {
    const lu = d.statut === "lu";
    const etatTexte = lu ? "Lu" : d.statut === "erreur" ? "Lecture impossible" : "Lecture en cours…";
    return '<div class="document">' +
      '<input type="checkbox" id="doc_' + d.id + '" data-doc="' + d.id + '"' +
      (choix.documents.has(d.id) ? " checked" : "") + (lu ? "" : " disabled") + ">" +
      '<label for="doc_' + d.id + '"><span class="nom">' + echapper(d.nom) + "</span>" +
      '<span class="etat ' + (lu ? "ok" : d.statut === "erreur" ? "ko" : "") + '">' + etatTexte + "</span></label>" +
      '<button type="button" class="supprimer" data-supprimer="' + d.id + '" aria-label="Supprimer ' + echapper(d.nom) + '">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>' +
      "</div>";
  }).join("");
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

function brancher(matieres) {
  const $ = (id) => document.getElementById(id);
  const garderTheme = () => { choix.theme = $("txtTheme").value; };

  document.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => {
    garderTheme(); choix.type = b.dataset.type; dessiner(matieres);
  }));
  document.querySelectorAll("[data-matiere]").forEach((b) => b.addEventListener("click", () => {
    garderTheme(); choix.matiere = b.dataset.matiere; dessiner(matieres);
  }));
  $("btnAutres")?.addEventListener("click", () => { garderTheme(); choix.toutesMatieres = true; dessiner(matieres); });
  $("cmbNiveau")?.addEventListener("change", (e) => { choix.niveau = e.target.value; });
  document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", () => { choix.mode = r.value; }));

  brancherDocuments(matieres);

  $("filPhoto").addEventListener("change", (e) => envoyerDocument(e.target.files[0], matieres));
  $("filFichier").addEventListener("change", (e) => envoyerDocument(e.target.files[0], matieres));

  $("formDemande").addEventListener("submit", (e) => { e.preventDefault(); garderTheme(); preparer(matieres); });
}

function brancherDocuments(matieres) {
  document.querySelectorAll("[data-doc]").forEach((c) => c.addEventListener("change", () => {
    if (c.checked) choix.documents.add(c.dataset.doc); else choix.documents.delete(c.dataset.doc);
    document.getElementById("grpMode").hidden = choix.documents.size === 0;
  }));
  document.querySelectorAll("[data-supprimer]").forEach((b) => b.addEventListener("click", () =>
    supprimerDocument(b.dataset.supprimer, matieres)));
}

function rafraichirDocuments(matieres) {
  document.getElementById("lstDocuments").innerHTML = listeDocuments();
  document.getElementById("grpMode").hidden = choix.documents.size === 0;
  brancherDocuments(matieres);
}

function montrerErreur(texte) {
  const msg = document.getElementById("msgDemande");
  if (!msg) return;
  msg.textContent = texte;
  msg.hidden = !texte;
  if (texte) msg.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ---------------------------------------------------------------------
// Cours joints : envoi, lecture, suppression
// ---------------------------------------------------------------------

async function envoyerDocument(fichier, matieres) {
  if (!fichier) return;
  montrerErreur("");
  if (fichier.size > 10 * 1024 * 1024) return montrerErreur("Ce fichier dépasse 10 Mo. Choisissez un fichier plus léger.");

  const sb = etat.supabase;
  const matiere = matieres.find((m) => m.code === choix.matiere);
  const extension = (fichier.name.split(".").pop() || "jpg").toLowerCase();
  const chemin = etat.profil.id + "/" + crypto.randomUUID() + "." + extension;
  const nom = fichier.name || "photo." + extension;

  // Ligne provisoire pendant l'envoi
  const provisoire = { id: "envoi", nom, statut: "a_lire" };
  documents.unshift(provisoire);
  rafraichirDocuments(matieres);

  try {
    const { error: eEnvoi } = await sb.storage.from("documents").upload(chemin, fichier, { contentType: fichier.type });
    if (eEnvoi) throw eEnvoi;
    const { data: doc, error: eDoc } = await sb.from("documents").insert({
      profil_id: etat.profil.id,
      matiere_id: matiere ? matiere.id : null,
      nom,
      type_fichier: fichier.type,
      chemin_stockage: chemin,
      taille_octets: fichier.size,
    }).select("id").single();
    if (eDoc) throw eDoc;

    await chargerDocuments();
    rafraichirDocuments(matieres);

    await appelerFonction("lire-document", { document_id: doc.id });
    await chargerDocuments();
    if (documents.some((d) => d.id === doc.id && d.statut === "lu")) choix.documents.add(doc.id);
    rafraichirDocuments(matieres);
  } catch (e) {
    documents = documents.filter((d) => d.id !== "envoi");
    try { await chargerDocuments(); } catch (x) { /* rien */ }
    rafraichirDocuments(matieres);
    montrerErreur("Le cours n'a pas pu être lu : " + (e.message ?? e));
  }
}

async function supprimerDocument(id, matieres) {
  const doc = documents.find((d) => d.id === id);
  if (!doc) return;
  if (!confirm("Supprimer définitivement « " + doc.nom + " » ?")) return;
  const sb = etat.supabase;
  const { error: eFichier } = await sb.storage.from("documents").remove([doc.chemin_stockage]);
  const { error: eLigne } = await sb.from("documents").delete().eq("id", id);
  choix.documents.delete(id);
  await chargerDocuments();
  rafraichirDocuments(matieres);
  if (eFichier || eLigne) montrerErreur("La suppression a échoué : " + (eFichier || eLigne).message);
}

// ---------------------------------------------------------------------
// Generation : redaction puis relecture
// ---------------------------------------------------------------------

async function preparer(matieres) {
  if (enCours) return;
  const theme = choix.theme.trim();
  const docs = [...choix.documents];
  if (!choix.matiere) return montrerErreur("Choisissez une matière.");
  if (!theme && docs.length === 0) return montrerErreur("Indiquez un thème, ou joignez et cochez votre cours.");
  if (documents.some((d) => d.id === "envoi")) return montrerErreur("Patientez : votre cours est en cours d'envoi.");
  montrerErreur("");

  enCours = true;
  const type = choix.type;
  const form = document.getElementById("formDemande");
  const prog = document.getElementById("secProgression");
  form.hidden = true;
  prog.hidden = false;
  window.scrollTo(0, 0);

  const etapes = [
    { cle: "redaction", texte: "Rédaction" },
    { cle: "relecture", texte: "Vérification par une seconde IA" },
  ];
  const etatEtapes = { redaction: "en_cours", relecture: "a_venir" };
  const debut = Date.now();

  const dessinerProgression = () => {
    const secondes = Math.round((Date.now() - debut) / 1000);
    prog.innerHTML =
      '<h2 class="titre-main moyen">Préparation de votre ' +
      (type === "lecon" ? "leçon" : type === "fiche" ? "fiche" : "contrôle") + "…</h2>" +
      '<ol class="etapes">' + etapes.map((e) =>
        '<li class="' + etatEtapes[e.cle] + '"><span class="puce"></span>' + e.texte + "</li>").join("") + "</ol>" +
      '<div class="chrono">' + secondes + " s</div>" +
      '<p class="aide">Vous pouvez laisser l\'application ouverte pendant ce temps. Ne fermez pas cette page.</p>';
  };
  dessinerProgression();
  const minuteur = setInterval(dessinerProgression, 1000);

  try {
    const corps = {
      type,
      matiere_code: choix.matiere,
      theme,
      documents_ids: docs,
      mode_sources: docs.length ? choix.mode : "recherche",
    };
    if (etat.profil.est_parent && choix.niveau && choix.niveau !== etat.profil.niveau) corps.niveau = choix.niveau;

    const redige = await appelerFonction("generer-contenu", corps);
    etatEtapes.redaction = "fait";
    etatEtapes.relecture = "en_cours";
    dessinerProgression();

    let verifie = true;
    try {
      const relu = await appelerFonction("relire-contenu", { type: redige.type, id: redige.id });
      verifie = !!(relu.relecture && relu.relecture.effectuee);
    } catch (e) {
      verifie = false;
    }
    etatEtapes.relecture = verifie ? "fait" : "saute";
    dessinerProgression();

    clearInterval(minuteur);
    enCours = false;
    choix.theme = "";
    try { sessionStorage.setItem("gai-savoir-verifie-" + redige.id, verifie ? "1" : "0"); } catch (x) { /* rien */ }
    location.hash = "#/" + redige.type + "/" + redige.id;
  } catch (e) {
    clearInterval(minuteur);
    enCours = false;
    form.hidden = false;
    prog.hidden = true;
    montrerErreur("La préparation a échoué : " + e.message + " Réessayez dans un instant.");
  }
}
