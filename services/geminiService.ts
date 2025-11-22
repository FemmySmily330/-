
import { GoogleGenAI, Chat } from "@google/genai";
import { Paper, Topic, Timeframe, GroundingChunk } from "../types";

// --- 1. PubMed API Integration ---

const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

// Helper to map Timeframe enum to days for 'reldate'
const getTimeframeDays = (tf: string): number => {
  switch (tf) {
    case Timeframe.DAY_1: return 1;
    case Timeframe.DAY_3: return 3;
    case Timeframe.WEEK_1: return 7;
    case Timeframe.MONTH_1: return 30;
    default: return 7;
  }
};

// Helper to map Topic enum to specific search query strings
const getQueryString = (topic: string): string => {
  // Clean the UI prefix "1. ", "2. " etc.
  const clean = (t: string) => t.replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)$/, '');

  if (topic === Topic.ALL) {
    // Strict boolean string for ALL provided by user
    return `(("amyotrophic lateral sclerosis"[Title/Abstract] OR ALS[Title/Abstract]) OR ("motor neuron disease"[Title/Abstract]) OR ("Alzheimer disease"[Title/Abstract] OR "Alzheimer's disease"[Title/Abstract] OR AD[Title/Abstract]) OR ("Parkinson disease"[Title/Abstract] OR "Parkinson's disease"[Title/Abstract] OR PD[Title/Abstract]) OR ("frontotemporal dementia"[Title/Abstract] OR FTD[Title/Abstract] OR "frontotemporal lobar degeneration"[Title/Abstract]) OR ("neurodegenerative diseases"[Title/Abstract] OR "neurodegenerative disease"[Title/Abstract] OR neurodegeneration[Title/Abstract]) OR ("multiple system atrophy"[Title/Abstract] OR MSA[Title/Abstract]) OR ("Huntington disease"[Title/Abstract] OR "Huntington's disease"[Title/Abstract] OR HD[Title/Abstract]) OR ("progressive supranuclear palsy"[Title/Abstract] OR PSP[Title/Abstract]) OR ("corticobasal degeneration"[Title/Abstract] OR CBD[Title/Abstract]))`;
  }

  return `(${clean(topic)})`;
};

// Fetch PMIDs from PubMed
const searchPubMedIDs = async (query: string, days: number): Promise<string[]> => {
  // sort=date ensures we get latest updates
  // Added retmax=500 to allow for "unlimited" feel, though practically paged later if needed
  const url = `${PUBMED_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&reldate=${days}&datetype=pdat&retmax=500&retmode=json&sort=date`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`PubMed Search Failed: ${res.statusText}`);
    const data = await res.json();
    return data.esearchresult?.idlist || [];
  } catch (e) {
    console.error("PubMed ID Search Error:", e);
    return [];
  }
};

// Fetch details (XML) for PMIDs
interface PubMedRawData {
  pmid: string;
  title: string;
  abstract: string;
  journal: string;
  pubDate: string;
  doi: string;
  authors: string;
}

