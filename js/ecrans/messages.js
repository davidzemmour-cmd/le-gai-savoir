// =====================================================================
// Le Gai Savoir - Messagerie familiale
// #/messages            : liste des conversations
// #/messages/<cle>      : une conversation ("famille" ou "<idA>_<idB>")
// =====================================================================

import { echapper, icone } from "../outils.js";
import {
  etat, miseEnPage, entete, ecranAttente, ecranErreur,
  cleConversation, majNonLus, marquerLu, inviterMembre,
} from "../commun.js";

const TYPES_LIEN = { lecon: "Leçon", fiche: "Fiche", controle: "Contrôle" };
let membres = [];

async function chargerMembres() {
  const { data, error } = await etat.supabase
    .from("profils").select("id, prenom, est_parent, user_id")
    .eq("famille_id", etat.profil.famille_id).eq("actif", true).order("date_creation");
  if (error) throw error;
  membres = data ?? [];
}

const prenom = (id) => (membres.find((m) => m.id === id) || {}).prenom || "?";

function heure(iso) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function jour(iso) {
  const d = new Date(iso);
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const j = new Date(d); j.setHours(0, 0, 0, 0);
  const ecart = Math.round((auj - j) / 86400000);
  if (ecart === 0) return "Aujourd'hui";
  if (ecart === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function quand(iso) {
  const ecart = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000);
  if (ecart === 0) return heure(iso);
  if (ecart === 1) return "hier";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function puceLien(type, id, titre, retirable = false) {
  if (!type || !id) return "";
  return '<span class="puce-lien">' +
    '<a href="#/' + type + "/" + id + '">' + icone(type, 18) + "<span>" + TYPES_LIEN[type] + " · " + echapper(titre || "") + "</span></a>" +
    (retirable ? '<button type="button" class="retirer-lien" id="btnRetirerLien" aria-label="Retirer ce travail du message">×</button>' : "") +
    "</span>";
}

// ---------------------------------------------------------------------
// Liste des conversations
// ---------------------------------------------------------------------

export async function ecranMessages(cle) {
  ecranAttente("messages");
  try {
    await chargerMembres();
  } catch (e) {
    return ecranErreur("messages", "Messagerie indisponible", e.message);
  }
  if (cle) return ecranConversation(cle);

  const { data, error } = await etat.supabase
    .from("messages").select("id, auteur_id, texte, lien_type, conversation, date_creation")
    .eq("famille_id", etat.profil.famille_id)
    .order("date_creation", { ascending: false }).limit(300);
  if (error) {
    return ecranErreur("messages", "Messagerie indisponible",
      /relation|does not exist|schema cache/i.test(error.message)
        ? "La messagerie n'est pas encore installée : exécutez le script 10 dans Supabase."
        : error.message);
  }
  await majNonLus();

  const derniers = {};
  for (const m of data ?? []) if (!derniers[m.conversation]) derniers[m.conversation] = m;

  const moi = etat.profil.id;
  const conversations = [
    { cle: "famille", titre: "Toute la famille", initiale: "F", famille: true },
    ...membres.filter((m) => m.id !== moi).map((m) => ({
      id: m.id, cle: cleConversation(moi, m.id), titre: m.prenom, initiale: m.prenom.charAt(0).toUpperCase(), sansCompte: !m.user_id,
    })),
  ].map((c) => ({ ...c, dernier: derniers[c.cle], nonLus: etat.nonLus[c.cle] ?? 0 }))
    .sort((a, b) => (a.famille ? -1 : b.famille ? 1 : 0) ||
      new Date(b.dernier?.date_creation ?? 0) - new Date(a.dernier?.date_creation ?? 0));

  const bandeau = etat.brouillonLien
    ? '<div class="message info">À qui voulez-vous écrire à propos de ' +
      echapper(TYPES_LIEN[etat.brouillonLien.type].toLowerCase()) + " « " + echapper(etat.brouillonLien.titre) + " » ? " +
      '<button type="button" class="lien-bouton" id="btnAnnulerLien">Annuler</button></div>'
    : "";

  miseEnPage("messages",
    '<h1 class="titre-main grand">Messages</h1>' + bandeau +
    '<div class="liste-conversations">' +
    conversations.map((c) => {
      const d = c.dernier;
      const apercu = d
        ? (d.auteur_id === moi ? "Vous : " : c.famille ? prenom(d.auteur_id) + " : " : "") + d.texte
        : c.famille ? "Écrivez à toute la famille" : c.sansCompte ? "Pas encore de compte" : "Aucun message pour l'instant";
      const inviter = c.sansCompte && etat.profil.est_parent
        ? '<button type="button" class="bouton petit ocre" data-inviter="' + c.id + '">Inviter</button>' : "";
      return '<div class="ligne-conversation">' +
        '<a class="conversation' + (c.nonLus ? " non-lue" : "") + '" href="#/messages/' + c.cle + '">' +
        '<span class="pastille' + (c.famille ? " famille" : "") + '">' + echapper(c.initiale) + "</span>" +
        '<span class="texte"><span class="titre">' + echapper(c.titre) + "</span>" +
        '<span class="apercu">' + echapper(apercu) + "</span></span>" +
        '<span class="droite">' + (d ? '<span class="quand">' + quand(d.date_creation) + "</span>" : "") +
        (c.nonLus ? '<span class="compteur">' + c.nonLus + "</span>" : "") + "</span></a>" + inviter + "</div>";
    }).join("") +
    "</div>" +
    '<p class="aide">Les conversations à deux sont privées : seuls les deux membres les lisent. ' +
    "La conversation « Toute la famille » est lue par tous.</p>");

  document.querySelectorAll("[data-inviter]").forEach((b) => b.addEventListener("click", () => inviterMembre(b.dataset.inviter)));

  document.getElementById("btnAnnulerLien")?.addEventListener("click", () => {
    etat.brouillonLien = null;
    ecranMessages();
  });
}

// ---------------------------------------------------------------------
// Une conversation
// ---------------------------------------------------------------------

async function ecranConversation(cle) {
  const moi = etat.profil.id;
  const famille = cle === "famille";
  const autreId = famille ? null : cle.split("_").find((x) => x !== moi);
  if (!famille && (!cle.split("_").includes(moi) || !membres.some((m) => m.id === autreId))) {
    return ecranErreur("messages", "Conversation introuvable", "Cette conversation n'existe pas ou ne vous est pas accessible.");
  }

  const { data, error } = await etat.supabase
    .from("messages").select("id, auteur_id, texte, lien_type, lien_id, lien_titre, date_creation")
    .eq("famille_id", etat.profil.famille_id).eq("conversation", cle)
    .order("date_creation", { ascending: false }).limit(200);
  if (error) return ecranErreur("messages", "Messagerie indisponible", error.message);

  const affiches = new Set();
  const titre = famille ? "Toute la famille" : prenom(autreId);
  const autre = membres.find((m) => m.id === autreId);

  miseEnPage("messages",
    entete(titre, "#/messages") +
    (autre && !autre.user_id
      ? '<div class="message info">' + echapper(autre.prenom) + " n'a pas encore de compte : vos messages l'attendront jusqu'à sa première connexion." +
        (etat.profil.est_parent ? ' <button type="button" class="bouton petit ocre" data-inviter="' + autre.id + '">Envoyer une invitation</button>' : "") +
        "</div>"
      : "") +
    '<div class="fil-messages" id="filMessages" data-cle="' + cle + '"></div>' +
    '<form class="redaction-message" id="formMessage" novalidate>' +
    '<div id="zoneLien"></div>' +
    '<div class="ligne-redaction">' +
    '<textarea id="txtMessage" rows="1" maxlength="2000" placeholder="Votre message…" aria-label="Votre message"></textarea>' +
    '<button type="submit" class="bouton plein" id="btnEnvoyer" aria-label="Envoyer">' +
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg></button>' +
    "</div>" +
    '<div class="message erreur" id="msgEnvoi" hidden></div>' +
    "</form>");

  document.querySelectorAll("[data-inviter]").forEach((b) => b.addEventListener("click", () => inviterMembre(b.dataset.inviter)));
  const fil = document.getElementById("filMessages");
  let dernierJour = "";

  const ajouter = (m) => {
    if (affiches.has(m.id)) return;
    affiches.add(m.id);
    const j = jour(m.date_creation);
    let html = "";
    if (j !== dernierJour) { html += '<div class="separateur-jour">' + j + "</div>"; dernierJour = j; }
    const mien = m.auteur_id === moi;
    html += '<div class="bulle ' + (mien ? "mienne" : "autre") + '">' +
      (!mien && famille ? '<span class="auteur">' + echapper(prenom(m.auteur_id)) + "</span>" : "") +
      puceLien(m.lien_type, m.lien_id, m.lien_titre) +
      '<span class="texte-bulle">' + echapper(m.texte) + "</span>" +
      '<span class="heure">' + heure(m.date_creation) + "</span></div>";
    fil.insertAdjacentHTML("beforeend", html);
  };

  const messages = (data ?? []).reverse();
  if (messages.length === 0) {
    fil.innerHTML = '<p class="aide centre" id="filVide">' +
      (famille ? "Aucun message. Écrivez le premier à toute la famille !" : "Aucun message. Écrivez le premier à " + echapper(titre) + " !") + "</p>";
  }
  messages.forEach(ajouter);
  window.scrollTo(0, document.body.scrollHeight);
  marquerLu(cle);

  // Travail joint au message
  const dessinerLien = () => {
    const l = etat.brouillonLien;
    document.getElementById("zoneLien").innerHTML = l ? puceLien(l.type, l.id, l.titre, true) : "";
    document.getElementById("btnRetirerLien")?.addEventListener("click", () => { etat.brouillonLien = null; dessinerLien(); });
  };
  dessinerLien();

  // Messages recus en direct
  const ecouteur = (m) => {
    if (!document.body.contains(fil)) { etat.ecouteursMessages.delete(ecouteur); return false; }
    if (m.conversation !== cle) return false;
    document.getElementById("filVide")?.remove();
    const enBas = window.innerHeight + window.scrollY >= document.body.scrollHeight - 120;
    ajouter(m);
    if (enBas || m.auteur_id === moi) window.scrollTo(0, document.body.scrollHeight);
    marquerLu(cle);
    return true;
  };
  etat.ecouteursMessages.add(ecouteur);

  // Saisie : la zone grandit avec le texte ; Ctrl+Entree envoie
  const zone = document.getElementById("txtMessage");
  zone.addEventListener("input", () => { zone.style.height = "auto"; zone.style.height = Math.min(zone.scrollHeight, 160) + "px"; });
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); document.getElementById("formMessage").requestSubmit(); }
  });

  document.getElementById("formMessage").addEventListener("submit", async (e) => {
    e.preventDefault();
    const texte = zone.value.trim();
    const msg = document.getElementById("msgEnvoi");
    msg.hidden = true;
    if (!texte) return;
    const bouton = document.getElementById("btnEnvoyer");
    bouton.disabled = true;
    const l = etat.brouillonLien;
    const { data: envoye, error: eEnvoi } = await etat.supabase.from("messages").insert({
      famille_id: etat.profil.famille_id,
      auteur_id: moi,
      destinataire_id: autreId,
      texte,
      lien_type: l ? l.type : null,
      lien_id: l ? l.id : null,
      lien_titre: l ? String(l.titre ?? "").slice(0, 200) : null,
    }).select("id, auteur_id, texte, lien_type, lien_id, lien_titre, date_creation").single();
    bouton.disabled = false;
    if (eEnvoi) {
      msg.textContent = "Le message n'a pas pu être envoyé : " + eEnvoi.message;
      msg.hidden = false;
      return;
    }
    zone.value = "";
    zone.style.height = "auto";
    etat.brouillonLien = null;
    dessinerLien();
    document.getElementById("filVide")?.remove();
    ajouter(envoye);
    window.scrollTo(0, document.body.scrollHeight);
    zone.focus();
  });
}
