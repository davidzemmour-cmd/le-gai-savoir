// =====================================================================
// Le Gai Savoir - Espace parents : tableau de bord par membre de la famille
// =====================================================================

import { echapper } from "../outils.js";
import { etat, miseEnPage, ecranAttente, ecranErreur, libelleNiveau } from "../commun.js";
import { chargerParcours, ligneElement, ligneNotion, brancherReviser } from "./parcours.js";

let membres = [];
let choisi = null; // id du profil affiche

const nombre = (x) => String(Math.round(Number(x) * 10) / 10).replace(".", ",");

function depuis(iso) {
  if (!iso) return "jamais";
  const minutes = Math.round((Date.now() - new Date(iso)) / 60000);
  if (minutes < 60) return "il y a " + Math.max(1, minutes) + " min";
  const heures = Math.round(minutes / 60);
  if (heures < 24) return "il y a " + heures + " h";
  const jours = Math.round(heures / 24);
  return jours === 1 ? "hier" : "il y a " + jours + " jours";
}

export async function ecranParents() {
  if (!etat.profil.est_parent) return ecranErreur("accueil", "Accès réservé", "Cet espace est réservé aux parents.");
  ecranAttente("parents");
  const { data, error } = await etat.supabase
    .from("profils").select("id, prenom, niveau, est_parent, est_apprenant, controles_actifs, user_id, actif")
    .eq("famille_id", etat.profil.famille_id).eq("actif", true).order("date_creation");
  if (error) return ecranErreur("parents", "Espace parents indisponible", error.message);

  // Les enfants d'abord, puis les adultes (moi en dernier)
  membres = (data ?? []).filter((m) => m.est_apprenant)
    .sort((a, b) => (a.est_parent - b.est_parent) || ((a.id === etat.profil.id) - (b.id === etat.profil.id)));
  if (!choisi || !membres.some((m) => m.id === choisi)) choisi = membres[0]?.id ?? null;
  await afficherMembre();
}

