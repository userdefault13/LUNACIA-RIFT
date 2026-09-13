/**
 * Lunacia Rift — bootstrap / UI bindings
 * ES module entry (Vite or static). Loads Spine attack spike when enabled.
 */
import { attachSpineHeroes } from './spineHeroes.js';
import { attachOriginsVfx } from './originsVfx.js';
import { attachGlbHeroes } from './glbHeroes.js';
import { createNet, resolveEndpoint, DEFAULT_ENDPOINT } from './net.js';

const $ = (sel) => document.querySelector(sel);


const ORIGINS_UI = 'assets/ui/origins';
/** QWER → curated StatusIcons (leaf / spike / shield / smash) */
const SKILL_STATUS_ICON = {
  Q: `${ORIGINS_UI}/status/buff_leaf.png`,
  W: `${ORIGINS_UI}/status/buff_spike.png`,
  E: `${ORIGINS_UI}/status/buff_shield_boost.png`,
  R: `${ORIGINS_UI}/status/buff_dmg_boost.png`,
};
const SHOP_STATUS_ICON = {
  boots: `${ORIGINS_UI}/status/buff_stealth.png`,
  vial: `${ORIGINS_UI}/status/buff_healing_boost.png`,
  relic: `${ORIGINS_UI}/status/power_energy_master.png`,
};


  async function boot() {
    const res = await fetch('data/roster.json');
    const roster = await res.json();

    const canvas = $('#game');
    const overlay = $('#overlay');
    const channelEl = $('#channel');
    const denModal = $('#den-modal');
    const denModalBody = $('#den-modal-body');
    const denModalTitle = $('#den-modal-title');
    let denModalLane = null;
    let denModalInspect = false;
    /** @type {Set<string>} selected parent axie ids for Breed Packs */
    let denBreedParents = new Set();
    /** @type {{ name: string, speciesId: string }|null} last breed result flash */
    let denBreedResult = null;

    const spireModal = $('#spire-modal');
    const spireModalBody = $('#spire-modal-body');
    const spireModalTitle = $('#spire-modal-title');
    /** @type {{ lane: string, tier: number, inspect: boolean }|null} */
    let spireModalKey = null;

    const ui = {
      renderLog(lines) {
        $('#log').innerHTML = lines.slice(0, 12).map((l) => `<div>${escapeHtml(l)}</div>`).join('');
      },
      renderHud(state) {
        $('#gold').textContent = `${state.gold}g`;
        $('#timer').textContent = fmt(state.t);
        const pNest = state.structures.find((s) => s.type === 'nest' && s.team === 'player');
        const eNest = state.structures.find((s) => s.type === 'nest' && s.team === 'enemy');
        const pBar = $('#nest-player');
        const eBar = $('#nest-enemy');
        if (pNest && pBar) {
          pBar.style.width = `${Math.max(0, pNest.hp / pNest.maxHp) * 100}%`;
          const pl = $('#nest-player-label');
          const cpl = $('#combat-nest-player-label');
          const txt = pNest.unlocked ? 'Nest OPEN' : 'Your Nest';
          if (pl) pl.textContent = pNest.unlocked ? 'Nest OPEN' : 'Nest locked';
          if (cpl) cpl.textContent = txt;
        }
        if (eNest && eBar) {
          eBar.style.width = `${Math.max(0, eNest.hp / eNest.maxHp) * 100}%`;
          const el = $('#nest-enemy-label');
          const cel = $('#combat-nest-enemy-label');
          const txt = eNest.unlocked ? 'Nest OPEN' : 'Enemy Nest';
          if (el) el.textContent = eNest.unlocked ? 'Nest OPEN' : 'Nest locked';
          if (cel) cel.textContent = txt;
        }
        // Compact top-left Axie HP rows
        const axBox = $('#combat-axies');
        if (axBox) {
          const pals = state.axies.filter((a) => a.team === 'player');
          axBox.innerHTML = pals.map((a, i) => {
            const sel = i === state.selectedIdx ? 'selected' : '';
            const dead = a.alive ? '' : 'dead';
            const pct = a.maxHp > 0 ? Math.max(0, (a.hp / a.maxHp) * 100) : 0;
            const hpTxt = a.alive ? `${Math.ceil(a.hp)}/${a.maxHp}` : 'DOWN';
            return `<div class="combat-axie ${sel} ${dead}">
              <span class="combat-axie-name">${i + 1}. ${escapeHtml(a.name)} Lv${a.level || 1}</span>
              <span class="combat-axie-hpnum">${hpTxt}</span>
              <div class="origins-hp"><div class="origins-hp-fill" style="width:${pct}%"></div></div>
            </div>`;
          }).join('');
        }
        const ax = game.selected();
        if (ax) ui.renderSkills(ax);
        if (ui.isDenModalOpen() && denModalLane) {
          const den = state.structures.find(
            (s) => s.type === 'den' && s.lane === denModalLane &&
              s.team === (denModalInspect ? 'enemy' : 'player')
          );
          if (!den || !den.alive) {
            ui.closeDenModal();
          } else {
            const sig = `${state.gold}|${den.level}|${den.speciesId}|${den.hp}`;
            if (ui._denModalSig !== sig) {
              ui._denModalSig = sig;
              ui.refreshDenModal(den);
            }
          }
        }
        if (ui.isSpireModalOpen() && spireModalKey) {
          const sp = state.structures.find(
            (s) => s.type === 'spire' && s.lane === spireModalKey.lane &&
              s.tier === spireModalKey.tier &&
              s.team === (spireModalKey.inspect ? 'enemy' : 'player')
          );
          if (!sp || !sp.alive) {
            ui.closeSpireModal();
          } else {
            const sig = `${state.gold}|${sp.level}|${sp.hp}|${sp.maxHp}|${sp.atkDamage}`;
            if (ui._spireModalSig !== sig) {
              ui._spireModalSig = sig;
              ui.refreshSpireModal(sp);
            }
          }
        }
      },
      renderAxies(state) {
        const pals = state.axies.filter((a) => a.team === 'player');
        const box = $('#axie-select');
        box.innerHTML = pals.map((a, i) => {
          const active = i === state.selectedIdx ? 'active' : '';
          const dead = a.alive ? '' : 'dead';
          const items = Object.entries(a.items).filter(([, v]) => v).map(([k]) => k[0].toUpperCase()).join('') || '—';
          const thumb = a.sprite
            ? `<img class="axie-thumb" src="${escapeHtml(a.sprite)}" alt="" width="28" height="21" />`
            : '';
          return `<button class="axie-btn ${active} ${dead}" data-idx="${i}" type="button">
            <span class="axie-btn-row">${thumb}<span>${i + 1}. ${a.name} Lv${a.level || 1}</span></span>
            <small>${escapeHtml(a.class || '?')}${a.speciesId ? ' · ' + escapeHtml(a.speciesId) : ''} · ${a.lane} · ${items}</small>
          </button>`;
        }).join('');
        box.querySelectorAll('button').forEach((btn) => {
          btn.addEventListener('click', () => game.selectAxie(+btn.dataset.idx));
        });
      },
      renderSkills(ax) {
        if (!ax) return;
        const box = $('#skills');
        box.innerHTML = ['Q', 'W', 'E', 'R'].map((k) => {
          const sk = ax.skills[k];
          const ready = sk.cd <= 0;
          const cd = ready ? 'ready' : 'cd';
          const cdTxt = ready ? 'OK' : `${sk.cd.toFixed(1)}s`;
          const icon = SKILL_STATUS_ICON[k] || '';
          const iconHtml = icon
            ? `<img class="skill-icon" src="${icon}" alt="" width="28" height="28" />`
            : '';
          return `<div class="skill origins-skill ${cd}" data-key="${k}" title="${escapeHtml(sk.name)} (${k})">
            <div class="key">${k}</div>
            ${iconHtml}
            <div class="skill-name">${escapeHtml(sk.name)}</div>
            <div class="skill-cd">${cdTxt}</div>
          </div>`;
        }).join('');
        const pass = $('#passives');
        if (pass) {
          const genes = ax.genes || ax.parts || {};
          const eyes = genes.eyes || {};
          const ears = genes.ears || {};
          const trait = ax.trait ? ` · Trait: ${ax.trait.name}` : '';
          const species = ax.class || ax.speciesId || '?';
          pass.innerHTML = `<span class="species-line"><strong>Species:</strong> ${escapeHtml(species)}${trait ? escapeHtml(trait) : ''}</span><br/>`
            + `Eyes: ${escapeHtml(eyes.name || '—')} — ${escapeHtml(eyes.desc || '')} | Ears: ${escapeHtml(ears.name || '—')} — ${escapeHtml(ears.desc || '')}`;
        }
        const chart = $('#class-chart');
        if (chart) {
          chart.textContent = 'Plant > Beast > Aquatic (±15%) · Bird > Bug > Reptile (±12%) · Dawn > Dusk > Mech (±12%) · cross ±8%';
        }
      },
      renderShop(state) {
        const ax = game.selected();
        const box = $('#shop-list');
        box.innerHTML = state.shop.map((item) => {
          const owned = ax && ax.items[item.id];
          const can = ax && ax.alive && !owned && state.gold >= item.cost;
          const icon = SHOP_STATUS_ICON[item.id] || `${ORIGINS_UI}/status/buff_meditate.png`;
          return `<button class="shop-btn origins-shop" data-id="${item.id}" ${can ? '' : 'disabled'} type="button">
            <img class="shop-icon" src="${icon}" alt="" width="22" height="22" />
            <span class="shop-label">${escapeHtml(item.name)} — ${escapeHtml(item.desc)}</span>
            <span class="shop-cost">${owned ? 'OWNED' : item.cost + 'g'}</span>
          </button>`;
        }).join('');
        box.querySelectorAll('button').forEach((btn) => {
          btn.addEventListener('click', () => {
            game.buyItem(btn.dataset.id);
            ui.renderShop(state);
            ui.renderAxies(state);
          });
        });
      },
      // Kept as no-op for game.js callbacks that still invoke renderDens
      renderDens(_state) {},
      isDenModalOpen() {
        return denModal && !denModal.classList.contains('hidden');
      },
      closeDenModal() {
        if (!denModal) return;
        denModal.classList.add('hidden');
        denModal.setAttribute('aria-hidden', 'true');
        denModalLane = null;
        denModalInspect = false;
        denBreedParents = new Set();
        denBreedResult = null;
        if (denModal) denModal.classList.remove('breed-flash');
      },
      openDenModal(den) {
        if (!denModal || !den) return;
        ui.closeSpireModal();
        denModalInspect = den.team !== 'player';
        denModalLane = den.lane;
        denBreedParents = new Set();
        denBreedResult = null;
        denModal.classList.remove('breed-flash');
        denModal.classList.remove('hidden');
        denModal.setAttribute('aria-hidden', 'false');
        ui.refreshDenModal(den);
      },
      refreshDenModal(den) {
        if (!den || !denModalBody || !ui.isDenModalOpen()) return;
        if (denModalLane && den.lane !== denModalLane) return;
        const label = den.lane[0].toUpperCase() + den.lane.slice(1);
        const spDef = (game.packSpeciesDef && game.packSpeciesDef(den.speciesId))
          || (roster.species || roster.packSpecies || []).find((s) => s.id === den.speciesId)
          || null;
        const speciesName = (spDef && spDef.name)
          || (game.packSpeciesName ? game.packSpeciesName(den.speciesId) : null)
          || den.speciesId || '?';
        const traitName = (spDef && spDef.trait && spDef.trait.name) || '';
        const traitDesc = (spDef && spDef.trait && spDef.trait.desc) || '';
        denModalTitle.textContent = `${label} Den` + (denModalInspect ? ' (enemy)' : '');

        if (denModalInspect) {
          denModalBody.innerHTML = `
            <p class="den-modal-inspect">Inspect only — enemy Dens cannot be upgraded.</p>
            <div class="den-modal-row"><span>Pack level</span><strong>L${den.level || 0}</strong></div>
            <div class="den-modal-row"><span>Species</span><strong>${escapeHtml(speciesName)}</strong></div>
            ${traitName ? `<div class="den-modal-row"><span>Trait</span><strong>${escapeHtml(traitName)}</strong></div>
            <p class="den-modal-hint">${escapeHtml(traitDesc)}</p>` : ''}
            <div class="den-modal-row"><span>HP</span><strong>${Math.ceil(den.hp)}/${den.maxHp}</strong></div>
            <p class="den-modal-hint">Esc / click outside to close.</p>
          `;
          return;
        }

        const cost = game.denUpgradeCost(den);
        const maxLv = game.DEN_MAX_LEVEL;
        let upgradeBtn;
        if (cost == null) {
          upgradeBtn = `<button class="den-modal-btn" disabled type="button">
            <span>Pack upgrade</span><span>L${den.level} MAX</span>
          </button>`;
        } else {
          const can = game.state.gold >= cost;
          upgradeBtn = `<button class="den-modal-btn primary" data-act="upgrade" ${can ? '' : 'disabled'} type="button">
            <span>Upgrade Packs L${den.level}→${den.level + 1}</span><span>${cost}g</span>
          </button>`;
        }

        const breedCost = game.BREED_PACK_COST;
        const pals = game.state.axies.filter((a) => a.team === 'player');
        // Keep selection valid against current roster ids
        const rosterIds = new Set(pals.map((a) => a.id));
        for (const id of [...denBreedParents]) {
          if (!rosterIds.has(id)) denBreedParents.delete(id);
        }
        const parentChips = pals.map((a) => {
          const selected = denBreedParents.has(a.id) ? 'selected' : '';
          const dead = a.alive ? '' : 'dead';
          const laneLab = a.lane[0].toUpperCase() + a.lane.slice(1);
          const thumb = a.sprite
            ? `<img src="${escapeHtml(a.sprite)}" alt="${escapeHtml(a.name)}" width="44" height="33" />`
            : '';
          const status = a.alive ? laneLab : `${laneLab} · KO`;
          return `<button class="den-parent-btn ${selected} ${dead}" data-parent="${escapeHtml(a.id)}" type="button" title="${escapeHtml(a.name)} (${status}) — genetic parent">
            ${thumb}<span>${escapeHtml(a.name)}</span>
            <small>${escapeHtml(status)}</small>
          </button>`;
        }).join('');

        const nSel = denBreedParents.size;
        const canBreed = nSel >= 2 && nSel <= 3 && game.state.gold >= breedCost;
        const breedDisableReason = nSel < 2
          ? 'Pick 2–3 parents'
          : (nSel > 3 ? 'Max 3 parents' : (game.state.gold < breedCost ? `Need ${breedCost}g` : ''));
        const breedBtn = `<button class="den-modal-btn primary" data-act="breed" ${canBreed ? '' : 'disabled'} type="button">
            <span>Breed Packs</span><span>${breedCost}g</span>
          </button>`;
        const resultHtml = denBreedResult
          ? `<p class="den-breed-result">Bred ${escapeHtml(label)} Packs → <strong>${escapeHtml(denBreedResult.name)}</strong>${denBreedResult.traitName ? ' · ' + escapeHtml(denBreedResult.traitName) : ''}!</p>`
          : '';

        denModalBody.innerHTML = `
          <div class="den-modal-row"><span>Lane</span><strong>${label}</strong></div>
          <div class="den-modal-row"><span>Pack upgrade level</span><strong>L${den.level || 0} / ${maxLv}</strong></div>
          <div class="den-modal-row"><span>Pack species</span><strong>${escapeHtml(speciesName)}</strong></div>
          ${traitName ? `<div class="den-modal-row"><span>Trait</span><strong title="${escapeHtml(traitDesc)}">${escapeHtml(traitName)}</strong></div>
          <p class="den-modal-hint">${escapeHtml(traitDesc)}</p>` : ''}
          <div class="den-modal-actions">${upgradeBtn}</div>
          <p class="den-modal-hint" style="margin-top:14px;margin-bottom:4px;">Breed Packs — select 2 or 3 Axies as parents (dead OK)</p>
          <div class="den-parent-grid">${parentChips}</div>
          <div class="den-modal-actions" style="margin-top:10px;">${breedBtn}</div>
          ${breedDisableReason && !canBreed ? `<p class="den-modal-hint">${escapeHtml(breedDisableReason)}</p>` : ''}
          ${resultHtml}
          <p class="den-modal-hint">Rolls a random class from all 9 Axie species. Future Packs use that sprite (lane Axie unchanged). Esc / X / outside to close.</p>
        `;

        const upBtn = denModalBody.querySelector('[data-act="upgrade"]');
        if (upBtn) {
          upBtn.addEventListener('click', () => {
            game.upgradeDen(den.lane, 'player');
            const fresh = game.denFor('player', den.lane);
            if (fresh && fresh.alive) ui.refreshDenModal(fresh);
            else ui.closeDenModal();
            ui.renderHud(game.state);
          });
        }
        denModalBody.querySelectorAll('[data-parent]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.parent;
            if (denBreedParents.has(id)) denBreedParents.delete(id);
            else {
              if (denBreedParents.size >= 3) return; // max 3
              denBreedParents.add(id);
            }
            const fresh = game.denFor('player', den.lane);
            if (fresh && fresh.alive) ui.refreshDenModal(fresh);
          });
        });
        const breedEl = denModalBody.querySelector('[data-act="breed"]');
        if (breedEl) {
          breedEl.addEventListener('click', () => {
            const ids = [...denBreedParents];
            const res = game.breedDenPacks(den.lane, ids, 'player');
            if (res && res.name) {
              denBreedResult = {
                name: res.name,
                speciesId: res.speciesId,
                traitName: (res.trait && res.trait.name) || '',
              };
              if (denModal) {
                denModal.classList.remove('breed-flash');
                // restart animation
                void denModal.offsetWidth;
                denModal.classList.add('breed-flash');
              }
            }
            const fresh = game.denFor('player', den.lane);
            if (fresh && fresh.alive) ui.refreshDenModal(fresh);
            else ui.closeDenModal();
            ui.renderHud(game.state);
          });
        }
      },
      isSpireModalOpen() {
        return spireModal && !spireModal.classList.contains('hidden');
      },
      closeSpireModal() {
        if (!spireModal) return;
        spireModal.classList.add('hidden');
        spireModal.setAttribute('aria-hidden', 'true');
        spireModalKey = null;
      },
      openSpireModal(spire) {
        if (!spireModal || !spire || spire.type !== 'spire') return;
        ui.closeDenModal();
        spireModalKey = {
          lane: spire.lane,
          tier: spire.tier,
          inspect: spire.team !== 'player',
        };
        spireModal.classList.remove('hidden');
        spireModal.setAttribute('aria-hidden', 'false');
        ui.refreshSpireModal(spire);
      },
      refreshSpireModal(spire) {
        if (!spire || !spireModalBody || !ui.isSpireModalOpen()) return;
        if (spireModalKey &&
            (spire.lane !== spireModalKey.lane || spire.tier !== spireModalKey.tier)) return;
        const inspect = spireModalKey ? spireModalKey.inspect : spire.team !== 'player';
        const title = game.spireLabel(spire) + (inspect ? ' (enemy)' : '');
        spireModalTitle.textContent = title;
        const lv = spire.level || 0;
        const maxLv = game.SPIRE_MAX_LEVEL;

        if (inspect) {
          spireModalBody.innerHTML = `
            <p class="den-modal-inspect">Inspect only — enemy Spires cannot be repaired or upgraded.</p>
            <div class="den-modal-row"><span>Tier</span><strong>T${spire.tier}</strong></div>
            <div class="den-modal-row"><span>Upgrade level</span><strong>L${lv}</strong></div>
            <div class="den-modal-row"><span>HP</span><strong>${Math.ceil(spire.hp)}/${spire.maxHp}</strong></div>
            <div class="den-modal-row"><span>Attack</span><strong>${spire.atkDamage}</strong></div>
            <p class="den-modal-hint">Esc / click outside to close.</p>
          `;
          return;
        }

        const repairCost = game.spireRepairCost(spire);
        const repairAmt = game.spireRepairAmount(spire);
        let repairBtn;
        if (repairCost == null || repairAmt <= 0) {
          repairBtn = `<button class="den-modal-btn" disabled type="button">
            <span>Repair</span><span>Full HP</span>
          </button>`;
        } else {
          const can = game.state.gold >= repairCost;
          repairBtn = `<button class="den-modal-btn primary" data-act="repair" ${can ? '' : 'disabled'} type="button">
            <span>Repair +${repairAmt} HP</span><span>${repairCost}g</span>
          </button>`;
        }

        const upCost = game.spireUpgradeCost(spire);
        let upgradeBtn;
        if (upCost == null) {
          upgradeBtn = `<button class="den-modal-btn" disabled type="button">
            <span>Upgrade Spire</span><span>L${lv} MAX</span>
          </button>`;
        } else {
          const can = game.state.gold >= upCost;
          upgradeBtn = `<button class="den-modal-btn primary" data-act="upgrade" ${can ? '' : 'disabled'} type="button">
            <span>Upgrade Spire L${lv}→${lv + 1}</span><span>${upCost}g</span>
          </button>`;
        }

        spireModalBody.innerHTML = `
          <div class="den-modal-row"><span>Lane</span><strong>${spire.lane[0].toUpperCase() + spire.lane.slice(1)}</strong></div>
          <div class="den-modal-row"><span>Tier</span><strong>${spire.tier === 1 ? 'Outer T1' : 'Inner T2'}</strong></div>
          <div class="den-modal-row"><span>Upgrade level</span><strong>L${lv} / ${maxLv}</strong></div>
          <div class="den-modal-row"><span>HP</span><strong>${Math.ceil(spire.hp)}/${spire.maxHp}</strong></div>
          <div class="den-modal-row"><span>Attack</span><strong>${spire.atkDamage}</strong></div>
          <div class="den-modal-actions">${repairBtn}${upgradeBtn}</div>
          <p class="den-modal-hint">Repair restores ~35% max HP (60g light / 120g heavy). Upgrade adds max HP + attack. Destroyed Spires cannot be rebuilt. Esc / X / outside to close.</p>
        `;

        const repairEl = spireModalBody.querySelector('[data-act="repair"]');
        if (repairEl) {
          repairEl.addEventListener('click', () => {
            game.repairSpire(spire.lane, spire.tier, 'player');
            const fresh = game.spireFor('player', spire.lane, spire.tier);
            if (fresh && fresh.alive) ui.refreshSpireModal(fresh);
            else ui.closeSpireModal();
            ui.renderHud(game.state);
          });
        }
        const upEl = spireModalBody.querySelector('[data-act="upgrade"]');
        if (upEl) {
          upEl.addEventListener('click', () => {
            game.upgradeSpire(spire.lane, spire.tier, 'player');
            const fresh = game.spireFor('player', spire.lane, spire.tier);
            if (fresh && fresh.alive) ui.refreshSpireModal(fresh);
            else ui.closeSpireModal();
            ui.renderHud(game.state);
          });
        }
      },
      setChannel(on, text) {
        channelEl.style.display = on ? 'block' : 'none';
        if (text) channelEl.textContent = text;
      },
      showEnd(winner) {
        ui.closeDenModal();
        ui.closeSpireModal();
        overlay.classList.remove('hidden');
        overlay.classList.toggle('end-victory', winner === 'player');
        overlay.classList.toggle('end-defeat', winner !== 'player');
        const flag = $('#overlay-flag');
        if (flag) {
          flag.classList.remove('hidden');
          flag.src = winner === 'player'
            ? `${ORIGINS_UI}/InBattle/flag_victory.png`
            : `${ORIGINS_UI}/InBattle/roguelike_end_defeat.png`;
          flag.alt = winner === 'player' ? 'Victory' : 'Defeat';
        }
        $('#overlay-title').textContent = winner === 'player' ? 'Victory' : 'Defeat';
        $('#overlay-body').textContent =
          winner === 'player'
            ? 'You shattered the enemy Nest. Lunacia holds for now.'
            : 'Your Nest fell. Requeue the trainer and try a sharper last-hit.';
        $('#start-btn').textContent = 'Play again';
      },
    };

    let gameContract = null;
    try {
      if (window.LunaciaRift && typeof window.LunaciaRift.loadGameContract === 'function') {
        gameContract = await window.LunaciaRift.loadGameContract();
      } else {
        const cres = await fetch('assets/map/lunacia_rift.game.json');
        if (cres.ok) gameContract = await cres.json();
      }
      if (gameContract) {
        console.info(
          '[LunaciaRift] loaded game contract',
          gameContract.profile_id,
          'seed',
          gameContract.seed,
          'structures',
          (gameContract.structures && gameContract.structures.length) || 0,
        );
      }
    } catch (err) {
      console.warn('[LunaciaRift] game contract skipped', err);
    }
    const game = window.LunaciaRift.createGame(roster, canvas, ui, gameContract);

    // Origins Battle Kit browser VFX (additive atlas overlay; no Pixi)
    try {
      attachOriginsVfx(game, canvas).catch((err) => {
        console.warn('[LunaciaRift] Origins VFX attach failed', err);
      });
    } catch (err) {
      console.warn('[LunaciaRift] Origins VFX attach failed', err);
    }

    // Three.js GLB kit-mascot heroes (default OFF; ?glb=1 → GLB). Failures keep Canvas heroes.
    try {
      if (window.USE_GLB_HEROES === true) {
        attachGlbHeroes(game, canvas).catch((err) => {
          console.warn('[LunaciaRift] GLB heroes failed — Canvas PNG remain', err);
        });
      }
    } catch (err) {
      console.warn('[LunaciaRift] GLB heroes failed — Canvas PNG remain', err);
    }

    // Round-1 Mixer Spine attack spike (sample genes). Failures keep Canvas heroes.
    try {
      if (window.USE_SPINE_HEROES !== false) {
        attachSpineHeroes(game, canvas)
          .then((api) => {
            // Optional headless/demo: ?spineDemo=1 starts match and casts Q on selected.
            try {
              const q = new URLSearchParams(location.search);
              if (api && q.get('spineDemo') === '1') {
                overlay.classList.add('hidden');
                game.start();
                setTimeout(() => {
                  const ax = game.selected();
                  if (ax) {
                    // Force CD ready for demo cast
                    ['Q', 'W', 'E', 'R'].forEach((k) => { if (ax.skills[k]) ax.skills[k].cd = 0; });
                    // Prefer direct playAttack so we see anim even if castSkill gating changes
                    if (window.SpineHeroes && window.SpineHeroes.playAttackForAxie) {
                      window.SpineHeroes.playAttackForAxie(ax, 'Q');
                    }
                    // Also cast skill for full gameplay path
                    const ev = new KeyboardEvent('keydown', { key: 'q', bubbles: true });
                    window.dispatchEvent(ev);
                    document.body.dataset.spineDemoCast = '1';
                  }
                }, 700);
              }
            } catch (e) {
              console.warn('[LunaciaRift] spineDemo failed', e);
            }
          })
          .catch((err) => {
            console.warn('[LunaciaRift] Spine spike failed — Canvas heroes remain', err);
          });
      }
    } catch (err) {
      console.warn('[LunaciaRift] Spine spike failed — Canvas heroes remain', err);
    }


    // --- Multiplayer (Colyseus lunacia_rift) ---
    const net = createNet();
    let mpMode = 'solo';
    let snapshotTimer = null;
    let localReady = false;
    let mpMatchStarted = false;

    const mpEndpointLabel = $('#mp-endpoint-label');
    if (mpEndpointLabel) mpEndpointLabel.textContent = resolveEndpoint() || DEFAULT_ENDPOINT;

    function setMpError(msg) {
      const el = $('#mp-error');
      if (!el) return;
      if (!msg) {
        el.classList.add('hidden');
        el.textContent = '';
        return;
      }
      el.classList.remove('hidden');
      el.textContent = msg;
    }

    function setMode(mode) {
      mpMode = mode === 'mp' ? 'mp' : 'solo';
      const soloBtn = $('#mode-solo');
      const mpBtn = $('#mode-mp');
      if (soloBtn) soloBtn.classList.toggle('active', mpMode === 'solo');
      if (mpBtn) mpBtn.classList.toggle('active', mpMode === 'mp');
      const soloPanel = $('#solo-panel');
      const mpPanel = $('#mp-panel');
      if (soloPanel) soloPanel.classList.toggle('hidden', mpMode !== 'solo');
      if (mpPanel) mpPanel.classList.toggle('hidden', mpMode !== 'mp');
      setMpError('');
    }

    function renderMpPlayers(detail) {
      const list = $('#mp-players');
      const status = $('#mp-status');
      const inviteEl = $('#mp-invite-code');
      const startBtn = $('#mp-start');
      const readyBtn = $('#mp-ready');
      if (inviteEl && detail.inviteCode) inviteEl.textContent = detail.inviteCode;
      const players = detail.players || [];
      if (list) {
        list.innerHTML = players.map((p) => {
          const you = p.sessionId === net.sessionId ? ' (you)' : '';
          const host = detail.isHost && p.sessionId === net.sessionId ? ' · host' : '';
          const ready = p.isReady
            ? '<span class="ready-yes">Ready</span>'
            : '<span class="ready-no">Not ready</span>';
          return `<li><span><span class="side-tag">${escapeHtml(p.side || '?')}</span> ${escapeHtml(p.displayName || 'Player')}${you}${host}</span>${ready}</li>`;
        }).join('');
      }
      if (status) {
        status.textContent = `Phase: ${detail.phase || net.phase} · ${players.length}/2 players · side ${detail.side || net.side || '—'}`;
      }
      if (startBtn) {
        const show = !!(detail.isHost || net.isHost) && (detail.phase || net.phase) === 'lobby';
        startBtn.classList.toggle('hidden', !show);
      }
      if (readyBtn && (detail.phase || net.phase) === 'lobby') {
        readyBtn.textContent = localReady ? 'Unready' : 'Ready';
      }
    }

    function clearSnapshotTimer() {
      if (snapshotTimer) {
        clearInterval(snapshotTimer);
        snapshotTimer = null;
      }
    }

    function beginMultiplayerMatch() {
      if (mpMatchStarted) return;
      mpMatchStarted = true;
      clearSnapshotTimer();
      overlay.classList.add('hidden');
      overlay.classList.remove('end-victory', 'end-defeat');
      const flag = $('#overlay-flag');
      if (flag) {
        flag.classList.add('hidden');
        flag.removeAttribute('src');
      }
      game.setMultiplayer({
        enabled: true,
        isHost: net.isHost,
        side: net.side,
        disableEnemyAI: true,
        onLocalCmd: (payload) => { net.sendCmd(payload); },
        onMatchEndLocal: (winnerTeam) => {
          if (!net.isHost) return;
          // Mirrored: local player win → this session won
          const winnerSessionId = winnerTeam === 'player' ? net.sessionId : '';
          net.matchEnd({
            winnerSessionId,
            endReason: 'nest_destroyed',
          });
        },
      });
      game.start();
      // Optional host snapshot every ~200ms (enemy correction on guest)
      if (net.isHost) {
        snapshotTimer = setInterval(() => {
          if (!net.multiplayer || net.phase !== 'playing') return;
          try { net.sendSnapshot(game.getSnapshot()); } catch (e) { /* */ }
        }, 200);
      }
    }

    net.setCallbacks({
      onPlayers: (detail) => {
        const lobby = $('#mp-lobby');
        if (lobby) lobby.classList.remove('hidden');
        renderMpPlayers(detail || {});
      },
      onPhase: (detail) => {
        renderMpPlayers(detail || {});
        if (detail && detail.phase === 'playing') beginMultiplayerMatch();
      },
      onMatchStarted: () => { beginMultiplayerMatch(); },
      onCmd: (envelope) => {
        if (!envelope || !envelope.payload) return;
        game.applyRemoteCmd(envelope.payload);
      },
      onSnapshot: (payload) => {
        if (net.isHost) return;
        game.applySnapshot(payload);
      },
      onMatchEnded: (info) => {
        clearSnapshotTimer();
        if (game.state.ended) return;
        const won = info && info.winnerSessionId && info.winnerSessionId === net.sessionId;
        game.state.ended = true;
        game.state.running = false;
        game.state.winner = won ? 'player' : 'enemy';
        if (ui.showEnd) ui.showEnd(game.state.winner);
      },
      onError: (err) => {
        setMpError((err && err.message) || String(err));
      },
      onConnection: (ok) => {
        if (!ok && mpMode === 'mp' && !game.state.running) {
          setMpError('Disconnected from room');
        }
      },
    });

    async function mpCreate() {
      setMpError('');
      const name = (($('#mp-name') && $('#mp-name').value) || 'Host').trim() || 'Host';
      localReady = false;
      mpMatchStarted = false;
      try {
        await net.createRoom({ displayName: name });
        const lobby = $('#mp-lobby');
        if (lobby) lobby.classList.remove('hidden');
        renderMpPlayers({
          players: net.players,
          inviteCode: net.inviteCode,
          phase: net.phase,
          isHost: net.isHost,
          side: net.side,
        });
      } catch (err) {
        setMpError((err && err.message) || String(err));
      }
    }

    async function mpJoin() {
      setMpError('');
      const name = (($('#mp-name') && $('#mp-name').value) || 'Guest').trim() || 'Guest';
      const code = (($('#mp-code') && $('#mp-code').value) || '').trim();
      localReady = false;
      mpMatchStarted = false;
      try {
        await net.joinRoom({ inviteCode: code, displayName: name });
        const lobby = $('#mp-lobby');
        if (lobby) lobby.classList.remove('hidden');
        renderMpPlayers({
          players: net.players,
          inviteCode: net.inviteCode,
          phase: net.phase,
          isHost: net.isHost,
          side: net.side,
        });
      } catch (err) {
        setMpError((err && err.message) || String(err));
      }
    }

    function mpToggleReady() {
      localReady = !localReady;
      net.setReady(localReady);
      const readyBtn = $('#mp-ready');
      if (readyBtn) readyBtn.textContent = localReady ? 'Unready' : 'Ready';
    }

    async function mpLeave() {
      clearSnapshotTimer();
      if (net.phase === 'playing') net.forfeit();
      await net.leave();
      localReady = false;
      mpMatchStarted = false;
      game.setMultiplayer({ enabled: false, disableEnemyAI: false, onLocalCmd: null, onMatchEndLocal: null });
      const lobby = $('#mp-lobby');
      if (lobby) lobby.classList.add('hidden');
      setMpError('');
    }

    const modeSolo = $('#mode-solo');
    const modeMp = $('#mode-mp');
    if (modeSolo) modeSolo.addEventListener('click', () => setMode('solo'));
    if (modeMp) modeMp.addEventListener('click', () => setMode('mp'));
    const mpCreateBtn = $('#mp-create');
    const mpJoinBtn = $('#mp-join');
    const mpReadyBtn = $('#mp-ready');
    const mpStartBtn = $('#mp-start');
    const mpLeaveBtn = $('#mp-leave');
    const mpCopyBtn = $('#mp-copy');
    if (mpCreateBtn) mpCreateBtn.addEventListener('click', () => { mpCreate(); });
    if (mpJoinBtn) mpJoinBtn.addEventListener('click', () => { mpJoin(); });
    if (mpReadyBtn) mpReadyBtn.addEventListener('click', () => { mpToggleReady(); });
    if (mpStartBtn) mpStartBtn.addEventListener('click', () => { net.startMatch(); });
    if (mpLeaveBtn) mpLeaveBtn.addEventListener('click', () => { mpLeave(); });
    if (mpCopyBtn) {
      mpCopyBtn.addEventListener('click', async () => {
        const code = net.inviteCode || (($('#mp-invite-code') && $('#mp-invite-code').textContent) || '');
        try {
          await navigator.clipboard.writeText(code);
          mpCopyBtn.textContent = 'Copied';
          setTimeout(() => { mpCopyBtn.textContent = 'Copy'; }, 1200);
        } catch (e) {
          setMpError('Copy failed — select the code manually');
        }
      });
    }

    window.addEventListener('beforeunload', () => {
      if (net.multiplayer && net.phase === 'playing') {
        try { net.forfeit(); } catch (e) { /* */ }
      }
    });

    $('#start-btn').addEventListener('click', () => {
      // Full reload keeps prototype simple for rematch
      if (game.state.ended) {
        location.reload();
        return;
      }
      // Solo path only
      game.setMultiplayer({ enabled: false, disableEnemyAI: false, onLocalCmd: null, onMatchEndLocal: null });
      overlay.classList.add('hidden');
      overlay.classList.remove('end-victory', 'end-defeat');
      const flag = $('#overlay-flag');
      if (flag) {
        flag.classList.add('hidden');
        flag.removeAttribute('src');
      }
      game.start();
    });

    $('#lane-top').addEventListener('click', () => game.startLaneChannel('top'));
    $('#lane-mid').addEventListener('click', () => game.startLaneChannel('mid'));
    $('#lane-bot').addEventListener('click', () => game.startLaneChannel('bot'));

    // Den / Spire modal close: X / backdrop
    const denX = $('#den-modal-x');
    if (denX) denX.addEventListener('click', () => ui.closeDenModal());
    if (denModal) {
      denModal.querySelectorAll('[data-den-close]').forEach((el) => {
        el.addEventListener('click', () => ui.closeDenModal());
      });
    }
    const spireX = $('#spire-modal-x');
    if (spireX) spireX.addEventListener('click', () => ui.closeSpireModal());
    if (spireModal) {
      spireModal.querySelectorAll('[data-spire-close]').forEach((el) => {
        el.addEventListener('click', () => ui.closeSpireModal());
      });
    }

    // Hold-to-zoom-out (pointer + touch); release returns to zoomed-in follow
    const zoomBtn = $('#zoom-out-btn');
    if (zoomBtn) {
      const hold = (on) => {
        game.setZoomOutHeld(on);
        zoomBtn.classList.toggle('held', on);
      };
      const down = (ev) => { ev.preventDefault(); hold(true); };
      const up = (ev) => { ev.preventDefault(); hold(false); };
      zoomBtn.addEventListener('pointerdown', down);
      zoomBtn.addEventListener('pointerup', up);
      zoomBtn.addEventListener('pointerleave', up);
      zoomBtn.addEventListener('pointercancel', up);
      zoomBtn.addEventListener('touchstart', down, { passive: false });
      zoomBtn.addEventListener('touchend', up);
      zoomBtn.addEventListener('touchcancel', up);
    }
  }

  function fmt(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#f88;padding:20px">Failed to load roster: ${err}</pre>`;
});
