
import React, { useState } from 'react';
import { fetchLiteratureUpdates, createExpertChat } from './services/geminiService';
import { Paper, SearchState, Topic, Timeframe } from './types';
import PaperCard from './components/PaperCard';
import ChatPanel from './components/ChatPanel';
import SourceList from './components/SourceList';
import { Chat } from "@google/genai";

const App: React.FC = () => {
  const [topic, setTopic] = useState<string>(Topic.ALL);
  const [timeframe, setTimeframe] = useState<string>(Timeframe.WEEK_1);
  
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const [state, setState] = useState<SearchState>({
    topic: Topic.ALL,
    timeframe: Timeframe.WEEK_1,
    isLoading: false,
    results: [],
    rawResponse: "",
    error: null,
    groundingChunks: [],
  });

  const handleSearch = async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null, results: [], groundingChunks: [] }));
    setChatSession(null);
    setIsChatOpen(false);
    
    try {
      const { papers, rawResponse, groundingChunks } = await fetchLiteratureUpdates(topic, timeframe);
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        results: papers,
        rawResponse,
        groundingChunks,
      }));

      if (papers.length > 0) {
        const newChat = createExpertChat(papers);
        setChatSession(newChat);
        // Optional: auto open chat or let user decide
        // setIsChatOpen(true); 
      }

    } catch (err: any) {
      console.error(err);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: "检索失败: " + (err.message || "Unknown error. Please check API Key or Network.")
      }));
    }
  };

  const handleExport = () => {
    if (state.results.length === 0) return;

    const header = `# NeuroScreen AI Ruby - PubMed Update\n**Topic**: ${topic}\n**Timeframe**: ${timeframe}\n**Date**: ${new Date().toLocaleDateString()}\n\n---\n\n`;
    
    const content = state.results.map(p => {
      return `### ${p.titleEn}
**中文标题**: ${p.titleCn}
**第一作者**: ${p.firstAuthor}
**第一单位**: ${p.firstInstitution}
**第一通讯作者**: ${p.correspondingAuthor}
**期刊**: ${p.journal} (IF: ${p.impactFactor} ${p.casQuartile || ''})
**发表/上线日期**: ${p.publishDate}
**PMID/DOI**: ${p.pmidDoi}
**来源链接**: ${p.url || 'N/A'}
**疾病类型**: ${p.diseaseType}
**研究类型**: ${p.researchType}
**样本量**: ${p.sampleSize}

**研究主要问题**: 
${p.clinicalQuestion}

**主要结论要点**: 
${p.keyConclusions}

**摘要/内容简介**:
${p.abstract}

**临床终点详情**:
${p.endpointsDetails}
`;
    }).join('\n---\n\n');

    const blob = new Blob([header + content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NeuroScreen_PubMed_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 font-sans overflow-x-hidden">
      <ChatPanel 
        chat={chatSession} 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)} 
      />

      {!isChatOpen && chatSession && (
        <button 
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-8 right-8 z-40 bg-teal-600 hover:bg-teal-700 text-white rounded-full p-4 shadow-xl transition-transform hover:scale-105 flex items-center gap-2"
        >
          <span className="text-sm font-bold hidden sm:block">Ask Expert</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-lg">N</span>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-teal-700 to-indigo-700 bg-clip-text text-transparent">
              NeuroScreen AI Ruby
            </h1>
          </div>
          <div className="text-xs text-slate-500 hidden sm:block font-medium">
            Direct PubMed Integration
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ${isChatOpen ? 'mr-[450px] max-w-[calc(100%-450px)]' : ''}`}>
        
        <div className="mb-8 text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            PubMed Research Scout
          </h2>
          <p className="text-slate-600">
            Real-time access to <span className="font-semibold text-teal-700">NCBI PubMed</span> database. 
            Categorized by Disease (1-11), ranked by Impact Factor.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-10">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
            <div className="md:col-span-6">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Topic (Select 1-11)</label>
              <div className="relative">
                <select 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full appearance-none bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-teal-500 focus:border-teal-500 block p-3 pr-8 truncate"
                >
                  {Object.values(Topic).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-700">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Timeframe</label>
              <div className="relative">
                <select 
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="w-full appearance-none bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-teal-500 focus:border-teal-500 block p-3 pr-8"
                >
                  {Object.values(Timeframe).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-700">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            </div>

            <div className="md:col-span-3">
              <button
                onClick={handleSearch}
                disabled={state.isLoading}
                className={`w-full text-white font-bold rounded-lg text-sm px-5 py-3 text-center transition-all duration-200 shadow-md ${
                  state.isLoading 
                    ? 'bg-slate-400 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 hover:shadow-lg active:scale-95'
                }`}
              >
                {state.isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Scanning PubMed...
                  </div>
                ) : (
                  'Start Search'
                )}
              </button>
            </div>
          </div>
        </div>

        {state.error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded mb-8 shadow-sm">
            <p className="font-bold">Error</p>
            <p>{state.error}</p>
          </div>
        )}

        {state.results.length > 0 && (
          <div className="animate-fade-in-up">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2 h-6 bg-teal-500 rounded-full"></span>
                Results ({state.results.length})
              </h3>
              <div className="flex gap-2">
                 {!isChatOpen && (
                  <button 
                    onClick={() => setIsChatOpen(true)}
                    className="flex items-center gap-2 text-sm font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-5 py-2.5 rounded-lg border border-indigo-200 transition-colors shadow-sm"
                  >
                     Expert Chat
                  </button>
                 )}
                <button 
                  onClick={handleExport}
                  className="flex items-center gap-2 text-sm font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 px-5 py-2.5 rounded-lg border border-teal-200 transition-colors shadow-sm"
                >
                  Export Markdown
                </button>
              </div>
            </div>
            
            <div className={`grid grid-cols-1 gap-8 transition-all duration-300 ${isChatOpen ? 'lg:grid-cols-1' : 'lg:grid-cols-2'}`}>
              {state.results.map((paper) => (
                <PaperCard key={paper.id} paper={paper} />
              ))}
            </div>

            {state.groundingChunks && state.groundingChunks.length > 0 && (
               <SourceList chunks={state.groundingChunks} />
            )}

          </div>
        )}

        {state.isLoading && (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
             {[1, 2, 3, 4].map((i) => (
               <div key={i} className="bg-white p-0 rounded-xl border border-slate-100 shadow-sm h-96 animate-pulse flex flex-col">
                 <div className="h-32 bg-slate-100 w-full mb-4"></div>
                 <div className="p-6 space-y-4 flex-grow">
                   <div className="h-6 bg-slate-200 rounded w-3/4"></div>
                   <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                   <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="h-3 bg-slate-100 rounded"></div>
                      <div className="h-3 bg-slate-100 rounded"></div>
                   </div>
                   <div className="h-24 bg-slate-50 rounded mt-4 border border-slate-100"></div>
                 </div>
               </div>
             ))}
           </div>
        )}
      </main>
    </div>
  );
};

export default App;