const fetchPubMedDetails = async (ids: string[]): Promise<PubMedRawData[]> => {
  if (ids.length === 0) return [];
  
  // Chunking requests to prevent URL length issues
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50));
  }

  let allData: PubMedRawData[] = [];
  const parser = new DOMParser();

  for (const chunk of chunks) {
    const url = `${PUBMED_BASE}/efetch.fcgi?db=pubmed&id=${chunk.join(',')}&retmode=xml`;
    
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`PubMed Fetch Failed for chunk: ${res.statusText}`);
        continue;
      }
      const text = await res.text();
      
      const xmlDoc = parser.parseFromString(text, "text/xml");
      
      // Check for parser errors
      const parserError = xmlDoc.getElementsByTagName("parsererror")[0];
      if (parserError) {
        console.error("XML Parsing Error:", parserError.textContent);
        continue;
      }

      const articles = xmlDoc.getElementsByTagName("PubmedArticle");

      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        
        // Use getElementsByTagName for robustness against XML namespace issues
        const titleNode = article.getElementsByTagName("ArticleTitle")[0];
        const title = titleNode ? titleNode.textContent || "No Title" : "No Title";
        
        // Abstract handling: combine parts
        const abstractTexts = article.getElementsByTagName("AbstractText");
        let abstractText = "";
        if (abstractTexts.length > 0) {
           abstractText = Array.from(abstractTexts)
            .map(node => {
                const label = node.getAttribute("Label");
                return label ? `${label}: ${node.textContent}` : node.textContent;
            })
            .join("\n");
        } else {
            abstractText = "No Abstract";
        }
        
        // Journal Title
        const journalTitleNode = article.querySelector("Journal > Title");
        const journalIsoNode = article.querySelector("Journal > ISOAbbreviation");
        const journal = journalTitleNode?.textContent || journalIsoNode?.textContent || "Unknown Journal";
        
        // Date parsing (PubDate)
        const pubDateNode = article.getElementsByTagName("PubDate")[0];
        let pubDate = "";
        if (pubDateNode) {
            const year = pubDateNode.getElementsByTagName("Year")[0]?.textContent || "";
            const month = pubDateNode.getElementsByTagName("Month")[0]?.textContent || "";
            const day = pubDateNode.getElementsByTagName("Day")[0]?.textContent || "";
            pubDate = `${year}-${month}-${day}`.replace(/-$/, '').replace(/--/, '');
        }

        // IDs - Look within ArticleIdList or MedlineCitation
        const pmidNode = article.getElementsByTagName("PMID")[0];
        const pmid = pmidNode ? pmidNode.textContent || "" : "";
        
        // DOI extraction
        let doi = "";
        const articleIds = article.getElementsByTagName("ArticleId");
        for (let j = 0; j < articleIds.length; j++) {
            if (articleIds[j].getAttribute("IdType") === "doi") {
                doi = articleIds[j].textContent || "";
                break;
            }
        }

        // Authors
        const authorList = article.getElementsByTagName("AuthorList")[0];
        let authors = "";
        if (authorList) {
            const authorNodes = authorList.getElementsByTagName("Author");
            authors = Array.from(authorNodes).map(a => {
                const last = a.getElementsByTagName("LastName")[0]?.textContent || "";
                const fore = a.getElementsByTagName("ForeName")[0]?.textContent || "";
                return `${last} ${fore}`;
            }).slice(0, 3).join(", ");
        }

        allData.push({
          pmid,
          title,
          abstract: abstractText,
          journal,
          pubDate,
          doi,
          authors
        });
      }
    } catch (e) {
      console.error("Error fetching/parsing PubMed chunk:", e);
    }
  }

  return allData;
};


// --- 2. Helpers & Parsing ---

