'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Add as AddIcon,
  Campaign as CampaignIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Notifications as NotificationsIcon,
  People as PeopleIcon,
  Person as PersonIcon,
  School as SchoolIcon,
  Send as SendIcon,
  SupervisorAccount as SupervisorIcon,
} from '@mui/icons-material';
import { EmojiEvents as PermissionIcon } from '@mui/icons-material';
import {
  Box,
  Button,
  Card as MuiCard,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormHelperText,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tabs,
  Tab,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
} from '@mui/material';
import { Autocomplete, ToggleButton, ToggleButtonGroup, Avatar } from '@mui/material';
import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';
import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';

import {
  useSendNotification,
  useDeleteNotification,
  SendNotificationInput,
} from '@/adapters/mutations/notifications.mutations';
import { useNotifications, TargetAudience } from '@/adapters/queries/notifications.queries';
import { useAuthUser } from '@/adapters/stores/auth.store';
import { useToastStore } from '@/adapters/stores/toast.store';
import { StatsCard, StatsCardContent, StatsCardIcon } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TablePagination } from '@/components/ui/TablePagination';
import { PermissionGate } from '@/features/layout/components/PermissionGate';
import {
  getAllPermissions,
  searchUsers,
  type UserSearchResult,
} from '@/infrastructure/repos/users.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

/**
 * Returns which audience targets a given role is allowed to send to.
 */
function getAllowedAudiences(role: string): TargetAudience[] {
  switch (role) {
    case 'super_admin':
      return ['all', 'students', 'teachers', 'admins'];
    case 'admin':
      return ['all', 'students', 'teachers'];
    case 'teacher':
      return ['students'];
    default:
      return [];
  }
}

function AudienceChip({
  audience,
  permission,
  usersCount,
}: {
  audience: TargetAudience;
  permission?: string | null;
  usersCount?: number | null;
}) {
  const t = useTranslations('notifications');
  const icons: Record<TargetAudience, React.ReactNode> = {
    all: <PeopleIcon sx={{ fontSize: 14 }} />,
    students: <SchoolIcon sx={{ fontSize: 14 }} />,
    teachers: <PersonIcon sx={{ fontSize: 14 }} />,
    admins: <SupervisorIcon sx={{ fontSize: 14 }} />,
  };

  const colors: Record<TargetAudience, 'primary' | 'secondary' | 'success' | 'warning'> = {
    all: 'primary',
    students: 'success',
    teachers: 'secondary',
    admins: 'warning',
  };

  if (permission) {
    return (
      <Chip
        icon={<PermissionIcon sx={{ fontSize: 14 }} />}
        label={t('audience_permission', { permission })}
        color="info"
        size="small"
        variant="outlined"
        sx={{ fontWeight: 600 }}
      />
    );
  }

  if (usersCount && usersCount > 0) {
    return (
      <Chip
        icon={<PersonIcon sx={{ fontSize: 14 }} />}
        label={t('audience_specific', { count: usersCount })}
        color="default"
        size="small"
        variant="outlined"
        sx={{ fontWeight: 600 }}
      />
    );
  }

  return (
    <Chip
      icon={icons[audience] as React.ReactElement}
      label={t(`audience_${audience}` as Parameters<typeof t>[0])}
      color={colors[audience]}
      size="small"
      variant="outlined"
      sx={{ fontWeight: 600 }}
    />
  );
}

function StatCard({
  label,
  value,
  icon,
  color: _color,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <StatsCard>
      <StatsCardContent>
        <StatsCardIcon
          style={{ backgroundColor: 'primary.main', color: 'primary.contrastText', opacity: 0.1 }}
        >
          {icon}
        </StatsCardIcon>
        <div className="flex flex-col items-center">
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{
              fontWeight: 700,
              mb: 1,
              lineHeight: 1.2,
              textTransform: 'uppercase',
              fontSize: '0.625rem',
            }}
          >
            {label}
          </Typography>
          <Typography variant="h3" color="text.primary" sx={{ fontWeight: 800 }}>
            {value}
          </Typography>
        </div>
      </StatsCardContent>
    </StatsCard>
  );
}

// ─── Send Dialog ────────────────────────────────────────────────────────────────

interface SendDialogProps {
  open: boolean;
  onClose: () => void;
  allowedAudiences: TargetAudience[];
  onSuccess: (msg: string) => void;
}

