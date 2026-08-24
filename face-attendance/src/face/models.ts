import * as faceapi from 'face-api.js';
import { config } from '../config';

// Weight files live in public/models and were downloaded from
// github.com/justadudewhohacks/face-api.js/master/weights (see README). We load
// exactly the three nets the pipeline needs:
//   tinyFaceDetector    — fast bounding-box detection for the live loop
//   faceLandmark68Net   — landmarks, needed to align before computing a descriptor
//   faceRecognitionNet  — the 128-d descriptor we match against enrollments
let loadPromise: Promise<void> | null = null;
let loaded = false;

export function modelsLoaded(): boolean {
  return loaded;
}

export function loadModels(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const uri = `${import.meta.env.BASE_URL}models`;
    await faceapi.nets.tinyFaceDetector.loadFromUri(uri);
    await faceapi.nets.faceLandmark68Net.loadFromUri(uri);
    await faceapi.nets.faceRecognitionNet.loadFromUri(uri);
    loaded = true;
  })();
  return loadPromise;
}

export function detectorOptions(): faceapi.TinyFaceDetectorOptions {
  return new faceapi.TinyFaceDetectorOptions({
    inputSize: config.detectorInputSize,
    scoreThreshold: config.detectorScoreThreshold,
  });
}

export { faceapi };
