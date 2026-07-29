/**
 * MindAR type declarations.
 * MindAR doesn't ship TypeScript types, so we declare the minimum interface.
 */

declare module "mind-ar/dist/mindar-image-three.prod.js" {
  import type { WebGLRenderer, Scene, PerspectiveCamera, Group } from "three";

  interface MindARThreeOptions {
    container: HTMLElement;
    imageTargetSrc: string;
    maxTrack?: number;
    uiLoading?: string;
    uiScanning?: string;
    uiError?: string;
    filterMinCF?: number;
    filterBeta?: number;
    warmupTolerance?: number;
    missTolerance?: number;
  }

  interface Anchor {
    group: Group;
    onTargetFound: (() => void) | null;
    onTargetLost: (() => void) | null;
  }

  export class MindARThree {
    constructor(options: MindARThreeOptions);
    renderer: WebGLRenderer;
    scene: Scene;
    camera: PerspectiveCamera;
    addAnchor(targetIndex: number): Anchor;
    start(): Promise<void>;
    stop(): void;
  }
}
