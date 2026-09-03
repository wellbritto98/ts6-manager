import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, limitsApi } from '@/api/settings.api';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Upload, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

function apiErrorMessage(err: unknown): string | undefined {
  if (!err || typeof err !== 'object' || !('response' in err)) return undefined;
  const data = (err as { response?: { data?: { error?: string } } }).response?.data;
  return typeof data?.error === 'string' ? data.error : undefined;
}

export function YouTubeTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [pasteMode, setPasteMode] = useState(false);
  const [cookieText, setCookieText] = useState('');

  const { data: status, isLoading } = useQuery({
    queryKey: ['yt-cookie-status'],
    queryFn: settingsApi.getYtCookieStatus,
  });

  const uploadFile = useMutation({
    mutationFn: (file: File) => settingsApi.uploadYtCookieFile(file),
    onSuccess: () => {
      toast.success(t('settings.youtube.toastFileUploaded'));
      qc.invalidateQueries({ queryKey: ['yt-cookie-status'] });
    },
    onError: () => toast.error(t('settings.youtube.toastUploadFailed')),
  });

  const uploadText = useMutation({
    mutationFn: (text: string) => settingsApi.uploadYtCookieText(text),
    onSuccess: () => {
      toast.success(t('settings.youtube.toastCookiesSaved'));
      setCookieText('');
      setPasteMode(false);
      qc.invalidateQueries({ queryKey: ['yt-cookie-status'] });
    },
    onError: () => toast.error(t('settings.youtube.toastSaveFailed')),
  });

  const deleteCookies = useMutation({
    mutationFn: () => settingsApi.deleteYtCookies(),
    onSuccess: () => {
      toast.success(t('settings.youtube.toastCookiesRemoved'));
      qc.invalidateQueries({ queryKey: ['yt-cookie-status'] });
    },
    onError: () => toast.error(t('settings.youtube.toastRemoveFailed')),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile.mutate(file);
    e.target.value = '';
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('settings.youtube.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {t('settings.youtube.description')}
            {' '}<span className="font-medium">Get cookies.txt LOCALLY</span> {t('settings.youtube.descriptionBrowsers')}
          </p>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status?.active ? 'bg-green-500' : 'bg-zinc-500'}`} />
            <span className="text-sm">
              {isLoading ? t('settings.youtube.loading') : status?.active
                ? t('settings.youtube.cookiesActive', { size: formatSize(status.size) })
                : t('settings.youtube.noCookies')}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="file"
              accept=".txt,.cookies"
              className="hidden"
              id="cookie-file-input"
              onChange={handleFileSelect}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('cookie-file-input')?.click()}
              disabled={uploadFile.isPending}
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              {uploadFile.isPending ? t('settings.youtube.uploading') : t('settings.youtube.uploadFile')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPasteMode(!pasteMode)}>
              <FileText className="h-3.5 w-3.5 mr-1" />
              {t('settings.youtube.pasteCookies')}
            </Button>
            {status?.active && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => deleteCookies.mutate()}
                disabled={deleteCookies.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {t('settings.youtube.remove')}
              </Button>
            )}
          </div>
          {pasteMode && (
            <div className="space-y-2">
              <textarea
                className="w-full h-32 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="# Netscape HTTP Cookie File&#10;.youtube.com&#9;TRUE&#9;/&#9;TRUE&#9;0&#9;COOKIE_NAME&#9;COOKIE_VALUE"
                value={cookieText}
                onChange={(e) => setCookieText(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => uploadText.mutate(cookieText)}
                  disabled={!cookieText.trim() || uploadText.isPending}
                >
                  {uploadText.isPending ? t('settings.youtube.saving') : t('settings.youtube.save')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setPasteMode(false); setCookieText(''); }}>
                  {t('settings.youtube.cancel')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <CookieRefreshCard />
      <PlaylistImportLimitCard />
    </div>
  );
}

function CookieRefreshCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.accessToken);
  const [intervalHours, setIntervalHours] = useState(6);

  const { data: refresh } = useQuery({
    queryKey: ['yt-cookie-refresh'],
    queryFn: settingsApi.getCookieRefresh,
  });

  const save = useMutation({
    mutationFn: (enabled: boolean) => settingsApi.putCookieRefresh(enabled, intervalHours),
    onSuccess: (data: { enabled?: boolean }) => {
      qc.invalidateQueries({ queryKey: ['yt-cookie-refresh'] });
      qc.invalidateQueries({ queryKey: ['yt-cookie-status'] });
      toast.success(data.enabled ? t('settings.youtube.refresh.toastEnabled') : t('settings.youtube.refresh.toastDisabled'));
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err) || t('settings.youtube.refresh.toastFailed'));
      qc.invalidateQueries({ queryKey: ['yt-cookie-refresh'] });
    },
  });

  const force = useMutation({
    mutationFn: () => settingsApi.forceCookieRefresh(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['yt-cookie-refresh'] });
      qc.invalidateQueries({ queryKey: ['yt-cookie-status'] });
      toast.success(t('settings.youtube.refresh.toastRefreshed'));
    },
    onError: () => toast.error(t('settings.youtube.refresh.toastRefreshFailed')),
  });

  const enabled = !!refresh?.enabled;
  const vncSrc = token
    ? `/api/settings/yt-browser/vnc/vnc.html?autoconnect=1&resize=remote&path=${encodeURIComponent('/api/settings/yt-browser/vnc/websockify')}&token=${encodeURIComponent(token)}`
    : '';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('settings.youtube.refresh.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={(on) => save.mutate(on)}
            disabled={save.isPending}
          />
          <Label className="text-xs font-normal">{t('settings.youtube.refresh.enable')}</Label>
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400">{t('settings.youtube.refresh.warning')}</p>
        {enabled && (
          <>
            <div className="flex items-center gap-3">
              <Label className="text-xs w-48">{t('settings.youtube.refresh.interval')}</Label>
              <Input
                className="h-8 text-xs w-20"
                type="number"
                min={1}
                max={24}
                value={intervalHours}
                onChange={(e) => setIntervalHours(parseInt(e.target.value, 10) || 1)}
                onBlur={() => { if (enabled) save.mutate(true); }}
              />
            </div>
            {!refresh?.sidecarReachable && (
              <p className="text-xs text-destructive">{t('settings.youtube.refresh.sidecarMissing')}</p>
            )}
            {refresh?.needsLogin && (
              <p className="text-xs">{t('settings.youtube.refresh.needsLogin')}</p>
            )}
            <p className="text-[10px] text-muted-foreground">
              {t('settings.youtube.refresh.lastSuccess', {
                time: refresh?.lastSuccessAt ? refresh.lastSuccessAt : t('settings.youtube.refresh.never'),
              })}
            </p>
            {refresh?.lastError && (
              <p className="text-[10px] text-destructive">
                {t('settings.youtube.refresh.lastError', { error: refresh.lastError })}
              </p>
            )}
            <Button size="sm" onClick={() => force.mutate()} disabled={force.isPending}>
              {force.isPending ? t('settings.youtube.refresh.refreshing') : t('settings.youtube.refresh.refreshNow')}
            </Button>
            {refresh?.sidecarReachable && vncSrc && (
              <iframe
                title="YouTube login"
                src={vncSrc}
                className="w-full h-80 rounded-md border border-border bg-black"
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PlaylistImportLimitCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings-limits'], queryFn: limitsApi.get });
  const [max, setMax] = useState(50);
  const [seededData, setSeededData] = useState<typeof data>(undefined);
  if (data && data !== seededData) {
    setSeededData(data);
    setMax(data.maxPlaylistImport);
  }

  const save = useMutation({
    mutationFn: () => limitsApi.update(max),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-limits'] });
      toast.success(t('settings.youtube.playlistLimit.toastSaved'));
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err) || t('settings.youtube.playlistLimit.toastSaveFailed')),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('settings.youtube.playlistLimit.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('settings.youtube.playlistLimit.description')}</p>
        <div className="flex items-center gap-3">
          <Label className="text-xs w-40">{t('settings.youtube.playlistLimit.maxTracks')}</Label>
          <Input className="h-8 text-xs w-24" type="number" min={0} max={1000} value={max}
            onChange={(e) => setMax(parseInt(e.target.value) || 0)} />
        </div>
        <p className="text-[10px] text-muted-foreground">{t('settings.youtube.playlistLimit.hint')}</p>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? t('settings.youtube.playlistLimit.saving') : t('settings.youtube.playlistLimit.save')}
        </Button>
      </CardContent>
    </Card>
  );
}
