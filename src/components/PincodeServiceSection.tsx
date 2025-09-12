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
    <section id="pincode-services" className="py-8 px-6 md:px-12 bg-background">
      <div className="max-w-7xl mx-auto">


        {/* Popular Pincodes - Hidden from users but available for SEO */}
        <div className="seo-hidden">
          <h3>RO Service by Pincode - Bengaluru</h3>
          <p>Find RO water purifier services in your specific area. We provide comprehensive RO installation, repair, and maintenance services across all pincodes in Bengaluru, Karnataka.</p>
          
          {popularPincodes.map((location, index) => (
            <div key={index}>
              <h4>{location.area} - {location.pincode}</h4>
              <p>RO Installation, RO Repair, {location.services.join(', ')}</p>
              <p>Same-day service available. Certified technicians.</p>
              <p>Book RO Service for {location.area} pincode {location.pincode}</p>
            </div>
          ))}
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
        </div>

        {/* Call to Action - Hidden from users but available for SEO */}
        <div className="seo-hidden">
          <h3>Need RO Service in Your Pincode?</h3>
          <p>Call us now to confirm RO service availability in your specific pincode. We serve all areas of Bengaluru with professional RO installation and repair services.</p>
          <p>Call: +91-9876543210</p>
          <p>Check My Pincode</p>
        </div>
      </div>
    </section>
  );
};

export default PincodeServiceSection;