const extractField = (text: string, key: string): string | null => {
  const regex = new RegExp(`\\*\\*${key}\\*\\*:\\s*([\\s\\S]*?)(?=\\n\\*\\*|\\n---|$)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : null;
};

const parseImpactFactor = (ifStr: string | undefined): number => {
  if (!ifStr || ifStr === 'N/A' || ifStr === 'Unknown') return -1;
  const match = ifStr.match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[0]) : 0;
};

// Strict Rank 1-10
const getDiseaseRank = (raw: string | undefined): number => {
  const r = (raw || "").trim().toUpperCase();
  if (r.includes('AMYOTROPHIC') || r.includes('ALS')) return 1;
  if (r.includes('MOTOR NEURON') || r.includes('MND')) return 2;
  if (r.includes('ALZHEIMER') || r === 'AD') return 3;
  if (r.includes('PARKINSON') || r === 'PD') return 4;
  if (r.includes('FRONTOTEMPORAL') || r === 'FTD') return 5;
  if (r.includes('GENERAL') || r.includes('NEURODEGENERATIVE') || r.includes('ALL TYPES')) return 6;
  if (r.includes('MULTIPLE SYSTEM') || r === 'MSA') return 7;
  if (r.includes('HUNTINGTON') || r === 'HD') return 8;
  if (r.includes('PROGRESSIVE SUPRA') || r === 'PSP') return 9;
  if (r.includes('CORTICOBASAL') || r === 'CBD') return 10;
  return 99; 
};

const getCategoryScore = (paper: Paper): number => {
  const type = (paper.researchType || "").toLowerCase();
  const url = (paper.url || "").toLowerCase();
  if (url.includes('clinicaltrials.gov') || type.includes('clinical trial') || type.includes('register')) {
    return 1;
  }
  return 0;
};

const parsePapersFromMarkdown = (text: string): Paper[] => {
  const rawPapers: Paper[] = [];
  const sections = text.split('---').map(s => s.trim()).filter(s => s.length > 0);

  sections.forEach((section, index) => {
    const titleEnMatch = section.match(/###\s*(.+)/);
    if (titleEnMatch) {
      rawPapers.push({
        id: `paper-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        titleEn: titleEnMatch[1].trim(),
        titleCn: extractField(section, "中文标题") || "暂无中文标题",
        firstAuthor: extractField(section, "第一作者") || "Unknown",
        firstInstitution: extractField(section, "第一单位") || "Unknown Institution",
        correspondingAuthor: extractField(section, "通讯作者") || "Unknown",
        journal: extractField(section, "期刊") || "Unknown Journal",
        publishDate: extractField(section, "发表日期") || "Unknown Date",
        pmidDoi: extractField(section, "PMID/DOI") || "N/A",
        impactFactor: extractField(section, "影响因子") || "N/A",
        casQuartile: extractField(section, "中科院分区") || "",
        diseaseType: extractField(section, "疾病类型") || "General",
        researchType: extractField(section, "研究类型") || "Literature",
        sampleSize: extractField(section, "样本量") || "N/A",
        clinicalQuestion: extractField(section, "研究问题") || "Not specified",
        keyConclusions: extractField(section, "结论要点") || "No conclusion",
        abstract: extractField(section, "摘要") || "暂无摘要",
        endpointsDetails: extractField(section, "临床终点详情") || "N/A",
        url: extractField(section, "链接") || "",
        rawText: section
      });
    }
  });

  const uniquePapers: Paper[] = [];
  const seenKeys = new Set<string>();
  for (const paper of rawPapers) {
    const pmid = paper.pmidDoi.match(/(\d{6,})/) ? paper.pmidDoi.match(/(\d{6,})/)![0] : null;
    const key = pmid || paper.titleEn.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniquePapers.push(paper);
    }
  }

  return uniquePapers.sort((a, b) => {
    const rankA = getDiseaseRank(a.diseaseType);
    const rankB = getDiseaseRank(b.diseaseType);
    if (rankA !== rankB) return rankA - rankB;

    const ifA = parseImpactFactor(a.impactFactor);
    const ifB = parseImpactFactor(b.impactFactor);
    if (ifA > 0 && ifB > 0 && ifA !== ifB) return ifB - ifA;
    if (ifA > 0 && ifB <= 0) return -1;
    if (ifA <= 0 && ifB > 0) return 1;

    const catA = getCategoryScore(a);
    const catB = getCategoryScore(b);
    return catA - catB;
  });
};


// --- 3. Main Service & Batch Processing ---

