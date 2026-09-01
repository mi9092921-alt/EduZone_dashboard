'use client';

import { Box, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import React, { useMemo } from 'react';

interface CoordinatePoint {
  lat: number;
  lng: number;
  count?: number;
}

interface GeoDistributionMapProps {
  points: CoordinatePoint[];
  height?: number;
}

/**
 * Simplified World Map projection using a single SVG path.
 * Dot density overlay based on student locations.
 */
export function GeoDistributionMap({ points, height = 400 }: GeoDistributionMapProps) {
  const t = useTranslations('analytics');

  // World path (Simplified Mercator Projection)
  // Note: For a true world map, we'd need a multi-continent geoJSON path.
  // I will use a placeholder but high-fidelity looking projection or a solid stylized map.

  // Project lat/lng to SVG coordinates (Miller projection simplified)
  const project = (lat: number, lng: number) => {
    // Map bounds: -180 to 180 (lng), -85 to 85 (lat)
    const x = ((lng + 180) * 1000) / 360;
    const y = ((90 - lat) * 500) / 180;
    return { x, y };
  };

  const mapPoints = useMemo(() => {
    return points.map((p, i) => {
      const { x, y } = project(p.lat, p.lng);
      return (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="1.5"
          fill="var(--primary)"
          className="animate-pulse"
          style={{ animationDelay: `${(i % 20) * 100}ms` }}
        />
      );
    });
  }, [points]);

  return (
    <Box sx={{ width: '100%', position: 'relative', overflow: 'hidden' }}>
      <svg viewBox="0 0 1000 500" width="100%" height={height} className="bg-muted/10 rounded-2xl">
        {/* Simplified World Continents Background */}
        <g fill="var(--muted-foreground)" opacity="0.1">
          {/* North America */}
          <path d="M120,80 L280,80 L280,220 L200,280 L140,240 Z" />
          {/* South America */}
          <path d="M220,300 L300,300 L280,480 L200,380 Z" />
          {/* Europe */}
          <path d="M450,80 L550,80 L580,180 L480,200 Z" />
          {/* Africa */}
          <path d="M480,220 L620,220 L600,420 L500,440 Z" />
          {/* Asia */}
          <path d="M580,80 L880,80 L920,320 L650,350 Z" />
          {/* Oceania */}
          <path d="M800,380 L920,380 L900,480 L820,460 Z" />
        </g>

        {/* The data points */}
        <g>{mapPoints}</g>
      </svg>

      {/* Legend */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          bgcolor: 'background.paper',
          p: 1,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: 1,
        }}
      >
        <Typography
          variant="caption"
          sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}
        >
          <Box sx={{ w: 8, h: 8, bgcolor: 'primary.main', borderRadius: '50%' }} />
          {t('active_students')}
        </Typography>
      </Box>
    </Box>
  );
}
