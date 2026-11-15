# Unmanic

Intégrez votre serveur [Unmanic](https://docs.unmanic.app) (l'optimiseur
auto-hébergé de bibliothèque vidéo) à Gladys, sur votre réseau local : les
tâches en attente et en cours, les tâches terminées et en échec du jour, l'état
et la progression de chaque worker, des interrupteurs de pause, et des scènes
qui réagissent quand une tâche échoue ou quand la file est vide.

L'intégration a été testée contre un vrai serveur Unmanic 0.4.1 (l'image
Docker officielle `josh5/unmanic`, avec de vraies tâches de transcodage et un
échec), pas encore dans une vraie installation de Gladys : vos retours sont les
bienvenus sur le [forum Gladys](https://community.gladysassistant.com) ou dans
les [issues](https://github.com/guim31/gladys-unmanic/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un serveur **Unmanic** joignable depuis Gladys (même réseau), sur le port de
  son interface web (`8888` par défaut).
- Unmanic n'a **pas d'identification** : rien à créer. Si vous avez placé
  devant lui un proxy inverse avec Basic auth, gardez son identifiant et son
  mot de passe sous la main.

## Mise en route

1. Installez l'intégration depuis le catalogue de Gladys.
2. Dans **Configuration**, saisissez l'**Adresse** du serveur Unmanic (par
   exemple `192.168.1.2:8888` ; sans port, `8888` est utilisé). Derrière un
   proxy inverse, l'adresse complète (`https://example.org/unmanic`) et, avec
   Basic auth, l'**Identifiant (proxy inverse)** et le **Mot de passe (proxy
   inverse)**.
3. Enregistrez, puis cliquez sur **Tester la connexion** : le message sous le
   bouton donne la version d'Unmanic, le nombre de workers et les tâches en
   attente.
4. Ouvrez l'onglet **Découverte** : un appareil pour le serveur, un pour la
   file, un par worker. Cliquez sur **Ajouter** pour ceux que vous voulez,
   choisissez une pièce et enregistrez.

Options :

- **Autoriser la pause et la reprise** (désactivé par défaut) : Gladys peut
  mettre en pause et relancer les workers (interrupteurs, scènes, bouton du
  widget). Désactivé, l'intégration ne fait que lire.
- **Intervalle de rafraîchissement** : de 30 secondes à 5 minutes (1 minute
  par défaut).
- **Langue des noms de fonctionnalités** : les noms donnés aux fonctionnalités
  à l'ajout d'un appareil, et la langue de la phrase de résumé.

## Les appareils

**Le serveur Unmanic**

| Fonctionnalité                | Ce qu'elle indique                                                            |
| ----------------------------- | ----------------------------------------------------------------------------- |
| **En ligne**                  | 1 tant que le serveur répond.                                                 |
| **Tous les workers en pause** | Interrupteur : met en pause ou relance tous les workers (1 si tous en pause). |
| **Version**                   | Version d'Unmanic.                                                            |

**La file Unmanic**

| Fonctionnalité            | Ce qu'elle indique                                            |
| ------------------------- | ------------------------------------------------------------- |
| **Tâches en attente**     | Tâches qui attendent un worker (les Pending tasks d'Unmanic). |
| **Tâches en cours**       | Tâches qu'un worker traite en ce moment.                      |
| **Terminées aujourd'hui** | Tâches terminées avec succès depuis minuit.                   |
| **Échecs aujourd'hui**    | Tâches en échec depuis minuit.                                |

**Chaque worker** (nommé comme dans Unmanic, `Default-Worker-1`…)

| Fonctionnalité       | Ce qu'elle indique                                                 |
| -------------------- | ------------------------------------------------------------------ |
| **Actif**            | 1 tant que le worker traite une tâche.                             |
| **En pause**         | Interrupteur : met en pause ou relance ce worker.                  |
| **Progression**      | Avancement de la tâche en %, quand le plugin d'Unmanic le fournit. |
| **Fichier en cours** | Nom du fichier en traitement (`—` au repos).                       |

Un worker en pause s'arrête là où il en est et reprend au même point à la
relance : rien n'est perdu. Un worker qui disparaît (groupe de workers réduit
ou renommé dans Unmanic) reste dans Gladys, hors ligne.

