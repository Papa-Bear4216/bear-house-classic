import * as ort from 'onnxruntime-web';

export type Detection = {
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  label: string;
  confidence: number;
};

const LABELS = [
  'bed', 'sofa', 'chair', 'table', 'lamp', 'tv',
  'laptop', 'wardrobe', 'window', 'door', 'potted plant', 'photo frame'
];

export async function loadYOLOModel() {
  const modelUrl = '/home.onnx';
  try {
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['webgl'], // Use WebGL for speed
    });
    return session;
  } catch (e) {
    console.error('Failed to load ONNX model', e);
    // Fallback to CPU if WebGL fails
    return await ort.InferenceSession.create(modelUrl);
  }
}

export async function detectObjects(
  session: ort.InferenceSession,
  imageElement: HTMLImageElement | HTMLCanvasElement
): Promise<Detection[]> {
  const [modelWidth, modelHeight] = [640, 640];

  // 1. Preprocess: Resize and normalize
  const canvas = document.createElement('canvas');
  canvas.width = modelWidth;
  canvas.height = modelHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(imageElement, 0, 0, modelWidth, modelHeight);

  const imageData = ctx.getImageData(0, 0, modelWidth, modelHeight);
  const { data } = imageData;

  const input = new Float32Array(modelWidth * modelHeight * 3);
  for (let i = 0; i < data.length / 4; i++) {
    input[i] = data[i * 4] / 255.0; // R
    input[i + modelWidth * modelHeight] = data[i * 4 + 1] / 255.0; // G
    input[i + modelWidth * modelHeight * 2] = data[i * 4 + 2] / 255.0; // B
  }

  const tensor = new ort.Tensor('float32', input, [1, 3, modelWidth, modelHeight]);

  // 2. Run Inference
  const outputs = await session.run({ images: tensor });
  const output = outputs[Object.keys(outputs)[0]]; // Shape: [1, 16, 8400]

  // 3. Postprocess
  return processOutput(output.data as Float32Array, imageElement.width, imageElement.height);
}

function processOutput(data: Float32Array, imgWidth: number, imgHeight: number): Detection[] {
  const detections: Detection[] = [];
  const numAttributes = 16;
  const numAnchors = 8400;

  const confThreshold = 0.3;

  for (let i = 0; i < numAnchors; i++) {
    // Extract scores for classes (starting from index 4)
    let maxScore = -1;
    let classId = -1;
    for (let j = 4; j < numAttributes; j++) {
      const score = data[j * numAnchors + i];
      if (score > maxScore) {
        maxScore = score;
        classId = j - 4;
      }
    }

    if (maxScore > confThreshold) {
      const cx = data[0 * numAnchors + i];
      const cy = data[1 * numAnchors + i];
      const w = data[2 * numAnchors + i];
      const h = data[3 * numAnchors + i];

      const x1 = (cx - w / 2) / 640 * imgWidth;
      const y1 = (cy - h / 2) / 640 * imgHeight;
      const x2 = (cx + w / 2) / 640 * imgWidth;
      const y2 = (cy + h / 2) / 640 * imgHeight;

      detections.push({
        bbox: [x1, y1, x2, y2],
        label: LABELS[classId],
        confidence: maxScore
      });
    }
  }

  return nonMaxSuppression(detections, 0.45);
}

function nonMaxSuppression(boxes: Detection[], iouThreshold: number): Detection[] {
  boxes.sort((a, b) => b.confidence - a.confidence);
  const result: Detection[] = [];
  const selected = new Array(boxes.length).fill(true);

  for (let i = 0; i < boxes.length; i++) {
    if (selected[i]) {
      result.push(boxes[i]);
      for (let j = i + 1; j < boxes.length; j++) {
        if (selected[j] && calculateIoU(boxes[i].bbox, boxes[j].bbox) > iouThreshold) {
          selected[j] = false;
        }
      }
    }
  }
  return result;
}

function calculateIoU(box1: [number, number, number, number], box2: [number, number, number, number]): number {
  const x1 = Math.max(box1[0], box2[0]);
  const y1 = Math.max(box1[1], box2[1]);
  const x2 = Math.min(box1[2], box2[2]);
  const y2 = Math.min(box1[3], box2[3]);

  const intersectionArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const box1Area = (box1[2] - box1[0]) * (box1[3] - box1[1]);
  const box2Area = (box2[2] - box2[0]) * (box2[3] - box2[1]);

  return intersectionArea / (box1Area + box2Area - intersectionArea);
}
