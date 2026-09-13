# @axieinfinity/mixer

![NPM version][npm-image]

[npm-image]: https://img.shields.io/npm/v/%40axieinfinity%2Fmixer

A utility for rendering 2D Axie with support for accessories, animations, and PixiJS integration.

## 📦 Installation

```bash
npm install @axieinfinity/mixer
```

or with yarn

```bash
yarn add @axieinfinity/mixer
```

## 📋 Prerequisites

To render Axies with PixiJS, you'll need these dependencies:

```json
{
  "dependencies": {
    "pixi.js": "7.2.4",
    "pixi-spine": "4.0.3",
    "@axieinfinity/mixer": "lasted"
  }
}
```

Install them:

```bash
npm install or yarn install
```

## ⚠️ Important Notes

- This version does not include data by default. You must import the required JSON data files and call `initAxieMixer` before using the utility functions.
- To render evolved parts, use version ***1.4.1*** or later.
- Accessories use Spine 2D format and require proper y-axis flipping for correct orientation.

## 🆕 Features

- **Images URL**: https://axiecdn.axieinfinity.com/mixer-stuffs/v6
- **Accessory spines URL**: https://axiecdn.axieinfinity.com/mixer-stuffs/accessory-spines/v1
- **Full support for Nightmare parts**
- **All accessories migrated to Spine 2D**
- **PixiJS v7+ compatibility**
- **Complete animation system**

## 🚀 Complete Working Example



### package.json

```json
{
  "name": "axie-mixer-demo",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "pixi.js": "7.2.4",
    "pixi-spine": "4.0.3",
    "@axieinfinity/mixer": "1.4.8"
  },
  "devDependencies": {
    "typescript": "5.6.0",
    "vite": "5.4.0"
  }
}
```

### HTML Setup

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Axie Mixer Demo</title>
    <style>
      :root {
        font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
        line-height: 1.5;
        font-weight: 400;

        color-scheme: light dark;
        color: rgba(255, 255, 255, 0.87);
        background-color: #242424;

        font-synthesis: none;
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      body {
        margin: 0;
        min-width: 320px;
        min-height: 100vh;
      }

      #app {
        max-width: 1280px;
        margin: 0 auto;
        padding: 2rem;
        text-align: center;
      }

      h1 {
        font-size: 3.2em;
        line-height: 1.1;
        margin-bottom: 1em;
      }

      #controls {
        margin-bottom: 2rem;
        display: flex;
        gap: 1rem;
        justify-content: center;
        align-items: center;
      }

      #pixi-container {
        border: 2px solid #646cff;
        border-radius: 8px;
        margin: 0 auto;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        position: relative;
        overflow: hidden;
        width: 800px;
        height: 600px;
      }

      #pixi-canvas {
        width: 100%;
        height: 100%;
      }

      #loading {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 1rem 2rem;
        border-radius: 8px;
        z-index: 1000;
      }

      button {
        border-radius: 8px;
        border: 1px solid transparent;
        padding: 0.6em 1.2em;
        font-size: 1em;
        font-weight: 500;
        font-family: inherit;
        background-color: #646cff;
        color: white;
        cursor: pointer;
        transition: all 0.25s;
      }

      button:hover {
        background-color: #535bf2;
        transform: translateY(-2px);
      }

      button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
      }

      button:focus,
      button:focus-visible {
        outline: 4px auto -webkit-focus-ring-color;
      }

      .error {
        color: #ff6b6b;
        background-color: rgba(255, 107, 107, 0.1);
        border: 1px solid #ff6b6b;
        border-radius: 8px;
        padding: 1rem;
        margin: 1rem 0;
      }

      @media (prefers-color-scheme: light) {
        :root {
          color: #213547;
          background-color: #ffffff;
        }
        
        button {
          background-color: #646cff;
          color: white;
        }
        
        button:hover {
          background-color: #535bf2;
        }
      }
    </style>
  </head>
  <body>
    <div id="app">
      <h1>Axie Mixer Demo</h1>
      <div id="controls">
        <button id="load-axie">Load Axie with Accessories</button>
        <button id="change-animation">Change Animation</button>
        <div id="loading" style="display: none;">Loading...</div>
      </div>
      <div id="pixi-container">
        <canvas id="pixi-canvas"></canvas>
      </div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

### Full TypeScript Implementation

