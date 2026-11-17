# Learn JC

Le coach du conseiller.

Appli de révision pour conseiller bancaire : 16 thèmes, 5 niveaux, révisions espacées, simulateurs et fiches mémo.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `index.html` | L'application |
| `questions.json` | Questions, mini-cours, fiches et schémas (à modifier pour ajouter du contenu) |
| `calc.js` | Calculs des simulateurs |
| `fiches.js` | Dessin des schémas des fiches |
| `fiches.html` | Toutes les fiches, prêtes à imprimer |
| `fiche-*.pdf` | Les fiches en PDF (une par thème + le recueil complet) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Installation sur le téléphone et fonctionnement hors ligne |

## Mettre en ligne avec GitHub Pages

1. Créer un compte sur github.com.
2. Cliquer sur **New repository**, nom : `learn-jc`, cocher **Public**, puis **Create repository**.
3. Cliquer sur **uploading an existing file**, glisser **tous les fichiers** de ce dossier (il n'y a pas de sous-dossier), puis **Commit changes**.
4. Aller dans **Settings → Pages**. Source : **Deploy from a branch**, branche **main**, dossier **/ (root)**, puis **Save**.
5. Après 1 à 2 minutes, l'adresse s'affiche : `https://<ton-pseudo>.github.io/learn-jc/`.

## Installer sur le téléphone

- **iPhone** : ouvrir l'adresse dans **Safari** → bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
- **Android** : ouvrir l'adresse dans **Chrome** → menu **⋮** → **Installer l'application** (ou **Ajouter à l'écran d'accueil**).

## Mettre à jour

Remplacer le fichier modifié sur GitHub (**Add file → Upload files**), puis changer `VERSION` dans `sw.js` (par exemple `coach-v4`) pour que les téléphones récupèrent la nouvelle version.

## Progression

La progression est enregistrée dans le navigateur de chaque appareil. Pour la transférer : **Profil → Générer et copier mon code**, puis **Restaurer depuis un code** sur l'autre appareil.

Règles et taux vérifiés au 16 novembre 2026.
