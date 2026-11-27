// =====================================================================
// Le Gai Savoir - application principale (navigation, session, ecrans)
// =====================================================================

import { SUPABASE_URL, SUPABASE_CLE_PUBLIQUE } from "./config.js";
import { echapper, icone, LOGO_LIVRE, messageErreur } from "./outils.js";

const racine = document.getElementById("app");
let supabase = null;
let monProfil = null;

// ---------------------------------------------------------------------
// Demarrage
// ---------------------------------------------------------------------

async function demarrer() {
  if (SUPABASE_URL.startsWith("A_REMPLACER") || SUPABASE_CLE_PUBLIQUE.startsWith("A_REMPLACER")) {
    racine.innerHTML =
      '<div class="ecran-connexion papier"><div class="boite carte">' +
      '<h1 class="titre-main moyen">Configuration à compléter</h1>' +
      "<p>L'adresse du projet Supabase et la clé publique ne sont pas encore renseignées dans <b>js/config.js</b>.</p>" +
      "</div></div>";
    return;
  }

  const module = await import("./supabase.js");
  supabase = module.supabase;

  supabase.auth.onAuthStateChange((evenement) => {
    if (evenement === "PASSWORD_RECOVERY") {
      location.hash = "#/nouveau-mot-de-passe";
    } else if (evenement === "SIGNED_OUT") {
      monProfil = null;
      afficher();
    }
  });

  window.addEventListener("hashchange", afficher);
  await afficher();
}

// ---------------------------------------------------------------------
// Aiguillage des ecrans
// ---------------------------------------------------------------------

async function afficher() {
  const route = (location.hash || "#/accueil").slice(2);
  const { data: { session } } = await supabase.auth.getSession();

  if (route === "nouveau-mot-de-passe") return ecranNouveauMotDePasse();
  if (!session) return ecranConnexion();

  if (!monProfil) {
    try {
      const module = await import("./supabase.js");
      monProfil = await module.chargerMonProfil();
    } catch (e) {
      return ecranMessage("Profil introuvable", messageErreur(e));
    }
    if (!monProfil) {
      return ecranMessage("Profil introuvable",
        "Votre compte existe, mais il n'est rattaché à aucun profil de la famille. Demandez à un parent de vous ajouter.");
    }
  }

  switch (route) {
    case "accueil":
    default:
      return ecranAccueil();
  }
}

// ---------------------------------------------------------------------
// Ecran : connexion
// ---------------------------------------------------------------------

function ecranConnexion(info = "") {
  racine.innerHTML =
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
    const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
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
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: adresseRetour });
    if (error) return montrer(messageErreur(error));
    ecranConnexion("Un email vient de vous être envoyé. Cliquez sur le lien qu'il contient pour choisir un nouveau mot de passe.");
  });
}

// ---------------------------------------------------------------------
// Ecran : nouveau mot de passe (apres le lien recu par email)
// ---------------------------------------------------------------------

function ecranNouveauMotDePasse() {
  racine.innerHTML =
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
    const { error } = await supabase.auth.updateUser({ password: document.getElementById("txtNouveau").value });
    if (error) { msg.textContent = messageErreur(error); msg.hidden = false; return; }
    location.hash = "#/accueil";
  });
}

// ---------------------------------------------------------------------
// Mise en page commune (menu lateral sur ordinateur, onglets sur telephone)
// ---------------------------------------------------------------------

function menus() {
  const liens = [
    { route: "accueil", libelle: "Accueil", icone: "accueil" },
    { route: "apprendre", libelle: "Apprendre", icone: "apprendre" },
    { route: "parcours", libelle: "Parcours", icone: "parcours" },
    { route: "documents", libelle: "Mes cours", icone: "documents" },
  ];
  if (monProfil.est_parent) liens.push({ route: "parents", libelle: "Parents", icone: "parents" });
  return liens;
}

function miseEnPage(routeActive, contenuHtml) {
  const liens = menus();
  const initiale = echapper(monProfil.prenom.charAt(0).toUpperCase());
  const lien = (l, taille) =>
    '<a href="#/' + l.route + '" class="' + (l.route === routeActive ? "actif" : "") + '">' +
    icone(l.icone, taille) + "<span>" + l.libelle + "</span></a>";

  racine.innerHTML =
    '<div class="mise-en-page">' +
    '<aside class="menu-lateral">' +
    '<div class="nom-app">Le Gai Savoir</div>' +
    "<nav>" + liens.map((l) => lien(l, 22)).join("") + "</nav>" +
    '<div class="profil"><div class="pastille">' + initiale + "</div>" +
    "<div><b>" + echapper(monProfil.prenom) + "</b><br>" +
    '<button class="lien-bouton" data-action="deconnexion">Se déconnecter</button></div></div>' +
    "</aside>" +
    '<main class="contenu papier"><div class="contenu-interieur">' +
    '<header class="entete-mobile"><span class="nom-app">Le Gai Savoir</span>' +
    '<div class="pastille">' + initiale + "</div></header>" +
    contenuHtml +
    "</div></main>" +
    '<nav class="onglets">' + liens.map((l) => lien(l, 24)).join("") + "</nav>" +
    "</div>";

  racine.querySelectorAll('[data-action="deconnexion"]').forEach((b) =>
    b.addEventListener("click", () => supabase.auth.signOut()));
}

// ---------------------------------------------------------------------
// Ecran : accueil (version minimale, enrichie aux etapes suivantes)
// ---------------------------------------------------------------------

function ecranAccueil() {
  const niveau = monProfil.niveau === "adulte" ? "Adulte" : "Classe de " + monProfil.niveau;
  miseEnPage("accueil",
    "<section>" +
    '<h1 class="titre-main grand">Bonjour ' + echapper(monProfil.prenom) + " !</h1>" +
    '<p class="sous-titre">' + echapper(niveau) + " · Que souhaitez-vous faire aujourd'hui ?</p>" +
    "</section>" +
    '<section class="actions">' +
    '<a class="action lecon" href="#/apprendre">' + icone("lecon", 28) + "Une leçon</a>" +
    '<a class="action fiche" href="#/apprendre">' + icone("fiche", 28) + "Une fiche</a>" +
    (monProfil.controles_actifs
      ? '<a class="action controle" href="#/apprendre">' + icone("controle", 28) + "Un contrôle</a>"
      : "") +
    "</section>" +
    '<section class="carte pointillee"><b>Bientôt ici</b><br>' +
    "Vos derniers contrôles, les notions à revoir et vos leçons récentes.</section>" +
    '<button class="bouton rouge ne-pas-imprimer" data-action="deconnexion" style="align-self:flex-start">' +
    icone("sortie", 20) + "Se déconnecter</button>");

  racine.querySelectorAll('[data-action="deconnexion"]').forEach((b) =>
    b.addEventListener("click", () => supabase.auth.signOut()));
}

// ---------------------------------------------------------------------
// Ecran : message simple
// ---------------------------------------------------------------------

function ecranMessage(titre, texte) {
  racine.innerHTML =
    '<main class="ecran-connexion papier"><div class="boite carte">' +
    '<h1 class="titre-main moyen">' + echapper(titre) + "</h1>" +
    "<p>" + echapper(texte) + "</p>" +
    '<button class="bouton" id="btnSortir">Se déconnecter</button>' +
    "</div></main>";
  document.getElementById("btnSortir").addEventListener("click", () => supabase.auth.signOut());
}

// ---------------------------------------------------------------------
// Service worker (installation sur telephone et ordinateur)
// ---------------------------------------------------------------------

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

demarrer();
