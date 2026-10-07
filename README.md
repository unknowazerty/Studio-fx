# Studio FX

Effets caméra et VFX à appliquer sur une photo, exportés en vidéo.
Tout est calculé dans le navigateur : gratuit, sans compte, aucune photo n'est envoyée.

**Utiliser :** ouvrir `index.html` dans Chrome, Edge ou Safari (ou activer GitHub Pages sur ce dépôt).

- 18 mouvements de caméra : Crash Zoom, Dolly, Super Dolly, Whip Pan, Crane Up, Zoom spirale, Caméra épaule, Séisme, Beat Punch, Rack Focus…
- 17 effets visuels : désintégration, feu, explosion, fonte, gel, éclairs, hologramme, pluie, neige, fuite de lumière, paillettes, VHS, pellicule 16 mm, révélation pixel, N&B → couleur, kaléidoscope, glitch, paparazzi
- Un mouvement + un effet combinables, intensité, durée 2–12 s, formats 9:16 / 1:1 / 16:9
- Export vidéo MP4 (ou WebM selon le navigateur)

## Remplacement IA

Onglet « Remplacement IA » : remplace la personne d'une vidéo par un personnage tiré d'une photo
(ou fait reproduire au personnage les gestes de la vidéo), avec le modèle open source
[Wan 2.2 Animate](https://huggingface.co/Wan-AI/Wan2.2-Animate-14B) hébergé gratuitement sur Hugging Face.
Le Space officiel étant en pause, l'appli essaie dans l'ordre plusieurs copies publiques
(`alexnasa/Wan2.2-Animate-ZEROGPU`, `Wan-AI/Wan2.2-Animate`, `IA7Cast/Wan2.2-Animate`, `ziffir/Wan2.2-Animate`).

- Gratuit avec un quota quotidien ; un jeton Hugging Face (compte gratuit, droit « Read ») permet d'utiliser son propre quota.
- La vidéo et la photo sont envoyées au Space pour le calcul.
- Les paramètres du Space sont détectés à la connexion ; un autre Space compatible peut être indiqué dans les réglages avancés pour être essayé en premier.
- Client Gradio inclus dans `vendor/gradio-client/` (@gradio/client 2.7.1, licence Apache-2.0).
