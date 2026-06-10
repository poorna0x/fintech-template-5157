import React, { useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldCheck, Search, Phone, Package, CheckCircle2, XCircle, AlertCircle, BadgeCheck } from 'lucide-react';
import { lookupWarrantiesByPhone } from '@/lib/warrantyLookup';
import {
  categoryDef,
  warrantyStatus,
  formatWarrantyDate,
  type PublicWarranty,
  type PublicWarrantyCustomer,
  type PublicAmcInfo,
} from '@/lib/warranty';

type ViewState = 'idle' | 'loading' | 'results' | 'notfound' | 'error';

const Warranty: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<ViewState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [customer, setCustomer] = useState<PublicWarrantyCustomer | null>(null);
  const [warranties, setWarranties] = useState<PublicWarranty[]>([]);
  const [amc, setAmc] = useState<PublicAmcInfo | null>(null);

  const phoneDigits = phone.replace(/\D/g, '').slice(-10);
  const canSearch = phoneDigits.length === 10 && /^[6-9]/.test(phoneDigits) && state !== 'loading';

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSearch) return;
    setState('loading');
    setErrorMsg('');
    setCustomer(null);
    setWarranties([]);
    setAmc(null);

    const res = await lookupWarrantiesByPhone(phoneDigits);
    if (res.error) {
      setErrorMsg(res.error);
      setState('error');
      return;
    }
    if (!res.found) {
      setState('notfound');
      return;
    }
    setCustomer(res.customer || null);
    setWarranties(res.warranties || []);
    setAmc(res.amc ?? null);
    setState('results');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1">
        <PageHero
          badge="Warranty self-check"
          title="Check your warranty status"
          description="Enter the mobile number used for your service to see what's covered and when each warranty expires."
          showButtons={false}
        />

        <section className="w-full px-4 py-10 md:py-14">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Search card */}
            <Card>
              <CardContent className="p-5 sm:p-6">
                <form onSubmit={handleSearch} className="space-y-4">
                  <label htmlFor="warranty-phone" className="block text-sm font-medium">
                    Registered mobile number
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        id="warranty-phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="Enter 10-digit mobile number"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
                        className="pl-9 h-12 text-base"
                      />
                    </div>
                    <Button type="submit" disabled={!canSearch} className="h-12 px-6 bg-sky-600 hover:bg-sky-700 text-white">
                      {state === 'loading' ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Checking...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Search className="w-4 h-4" />
                          Check warranty
                        </span>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    We only show warranty details for the number you enter. No login required.
                  </p>
                </form>
              </CardContent>
            </Card>

            {/* Error */}
            {state === 'error' && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{errorMsg || 'Something went wrong. Please try again.'}</span>
              </div>
            )}

            {/* Not found */}
            {state === 'notfound' && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/60" />
                  <p className="font-medium text-foreground">No customer found for this number</p>
                  <p className="text-sm mt-2">
                    We could not find a service record for this mobile number. Use the same number you gave
                    when booking service (primary or alternate). If you think this is a mistake, please contact us.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => window.open('tel:+918884944288', '_self')}
                  >
                    <Phone className="w-4 h-4 mr-2" />
                    Call support
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Results */}
            {state === 'results' && customer && (
              <div className="space-y-5">
                {/* Customer summary */}
                <Card>
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-lg font-semibold truncate">{customer.name || '—'}</p>
                          {amc?.active && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                              <BadgeCheck className="h-3 w-3" /> AMC
                            </span>
                          )}
                        </div>
                        {customer.visible_address && (
                          <p className="text-sm text-muted-foreground">{customer.visible_address}</p>
                        )}
                      </div>
                      {customer.customer_id && (
                        <span className="shrink-0 rounded-full bg-sky-100 text-sky-800 px-3 py-1 text-xs font-semibold">
                          {customer.customer_id}
                        </span>
                      )}
                    </div>

                    <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      {(customer.brand || customer.model) && (
                        <DetailRow label="Unit" value={[customer.brand, customer.model].filter(Boolean).join(' · ')} />
                      )}
                      {customer.address && <DetailRow label="Address" value={customer.address} />}
                      {customer.customer_since && (
                        <DetailRow label="Customer since" value={formatWarrantyDate(customer.customer_since)} />
                      )}
                      {customer.installation_date && (
                        <DetailRow label="Installed on" value={formatWarrantyDate(customer.installation_date)} />
                      )}
                      {customer.last_service_date && (
                        <DetailRow label="Last service" value={formatWarrantyDate(customer.last_service_date)} />
                      )}
                    </dl>
                  </CardContent>
                </Card>

                {/* AMC banner */}
                {amc?.active && (
                  <Card className="border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/20">
                    <CardContent className="p-4 sm:p-5 flex items-start gap-3">
                      <BadgeCheck className="w-6 h-6 text-indigo-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-indigo-900 dark:text-indigo-200">
                          Covered under AMC
                        </p>
                        <p className="text-sm text-indigo-800/80 dark:text-indigo-300/80 mt-0.5">
                          You have an active Annual Maintenance Contract
                          {amc.end_date ? ` valid till ${formatWarrantyDate(amc.end_date)}` : ''}. Services
                          and covered parts are provided as agreed in your AMC agreement.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {warranties.length > 0 ? (
                  warranties.map((w) => <WarrantyCard key={w.id} warranty={w} />)
                ) : amc?.active ? null : (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-muted-foreground/60" />
                      <p className="font-medium text-foreground">No warranties recorded yet</p>
                      <p className="text-sm mt-2">
                        We found your customer record, but there are no warranties added to it.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="text-foreground break-words">{value}</dd>
  </div>
);

const WarrantyCard: React.FC<{ warranty: PublicWarranty }> = ({ warranty }) => {
  // Header status uses the latest COVERED item end date (or the warranty end date).
  const coveredItems = warranty.items.filter((it) => it.covered !== false);
  const overallEnd =
    coveredItems.length > 0
      ? coveredItems.reduce((max, it) => (it.end_date > max ? it.end_date : max), coveredItems[0].end_date)
      : warranty.end_date;
  const overall = warrantyStatus(overallEnd);

  return (
    <Card>
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-sky-600" />
            <div>
              <p className="font-semibold">Warranty</p>
              <p className="text-xs text-muted-foreground">
                From {formatWarrantyDate(warranty.start_date)}
              </p>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${overall.toneClass}`}>
            {overall.label}
          </span>
        </div>

        {warranty.items.length === 0 ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            Covered until <span className="font-medium text-foreground">{formatWarrantyDate(warranty.end_date)}</span>
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {warranty.items.map((it) => {
              const cat = categoryDef(it.category);
              const notCovered = it.covered === false;
              const st = warrantyStatus(it.end_date);
              // Hide the category badge when the label is just the category name (no new info).
              const showBadge = it.label.trim().toLowerCase() !== cat.label.toLowerCase();
              return (
                <div key={it.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium truncate ${notCovered ? 'text-muted-foreground' : ''}`}>
                        {it.label}
                      </span>
                      {showBadge && (
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cat.badgeClass}`}>
                          {cat.label}
                        </span>
                      )}
                    </div>
                    {!notCovered && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Until {formatWarrantyDate(it.end_date)}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium">
                    {notCovered ? (
                      <>
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Not covered</span>
                      </>
                    ) : (
                      <>
                        {st.active ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className={st.active ? 'text-emerald-700' : 'text-red-600'}>{st.label}</span>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {warranty.notes && (
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Terms & conditions
            </p>
            <p className="text-xs text-muted-foreground whitespace-pre-line">{warranty.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default Warranty;