// Batch processing to handle Gemini output token limits
const processPapersInBatches = async (
    ai: GoogleGenAI, 
    papers: PubMedRawData[]
  ): Promise<{ text: string, groundingChunks: GroundingChunk[] }> => {
    
    const BATCH_SIZE = 10; // Process 10 papers at a time to stay within output limits
    let accumulatedText = "";
    let accumulatedGrounding: GroundingChunk[] = [];
  
    for (let i = 0; i < papers.length; i += BATCH_SIZE) {
      const batch = papers.slice(i, i + BATCH_SIZE);
      console.log(`Processing Gemini Batch ${i/BATCH_SIZE + 1} / ${Math.ceil(papers.length/BATCH_SIZE)}`);
  
      const papersInput = batch.map((p, idx) => `
        [Paper ${i + idx + 1}]
        PMID: ${p.pmid}
        DOI: ${p.doi}
        Title: ${p.title}
        Journal: ${p.journal}
        Date: ${p.pubDate}
        Authors: ${p.authors}
        Abstract: ${p.abstract}
      `).join("\n\n----------------\n\n");
  
      const prompt = `
        你是一个 PubMed 文献深度分析专家 (NeuroScreen AI Ruby)。
        以下是直接从 PubMed 数据库抓取的 ${batch.length} 篇神经退行性疾病相关文献的原始摘要数据。
        
        **任务**: 
        将每一篇文献转化为严格的 Markdown 格式报告。
        必须输出所有 ${batch.length} 篇，严禁截断。
        
        **额外要求**:
        1. **影响因子 & 分区**: 必须利用 Google Search 查找该期刊最新的影响因子 (IF) 和中科院分区。
        2. **分类**: 归类为 ALS, MND, AD, PD, FTD, Neurodegeneration, MSA, HD, PSP, CBD 中最合适的一项。
        
        **输出格式 (严格 Markdown)**:
        每篇之间用 "---" 分隔。
  
        ### [English Title]
        **中文标题**: [翻译]
        **第一作者**: [Name]
        **第一单位**: [Institution or "Unspecified"]
        **通讯作者**: [Name or "Unspecified"]
        **期刊**: [Journal Name]
        **发表日期**: [YYYY-MM-DD]
        **PMID/DOI**: [PMID / DOI]
        **影响因子**: [数值 (中科院分区)]
        **疾病类型**: [标准词]
        **研究类型**: [Literature/Clinical/News]
        **样本量**: [n值 or N/A]
        **链接**: https://pubmed.ncbi.nlm.nih.gov/[PMID]/
        **研究问题**: [简述]
        **结论要点**: [简述]
        **摘要**: [详细翻译]
        **临床终点详情**: [Endpoints/Biomarkers]
        ---
  
        **Input Data**:
        ${papersInput}
      `;
  
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }], 
          },
        });
  
        const text = response.text || "";
        accumulatedText += text + "\n\n---\n\n"; // Add separator between batches
        
        const chunks = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || []) as GroundingChunk[];
        accumulatedGrounding.push(...chunks);

      } catch (error) {
        console.error(`Error processing batch ${i}:`, error);
        // Continue to next batch instead of failing completely
        accumulatedText += `\n\n> Error processing papers ${i+1} to ${i+batch.length}\n\n---\n\n`;
      }
    }
  
    return { text: accumulatedText, groundingChunks: accumulatedGrounding };
  };

export const fetchLiteratureUpdates = async (
  topic: string, 
  timeframe: string
): Promise<{ papers: Paper[], rawResponse: string, groundingChunks: GroundingChunk[] }> => {
  
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing. Please set process.env.API_KEY.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // A. Get Data from PubMed
  const days = getTimeframeDays(timeframe);
  const query = getQueryString(topic);
  
  console.log(`Scanning PubMed for: ${query} within last ${days} days`);
  
  // 1. Search IDs
  const pmids = await searchPubMedIDs(query, days);
  console.log(`Found ${pmids.length} papers`);

  if (pmids.length === 0) {
    return { papers: [], rawResponse: "No papers found in PubMed for this criteria.", groundingChunks: [] };
  }

  // 2. Fetch XML Details
  const rawData = await fetchPubMedDetails(pmids);

  if (rawData.length === 0) {
     return { papers: [], rawResponse: "Found IDs but failed to fetch details from PubMed.", groundingChunks: [] };
  }

  // B. Process with Gemini in Batches
  const { text, groundingChunks } = await processPapersInBatches(ai, rawData);

  // C. Parse
  const parsedPapers = parsePapersFromMarkdown(text);
  
  return {
    papers: parsedPapers,
    rawResponse: text,
    groundingChunks
  };
};

export const createExpertChat = (papers: Paper[]): Chat => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Limit context to top 20 to prevent token overflow in chat history
  const contextPapers = papers.slice(0, 20);

  const papersContext = contextPapers.map((p, i) => `
    [${i+1}] ${p.titleEn} (PMID: ${p.pmidDoi})
    Journal: ${p.journal} (IF: ${p.impactFactor})
    Type: ${p.diseaseType}
    Summary: ${p.abstract}
    Link: ${p.url}
  `).join("\n");

  const systemInstruction = `
    你是一位神经退行性疾病专家 (NeuroScreen Expert)。
    你拥有以下最新检索到的 PubMed 文献列表 (Top 20):
    ${papersContext}
    
    (注意：还有更多文献未列入 Context，但你可以专注于以上重点文献)

    任务：
    1. 回答用户关于这些文献的提问。
    2. 分析临床转化潜力。
    3. 如果用户需要下载 PDF，请使用 Google Search 寻找 'Title filetype:pdf' 或相关链接。
  `;

  return ai.chats.create({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: systemInstruction,
      tools: [{ googleSearch: {} }]
    }
  });
};
