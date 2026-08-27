'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Switch,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
} from '@mui/material';
import {
  Add,
  Delete,
  Security,
  Language,
  VpnLock,
  Schedule,
  Devices,
  InfoOutlined,
} from '@mui/icons-material';
import { alpha, useTheme } from '@mui/material/styles';
import { AccessRule } from '@eduzone/types';
import { getAccessRules, upsertAccessRule, deleteAccessRule, toggleAccessRule } from '@/infrastructure/repos/access-rules.service';
import { useToastStore } from '@/adapters/stores/toast.store';

export function AccessRulesManager({ tenantId }: { tenantId?: string }) {
  const theme = useTheme();
  const { showToast } = useToastStore();
  const [rules, setRules] = useState<AccessRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<AccessRule> | null>(null);

  const fetchRules = async () => {
    setIsLoading(true);
    try {
      const result = await getAccessRules(tenantId);
      setRules(result.data);
    } catch (err) {
      showToast('Failed to load access rules', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, [tenantId]);

  const handleToggle = async (id: string, current: boolean) => {
    try {
      await toggleAccessRule(id, !current);
      setRules(rules.map(r => r.id === id ? { ...r, is_active: !current } : r));
      showToast('Rule status updated', 'success');
    } catch (err) {
      showToast('Failed to update rule status', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this access rule?')) return;
    try {
      await deleteAccessRule(id);
      setRules(rules.filter(r => r.id !== id));
      showToast('Rule deleted', 'success');
    } catch (err) {
      showToast('Failed to delete rule', 'error');
    }
  };

  const handleSave = async () => {
    if (!editingRule?.rule_type || !editingRule?.rule_value) return;
    try {
      await upsertAccessRule({
        ...editingRule,
        tenant_id: tenantId || '00000000-0000-0000-0000-000000000000', // Global if no tenant
      } as AccessRule);
      fetchRules();
      setIsDialogOpen(false);
      showToast('Rule saved successfully', 'success');
    } catch (err) {
      showToast('Failed to save rule', 'error');
    }
  };

  const RULE_ICONS: Record<string, any> = {
    ip_whitelist: <VpnLock />,
    geo_location: <Language />,
    time_window: <Schedule />,
    device_type: <Devices />,
  };

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>;

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Security color="primary" /> Access & Gating Rules
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Configure IP whitelisting, Geo-fencing, and time-based access controls.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => {
            setEditingRule({ rule_type: 'ip_whitelist', rule_value: {}, is_active: true });
            setIsDialogOpen(true);
          }}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
        >
          Add Rule
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase' }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase' }}>Config</TableCell>
              <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase' }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase' }}>Created</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                  <Typography variant="body2" color="text.secondary italic">No active access rules found.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ p: 0.5, borderRadius: 1, bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', display: 'flex' }}>
                        {RULE_ICONS[rule.rule_type] || <Security />}
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{rule.rule_type.replace('_', ' ')}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1 }}>
                      {JSON.stringify(rule.rule_value)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={rule.is_active}
                      onChange={() => handleToggle(rule.id, rule.is_active)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(rule.created_at).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" color="error" onClick={() => handleDelete(rule.id)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Rule Dialog */}
      <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>{editingRule?.id ? 'Edit Rule' : 'New Access Rule'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
            <TextField
              select
              label="Rule Type"
              fullWidth
              autoFocus
              value={editingRule?.rule_type || ''}
              onChange={(e) => setEditingRule({ ...editingRule, rule_type: e.target.value as any })}
            >
              <MenuItem value="ip_whitelist">IP Whitelist (CIDR)</MenuItem>
              <MenuItem value="geo_location">Geo Location (ISO Country Codes)</MenuItem>
              <MenuItem value="time_window">Time Window (Cron/Range)</MenuItem>
              <MenuItem value="device_type">Device Type Gating</MenuItem>
            </TextField>

            <TextField
              label="Configuration (JSON)"
              fullWidth
              multiline
              rows={4}
              placeholder='{"ips": ["192.168.1.1/32"]}'
              value={editingRule?.rule_value ? JSON.stringify(editingRule.rule_value, null, 2) : ''}
              onChange={(e) => {
                try {
                  const val = JSON.parse(e.target.value);
                  setEditingRule({ ...editingRule, rule_value: val });
                } catch {
                  // Allow typing invalid JSON temporarily
                }
              }}
              helperText="Must be valid JSON configuration for the selected rule type."
            />

            <Box sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.05), border: '1px solid', borderColor: alpha(theme.palette.info.main, 0.2), display: 'flex', gap: 2 }}>
              <InfoOutlined color="info" fontSize="small" />
              <Typography variant="caption" color="info.main">
                Rules are applied in order of creation. Whitelists are restrictive (deny by default).
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={() => setIsDialogOpen(false)} sx={{ fontWeight: 700, textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} sx={{ fontWeight: 700, textTransform: 'none', px: 3 }}>Save Rule</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
