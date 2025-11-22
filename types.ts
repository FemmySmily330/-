
export interface Paper {
  id: string;
  titleEn: string;
  titleCn: string;
  firstAuthor: string;
  firstInstitution: string;
  correspondingAuthor: string;
  journal: string;
  publishDate: string;
  pmidDoi: string;
  impactFactor: string;
  casQuartile?: string;
  diseaseType: string;
  researchType: string;
  sampleSize: string;
  clinicalQuestion: string;
  keyConclusions: string;
  abstract: string;
  endpointsDetails: string;
  url: string;
  rawText?: string;
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface SearchState {
  topic: string;
  timeframe: string;
  isLoading: boolean;
  results: Paper[];
  rawResponse: string;
  error: string | null;
  groundingChunks?: GroundingChunk[];
}

// Updated to map to PubMed 'reldate' logic
export enum Timeframe {
  DAY_1 = "过去 24 小时 (1 Day)",
  DAY_3 = "过去 3 天 (3 Days)",
  WEEK_1 = "过去 1 周 (1 Week)",
  MONTH_1 = "过去 1 个月 (1 Month)"
}

// Strictly mapped to user's 1-11 list for UI display
export enum Topic {
  ALS = "1. amyotrophic lateral sclerosis OR ALS",
  MND = "2. motor neuron disease",
  AD = "3. Alzheimer disease OR Alzheimer's disease OR AD",
  PD = "4. Parkinson disease OR Parkinson's disease OR PD",
  FTD = "5. frontotemporal dementia OR FTD",
  NEURO = "6. neurodegenerative diseases",
  MSA = "7. multiple system atrophy OR MSA",
  HD = "8. Huntington disease OR Huntington's disease OR HD",
  PSP = "9. progressive supranuclear palsy OR PSP",
  CBD = "10. corticobasal degeneration OR CBD",
  ALL = "11. all (包含上述所有神经退行性疾病的文献)"
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isStreaming?: boolean;
}
