import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Phone, Clock, Shield } from 'lucide-react';
import { bengaluruAreas, uniquePincodes } from '@/data/bengaluru-areas';

const PincodeServiceSection = () => {
  const popularPincodes = [
    { pincode: '560066', area: 'Whitefield', services: ['RO Installation', 'RO Repair', 'Filter Replacement'] },
    { pincode: '560034', area: 'Koramangala', services: ['RO Installation', 'RO Repair', 'Water Softener'] },
    { pincode: '560102', area: 'HSR Layout', services: ['RO Installation', 'RO Repair', 'Maintenance'] },
    { pincode: '560100', area: 'Electronic City', services: ['RO Installation', 'RO Repair', 'Filter Replacement'] },
    { pincode: '560038', area: 'Indiranagar', services: ['RO Installation', 'RO Repair', 'Water Softener'] },
    { pincode: '560037', area: 'Marathahalli', services: ['RO Installation', 'RO Repair', 'Maintenance'] },
    { pincode: '560076', area: 'BTM Layout', services: ['RO Installation', 'RO Repair', 'Filter Replacement'] },
    { pincode: '560011', area: 'Jayanagar', services: ['RO Installation', 'RO Repair', 'Water Softener'] },
    { pincode: '560003', area: 'Malleshwaram', services: ['RO Installation', 'RO Repair', 'Maintenance'] },
    { pincode: '560010', area: 'Rajajinagar', services: ['RO Installation', 'RO Repair', 'Filter Replacement'] },
  ];

  return (
    <section id="pincode-services" className="py-8 px-2 md:px-12 bg-background">
      <div className="max-w-7xl mx-auto">


        {/* Popular Pincodes - Hidden from users but available for SEO */}
        <div className="seo-hidden">
          <h3>RO Service by Pincode - Bengaluru</h3>
          <p>Find RO water purifier services in your specific area. We provide comprehensive RO installation, repair, and maintenance services across all pincodes in Bengaluru, Karnataka.</p>
          
          <h4>Popular RO Service Areas in Bengaluru</h4>
          <p>Whitefield RO Service 560066, Koramangala RO Service 560034, HSR Layout RO Service 560102, Electronic City RO Service 560100, Indiranagar RO Service 560038, Marathahalli RO Service 560037, BTM Layout RO Service 560076, Jayanagar RO Service 560011, Malleshwaram RO Service 560003, Rajajinagar RO Service 560010</p>
          
          {popularPincodes.map((location, index) => (
            <div key={index}>
              <h4>{location.area} - {location.pincode}</h4>
              <p>RO Installation, RO Repair, {location.services.join(', ')}</p>
              <p>Same-day service available. Certified technicians.</p>
              <p>Book RO Service for {location.area} pincode {location.pincode}</p>
            </div>
          ))}
          
          <h4>Complete RO Service Coverage by Pincode</h4>
          <p>RO Water Purifier Service 560001: MG Road RO Service, Brigade Road RO Service, Cubbon Park RO Service, Vidhana Soudha RO Service, Cantonment RO Service, Shivajinagar RO Service</p>
          <p>RO Water Purifier Service 560002: KR Market RO Service, Avenue Road RO Service, Kalasipalyam RO Service</p>
          <p>RO Water Purifier Service 560003: Malleshwaram RO Service</p>
          <p>RO Water Purifier Service 560004: Basavanagudi RO Service</p>
          <p>RO Water Purifier Service 560005: Richards Town RO Service, Frazer Town RO Service, Cox Town RO Service, Cooke Town RO Service</p>
          <p>RO Water Purifier Service 560008: Commercial Street RO Service, Ulsoor RO Service</p>
          <p>RO Water Purifier Service 560009: Gandhi Nagar RO Service</p>
          <p>RO Water Purifier Service 560010: Rajajinagar RO Service</p>
          <p>RO Water Purifier Service 560011: Jayanagar RO Service</p>
          <p>RO Water Purifier Service 560016: Ramamurthy Nagar RO Service</p>
          <p>RO Water Purifier Service 560018: Chamrajpet RO Service</p>
          <p>RO Water Purifier Service 560020: Seshadripuram RO Service</p>
          <p>RO Water Purifier Service 560022: Yeshwanthpur RO Service, Tumkur Road RO Service</p>
          <p>RO Water Purifier Service 560023: Majestic RO Service, City Railway Station RO Service, Magadi Road RO Service</p>
          <p>RO Water Purifier Service 560024: Hebbal RO Service, Kempapura RO Service</p>
          <p>RO Water Purifier Service 560025: Richmond Town RO Service</p>
          <p>RO Water Purifier Service 560026: Mysore Road RO Service</p>
          <p>RO Water Purifier Service 560027: Sampangiram Nagar RO Service</p>
          <p>RO Water Purifier Service 560030: Adugodi RO Service, Wilson Garden RO Service</p>
          <p>RO Water Purifier Service 560032: RT Nagar RO Service, Ganganagar RO Service</p>
          <p>RO Water Purifier Service 560034: Koramangala RO Service</p>
          <p>RO Water Purifier Service 560036: KR Puram RO Service</p>
          <p>RO Water Purifier Service 560037: Marathahalli RO Service, Kundalahalli RO Service, Brookefield RO Service</p>
          <p>RO Water Purifier Service 560038: Indiranagar RO Service</p>
          <p>RO Water Purifier Service 560040: Vijayanagar RO Service</p>
          <p>RO Water Purifier Service 560043: Banaswadi RO Service, Kasturi Nagar RO Service, Hennur RO Service</p>
          <p>RO Water Purifier Service 560045: Nagawara RO Service</p>
          <p>RO Water Purifier Service 560048: Hoodi RO Service</p>
          <p>RO Water Purifier Service 560053: Chickpet RO Service</p>
          <p>RO Water Purifier Service 560058: Peenya RO Service</p>
          <p>RO Water Purifier Service 560060: Kengeri RO Service</p>
          <p>RO Water Purifier Service 560061: Uttarahalli RO Service</p>
          <p>RO Water Purifier Service 560062: Kanakapura Road RO Service</p>
          <p>RO Water Purifier Service 560064: Yelahanka RO Service, Kogilu RO Service, Chikkaballapur Road RO Service, Doddaballapur Road RO Service, Bagalur RO Service</p>
          <p>RO Water Purifier Service 560066: Whitefield RO Service</p>
          <p>RO Water Purifier Service 560067: Kadugodi RO Service</p>
          <p>RO Water Purifier Service 560068: Bommanahalli RO Service, Silk Board RO Service, Madiwala RO Service</p>
          <p>RO Water Purifier Service 560070: Banashankari RO Service</p>
          <p>RO Water Purifier Service 560071: Domlur RO Service</p>
          <p>RO Water Purifier Service 560072: Nagarbhavi RO Service</p>
          <p>RO Water Purifier Service 560075: Kaggadasapura RO Service, Jeevan Bima Nagar RO Service</p>
          <p>RO Water Purifier Service 560076: BTM Layout RO Service, Bannerghatta Road RO Service</p>
          <p>RO Water Purifier Service 560077: Thanisandra RO Service</p>
          <p>RO Water Purifier Service 560078: JP Nagar RO Service</p>
          <p>RO Water Purifier Service 560079: Basaveshwaranagar RO Service</p>
          <p>RO Water Purifier Service 560081: Chandapura RO Service</p>
          <p>RO Water Purifier Service 560087: Varthur RO Service</p>
          <p>RO Water Purifier Service 560092: Sahakar Nagar RO Service, Kodigehalli RO Service</p>
          <p>RO Water Purifier Service 560093: CV Raman Nagar RO Service</p>
          <p>RO Water Purifier Service 560094: Sanjay Nagar RO Service</p>
          <p>RO Water Purifier Service 560098: RR Nagar RO Service, Rajarajeshwari Nagar RO Service</p>
          <p>RO Water Purifier Service 560100: Electronic City RO Service, Hosur Road RO Service</p>
          <p>RO Water Purifier Service 560102: HSR Layout RO Service</p>
          <p>RO Water Purifier Service 560103: Bellandur RO Service, Kadubeesanahalli RO Service, Panathur RO Service, Kadabagere RO Service, Devarabeesanahalli RO Service, Avalahalli RO Service, Kodathi RO Service</p>
          <p>RO Water Purifier Service 562106: Anekal RO Service</p>
          <p>RO Water Purifier Service 562109: Bidadi RO Service</p>
          <p>RO Water Purifier Service 562120: Magadi RO Service</p>
          <p>RO Water Purifier Service 562123: Nelamangala RO Service</p>
          <p>RO Water Purifier Service 562125: Sarjapur RO Service</p>
          <p>RO Water Purifier Service 562159: Ramanagara RO Service</p>
          <p>RO Water Purifier Service 562160: Channapatna RO Service</p>
          <p>RO Water Purifier Service 562117: Kanakapura RO Service</p>
          <p>RO Water Purifier Service 635109: Hosur RO Service</p>
          <p>RO Water Purifier Service 563101: Kolar RO Service, Kolar City RO Service</p>
          <p>RO Water Purifier Service 563115: Kolar Gold Fields RO Service, KGF RO Service</p>
          <p>RO Water Purifier Service 563114: Bangarapet RO Service, Budikote RO Service</p>
          <p>RO Water Purifier Service 563131: Mulbagal RO Service, Virupakshi RO Service</p>
          <p>RO Water Purifier Service 563130: Malur RO Service, Doddakallahalli RO Service</p>
          <p>RO Water Purifier Service 563135: Srinivaspur RO Service, Gattahalli RO Service</p>
        </div>

        {/* All Pincodes Coverage - Hidden from users but available for SEO */}
        <div className="seo-hidden">
          <h3>Complete Pincode Coverage - Bengaluru RO Services</h3>
          <p>We provide RO water purifier services to all pincodes in Bengaluru, Karnataka</p>
          
          {Array.from({ length: 110 }, (_, i) => {
            const pincode = String(560001 + i).padStart(6, '0');
            return (
              <div key={pincode}>
                <p>RO Service available in pincode {pincode} Bengaluru</p>
                <p>RO water purifier installation and repair services in {pincode}</p>
              </div>
            );
          })}
        </div>

        {/* Service Features by Pincode - Hidden from users but available for SEO */}
        <div className="seo-hidden">
          <h3>All Pincodes Covered</h3>
          <p>Complete coverage from 560001 to 560110 across all areas of Bengaluru, Karnataka</p>
          
          <h3>Same-Day Service</h3>
          <p>Quick response time with same-day RO installation and repair services across all pincodes</p>
          
          <h3>Certified Technicians</h3>
          <p>Professional and certified RO technicians available in all areas of Bengaluru</p>
          
          <h4>RO Service Features by Area</h4>
          <p>Whitefield RO Installation: Professional RO water purifier installation in Whitefield, same-day service, certified technicians, genuine spare parts</p>
          <p>Koramangala RO Repair: Expert RO repair services in Koramangala, troubleshooting, maintenance, filter replacement, water quality testing</p>
          <p>HSR Layout RO Maintenance: Comprehensive RO maintenance in HSR Layout, preventive care, performance optimization, warranty service</p>
          <p>Electronic City RO Service: Complete RO services in Electronic City, installation, repair, maintenance, emergency support</p>
          <p>Indiranagar RO Installation: Professional RO installation in Indiranagar, quality components, user training, free maintenance</p>
          <p>Marathahalli RO Repair: Expert RO repair in Marathahalli, same-day service, genuine parts, warranty coverage</p>
          <p>BTM Layout RO Maintenance: Regular RO maintenance in BTM Layout, preventive care, performance check, filter replacement</p>
          <p>Jayanagar RO Service: Complete RO services in Jayanagar, installation, repair, maintenance, emergency support</p>
          <p>Malleshwaram RO Installation: Professional RO installation in Malleshwaram, certified technicians, quality service</p>
          <p>Rajajinagar RO Repair: Expert RO repair in Rajajinagar, troubleshooting, maintenance, genuine spare parts</p>
          
          <h4>RO Service Benefits by Zone</h4>
          <p>Central Bengaluru RO Service Benefits: Quick response time, certified technicians, genuine spare parts, warranty coverage, emergency support</p>
          <p>East Bengaluru RO Service Benefits: Same-day service, professional installation, expert repair, maintenance packages, 24/7 support</p>
          <p>South Bengaluru RO Service Benefits: Quality components, user training, free maintenance, performance optimization, water testing</p>
          <p>West Bengaluru RO Service Benefits: Certified technicians, genuine parts, warranty service, emergency repair, preventive maintenance</p>
          <p>North Bengaluru RO Service Benefits: Professional service, same-day repair, quality installation, maintenance plans, customer support</p>
          <p>Southeast Bengaluru RO Service Benefits: Expert technicians, genuine spare parts, warranty coverage, emergency service, quality assurance</p>
          <p>Southwest Bengaluru RO Service Benefits: Professional installation, expert repair, maintenance packages, 24/7 support, customer satisfaction</p>
          <p>Northeast Bengaluru RO Service Benefits: Certified service, genuine parts, warranty coverage, emergency support, quality components</p>
          <p>Northwest Bengaluru RO Service Benefits: Professional technicians, same-day service, quality repair, maintenance plans, customer care</p>
          <p>Kolar District RO Service Benefits: Comprehensive coverage, certified technicians, genuine spare parts, quick response, competitive pricing</p>
        </div>

        {/* Call to Action - Hidden from users but available for SEO */}
        <div className="seo-hidden">
          <h3>Need RO Service in Your Pincode?</h3>
          <p>Call us now to confirm RO service availability in your specific pincode. We serve all areas of Bengaluru with professional RO installation and repair services.</p>
          <p>Call: +91-8884944288</p>
          <p>Check My Pincode</p>
        </div>
      </div>
    </section>
  );
};

export default PincodeServiceSection;
