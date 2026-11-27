// =====================================================================
// Le Gai Savoir - application principale (demarrage, session, aiguillage)
// =====================================================================

import { SUPABASE_URL, SUPABASE_CLE_PUBLIQUE } from "./config.js";
import { echapper, icone, LOGO_LIVRE, messageErreur } from "./outils.js";
import { etat, racine, miseEnPage } from "./commun.js";

// ---------------------------------------------------------------------
// Demarrage
// ---------------------------------------------------------------------

async function demarrer() {
  if (SUPABASE_URL.startsWith("A_REMPLACER") || SUPABASE_CLE_PUBLIQUE.startsWith("A_REMPLACER")) {
    racine().innerHTML =
      '<div class="ecran-connexion papier"><div class="boite carte">' +
      '<h1 class="titre-main moyen">Configuration à compléter</h1>' +
      "<p>L'adresse du projet Supabase et la clé publique ne sont pas encore renseignées dans <b>js/config.js</b>.</p>" +
      "</div></div>";
    return;
  }

  // Lien recu par email (invitation ou mot de passe oublie) : on le repere
  // avant que Supabase ne lise puis efface l'adresse
  const typeLien = new URLSearchParams(location.hash.replace(/^#/, "")).get("type");
  const erreurLien = new URLSearchParams(location.hash.replace(/^#/, "")).get("error_description");

  const module = await import("./supabase.js");
  etat.supabase = module.supabase;
  await etat.supabase.auth.getSession();

  if (typeLien === "invite" || typeLien === "recovery") {
    etat.bienvenue = typeLien === "invite";
    history.replaceState(null, "", location.pathname + "#/nouveau-mot-de-passe");
  } else if (erreurLien) {
    history.replaceState(null, "", location.pathname + "#/accueil");
    etat.messageConnexion = "Ce lien n'est plus valable (" + erreurLien.replace(/\+/g, " ") +
      "). Utilisez « Mot de passe oublié ? » pour en recevoir un nouveau.";
  } else if (location.hash.includes("access_token")) {
    history.replaceState(null, "", location.pathname + "#/accueil");
  }

  etat.supabase.auth.onAuthStateChange((evenement) => {
    if (evenement === "PASSWORD_RECOVERY") {
      location.hash = "#/nouveau-mot-de-passe";
    } else if (evenement === "SIGNED_OUT") {
      etat.profil = null;
      etat.matieres = null;
      afficher();
    }
  });

  window.addEventListener("hashchange", afficher);
  await afficher();
}

// ---------------------------------------------------------------------
// Aiguillage des ecrans : #/ecran/parametre
// ---------------------------------------------------------------------

async function afficher() {
  const morceaux = (location.hash || "#/accueil").slice(2).split("/");
  const route = morceaux[0] || "accueil";
  const parametre = morceaux[1] || "";
  const { data: { session } } = await etat.supabase.auth.getSession();

  if (route === "nouveau-mot-de-passe") return ecranNouveauMotDePasse();
  if (!session) {
    const info = etat.messageConnexion || "";
    etat.messageConnexion = "";
    return ecranConnexion(info);
  }

  if (!etat.profil) {
    try {
      const module = await import("./supabase.js");
      etat.profil = await module.chargerMonProfil();
    } catch (e) {
      return ecranMessage("Profil introuvable", messageErreur(e));
    }
    if (!etat.profil) {
      return ecranMessage("Profil introuvable",
        "Votre compte existe, mais il n'est rattaché à aucun profil de la famille. Demandez à un parent de vous ajouter.");
    }
  }

  try {
    switch (route) {
      case "apprendre":
        return (await import("./ecrans/apprendre.js")).ecranApprendre(parametre);
      case "lecon":
        return (await import("./ecrans/lecon.js")).ecranLecon(parametre);
      case "fiche":
        return (await import("./ecrans/lecon.js")).ecranFiche(parametre);
      case "controle":
        return (await import("./ecrans/controle.js")).ecranControle(parametre);
      case "parcours":
        return (await import("./ecrans/parcours.js")).ecranParcours();
      case "documents":
        return (await import("./ecrans/documents.js")).ecranDocuments();
      case "parents":
        if (parametre === "reglages") return (await import("./ecrans/reglages.js")).ecranReglages();
        return (await import("./ecrans/parents.js")).ecranParents();
      case "accueil":
      default:
        return ecranAccueil();
    }
  } catch (e) {
    return ecranMessage("Erreur", "Cet écran n'a pas pu s'afficher : " + (e.message ?? e));
  }
}

// ---------------------------------------------------------------------
// Ecran : connexion
// ---------------------------------------------------------------------

function ecranConnexion(info = "") {
  racine().innerHTML =
    '<main class="ecran-connexion papier">' +
    '<form class="boite" id="formConnexion" novalidate>' +
    "<div>" + LOGO_LIVRE +
    '<h1 class="titre-main grand">Le Gai Savoir</h1>' +
    '<p class="sous-titre">Leçons, fiches de révision et contrôles pour toute la famille.</p></div>' +
    (info ? '<div class="message info">' + echapper(info) + "</div>" : "") +
    '<div class="message erreur" id="msgConnexion" hidden></div>' +
    '<div class="champ"><label for="txtEmail">Adresse email</label>' +
    '<input id="txtEmail" type="email" autocomplete="email" required></div>' +
    '<div class="champ"><label for="txtMotDePasse">Mot de passe</label>' +
    '<input id="txtMotDePasse" type="password" autocomplete="current-password" required></div>' +
    '<button class="bouton plein large" id="btnConnexion" type="submit">Se connecter</button>' +
    '<button class="lien-bouton" id="btnOubli" type="button">Mot de passe oublié ?</button>' +
    "</form></main>";

  const msg = document.getElementById("msgConnexion");
  const montrer = (texte) => { msg.textContent = texte; msg.hidden = !texte; };

  document.getElementById("formConnexion").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = document.getElementById("txtEmail").value.trim();
    const motDePasse = document.getElementById("txtMotDePasse").value;
    if (!email || !motDePasse) return montrer("Saisissez votre email et votre mot de passe.");
    const bouton = document.getElementById("btnConnexion");
    bouton.disabled = true;
    bouton.textContent = "Connexion…";
    const { error } = await etat.supabase.auth.signInWithPassword({ email, password: motDePasse });
    if (error) {
      bouton.disabled = false;
      bouton.textContent = "Se connecter";
      return montrer(messageErreur(error));
    }
    location.hash = "#/accueil";
    afficher();
  });

  document.getElementById("btnOubli").addEventListener("click", async () => {
    const email = document.getElementById("txtEmail").value.trim();
    if (!email) return montrer("Saisissez d'abord votre adresse email, puis cliquez de nouveau sur « Mot de passe oublié ? ».");
    const adresseRetour = location.origin + location.pathname;
    const { error } = await etat.supabase.auth.resetPasswordForEmail(email, { redirectTo: adresseRetour });
    if (error) return montrer(messageErreur(error));
    ecranConnexion("Un email vient de vous être envoyé. Cliquez sur le lien qu'il contient pour choisir un nouveau mot de passe.");
  });
}

// ---------------------------------------------------------------------
// Ecran : nouveau mot de passe (apres le lien recu par email)
// ---------------------------------------------------------------------

function ecranNouveauMotDePasse() {
  racine().innerHTML =
    '<main class="ecran-connexion papier">' +
    '<form class="boite" id="formNouveau" novalidate>' +
    (etat.bienvenue
      ? '<div>' + LOGO_LIVRE + '<h1 class="titre-main grand">Bienvenue !</h1>' +
        '<p class="sous-titre">Choisissez votre mot de passe pour entrer dans Le Gai Savoir.</p></div>'
      : '<h1 class="titre-main moyen">Nouveau mot de passe</h1>' + '<a class="lien-bouton" href="#/accueil">Annuler</a>') +
    '<div class="message erreur" id="msgNouveau" hidden></div>' +
    '<div class="champ"><label for="txtNouveau">Choisissez un mot de passe (6 caractères au moins)</label>' +
    '<input id="txtNouveau" type="password" autocomplete="new-password" required></div>' +
    '<div class="champ"><label for="txtConfirmation">Retapez-le</label>' +
    '<input id="txtConfirmation" type="password" autocomplete="new-password" required></div>' +
    '<button class="bouton plein large" type="submit">Enregistrer</button>' +
    "</form></main>";

  document.getElementById("formNouveau").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = document.getElementById("msgNouveau");
    const motDePasse = document.getElementById("txtNouveau").value;
    const montrer = (t) => { msg.textContent = t; msg.hidden = false; };
    if (motDePasse.length < 6) return montrer("Le mot de passe doit contenir au moins 6 caractères.");
    if (motDePasse !== document.getElementById("txtConfirmation").value) return montrer("Les deux mots de passe ne sont pas identiques.");
    const { data: { session } } = await etat.supabase.auth.getSession();
    if (!session) return montrer("Le lien reçu par email n'est plus valable. Demandez-en un nouveau avec « Mot de passe oublié ? ».");
    const { error } = await etat.supabase.auth.updateUser({ password: motDePasse });
    if (error) return montrer(messageErreur(error));
    etat.bienvenue = false;
    location.hash = "#/accueil";
  });
}

