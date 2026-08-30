'use client';

import { Visibility, Place, History } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import React, { useState } from 'react';

import { ActivityLocationsTab } from './ActivityLocationsTab';
import { ActivityViewsTab } from './ActivityViewsTab';
import { UserActivitySelector } from './UserActivitySelector';

import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

export function ActivitiesPage() {
  const t = useTranslations('activities');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'views' | 'locations'>('views');

  const tabs = [
    { id: 'views', label: t('tab_views'), icon: Visibility },
    { id: 'locations', label: t('tab_locations'), icon: Place },
  ];

  return (
    <div className="container-faang pb-20">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-title">{t('title')}</h1>
          {/* No totalCount badge here as it's user-specific */}
        </div>

        <UserActivitySelector
          selectedUserId={selectedUserId}
          onSelect={setSelectedUserId}
          userRole="student"
        />
      </div>

      <AnimatePresence mode="wait">
        {!selectedUserId ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full"
          >
            <Card className="border-dashed  pt-6 border-2 bg-muted/20">
              <CardContent className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center text-primary mb-4 ring-1 ring-primary/20">
                  <History className="text-3xl" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">{t('select_user')}</h3>
                <p className="text-muted-foreground text-sm max-w-sm">
                  {t('select_user_desc')}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            {/* Tab Navigation */}
            <div className="flex items-center p-1 bg-muted/40 rounded-2xl w-fit border border-border/40 backdrop-blur-sm shadow-sm">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'views' | 'locations')}
                  className={cn(
                    "relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
                    activeTab === tab.id
                      ? "text-primary shadow-lg"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="active-tab"
                      className="absolute inset-0 bg-card rounded-xl shadow-md border border-border/40 z-0 shadow-inner-glow"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <tab.icon className={cn("text-lg relative z-10", activeTab === tab.id ? "text-primary" : "text-muted-foreground")} />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              {activeTab === 'views' ? (
                <ActivityViewsTab userId={selectedUserId} />
              ) : (
                <ActivityLocationsTab userId={selectedUserId} />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
