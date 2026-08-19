import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import SeoBreadcrumbs from '@/components/SeoBreadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Clock, Check } from 'lucide-react';
import {
  getLocationSeo,
  buildLocationTitle,
  buildLocationDescription,
  buildLocationIntro,
  buildLocationFaqItems,
  buildLocationFaqJsonLd,
  resolveLocationForNearby,
  LOCATION_HUB_GROUPS,
  getLocationBySlug,
} from '@/data/locationSeo';
import { CITY_SERVICE_HUB_GROUPS } from '@/data/cityServiceSeo';
import {
  BENGALURU_ZONE_HUBS,
  TIER1_CITY_HUBS,
  getZoneSiblingLocations,
  getBengaluruZoneForSlug,
  resolveZoneHubAreas,
  resolveTier1SubAreas,
} from '@/data/topCityAreasSeo';
import { getBrandSeoProfile } from '@/lib/publicSiteSeo';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';

const ServiceAreas = () => {
  const brand = getBrandSeoProfile(getPublicSiteKey());
  const { pathname } = useLocation();
  const loc = getLocationSeo(pathname);

  const placeLabel = loc
    ? loc.region === 'Bengaluru'
      ? `${loc.name}, Bengaluru`
      : `${loc.name}, ${loc.region}`
    : 'Bengaluru';

  const heroTitle = loc
    ? `RO Service in ${loc.name}${loc.region === 'Karnataka' ? ', Karnataka' : ''}`
    : 'Service Areas in Bengaluru';
  const heroDescription = loc
    ? buildLocationDescription(loc, brand.brandName, brand.primaryPhone)
    : 'We provide professional RO water purifier services across all areas of Bengaluru. Find your area and book service today!';

  // Set a UNIQUE document title + meta description per location route so each
  // /ro-service-* page is a distinct, indexable landing page (not duplicate).
  useEffect(() => {
    if (!loc) return;
    const prevTitle = document.title;
    document.title = buildLocationTitle(loc, brand.brandName);

    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute('content') ?? null;
    if (metaDesc) {
      metaDesc.setAttribute('content', buildLocationDescription(loc, brand.brandName, brand.primaryPhone));
    }

    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc !== null) metaDesc.setAttribute('content', prevDesc);
    };
  }, [loc, brand.brandName, brand.primaryPhone]);

  const faqItems = loc ? buildLocationFaqItems(loc, brand.brandName, brand.primaryPhone) : [];
  const zoneSiblings = loc ? getZoneSiblingLocations(loc.slug) : [];

  const nearbyPillClass =
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 border border-sky-200/60 dark:border-sky-500/20 hover:bg-sky-200/80 dark:hover:bg-sky-500/25 transition-colors';

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          "name": loc ? `RO Service in ${loc.name}` : "RO Service Areas in Bengaluru",
          "description": loc
            ? buildLocationDescription(loc, brand.brandName, brand.primaryPhone)
            : "Professional RO water purifier services across all areas of Bengaluru, Karnataka",
          "image": brand.ogImage,
          "provider": {
            "@type": "LocalBusiness",
            "name": brand.brandName,
            "address": {
              "@type": "PostalAddress",
              "streetAddress": brand.streetAddress,
              "addressLocality": brand.city,
              "addressRegion": brand.state,
              "postalCode": brand.pincode,
              "addressCountry": "IN"
            },
            "telephone": brand.primaryPhone,
            "email": brand.email,
            "url": brand.origin,
            "areaServed": {
              "@type": loc && loc.region !== 'Bengaluru' ? "City" : "Place",
              "name": loc ? loc.name : "Bengaluru"
            },
            "serviceArea": {
              "@type": "GeoCircle",
              "geoMidpoint": {
                "@type": "GeoCoordinates",
                "latitude": brand.geo.latitude,
                "longitude": brand.geo.longitude
              },
              "geoRadius": {
                "@type": "Distance",
                "value": 50,
                "unitCode": "KMT"
              }
            }
          },
          "offers": {
            "@type": "Offer",
            "name": "RO Service",
            "description": "Professional RO water purifier services",
            "price": "500",
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock",
            "areaServed": {
              "@type": "City",
              "name": "Bengaluru"
            }
          }
        })}
      </script>
      
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "RO Water Purifier Service",
          "description": "Professional RO water purifier installation, repair, and maintenance services in Bengaluru, Karnataka",
          "image": brand.ogImage,
          "brand": {
            "@type": "Brand",
            "name": brand.brandName
          },
          "offers": {
            "@type": "Offer",
            "price": "500",
            "priceCurrency": "INR",
            "priceValidUntil": "2026-12-31",
            "availability": "https://schema.org/InStock",
            "seller": {
              "@type": "Organization",
              "name": brand.brandName
            },
            "areaServed": {
              "@type": "City",
              "name": "Bengaluru"
            },
            "shippingDetails": {
              "@type": "OfferShippingDetails",
              "shippingRate": {
                "@type": "MonetaryAmount",
                "value": "0",
                "currency": "INR"
              },
              "shippingDestination": {
                "@type": "DefinedRegion",
                "addressCountry": "IN"
              },
              "deliveryTime": {
                "@type": "ShippingDeliveryTime",
                "businessDays": {
                  "@type": "OpeningHoursSpecification",
                  "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                },
                "cutoffTime": "20:00",
                "handlingTime": {
                  "@type": "QuantitativeValue",
                  "minValue": 0,
                  "maxValue": 1,
                  "unitCode": "DAY"
                },
                "transitTime": {
                  "@type": "QuantitativeValue",
                  "minValue": 0,
                  "maxValue": 1,
                  "unitCode": "DAY"
                }
              }
            },
            "hasMerchantReturnPolicy": {
              "@type": "MerchantReturnPolicy",
              "applicableCountry": "IN",
              "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
              "merchantReturnDays": 7,
              "returnMethod": "https://schema.org/ReturnByMail",
              "returnFees": "https://schema.org/FreeReturn"
            }
          },
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "5",
            "reviewCount": "2300",
            "bestRating": "5",
            "worstRating": "1"
          }
        })}
      </script>

      {loc && (
        <script type="application/ld+json">
          {JSON.stringify(buildLocationFaqJsonLd(loc, brand.brandName, brand.primaryPhone))}
        </script>
      )}

      <Header />

      <main className="flex-1">
        <SeoBreadcrumbs />
        <PageHero 
          badge={loc ? `RO service in ${placeLabel}` : 'Trusted by 3000+ customers'}
          title={heroTitle}
          description={heroDescription}
          showButtons={true}
        />

        {loc && (
          <section className="py-12 px-4 md:px-12 water-soft">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                RO Water Purifier Service in {loc.name}
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                {buildLocationIntro(loc, brand.brandName)}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {loc.nearby.map((n) => {
                  const linked = resolveLocationForNearby(n);
                  const label = `RO service ${n}`;
                  if (linked && linked.slug !== loc.slug) {
                    return (
                      <Link key={n} to={`/${linked.slug}`} className={nearbyPillClass}>
                        <MapPin className="w-3.5 h-3.5" />
                        {label}
                      </Link>
                    );
                  }
                  return (
                    <span key={n} className={nearbyPillClass}>
                      <MapPin className="w-3.5 h-3.5" />
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {loc && zoneSiblings.length > 0 && (
          <section className="py-10 px-4 md:px-12 bg-background border-t border-sky-100/60 dark:border-sky-500/10">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4">
                Other areas in {loc.region === 'Bengaluru' ? `${getBengaluruZoneForSlug(loc.slug)?.title ?? 'Bengaluru'}` : loc.region}
              </h2>
              <div className="flex flex-wrap justify-center gap-2">
                {zoneSiblings.slice(0, 12).map((sibling) => (
                  <Link key={sibling.slug} to={`/${sibling.slug}`} className={nearbyPillClass}>
                    <MapPin className="w-3.5 h-3.5" />
                    RO service {sibling.name}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {loc && faqItems.length > 0 && (
          <section className="py-12 px-4 md:px-12 bg-background border-t border-sky-100/60 dark:border-sky-500/10">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6 text-center">
                RO Service in {loc.name} — FAQs
              </h2>
              <div className="space-y-4">
                {faqItems.map((item) => (
                  <details
                    key={item.question}
                    className="group rounded-xl border border-sky-100 dark:border-sky-500/15 bg-card p-4"
                  >
                    <summary className="cursor-pointer font-medium text-foreground list-none flex justify-between items-center gap-2">
                      {item.question}
                      <span className="text-sky-600 dark:text-sky-400 text-sm group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <p className="mt-3 text-muted-foreground text-sm leading-relaxed">{item.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        {!loc && (
          <section className="py-12 px-4 md:px-12 bg-background border-b border-sky-100/60 dark:border-sky-500/10">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2 text-center">
                Tier 1 Cities — Areas We Serve
              </h2>
              <p className="text-center text-muted-foreground mb-10 max-w-2xl mx-auto">
                Browse RO service pages inside Bengaluru, Mysuru and Mangaluru — each city links to
                localities and neighbourhoods we cover.
              </p>
              <div className="space-y-10">
                {TIER1_CITY_HUBS.map((cityHub) => {
                  const cityLoc = getLocationBySlug(cityHub.locationSlug);
                  const subAreas =
                    cityHub.citySlug === 'bengaluru'
                      ? null
                      : resolveTier1SubAreas(cityHub);
                  return (
                    <div key={cityHub.citySlug}>
                      <div className="flex flex-wrap items-center gap-3 mb-4">
                        {cityLoc && (
                          <Link
                            to={`/${cityHub.locationSlug}`}
                            className="text-lg font-semibold text-sky-800 dark:text-sky-300 hover:underline"
                          >
                            RO service in {cityHub.cityName}
                          </Link>
                        )}
                      </div>
                      {cityHub.citySlug === 'bengaluru' ? (
                        <div className="space-y-6 pl-0 md:pl-4 border-l-0 md:border-l-2 border-sky-100 dark:border-sky-500/20">
                          {BENGALURU_ZONE_HUBS.map((zoneHub) => {
                            const areas = resolveZoneHubAreas(zoneHub);
                            if (!areas.length) return null;
                            return (
                              <div key={zoneHub.zone}>
                                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                  {zoneHub.title}
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {areas.map((area) => (
                                    <Link
                                      key={area.slug}
                                      to={`/${area.slug}`}
                                      className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300 border border-sky-100 dark:border-sky-500/20 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors"
                                    >
                                      {area.name}
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        subAreas &&
                        subAreas.length > 0 && (
                          <div className="flex flex-wrap gap-2 pl-0 md:pl-4">
                            {subAreas.map((area) => (
                              <Link
                                key={area.slug}
                                to={`/${area.slug}`}
                                className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300 border border-sky-100 dark:border-sky-500/20 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors"
                              >
                                {area.name}
                              </Link>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {!loc && (
          <section className="py-12 px-4 md:px-12 bg-background border-b border-sky-100/60 dark:border-sky-500/10">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2 text-center">
                RO Services by City in Karnataka
              </h2>
              <p className="text-center text-muted-foreground mb-10 max-w-2xl mx-auto">
                Service-specific pages for Bengaluru, Mysuru, Mangaluru, Hubballi, Belagavi and other
                priority Karnataka cities — installation, AMC, commercial RO and water softeners.
              </p>
              <div className="space-y-8">
                {CITY_SERVICE_HUB_GROUPS.map((group) => (
                  <div key={group.title}>
                    <h3 className="text-lg font-semibold text-foreground mb-4">{group.title}</h3>
                    <div className="flex flex-wrap gap-2">
                      {group.pages.map((page) => (
                        <Link
                          key={page.path}
                          to={page.path}
                          className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300 border border-sky-100 dark:border-sky-500/20 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors"
                        >
                          {page.serviceName} — {page.cityName}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {!loc && (
          <section className="py-12 px-4 md:px-12 bg-background">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2 text-center">
                RO Service by Area in Bengaluru
              </h2>
              <p className="text-center text-muted-foreground mb-10 max-w-2xl mx-auto">
                Browse RO installation, repair and AMC pages for your locality. Each area has dedicated
                same-day service coverage across Bangalore.
              </p>
              <div className="space-y-10">
                {LOCATION_HUB_GROUPS.map((group) => (
                  <div key={group.title}>
                    <h3 className="text-lg font-semibold text-foreground mb-4">{group.title}</h3>
                    <div className="flex flex-wrap gap-2">
                      {group.slugs.map((slug) => {
                        const area = getLocationBySlug(slug);
                        if (!area) return null;
                        return (
                          <Link
                            key={slug}
                            to={`/${slug}`}
                            className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300 border border-sky-100 dark:border-sky-500/20 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors"
                          >
                            RO service {area.name}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4 text-foreground">Coverage Across Bengaluru</h2>
              <p className="text-lg text-muted-foreground">
                Professional RO services available in all major areas
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              {[
                { area: 'Whitefield', pincode: '560066', time: '30 minutes' },
                { area: 'Electronic City', pincode: '560100', time: '45 minutes' },
                { area: 'Koramangala', pincode: '560034', time: '25 minutes' },
                { area: 'HSR Layout', pincode: '560102', time: '35 minutes' },
                { area: 'Yelahanka', pincode: '560064', time: '40 minutes' },
                { area: 'Sarjapur', pincode: '562125', time: '45 minutes' },
                { area: 'Budigere Cross', pincode: '562110', time: '50 minutes' },
                { area: 'Devanahalli', pincode: '562110', time: '55 minutes' },
                { area: 'Indiranagar', pincode: '560038', time: '20 minutes' },
                { area: 'Marathahalli', pincode: '560037', time: '40 minutes' },
                { area: 'BTM Layout', pincode: '560076', time: '30 minutes' },
                { area: 'Jayanagar', pincode: '560011', time: '25 minutes' },
                { area: 'Malleshwaram', pincode: '560003', time: '35 minutes' },
                { area: 'Rajajinagar', pincode: '560010', time: '30 minutes' },
                { area: 'Bannerghatta', pincode: '560076', time: '50 minutes' },
                { area: 'Hebbal', pincode: '560024', time: '45 minutes' }
              ].map((location, index) => (
                <Card key={index} className="border-sky-100 dark:border-sky-500/15 hover:shadow-lg transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-sky-100 dark:bg-sky-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground mb-1">{location.area}</h3>
                        <p className="text-sm text-muted-foreground mb-2">{location.pincode}</p>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>Response: {location.time}</span>
            </div>
            </div>
            </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-sky-100 dark:border-sky-500/15">
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold mb-6 text-center text-foreground">
                  All Bengaluru Areas Covered
                </h3>
                <p className="text-center text-muted-foreground mb-6">
                  We provide comprehensive RO services across all pincodes from 560001 to 560110, covering all areas of Bengaluru and parts of Kolar and Ramanagar districts.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Check className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                      Why Choose Us?
                    </h4>
                    <ul className="space-y-2 text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                        Quick Response - Average response time of 30 minutes
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                        Certified Technicians
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                        Quality Guarantee
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                        Local Expertise
                      </li>
                    </ul>
            </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Check className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                      Services Offered
                    </h4>
                    <ul className="space-y-2 text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                        RO Installation
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                        RO Repair & Maintenance
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                        Filter Replacement
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                        Emergency Repair
                      </li>
                    </ul>
            </div>
            </div>
              </CardContent>
            </Card>

            {/* Features */}
            <div className="mt-8 text-center text-sm text-muted-foreground space-y-1">
              <div>Same-day service available</div>
              <div>All brands service supported</div>
              <div>Genuine spare parts</div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default ServiceAreas;
