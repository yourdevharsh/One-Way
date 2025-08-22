import { pipeline, dot } from "@xenova/transformers";

async function getEmbeddings(text) {
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return output.data;
}

function cosineSimilarity(vectorA, vectorB) {
    const product = dot(vectorA, vectorB);
    const magA = Math.sqrt(dot(vectorA, vectorA));
    const magB = Math.sqrt(dot(vectorB, vectorB));
    return product / (magA * magB);
}

export default async function similarity(textA, textB) {
    const embedA = await getEmbeddings(textA);
    const embedB = await getEmbeddings(textB);
    const simScore = cosineSimilarity(embedA, embedB);
    return simScore;
}