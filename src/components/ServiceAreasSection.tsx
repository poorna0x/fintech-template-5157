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
    <section id="service-areas" className="py-8 px-6 md:px-12 bg-muted/30">
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
          <p>All Zones: Central, East, South, West, North, Southeast, Southwest, Northeast, Northwest</p>
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
          <p>Call: +91-9876543210</p>
          <p>Check Service Availability</p>
        </div>
      </div>
    </section>
  );
};

export default ServiceAreasSection;
