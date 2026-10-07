# Lunacia Rift — Vibeathon submission copy

Paste-ready text for https://vibeathon.axieinfinity.ai/dashboard/project, field by field.
Character counts are under each field's limit.

---

## Project title

Lunacia Rift

---

## Short description  (limit 5,000)

Lunacia Rift is a 1v1, three-lane micro-MOBA for the browser. You command three Axies at once, one per lane: Buba (Plant) holds, Olek (Beast) brings tempo, and Puffy (Aquatic) finishes. Switch between them, last-hit Pack waves for gold, and push down the enemy's Spires. Break any two inner Spires and the enemy Nest unlocks. Crack it to win.

Each Axie's genes are its kit: Mouth, Horn, Back and Tail map to Q, W, E and R, and each cast fires Axie Origins visual effects. Eyes and Ears add passives. Every fight follows the Axie class triangle (Plant > Beast > Aquatic, Bird > Bug > Reptile, Dawn > Dusk > Mech), and so does every Pack. Pack waves come from Dens you upgrade, and you can breed a Den's Pack species from your own Axies across all 9 classes. Spires can be repaired and fortified, gold buys Boots, Vials and Relics, and fog of war hides the enemy outside your vision.

A match takes about 7 to 10 minutes. Play against a bot trainer, or open the CPU vs CPU spectator mode (?cpu=1) to watch both teams run on the lane AI. Press F to follow a hero up close, and H to hide the HUD.

---

## Product vision  (limit 2,000)

The goal is a short, readable Axie MOBA where your own Axies are the heroes. Matches stay under ten minutes, the Axie in each lane matters, and Axie genetics drive the strategy. Parts become abilities, classes decide matchups, and breeding shapes your Pack waves.

Next steps:
1. Bring Your Own Axie through Axie Core. Your real Axies, their parts and their class fill the hold, tempo and finish lane roles, and the kit is generated from their genes.
2. Real progression. Match XP writes back as AXP instead of the Round 1 hero-kill level mock.
3. Online 1v1 rooms, which are already prototyped behind a Colyseus client, then ranked play.
4. More of the Origins kit: each class's full skill VFX, more Pack traits, and a smarter bot.
5. Spectator and clip tools. The CPU vs CPU mode and follow camera already make it easy to watch and share matches.

The long-term picture: a quick competitive mode in Lunacia where the Axies you own and breed have a role in lane, and where two players can settle a matchup in one short session.

---

## How is Axie Core integrated in the game?  (limit 3,000)

Round 1 is built around the Axie data model, with ownership mocked so judges can play without a wallet.

What is in the build today:
- Axie identity and art. The heroes and all 9 Pack classes use official Axie Infinity CDN Axie images (axiecdn.axieinfinity.com, by Axie ID; listed in assets/axies/ATTRIBUTION.md).
- Genes become gameplay. Each starter has six gene slots (eyes, ears, mouth, horn, back, tail) in data/roster.json. Mouth, Horn, Back and Tail map to Q, W, E and R. Eyes and Ears are working passives, such as +5% last-hit gold, Sanctuary regen and attack range.
- The class system. The full 9-class advantage matrix (primary, secondary, tertiary and cross matchups) drives damage between heroes and Packs. Each Pack class has its own stats and trait.
- Breeding as a mechanic. At a Den you pick 2 or 3 of your Axies as parents to breed a new Pack species from all 9 classes.
- The Axie Origins asset kit. Skill casts play effects from axie-origins-asset-kit's web-vfx, and the HUD uses Origins battle UI art.

What is not yet connected:
- Ownership. Round 1 uses a mock starter trio (Buba, Olek, Puffy) defined in data/roster.json, with an axieCoreNote marking it as the Bring Your Own Axie slot.
- The Round 2 plan is to load the player's Axies through Axie Core and map each one's real class and parts into the same schema (genes, then QWER kit and passives, then class matchups). The match code doesn't change: only the roster source does, from a JSON file to the player's own Axies.
- AXP is also mocked through hero-kill levels. Round 2 writes real AXP back.

---

## Playable builds

Platform: **Browser**

Build link: TODO — public URL once hosted (for example Vercel or GitHub Pages)

Instructions (paste into the build's instructions field):

Open the link in desktop Chrome, Edge or Firefox. From the title screen pick **Play vs Bot**, **Play Online** (one player creates a room and shares the 6-letter code, both press Ready), or **Watch CPU vs CPU**.
- Click the map to move your selected Axie. Tab or 1/2/3 switches Axie, or click a row in the Vitals panel.
- Q W E R cast that Axie's gene skills.
- F (or the Follow hero button) locks the camera on your Axie. Hold Shift to zoom in briefly.
- Walk next to your Den or Spire and click it to upgrade, repair, or breed Packs. The Shop buys items for the selected Axie.
- At your Sanctuary, Z/X/C reassigns lanes.
- Break two inner Spires to unlock the enemy Nest, then destroy it to win.
- Press H to hide the HUD. ☰ Menu (top-left) returns to the title screen.

---

## Private source review

- GitHub repository URL: https://github.com/userdefault13/LUNACIA-RIFT
- Full review commit SHA: TODO — after the final commit is pushed (`git rev-parse HEAD`)
- Invite GitHub user **jaatster** to the repo (Settings → Collaborators) if it is private.

---

## Demo video URL

TODO — upload `submission/lunacia-rift-gameplay.mp4` to YouTube (unlisted is fine) and paste the link.

---

## Run requirements

- Devices: **Desktop**
- Inputs: **Keyboard + mouse**
- Access: **No extra access needed**

Run notes  (limit 500):

Desktop browser (Chrome, Edge or Firefox), keyboard and mouse. No wallet or account needed. Round 1 uses a mock starter roster. First load streams about 12 MB of Axie Origins VFX, so give it a few seconds. Add ?cpu=1 to the URL to watch a CPU vs CPU match. Press F to follow a hero and H to hide the HUD.

---

## Project thumbnail

`submission/thumbnail.png` — 1920×1080 PNG (16:9, under 8 MiB).
