// =====================================================================
// Le Gai Savoir - ecran "Parcours" (historique, moyenne, notions a revoir)
// et donnees de l'accueil
// =====================================================================

import { echapper, icone } from "../outils.js";
import { etat, miseEnPage, chargerMatieres, ecranAttente, ecranErreur } from "../commun.js";

export const SEUIL_A_REVOIR = 60; // en %, en dessous une notion est "a revoir"

const TYPES = {
  lecon: { libelle: "Leçon", pluriel: "Leçons", icone: "lecon", classe: "lecon" },
  fiche: { libelle: "Fiche", pluriel: "Fiches", icone: "fiche", classe: "fiche" },
  controle: { libelle: "Contrôle", pluriel: "Contrôles", icone: "controle", classe: "controle" },
};

// Filtres gardes pendant la session
const filtres = { type: "tout", matiere: "" };

const nombre = (x) => String(Math.round(Number(x) * 10) / 10).replace(".", ",");

function dateRelative(iso) {
  const d = new Date(iso);
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  const jour = new Date(d); jour.setHours(0, 0, 0, 0);
  const ecart = Math.round((aujourdHui - jour) / 86400000);
  if (ecart === 0) return "aujourd'hui";
  if (ecart === 1) return "hier";
  if (ecart < 7) return "il y a " + ecart + " jours";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: ecart > 300 ? "numeric" : undefined });
}

// ---------------------------------------------------------------------
// Chargement des donnees du profil connecte
// ---------------------------------------------------------------------

