import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import type { StockData } from '@/types';
import { formatPrice } from '@/lib/constants';

// Cache font to avoid reloading
let cachedFont: any = null;

async function loadFont() {
  if (cachedFont) return cachedFont;
  const loader = new FontLoader();
  return new Promise<any>((resolve, reject) => {
    loader.load('/fonts/helvetiker_regular.typeface.json', (font) => {
      cachedFont = font;
      resolve(font);
    }, undefined, reject);
  });
}

export async function buildStock3DVisuals(data: StockData): Promise<THREE.Group> {
  const group = new THREE.Group();
  
  const font = await loadFont();

  // Color logic
  const history = data.price_history;
  const isUp = history.length >= 2 
    ? (data.current_price || 0) >= history[history.length - 2].close 
    : true;
  const priceColor = isUp ? 0x10b981 : 0xef4444; // emerald or red

  // 1. Ticker Text
  const tickerGeo = new TextGeometry(data.ticker, {
    font: font,
    size: 0.15,
    depth: 0.02,
    curveSegments: 12,
    bevelEnabled: false
  });
  tickerGeo.computeBoundingBox();
  const tickerOffset = -0.5 * (tickerGeo.boundingBox!.max.x - tickerGeo.boundingBox!.min.x);
  tickerGeo.translate(tickerOffset, 0, 0);
  
  const tickerMat = new THREE.MeshStandardMaterial({ 
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0.8
  });
  const tickerMesh = new THREE.Mesh(tickerGeo, tickerMat);
  tickerMesh.position.set(0, 0.8, 0); // High up
  group.add(tickerMesh);

  // 2. Price Text
  const priceText = formatPrice(data.current_price);
  const priceGeo = new TextGeometry(priceText, {
    font: font,
    size: 0.25,
    depth: 0.04,
    curveSegments: 12,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.005,
    bevelOffset: 0,
    bevelSegments: 3
  });
  priceGeo.computeBoundingBox();
  const priceOffset = -0.5 * (priceGeo.boundingBox!.max.x - priceGeo.boundingBox!.min.x);
  priceGeo.translate(priceOffset, 0, 0);

  const priceMat = new THREE.MeshStandardMaterial({ 
    color: priceColor,
    roughness: 0.1,
    metalness: 0.5,
    emissive: priceColor,
    emissiveIntensity: 0.2
  });
  const priceMesh = new THREE.Mesh(priceGeo, priceMat);
  priceMesh.position.set(0, 0.4, 0);
  group.add(priceMesh);

  // 3. 3D Bar Chart
  if (history && history.length > 0) {
    const chartGroup = new THREE.Group();
    const recentHistory = history.slice(-20); // Last 20 days for chart to fit nicely
    
    const minPrice = Math.min(...recentHistory.map(h => h.close));
    const maxPrice = Math.max(...recentHistory.map(h => h.close));
    const priceRange = maxPrice - minPrice || 1;
    
    const barWidth = 0.04;
    const spacing = 0.015;
    const chartWidth = recentHistory.length * (barWidth + spacing);
    const startX = -chartWidth / 2 + (barWidth / 2);

    recentHistory.forEach((point, i) => {
      // Normalize height between 0.05 and 0.4
      const normalizedHeight = ((point.close - minPrice) / priceRange) * 0.35 + 0.05; 
      const barGeo = new THREE.BoxGeometry(barWidth, normalizedHeight, barWidth);
      
      const barIsUp = i === 0 || point.close >= recentHistory[i-1].close;
      const barMat = new THREE.MeshStandardMaterial({
        color: barIsUp ? 0x10b981 : 0xef4444,
        transparent: true,
        opacity: 0.85,
        roughness: 0.2,
        metalness: 0.3
      });
      
      const barMesh = new THREE.Mesh(barGeo, barMat);
      // Bottom of the bar rests on y=0 relative to chartGroup
      barMesh.position.set(startX + i * (barWidth + spacing), normalizedHeight / 2, 0);
      chartGroup.add(barMesh);
    });

    chartGroup.position.set(0, -0.2, 0.1); // Below text, slightly forward
    group.add(chartGroup);
  }

  // 4. Base plate / Grid
  const gridHelper = new THREE.GridHelper(1, 10, 0xffffff, 0xffffff);
  // @ts-ignore
  gridHelper.material.opacity = 0.2;
  // @ts-ignore
  gridHelper.material.transparent = true;
  gridHelper.position.set(0, -0.2, 0.1);
  gridHelper.rotation.x = Math.PI / 2; // Flat against the poster
  group.add(gridHelper);

  // 5. Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  group.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(1, 2, 1);
  group.add(dirLight);
  
  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight2.position.set(-1, 0.5, -1);
  group.add(dirLight2);

  return group;
}
