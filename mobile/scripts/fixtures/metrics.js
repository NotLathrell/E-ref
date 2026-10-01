/** Metrics fixtures: the shapes /metrics/detector and /metrics/confidence return. */

const detector = {
  model: 'eref-detector-v1 (YOLOv8n fine-tuned, 12 foods)',
  composedFrames: { frames: 300, precision: 0.9, recall: 0.88, map50: 0.93, map50_95: 0.9 },
  objectCounts: { frames: 300, exactCount: 0.86, withinOne: 0.98 },
  realPhotos: { photos: 300, foodFound: 0.97, missed: 0.03, bestBoxIsRightFood: 0.9, meanBoxCoverage: 0.7 },
  falseDetections: { otherObjects: { photos: 150, wronglyBoxed: 0.2 }, unseenFoods: { photos: 180, wronglyBoxed: 0.4 } },
  note: 'Training frames are composed from single-food photos, so composed-frame scores are optimistic.',
};

const calibration = {
  identity: [0.6, 0.8, 0.9, 0.95].map((threshold, i) => ({ threshold, knownAccepted: 0.999 - i * 0.005, acceptedAccuracy: 0.999, unseenWronglyAccepted: 0.5 - i * 0.1 })),
  inUse: { confidentIdentity: 0.9, unsureIdentity: 0.6, unsureFreshness: 0.65 },
};

const report = { generatedAt: new Date().toISOString(), dataset: { images: 1000, split: 'val' }, tasks: [], benchmarks: [] };

module.exports = { detector, calibration, report };
