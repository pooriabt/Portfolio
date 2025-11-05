declare module 'troika-three-text' {
  import { Object3D, Material } from 'three';
  
  export class Text extends Object3D {
    text: string;
    font?: string;
    fontSize?: number;
    anchorX?: string | number;
    anchorY?: string | number;
    material?: Material;
    sync(): void;
    dispose(): void;
  }
}

