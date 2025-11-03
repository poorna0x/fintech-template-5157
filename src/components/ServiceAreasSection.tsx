import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MapPin, Search, Phone } from 'lucide-react';
import { bengaluruAreas, uniquePincodes, getAreasByZone, zones } from '@/data/bengaluru-areas';

const ServiceAreasSection = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedZone, setSelectedZone] = useState<string>('All');

  const filteredAreas = bengaluruAreas.filter(area => {
    const matchesSearch = area.area.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         area.pincode.includes(searchTerm);
    const matchesZone = selectedZone === 'All' || area.zone === selectedZone;
    return matchesSearch && matchesZone;
  });

  const groupedAreas = filteredAreas.reduce((acc, area) => {
    if (!acc[area.zone]) {
      acc[area.zone] = [];
    }
    acc[area.zone].push(area);
    return acc;
  }, {} as Record<string, typeof bengaluruAreas>);

  return (
    <section id="service-areas" className="py-8 px-2 md:px-12 bg-muted/30">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            RO Service Areas in Bengaluru - All Pincodes Covered
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            We provide comprehensive RO water purifier services across all areas of Bengaluru, Karnataka. 
            Find your area and pincode below for instant RO service booking.
          </p>
        </div>

        {/* Search and Filter - Hidden from users but available for SEO */}
        <div className="seo-hidden">
          <h3>RO Service Areas in Bengaluru - All Pincodes Covered</h3>
          <p>We provide comprehensive RO water purifier services across all areas of Bengaluru, Karnataka. Find your area and pincode below for instant RO service booking.</p>
          
          <h4>Search by area name or pincode</h4>
          <p>All Zones: Central, East, South, West, North, Southeast, Southwest, Northeast, Northwest, Kolar</p>
          
          <h4>Popular RO Service Areas in Bengaluru</h4>
          <p>Whitefield RO Service, Koramangala RO Service, HSR Layout RO Service, Electronic City RO Service, Indiranagar RO Service, Marathahalli RO Service, BTM Layout RO Service, Jayanagar RO Service, Malleshwaram RO Service, Rajajinagar RO Service</p>
          
          <h4>RO Water Purifier Service by Zone</h4>
          <p>Central Bengaluru RO Service: MG Road, Brigade Road, Commercial Street, Cubbon Park, Vidhana Soudha, Cantonment, Richmond Town, Shivajinagar, Ulsoor, Domlur</p>
          <p>East Bengaluru RO Service: Whitefield, Marathahalli, Kundalahalli, Brookefield, Kadugodi, Hoodi, KR Puram, Banaswadi, Ramamurthy Nagar, Kasturi Nagar</p>
          <p>South Bengaluru RO Service: Koramangala, HSR Layout, Electronic City, Indiranagar, Jayanagar, JP Nagar, Banashankari, Basavanagudi, BTM Layout, Bommanahalli</p>
          <p>West Bengaluru RO Service: Malleshwaram, Rajajinagar, Vijayanagar, Basaveshwaranagar, Nagarbhavi, Kengeri, RR Nagar, Uttarahalli, Chamrajpet, Chickpet</p>
          <p>North Bengaluru RO Service: Hebbal, Yelahanka, Sahakar Nagar, RT Nagar, Sanjay Nagar, Ganganagar, Nagawara, Hennur, Kodigehalli, Thanisandra</p>
          <p>Southeast Bengaluru RO Service: Sarjapur, Bellandur, Varthur, Kadubeesanahalli, Panathur, Kadabagere, Devarabeesanahalli, Avalahalli, Kodathi, Chandapura</p>
          <p>Southwest Bengaluru RO Service: Uttarahalli, Kengeri, Rajarajeshwari Nagar, Vijayanagar, Basaveshwaranagar, Nagarbhavi, Bidadi, Ramanagara, Magadi, Nelamangala, Channapatna, Kanakapura</p>
          <p>Northeast Bengaluru RO Service: Hennur, Kodigehalli, Thanisandra, Nagawara, Hennur Road, Kogilu, Bagalur, Kempapura, Chikkaballapur, Doddaballapur</p>
          <p>Northwest Bengaluru RO Service: Peenya, Yeshwanthpur, Tumkur Road, Nelamangala, Doddaballapur Road, Magadi Road, Mysore Road, Hosur Road, Bannerghatta Road, Kanakapura Road</p>
          <p>Kolar District RO Service: Kolar, Kolar City, Kolar Gold Fields, KGF, Bangarapet, Budikote, Mulbagal, Virupakshi, Malur, Doddakallahalli, Srinivaspur, Gattahalli</p>
          
          <h4>RO Service by Pincode in Bengaluru</h4>
          <p>560001 RO Service: MG Road, Brigade Road, Cubbon Park, Vidhana Soudha, Cantonment, Shivajinagar</p>
          <p>560002 RO Service: KR Market, Avenue Road, Kalasipalyam</p>
          <p>560003 RO Service: Malleshwaram</p>
          <p>560004 RO Service: Basavanagudi</p>
          <p>560005 RO Service: Richards Town, Frazer Town, Cox Town, Cooke Town</p>
          <p>560008 RO Service: Commercial Street, Ulsoor</p>
          <p>560009 RO Service: Gandhi Nagar</p>
          <p>560010 RO Service: Rajajinagar</p>
          <p>560011 RO Service: Jayanagar</p>
          <p>560016 RO Service: Ramamurthy Nagar</p>
          <p>560018 RO Service: Chamrajpet</p>
          <p>560020 RO Service: Seshadripuram</p>
          <p>560022 RO Service: Yeshwanthpur, Tumkur Road</p>
          <p>560023 RO Service: Majestic, City Railway Station, Magadi Road</p>
          <p>560024 RO Service: Hebbal, Kempapura</p>
          <p>560025 RO Service: Richmond Town</p>
          <p>560026 RO Service: Mysore Road</p>
          <p>560027 RO Service: Sampangiram Nagar</p>
          <p>560030 RO Service: Adugodi, Wilson Garden</p>
          <p>560032 RO Service: RT Nagar, Ganganagar</p>
          <p>560034 RO Service: Koramangala</p>
          <p>560036 RO Service: KR Puram</p>
          <p>560037 RO Service: Marathahalli, Kundalahalli, Brookefield</p>
          <p>560038 RO Service: Indiranagar</p>
          <p>560040 RO Service: Vijayanagar</p>
          <p>560043 RO Service: Banaswadi, Kasturi Nagar, Hennur</p>
          <p>560045 RO Service: Nagawara</p>
          <p>560048 RO Service: Hoodi</p>
          <p>560053 RO Service: Chickpet</p>
          <p>560058 RO Service: Peenya</p>
          <p>560060 RO Service: Kengeri</p>
          <p>560061 RO Service: Uttarahalli</p>
          <p>560062 RO Service: Kanakapura Road</p>
          <p>560064 RO Service: Yelahanka, Kogilu, Chikkaballapur Road, Doddaballapur Road, Bagalur</p>
          <p>560066 RO Service: Whitefield</p>
          <p>560067 RO Service: Kadugodi</p>
          <p>560068 RO Service: Bommanahalli, Silk Board, Madiwala</p>
          <p>560070 RO Service: Banashankari</p>
          <p>560071 RO Service: Domlur</p>
          <p>560072 RO Service: Nagarbhavi</p>
          <p>560075 RO Service: Kaggadasapura, Jeevan Bima Nagar</p>
          <p>560076 RO Service: BTM Layout, Bannerghatta Road</p>
          <p>560077 RO Service: Thanisandra</p>
          <p>560078 RO Service: JP Nagar</p>
          <p>560079 RO Service: Basaveshwaranagar</p>
          <p>560081 RO Service: Chandapura</p>
          <p>560087 RO Service: Varthur</p>
          <p>560092 RO Service: Sahakar Nagar, Kodigehalli</p>
          <p>560093 RO Service: CV Raman Nagar</p>
          <p>560094 RO Service: Sanjay Nagar</p>
          <p>560098 RO Service: RR Nagar, Rajarajeshwari Nagar</p>
          <p>560100 RO Service: Electronic City, Hosur Road</p>
          <p>560102 RO Service: HSR Layout</p>
          <p>560103 RO Service: Bellandur, Kadubeesanahalli, Panathur, Kadabagere, Devarabeesanahalli, Avalahalli, Kodathi</p>
          <p>562106 RO Service: Anekal</p>
          <p>562109 RO Service: Bidadi</p>
          <p>562120 RO Service: Magadi</p>
          <p>562123 RO Service: Nelamangala</p>
          <p>562125 RO Service: Sarjapur</p>
          <p>562159 RO Service: Ramanagara</p>
          <p>562160 RO Service: Channapatna</p>
          <p>562117 RO Service: Kanakapura</p>
          <p>635109 RO Service: Hosur</p>
          <p>563101 RO Service: Kolar, Kolar City</p>
          <p>563115 RO Service: Kolar Gold Fields, KGF</p>
          <p>563114 RO Service: Bangarapet, Budikote</p>
          <p>563131 RO Service: Mulbagal, Virupakshi</p>
          <p>563130 RO Service: Malur, Doddakallahalli</p>
          <p>563135 RO Service: Srinivaspur, Gattahalli</p>
        </div>

        {/* Quick Stats - Visible to users */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <Card className="text-center">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-primary">{bengaluruAreas.length}</div>
              <div className="text-sm text-muted-foreground">Areas Covered</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-primary">{uniquePincodes.length}</div>
              <div className="text-sm text-muted-foreground">Pincodes Served</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-primary">24/7</div>
              <div className="text-sm text-muted-foreground">Emergency Service</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-primary">100%</div>
              <div className="text-sm text-muted-foreground">Bengaluru Coverage</div>
            </CardContent>
          </Card>
        </div>

        {/* SEO Content - Hidden from users but available for SEO */}
        <div className="seo-hidden">
          <h3>RO Service Coverage Statistics</h3>
          <p>{bengaluruAreas.length} Areas Covered</p>
          <p>{uniquePincodes.length} Pincodes Served</p>
          <p>{zones.length} Zones Covered</p>
          <p>24/7 Emergency Service</p>
        </div>

        {/* Areas by Zone - Hidden from users but available for SEO */}
        <div className="seo-hidden">
          {Object.entries(groupedAreas).map(([zone, areas]) => (
            <div key={zone}>
              <h3>{zone} Bengaluru - RO Service Areas</h3>
              <p>Complete RO water purifier services in {zone.toLowerCase()} Bengaluru</p>
              
              {areas.map((area, index) => (
                <div key={index}>
                  <h4>{area.area} - Pincode: {area.pincode}</h4>
                  <p>RO Service available in {area.area} pincode {area.pincode} {zone} Bengaluru</p>
                  <p>RO water purifier installation and repair services in {area.area}</p>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Popular Areas Highlight - Hidden from users but available for SEO */}
        <div className="seo-hidden">
          <h3>Popular RO Service Areas in Bengaluru</h3>
          <p>Most requested areas for RO water purifier installation and repair services</p>
          
          {['Whitefield', 'Koramangala', 'HSR Layout', 'Electronic City', 'Indiranagar', 
            'Marathahalli', 'BTM Layout', 'Jayanagar', 'Malleshwaram', 'Rajajinagar'].map(area => (
            <div key={area}>
              <h4>{area} RO Service Available</h4>
              <p>RO water purifier installation and repair services in {area} Bengaluru</p>
              <p>Popular RO service area {area} with same-day service available</p>
            </div>
          ))}
        </div>

        {/* Comprehensive SEO Content - All Areas and Pincodes */}
        <div className="seo-hidden">
          <h2>Complete RO Service Coverage - All Bengaluru Areas and Pincodes</h2>
          <p>We provide RO water purifier services to all areas of Bengaluru, Karnataka. Complete coverage across all pincodes from 560001 to 560110.</p>
          
          {bengaluruAreas.map((area, index) => (
            <div key={index}>
              <h3>RO Service in {area.area} - Pincode {area.pincode}</h3>
              <p>RO water purifier installation and repair services in {area.area} pincode {area.pincode} {area.zone} Bengaluru</p>
              <p>Professional RO technicians available in {area.area} for same-day service</p>
              <p>RO installation, repair, maintenance, and filter replacement in {area.area}</p>
              <p>Book RO service for {area.area} pincode {area.pincode} Bengaluru</p>
            </div>
          ))}
          
          <h2>RO Service by Pincode - Complete List</h2>
          {uniquePincodes.map(pincode => (
            <div key={pincode}>
              <h3>RO Service in Pincode {pincode} Bengaluru</h3>
              <p>RO water purifier services available in pincode {pincode} Bengaluru, Karnataka</p>
              <p>RO installation, repair, and maintenance services in {pincode}</p>
              <p>Same-day RO service available in pincode {pincode}</p>
            </div>
          ))}
        </div>

        {/* Call to Action - Hidden from users but available for SEO */}
        <div className="seo-hidden">
          <h3>Don't See Your Area? We Still Serve You!</h3>
          <p>We provide RO water purifier services to all areas of Bengaluru, Karnataka. If your area is not listed above, call us and we'll confirm service availability.</p>
          <p>Call: +91-8884944288</p>
          <p>Check Service Availability</p>
        </div>
      </div>
    </section>
  );
};

export default ServiceAreasSection;
