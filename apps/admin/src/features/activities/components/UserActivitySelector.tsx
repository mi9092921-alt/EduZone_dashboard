'use client';

import { Search, Person, Close, Apartment } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import React, { useState, useEffect, useRef } from 'react';

import { useTenants } from '@/adapters/queries/tenants.queries';
import { useAuthUser } from '@/adapters/stores/auth.store';
import { Select, SelectItem } from '@/components/ui/Select';
import { searchUsers, type UserSearchResult } from '@/infrastructure/repos/users.service';
import { cn } from '@/lib/utils';


interface UserActivitySelectorProps {
  onSelect: (userId: string | null) => void;
  selectedUserId: string | null;
  userRole?: string;
}

export function UserActivitySelector({ onSelect, selectedUserId, userRole }: UserActivitySelectorProps) {
  const t = useTranslations('activities');
  const authUser = useAuthUser();
  const isSuperAdmin = authUser?.primary_role === 'super_admin';
  
  const [query, setQuery] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('all');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Track the last selected name locally to avoid re-searching it
  const lastSelectedName = useRef<string | null>(null);

  // Fetch tenants for super_admin
  const { data: tenantsData } = useTenants({}, 1, 100);
  const tenants = tenantsData?.data ?? [];

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search logic
  useEffect(() => {
    // We allow searching with empty query to show "Recent Users"
    const isSearchingEmpty = !query.trim();

    // Skip search if the query is the name we just selected
    if (query === lastSelectedName.current && !isSearchingEmpty) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const targetTenantId = authUser?.primary_role === 'admin' 
          ? authUser.tenant_id 
          : (selectedTenantId === 'all' ? undefined : selectedTenantId);

        // Fetch users (specifically students if that's the context, or all if preferred)
        const data = await searchUsers(query, 10, targetTenantId, userRole);
        setResults(data);
        
        // Only auto-open if searching for something or specifically requested
        if (query.length > 0) {
          setIsOpen(true);
        }
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    }, isSearchingEmpty ? 0 : 300); // Immediate for empty query (initial load)

    return () => clearTimeout(timer);
  }, [query, authUser, selectedTenantId]);

  const handleSelect = (user: UserSearchResult) => {
    if (!user || !user.id) return;
    
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'User';
    lastSelectedName.current = fullName;
    
    setQuery(fullName);
    setResults([]);
    setIsOpen(false);
    
    // Crucial: call the parent's setter
    onSelect(user.id);
  };

  const handleClear = () => {
    lastSelectedName.current = null;
    setQuery('');
    setResults([]);
    setIsOpen(false);
    onSelect(null);
  };

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full max-w-2xl" ref={dropdownRef}>
      {/* Tenant Selector for Super Admin */}
      {isSuperAdmin && (
        <div className="w-full sm:w-[220px] shrink-0">
          <Select
            value={selectedTenantId}
            onValueChange={(val) => {
              setSelectedTenantId(val);
              // Clear current selection when changing organization to avoid mismatch
              if (selectedUserId) handleClear();
            }}
            className="h-11 rounded-2xl border-border/50 bg-card shadow-inner-glow"
            startAdornment={<Apartment className="ms-3 text-muted-foreground text-base" />}
          >
            <SelectItem value="all">
              <span className="font-bold">{t('all_orgs')}</span>
            </SelectItem>
            {tenants.map((tenant) => (
              <SelectItem key={tenant.id} value={tenant.id}>
                {tenant.name}
              </SelectItem>
            ))}
          </Select>
        </div>
      )}

      {/* User Search Input */}
      <div className="relative flex-1 group">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground text-base transition-colors group-focus-within:text-primary" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            if (val !== lastSelectedName.current) {
              lastSelectedName.current = null; // Reset if they start typing again
            }
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={t('search_placeholder')}
          className="w-full h-11 ps-10 pe-10 rounded-2xl border border-border/50 bg-card text-sm text-foreground shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-inner-glow cursor-pointer"
        />
        {query && (
          <button 
            type="button"
            onClick={handleClear}
            className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors z-10"
          >
            <Close fontSize="small" />
          </button>
        )}

        {isOpen && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border/50 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-2 max-h-[320px] overflow-y-auto no-scrollbar">
              {results.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(user);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-150 text-start group cursor-pointer",
                    selectedUserId === user.id 
                      ? "bg-primary/5 ring-1 ring-primary/20" 
                      : "hover:bg-muted/50"
                  )}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-transform group-hover:scale-105">
                    <Person fontSize="small" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>
                  <div className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/50">
                    {user.primary_role}
                  </div>
                </button>
              ))}
            </div>
            {isSearching && (
              <div className="p-4 text-center border-t border-border/10 bg-muted/5">
                <div className="inline-block w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
