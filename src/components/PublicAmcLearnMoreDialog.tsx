import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Phone, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import {
  PUBLIC_AMC_ADVANTAGES,
  PUBLIC_AMC_PLANS,
  PUBLIC_AMC_SERVICE_PERIOD_MONTHS,
  PUBLIC_AMC_TAGLINE,
  PUBLIC_AMC_WHY_US,
  formatPublicAmcInr,
  getPublicAmcAgreementIntro,
  getPublicAmcCoveredBullets,
  getPublicAmcNotCoveredBullets,
  getPublicAmcTermsBullets,
} from '@/lib/public-amc-info';
import { openPublicPhoneCall } from '@/lib/publicPhone';

interface PublicAmcLearnMoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PublicAmcLearnMoreDialog: React.FC<PublicAmcLearnMoreDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const navigate = useNavigate();
  const covered = getPublicAmcCoveredBullets(false);
  const notCovered = getPublicAmcNotCoveredBullets(false);
  const terms = getPublicAmcTermsBullets(false);

  const handleBook = () => {
    onOpenChange(false);
    navigate('/booking');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[min(90vh,820px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-sky-600 dark:text-sky-400 shrink-0" />
              Annual Maintenance Contract (AMC)
            </span>
          </DialogTitle>
          <DialogDescription className="text-left text-sm sm:text-base leading-relaxed">
            {PUBLIC_AMC_TAGLINE}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 text-sm sm:text-[15px]">
          <p className="text-muted-foreground leading-relaxed">{getPublicAmcAgreementIntro()}</p>

          <div>
            <h3 className="font-semibold text-foreground mb-3">AMC plans & pricing</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PUBLIC_AMC_PLANS.map((plan) => (
                <div
                  key={plan.years}
                  className="rounded-xl border border-sky-100 dark:border-sky-500/20 bg-sky-50/50 dark:bg-sky-500/5 p-4 text-center"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {plan.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-sky-700 dark:text-sky-400">
                    {formatPublicAmcInr(plan.amountInr)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">all-inclusive AMC</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Routine service visits are planned about every {PUBLIC_AMC_SERVICE_PERIOD_MONTHS} months
              from your last completed service visit (same as our standard AMC agreements).
            </p>
          </div>

          <div className="rounded-xl border border-sky-100 dark:border-sky-500/20 bg-sky-50/40 dark:bg-sky-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <h3 className="font-semibold text-foreground">AMC advantages</h3>
            </div>
            <ul className="space-y-2">
              {PUBLIC_AMC_ADVANTAGES.map((line) => (
                <li key={line} className="flex gap-2.5 text-foreground/90">
                  <CheckCircle2 className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-foreground">What we take care of</h3>
              <Badge variant="secondary" className="text-xs">
                Included
              </Badge>
            </div>
            <ul className="space-y-2.5">
              {covered.map((line) => (
                <li key={line} className="flex gap-2.5 text-foreground/90">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-500/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-foreground">Not covered</h3>
              <Badge variant="outline" className="text-xs border-amber-300 text-amber-900 dark:text-amber-200">
                Exclusions
              </Badge>
            </div>
            <ul className="space-y-2">
              {notCovered.map((line) => (
                <li key={line} className="flex gap-2.5 text-foreground/90">
                  <XCircle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-3">Why choose Hydrogen RO?</h3>
            <ul className="space-y-2">
              {PUBLIC_AMC_WHY_US.map((line) => (
                <li key={line} className="flex gap-2.5 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-3">Important terms</h3>
            <ul className="space-y-2 text-muted-foreground list-disc pl-5">
              {terms.map((line) => (
                <li key={line} className="leading-relaxed">
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              className="bg-sky-700 hover:bg-sky-800 text-white"
              onClick={handleBook}
            >
              Book service / AMC
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => openPublicPhoneCall('+918884944288')}
            >
              <span className="inline-flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Call +91 8884944288
              </span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PublicAmcLearnMoreDialog;
