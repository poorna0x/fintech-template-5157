import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import SeoBreadcrumbs from '@/components/SeoBreadcrumbs';
import PublicAmcLearnMoreDialog from '@/components/PublicAmcLearnMoreDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Filter, Wrench, CheckCircle, DollarSign, Clock, Shield, Settings, ShieldCheck, Building2 } from 'lucide-react';

import { buildPublicLocalBusinessJsonLd, getBrandSeoProfile } from '@/lib/publicSiteSeo';
import { findServicePage } from '@/lib/publicSeoPages';
import { getCityServicePage } from '@/data/cityServiceSeo';
import { PUBLIC_AMC_PLANS, formatPublicAmcInr, PUBLIC_AMC_TAGLINE } from '@/lib/public-amc-info';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';
import { resolveProductServiceKind, productServicePageCopy } from '@/lib/publicProductService';
import PublicProductServiceBody from '@/components/public/PublicProductServiceBody';

const serviceCardClass =
  'border-sky-100 dark:border-sky-500/15 hover:shadow-lg transition-all duration-300 h-full';
const serviceCardContentClass = 'p-8 flex flex-col h-full';

const Services = () => {
  const { pathname } = useLocation();
  const servicePage = findServicePage(pathname);
  const cityServicePage = getCityServicePage(pathname);
  const siteKey = getPublicSiteKey();
  const isHydrogenRo = siteKey === 'hydrogenro';
  const brand = getBrandSeoProfile(siteKey);
  const [amcLearnMoreOpen, setAmcLearnMoreOpen] = useState(false);
  const productKind = resolveProductServiceKind(pathname, cityServicePage, servicePage);
  const productPlace = cityServicePage?.cityName || 'Bengaluru';
  const productCopy = productKind
    ? productServicePageCopy(productKind, productPlace, brand.brandName)
    : null;

  const serviceOffers = [
    {
      "@type": "Offer",
      "name": "RO Installation",
      "description": "Professional RO water purifier installation service",
      "price": "499",
      "priceCurrency": "INR",
      "availability": "https://schema.org/InStock"
    },
    {
      "@type": "Offer",
      "name": "RO Service",
      "description": "Expert RO water purifier repair and troubleshooting",
      "price": "399",
      "priceCurrency": "INR",
      "availability": "https://schema.org/InStock"
    },
    {
      "@type": "Offer",
      "name": "New Water Softener Installation",
      "description": "New water softener installation and service for homes and apartments",
      "price": "499",
      "priceCurrency": "INR",
      "availability": "https://schema.org/InStock"
    },
    {
      "@type": "Offer",
      "name": "25 LPH Commercial RO Plant",
      "description": "25 LPH commercial RO plant supply, installation and service for offices and clinics",
      "priceCurrency": "INR",
      "availability": "https://schema.org/InStock"
    },
    {
      "@type": "Offer",
      "name": "50 LPH Commercial RO Plant",
      "description": "50 LPH commercial RO plant supply, installation and service for restaurants, offices and schools",
      "priceCurrency": "INR",
      "availability": "https://schema.org/InStock"
    },
    {
      "@type": "Offer",
      "name": "500 LPH Commercial RO Plant",
      "description": "500 LPH commercial RO plant supply, installation and service for hotels, hostels and factories",
      "priceCurrency": "INR",
      "availability": "https://schema.org/InStock"
    },
    {
      "@type": "Offer",
      "name": "1000 LPH Commercial RO Plant",
      "description": "1000 LPH commercial RO plant supply, installation and service for large commercial sites and factories",
      "priceCurrency": "INR",
      "availability": "https://schema.org/InStock"
    },
    ...(isHydrogenRo
      ? PUBLIC_AMC_PLANS.map((plan) => ({
          "@type": "Offer" as const,
          "name": `RO AMC — ${plan.label}`,
          "description": PUBLIC_AMC_TAGLINE,
          "price": String(plan.amountInr),
          "priceCurrency": "INR",
          "availability": "https://schema.org/InStock"
        }))
      : []),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          "name": productCopy?.schemaName
            ?? 'RO Water Purifier Services',
          "description": productCopy?.description
            ?? `Professional RO water purifier installation, repair, and maintenance services in Bengaluru, Karnataka by ${brand.brandName}`,
          "image": brand.ogImage,
          "provider": buildPublicLocalBusinessJsonLd(),
          "offers": serviceOffers,
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "5",
            "reviewCount": "2300",
            "bestRating": "5",
            "worstRating": "1"
          }
        })}
      </script>

      <Header />

      <main className="flex-1">
        <SeoBreadcrumbs />
        <PageHero 
          title={
            productCopy?.title
              ?? (cityServicePage
                ? `${cityServicePage.serviceName} in ${cityServicePage.cityName}`
                : servicePage
                  ? `${servicePage.serviceName} in Karnataka`
                  : 'RO Water Purifier Services in Bengaluru')
          }
          description={
            productCopy?.description
              ?? cityServicePage?.shortDescription
              ?? servicePage?.shortDescription
              ?? 'Professional RO water purifier installation, repair, and maintenance services by certified technicians in Bengaluru, Karnataka. Same-day service, 24/7 emergency support across all areas of Bangalore.'
          }
        />

        {productKind && (
          <PublicProductServiceBody
            kind={productKind}
            brandName={brand.brandName}
            primaryPhone={brand.primaryPhone}
            placeName={cityServicePage?.cityName}
            district={cityServicePage?.district}
            zone={cityServicePage?.zone}
          />
        )}

        {!productKind && (
        {/* Why Choose Section */}
        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                Why Choose Our RO Services?
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="border-sky-100 dark:border-sky-500/15 text-center hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Shield className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Certified Technicians
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    All RO technicians are certified and trained professionals
                  </p>
                </CardContent>
              </Card>

              <Card className="border-sky-100 dark:border-sky-500/15 text-center hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Clock className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Same Day Service
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Quick response times with same-day service available
                  </p>
                </CardContent>
              </Card>

              <Card className="border-sky-100 dark:border-sky-500/15 text-center hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    All Brands Supported
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Expert service for all major RO water purifier brands
                  </p>
                </CardContent>
              </Card>

              <Card className="border-sky-100 dark:border-sky-500/15 text-center hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <DollarSign className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Competitive Pricing
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Transparent pricing with no hidden fees
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
        )}

        {/* Main Services */}
        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                {productKind?.startsWith('commercial')
                  ? 'Home RO, commercial plants and softeners'
                  : productKind
                    ? 'Related water treatment services'
                    : 'Complete RO, commercial plant and softener services'}
              </h2>
            </div>

            <div
              className={`grid grid-cols-1 md:grid-cols-2 gap-8 ${
                isHydrogenRo ? '' : 'lg:grid-cols-3'
              }`}
            >
              <Card className={serviceCardClass}>
                <CardContent className={serviceCardContentClass}>
                  <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mb-6">
                    <Filter className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-3 text-foreground">RO Installation</h3>
                  <div className="mb-4 min-h-[3.5rem]">
                    <p className="text-sky-600 dark:text-sky-400 font-bold text-lg">
                      Installation: ₹499 | Service: ₹399
                    </p>
                  </div>
                  <ul className="space-y-2 text-muted-foreground flex-1">
                    <li>• Complete RO system setup</li>
                    <li>• Water quality testing</li>
                    <li>• All brands service supported</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className={serviceCardClass}>
                <CardContent className={serviceCardContentClass}>
                  <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mb-6">
                    <Wrench className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-3 text-foreground">RO Repair & Maintenance</h3>
                  <div className="mb-4 min-h-[3.5rem]">
                    <p className="text-sky-600 dark:text-sky-400 font-bold text-lg">
                      Service from ₹399
                    </p>
                  </div>
                  <ul className="space-y-2 text-muted-foreground flex-1">
                    <li>• Complete system repair</li>
                    <li>• Emergency 24/7 support</li>
                    <li>• All brands service supported</li>
                    <li>• Annual maintenance plans</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className={serviceCardClass}>
                <CardContent className={serviceCardContentClass}>
                  <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mb-6">
                    <Settings className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-3 text-foreground">New Water Softener Installation</h3>
                  <div className="mb-4 min-h-[3.5rem]">
                    <p className="text-sky-600 dark:text-sky-400 font-bold text-lg">
                      Starting from ₹499
                    </p>
                  </div>
                  <ul className="space-y-2 text-muted-foreground flex-1">
                    <li>• New softener installation for homes &amp; apartments</li>
                    <li>• Salt refill and resin service</li>
                    <li>• Repair and re-installation</li>
                    <li>• Hard borewell / tanker water in Karnataka</li>
                  </ul>
                  <Button asChild variant="outline" className="mt-6 w-full border-sky-200 dark:border-sky-500/30">
                    <Link to="/water-softener">Water softener details</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className={serviceCardClass}>
                <CardContent className={serviceCardContentClass}>
                  <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mb-6">
                    <Building2 className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-3 text-foreground">Commercial RO — 25 to 1000 LPH</h3>
                  <div className="mb-4 min-h-[3.5rem]">
                    <p className="text-sky-600 dark:text-sky-400 font-bold text-lg">
                      Bengaluru + 250 km
                    </p>
                  </div>
                  <ul className="space-y-2 text-muted-foreground flex-1">
                    <li>• 25 LPH &amp; 50 LPH for offices, clinics and restaurants</li>
                    <li>• 500 LPH &amp; 1000 LPH for hotels, factories and large sites</li>
                    <li>• New installation, service, repair and AMC</li>
                    <li>• Site visit before you buy — cover up to 250 km from Bengaluru</li>
                  </ul>
                  <Button asChild variant="outline" className="mt-6 w-full border-sky-200 dark:border-sky-500/30">
                    <Link to="/commercial-ro-service">Commercial RO details</Link>
                  </Button>
                </CardContent>
              </Card>

              {isHydrogenRo && (
                <Card className={`${serviceCardClass} border-sky-200 dark:border-sky-500/25 ring-1 ring-sky-100/80 dark:ring-sky-500/10`}>
                  <CardContent className={serviceCardContentClass}>
                    <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mb-6">
                      <ShieldCheck className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                    </div>
                    <h3 className="text-2xl font-semibold mb-3 text-foreground">AMC Plans</h3>
                    <div className="mb-4 min-h-[3.5rem] space-y-0.5">
                      {PUBLIC_AMC_PLANS.map((plan) => (
                        <p key={plan.years} className="text-sky-600 dark:text-sky-400 font-semibold text-sm sm:text-base">
                          {plan.label}: {formatPublicAmcInr(plan.amountInr)}
                        </p>
                      ))}
                    </div>
                    <ul className="space-y-2 text-muted-foreground flex-1">
                      <li>• 1 / 2 / 3 year plans</li>
                      <li>• No extra charge breakdown support</li>
                      <li>• Routine service every 6 months</li>
                      <li>• Filters, membrane &amp; electricals included</li>
                    </ul>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-6 w-full border-sky-200 text-sky-800 hover:bg-sky-50 dark:border-sky-500/30 dark:text-sky-300 dark:hover:bg-sky-500/10"
                      onClick={() => setAmcLearnMoreOpen(true)}
                    >
                      Learn more about AMC
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-4xl mx-auto">
            <Card className="border-sky-100 dark:border-sky-500/15">
              <CardContent className="p-8">
                <div className="text-center">
                  <h3 className="text-2xl font-semibold mb-6 text-foreground">Contact Us</h3>
                  <div className="space-y-3 text-foreground">
                    <p>Phone: {brand.phones.join(', ')}</p>
                    <p>Email: {brand.email}</p>
                    <p>Available: 24/7 Emergency Service</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      {isHydrogenRo && (
        <PublicAmcLearnMoreDialog open={amcLearnMoreOpen} onOpenChange={setAmcLearnMoreOpen} />
      )}

      <Footer />
    </div>
  );
};

export default Services;
