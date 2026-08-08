import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ShoppingBag, Search, Check, X, Plus, ListOrdered, Wallet } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { filterInventoryByApproxSearch } from '@/lib/inventorySearch';
import { getInventoryBillName } from '@/lib/inventoryBillName';
import {
  mapCommonQrRow,
  isDynamicUpiQr,
  isDynamicUpiTechnician,
  technicianHasPaymentQr,
  type CommonQrCode,
} from '@/lib/qrCodeManager';
import DynamicUpiQrDisplay from '@/components/DynamicUpiQrDisplay';
import DocumentBrandPickerDialog from '@/components/DocumentBrandPickerDialog';
import DocumentEmailSendDialog from '@/components/document/DocumentEmailSendDialog';
import {
  getCompanyInfoForBrand,
  brandHasGst,
  type DocumentBrand,
} from '@/lib/service-brands';
import type { Bill, BillItem } from '@/types';

interface DirectSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a sale is recorded so the caller can refresh data. */
  onSaleCreated?: () => void | Promise<void>;
}

interface InventoryItem {
  id: string;
  product_name: string;
  full_name?: string | null;
  code?: string | null;
  price: number;
  quantity: number;
}

type PaymentMode = 'CASH' | 'ONLINE' | 'PARTIAL';
type BillPriceMode = 'normal' | 'set';

type QrOption = {
  id: string;
  name: string;
  kind: 'common' | 'technician';
  url: string;
  upiId?: string;
  payeeName?: string;
  phone?: string;
  dynamicUpiEnabled?: boolean;
  commonQr?: CommonQrCode;
  tech?: {
    id: string;
    fullName: string;
    upiId?: string;
    phone?: string;
    qrCode?: string;
    dynamicUpiEnabled?: boolean;
  };
};

type PendingBillDraft = {
  customerName: string;
  customerPhone: string;
  billMode: BillPriceMode;
  amount: number;
  paymentMode: PaymentMode;
  lines: Array<{ description: string; quantity: number; unitPrice: number }>;
};