export async function chargerParcours(profilId = etat.profil.id) {
  const sb = etat.supabase;
  const id = profilId;
  const matieres = await chargerMatieres();
  const parId = Object.fromEntries(matieres.map((m) => [m.id, m]));

  const [rl, rf, rc, rb] = await Promise.all([
    sb.from("lecons").select("id, matiere_id, theme, date_creation").eq("profil_id", id).eq("actif", true)
      .order("date_creation", { ascending: false }).limit(200),
    sb.from("fiches").select("id, matiere_id, theme, date_creation").eq("profil_id", id).eq("actif", true)
      .order("date_creation", { ascending: false }).limit(200),
    sb.from("controles").select("id, matiere_id, theme, statut, note_sur_20, date_debut, date_fin").eq("profil_id", id)
      .order("date_debut", { ascending: false }).limit(200),
    sb.rpc("bilan_notions", { p_profil: id }),
  ]);
  for (const r of [rl, rf, rc]) if (r.error) throw r.error;

  const elements = [
    ...(rl.data ?? []).map((x) => ({ type: "lecon", id: x.id, theme: x.theme, matiere: parId[x.matiere_id], date: x.date_creation })),
    ...(rf.data ?? []).map((x) => ({ type: "fiche", id: x.id, theme: x.theme, matiere: parId[x.matiere_id], date: x.date_creation })),
    ...(rc.data ?? []).map((x) => ({
      type: "controle", id: x.id, theme: x.theme, matiere: parId[x.matiere_id], date: x.date_fin || x.date_debut,
      statut: x.statut, note: x.note_sur_20,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const notes = (rc.data ?? []).filter((c) => c.statut === "termine" && c.note_sur_20 !== null).map((c) => Number(c.note_sur_20));
  const moyenne = notes.length ? notes.reduce((s, n) => s + n, 0) / notes.length : null;

  // Le bilan par notion est facultatif : si le script 08 n'a pas ete execute, on s'en passe
  const notions = rb.error ? null : (rb.data ?? []);
  const aRevoir = (notions ?? [])
    .filter((n) => Number(n.points_max) > 0 && n.taux < SEUIL_A_REVOIR)
    .sort((a, b) => a.taux - b.taux || new Date(b.dernier) - new Date(a.dernier));

  return { matieres, elements, moyenne, nbNotes: notes.length, notions, aRevoir };
}

// ---------------------------------------------------------------------
// Morceaux d'affichage reutilises par l'accueil
// ---------------------------------------------------------------------

export function ligneElement(e) {
  const t = TYPES[e.type];
  let droite = "";
  if (e.type === "controle") {
    droite = e.statut === "termine"
      ? '<span class="note-entouree">' + nombre(e.note) + "</span>"
      : '<span class="a-terminer">à terminer</span>';
  }
  return '<a class="element ' + t.classe + '" href="#/' + e.type + "/" + e.id + '">' +
    '<span class="pictogramme">' + icone(t.icone, 22) + "</span>" +
    '<span class="texte"><span class="titre">' + echapper(e.theme) + "</span>" +
    '<span class="details">' + t.libelle + " · " + echapper(e.matiere ? e.matiere.libelle : "") + " · " + dateRelative(e.date) + "</span></span>" +
    droite + "</a>";
}

export function ligneNotion(n, libelleBouton = "Réviser") {
  return '<div class="notion-a-revoir">' +
    '<div class="texte"><span class="titre">' + echapper(n.notion) + "</span>" +
    '<span class="details">' + echapper(n.matiere) + " · " + n.taux + " % de réussite</span>" +
    '<span class="barre"><span style="width:' + Math.max(3, Math.min(100, n.taux)) + '%"></span></span></div>' +
    '<button class="bouton petit" data-reviser="' + echapper(n.matiere_code) + '" data-notion="' + echapper(n.notion) + '">' + libelleBouton + "</button>" +
    "</div>";
}

// Bouton "Reviser" : ouvre une nouvelle demande pre-remplie
export function brancherReviser(niveau) {
  document.querySelectorAll("[data-reviser]").forEach((b) => b.addEventListener("click", () => {
    etat.preselection = {
      type: etat.profil.controles_actifs ? "controle" : "fiche",
      matiere: b.dataset.reviser,
      theme: b.dataset.notion,
      niveau,
    };
    location.hash = "#/apprendre";
  }));
}

// ---------------------------------------------------------------------
// Ecran "Parcours"
// ---------------------------------------------------------------------

export async function ecranParcours() {
  ecranAttente("parcours");
  let d;
  try {
    d = await chargerParcours();
  } catch (e) {
    return ecranErreur("parcours", "Parcours indisponible", e.message);
  }
  dessiner(d);
}

function dessiner(d, garderDefilement = false) {
  const compte = (type) => d.elements.filter((e) => e.type === type).length;
  const matieresUtilisees = d.matieres.filter((m) => d.elements.some((e) => e.matiere && e.matiere.id === m.id));
  if (filtres.matiere && !matieresUtilisees.some((m) => m.code === filtres.matiere)) filtres.matiere = "";

  const visibles = d.elements.filter((e) =>
    (filtres.type === "tout" || e.type === filtres.type) &&
    (!filtres.matiere || (e.matiere && e.matiere.code === filtres.matiere)));

  // Moyenne par matiere (controles corriges)
  const parMatiere = {};
  for (const e of d.elements) {
    if (e.type !== "controle" || e.statut !== "termine" || e.note === null || !e.matiere) continue;
    const m = parMatiere[e.matiere.code] ?? (parMatiere[e.matiere.code] = { libelle: e.matiere.libelle, total: 0, nb: 0 });
    m.total += Number(e.note); m.nb++;
  }
  const moyennes = Object.values(parMatiere).sort((a, b) => b.nb - a.nb);

  const stats =
    '<section class="stats">' +
    '<div class="stat controle"><span class="valeur">' + (d.moyenne === null ? "–" : nombre(d.moyenne)) + "</span>" +
    '<span class="libelle">moyenne sur 20' + (d.nbNotes ? " (" + d.nbNotes + " contrôle" + (d.nbNotes > 1 ? "s" : "") + ")" : "") + "</span></div>" +
    '<div class="stat lecon"><span class="valeur">' + compte("lecon") + '</span><span class="libelle">leçon' + (compte("lecon") > 1 ? "s" : "") + "</span></div>" +
    '<div class="stat fiche"><span class="valeur">' + compte("fiche") + '</span><span class="libelle">fiche' + (compte("fiche") > 1 ? "s" : "") + "</span></div>" +
    "</section>";

  const blocMoyennes = moyennes.length > 1
    ? '<section class="bloc-parcours"><h2>Moyenne par matière</h2><div class="moyennes">' +
      moyennes.map((m) => '<div class="moyenne-matiere"><span>' + echapper(m.libelle) + "</span>" +
        '<span class="barre"><span style="width:' + Math.round((m.total / m.nb) * 5) + '%"></span></span>' +
        "<b>" + nombre(m.total / m.nb) + "</b></div>").join("") + "</div></section>"
    : "";

  const blocNotions = d.notions === null
    ? ""
    : '<section class="bloc-parcours"><h2>Notions à revoir</h2>' +
      (d.aRevoir.length
        ? '<div class="liste-notions">' + d.aRevoir.slice(0, 8).map(ligneNotion).join("") + "</div>"
        : '<p class="aide">' + (d.nbNotes ? "Aucune pour l'instant : toutes vos notions dépassent " + SEUIL_A_REVOIR + " % de réussite. Bravo !"
          : "Elles apparaîtront après vos premiers contrôles.") + "</p>") +
      "</section>";

  const blocHistorique =
    '<section class="bloc-parcours"><h2>Historique</h2>' +
    '<div class="filtres">' +
    ["tout", "lecon", "fiche", "controle"].map((t) => '<button type="button" class="pastille-choix petit' + (filtres.type === t ? " choisi" : "") +
      '" data-filtre="' + t + '">' + (t === "tout" ? "Tout" : TYPES[t].pluriel) + "</button>").join("") +
    (matieresUtilisees.length > 1
      ? '<select id="cmbFiltreMatiere" class="saisie petit"><option value="">Toutes les matières</option>' +
        matieresUtilisees.map((m) => '<option value="' + echapper(m.code) + '"' + (filtres.matiere === m.code ? " selected" : "") + ">" +
          echapper(m.libelle) + "</option>").join("") + "</select>"
      : "") +
    "</div>" +
    (visibles.length
      ? '<div class="liste-elements">' + visibles.map(ligneElement).join("") + "</div>"
      : '<div class="carte pointillee">' + (d.elements.length
        ? "Rien ne correspond à ce filtre."
        : 'Vous n\'avez encore rien préparé. <a href="#/apprendre">Commencez par une leçon !</a>') + "</div>") +
    "</section>";

  miseEnPage("parcours",
    '<h1 class="titre-main grand">Mon parcours</h1>' + stats + blocNotions + blocMoyennes + blocHistorique,
    { garderDefilement });

  document.querySelectorAll("[data-filtre]").forEach((b) => b.addEventListener("click", () => {
    filtres.type = b.dataset.filtre; dessiner(d, true);
  }));
  document.getElementById("cmbFiltreMatiere")?.addEventListener("change", (e) => { filtres.matiere = e.target.value; dessiner(d, true); });
  brancherReviser();
}
