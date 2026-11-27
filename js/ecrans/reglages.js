// =====================================================================
// Le Gai Savoir - Espace parents : reglages
// (famille et changement de classe, interrupteur Claude, auteurs,
//  exclusions, sources). Rien n'est supprime : on active / desactive.
// =====================================================================

import { echapper } from "../outils.js";
import { etat, miseEnPage, entete, ecranAttente, ecranErreur } from "../commun.js";

const NIVEAUX = ["CP", "CE1", "CE2", "CM1", "CM2", "6e", "5e", "4e", "3e", "2nde", "1re", "Tle", "adulte"];

let donnees = null;
let message = { texte: "", type: "info" };

async function charger() {
  const sb = etat.supabase;
  const famille = etat.profil.famille_id;
  const [rp, rf, ra, re, rs] = await Promise.all([
    sb.from("profils").select("id, prenom, niveau, est_parent, est_apprenant, controles_actifs, email, user_id, actif")
      .eq("famille_id", famille).order("date_creation"),
    sb.from("fournisseurs_ia").select("id, fournisseur, ordre_priorite, actif").eq("famille_id", famille).order("ordre_priorite"),
    sb.from("auteurs_reference").select("id, nom, actif").eq("famille_id", famille).order("nom"),
    sb.from("exclusions").select("id, type, valeur, actif").eq("famille_id", famille).order("valeur"),
    sb.from("sources_autorisees").select("id, domaine, actif").eq("famille_id", famille).order("domaine"),
  ]);
  for (const r of [rp, rf, ra, re, rs]) if (r.error) throw r.error;
  donnees = { profils: rp.data ?? [], ia: rf.data ?? [], auteurs: ra.data ?? [], exclusions: re.data ?? [], sources: rs.data ?? [] };
}

export async function ecranReglages() {
  if (!etat.profil.est_parent) return ecranErreur("accueil", "Accès réservé", "Les réglages sont réservés aux parents.");
  ecranAttente("parents");
  try {
    await charger();
  } catch (e) {
    return ecranErreur("parents", "Réglages indisponibles", e.message);
  }
  dessiner();
}

// ---------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------

function interrupteur(attributs, actif, libelle) {
  return '<label class="interrupteur"><input type="checkbox" ' + attributs + (actif ? " checked" : "") + ">" +
    '<span class="glissiere" aria-hidden="true"></span><span class="libelle-interrupteur">' + libelle + "</span></label>";
}

