// The pinned libheif build exposes image.free(), but no decoder.free().
export function releaseLibheif(module, decoder, images = []) {
  try { for (const image of images || []) image.free?.(); }
  finally {
    if (typeof decoder?.free === 'function') decoder.free();
    else if (decoder?.decoder != null) {
      module.heif_context_free(decoder.decoder);
      decoder.decoder = null;
    }
  }
}
