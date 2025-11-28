import { pipeline, dot } from "@xenova/transformers";

let extractor = null;
let modelLoadingPromise = null;

(async () => {
  try {
    console.log("Loading feature-extraction model...");
    modelLoadingPromise = pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
    extractor = await modelLoadingPromise;
    console.log("Model loaded successfully.");
  } catch (error) {
    console.error("Failed to load the model:", error);
    process.exit(1);
  }
})();

async function getEmbeddings(text) {
  if (!extractor) {
    if (modelLoadingPromise) {
      extractor = await modelLoadingPromise;
    } else {
      throw new Error("Feature extraction model failed to initialize.");
    }
  }

  const output = await extractor(text, {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(output.data);
}

function cosineSimilarity(vectorA, vectorB) {
  if (!vectorA || !vectorB || vectorA.length !== vectorB.length) {
    return 0;
  }
  const product = dot(vectorA, vectorB);
  const magA = Math.sqrt(dot(vectorA, vectorA));
  const magB = Math.sqrt(dot(vectorB, vectorB));

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return product / (magA * magB);
}

export default async function calculateSimilarity(textA, textB) {
  const [embedA, embedB] = await Promise.all([
    getEmbeddings(textA),
    getEmbeddings(textB),
  ]);
  return cosineSimilarity(embedA, embedB);
}
