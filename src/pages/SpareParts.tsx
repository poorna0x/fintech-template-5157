import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { Card, CardContent } from '@/components/ui/card';
import { Filter } from 'lucide-react';

interface SparePart {
  id: string;
  name: string;
  price: number;
}

// Hardcoded RO filter spare parts - only name and price (Premium Pricing)
const SPARE_PARTS: SparePart[] = [
  // Service Charges
  { id: 'service-001', name: 'Inspection/Visiting Charge', price: 200 },
  { id: 'service-002', name: 'Service Charge', price: 400 },

  // Sediment Filters
  { id: 'sed-001', name: 'Sediment Filter 5 Micron - 10 inch', price: 600 },
  { id: 'sed-002', name: 'Sediment Filter 5 Micron - 20 inch', price: 750 },
  { id: 'sed-003', name: 'Sediment Filter 1 Micron - 10 inch', price: 650 },
  { id: 'sed-004', name: 'Sediment Filter 1 Micron - 20 inch', price: 800 },
  { id: 'sed-005', name: 'Sediment Filter 10 Micron - 10 inch', price: 600 },
  { id: 'sed-006', name: 'Sediment Filter 10 Micron - 20 inch', price: 750 },

  // Carbon Filters
  { id: 'carb-001', name: 'Carbon Block Filter - 10 inch', price: 800 },
  { id: 'carb-002', name: 'Carbon Block Filter - 20 inch', price: 800 },
  { id: 'carb-003', name: 'Granular Activated Carbon (GAC) - 10 inch', price: 900 },
  { id: 'carb-004', name: 'Granular Activated Carbon (GAC) - 20 inch', price: 900 },
  { id: 'carb-005', name: 'Carbon Block Filter - 5 inch', price: 800 },
  { id: 'carb-006', name: 'Carbon Block Filter - 15 inch', price: 800 },

  // RO Membranes
  { id: 'mem-001', name: 'RO Membrane 80 GPD', price: 3200 },
  { id: 'mem-002', name: 'RO Membrane 110 GPD', price: 3800 },
  { id: 'mem-003', name: 'RO Membrane 120 GPD', price: 4200 },

  // Post Filters
  { id: 'post-001', name: 'Post Carbon Filter - 10 inch', price: 800 },
  { id: 'post-002', name: 'Post Carbon Filter - 20 inch', price: 800 },
  { id: 'post-003', name: 'Mineral Filter', price: 660 },
  { id: 'post-004', name: 'Alkaline Filter', price: 880 },
  { id: 'post-005', name: 'TDS Controller Filter', price: 820 },
  { id: 'post-006', name: 'Post Carbon Filter - 5 inch', price: 800 },
  { id: 'post-007', name: 'Post Carbon Filter - 15 inch', price: 800 },

  // UV Filters
  { id: 'uv-001', name: 'UV Lamp 11W', price: 1350 },
  { id: 'uv-002', name: 'UV Lamp 15W', price: 1650 },
  { id: 'uv-003', name: 'UV Lamp 21W', price: 2200 },
  { id: 'uv-004', name: 'UV Chamber Complete - 11W', price: 2800 },
  { id: 'uv-005', name: 'UV Chamber Complete - 15W', price: 3100 },
  { id: 'uv-006', name: 'UV Chamber Complete - 21W', price: 3500 },

  // Specialty Filters
  { id: 'spec-001', name: 'UF Membrane Filter', price: 2000 },
  { id: 'spec-002', name: 'NF Membrane Filter', price: 2400 },
  { id: 'spec-003', name: 'Silver Impregnated Filter', price: 1000 },
  { id: 'spec-004', name: 'Copper-Zinc Filter', price: 1200 },
  { id: 'spec-005', name: 'Bio Ceramic Filter', price: 950 },
  { id: 'spec-006', name: 'Alkaline Mineralizer Filter', price: 1320 },

  // RO Components - Pumps
  { id: 'pump-001', name: 'Booster Pump 0.5 HP', price: 2800 },
  { id: 'pump-002', name: 'Booster Pump 0.75 HP', price: 3500 },
  { id: 'pump-003', name: 'Booster Pump 1 HP', price: 4200 },
  { id: 'pump-004', name: 'Booster Pump 1.5 HP', price: 5500 },
  { id: 'pump-005', name: 'Self Priming Pump', price: 3800 },
  { id: 'pump-006', name: 'Centrifugal Pump', price: 3200 },

  // RO Components - Storage Tanks
  { id: 'tank-001', name: 'Storage Tank 3L', price: 1200 },
  { id: 'tank-002', name: 'Storage Tank 5L', price: 1500 },
  { id: 'tank-003', name: 'Storage Tank 7L', price: 2000 },
  { id: 'tank-004', name: 'Storage Tank 10L', price: 2400 },
  { id: 'tank-005', name: 'Storage Tank 12L', price: 2800 },
  { id: 'tank-006', name: 'Storage Tank 15L', price: 3300 },
  { id: 'tank-007', name: 'Storage Tank 20L', price: 4000 },
  { id: 'tank-008', name: 'Storage Tank 25L', price: 4800 },

  // RO Components - Valves & Switches
  { id: 'valve-001', name: 'Float Valve', price: 675 },
  { id: 'valve-002', name: 'Pressure Switch', price: 450 },
  { id: 'valve-003', name: 'Flow Control Valve', price: 350 },
  { id: 'valve-004', name: 'Check Valve', price: 200 },
  { id: 'valve-005', name: 'Solenoid Valve', price: 1200 },
  { id: 'valve-006', name: 'Ball Valve 1/2 inch', price: 250 },
  { id: 'valve-007', name: 'Ball Valve 3/4 inch', price: 300 },
  { id: 'valve-008', name: 'Ball Valve 1 inch', price: 400 },
  { id: 'valve-009', name: 'Gate Valve', price: 500 },
  { id: 'valve-010', name: 'Pressure Relief Valve', price: 600 },

  // RO Components - Flow Restrictors
  { id: 'flow-001', name: 'Flow Restrictor 300cc', price: 180 },
  { id: 'flow-002', name: 'Flow Restrictor 400cc', price: 180 },
  { id: 'flow-003', name: 'Flow Restrictor 500cc', price: 200 },
  { id: 'flow-004', name: 'Flow Restrictor 600cc', price: 220 },
  { id: 'flow-005', name: 'Flow Restrictor 800cc', price: 250 },

  // RO Components - Tubing & Fittings
  { id: 'tube-001', name: 'RO Tubing Set (Complete)', price: 350 },
  { id: 'tube-002', name: 'RO Tubing 1/4 inch (per meter)', price: 50 },
  { id: 'tube-003', name: 'RO Tubing 3/8 inch (per meter)', price: 60 },
  { id: 'tube-004', name: 'RO Tubing 1/2 inch (per meter)', price: 80 },
  { id: 'tube-005', name: 'Quick Connect Fitting Set', price: 400 },
  { id: 'tube-006', name: 'John Guest Fitting Set', price: 500 },
  { id: 'tube-007', name: 'Elbow Fitting', price: 30 },
  { id: 'tube-008', name: 'Tee Fitting', price: 40 },
  { id: 'tube-009', name: 'Straight Connector', price: 25 },

  // RO Components - Filter Housings
  { id: 'housing-001', name: 'Filter Housing 10 inch - Single', price: 600 },
  { id: 'housing-002', name: 'Filter Housing 20 inch - Single', price: 800 },
  { id: 'housing-003', name: 'Filter Housing Set - 3 Stage', price: 1800 },
  { id: 'housing-004', name: 'Filter Housing Set - 4 Stage', price: 2400 },
  { id: 'housing-005', name: 'Filter Housing Set - 5 Stage', price: 3000 },
  { id: 'housing-006', name: 'Filter Housing Set - 6 Stage', price: 3600 },
  { id: 'housing-007', name: 'Filter Housing Set - 7 Stage', price: 4200 },
  { id: 'housing-008', name: 'Filter Housing Set - 8 Stage', price: 4800 },

  // RO Components - TDS & Pressure Gauges
  { id: 'gauge-001', name: 'TDS Meter Digital', price: 800 },
  { id: 'gauge-002', name: 'TDS Meter Pen Type', price: 600 },
  { id: 'gauge-003', name: 'Pressure Gauge', price: 450 },
  { id: 'gauge-004', name: 'TDS Controller Unit', price: 900 },
  { id: 'gauge-005', name: 'Water Flow Meter', price: 1200 },

  // RO Components - Adapters & Connectors
  { id: 'adapter-001', name: 'Adapter Set (Complete)', price: 500 },
  { id: 'adapter-002', name: 'Tank Adapter', price: 300 },
  { id: 'adapter-003', name: 'Faucet Adapter', price: 400 },
  { id: 'adapter-004', name: 'Drain Adapter', price: 250 },
  { id: 'adapter-005', name: 'Inlet Adapter', price: 200 },
  { id: 'adapter-006', name: 'Outlet Adapter', price: 200 },

  // RO Components - Mounting & Installation
  { id: 'mount-001', name: 'Wall Mounting Bracket', price: 300 },
  { id: 'mount-002', name: 'Tank Stand', price: 500 },
  { id: 'mount-003', name: 'Installation Kit Complete', price: 800 },
  { id: 'mount-004', name: 'Drain Saddle', price: 200 },
  { id: 'mount-005', name: 'Faucet (RO Tap)', price: 600 },
  { id: 'mount-006', name: 'Faucet (Premium)', price: 900 },

  // RO Components - O-Rings & Seals
  { id: 'seal-001', name: 'O-Ring Set (Complete)', price: 200 },
  { id: 'seal-002', name: 'Housing O-Ring', price: 50 },
  { id: 'seal-003', name: 'Tank O-Ring', price: 80 },
  { id: 'seal-004', name: 'Pump Seal Kit', price: 300 },

  // RO Components - Prefilters
  { id: 'pre-001', name: 'Pre Filter Housing', price: 800 },
  { id: 'pre-002', name: 'Pre Filter Cartridge', price: 300 },
  { id: 'pre-003', name: 'Pre Filter Set', price: 1000 },
];