```typescript
import { Application, Assets, Texture } from 'pixi.js';
import { Spine, TextureAtlas } from 'pixi-spine';
import type { ISkeletonData } from '@pixi-spine/base';
import type { ISpineResource } from '@pixi-spine/loader-base';
import { AtlasAttachmentLoader, SkeletonJson } from '@pixi-spine/runtime-3.8';
import {
  initAxieMixer,
  getAxieSpineFromGenes,
  getAxieColorPartShift,
  getVariantAttachmentPath,
  AxieBuilderResult,
} from '@axieinfinity/mixer';

// Import required data files
import GenesData from '@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-genes.json';
import SamplesData from '@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-samples.json';
import VariantsData from '@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-variant.json';
import AnimationsData from '@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-animations.json';

// CDN URLs
const AXIE_IMAGES_URL = 'https://axiecdn.axieinfinity.com/mixer-stuffs/v6/';
const ACCESSORY_SPINES_URL = 'https://axiecdn.axieinfinity.com/mixer-stuffs/accessory-spines/v1';

// Sample equipped accessories
const EQUIPPED_ACCESSORIES = [
  {
    "attributes": {
      "collection": [
        "Nightmare"
      ],
      "key": "air2a",
      "placement": "Air",
      "rarity": "Epic",
      "token_id": "25"
    },
    "description": "",
    "imageUrl": "https://cdn.axieinfinity.com/marketplace-website/accessories/25.png",
    "name": "Eyewyrm",
    "tokenId": "25",
    "tokenType": "Accessory",
    "__typename": "Erc1155Token"
  },
  {
    "attributes": {
      "collection": [
        "Nightmare"
      ],
      "key": "cheek2a",
      "placement": "Cheek",
      "rarity": "Common",
      "token_id": "23"
    },
    "description": "",
    "imageUrl": "https://cdn.axieinfinity.com/marketplace-website/accessories/23.png",
    "name": "Bloodmaw",
    "tokenId": "23",
    "tokenType": "Accessory",
    "__typename": "Erc1155Token"
  },
  {
    "attributes": {
      "collection": [
        "Japanese"
      ],
      "key": "ground3a",
      "placement": "Ground",
      "rarity": "Epic",
      "token_id": "26"
    },
    "description": "",
    "imageUrl": "https://cdn.axieinfinity.com/marketplace-website/accessories/26.png",
    "name": "Daruma",
    "tokenId": "26",
    "tokenType": "Accessory",
    "__typename": "Erc1155Token"
  }
]

type AccessoryConfig = typeof EQUIPPED_ACCESSORIES[number];

class AxieRenderer {
  private app: Application;
  private axieSpine?: Spine;
  private currentAnimationIndex = 0;
  private animations = [
    'action/idle/normal',
    'action/idle/random-02',
    'draft/run-origin',
    'attack/ranged/cast-fly',
    'attack/melee/tail-smash'
  ];

  constructor() {
    this.app = new Application({
      width: 800,
      view: document.getElementById('pixi-canvas') as HTMLCanvasElement,
      height: 600,
      backgroundColor: 0x1099bb,
      resolution: window.devicePixelRatio || 1,
    });
  }

  async initialize(): Promise<void> {
    // Initialize the PIXI Application
    // Initialize the mixer with data
    initAxieMixer(GenesData, SamplesData, VariantsData, AnimationsData);
    console.log('AxieRenderer initialized successfully');
  }

  async renderAxieWithAccessories(): Promise<void> {
    try {
      this.showLoading(true);
      this.app.stage.removeChildren();

      // Sample Axie genes
      const axieGenes = '0x20000000000003000181a09082040000000100040800800400000090086044020001000010008002000100100840450200010004186044020001001008808404';
      
      // Configure accessories
      const meta = new Map<string, string>();
      EQUIPPED_ACCESSORIES.forEach(accessory => {
        meta.set(`accessory-${accessory.attributes.placement.toLowerCase()}`, `accessory-${accessory.attributes.key}`);
      });

      console.log('Generating Axie spine data...');

      // Generate Axie spine data
      const { skeletonDataAsset, variant }: AxieBuilderResult = 
        getAxieSpineFromGenes(axieGenes, meta, false);

      if (!skeletonDataAsset) {
        throw new Error('Failed to generate Axie skeleton data');
      }

      console.log('Creating Axie spine...');

      // Create and display the Axie
      this.axieSpine = await this.createAxieSpine(skeletonDataAsset, variant);
      this.axieSpine.position.set(400, 400);
      this.axieSpine.scale.set(0.3);
      
      // Start idle animation
      this.axieSpine.state.setAnimation(0, 'action/idle/normal', true);
      
      this.app.stage.addChild(this.axieSpine);

      console.log('Adding accessories...');

      // Add accessories
      await this.addAccessories(EQUIPPED_ACCESSORIES);

      console.log('Axie rendered successfully!');
      this.showLoading(false);

    } catch (error) {
      console.error('Failed to render Axie:', error);
      this.showError(`Failed to render Axie: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.showLoading(false);
    }
  }

  private async createAxieSpine(skeletonData: AxieBuilderResult['skeletonDataAsset'], variant: string): Promise<Spine> {
    // Get all required textures for this Axie
    const resources = this.getRequiredTextures(skeletonData, variant);
    
    console.log(`Loading ${resources.length} textures...`);
    
    // Load all textures
    const texturePromises = resources.map(async (resource) => {
      try {
        const texture = await Assets.load(resource.imagePath);
        return { key: resource.key, texture };
      } catch (error) {
        console.warn(`Failed to load texture ${resource.key}:`, error);
        // Return a placeholder or skip this texture
        return null;
      }
    });
    
    const loadedTextures = (await Promise.all(texturePromises)).filter(Boolean);
    
    // Create texture hash
    const allTextures: { [key: string]: Texture } = {};
    loadedTextures.forEach(record => {
      if (!record || !record.key || !record.texture) return;
      const { key, texture } = record;
      allTextures[key] = texture;
    });

    console.log(`Loaded ${Object.keys(allTextures).length} textures`);

    // Create Spine atlas and loader
    const spineAtlas = new TextureAtlas();
    spineAtlas.addTextureHash(allTextures, false);
    
    const spineAtlasLoader = new AtlasAttachmentLoader(spineAtlas);
    const spineJsonParser = new SkeletonJson(spineAtlasLoader);
    
    // Parse skeleton data and create Spine
    const spineData = spineJsonParser.readSkeletonData(skeletonData);
    return new Spine(spineData);
  }

  private getRequiredTextures(skeletonData: AxieBuilderResult['skeletonDataAsset'], variant: string): Array<{ key: string; imagePath: string }> {
    const skinAttachments = skeletonData.skins[0].attachments;
    const imagesToLoad: Array<{ key: string; imagePath: string }> = [];
    
    const partColorShift = getAxieColorPartShift(variant);
    
    for (const slotName in skinAttachments) {
      const skinSlotAttachments = skinAttachments[slotName];
      for (const attachmentName in skinSlotAttachments) {
        const path = skinSlotAttachments[attachmentName].path;
        const imagePath = AXIE_IMAGES_URL + 
          getVariantAttachmentPath(slotName, path, variant, partColorShift);
        
        imagesToLoad.push({ key: path, imagePath });
      }
    }
    
    return imagesToLoad;
  }

  private async addAccessories(accessories: AccessoryConfig[]): Promise<void> {
    if (!this.axieSpine) return;

    for (const accessory of accessories) {
      try {
        console.log(`Loading accessory: ${accessory.name}`);
        
        // Load accessory spine data
        const accessoryUrl = `${ACCESSORY_SPINES_URL}/${accessory.attributes.key}/${accessory.attributes.key}.json`;
        const skeletonData: ISpineResource<ISkeletonData> = await Assets.load(accessoryUrl);
        const spineData = skeletonData.spineData;
        console.log('spineData', spineData);
        
        // Create accessory spine
        const accessorySpine = new Spine(spineData);
        accessorySpine.scale.set(1, -1); // Flip Y axis for correct orientation
        
        // Set animation if available
        if (spineData.animations.length > 0) {
          accessorySpine.state.setAnimation(0, spineData.animations[0].name, true);
        }
        
        // Find the correct slot and attach
        const slotName = `body-${accessory.attributes.placement.toLowerCase()}`;
        const slotIndex = this.axieSpine.skeleton.findSlotIndex(slotName);
        
        if (slotIndex >= 0) {
          this.axieSpine.slotContainers[slotIndex].addChild(accessorySpine);
          console.log(`✓ Attached ${accessory.name} to ${slotName}`);
        } else {
          console.warn(`Slot ${slotName} not found for accessory ${accessory.name}`);
        }
      } catch (error) {
        console.error(`Failed to load accessory ${accessory.name}:`, error);
      }
    }
  }

  // Animation control methods
  changeAnimation(): void {
    if (!this.axieSpine) return;

    this.currentAnimationIndex = (this.currentAnimationIndex + 1) % this.animations.length;
    const animationName = this.animations[this.currentAnimationIndex];
    
    console.log(`Changing animation to: ${animationName}`);
    
    // For non-looping animations, add idle afterwards
    const isLooping = animationName.includes('idle') || animationName.includes('run');
    
    this.axieSpine.state.setAnimation(0, animationName, isLooping);
    
    if (!isLooping) {
      this.axieSpine.state.addAnimation(0, 'action/idle/normal', true, 1.0);
    }
  }

  private showLoading(show: boolean): void {
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
      loadingElement.style.display = show ? 'block' : 'none';
    }
  }

  private showError(message: string): void {
    const container = document.getElementById('pixi-container');
    if (container) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error';
      errorDiv.textContent = message;
      container.parentElement?.insertBefore(errorDiv, container);
      
      // Remove error after 5 seconds
      setTimeout(() => {
        errorDiv.remove();
      }, 5000);
    }
  }
}

