'use client';

import {
  Place,
  Language,
  Public,
  ContentCopy,
  Check,
  GpsFixed,
  TravelExplore,
} from '@mui/icons-material';
import { useTranslations, useLocale } from 'next-intl';
import React, { useState } from 'react';

import { useActivityLogs } from '@/adapters/queries/audit.queries';
import { useUserLocationLogs } from '@/adapters/queries/user_locations.queries';
import { cn } from '@/lib/utils';

interface ActivityLocationsTabProps {
  userId: string;
}

export function ActivityLocationsTab({ userId }: ActivityLocationsTabProps) {
  const t = useTranslations('activities');
  const locale = useLocale();

  const { data: auditData, isLoading: isAuditLoading } = useActivityLogs(
    { user_id: userId },
    1,
    50,
  );

  const { data: locationLogs, isLoading: isLocationsLoading } = useUserLocationLogs(userId);

  const logs = auditData?.data ?? [];
  const locationData = locationLogs ?? [];

  // Filter for unique sessions based on IP and Region
  const uniqueSessions = logs.filter(
    (log, index, self) =>
      index ===
      self.findIndex((t) => t.ip_address === log.ip_address && t.region_id === log.region_id),
  );

  if (isAuditLoading || isLocationsLoading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (uniqueSessions.length === 0 && locationData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
        <Place className="text-4xl mb-3 text-muted-foreground" />
        <p className="text-sm font-medium">{t('no_activities_found')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── High-Precision Section ────────────────────────────────── */}
      {locationData.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1 text-primary">
            <GpsFixed className="text-lg" />
            <h3 className="text-xs font-black uppercase tracking-widest">
              {t('label_high_precision')}
            </h3>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm shadow-inner-glow">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-start px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                      {t('header_coordinates')}
                    </th>
                    <th className="text-start px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                      {t('header_accuracy')}
                    </th>
                    <th className="text-start px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                      Source
                    </th>
                    <th className="text-start px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                      {t('header_date')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {locationData.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-background border border-border/40 group-hover:bg-card transition-colors">
                            <TravelExplore fontSize="small" className="text-emerald-500" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-bold text-foreground">
                              {log.latitude?.toFixed(6)}, {log.longitude?.toFixed(6)}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {t('label_lat')}: {log.latitude} {t('label_lng')}: {log.longitude}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <div
                            className={cn(
                              'w-2 h-2 rounded-full',
                              (log.accuracy ?? 100) < 50 ? 'bg-emerald-500' : 'bg-amber-500',
                            )}
                          />
                          <span className="font-bold text-foreground text-xs">
                            {log.accuracy?.toFixed(1) ?? '—'}
                            {t('label_meters')}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-[10px] font-black uppercase tracking-tighter bg-muted px-1.5 py-0.5 rounded border border-border/50">
                          {log.source || 'GPS'}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex flex-col text-[11px]">
                          <span className="text-foreground font-bold">
                            {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                              new Date(log.timestamp),
                            )}
                          </span>
                          <span className="text-muted-foreground mt-0.5 uppercase text-[10px]">
                            {new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(
                              new Date(log.timestamp),
                            )}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── Session History Section (Audit Fallback) ──────────────── */}
      {uniqueSessions.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1 text-muted-foreground opacity-60">
            <Language className="text-lg" />
            <h3 className="text-xs font-black uppercase tracking-widest">
              {t('label_session_history')}
            </h3>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/60 grayscale-[0.5] hover:grayscale-0 transition-all">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-start px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                      {t('header_ip')}
                    </th>
                    <th className="text-start px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                      {t('header_region')}
                    </th>
                    <th className="text-start px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                      {t('header_date')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {uniqueSessions.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/10 transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-background border border-border/40">
                            <Language fontSize="small" className="text-primary/70" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-foreground/80">
                              {log.ip_address || '—'}
                            </span>
                            {log.ip_address && <CopyButton value={log.ip_address} />}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 text-xs">
                          <div className="p-1.5 rounded-md bg-muted text-muted-foreground">
                            <Public fontSize="inherit" />
                          </div>
                          <span className="font-bold text-foreground/80 uppercase">
                            {log.region_id || (locale === 'ar' ? 'غير معروف' : 'Unknown')}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex flex-col text-[11px]">
                          <span className="text-foreground/80 font-bold">
                            {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                              new Date(log.created_at),
                            )}
                          </span>
                          <span className="text-muted-foreground mt-0.5 uppercase text-[10px]">
                            {new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(
                              new Date(log.created_at),
                            )}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'p-1 rounded-md transition-colors',
        copied ? 'text-emerald-500' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {copied ? <Check fontSize="inherit" /> : <ContentCopy fontSize="inherit" />}
    </button>
  );
}
