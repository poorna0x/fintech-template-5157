import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';

interface PinDialogProps {
  open: boolean;
  onSuccess: () => void;
  onCancel?: () => void;
}

const PIN_CODE = '0000';

const PinDialog: React.FC<PinDialogProps> = ({ open, onSuccess, onCancel }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
    if (value.length <= 4) {
      setPin(value);
      setError(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === PIN_CODE) {
      // Store PIN verification in sessionStorage
      sessionStorage.setItem('adminPinVerified', 'true');
      setPin('');
      setError(false);
      onSuccess();
    } else {
      setError(true);
      toast.error('Incorrect PIN code');
      setPin('');
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const handleCancel = () => {
    setPin('');
    setError(false);
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <Lock className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">Enter PIN Code</DialogTitle>
          <DialogDescription className="text-center">
            Please enter the PIN code to access this section
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={handlePinChange}
              placeholder="Enter 4-digit PIN"
              className={`text-center text-2xl tracking-widest h-14 ${error ? 'border-red-500 focus:border-red-500' : ''}`}
              maxLength={4}
              autoFocus
            />
            {error && (
              <p className="text-sm text-red-500 text-center">Incorrect PIN. Please try again.</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pin.length !== 4}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              Verify
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PinDialog;

