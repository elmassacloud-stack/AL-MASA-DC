import React from 'react';
import { SubmittalStatusCode } from '../../types';
import { SUBMITTAL_STATUS_CONFIG } from '../../config';

interface Props {
  status: SubmittalStatusCode;
  showDescription?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<Props> = ({ status, showDescription = false, size = 'md' }) => {
  const meta = SUBMITTAL_STATUS_CONFIG[status] || {
    code: status,
    labelAr: status,
    labelEn: status,
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    description: ''
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs md:text-sm px-2.5 py-1',
    lg: 'text-sm md:text-base px-3 py-1.5'
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium border rounded-md whitespace-nowrap shadow-xs transition-colors ${meta.badgeClass} ${sizeClasses}`}
      title={meta.description}
    >
      <span className="font-mono font-bold tracking-wider">{meta.code}</span>
      <span className="opacity-80">·</span>
      <span>{meta.labelAr.split('(')[0].trim()}</span>
      {showDescription && meta.description && (
        <span className="hidden sm:inline text-xs opacity-75 font-normal mr-1">
          ({meta.description})
        </span>
      )}
    </span>
  );
};