## Tableau de bord

Le widget **Unmanic** affiche quatre tuiles (en attente, en cours, finies
aujourd'hui, échecs aujourd'hui), une ligne par worker (progression et
fichier, en pause, inactif) et un bouton : **Tout mettre en pause** pendant que
les workers tournent, **Tout reprendre** une fois qu'ils sont tous en pause.
Pas de bouton quand les commandes sont désactivées dans la configuration. Deux
réglages du widget masquent les lignes des workers et le bouton.

## Scènes

### Déclencheurs

- **File Unmanic vidée** : tout est traité, plus aucune tâche en attente ni
  aucun worker occupé. Variables : les tâches terminées et en échec du jour.
- **Tâche Unmanic en échec** : une tâche vient de se terminer en échec.
  Variables : le nom du fichier, les tâches en échec du jour.

### Actions

- **Mettre Unmanic en pause** : un worker, ou tous si aucun n'est choisi.
- **Relancer Unmanic** : même choix.
- **Lire le résumé Unmanic** : une phrase pour un message ou une annonce
  vocale (« Unmanic: 12 tâche(s) en attente, 2 en cours, 30 terminée(s)
  aujourd'hui, 1 en échec aujourd'hui. »), et les mêmes chiffres en nombres.

Les actions de pause et de reprise demandent **Autoriser la pause et la
reprise** dans la configuration.

### Idées de scènes

- Pendant les heures pleines de votre contrat d'électricité, **Mettre Unmanic
  en pause** ; au début des heures creuses, **Relancer Unmanic**.
- **Tâche Unmanic en échec** → un message Telegram avec le nom du fichier.
- **File Unmanic vidée** → une notification : « Unmanic a fini pour
  aujourd'hui ».
- Le soir, **Mettre Unmanic en pause** pour garder le processeur pour le film,
  et le relancer la nuit.

## Dépannage

- **« Unmanic ne répond pas »** : vérifiez l'adresse et le port (`8888`), et
  que Gladys atteint le serveur (pare-feu, réseau Docker).
- **« Accès refusé »** : un proxy inverse protège Unmanic ; vérifiez
  l'identifiant et le mot de passe dans la configuration.
- **« Aucun serveur Unmanic à cette adresse »** : une autre application répond
  sur ce port, ou le chemin du proxy inverse manque.
- **Aucun worker** : Unmanic n'a pas de worker tant qu'un groupe de workers
  n'en compte pas (**Settings** → **Workers**).
- **La progression reste à 0 %** : le plugin de la tâche ne donne pas
  d'avancement à Unmanic ; le worker est quand même affiché actif avec son
  fichier.
- **L'interrupteur ne fait rien** : cochez **Autoriser la pause et la
  reprise** dans la configuration.
- Plus de détails dans les logs de l'intégration (**Intégrations** → Unmanic →
  logs), au niveau `debug` si besoin.

## Limites

- Un serveur Unmanic par intégration.
- Les chiffres sont lus à chaque intervalle de rafraîchissement : une tâche
  courte peut commencer et finir entre deux lectures (elle compte quand même
  dans les tâches du jour).
- Les tâches du jour sont comptées sur les 250 dernières tâches de
  l'historique, depuis minuit dans le fuseau de Gladys. **Tâche Unmanic en
  échec** annonce au plus dix tâches par lecture, aucune de plus d'une heure.
- Unmanic n'a pas d'authentification : tout appareil de votre réseau atteint
  son API. L'intégration ne modifie ni les réglages, ni les bibliothèques, ni
  les plugins d'Unmanic, et ne supprime rien.
- Sans lien avec Unmanic ni ses auteurs.
