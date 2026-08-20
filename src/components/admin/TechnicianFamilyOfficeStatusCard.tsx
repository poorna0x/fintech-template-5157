import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { mintTechnicianOfficeStatus } from '@/lib/techOfficeStatus';

function toAbsoluteUrl(pathOrUrl: string) {
  if (pathOrUrl.startsWith('http')) return pathOrUrl;
  return `${window.location.origin}${pathOrUrl}`;
}

type Props = {
  technicianId: string;
};

export default function TechnicianFamilyOfficeStatusCard({ technicianId }: Props) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [hasLink, setHasLink] = useState(false);
  const [technicianActive, setTechnicianActive] = useState(true);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await mintTechnicianOfficeStatus('get', technicianId);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setHasLink(result.hasLink);
    setEnabled(result.enabled);
    setTechnicianActive(result.technicianActive !== false);
    if (!result.enabled) setUrl('');
  }, [technicianId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const copyUrl = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy');
    }
  };

  const onToggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    const result = await mintTechnicianOfficeStatus(next ? 'enable' : 'disable', technicianId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setHasLink(result.hasLink);
    setEnabled(result.enabled);
    if (result.url) {
      const absolute = toAbsoluteUrl(result.url);
      setUrl(absolute);
      void copyUrl(absolute);
    }
    if (!result.enabled) setUrl('');
  };

  const onRotate = async () => {
    if (busy) return;
    setBusy(true);
    const result = await mintTechnicianOfficeStatus('rotate', technicianId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setHasLink(true);
    setEnabled(true);
    if (result.url) {
      const absolute = toAbsoluteUrl(result.url);
      setUrl(absolute);
      void copyUrl(absolute);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="familyOfficeStatus" className="text-sm font-medium">
            Family office status
          </Label>
          <p className="text-xs text-muted-foreground leading-snug">
            No-login home-screen page: in office (within 100 m) or minutes to office. Off is a
            server kill switch — the old bookmark cannot bypass it.
          </p>
        </div>
        <Switch
          id="familyOfficeStatus"
          checked={enabled}
          disabled={loading || busy || !technicianActive}
          onCheckedChange={(checked) => void onToggle(checked)}
        />
      </div>
      {!technicianActive ? (
        <p className="text-[11px] text-muted-foreground">Turn the account Active first.</p>
      ) : null}
      {enabled ? (
        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:h-9 cursor-pointer touch-manipulation"
            disabled={busy || !url}
            onClick={() => url && void copyUrl(url)}
          >
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {url ? 'Copy link' : hasLink ? 'Link is on' : 'Copy link'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:h-9 cursor-pointer touch-manipulation"
            disabled={busy}
            onClick={() => void onRotate()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Rotate link
          </Button>
        </div>
      ) : null}
      {enabled && hasLink && !url ? (
        <p className="text-[11px] text-muted-foreground leading-snug">
          The secret URL is only shown when you first turn this on or rotate. Rotate if you lost
          it or it leaked — the old home-screen icon will stop working.
        </p>
      ) : null}
    </div>
  );
}
