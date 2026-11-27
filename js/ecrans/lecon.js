// =====================================================================
// Le Gai Savoir - ecrans "Lecon" et "Fiche de revision" (imprimables)
// =====================================================================

import { echapper } from "../outils.js";
import {
  etat, miseEnPage, entete, markdown, figure, blocSources, libelleMatiere, libelleNiveau,
  dateCourte, ecranAttente, ecranErreur,
} from "../commun.js";

function avertissementVerification(id) {
  let verifie = "1";
  try { verifie = sessionStorage.getItem("gai-savoir-verifie-" + id) ?? "1"; } catch (e) { /* rien */ }
  return verifie === "0"
    ? '<div class="message info ne-pas-imprimer">La vérification par une seconde IA n\'a pas pu être faite : ' +
      "ce contenu n'a pas été relu.</div>"
    : "";
}

function barreActions() {
  return '<div class="barre-actions ne-pas-imprimer">' +
    '<button class="bouton" data-action="imprimer">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg>Imprimer</button>' +
    '<a class="bouton" href="#/apprendre">Nouvelle demande</a></div>';
}

function brancherImpression() {
  document.querySelectorAll('[data-action="imprimer"]').forEach((b) => b.addEventListener("click", () => window.print()));
}

// ---------------------------------------------------------------------
// Lecon
// ---------------------------------------------------------------------

export async function ecranLecon(id) {
  ecranAttente("apprendre");
  const { data: l, error } = await etat.supabase
    .from("lecons").select("id, matiere_id, theme, niveau, contenu, sources, illustrations, date_creation")
    .eq("id", id).maybeSingle();
  if (error || !l) return ecranErreur("apprendre", "Leçon introuvable", error ? error.message : "Cette leçon n'existe pas ou ne vous est pas accessible.");

  const matiere = await libelleMatiere(l.matiere_id);
  // Le titre est la premiere ligne "# ..." du contenu
  let contenu = String(l.contenu ?? "");
  let titre = l.theme;
  const m = contenu.match(/^#\s+(.+)\n/);
  if (m) { titre = m[1].trim(); contenu = contenu.slice(m[0].length); }

  const illustrations = Array.isArray(l.illustrations) ? l.illustrations : [];

  miseEnPage("apprendre",
    entete("Leçon", "#/apprendre") +
    '<article class="document-imprimable lecon">' +
    '<div class="meta">' + echapper(matiere) + " · " + echapper(libelleNiveau(l.niveau)) + " · " + dateCourte(l.date_creation) + "</div>" +
    '<h1 class="titre-main grand">' + echapper(titre) + "</h1>" +
    avertissementVerification(l.id) +
    (illustrations.length ? '<div class="illustrations">' + illustrations.map(figure).join("") + "</div>" : "") +
    '<div class="texte-cours">' + markdown(contenu) + "</div>" +
    blocSources(l.sources) +
    "</article>" +
    barreActions());
  brancherImpression();
}

// ---------------------------------------------------------------------
// Fiche de revision
// ---------------------------------------------------------------------

const liste = (x) => (Array.isArray(x) ? x.filter((e) => e !== null && e !== undefined && e !== "") : []);

export async function ecranFiche(id) {
  ecranAttente("apprendre");
  const { data: f, error } = await etat.supabase
    .from("fiches").select("id, matiere_id, theme, niveau, contenu, sources, illustrations, date_creation")
    .eq("id", id).maybeSingle();
  if (error || !f) return ecranErreur("apprendre", "Fiche introuvable", error ? error.message : "Cette fiche n'existe pas ou ne vous est pas accessible.");

  const matiere = await libelleMatiere(f.matiere_id);
  const c = f.contenu ?? {};
  const illustrations = liste(f.illustrations).length ? liste(f.illustrations) : liste(c.illustrations);
  const sources = liste(f.sources).length ? f.sources : c.sources;

  let corps = "";

  if (liste(c.notions_cles).length) {
    corps += '<section class="rubrique"><h2>Notions clés</h2><ul class="notions">' +
      liste(c.notions_cles).map((n) => "<li>" + echapper(n) + "</li>").join("") + "</ul></section>";
  }

  if (liste(c.reperes).length) {
    corps += '<section class="rubrique"><h2>Repères</h2><dl class="reperes">' +
      liste(c.reperes).map((r) => "<dt>" + echapper(r.repere) + "</dt><dd>" + echapper(r.explication) + "</dd>").join("") +
      "</dl></section>";
  }

  for (const t of liste(c.tableaux)) {
    const colonnes = liste(t.colonnes);
    corps += '<section class="rubrique"><h2>' + echapper(t.titre || "Tableau") + '</h2><div class="tableau-defile"><table>' +
      (colonnes.length ? "<thead><tr>" + colonnes.map((x) => "<th>" + echapper(x) + "</th>").join("") + "</tr></thead>" : "") +
      "<tbody>" + liste(t.lignes).map((ligne) =>
        "<tr>" + (Array.isArray(ligne) ? ligne : [ligne]).map((x) => "<td>" + echapper(x) + "</td>").join("") + "</tr>").join("") +
      "</tbody></table></div></section>";
  }

  if (liste(c.exemples).length) {
    corps += '<section class="rubrique"><h2>Exemples</h2><ul class="exemples">' +
      liste(c.exemples).map((e) => "<li><b>" + echapper(e.exemple) + "</b>" +
        (e.explication ? "<br><span>" + echapper(e.explication) + "</span>" : "") + "</li>").join("") + "</ul></section>";
  }

  if (liste(c.auteurs).length) {
    corps += '<section class="rubrique"><h2>Auteurs et œuvres</h2><ul class="exemples">' +
      liste(c.auteurs).map((a) => "<li><b>" + echapper(a.nom) + "</b>" + (a.oeuvre ? ", <i>" + echapper(a.oeuvre) + "</i>" : "") +
        (a.apport ? "<br><span>" + echapper(a.apport) + "</span>" : "") + "</li>").join("") + "</ul></section>";
  }

  if (c.schema && String(c.schema).trim()) {
    corps += '<section class="rubrique"><h2>Schéma</h2><pre class="schema">' + echapper(c.schema) + "</pre></section>";
  }

  if (c.a_retenir && String(c.a_retenir).trim()) {
    corps += '<section class="post-it"><h2>À retenir</h2><p>' + echapper(c.a_retenir) + "</p></section>";
  }

  if (liste(c.questions_autocontrole).length) {
    corps += '<section class="rubrique"><h2>Pour vérifier que vous savez</h2><ol class="autocontrole">' +
      liste(c.questions_autocontrole).map((q) => "<li>" + echapper(q) + "</li>").join("") + "</ol></section>";
  }

  miseEnPage("apprendre",
    entete("Fiche de révision", "#/apprendre") +
    '<article class="document-imprimable fiche">' +
    '<div class="meta">' + echapper(matiere) + " · " + echapper(libelleNiveau(f.niveau)) + " · " + dateCourte(f.date_creation) + "</div>" +
    '<h1 class="titre-main grand">' + echapper(c.titre || f.theme) + "</h1>" +
    avertissementVerification(f.id) +
    (illustrations.length ? '<div class="illustrations">' + illustrations.map(figure).join("") + "</div>" : "") +
    corps +
    blocSources(sources) +
    "</article>" +
    barreActions());
  brancherImpression();
}