const todayInputValue = (): string => {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const formatCurrency = (amount: number): string => {
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
};

const digitsPhone = (raw: string): string => String(raw || '').replace(/\D/g, '').slice(-10);

const DirectSaleDialog: React.FC<DirectSaleDialogProps> = ({ open, onOpenChange, onSaleCreated }) => {
  const [amount, setAmount] = useState('');
  const [item, setItem] = useState('');
  const [saleDate, setSaleDate] = useState<string>(todayInputValue());
  const [isSaving, setIsSaving] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [billMode, setBillMode] = useState<BillPriceMode>('set');
  /** Per-line sell prices (inventory id / custom id → text). Used in Normal mode. */
  const [sellPrices, setSellPrices] = useState<Record<string, string>>({});

  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [partialCashAmount, setPartialCashAmount] = useState('');
  const [partialOnlineAmount, setPartialOnlineAmount] = useState('');
  const [selectedQrId, setSelectedQrId] = useState('');
  const [qrOptions, setQrOptions] = useState<QrOption[]>([]);
  const [loadingQr, setLoadingQr] = useState(false);

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, string>>({});
  const [inventorySearch, setInventorySearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [customItems, setCustomItems] = useState<
    Array<{ id: string; name: string; quantity: string; unitPrice: string }>
  >([]);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customQty, setCustomQty] = useState('1');
  const [customPrice, setCustomPrice] = useState('');

  const [askSendOpen, setAskSendOpen] = useState(false);
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [pendingBill, setPendingBill] = useState<PendingBillDraft | null>(null);
  const [emailBill, setEmailBill] = useState<Bill | null>(null);
  const [emailBrand, setEmailBrand] = useState<DocumentBrand | null>(null);
  const proceedToSendRef = React.useRef(false);
  const skipResetOnCloseRef = React.useRef(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingInventory(true);
    db.inventory
      .getAll()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error('Could not load inventory items.');
          setInventory([]);
        } else {
          setInventory((data as InventoryItem[]) || []);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingInventory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingQr(true);
    Promise.all([db.commonQrCodes.getAll(), db.technicians.getAll(100)])
      .then(([qrRes, techRes]) => {
        if (cancelled) return;
        const options: QrOption[] = [];
        (qrRes?.data || []).forEach((row: any) => {
          const mapped = mapCommonQrRow(row);
          if (!mapped) return;
          const dynamic = isDynamicUpiQr(mapped);
          if (!mapped.qrCodeUrl && !dynamic) return;
          options.push({
            id: `common_${mapped.id}`,
            name: mapped.name || 'Common QR',
            kind: 'common',
            url: mapped.qrCodeUrl || '',
            upiId: mapped.upiId,
            payeeName: mapped.payeeName || mapped.name,
            phone: mapped.phone,
            dynamicUpiEnabled: mapped.dynamicUpiEnabled,
            commonQr: mapped,
          });
        });
        (techRes?.data || []).forEach((t: any) => {
          const tech = {
            id: String(t.id),
            fullName: String(t.full_name || t.fullName || 'Technician'),
            upiId: String(t.upi_id || t.upiId || '').trim() || undefined,
            phone: String(t.upi_phone || t.upiPhone || t.phone || '')
              .replace(/\D/g, '')
              .slice(-10) || undefined,
            qrCode: String(t.qr_code || t.qrCode || '').trim() || undefined,
            dynamicUpiEnabled: Boolean(t.dynamic_upi_enabled ?? t.dynamicUpiEnabled),
          };
          if (!technicianHasPaymentQr(tech as any)) return;
          options.push({
            id: `technician_${tech.id}`,
            name: `${tech.fullName}'s QR Code`,
            kind: 'technician',
            url: tech.qrCode || '',
            upiId: tech.upiId,
            payeeName: tech.fullName,
            phone: tech.phone,
            dynamicUpiEnabled: tech.dynamicUpiEnabled,
            tech,
          });
        });
        setQrOptions(options);
      })
      .catch(() => {
        if (!cancelled) setQrOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingQr(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(inventorySearch), 250);
    return () => clearTimeout(t);
  }, [inventorySearch]);

  const resetCustomForm = () => {
    setShowCustom(false);
    setCustomName('');
    setCustomQty('1');
    setCustomPrice('');
  };

  const resetForm = () => {
    setAmount('');
    setItem('');
    setSaleDate(todayInputValue());
    setCustomerName('');
    setCustomerPhone('');
    setBillMode('set');
    setSellPrices({});
    setPaymentMode('CASH');
    setPartialCashAmount('');
    setPartialOnlineAmount('');
    setSelectedQrId('');
    setSelectedQuantities({});
    setInventorySearch('');
    setDebouncedSearch('');
    setCustomItems([]);
    resetCustomForm();
    setPendingBill(null);
    setEmailBill(null);
    setEmailBrand(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (isSaving) return;
    if (!next) {
      if (skipResetOnCloseRef.current) {
        skipResetOnCloseRef.current = false;
        // Clear sale fields only — keep pendingBill for the send-PDF ask
        setAmount('');
        setItem('');
        setSaleDate(todayInputValue());
        setCustomerName('');
        setCustomerPhone('');
        setBillMode('set');
        setSellPrices({});
        setPaymentMode('CASH');
        setPartialCashAmount('');
        setPartialOnlineAmount('');
        setSelectedQrId('');
        setSelectedQuantities({});
        setInventorySearch('');
        setDebouncedSearch('');
        setCustomItems([]);
        resetCustomForm();
      } else if (!askSendOpen && !brandPickerOpen && !emailDialogOpen) {
        resetForm();
      }
    }
    onOpenChange(next);
  };

  const addItem = (inv: InventoryItem) => {
    setSelectedQuantities((prev) => (prev[inv.id] ? prev : { ...prev, [inv.id]: '1' }));
    setSellPrices((prev) =>
      prev[inv.id] != null ? prev : { ...prev, [inv.id]: inv.price > 0 ? String(inv.price) : '' }
    );
  };

  const removeItem = (id: string) => {
    setSelectedQuantities((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSellPrices((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const setItemQuantity = (id: string, value: string) => {
    setSelectedQuantities((prev) => ({ ...prev, [id]: value }));
  };

  const addCustomItem = () => {
    const name = customName.trim();
    const qty = Math.max(1, Math.floor(Number(customQty) || 0));
    const price = Math.max(0, Number(customPrice) || 0);
    if (!name) {
      toast.error('Enter an item name.');
      return;
    }
    const id = `custom:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setCustomItems((prev) => [
      ...prev,
      {
        id,
        name,
        quantity: String(qty),
        unitPrice: String(price),
      },
    ]);
    setSellPrices((prev) => ({ ...prev, [id]: price > 0 ? String(price) : '' }));
    resetCustomForm();
    setInventorySearch('');
  };

  const removeCustomItem = (id: string) => {
    setCustomItems((prev) => prev.filter((c) => c.id !== id));
    setSellPrices((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const setCustomItemQuantity = (id: string, value: string) => {
    setCustomItems((prev) => prev.map((c) => (c.id === id ? { ...c, quantity: value } : c)));
  };

  const selectedItems = useMemo(() => {
    return Object.keys(selectedQuantities)
      .map((id) => {
        const inv = inventory.find((i) => i.id === id);
        if (!inv) return null;
        const qty = Math.max(0, Math.floor(Number(selectedQuantities[id]) || 0));
        const billName = getInventoryBillName(inv);
        const sell = Math.max(0, Number(sellPrices[id]) || 0);
        return { ...inv, qty, billName, sell };
      })
      .filter((x): x is InventoryItem & { qty: number; billName: string; sell: number } => x !== null);
  }, [selectedQuantities, inventory, sellPrices]);

  const resolvedCustomItems = useMemo(
    () =>
      customItems.map((c) => ({
        id: c.id,
        product_name: c.name,
        billName: c.name.trim(),
        code: null as string | null,
        price: Math.max(0, Number(c.unitPrice) || 0),
        sell: Math.max(0, Number(sellPrices[c.id] ?? c.unitPrice) || 0),
        qty: Math.max(0, Math.floor(Number(c.quantity) || 0)),
      })),
    [customItems, sellPrices]
  );

  const filteredInventory = useMemo(() => {
    if (!debouncedSearch.trim()) {
      return [...inventory].sort((a, b) =>
        getInventoryBillName(a).localeCompare(getInventoryBillName(b))
      );
    }
    return filterInventoryByApproxSearch(inventory, debouncedSearch);
  }, [inventory, debouncedSearch]);

  const hasItems = selectedItems.length > 0 || resolvedCustomItems.length > 0;

  const normalLinesTotal =
    selectedItems.reduce((s, it) => s + it.sell * it.qty, 0) +
    resolvedCustomItems.reduce((s, it) => s + it.sell * it.qty, 0);

  // Keep sale amount in sync with per-item prices in Normal mode
  useEffect(() => {
    if (billMode !== 'normal') return;
    if (!hasItems) return;
    const next = normalLinesTotal > 0 ? String(Math.round(normalLinesTotal * 100) / 100) : '';
    setAmount(next);
  }, [billMode, hasItems, normalLinesTotal]);

  const amountNum = parseFloat(amount);
  const selectedQr = qrOptions.find((q) => q.id === selectedQrId) || null;
  const needsQr = paymentMode === 'ONLINE' || paymentMode === 'PARTIAL';
  const onlineAmountForQr =
    paymentMode === 'PARTIAL' ? parseFloat(partialOnlineAmount) || 0 : amountNum || 0;

  const buildBillDocument = (brand: DocumentBrand, draft: PendingBillDraft): Bill => {
    const brandCompany = getCompanyInfoForBrand(brand);
    const billItems: BillItem[] =
      draft.billMode === 'set'
        ? draft.lines.map((line, idx) => ({
            id: `line-${idx}`,
            description: line.description,
            quantity: line.quantity,
            unitPrice: 0,
            total: 0,
            taxRate: 0,
            taxAmount: 0,
          }))
        : draft.lines.map((line, idx) => ({
            id: `line-${idx}`,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            total: line.quantity * line.unitPrice,
            taxRate: 0,
            taxAmount: 0,
          }));

    const subtotal =
      draft.billMode === 'set'
        ? draft.amount
        : billItems.reduce((s, it) => s + it.total, 0);

    const stamp = Date.now().toString().slice(-6);
    return {
      id: `office-${stamp}`,
      billNumber: `BILL-OFFICE-${stamp}`,
      billDate: todayInputValue(),
      company: brandCompany,
      customer: {
        id: '',
        name: draft.customerName,
        address: '',
        city: '',
        state: '',
        pincode: '',
        phone: draft.customerPhone,
        email: '',
      },
      items: billItems,
      subtotal,
      totalTax: 0,
      serviceCharge: 0,
      totalAmount: subtotal,
      paymentStatus: 'PAID',
      amountPaid: draft.amount,
      paymentMethod:
        draft.paymentMode === 'ONLINE' ? 'UPI' : draft.paymentMode === 'PARTIAL' ? 'PARTIAL' : 'CASH',
      notes: '',
      terms: '',
      hideGstInHeader: !brandHasGst(brand),
      documentBrand: brand,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Bill;
  };

  const handleSubmit = async () => {
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      toast.error(
        billMode === 'normal'
          ? 'Enter sell prices for items (or switch to Set bill).'
          : 'Enter a valid sale amount.'
      );
      return;
    }
    if (!saleDate) {
      toast.error('Select the sale date.');
      return;
    }
    for (const it of selectedItems) {
      if (it.qty < 1) {
        toast.error(`Enter a valid quantity for ${it.billName}.`);
        return;
      }
      if (it.qty > it.quantity) {
        toast.error(`Only ${it.quantity} in stock for ${it.billName}.`);
        return;
      }
      if (billMode === 'normal' && it.sell <= 0) {
        toast.error(`Enter a sell price for ${it.billName}.`);
        return;
      }
    }
    for (const it of resolvedCustomItems) {
      if (it.qty < 1) {
        toast.error(`Enter a valid quantity for ${it.billName}.`);
        return;
      }
      if (billMode === 'normal' && it.sell <= 0) {
        toast.error(`Enter a sell price for ${it.billName}.`);
        return;
      }
    }

    const partialCash = parseFloat(partialCashAmount) || 0;
    const partialOnline = parseFloat(partialOnlineAmount) || 0;
    if (paymentMode === 'PARTIAL') {
      if (partialCash + partialOnline <= 0) {
        toast.error('Enter the cash and online split.');
        return;
      }
      if (partialOnline > 0 && !selectedQr) {
        toast.error('Select a QR code for the online portion.');
        return;
      }
    }
    if (paymentMode === 'ONLINE' && !selectedQr) {
      toast.error('Select a QR code for the online payment.');
      return;
    }

    const [y, m, d] = saleDate.split('-').map(Number);
    const parsedDate = new Date(y, (m || 1) - 1, d || 1);

    const resolvedItem = hasItems
      ? [
          ...selectedItems.map((it) => `${it.billName} × ${it.qty}`),
          ...resolvedCustomItems.map((it) => `${it.billName} × ${it.qty}`),
        ].join(', ')
      : item.trim();

    const qrPhotos =
      needsQr && selectedQr
        ? {
            qr_code_type: selectedQr.kind,
            selected_qr_code_id: selectedQr.id,
            selected_qr_code_url: selectedQr.url || '',
            selected_qr_code_name: selectedQr.name,
            ...(selectedQr.dynamicUpiEnabled && selectedQr.upiId
              ? { dynamic_upi: true, upi_id: selectedQr.upiId }
              : {}),
          }
        : null;

    setIsSaving(true);
    try {
      const { data, error } = await db.jobs.createDirectSale({
        amount: amountNum,
        item: resolvedItem,
        saleDate: parsedDate,
        items: [
          ...selectedItems.map((it) => ({
            inventoryId: it.id,
            quantity: it.qty,
            unitPrice: it.price,
            productName: it.billName,
            code: it.code ?? null,
          })),
          ...resolvedCustomItems.map((it) => ({
            inventoryId: it.id,
            quantity: it.qty,
            unitPrice: it.price,
            productName: it.billName,
            code: null,
            custom: true,
          })),
        ],
        paymentMode,
        partialCashAmount: partialCash,
        partialOnlineAmount: partialOnline,
        qrPhotos,
      });
      if (error || !data) {
        throw new Error(error?.message || 'Failed to record sale');
      }
      toast.success('Direct sale recorded.');

      const lines =
        hasItems
          ? [
              ...selectedItems.map((it) => ({
                description: it.billName,
                quantity: it.qty,
                unitPrice: billMode === 'normal' ? it.sell : 0,
              })),
              ...resolvedCustomItems.map((it) => ({
                description: it.billName,
                quantity: it.qty,
                unitPrice: billMode === 'normal' ? it.sell : 0,
              })),
            ]
          : [
              {
                description: resolvedItem || 'Office sale',
                quantity: 1,
                unitPrice: billMode === 'normal' ? amountNum : 0,
              },
            ];

      const draft: PendingBillDraft = {
        customerName: customerName.trim() || 'Walk-in customer',
        customerPhone: digitsPhone(customerPhone),
        billMode,
        amount: amountNum,
        paymentMode,
        lines,
      };

      await onSaleCreated?.();
      skipResetOnCloseRef.current = true;
      setPendingBill(draft);
      onOpenChange(false);
      setAskSendOpen(true);
    } catch (e: any) {
      toast.error('Could not record sale: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const onConfirmSendPdf = () => {
    if (!pendingBill) return;
    proceedToSendRef.current = true;
    setAskSendOpen(false);
    setBrandPickerOpen(true);
  };

  const onSkipSendPdf = () => {
    proceedToSendRef.current = false;
    setAskSendOpen(false);
    setPendingBill(null);
  };

  const onBrandSelected = (brand: DocumentBrand) => {
    if (!pendingBill) return;
    const bill = buildBillDocument(brand, pendingBill);
    setEmailBill(bill);
    setEmailBrand(brand);
    setEmailDialogOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6 [&>*]:min-w-0">
          <DialogHeader>
            <div className="px-1 sm:px-2">
              <DialogTitle className="flex items-center justify-center gap-2 text-base sm:text-lg">
                <ShoppingBag className="w-5 h-5 shrink-0" />
                Record Direct Sale
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-center mt-1">
                Office/counter sale — optionally send a bill PDF after saving.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="direct-sale-customer-name">Customer name</Label>
                <Input
                  id="direct-sale-customer-name"
                  type="text"
                  placeholder="Name for the bill"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="direct-sale-customer-phone">Phone</Label>
                <Input
                  id="direct-sale-customer-phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="10-digit mobile"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Bill pricing</Label>
              <div
                role="group"
                aria-label="Bill pricing"
                className="grid grid-cols-2 gap-1 rounded-xl border border-border/80 bg-muted/50 p-1 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setBillMode('normal')}
                  aria-pressed={billMode === 'normal'}
                  className={
                    billMode === 'normal'
                      ? 'flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors sm:gap-2'
                      : 'flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground sm:gap-2'
                  }
                >
                  <ListOrdered className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                  <span className="truncate">Per item</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBillMode('set')}
                  aria-pressed={billMode === 'set'}
                  className={
                    billMode === 'set'
                      ? 'flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors sm:gap-2'
                      : 'flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground sm:gap-2'
                  }
                >
                  <Wallet className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                  <span className="truncate">One total</span>
                </button>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">
                {billMode === 'set'
                  ? 'Add items by name + qty, then enter one package price below.'
                  : 'Enter a sell price for each item — sale amount is the sum.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="direct-sale-amount">
                {billMode === 'set' ? 'Sale amount (₹) *' : 'Sale amount (₹) — from items'}
              </Label>
              <Input
                id="direct-sale-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder={billMode === 'set' ? 'What the customer paid, e.g. 1500' : 'Auto from item prices'}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                readOnly={billMode === 'normal' && hasItems}
                className={billMode === 'normal' && hasItems ? 'bg-muted/50' : undefined}
              />
            </div>

            <div className="space-y-1.5">
              <Label>From inventory</Label>

              {hasItems && (
                <div className="space-y-2">
                  {selectedItems.map((it) => {
                    const overStock = it.qty > it.quantity;
                    return (
                      <div
                        key={it.id}
                        className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/20 p-2.5"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                          <div className="flex min-w-0 flex-1 items-start gap-2 overflow-hidden">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <span className="block truncate text-sm font-medium">
                                {it.billName}
                                {it.code ? ` (${it.code})` : ''}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {it.quantity} in stock
                                {it.full_name && it.full_name !== it.product_name
                                  ? ` · stock name: ${it.product_name}`
                                  : ''}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-1.5 pl-6 sm:pl-0 shrink-0">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-[10px] text-muted-foreground sm:sr-only">Qty</span>
                              <Input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                max={it.quantity}
                                step="1"
                                value={selectedQuantities[it.id] ?? ''}
                                onChange={(e) => setItemQuantity(it.id, e.target.value)}
                                className={`h-9 w-16 text-sm ${overStock ? 'border-red-400' : ''}`}
                                title="Quantity"
                              />
                            </div>
                            {billMode === 'normal' && (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[10px] text-muted-foreground sm:sr-only">₹</span>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                  placeholder="₹"
                                  value={sellPrices[it.id] ?? ''}
                                  onChange={(e) =>
                                    setSellPrices((prev) => ({ ...prev, [it.id]: e.target.value }))
                                  }
                                  className="h-9 w-[4.5rem] text-sm"
                                  title="Sell price"
                                />
                              </div>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-9 w-9 shrink-0 px-0"
                              onClick={() => removeItem(it.id)}
                              title="Remove item"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        {overStock && (
                          <p className="mt-1 pl-6 text-xs text-red-600">
                            Only {it.quantity} in stock.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {resolvedCustomItems.length > 0 && (
                <div className="space-y-2">
                  {resolvedCustomItems.map((it) => (
                    <div
                      key={it.id}
                      className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-900/20 p-2.5"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                        <div className="flex min-w-0 flex-1 items-start gap-2 overflow-hidden">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <span className="block truncate text-sm font-medium">
                              {it.billName}
                              <span className="ml-2 align-middle rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Custom
                              </span>
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1.5 pl-6 sm:pl-0 shrink-0">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] text-muted-foreground sm:sr-only">Qty</span>
                            <Input
                              type="number"
                              inputMode="numeric"
                              min="1"
                              step="1"
                              value={customItems.find((c) => c.id === it.id)?.quantity ?? ''}
                              onChange={(e) => setCustomItemQuantity(it.id, e.target.value)}
                              className="h-9 w-16 text-sm"
                            />
                          </div>
                          {billMode === 'normal' && (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-[10px] text-muted-foreground sm:sr-only">₹</span>
                              <Input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                placeholder="₹"
                                value={sellPrices[it.id] ?? ''}
                                onChange={(e) =>
                                  setSellPrices((prev) => ({ ...prev, [it.id]: e.target.value }))
                                }
                                className="h-9 w-[4.5rem] text-sm"
                              />
                            </div>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 shrink-0 px-0"
                            onClick={() => removeCustomItem(it.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search items by name or code..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className="pl-9 h-10 text-sm"
                />
              </div>
              <div className="rounded-lg border overflow-hidden">
                {loadingInventory ? (
                  <div className="py-6 px-4 text-center text-sm text-muted-foreground">
                    Loading items...
                  </div>
                ) : filteredInventory.length === 0 && !inventorySearch.trim() ? (
                  <div className="py-6 px-4 text-center text-sm text-muted-foreground">
                    {inventory.length === 0 ? 'No inventory items.' : 'No items.'}
                  </div>
                ) : (
                  <div className="max-h-[min(40vh,240px)] overflow-y-auto [scrollbar-width:thin]">
                    {filteredInventory.map((inv) => {
                      const outOfStock = inv.quantity <= 0;
                      const alreadyAdded = !!selectedQuantities[inv.id];
                      const label = getInventoryBillName(inv);
                      return (
                        <button
                          key={inv.id}
                          type="button"
                          disabled={outOfStock || alreadyAdded}
                          onClick={() => addItem(inv)}
                          className="flex w-full items-center gap-2 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <span className="block truncate text-sm font-medium">
                              {label}
                              {inv.code ? ` (${inv.code})` : ''}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {outOfStock ? 'Out of stock' : `${inv.quantity} in stock`}
                            </span>
                          </div>
                          {alreadyAdded ? (
                            <Check className="w-4 h-4 shrink-0 text-green-600" />
                          ) : (
                            <Plus className="w-4 h-4 shrink-0 text-muted-foreground" />
                          )}
                        </button>
                      );
                    })}

                    {inventorySearch.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustom(true);
                          setCustomName(inventorySearch.trim());
                          setCustomQty('1');
                          setCustomPrice('');
                        }}
                        className="flex w-full items-center gap-2 border-b bg-muted/30 px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/60"
                      >
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <span className="block truncate text-sm font-medium">
                            {inventorySearch.trim()}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            Custom item (not in inventory)
                          </span>
                        </div>
                        <Plus className="w-4 h-4 shrink-0 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {showCustom && (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Custom item (not in inventory)
                  </p>
                  <Input
                    placeholder="Item name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="h-9 text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={customQty}
                        onChange={(e) => setCustomQty(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        {billMode === 'normal' ? 'Sell price (₹)' : 'Cost (₹, optional)'}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={customPrice}
                        onChange={(e) => setCustomPrice(e.target.value)}
                        placeholder="0"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="button" variant="outline" className="flex-1" onClick={resetCustomForm}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={addCustomItem}
                      disabled={!customName.trim()}
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      Add item
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Bill uses the inventory full name when set. Skip items for a free-text sale.
              </p>
            </div>

            {!hasItems && (
              <div className="space-y-1.5">
                <Label htmlFor="direct-sale-item">Item / description</Label>
                <Input
                  id="direct-sale-item"
                  type="text"
                  placeholder="e.g. RO membrane, filter set"
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="direct-sale-date">Sale date *</Label>
              <Input
                id="direct-sale-date"
                type="date"
                value={saleDate}
                max={todayInputValue()}
                onChange={(e) => setSaleDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="direct-sale-payment-mode">Payment mode *</Label>
              <Select
                value={paymentMode}
                onValueChange={(value: PaymentMode) => {
                  setPaymentMode(value);
                  if (value === 'CASH') {
                    setSelectedQrId('');
                    setPartialCashAmount('');
                    setPartialOnlineAmount('');
                  } else if (value === 'ONLINE') {
                    setPartialCashAmount('');
                    setPartialOnlineAmount('');
                  } else if (value === 'PARTIAL') {
                    const bill = parseFloat(amount) || 0;
                    setPartialCashAmount('0');
                    setPartialOnlineAmount(bill > 0 ? String(bill) : '');
                  }
                }}
              >
                <SelectTrigger id="direct-sale-payment-mode" className="mt-1">
                  <SelectValue placeholder="Select payment mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                  <SelectItem value="PARTIAL">Partial (Cash + Online)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMode === 'PARTIAL' && (
              <div className="space-y-3 pl-3 border-l-2 border-border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="direct-sale-partial-cash">Cash amount (₹)</Label>
                    <Input
                      id="direct-sale-partial-cash"
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={partialCashAmount}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPartialCashAmount(v);
                        const bill = parseFloat(amount) || 0;
                        if (v !== '' && !/^\s*$/.test(v)) {
                          const cash = parseFloat(v.replace(/,/g, '')) || 0;
                          if (!Number.isNaN(cash) && bill >= 0) {
                            const online = Math.max(0, Math.round((bill - cash) * 100) / 100);
                            setPartialOnlineAmount(
                              online === Math.floor(online)
                                ? String(Math.floor(online))
                                : online.toFixed(2)
                            );
                          }
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="direct-sale-partial-online">Online amount (₹)</Label>
                    <Input
                      id="direct-sale-partial-online"
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={partialOnlineAmount}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPartialOnlineAmount(v);
                        const bill = parseFloat(amount) || 0;
                        if (v !== '' && !/^\s*$/.test(v)) {
                          const online = parseFloat(v.replace(/,/g, '')) || 0;
                          if (!Number.isNaN(online) && bill >= 0) {
                            const cash = Math.max(0, Math.round((bill - online) * 100) / 100);
                            setPartialCashAmount(
                              cash === Math.floor(cash) ? String(Math.floor(cash)) : cash.toFixed(2)
                            );
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {needsQr && (
              <div className="space-y-3 pl-3 border-l-2 border-border">
                <div className="space-y-1.5">
                  <Label htmlFor="direct-sale-qr">
                    Select QR code {paymentMode === 'ONLINE' ? '*' : '(for online part)'}
                  </Label>
                  <Select value={selectedQrId} onValueChange={setSelectedQrId}>
                    <SelectTrigger id="direct-sale-qr" className="mt-1">
                      <SelectValue
                        placeholder={loadingQr ? 'Loading QR codes...' : 'Select QR code'}
                      />
                    </SelectTrigger>
                    <SelectContent className="!z-[100]">
                      {qrOptions.length === 0 ? (
                        <SelectItem value="no-qr" disabled>
                          {loadingQr ? 'Loading...' : 'No QR codes available'}
                        </SelectItem>
                      ) : (
                        qrOptions.map((qr) => (
                          <SelectItem key={qr.id} value={qr.id}>
                            {qr.name}
                            {qr.dynamicUpiEnabled ? ' · Dynamic UPI' : ''}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {selectedQr && (
                  <div className="rounded-lg border bg-primary/5 p-3 flex justify-center">
                    {selectedQr.kind === 'common' &&
                    selectedQr.commonQr &&
                    isDynamicUpiQr(selectedQr.commonQr) ? (
                      <DynamicUpiQrDisplay
                        upiId={selectedQr.upiId || ''}
                        payeeName={selectedQr.payeeName || selectedQr.name}
                        amount={onlineAmountForQr > 0 ? onlineAmountForQr : undefined}
                        note={customerName.trim() || selectedQr.name}
                        phone={selectedQr.phone}
                        label={selectedQr.name}
                        fallbackImageUrl={selectedQr.url}
                        size={200}
                      />
                    ) : selectedQr.kind === 'technician' &&
                      selectedQr.tech &&
                      isDynamicUpiTechnician(selectedQr.tech as any) ? (
                      <DynamicUpiQrDisplay
                        upiId={selectedQr.upiId || ''}
                        payeeName={selectedQr.payeeName || selectedQr.name}
                        amount={onlineAmountForQr > 0 ? onlineAmountForQr : undefined}
                        note={customerName.trim() || selectedQr.name}
                        phone={selectedQr.phone}
                        label={selectedQr.name}
                        fallbackImageUrl={selectedQr.url}
                        size={200}
                      />
                    ) : selectedQr.url ? (
                      <div className="text-center">
                        <p className="text-xs font-medium mb-2">{selectedQr.name}</p>
                        <img
                          src={selectedQr.url}
                          alt={selectedQr.name}
                          className="w-48 h-48 object-contain mx-auto border rounded-lg bg-card p-2"
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-red-500 text-center py-4">
                        No QR image — enable Dynamic UPI or upload an image in Settings
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => handleOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Record sale'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={askSendOpen}
        onOpenChange={(next) => {
          if (next) return;
          if (proceedToSendRef.current) {
            proceedToSendRef.current = false;
            return;
          }
          setPendingBill(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send bill PDF?</AlertDialogTitle>
            <AlertDialogDescription>
              Sale is saved. Send the bill PDF to the customer by email or WhatsApp?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onSkipSendPdf}>Not now</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmSendPdf}>Yes, send PDF</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DocumentBrandPickerDialog
        open={brandPickerOpen}
        onOpenChange={setBrandPickerOpen}
        title="Bill brand"
        description="Choose Hydrogen RO or Eleven RO for this bill PDF."
        onSelect={onBrandSelected}
      />

      <DocumentEmailSendDialog
        open={emailDialogOpen}
        onOpenChange={(next) => {
          setEmailDialogOpen(next);
          if (!next) {
            setEmailBill(null);
            setEmailBrand(null);
            setPendingBill(null);
          }
        }}
        kind="service_bill"
        bill={emailBill}
        brand={emailBrand}
        defaultRecipients={[]}
        dueDateIso={emailBill?.billDate}
        allowWhatsApp
      />
    </>
  );
};

export default DirectSaleDialog;
