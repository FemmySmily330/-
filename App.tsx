import React, { useState, useRef, useEffect } from 'react';
import { fetchLiteratureUpdates, createExpertChat } from './services/geminiService';
import { Paper, SearchState, Topic, Timeframe } from './types';
import PaperCard from './components/PaperCard';
import ChatPanel from './components/ChatPanel';
import SourceList from './components/SourceList';
import { Chat } from "@google/genai";
import html2canvas from 'html2canvas';

const App: React.FC = () => {
  const [topic, setTopic] = useState<string>(Topic.ALL);
  const [timeframe, setTimeframe] = useState<string>(Timeframe.WEEK_1);
  
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Saved Papers State (Bookmarks)
  const [savedPapers, setSavedPapers] = useState<Paper[]>(() => {
    try {
      const saved = localStorage.getItem('neuroscreen_saved_papers');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load saved papers", e);
      return [];
    }
  });

  const [viewMode, setViewMode] = useState<'search' | 'saved'>('search');

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  const [state, setState] = useState<SearchState>({
    topic: Topic.ALL,
    timeframe: Timeframe.WEEK_1,
    isLoading: false,
    results: [],
    rawResponse: "",
    error: null,
    groundingChunks: [],
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem('neuroscreen_saved_papers', JSON.stringify(savedPapers));
  }, [savedPapers]);

  useEffect(() => {
    // PWA Install Prompt Handler
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      setDeferredPrompt(null);
      setShowInstallBtn(false);
    });
  };

  const handleToggleSave = (paper: Paper) => {
    setSavedPapers(prev => {
      const exists = prev.find(p => p.id === paper.id);
      if (exists) {
        return prev.filter(p => p.id !== paper.id);
      } else {
        return [paper, ...prev];
      }
    });
  };

  const handleSearch = async () => {
    // Abort any ongoing search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setViewMode('search'); // Switch to search view on new search
    setState(prev => ({ ...prev, isLoading: true, error: null, results: [], groundingChunks: [] }));
    setChatSession(null);
    setIsChatOpen(false);
    
    try {
      const { papers, rawResponse, groundingChunks } = await fetchLiteratureUpdates(topic, timeframe, controller.signal);
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        results: papers,
        rawResponse,
        groundingChunks,
      }));

      // Auto-init expert chat with search results
      if (papers.length > 0) {
        const newChat = createExpertChat(papers);
        setChatSession(newChat);
      }

    } catch (err: any) {
      if (err.message === 'Aborted' || err.name === 'AbortError') {
        setState(prev => ({
            ...prev,
            isLoading: false,
            error: "Search stopped by user."
        }));
      } else {
        console.error(err);
        setState(prev => ({
            ...prev,
            isLoading: false,
            error: "检索失败: " + (err.message || "Unknown error. Please check API Key or Network.")
        }));
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const getExportList = () => viewMode === 'search' ? state.results : savedPapers;
  const getExportTitle = () => viewMode === 'saved' ? 'Saved_Papers' : 'PubMed_Search';

  const handleExportMarkdown = () => {
    const listToExport = getExportList();
    if (listToExport.length === 0) return;

    const titleSuffix = getExportTitle();
    const header = `# NeuroScreen AI Ruby - ${titleSuffix}\n**Topic**: ${topic}\n**Timeframe**: ${timeframe}\n**Date**: ${new Date().toLocaleDateString()}\n**Count**: ${listToExport.length}\n\n---\n\n`;
    
    const content = listToExport.map(p => {
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
    link.download = `NeuroScreen_${titleSuffix}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportMenuOpen(false);
  };

  // Robust PDF Export using system print with fixed CSS
  const handlePrintPDF = () => {
    setIsExportMenuOpen(false);
    // Small delay to allow menu to close before print dialog freezes UI
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleExportWord = () => {
    const listToExport = getExportList();
    if (listToExport.length === 0) return;

    const titleSuffix = getExportTitle();
    let htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>${titleSuffix}</title>
        <style>
          body { font-family: 'Calibri', sans-serif; line-height: 1.2; }
          h1 { color: #0f766e; font-size: 24pt; margin-bottom: 10px; }
          h3 { color: #2e1065; background-color: #f3f4f6; padding: 5px; font-size: 14pt; border-bottom: 1px solid #ddd; margin-top: 20px; }
          .meta { font-size: 10pt; color: #555; margin-bottom: 10px; }
          .section-title { font-weight: bold; color: #0d9488; margin-top: 5px; font-size: 11pt; }
          .content { margin-bottom: 5px; font-size: 11pt; }
          hr { border: 0; border-top: 1px solid #ccc; margin: 30px 0; }
        </style>
      </head>
      <body>
        <h1>NeuroScreen AI Ruby Report</h1>
        <p><b>Topic:</b> ${topic}</p>
        <p><b>Date:</b> ${new Date().toLocaleDateString()} | <b>Count:</b> ${listToExport.length}</p>
        <hr/>
    `;

    listToExport.forEach(p => {
      htmlContent += `
        <h3>${p.titleEn}</h3>
        <div class="meta">
          <p><b>Journal:</b> ${p.journal} (IF: ${p.impactFactor}) | <b>Date:</b> ${p.publishDate}</p>
          <p><b>First Author:</b> ${p.firstAuthor} | <b>Institution:</b> ${p.firstInstitution}</p>
        </div>
        <p class="content"><b>中文标题:</b> ${p.titleCn}</p>
        <p class="content"><b>疾病类型:</b> ${p.diseaseType} | <b>研究类型:</b> ${p.researchType}</p>
        <div class="section-title">主要结论</div>
        <p class="content">${p.keyConclusions}</p>
        <div class="section-title">摘要/简介</div>
        <p class="content">${p.abstract}</p>
        <hr/>
      `;
    });

    htmlContent += "</body></html>";

    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NeuroScreen_${titleSuffix}_${new Date().toISOString().slice(0, 10)}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportMenuOpen(false);
  };

  // Optimized Image Export using Node Cloning
  // This fixes the "incomplete image" issue by rendering off-screen without scroll limits
  const handleExportImage = async () => {
    setIsExportMenuOpen(false);
    if (!resultsRef.current) return;

    // 1. Clone the results container
    const element = resultsRef.current;
    const clone = element.cloneNode(true) as HTMLElement;

    // 2. Style the clone to ensure everything is visible and formatted for capture
    // Position off-screen but in DOM
    clone.style.position = 'absolute';
    clone.style.top = '-9999px';
    clone.style.left = '0';
    clone.style.zIndex = '-1';
    // Set fixed width for consistency (better than capturing current window width)
    clone.style.width = '1024px'; 
    clone.style.height = 'auto'; 
    clone.style.overflow = 'visible';
    clone.style.backgroundColor = '#ffffff';
    clone.style.padding = '40px';
    
    // Remove grid columns if screen is narrow, force it to look like desktop list
    // Or single column for better image reading
    clone.classList.remove('lg:grid-cols-2'); 
    clone.classList.add('grid-cols-1');
    clone.classList.remove('gap-8');
    clone.classList.add('gap-6');

    // Append clone to body
    document.body.appendChild(clone);

    try {
        // 3. Capture with html2canvas
        const canvas = await html2canvas(clone, {
            scale: 1.5, // Good balance of quality and file size
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            windowWidth: 1024, // Match clone width
        });
        
        const image = canvas.toDataURL("image/png");
        const link = document.createElement('a');
        const titleSuffix = getExportTitle();
        link.download = `NeuroScreen_${titleSuffix}_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = image;
        link.click();
    } catch (err) {
        console.error("Image export failed", err);
        alert("Failed to generate image. Please try exporting as Word or PDF.");
    } finally {
        // 4. Cleanup
        document.body.removeChild(clone);
    }
  };

  // Determine which list to show
  const displayPapers = viewMode === 'search' ? state.results : savedPapers;

  // Re-initialize chat if switching to Saved view so Expert knows about saved papers
  useEffect(() => {
    if (viewMode === 'saved' && savedPapers.length > 0) {
      const newChat = createExpertChat(savedPapers);
      setChatSession(newChat);
    } else if (viewMode === 'search' && state.results.length > 0) {
      const newChat = createExpertChat(state.results);
      setChatSession(newChat);
    }
  }, [viewMode, savedPapers, state.results]);


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
          className="fixed bottom-8 right-8 z-40 bg-teal-600 hover:bg-teal-700 text-white rounded-full p-4 shadow-xl transition-transform hover:scale-105 flex items-center gap-2 no-print"
        >
          <span className="text-sm font-bold hidden sm:block">Ask Expert</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-lg">N</span>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-teal-700 to-indigo-700 bg-clip-text text-transparent">
              NeuroScreen AI Ruby
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {showInstallBtn && (
              <button 
                onClick={handleInstallClick}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-full transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Install App
              </button>
            )}
            <div className="text-xs text-slate-500 hidden sm:block font-medium">
              Direct PubMed Integration
            </div>
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ${isChatOpen ? 'mr-[450px] max-w-[calc(100%-450px)]' : ''}`}>
        
        <div className="mb-8 text-center max-w-3xl mx-auto no-print">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            PubMed Research Scout
          </h2>
          <p className="text-slate-600">
            Real-time access to <span className="font-semibold text-teal-700">NCBI PubMed</span> database. 
            Categorized by Disease (1-11), ranked by Impact Factor.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-10 no-print">
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
              {state.isLoading ? (
                <button
                  onClick={handleStop}
                  className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-lg text-sm px-5 py-3 text-center transition-all duration-200 shadow-md flex items-center justify-center gap-2 hover:shadow-lg active:scale-95"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                  </svg>
                  Stop Search
                </button>
              ) : (
                <button
                  onClick={handleSearch}
                  className="w-full text-white font-bold rounded-lg text-sm px-5 py-3 text-center transition-all duration-200 shadow-md bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 hover:shadow-lg active:scale-95"
                >
                  Start Search
                </button>
              )}
            </div>
          </div>
        </div>

        {state.error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded mb-8 shadow-sm no-print">
            <p className="font-bold">Info</p>
            <p>{state.error}</p>
          </div>
        )}

        {/* View Tabs */}
        {(state.results.length > 0 || savedPapers.length > 0) && !state.isLoading && (
          <div className="flex gap-4 mb-6 border-b border-slate-200 no-print">
             <button 
                onClick={() => setViewMode('search')}
                className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                  viewMode === 'search' 
                  ? 'border-teal-500 text-teal-700' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
             >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                Search Results ({state.results.length})
             </button>
             <button 
                onClick={() => setViewMode('saved')}
                className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                  viewMode === 'saved' 
                  ? 'border-teal-500 text-teal-700' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
             >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                Saved Papers ({savedPapers.length})
             </button>
          </div>
        )}

        {/* Results List */}
        {displayPapers.length > 0 ? (
          <div className="animate-fade-in-up">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 no-print">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2 h-6 bg-teal-500 rounded-full"></span>
                {viewMode === 'search' ? 'Latest Updates' : 'My Library'}
              </h3>
              <div className="flex gap-2 items-center relative">
                 {!isChatOpen && (
                  <button 
                    onClick={() => setIsChatOpen(true)}
                    className="flex items-center gap-2 text-sm font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-5 py-2.5 rounded-lg border border-indigo-200 transition-colors shadow-sm"
                  >
                     Expert Chat
                  </button>
                 )}
                
                {/* Export Menu */}
                <div className="relative">
                  <button 
                    onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                    className="flex items-center gap-2 text-sm font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 px-5 py-2.5 rounded-lg border border-teal-200 transition-colors shadow-sm"
                  >
                    Export Options
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </button>
                  
                  {isExportMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-100 z-50 overflow-hidden">
                      <button onClick={handlePrintPDF} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                        <span className="w-5 text-center">📄</span> Save as PDF (Print)
                      </button>
                      <button onClick={handleExportWord} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                        <span className="w-5 text-center">📝</span> Export Word
                      </button>
                      <button onClick={handleExportMarkdown} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                        <span className="w-5 text-center">⬇️</span> Export Markdown
                      </button>
                      <button onClick={handleExportImage} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                        <span className="w-5 text-center">🖼️</span> Export Image
                      </button>
                    </div>
                  )}
                  
                  {/* Backdrop to close menu */}
                  {isExportMenuOpen && (
                    <div className="fixed inset-0 z-40" onClick={() => setIsExportMenuOpen(false)}></div>
                  )}
                </div>

              </div>
            </div>
            
            <div ref={resultsRef} className={`grid grid-cols-1 gap-8 transition-all duration-300 ${isChatOpen ? 'lg:grid-cols-1' : 'lg:grid-cols-2'}`}>
              {displayPapers.map((paper) => (
                <PaperCard 
                  key={paper.id} 
                  paper={paper} 
                  isSaved={savedPapers.some(p => p.id === paper.id)}
                  onToggleSave={handleToggleSave}
                />
              ))}
            </div>

            {viewMode === 'search' && state.groundingChunks && state.groundingChunks.length > 0 && (
               <div className="no-print">
                  <SourceList chunks={state.groundingChunks} />
               </div>
            )}

          </div>
        ) : (
          !state.isLoading && viewMode === 'saved' && (
            <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200 no-print">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
               </svg>
               <p>No saved papers yet. Bookmark papers from search results to see them here.</p>
            </div>
          )
        )}

        {state.isLoading && (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8 no-print">
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