// Initialize the demo
async function main() {
  try {
    console.log('Initializing Axie Mixer Demo...');
    
    const renderer = new AxieRenderer();
    await renderer.initialize();
    
    // Setup event listeners
    const loadAxieButton = document.getElementById('load-axie') as HTMLButtonElement;
    const changeAnimationButton = document.getElementById('change-animation') as HTMLButtonElement;
    
    if (loadAxieButton) {
      loadAxieButton.addEventListener('click', async () => {
        loadAxieButton.disabled = true;
        changeAnimationButton.disabled = true;
        
        try {
          await renderer.renderAxieWithAccessories();
          changeAnimationButton.disabled = false;
        } catch (error) {
          console.error('Error loading Axie:', error);
        } finally {
          loadAxieButton.disabled = false;
        }
      });
    }
    
    if (changeAnimationButton) {
      changeAnimationButton.addEventListener('click', () => {
        renderer.changeAnimation();
      });
      changeAnimationButton.disabled = true; // Enable after Axie is loaded
    }
    
    console.log('Demo ready! Click "Load Axie with Accessories" to start.');
    
  } catch (error) {
    console.error('Failed to initialize demo:', error);
    
    const app = document.getElementById('app');
    if (app) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error';
      errorDiv.innerHTML = `
        <h3>Initialization Error</h3>
        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        <p>Please check the console for more details.</p>
      `;
      app.appendChild(errorDiv);
    }
  }
}