function dessiner(garderDefilement = false) {
  const d = donnees;
  const claude = d.ia.find((x) => x.fournisseur === "claude");

  const famille =
    '<section class="bloc-reglage"><h2>La famille</h2>' +
    '<p class="aide">Changez la classe d\'un enfant à la rentrée. S\'il redouble, ne changez rien : ses cours sont conservés.</p>' +
    d.profils.filter((p) => p.actif).map((p) =>
      '<div class="ligne-reglage membre">' +
      '<div class="texte"><b>' + echapper(p.prenom) + "</b>" +
      '<span class="details">' + (p.est_parent ? "Parent" : "Enfant") + (p.email ? " · " + echapper(p.email) : "") +
      (p.user_id ? "" : ' · <span class="a-terminer">compte pas encore créé</span>') + "</span></div>" +
      '<div class="commandes">' +
      '<select class="saisie petit" data-niveau="' + p.id + '" aria-label="Classe de ' + echapper(p.prenom) + '">' +
      NIVEAUX.map((n) => '<option value="' + n + '"' + (p.niveau === n ? " selected" : "") + ">" + (n === "adulte" ? "Adulte" : n) + "</option>").join("") +
      "</select>" +
      interrupteur('data-controles="' + p.id + '"', p.controles_actifs, "Contrôles") +
      "</div></div>").join("") +
    "</section>";

  const ia =
    '<section class="bloc-reglage"><h2>Intelligence artificielle</h2>' +
    (claude
      ? '<div class="ligne-reglage"><div class="texte"><b>Claude (payant)</b>' +
        '<span class="details">Vérifie les leçons, fiches et contrôles et corrige les copies. Sans lui, ces tâches sont faites par les IA gratuites, ' +
        "avec une qualité moindre. Coût estimé : environ 3 $ par mois pour la famille.</span></div>" +
        '<div class="commandes">' + interrupteur('data-ia="' + claude.id + '"', claude.actif, claude.actif ? "Allumé" : "Éteint") + "</div></div>"
      : '<p class="aide">La ligne « claude » est absente des réglages.</p>') +
    '<p class="aide">Rédaction (gratuite) : ' + d.ia.filter((x) => x.fournisseur !== "claude" && x.actif)
      .map((x) => echapper(x.fournisseur.charAt(0).toUpperCase() + x.fournisseur.slice(1))).join(", puis ") + ".</p>" +
    "</section>";

  const liste = (titre, aide, elements, attribut, libelle, ajoutHtml) =>
    '<section class="bloc-reglage"><h2>' + titre + "</h2>" +
    '<p class="aide">' + aide + "</p>" +
    '<div class="puces-reglage">' +
    (elements.length ? elements.map((x) =>
      '<label class="puce-reglage' + (x.actif ? "" : " inactive") + '"><input type="checkbox" ' + attribut + '="' + x.id + '"' +
      (x.actif ? " checked" : "") + "><span>" + echapper(libelle(x)) + "</span></label>").join("")
      : '<span class="aide">Aucun pour l\'instant.</span>') +
    "</div>" + ajoutHtml + "</section>";

  const auteurs = liste("Auteurs de référence",
    "Cités dans les leçons et fiches uniquement s'ils ont réellement écrit sur le sujet. Décochez pour ne plus les utiliser.",
    d.auteurs, "data-auteur", (x) => x.nom,
    '<form class="ajout-reglage" data-ajout="auteur"><input class="saisie petit" name="valeur" maxlength="100" placeholder="ex. Fernand Braudel" required>' +
    '<button class="bouton petit" type="submit">Ajouter</button></form>');

  const exclusions = liste("Exclusions",
    "Auteurs ou sites que l'application ne doit jamais citer ni utiliser.",
    d.exclusions, "data-exclusion", (x) => (x.type === "site" ? "Site : " : "") + x.valeur,
    '<form class="ajout-reglage" data-ajout="exclusion">' +
    '<select class="saisie petit" name="type"><option value="auteur">Auteur</option><option value="site">Site</option></select>' +
    '<input class="saisie petit" name="valeur" maxlength="100" placeholder="ex. un nom ou un site" required>' +
    '<button class="bouton petit" type="submit">Ajouter</button></form>');

  const sources = liste("Sites autorisés",
    "Sites sérieux sur lesquels les IA s'appuient. Si vous décochez fr.wikipedia.org, l'application n'utilise plus Wikipédia comme document de référence.",
    d.sources, "data-source", (x) => x.domaine,
    '<form class="ajout-reglage" data-ajout="source"><input class="saisie petit" name="valeur" maxlength="100" placeholder="ex. vie-publique.fr" required>' +
    '<button class="bouton petit" type="submit">Ajouter</button></form>');

  miseEnPage("parents",
    entete("Réglages", "#/parents") +
    (message.texte ? '<div class="message ' + message.type + '">' + echapper(message.texte) + "</div>" : "") +
    famille + ia + auteurs + exclusions + sources,
    { garderDefilement });
  message = { texte: "", type: "info" };
  brancher();
}

// ---------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------

function informer(texte, type = "info") {
  message = { texte, type };
}

async function maj(table, id, valeurs) {
  const { error } = await etat.supabase.from(table).update(valeurs).eq("id", id);
  if (error) informer("Modification impossible : " + error.message, "erreur");
  return !error;
}