// ---------------------------------------------------------------------
// Ecran : accueil (version minimale, enrichie aux etapes suivantes)
// ---------------------------------------------------------------------

async function ecranAccueil() {
  const p = etat.profil;
  const niveau = p.niveau === "adulte" ? "Adulte" : "Classe de " + p.niveau;
  miseEnPage("accueil",
    "<section>" +
    '<h1 class="titre-main grand">Bonjour ' + echapper(p.prenom) + " !</h1>" +
    '<p class="sous-titre">' + echapper(niveau) + " · Que souhaitez-vous faire aujourd'hui ?</p>" +
    "</section>" +
    '<section class="actions">' +
    '<a class="action lecon" href="#/apprendre/lecon">' + icone("lecon", 28) + "Une leçon</a>" +
    '<a class="action fiche" href="#/apprendre/fiche">' + icone("fiche", 28) + "Une fiche</a>" +
    (p.controles_actifs
      ? '<a class="action controle" href="#/apprendre/controle">' + icone("controle", 28) + "Un contrôle</a>"
      : "") +
    "</section>" +
    '<div id="zoneAccueil" class="accueil-suite"></div>' +
    '<div class="barre-actions ne-pas-imprimer">' +
    '<a class="bouton" href="#/nouveau-mot-de-passe">Changer mon mot de passe</a>' +
    '<button class="bouton rouge" data-action="deconnexion">' + icone("sortie", 20) + "Se déconnecter</button></div>");

  const zone = document.getElementById("zoneAccueil");
  try {
    const parcours = await import("./ecrans/parcours.js");
    const d = await parcours.chargerParcours();
    if (!document.body.contains(zone)) return; // l'utilisateur a change d'ecran entre-temps

    const enCours = d.elements.filter((e) => e.type === "controle" && e.statut !== "termine").slice(0, 2);
    const recents = d.elements.filter((e) => !enCours.includes(e)).slice(0, 4);
    let html = "";
    if (enCours.length) {
      html += '<section class="bloc-parcours"><h2>À terminer</h2><div class="liste-elements">' +
        enCours.map(parcours.ligneElement).join("") + "</div></section>";
    }
    if (d.aRevoir.length) {
      html += '<section class="bloc-parcours"><h2>Notions à revoir</h2><div class="liste-notions">' +
        d.aRevoir.slice(0, 3).map(parcours.ligneNotion).join("") + "</div></section>";
    }
    if (recents.length) {
      html += '<section class="bloc-parcours"><h2>Récemment</h2><div class="liste-elements">' +
        recents.map(parcours.ligneElement).join("") + "</div>" +
        '<a class="lien-suite" href="#/parcours">Voir tout mon parcours</a></section>';
    }
    if (!html) {
      html = '<section class="carte pointillee"><b>Bienvenue !</b><br>' +
        "Choisissez ci-dessus une leçon, une fiche ou un contrôle. Vos travaux apparaîtront ensuite ici.</section>";
    }
    zone.innerHTML = html;
    parcours.brancherReviser();
  } catch (e) {
    zone.innerHTML = "";
  }
}

// ---------------------------------------------------------------------
// Ecran : message simple
// ---------------------------------------------------------------------

function ecranMessage(titre, texte) {
  racine().innerHTML =
    '<main class="ecran-connexion papier"><div class="boite carte">' +
    '<h1 class="titre-main moyen">' + echapper(titre) + "</h1>" +
    "<p>" + echapper(texte) + "</p>" +
    '<a class="bouton" href="#/accueil">Revenir à l\'accueil</a>' +
    '<button class="bouton" id="btnSortir">Se déconnecter</button>' +
    "</div></main>";
  document.getElementById("btnSortir").addEventListener("click", () => etat.supabase.auth.signOut());
}

// ---------------------------------------------------------------------
// Service worker (installation sur telephone et ordinateur)
// ---------------------------------------------------------------------

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

demarrer();