// Start the demo
main();
```

## 📚 Available Accessories

| Placement | Meta Key | Slot Name | Example Keys |
|-----------|----------|-----------|--------------|
| Air | `accessory-air` | `body-air` | `air1a`, `air1b`, `air1c`, `air1d` |
| Cheek | `accessory-cheek` | `body-cheek` | `cheek1a`, `cheek2a` |
| Ground | `accessory-ground` | `body-ground` | `ground1a` |
| Hip | `accessory-hip` | `body-hip` | `hip1a` |
| Neck | `accessory-neck` | `body-neck` | `neck1a` |

### Special Meta Keys

- `accessory-suit-off`: Set to `'true'` or `'false'` to toggle mystic suit
- `accessory-id`: Optional Axie ID for accessories

## 🎮 Animation System

Common animations you can use:

```typescript
// Idle animations
renderer.changeAnimation('action/idle/normal', true);
renderer.changeAnimation('action/idle/random-02', false);

// Movement animations  
renderer.changeAnimation('draft/run-origin', true);

// Attack animations
renderer.changeAnimation('attack/ranged/cast-fly', false);
renderer.changeAnimation('attack/melee/tail-smash', false);

// Chain animations with delay
renderer.addAnimation('action/idle/normal', true, 1.0);
```

## 🔧 Troubleshooting

### Common Issues

**Accessory appears upside down**
- Solution: Ensure you set `accessorySpine.scale.set(1, -1)` to flip the Y axis

**Textures not loading**
- Solution: Make sure all textures are loaded before creating the Spine object
- Check that CDN URLs are accessible and correct

**Animation not found errors**
- Solution: Verify animation names exist in the skeleton data
- Use `skeletonData.animations` to list available animations

**Slot not found for accessory**
- Solution: Check that the slot name matches exactly (e.g., `body-air`, `body-cheek`)
- Ensure the Axie spine was generated with accessory support

**Performance issues**
- Solution: Use texture atlasing and avoid recreating Spine objects frequently
- Consider using `skipAnimation: true` for static displays

### Debug Tips

```typescript
// List available animations
console.log('Available animations:', skeletonData.animations.map(a => a.name));

// List available slots
console.log('Available slots:', axieSpine.skeleton.slots.map(s => s.data.name));

// Check if accessory loaded correctly
const slotIndex = axieSpine.skeleton.findSlotIndex('body-air');
console.log('Air slot index:', slotIndex);
```

## 📖 API Reference

### Core Functions

- `initAxieMixer(genes, samples, variants, animations)` - Initialize the mixer with data
- `getAxieSpineFromGenes(genes, meta, skipAnimation)` - Generate Axie spine from genes
- `getAxieColorPartShift(variant)` - Get color shift for variant
- `getVariantAttachmentPath(slot, path, variant, colorShift)` - Build texture path

### Types

- `AxieBuilderResult` - Result from `getAxieSpineFromGenes`
- `MixedSkeletonData` - Spine skeleton data format
- `AxieBodyStructure` - Parsed gene structure

For complete API documentation, see the TypeScript definitions included with the package.