function SendNotificationDialog({ open, onClose, allowedAudiences, onSuccess }: SendDialogProps) {
  const t = useTranslations('notifications');
  const sendMutation = useSendNotification();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [userOptions, setUserOptions] = useState<UserSearchResult[]>([]);

  useEffect(() => {
    getAllPermissions().then(setPermissions);
  }, []);

  useEffect(() => {
    if (userQuery.length > 1) {
      searchUsers(userQuery).then(setUserOptions);
    }
  }, [userQuery]);

  const sendNotificationSchema = z.object({
    title: z.string().min(3, t('error_title_min')).max(100),
    body: z.string().min(10, t('error_body_min')).max(500),
    targeting_type: z.enum(['role', 'permission', 'users']).optional(),
    target_audience: z.enum(['all', 'students', 'teachers', 'admins']).optional(),
    target_permission: z.string().nullable().optional(),
    target_user_ids: z.array(z.string()).nullable().optional(),
  });

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof sendNotificationSchema>>({
    resolver: zodResolver(sendNotificationSchema),
    defaultValues: {
      title: '',
      body: '',
      targeting_type: 'role',
      target_audience: allowedAudiences[0] ?? 'students',
      target_permission: '',
      target_user_ids: [],
    },
  });

  const bodyValue = watch('body') || '';
  const watchTargetType = watch('targeting_type');

  function handleClose() {
    reset();
    onClose();
  }

  const onSubmit = async (data: z.infer<typeof sendNotificationSchema>) => {
    try {
      const payload: SendNotificationInput = {
        title: data.title,
        body: data.body,
      };

      // Role-based safe default for audience (e.g., 'students' for teachers)
      const defaultAudience = allowedAudiences.includes('students')
        ? 'students'
        : allowedAudiences[0] || 'all';

      if (data.targeting_type === 'role') {
        payload.target_audience = data.target_audience || defaultAudience;
      } else if (data.targeting_type === 'permission') {
        payload.target_permission = data.target_permission || null;
        payload.target_audience = defaultAudience;
      } else if (data.targeting_type === 'users') {
        // Do NOT set target_audience when targeting specific users.
        // The DB's send_notification function gates on audience value and will
        // raise PERMISSION_DENIED if it sees an audience alongside user IDs.
        payload.target_user_ids = data.target_user_ids?.length ? data.target_user_ids : null;
      }

      await sendMutation.mutateAsync(payload);
      onSuccess(t('status_success'));
      handleClose();
    } catch {
      // error handled by mutation
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, bgcolor: 'background.paper', backgroundImage: 'none' } }}
    >
      <DialogTitle sx={{ p: 3, pb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" gap={1.5}>
            <Box
              sx={{
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                p: 1,
                borderRadius: 2,
                display: 'flex',
                opacity: 0.9,
              }}
            >
              <CampaignIcon />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary' }}>
              {t('dialog_send_title')}
            </Typography>
          </Stack>
          <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: 3 }}>
        <Stack gap={3}>
          {/* Targeting Type */}
          <Box>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 600, mb: 1, display: 'block' }}
            >
              {t('label_targeting_type')}
            </Typography>
            <Controller
              name="targeting_type"
              control={control}
              defaultValue="role"
              render={({ field }) => (
                <ToggleButtonGroup
                  {...field}
                  exclusive
                  fullWidth
                  size="small"
                  onChange={(_, value) => {
                    if (value) field.onChange(value);
                  }}
                  sx={{ borderRadius: 2 }}
                >
                  <ToggleButton value="role" sx={{ textTransform: 'none' }}>
                    {t('targeting_role')}
                  </ToggleButton>
                  <ToggleButton value="permission" sx={{ textTransform: 'none' }}>
                    {t('targeting_permission')}
                  </ToggleButton>
                  <ToggleButton value="users" sx={{ textTransform: 'none' }}>
                    {t('targeting_users')}
                  </ToggleButton>
                </ToggleButtonGroup>
              )}
            />
          </Box>

          {/* Conditional Target Selection */}
          {watchTargetType === 'role' && (
            <Controller
              name="target_audience"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth error={!!errors.target_audience} size="small">
                  <InputLabel>{t('label_audience')}</InputLabel>
                  <Select {...field} label={t('label_audience')} sx={{ borderRadius: 2 }}>
                    {allowedAudiences.map((aud) => (
                      <MenuItem key={aud} value={aud}>
                        <AudienceChip audience={aud} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          )}

          {watchTargetType === 'permission' && (
            <Controller
              name="target_permission"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth error={!!errors.target_permission} size="small">
                  <InputLabel>{t('label_permission')}</InputLabel>
                  <Select {...field} label={t('label_permission')} sx={{ borderRadius: 2 }}>
                    {permissions.map((p) => (
                      <MenuItem key={p} value={p}>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <PermissionIcon sx={{ fontSize: 16, color: 'info.main' }} />
                          <Typography variant="body2">{p}</Typography>
                        </Stack>
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.target_permission && (
                    <FormHelperText>{errors.target_permission.message as string}</FormHelperText>
                  )}
                </FormControl>
              )}
            />
          )}

          {watchTargetType === 'users' && (
            <Controller
              name="target_user_ids"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  multiple
                  fullWidth
                  size="small"
                  options={userOptions}
                  getOptionLabel={(option) => `${option.first_name} ${option.last_name}`}
                  onInputChange={(_, value) => setUserQuery(value)}
                  onChange={(_, value) => field.onChange(value.map((v) => v.id))}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t('label_users')}
                      placeholder={t('placeholder_search_users')}
                      error={!!errors.target_user_ids}
                      helperText={errors.target_user_ids?.message as string}
                      size="small"
                      InputLabelProps={
                        (params.InputLabelProps ?? {}) as NonNullable<
                          React.ComponentProps<typeof TextField>['InputLabelProps']
                        >
                      }
                      InputProps={{ ...params.InputProps, sx: { borderRadius: 2 } }}
                    />
                  )}
                  renderTags={(tagValue, getTagProps) =>
                    tagValue.map((option, index) => (
                      <Chip
                        {...getTagProps({ index })}
                        key={option.id}
                        label={`${option.first_name} ${option.last_name}`}
                        size="small"
                        avatar={
                          <Avatar sx={{ width: 16, height: 16 }}>{option.first_name?.[0]}</Avatar>
                        }
                      />
                    ))
                  }
                />
              )}
            />
          )}

          {/* Title */}
          <Controller
            name="title"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label={t('label_title')}
                placeholder={t('placeholder_title')}
                fullWidth
                size="small"
                error={!!errors.title}
                helperText={
                  (errors.title?.message as string) ?? `${(field.value || '').length}/100`
                }
                InputProps={{ sx: { borderRadius: 2 } }}
              />
            )}
          />

          {/* Body */}
          <Controller
            name="body"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label={t('label_body')}
                placeholder={t('placeholder_body')}
                fullWidth
                multiline
                rows={4}
                error={!!errors.body}
                helperText={(errors.body?.message as string) ?? `${bodyValue.length}/500`}
                InputProps={{ sx: { borderRadius: 2 } }}
              />
            )}
          />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0 }}>
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            color: 'text.secondary',
            borderColor: 'divider',
          }}
        >
          {t('btn_cancel')}
        </Button>
        <Button
          onClick={handleSubmit(onSubmit)}
          variant="contained"
          disabled={isSubmitting || sendMutation.isPending}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 700,
            backgroundColor: 'primary.main',
            '&:hover': { backgroundColor: 'primary.dark' },
          }}
          startIcon={
            sendMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />
          }
        >
          {t('btn_send')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Delete Confirm Dialog ─────────────────────────────────────────────────────

interface DeleteDialogProps {
  open: boolean;
  notificationId: string | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

function DeleteNotificationDialog({ open, notificationId, onClose, onSuccess }: DeleteDialogProps) {
  const t = useTranslations('notifications');
  const deleteMutation = useDeleteNotification();

  const handleDelete = async () => {
    if (!notificationId) return;
    try {
      await deleteMutation.mutateAsync(notificationId);
      onSuccess(t('status_delete_success'));
      onClose();
    } catch {
      // toast handled in mutation
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleDelete}
      title={t('confirm_delete_title')}
      description={t('confirm_delete_desc')}
      confirmLabel={t('btn_delete')}
      cancelLabel={t('btn_cancel')}
      confirmColor="error"
      isLoading={deleteMutation.isPending}
      icon={<DeleteIcon />}
    />
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const user = useAuthUser();
  const role = user?.primary_role ?? 'student';
  const allowedAudiences = getAllowedAudiences(role);

  const [page, setPage] = useState(1);
  const { showToast } = useToastStore();
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [tabValue, setTabValue] = useState(0);
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const isTeacher = role === 'teacher';
  const isSuperAdmin = role === 'super_admin';

  const getAudienceFromTab = (val: number): TargetAudience | 'all' => {
    if (isTeacher) return 'students';
    switch (val) {
      case 0:
        return 'all';
      case 1:
        return 'students';
      case 2:
        return 'teachers';
      case 3:
        return 'admins';
      default:
        return 'all';
    }
  };

  const activeAudience = getAudienceFromTab(tabValue);
  const { data, isLoading, isFetching } = useNotifications(page, pageSize, activeAudience);

  const notifications = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const dbStats = data?.stats;

  const stats = {
    all: dbStats?.all ?? 0,
    students: dbStats?.students ?? 0,
    teachers: dbStats?.teachers ?? 0,
    admins: dbStats?.admins ?? 0,
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-title">{t('page_title')}</h1>
          <div className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-bold uppercase tracking-wider border border-border">
            {totalCount.toLocaleString()} {tCommon('total')}
          </div>
          {isFetching && !isLoading && (
            <div className="flex items-center gap-1.5 animate-pulse text-primary text-xs font-medium">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              {tCommon('updating')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {allowedAudiences.length > 0 && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setSendOpen(true)}
              sx={{
                borderRadius: 2.5,
                px: 3,
                py: 1,
                textTransform: 'none',
                fontWeight: 700,
                backgroundColor: 'primary.main',
                boxShadow: 'none',
                '&:hover': { backgroundColor: 'primary.dark' },
              }}
            >
              {t('btn_send_new')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards — super_admin and admin only */}
      {!isTeacher && (
        <Grid container spacing={3} mb={4}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              label={t('stat_total')}
              value={totalCount}
              icon={<NotificationsIcon />}
              color="#6366F1"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              label={t('stat_students')}
              value={stats.students || '0'}
              icon={<SchoolIcon />}
              color="#22C55E"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              label={t('stat_teachers')}
              value={stats.teachers || '0'}
              icon={<PersonIcon />}
              color="#A855F7"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              label={t('stat_admins')}
              value={stats.admins || '0'}
              icon={<SupervisorIcon />}
              color="#F59E0B"
            />
          </Grid>
        </Grid>
      )}

      {/* Filter Tabs & Table */}
      <MuiCard
        sx={{
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: 'none',
          overflow: 'hidden',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, bgcolor: 'background.default' }}>
          <Tabs
            value={tabValue}
            onChange={(_, v) => {
              setTabValue(v);
              setPage(1);
            }}
          >
            {!isTeacher && (
              <Tab label={t('tab_all')} sx={{ textTransform: 'none', fontWeight: 600 }} />
            )}
            <Tab
              label={t('tab_students')}
              icon={<SchoolIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              sx={{ textTransform: 'none', fontWeight: 600 }}
            />
            {!isTeacher && (
              <Tab
                label={t('tab_teachers')}
                icon={<PersonIcon sx={{ fontSize: 18 }} />}
                iconPosition="start"
                sx={{ textTransform: 'none', fontWeight: 600 }}
              />
            )}
            {isSuperAdmin && (
              <Tab
                label={t('tab_admins')}
                icon={<SupervisorIcon sx={{ fontSize: 18 }} />}
                iconPosition="start"
                sx={{ textTransform: 'none', fontWeight: 600 }}
              />
            )}
          </Tabs>
        </Box>

        <TableContainer>
          <Table sx={{ minWidth: 800 }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'background.default' }}>
                <TableCell
                  sx={{
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    py: 2,
                  }}
                >
                  {t('header_title')}
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    py: 2,
                  }}
                >
                  {t('header_body')}
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    py: 2,
                  }}
                >
                  {t('header_audience')}
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    py: 2,
                  }}
                >
                  {t('header_date')}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    py: 2,
                  }}
                >
                  {t('header_actions')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(isLoading || isFetching) && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <LinearProgress sx={{ height: 2 }} />
                  </TableCell>
                </TableRow>
              )}
              {notifications.length === 0 && !isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                    <Typography variant="body2" color="text.secondary">
                      {t('no_notifs')}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                notifications.map((row) => (
                  <TableRow key={row.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                        {row.title}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'text.secondary',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 300,
                        }}
                      >
                        {row.body}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <AudienceChip
                        audience={row.target_audience}
                        permission={row.target_permission}
                        usersCount={row.target_user_ids?.length ?? 0}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}
                      >
                        {new Date(row.created_at).toLocaleDateString(locale, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <PermissionGate permission="notifications.delete">
                        <Tooltip title={t('btn_delete')}>
                          <IconButton
                            size="small"
                            onClick={() => setDeleteId(row.id)}
                            sx={{
                              color: 'error.main',
                              bgcolor: 'error.main' + '1A',
                              borderRadius: 2,
                              '&:hover': { bgcolor: 'error.main' + '2A' },
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </PermissionGate>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </MuiCard>

      {/* Dialogs */}
      <SendNotificationDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        allowedAudiences={allowedAudiences}
        onSuccess={(msg) => showToast(msg, 'success')}
      />

      <DeleteNotificationDialog
        open={!!deleteId}
        notificationId={deleteId}
        onClose={() => setDeleteId(null)}
        onSuccess={(msg) => showToast(msg, 'success')}
      />
    </div>
  );
}
