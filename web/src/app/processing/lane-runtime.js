import {createFileProcessor} from './file-processor.js';
import {createPhotoAnalysis} from './photo-analysis.js';
import {createPortraitController} from './portrait-controller.js';
import {createProfileRepository} from './profiles.js';
import {releaseDecodeCache} from '../../media/decode.js';
import {releaseHeicProcessor} from '../../media/heic-processing.js';
import {releaseHevcEncoder} from '../../codecs/ffmpeg-hevc.js';
import {releaseHevcEncoder as releaseRasterEncoder} from '../../raster/ffmpeg-hevc.js';

window.stylioProcessingLane={
  create(dependencies){
    const profiles=createProfileRepository();
    const analysis=createPhotoAnalysis(dependencies);
    const {tryAiPortrait}=createPortraitController({...dependencies,lane:1});
    return createFileProcessor({...dependencies,...profiles,analysis,tryAiPortrait});
  },
  async releaseResources(){
    releaseDecodeCache();releaseHeicProcessor();releaseHevcEncoder();releaseRasterEncoder();
    const [{releaseOrtModels},{releaseDetailWorkers},{releaseStyleRecommender}]=await Promise.all([
      import('../../vision/ort-vision.js'),import('../../detail/detail-inference.js'),import('../../recommend/style-runtime.js'),
    ]);
    releaseDetailWorkers();releaseStyleRecommender();await releaseOrtModels();
  },
};
