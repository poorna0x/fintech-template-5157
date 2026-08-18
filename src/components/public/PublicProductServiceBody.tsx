import { Link, useNavigate } from 'react-router-dom';
import { Building2, Droplets, Factory, Phone, Settings, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { openPublicPhoneCall } from '@/lib/publicPhone';
import {
  productServiceFaqs,
  type ProductServiceKind,
} from '@/lib/publicProductService';

type Props = {
  kind: ProductServiceKind;
  brandName: string;
  primaryPhone: string;
  placeName?: string;
  district?: string;
  zone?: string;
};

const cardClass = 'border-sky-100 dark:border-sky-500/15 h-full';

const CAPACITY_HEADING: Partial<Record<ProductServiceKind, string>> = {
  'commercial-25': '25 LPH commercial RO plant',
  'commercial-50': '50 LPH commercial RO plant',
  'commercial-500': '500 LPH commercial RO plant',
  'commercial-1000': '1000 LPH commercial RO plant',
};

function telHref(phone: string) {
  const digits = phone.replace(/[^\d+]/g, '');
  return `tel:${digits}`;
}

export default function PublicProductServiceBody({
  kind,
  brandName,
  primaryPhone,
  placeName,
  district,
  zone,
}: Props) {
  const navigate = useNavigate();
  const place = placeName || 'Bengaluru';
  const districtNote = district ? ` (${district} district)` : '';
  const zoneNote = zone ? ` in ${zone} Bengaluru` : '';
  const faqs = productServiceFaqs(kind, place, brandName, primaryPhone);
  const isCommercial = kind.startsWith('commercial');
  const capacityHeading = CAPACITY_HEADING[kind];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqs.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          }),
        }}
      />

      <section className="py-12 px-2 md:px-12 bg-background">
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="max-w-3xl space-y-4">
            {isCommercial ? (
              <>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                  {capacityHeading
                    ? `${capacityHeading} in ${place}`
                    : `Commercial RO plants for offices and businesses in ${place}`}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {brandName} supplies, installs and services commercial RO plants in {place}
                  {districtNote}
                  {zoneNote} — from{' '}
                  <Link to="/commercial-ro-25-lph" className="text-sky-700 dark:text-sky-400 underline-offset-2 hover:underline">
                    25 LPH
                  </Link>
                  {' '}and{' '}
                  <Link to="/commercial-ro-50-lph" className="text-sky-700 dark:text-sky-400 underline-offset-2 hover:underline">
                    50 LPH
                  </Link>
                  {' '}up to{' '}
                  <Link to="/commercial-ro-500-lph" className="text-sky-700 dark:text-sky-400 underline-offset-2 hover:underline">
                    500 LPH
                  </Link>
                  {' '}and{' '}
                  <Link to="/commercial-ro-1000-lph" className="text-sky-700 dark:text-sky-400 underline-offset-2 hover:underline">
                    1000 LPH
                  </Link>
                  . Based in Bengaluru, we cover offices, restaurants, hotels, clinics, schools and
                  factories <strong className="text-foreground">up to 250 km from the city</strong>
                  — site visit, installation, repair, membrane/filter service and AMC.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                  {kind === 'softener-install'
                    ? `New water softener installation in ${place}`
                    : kind === 'apartment-softener'
                      ? `Apartment water softener in ${place}`
                      : `Water softener installation and service in ${place}`}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Hard borewell and tanker water is common across Karnataka. {brandName} does{' '}
                  <strong className="text-foreground">new water softener installation</strong>,
                  re-installation, salt refill, resin service and repair in {place}
                  {districtNote}
                  {zoneNote}. Homes, apartments and commercial sites can book the same technician
                  team that services RO across Bengaluru and <strong className="text-foreground">up to 250 km</strong> from the city.
                </p>
              </>
            )}
          </div>

          {isCommercial && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className={cardClass}>
                <CardContent className="p-6 space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center">
                    <Droplets className="w-6 h-6 text-sky-700 dark:text-sky-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">25 LPH commercial RO</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    About 25 litres per hour — small offices, clinics, salons and pantries (roughly
                    10–25 people). Site survey, installation, commissioning and AMC in {place}.
                  </p>
                  <Link
                    to="/commercial-ro-25-lph"
                    className="inline-block text-sm font-medium text-sky-700 dark:text-sky-400 hover:underline underline-offset-2"
                  >
                    25 LPH plant details
                  </Link>
                </CardContent>
              </Card>
              <Card className={cardClass}>
                <CardContent className="p-6 space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-sky-700 dark:text-sky-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">50 LPH commercial RO</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    About 50 litres per hour — restaurants, larger offices, schools and small
                    factories that need more drinking water through the day. Installation and
                    service in {place}.
                  </p>
                  <Link
                    to="/commercial-ro-50-lph"
                    className="inline-block text-sm font-medium text-sky-700 dark:text-sky-400 hover:underline underline-offset-2"
                  >
                    50 LPH plant details
                  </Link>
                </CardContent>
              </Card>
              <Card className={cardClass}>
                <CardContent className="p-6 space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center">
                    <Factory className="w-6 h-6 text-sky-700 dark:text-sky-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">500 LPH commercial RO</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    About 500 litres per hour — hotels, hostels, large offices and mid-size
                    factories. Plant supply, commissioning and AMC within 250 km of Bengaluru.
                  </p>
                  <Link
                    to="/commercial-ro-500-lph"
                    className="inline-block text-sm font-medium text-sky-700 dark:text-sky-400 hover:underline underline-offset-2"
                  >
                    500 LPH plant details
                  </Link>
                </CardContent>
              </Card>
              <Card className={cardClass}>
                <CardContent className="p-6 space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center">
                    <Factory className="w-6 h-6 text-sky-700 dark:text-sky-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">1000 LPH commercial RO</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    About 1000 litres per hour — large commercial sites, hospitals, apartment
                    complexes and factories. Site visit, installation and ongoing service from
                    Bengaluru.
                  </p>
                  <Link
                    to="/commercial-ro-1000-lph"
                    className="inline-block text-sm font-medium text-sky-700 dark:text-sky-400 hover:underline underline-offset-2"
                  >
                    1000 LPH plant details
                  </Link>
                </CardContent>
              </Card>
            </div>
          )}

          {!isCommercial && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className={cardClass}>
                <CardContent className="p-6 space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center">
                    <Settings className="w-6 h-6 text-sky-700 dark:text-sky-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">New softener installation</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Whole-house or apartment-point softeners for hard water. We size the unit, plumb inlet
                    and drain, set the valve, and explain salt refill. Starting visit from ₹499 (resin extra).
                  </p>
                  <Link
                    to="/water-softener-installation"
                    className="inline-block text-sm font-medium text-sky-700 dark:text-sky-400 hover:underline underline-offset-2"
                  >
                    New installation
                  </Link>
                </CardContent>
              </Card>
              <Card className={cardClass}>
                <CardContent className="p-6 space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center">
                    <Wrench className="w-6 h-6 text-sky-700 dark:text-sky-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">Softener service &amp; repair</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Salt refill, resin check, valve repair, re-installation when you shift house, and
                    apartment / gated-community setups in {place}.
                  </p>
                  <Link
                    to="/water-softener"
                    className="inline-block text-sm font-medium text-sky-700 dark:text-sky-400 hover:underline underline-offset-2"
                  >
                    Softener service
                  </Link>
                </CardContent>
              </Card>
            </div>
          )}

          <div>
            <h3 className="text-xl font-semibold text-foreground mb-4">
              {isCommercial ? `What we do in ${place}` : `Softener work we do in ${place}`}
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground text-sm">
              {(isCommercial
                ? [
                    'New commercial RO plant installation (25, 50, 500 and 1000 LPH)',
                    'Site visit and capacity recommendation before you buy',
                    'Commissioning, TDS check and operator briefing',
                    'Commercial RO service, repair and membrane replacement',
                    'AMC for offices, restaurants, hotels, clinics and factories',
                    'Install and service up to 250 km from Bengaluru',
                  ]
                : [
                    'New water softener installation for homes and apartments',
                    'Re-installation / relocation when you shift',
                    'Salt refill and resin level service',
                    'Control valve repair and calibration',
                    'Hardness testing for borewell and tanker water',
                    'Apartment and commercial softener setups up to 250 km from Bengaluru',
                  ]
              ).map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-sky-100 dark:border-sky-500/15 bg-sky-50/60 dark:bg-sky-500/5 p-6 md:p-8">
            <h3 className="text-xl font-semibold text-foreground mb-3">
              Site visit, install and after-sales from Bengaluru
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Companies in {place} book {brandName} for a site visit before purchase, installation
              by the same team, and AMC they can call. We work from Bengaluru and cover up to 250 km
              — commercial plants and softeners get on-ground support, not a distant call centre.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                className="h-11 bg-sky-700 hover:bg-sky-800 text-white"
                onClick={() => navigate('/book')}
              >
                Book installation or service
              </Button>
              <Button type="button" variant="outline" className="h-11 border-sky-200 dark:border-sky-500/30" asChild>
                <a href={telHref(primaryPhone)} onClick={() => openPublicPhoneCall(primaryPhone)}>
                  <Phone className="w-4 h-4 mr-2" />
                  {primaryPhone}
                </a>
              </Button>
            </div>
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
              {isCommercial ? `Commercial RO FAQs in ${place}` : `Water softener FAQs in ${place}`}
            </h2>
            <div className="space-y-3">
              {faqs.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-xl border border-sky-100 dark:border-sky-500/15 bg-card p-4"
                >
                  <summary className="cursor-pointer font-medium text-foreground list-none flex justify-between items-center gap-2">
                    {f.q}
                    <span className="text-sky-600 dark:text-sky-400 text-sm group-open:rotate-180 transition-transform shrink-0">
                      ▼
                    </span>
                  </summary>
                  <p className="mt-3 text-muted-foreground text-sm leading-relaxed">{f.a}</p>
                </details>
              ))}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Also see{' '}
            {isCommercial ? (
              <>
                <Link to="/water-softener" className="text-sky-700 dark:text-sky-400 hover:underline">
                  water softener installation
                </Link>
                {' · '}
                <Link
                  to="/commercial-ro-plant-in-bengaluru"
                  className="text-sky-700 dark:text-sky-400 hover:underline"
                >
                  commercial RO in Bengaluru
                </Link>
              </>
            ) : (
              <>
                <Link to="/commercial-ro-service" className="text-sky-700 dark:text-sky-400 hover:underline">
                  commercial 25 to 1000 LPH plants
                </Link>
                {' · '}
                <Link
                  to="/water-softener-installation-in-bengaluru"
                  className="text-sky-700 dark:text-sky-400 hover:underline"
                >
                  softener installation in Bengaluru
                </Link>
              </>
            )}
            {' · '}
            <Link to="/book" className="text-sky-700 dark:text-sky-400 hover:underline">
              book online
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
