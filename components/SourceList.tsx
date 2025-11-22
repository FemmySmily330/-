import React from 'react';
import { GroundingChunk } from '../types';

interface SourceListProps {
  chunks: GroundingChunk[];
}

const SourceList: React.FC<SourceListProps> = ({ chunks }) => {
  // Filter out chunks that don't have web data
  const validSources = chunks.filter(c => c.web?.uri && c.web?.title);
  
  if (validSources.length === 0) return null;

  // Deduplicate sources by URI
  const uniqueSources = Array.from(new Map(validSources.map(item => [item.web!.uri, item])).values());

  return (
    <div className="mt-8 pt-6 border-t border-slate-200">
      <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
        引用来源 (Google Search Grounding)
      </h4>
      <div className="flex flex-wrap gap-2">
        {uniqueSources.map((source, idx) => (
          <a
            key={idx}
            href={source.web!.uri}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center max-w-full truncate bg-white border border-slate-300 hover:border-teal-500 hover:text-teal-600 text-slate-600 text-xs px-3 py-1.5 rounded-md transition-colors duration-200"
          >
            <span className="truncate max-w-[200px]">{source.web!.title}</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 ml-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
};

export default SourceList;