function brancher() {
  const tous = (sel, fn) => document.querySelectorAll(sel).forEach(fn);

  tous("[data-niveau]", (s) => s.addEventListener("change", () => changerNiveau(s.dataset.niveau, s.value)));

  tous("[data-controles]", (c) => c.addEventListener("change", async () => {
    const p = donnees.profils.find((x) => x.id === c.dataset.controles);
    if (await maj("profils", p.id, { controles_actifs: c.checked })) {
      p.controles_actifs = c.checked;
      if (p.id === etat.profil.id) etat.profil.controles_actifs = c.checked;
      informer("Contrôles " + (c.checked ? "activés" : "désactivés") + " pour " + p.prenom + ".");
    }
    dessiner(true);
  }));

  tous("[data-ia]", (c) => c.addEventListener("change", async () => {
    const x = donnees.ia.find((i) => i.id === c.dataset.ia);
    if (c.checked && !confirm("Rallumer Claude ? Chaque vérification et chaque correction consommera un peu de votre crédit Anthropic.")) {
      c.checked = false; return;
    }
    if (await maj("fournisseurs_ia", x.id, { actif: c.checked })) {
      x.actif = c.checked;
      informer(c.checked ? "Claude est allumé : il vérifie et corrige." : "Claude est éteint : les IA gratuites prennent le relais.");
    }
    dessiner(true);
  }));

  const bascule = (attribut, table, cle) => tous("[" + attribut + "]", (c) => c.addEventListener("change", async () => {
    const x = donnees[cle].find((i) => i.id === c.getAttribute(attribut));
    if (await maj(table, x.id, { actif: c.checked })) x.actif = c.checked;
    dessiner(true);
  }));
  bascule("data-auteur", "auteurs_reference", "auteurs");
  bascule("data-exclusion", "exclusions", "exclusions");
  bascule("data-source", "sources_autorisees", "sources");

  tous("[data-ajout]", (f) => f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const valeur = f.valeur.value.trim();
    if (!valeur) return;
    const famille_id = etat.profil.famille_id;
    let r;
    if (f.dataset.ajout === "auteur") {
      r = await etat.supabase.from("auteurs_reference").insert({ famille_id, nom: valeur });
    } else if (f.dataset.ajout === "exclusion") {
      r = await etat.supabase.from("exclusions").insert({ famille_id, type: f.type.value, valeur });
    } else {
      const domaine = valeur.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
      r = await etat.supabase.from("sources_autorisees").insert({ famille_id, domaine });
    }
    if (r.error) informer("Ajout impossible : " + r.error.message, "erreur");
    else informer("« " + valeur + " » ajouté.");
    try { await charger(); } catch (e) { /* rien */ }
    dessiner(true);
  }));
}

// ---------------------------------------------------------------------
// Changement de classe, avec menage des cours joints
// ---------------------------------------------------------------------

async function changerNiveau(profilId, nouveau) {
  const p = donnees.profils.find((x) => x.id === profilId);
  const ancien = p.niveau;
  if (nouveau === ancien) return;
  const libelle = (n) => (n === "adulte" ? "Adulte" : n);

  if (!confirm(p.prenom + " passe de " + libelle(ancien) + " à " + libelle(nouveau) + ". Confirmer ?")) {
    return dessiner(true);
  }
  if (!(await maj("profils", p.id, { niveau: nouveau }))) return dessiner(true);
  p.niveau = nouveau;
  if (p.id === etat.profil.id) etat.profil.niveau = nouveau;
  informer("Classe de " + p.prenom + " : " + libelle(nouveau) + ".");

  // Menage : uniquement pour un enfant, et seulement si un parent le confirme
  if (!p.est_parent) {
    const { data: docs } = await etat.supabase.from("documents").select("id, chemin_stockage").eq("profil_id", p.id);
    const n = (docs ?? []).length;
    if (n > 0 && confirm("Nouvelle année : supprimer les " + n + " cours joints de " + p.prenom +
      " (photos et PDF de l'an dernier) ? Ses leçons, fiches et contrôles sont conservés.\n\nOK = supprimer · Annuler = garder")) {
      const { error: eF } = await etat.supabase.storage.from("documents").remove(docs.map((d) => d.chemin_stockage));
      const { error: eL } = await etat.supabase.from("documents").delete().in("id", docs.map((d) => d.id));
      if (eF || eL) informer("Classe changée, mais le ménage des cours a échoué : " + (eF || eL).message, "erreur");
      else informer("Classe de " + p.prenom + " : " + libelle(nouveau) + ". " + n + " cours joint" + (n > 1 ? "s" : "") + " supprimé" + (n > 1 ? "s" : "") + ".");
    }
  }
  dessiner(true);
}
