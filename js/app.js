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

  const module = await import("./supabase.js");
  etat.supabase = module.supabase;

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
  if (!session) return ecranConnexion();

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
      case "documents":
      case "parents":
        return ecranBientot(route);
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
    '<h1 class="titre-main moyen">Nouveau mot de passe</h1>' +
    '<div class="message erreur" id="msgNouveau" hidden></div>' +
    '<div class="champ"><label for="txtNouveau">Choisissez un mot de passe (6 caractères au moins)</label>' +
    '<input id="txtNouveau" type="password" autocomplete="new-password" required></div>' +
    '<button class="bouton plein large" type="submit">Enregistrer</button>' +
    "</form></main>";

  document.getElementById("formNouveau").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = document.getElementById("msgNouveau");
    const { error } = await etat.supabase.auth.updateUser({ password: document.getElementById("txtNouveau").value });
    if (error) { msg.textContent = messageErreur(error); msg.hidden = false; return; }
    location.hash = "#/accueil";
  });
}

// ---------------------------------------------------------------------
// Ecran : accueil (version minimale, enrichie aux etapes suivantes)
// ---------------------------------------------------------------------

function ecranAccueil() {
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
    '<section class="carte pointillee"><b>Bientôt ici</b><br>' +
    "Vos derniers contrôles, les notions à revoir et vos leçons récentes.</section>" +
    '<button class="bouton rouge ne-pas-imprimer" data-action="deconnexion" style="align-self:flex-start">' +
    icone("sortie", 20) + "Se déconnecter</button>");
}

function ecranBientot(route) {
  const titres = { parcours: "Mon parcours", documents: "Mes cours", parents: "Espace parents" };
  miseEnPage(route,
    '<h1 class="titre-main grand">' + titres[route] + "</h1>" +
    '<section class="carte pointillee"><b>En construction</b><br>Cet écran arrive dans une prochaine étape.</section>');
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