async function afficherMembre() {
  const m = membres.find((x) => x.id === choisi);
  const onglets =
    '<div class="onglets-membres" role="tablist">' +
    membres.map((x) => '<button type="button" role="tab" class="onglet-membre' + (x.id === choisi ? " actif" : "") +
      '" aria-selected="' + (x.id === choisi) + '" data-membre="' + x.id + '">' +
      '<span class="pastille">' + echapper(x.prenom.charAt(0).toUpperCase()) + "</span>" + echapper(x.prenom) + "</button>").join("") +
    "</div>";

  const titre = '<h1 class="titre-main grand">Espace parents</h1>';
  if (!m) {
    miseEnPage("parents", titre + '<div class="carte pointillee">Aucun membre apprenant dans la famille.</div>');
    return;
  }

  miseEnPage("parents", titre + onglets + '<div class="attente">Chargement…</div>', { garderDefilement: true });
  brancherOnglets();

  let d;
  try {
    d = await chargerParcours(m.id);
  } catch (e) {
    return ecranErreur("parents", "Données indisponibles", e.message);
  }
  if (choisi !== m.id) return; // un autre onglet a ete choisi entre-temps

  // Semaine en cours (7 derniers jours)
  const ilYa7Jours = Date.now() - 7 * 86400000;
  const semaine = d.elements.filter((e) => new Date(e.date).getTime() >= ilYa7Jours);
  const notesSemaine = semaine.filter((e) => e.type === "controle" && e.statut === "termine" && e.note !== null).map((e) => Number(e.note));
  const moyenneSemaine = notesSemaine.length ? notesSemaine.reduce((s, n) => s + n, 0) / notesSemaine.length : null;
  const derniere = d.elements[0]?.date ?? null;

  // Moyenne par matiere
  const parMatiere = {};
  for (const e of d.elements) {
    if (e.type !== "controle" || e.statut !== "termine" || e.note === null || !e.matiere) continue;
    const x = parMatiere[e.matiere.code] ?? (parMatiere[e.matiere.code] = { libelle: e.matiere.libelle, total: 0, nb: 0 });
    x.total += Number(e.note); x.nb++;
  }
  const moyennes = Object.values(parMatiere).sort((a, b) => (a.total / a.nb) - (b.total / b.nb));

  const controles = d.elements.filter((e) => e.type === "controle");
  const autres = d.elements.filter((e) => e.type !== "controle");
  const estMoi = m.id === etat.profil.id;

  const html =
    titre + onglets +
    '<section class="carte-membre">' +
    '<div class="identite"><b>' + echapper(m.prenom) + "</b> · " + echapper(m.niveau === "adulte" ? "Adulte" : "Classe de " + m.niveau) +
    (m.controles_actifs ? "" : " · contrôles désactivés") +
    (m.user_id ? "" : ' · <span class="a-terminer">compte pas encore créé</span>') + "</div>" +
    '<div class="aide">Dernière activité : ' + depuis(derniere) + "</div>" +
    "</section>" +

    '<section class="stats">' +
    '<div class="stat lecon"><span class="valeur">' + semaine.length + '</span><span class="libelle">' + (semaine.length > 1 ? "travaux" : "travail") + " cette semaine</span></div>" +
    '<div class="stat controle"><span class="valeur">' + (moyenneSemaine === null ? "–" : nombre(moyenneSemaine)) + '</span><span class="libelle">moyenne de la semaine</span></div>' +
    '<div class="stat fiche"><span class="valeur">' + (d.moyenne === null ? "–" : nombre(d.moyenne)) + '</span><span class="libelle">moyenne générale</span></div>' +
    "</section>" +

    (moyennes.length
      ? '<section class="bloc-parcours"><h2>Moyenne par matière</h2><div class="moyennes">' +
        moyennes.map((x) => '<div class="moyenne-matiere' + (x.total / x.nb < 10 ? " faible" : "") + '"><span>' + echapper(x.libelle) +
          ' <small>(' + x.nb + ")</small></span>" +
          '<span class="barre"><span style="width:' + Math.round((x.total / x.nb) * 5) + '%"></span></span>' +
          "<b>" + nombre(x.total / x.nb) + "</b></div>").join("") + "</div></section>"
      : "") +

    (d.notions !== null
      ? '<section class="bloc-parcours"><h2>Notions à revoir</h2>' +
        (d.aRevoir.length
          ? '<div class="liste-notions">' + d.aRevoir.slice(0, 8).map((n) => ligneNotion(n, estMoi ? "Réviser" : "Préparer")).join("") + "</div>" +
            (estMoi ? "" : '<p class="aide">« Préparer » crée un contrôle au niveau ' + echapper(libelleNiveau(m.niveau)) +
              " dans votre propre espace : imprimez le sujet pour " + echapper(m.prenom) + ".</p>")
          : '<p class="aide">Aucune notion sous 60 % de réussite.</p>') +
        "</section>"
      : "") +

    '<section class="bloc-parcours"><h2>Contrôles</h2>' +
    (controles.length ? '<div class="liste-elements">' + controles.slice(0, 15).map(ligneElement).join("") + "</div>"
      : '<p class="aide">Aucun contrôle pour l\'instant.</p>') + "</section>" +

    '<section class="bloc-parcours"><h2>Leçons et fiches</h2>' +
    (autres.length ? '<div class="liste-elements">' + autres.slice(0, 15).map(ligneElement).join("") + "</div>"
      : '<p class="aide">Aucune leçon ni fiche pour l\'instant.</p>') + "</section>";

  miseEnPage("parents", html, { garderDefilement: true });
  brancherOnglets();
  brancherReviser(estMoi ? undefined : m.niveau);
}

function brancherOnglets() {
  document.querySelectorAll("[data-membre]").forEach((b) => b.addEventListener("click", () => {
    if (choisi === b.dataset.membre) return;
    choisi = b.dataset.membre;
    afficherMembre();
  }));
}
