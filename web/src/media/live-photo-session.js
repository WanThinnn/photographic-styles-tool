import {moviePairingMetadata} from './live-photo.js';
// Pairing is scoped to one app session; result disposal owns removal.
export function createLivePhotoSession({T}){
  const liveMovies = new Map();
  const livePhotos = [];

  function attachMovie(photo) {
    const movie = liveMovies.get(photo.identifier);
    if (movie) photo.exporter.setMovie(movie.bytes);
  }

  async function handleMovie(file, bytes, ui) {
    try {
      const metadata = moviePairingMetadata(bytes);
      if (!metadata.contentIdentifier || !metadata.hasStillImageTimeKey)
        throw new Error("Missing Live Photo metadata");
      if (liveMovies.has(metadata.contentIdentifier)) {
        ui.set(T("live.duplicate"), "err");
        return;
      }
      liveMovies.set(metadata.contentIdentifier, { bytes, ui });
      ui.set(T("live.waitphoto"),'info');
      for (const photo of livePhotos) attachMovie(photo);
    } catch (e) {
      console.error("could not read Live Photo movie", file.name, e);
      ui.set(T("live.invalidmov"), "err");
    }
  }

    return {liveMovies,livePhotos,attachMovie,handleMovie};
}

