// =====================================================================
// Le Gai Savoir - ecran "Controle" : copie, correction, corrige
// =====================================================================

import { echapper } from "../outils.js";
import {
  etat, miseEnPage, entete, figure, libelleMatiere, libelleNiveau, dateCourte,
  appelerFonction, ecranAttente, ecranErreur,
} from "../commun.js";

// Corriges recus pendant la session (la bonne reponse n'est pas lisible ensuite)
const corrigesRecus = {};

const nombre = (x) => String(Math.round(Number(x) * 100) / 100).replace(".", ",");

function cleBrouillon(id) { return "gai-savoir-brouillon-" + id; }
function lireBrouillon(id) {
  try { return JSON.parse(localStorage.getItem(cleBrouillon(id)) || "{}"); } catch (e) { return {}; }
}
function ecrireBrouillon(id, valeurs) {
  try { localStorage.setItem(cleBrouillon(id), JSON.stringify(valeurs)); } catch (e) { /* rien */ }
}
function effacerBrouillon(id) {
  try { localStorage.removeItem(cleBrouillon(id)); } catch (e) { /* rien */ }
}

const ICONE_IMPRIMER =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg>';

export async function ecranControle(id) {
  ecranAttente("apprendre");
  const sb = etat.supabase;
  const { data: c, error } = await sb
    .from("controles").select("id, profil_id, matiere_id, theme, niveau, statut, note_sur_20, date_debut, date_fin")
    .eq("id", id).maybeSingle();
  if (error || !c) return ecranErreur("apprendre", "Contrôle introuvable", error ? error.message : "Ce contrôle n'existe pas ou ne vous est pas accessible.");

  const { data: questions, error: eq } = await sb
    .from("questions").select("id, ordre, type, enonce, choix, points, illustration")
    .eq("controle_id", id).order("ordre");
  if (eq) return ecranErreur("apprendre", "Questions introuvables", eq.message);

  const matiere = await libelleMatiere(c.matiere_id);
  const enTete =
    '<div class="meta">' + echapper(matiere) + " · " + echapper(libelleNiveau(c.niveau)) + " · " + dateCourte(c.date_debut) + "</div>" +
    '<h1 class="titre-main grand">' + echapper(c.theme) + "</h1>";

  if (c.statut === "termine") {
    if (corrigesRecus[id]) return afficherCorrection(c, enTete, corrigesRecus[id]);
    // Corrige complet lu sur le serveur (fonction corrige_controle, script 08)
    const { data: corrections, error: ecor } = await sb.rpc("corrige_controle", { p_controle: id });
    if (!ecor && Array.isArray(corrections)) {
      return afficherCorrection(c, enTete, {
        note_sur_20: c.note_sur_20,
        corrections,
        bilan_par_notion: calculerBilan(corrections),
      }, "#/parcours");
    }
    return afficherCopieCorrigeeEnregistree(c, enTete, questions ?? []);
  }
  return afficherCopie(c, enTete, questions ?? [], c.profil_id !== etat.profil.id);
}

// ---------------------------------------------------------------------
// La copie a remplir
// ---------------------------------------------------------------------

function verificationNonFaite(id) {
  let v = "1";
  try { v = sessionStorage.getItem("gai-savoir-verifie-" + id) ?? "1"; } catch (e) { /* rien */ }
  return v === "0";
}

function afficherCopie(c, enTete, questions, lectureSeule = false) {
  const brouillon = lectureSeule ? {} : lireBrouillon(c.id);

  const html =
    entete("Contrôle", "#/apprendre") +
    '<article class="document-imprimable controle">' +
    enTete +
    '<div class="bandeau-note">Noté sur 20 · ' + questions.length + " questions</div>" +
    (verificationNonFaite(c.id)
      ? '<div class="message info ne-pas-imprimer">La vérification par une seconde IA n\'a pas pu être faite : ce sujet n\'a pas été relu.</div>'
      : "") +
    '<form id="formCopie" novalidate>' +
    questions.map((q) => {
      let zone = "";
      if (q.type === "qcm") {
        zone = '<div class="choix-qcm">' + (q.choix ?? []).map((ch, i) =>
          '<label class="choix"><input type="radio" name="q_' + q.id + '" value="' + echapper(ch) + '"' +
          (brouillon[q.id] === ch ? " checked" : "") + '><span>' + echapper(ch) + "</span></label>").join("") + "</div>";
      } else {
        zone = '<textarea class="reponse-redigee" id="q_' + q.id + '" rows="6" placeholder="Votre réponse…">' +
          echapper(brouillon[q.id] ?? "") + "</textarea>";
      }
      return '<section class="question-controle">' +
        '<div class="entete-question"><span class="numero">' + q.ordre + ".</span>" +
        '<span class="points">' + nombre(q.points) + " pt" + (Number(q.points) > 1 ? "s" : "") + "</span></div>" +
        '<p class="enonce">' + echapper(q.enonce) + "</p>" +
        figure(q.illustration) + zone + "</section>";
    }).join("") +
    '<div class="message erreur" id="msgCopie" hidden></div>' +
    '<div class="barre-actions ne-pas-imprimer">' +
    (lectureSeule
      ? '<div class="message info">Ce contrôle n\'a pas encore été rendu : vous voyez le sujet, sans les réponses.</div>'
      : '<button type="submit" class="bouton plein grand-bouton rouge-plein" id="btnRendre">Rendre ma copie</button>') +
    '<button type="button" class="bouton" data-action="imprimer">' + ICONE_IMPRIMER + "Imprimer le sujet</button>" +
    "</div>" +
    "</form></article>" +
    '<section id="secCorrection" class="progression" hidden></section>';

  miseEnPage("apprendre", html);

  document.querySelector('[data-action="imprimer"]').addEventListener("click", () => window.print());
  if (lectureSeule) {
    document.querySelectorAll("#formCopie input, #formCopie textarea").forEach((el) => { el.disabled = true; });
    return;
  }

  // Brouillon : les reponses sont gardees si l'on quitte la page
  const sauver = () => ecrireBrouillon(c.id, lireReponses(questions));
  document.getElementById("formCopie").addEventListener("input", sauver);
  document.getElementById("formCopie").addEventListener("change", sauver);
  document.getElementById("formCopie").addEventListener("submit", (e) => { e.preventDefault(); rendre(c, enTete, questions); });
}

