import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

type PhoneSwapButtonProps = {
  onSwap: () => void;
  disabled?: boolean;
  saving?: boolean;
  className?: string;
  tabIndex?: number;
};

/** Small icon button — swap primary ↔ alternate when both numbers are set. */
const PhoneSwapButton: React.FC<PhoneSwapButtonProps> = ({
  onSwap,
  disabled,
  saving,
  className,
  tabIndex = -1,
}) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className={`h-7 w-7 shrink-0 text-muted-foreground hover:bg-transparent hover:text-muted-foreground ${className ?? ''}`}
    onClick={onSwap}
    disabled={disabled || saving}
    tabIndex={tabIndex}
    title={saving ? 'Saving…' : 'Swap primary and alternate'}
    aria-label={saving ? 'Saving…' : 'Swap primary and alternate numbers'}
  >
    <ArrowUpDown className="h-3.5 w-3.5" />
  </Button>
);

export default PhoneSwapButton;