const SpareParts = () => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(price);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* SEO Meta Tags */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "RO Spare Parts",
          "description": "Genuine RO water purifier spare parts and filters at competitive prices. All brands supported.",
          "image": "https://hydrogenro.com/og-image.jpg",
          "offers": {
            "@type": "AggregateOffer",
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock"
          }
        })}
      </script>

      <Header />

      <main className="flex-1">
        <PageHero 
          title="RO Spare Parts & Filters"
          description="Genuine spare parts and filters for all RO water purifier brands. Competitive prices with warranty."
        />

        {/* Service Charge Note */}
        <section className="py-8 px-2 md:px-12 bg-background">
          <div className="max-w-6xl mx-auto">
            <Card className="cosmic-card border-primary/20 bg-primary/5">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-sm text-foreground font-medium mb-1">
                      Important Note:
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Inspection charge (₹200) does not include service. Service charge is ₹400. You pay either ₹200 for inspection only or ₹400 for service.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Parts List */}
        {(
          <section className="py-16 px-2 md:px-12 bg-background">
            <div className="max-w-6xl mx-auto">
              <>
                <div className="mb-6">
                  <p className="text-muted-foreground text-sm">
                    Showing {SPARE_PARTS.length} items
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {SPARE_PARTS.map((part) => (
                    <Card key={part.id} className="cosmic-card hover:shadow-lg transition-all duration-300">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Filter className="w-5 h-5 text-primary" />
                          <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded">
                            {part.id.startsWith('service-') ? 'Service Charge' : 'RO Filter'}
                          </span>
                        </div>
                        <h3 className="text-lg font-semibold text-foreground mb-4">
                          {part.name}
                        </h3>
                        <div className="border-t pt-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">MRP</span>
                            <span className="text-2xl font-bold text-primary">
                              {formatPrice(part.price)}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            </div>
          </section>
        )}

        {/* Contact Section */}
        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-4xl mx-auto">
            <Card className="cosmic-card">
              <CardContent className="p-8">
                <div className="text-center">
                  <h3 className="text-2xl font-semibold mb-6 text-foreground">Need Help?</h3>
                  <div className="space-y-3 text-foreground">
                    <p>Call us to order spare parts or get assistance:</p>
                    <p className="text-lg font-semibold text-primary">
                      +91-8884944288, +91-9886944288
                    </p>
                    <p>Email: info@hydrogenro.com</p>
                    <p className="text-sm text-muted-foreground">
                      Available: 24/7 Emergency Service
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default SpareParts;

