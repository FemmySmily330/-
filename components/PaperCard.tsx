
import React, { useState } from 'react';
import { Paper } from '../types';

interface PaperCardProps {
  paper: Paper;
}

const PaperCard: React.FC<PaperCardProps> = ({ paper }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Helper to determine badge color based on research type
  const getTypeColor = (type: string) => {
    const t = (type || "").toLowerCase();
    if (t.includes('rct') || t.includes('clinical')) return 'bg-green-100 text-green-800 border-green-200';
    if (t.includes('review') || t.includes('meta')) return 'bg-amber-100 text-amber-800 border-amber-200';
    if (t.includes('cohort') || t.includes('longitudinal')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (t.includes('news')) return 'bg-pink-100 text-pink-800 border-pink-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const hasEndpoints = paper.endpointsDetails && paper.endpointsDetails !== 'N/A' && paper.endpointsDetails.length > 3;
  const isFullTextMissing = paper.abstract.includes('【暂时无法查阅全文】');

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-0 hover:shadow-md transition-shadow duration-300 flex flex-col h-full overflow-hidden group relative">
      {/* Header Section */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-wider text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 w-fit mb-1 max-w-[200px] truncate">
              {paper.journal}
            </span>
            {paper.impactFactor && paper.impactFactor !== 'N/A' && (
                <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100 w-fit">
                    IF: {paper.impactFactor}
                    </span>
                    {paper.casQuartile && (
                        <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 w-fit">
                        {paper.casQuartile}
                        </span>
                    )}
                </div>
            )}
          </div>
          <span className="text-xs text-slate-500 font-mono whitespace-nowrap">
            {paper.publishDate}
          </span>
        </div>
        
        <h3 className="text-lg font-bold text-slate-900 leading-tight mb-1 group-hover:text-teal-700 transition-colors">
          {paper.titleEn}
        </h3>
        <h4 className="text-sm text-slate-600 font-medium mb-3">
          {paper.titleCn}
        </h4>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`px-2 py-1 rounded-md border font-medium ${getTypeColor(paper.researchType)}`}>
            {paper.researchType}
          </span>
          <span className="px-2 py-1 rounded-md border bg-purple-50 text-purple-700 border-purple-100 font-medium">
            {paper.diseaseType}
          </span>
          {paper.url && (
            <a href={paper.url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 rounded-md border bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200 transition-colors flex items-center gap-1">
              PubMed ↗
            </a>
          )}
        </div>
      </div>

      {/* Detailed Metadata Table */}
      <div className="px-5 py-3 bg-slate-50 text-xs border-b border-slate-100 grid grid-cols-2 gap-x-4 gap-y-2 text-slate-600">
        <div className="col-span-2 truncate" title={paper.firstInstitution}>
          <span className="font-semibold text-slate-500">Institution:</span> {paper.firstInstitution}
        </div>
        <div className="truncate" title={paper.firstAuthor}>
          <span className="font-semibold text-slate-500">1st Author:</span> {paper.firstAuthor}
        </div>
        <div className="truncate" title={paper.correspondingAuthor}>
          <span className="font-semibold text-slate-500">Corresp:</span> {paper.correspondingAuthor}
        </div>
        <div>
          <span className="font-semibold text-slate-500">Sample:</span> {paper.sampleSize}
        </div>
        <div className="truncate" title={paper.pmidDoi}>
          <span className="font-semibold text-slate-500">ID:</span> {paper.pmidDoi}
        </div>
      </div>

      {/* Content Body */}
      <div className="p-5 flex-grow space-y-5 text-sm text-slate-700">
        {/* Clinical Endpoints */}
        {hasEndpoints && (
          <div className="bg-indigo-50/60 rounded-lg p-3 border border-indigo-100">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z"></path></svg>
              <p className="font-bold text-indigo-900 text-xs uppercase tracking-wide">临床终点/生物标志物详情</p>
            </div>
            <p className="text-slate-800 leading-relaxed text-xs font-medium">{paper.endpointsDetails}</p>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-4 bg-teal-500 rounded-full"></div>
            <p className="font-bold text-slate-900">主要结论 (Key Conclusion)</p>
          </div>
          <p className="leading-relaxed pl-3 border-l-2 border-slate-100 bg-yellow-50/50 p-2 rounded">
            {paper.keyConclusions}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-slate-400 rounded-full"></div>
              <p className="font-bold text-slate-900">摘要 / 全文简介 (Summary)</p>
            </div>
            {isFullTextMissing && (
              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold border border-amber-200">
                 ⚠️ 暂时无法查阅全文
              </span>
            )}
          </div>
          <div className={`text-slate-600 leading-relaxed pl-3 text-xs border-l-2 border-slate-100 ${!isExpanded ? 'line-clamp-6' : ''}`}>
            {paper.abstract}
          </div>
           <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-teal-600 text-xs font-medium mt-1 ml-3 hover:underline focus:outline-none"
          >
            {isExpanded ? 'Show Less' : 'Read More'}
          </button>
        </div>
      </div>

    </div>
  );
};

export default PaperCard;