function lireReponses(questions) {
  const valeurs = {};
  for (const q of questions) {
    if (q.type === "qcm") {
      const coche = document.querySelector('input[name="q_' + q.id + '"]:checked');
      valeurs[q.id] = coche ? coche.value : "";
    } else {
      const zone = document.getElementById("q_" + q.id);
      valeurs[q.id] = zone ? zone.value : "";
    }
  }
  return valeurs;
}

async function rendre(c, enTete, questions) {
  const valeurs = lireReponses(questions);
  const vides = questions.filter((q) => !String(valeurs[q.id] ?? "").trim()).length;
  if (vides > 0 && !confirm(vides === 1
    ? "Une question est sans réponse. Rendre quand même votre copie ?"
    : vides + " questions sont sans réponse. Rendre quand même votre copie ?")) return;

  const form = document.getElementById("formCopie");
  const sec = document.getElementById("secCorrection");
  form.closest("article").hidden = true;
  sec.hidden = false;
  window.scrollTo(0, 0);
  const debut = Date.now();
  const dessiner = () => {
    sec.innerHTML = '<h2 class="titre-main moyen">Correction en cours…</h2>' +
      '<div class="chrono">' + Math.round((Date.now() - debut) / 1000) + " s</div>" +
      '<p class="aide">Le professeur relit votre copie. Ne fermez pas cette page.</p>';
  };
  dessiner();
  const minuteur = setInterval(dessiner, 1000);

  try {
    const resultat = await appelerFonction("corriger-controle", {
      controle_id: c.id,
      reponses: questions.map((q) => ({ question_id: q.id, reponse: valeurs[q.id] ?? "" })),
    });
    clearInterval(minuteur);
    effacerBrouillon(c.id);
    corrigesRecus[c.id] = resultat;
    afficherCorrection({ ...c, statut: "termine", note_sur_20: resultat.note_sur_20 }, enTete, resultat);
  } catch (e) {
    clearInterval(minuteur);
    sec.hidden = true;
    form.closest("article").hidden = false;
    const msg = document.getElementById("msgCopie");
    msg.textContent = "La correction a échoué : " + e.message + " Vos réponses sont conservées, réessayez dans un instant.";
    msg.hidden = false;
    msg.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// ---------------------------------------------------------------------
// La copie corrigee (juste apres la correction : avec le corrige complet)
// ---------------------------------------------------------------------

function classeNote(obtenus, max) {
  if (max <= 0) return "";
  const taux = obtenus / max;
  return taux >= 0.75 ? "bien" : taux >= 0.4 ? "moyen" : "faible";
}

// Le corrige "ESSENTIEL / BONUS" est un texte : on le met en forme simplement
function corrigeHtml(texte) {
  const lignes = String(texte ?? "").split("\n")
    .filter((l) => !/^Question not[eé]e sur/i.test(l.trim()))
    .map((l) => l.trim()).filter(Boolean);
  return lignes.map((l) => {
    if (/^(ESSENTIEL|BONUS|BAR[EÈ]ME)\b/i.test(l)) return '<div class="corrige-titre">' + echapper(l.replace(/[*#]/g, "")) + "</div>";
    if (/^[-•*]\s*/.test(l)) return '<div class="corrige-ligne">• ' + echapper(l.replace(/^[-•*]\s*/, "")) + "</div>";
    return '<div class="corrige-ligne">' + echapper(l) + "</div>";
  }).join("");
}

function bilanHtml(bilan) {
  const lignes = (Array.isArray(bilan) ? bilan : []).filter((b) => b.points_max > 0);
  if (!lignes.length) return "";
  return '<section class="rubrique bilan"><h2>Bilan par notion</h2>' +
    lignes.map((b) => '<div class="ligne-bilan ' + classeNote(b.points_obtenus, b.points_max) + '">' +
      '<span class="notion">' + echapper(b.notion) + "</span>" +
      '<span class="barre"><span style="width:' + Math.max(0, Math.min(100, b.taux_reussite)) + '%"></span></span>' +
      '<span class="score">' + nombre(b.points_obtenus) + " / " + nombre(b.points_max) + "</span></div>").join("") +
    "</section>";
}

function calculerBilan(corrections) {
  const bilan = {};
  for (const q of corrections) {
    const n = q.notion || "Sans notion";
    const b = bilan[n] ?? (bilan[n] = { notion: n, points_obtenus: 0, points_max: 0 });
    b.points_obtenus += Number(q.points_obtenus ?? 0);
    b.points_max += Number(q.points ?? 0);
  }
  return Object.values(bilan).map((b) => ({ ...b, taux_reussite: b.points_max ? Math.round((b.points_obtenus / b.points_max) * 100) : 0 }));
}

function afficherCorrection(c, enTete, r, retour = "#/apprendre") {
  const corrections = Array.isArray(r.corrections) ? r.corrections : [];
  miseEnPage("apprendre",
    entete("Contrôle corrigé", retour) +
    '<article class="document-imprimable controle copie-corrigee">' +
    enTete +
    '<div class="note-finale">' + nombre(r.note_sur_20) + "<span> / 20</span></div>" +
    bilanHtml(r.bilan_par_notion) +
    corrections.map((q) => {
      const ok = classeNote(q.points_obtenus, q.points);
      return '<section class="question-controle corrigee ' + ok + '">' +
        '<div class="entete-question"><span class="numero">' + q.ordre + ".</span>" +
        '<span class="points obtenus">' + nombre(q.points_obtenus) + " / " + nombre(q.points) + "</span></div>" +
        '<p class="enonce">' + echapper(q.enonce) + "</p>" +
        figure(q.illustration) +
        '<div class="votre-reponse"><b>Votre réponse :</b> ' +
        (String(q.reponse_donnee ?? "").trim() ? echapper(q.reponse_donnee) : "<i>pas de réponse</i>") + "</div>" +
        (q.justification ? '<div class="remarque-prof">' + echapper(q.justification) + "</div>" : "") +
        '<div class="corrige"><div class="corrige-entete">' + (q.type === "qcm" ? "Bonne réponse" : "Corrigé") + "</div>" +
        (q.type === "qcm" ? '<div class="corrige-ligne">' + echapper(q.bonne_reponse) + "</div>" : corrigeHtml(q.bonne_reponse)) +
        "</div></section>";
    }).join("") +
    "</article>" +
    '<div class="barre-actions ne-pas-imprimer">' +
    '<button class="bouton" data-action="imprimer">' + ICONE_IMPRIMER + "Imprimer la copie corrigée</button>" +
    '<a class="bouton" href="#/apprendre/controle">Nouveau contrôle</a></div>');
  document.querySelector('[data-action="imprimer"]').addEventListener("click", () => window.print());
}

// ---------------------------------------------------------------------
// Un controle deja corrige, rouvert plus tard (sans le corrige complet)
// ---------------------------------------------------------------------

async function afficherCopieCorrigeeEnregistree(c, enTete, questions) {
  const { data: reponses } = await etat.supabase
    .from("reponses").select("question_id, reponse_donnee, points_obtenus, justification_correction")
    .in("question_id", questions.map((q) => q.id));
  const parQuestion = {};
  for (const r of reponses ?? []) parQuestion[r.question_id] = r;

  miseEnPage("apprendre",
    entete("Contrôle corrigé", "#/parcours") +
    '<article class="document-imprimable controle copie-corrigee">' +
    enTete +
    '<div class="note-finale">' + nombre(c.note_sur_20) + "<span> / 20</span></div>" +
    questions.map((q) => {
      const r = parQuestion[q.id] ?? {};
      return '<section class="question-controle corrigee ' + classeNote(Number(r.points_obtenus ?? 0), Number(q.points)) + '">' +
        '<div class="entete-question"><span class="numero">' + q.ordre + ".</span>" +
        '<span class="points obtenus">' + nombre(r.points_obtenus ?? 0) + " / " + nombre(q.points) + "</span></div>" +
        '<p class="enonce">' + echapper(q.enonce) + "</p>" +
        '<div class="votre-reponse"><b>Votre réponse :</b> ' +
        (String(r.reponse_donnee ?? "").trim() ? echapper(r.reponse_donnee) : "<i>pas de réponse</i>") + "</div>" +
        (r.justification_correction ? '<div class="remarque-prof">' + echapper(r.justification_correction) + "</div>" : "") +
        "</section>";
    }).join("") +
    "</article>" +
    '<div class="barre-actions ne-pas-imprimer">' +
    '<button class="bouton" data-action="imprimer">' + ICONE_IMPRIMER + "Imprimer la copie corrigée</button></div>");
  document.querySelector('[data-action="imprimer"]').addEventListener("click", () => window.print());
}
