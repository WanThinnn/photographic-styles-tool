// Official single-thread runtime: works without COOP/COEP headers on GitHub Pages.
const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
export const FFMPEG_ASSETS = Object.freeze([
  { url: `${base}/ffmpeg-core.js`, sha256: "b266ab5b952555881dd6310663986994a182acb2b7ff25cf10a25f7a37ac2b21" },
  { url: `${base}/ffmpeg-core.wasm`, sha256: "9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7" },
]);
