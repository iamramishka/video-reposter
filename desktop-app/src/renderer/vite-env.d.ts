/// <reference types="vite/client" />

import type { VideoReposterBridge } from "./bridge";

declare global {
  interface Window {
    videoReposter?: VideoReposterBridge;
  }
}
