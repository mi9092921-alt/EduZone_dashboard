'use client';

import { useState, useCallback } from 'react';
import {
  VerifiedUser,
  ErrorOutline,
  PlayArrow,
} from '@mui/icons-material';
import { LinearProgress, Tooltip } from '@mui/material';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { verifyHashChain } from '@/lib/hash-chain';
import { getActivityLogsForVerification } from '@/infrastructure/repos/audit.service';
import { useAuditChainState } from '@/adapters/queries/audit.queries';
import type { VerificationResult } from '@/domain/types/audit.types';

interface ChainVerifierProps {
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}

export function ChainVerifier({ dateFrom, dateTo }: ChainVerifierProps) {
  const t = useTranslations('audit');
  const [isVerifying, setIsVerifying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: chainState } = useAuditChainState();

  const handleVerify = useCallback(async () => {
    setIsVerifying(true);
    setProgress(0);
    setResult(null);
    setError(null);

    try {
      const from = dateFrom || new Date(Date.now() - 24 * 3600_000).toISOString();
      const to = dateTo || new Date().toISOString();

      const logs = await getActivityLogsForVerification(from, to);

      if (logs.length === 0) {
        setResult({ valid: true, entriesVerified: 0 });
        setIsVerifying(false);
        return;
      }

      // The genesis hash for the first log is its prev_hash
      const genesisHash = logs[0]?.prev_hash ?? 'GENESIS_BLOCK';

      const verification = await verifyHashChain(
        logs,
        genesisHash,
        (pct) => setProgress(pct),
      );

      setResult(verification);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('status_verification_failed'));
    } finally {
      setIsVerifying(false);
    }
  }, [dateFrom, dateTo, t]);

  return (
    <div className="flex flex-col gap-3">
      {/* Chain state info */}
      {chainState && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{t('label_last_seq')} <strong className="text-foreground font-mono">{chainState.last_seq}</strong></span>
          <Tooltip title={chainState.last_hash}>
            <span>{t('label_last_hash')} <strong className="text-foreground font-mono">{chainState.last_hash.slice(0, 12)}…</strong></span>
          </Tooltip>
        </div>
      )}

      {/* Verify button */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleVerify}
          disabled={isVerifying}
          isLoading={isVerifying}
        >
          {!isVerifying && <PlayArrow className="text-sm" />}
          {isVerifying ? t('btn_verifying') : t('btn_verify_chain')}
        </Button>

        {/* Progress */}
        {isVerifying && (
          <div className="flex-1 max-w-xs">
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 6,
                borderRadius: 3,
                backgroundColor: 'var(--muted)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: 'var(--primary)',
                  borderRadius: 3,
                },
              }}
            />
            <p className="text-[10px] text-muted-foreground mt-1">{progress}%</p>
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${
            result.valid
              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
              : 'bg-destructive/10 text-destructive border border-destructive/20'
          }`}
        >
          {result.valid ? (
            <>
              <VerifiedUser className="text-base" />
              {t('status_chain_intact', { count: result.entriesVerified })}
            </>
          ) : (
            <>
              <ErrorOutline className="text-base" />
              {t('status_tamper_detected', { seq: result.failedAtSeq ?? '?' })}
            </>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-destructive/10 text-destructive border border-destructive/20">
          <ErrorOutline className="text-base" />
          {error}
        </div>
      )}
    </div>
  );
}
