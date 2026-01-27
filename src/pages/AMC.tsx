import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Download, FileText, User, Phone, MapPin, Building, Droplets, Eye, ArrowLeft } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Logo from '@/components/Logo';
import { useNavigate } from 'react-router-dom';

interface AMCFormData {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  productName: string;
  agreementPeriodFrom: string;
  agreementPeriodTo: string;
  agreementAmount: string;
  dateOfAgreement: string;
  gstNumber: string;
  additionalNotes: string;
}

const AMC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<AMCFormData>({
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    productName: 'Kent RO',
    agreementPeriodFrom: '',
    agreementPeriodTo: '',
    agreementAmount: '14000',
    dateOfAgreement: new Date().toISOString().split('T')[0],
    gstNumber: '29LIJPS5140P1Z6',
    additionalNotes: ''
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleInputChange = (field: keyof AMCFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const calculateEndDate = (startDate: string, years: number = 2) => {
    if (!startDate) return '';
    const start = new Date(startDate);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + years);
    return end.toISOString().split('T')[0];
  };

  const handleStartDateChange = (date: string) => {
    setFormData(prev => ({
      ...prev,
      agreementPeriodFrom: date,
      agreementPeriodTo: calculateEndDate(date, 2)
    }));
  };

  const generatePDF = async () => {
    setIsGenerating(true);
    
    try {
      // Method 1: Try html2canvas approach
      try {
        const element = document.getElementById('amc-document');
        if (!element) {
          throw new Error('Document element not found');
        }

        // Show the document temporarily for capture
        element.style.display = 'block';
        element.style.position = 'absolute';
        element.style.left = '-9999px';
        element.style.top = '0';

        const canvas = await html2canvas(element, {
          scale: 1.5,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          width: element.scrollWidth,
          height: element.scrollHeight
        });

        // Hide the document again
        element.style.display = 'none';
        element.style.position = 'static';
        element.style.left = 'auto';
        element.style.top = 'auto';

        // Convert canvas to image data URL
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        
        // Create PDF
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 295; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        let heightLeft = imgHeight;
        let position = 0;

        // Add first page
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        // Add additional pages if needed
        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        const fileName = `AMC_Agreement_${formData.customerName.replace(/\s+/g, '_')}_${formData.dateOfAgreement}.pdf`;
        pdf.save(fileName);
        return;
      } catch (html2canvasError) {
        console.log('html2canvas failed, trying alternative method:', html2canvasError);
      }

      // Method 2: Direct PDF generation without html2canvas
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // Set font
      pdf.setFont('helvetica');
      
      // Header with Hydrogen RO Branding
      pdf.setFontSize(24);
      pdf.setTextColor(37, 99, 235); // Blue color
      pdf.text('Hydrogen RO', 105, 20, { align: 'center' });
      
      pdf.setFontSize(8);
      pdf.setTextColor(107, 114, 128); // Gray color
      pdf.text('Water Purification Solutions', 105, 26, { align: 'center' });
      
      pdf.setFontSize(18);
      pdf.setTextColor(0, 0, 0); // Black color
      pdf.text('AMC AGREEMENT', 105, 35, { align: 'center' });
      
      pdf.setFontSize(10);
      pdf.text('Authorized for Service by RO Care India', 105, 50, { align: 'center' });
      pdf.text('Ground Floor, 13, 4th Main Road, Next To Jain Temple, Seshadripuram, Kumara Park West', 105, 55, { align: 'center' });
      pdf.text('Bengaluru, Bengaluru Urban, Karnataka, 560020', 105, 60, { align: 'center' });
      pdf.text('Phone: 9886944288 & 8884944288 | Email: mail@hydrogenro.com', 105, 65, { align: 'center' });
      pdf.text('Website: hydrogenro.com | GST No: 29LIJPS5140P1Z6', 105, 70, { align: 'center' });
      
      // Line separator
      pdf.line(20, 60, 190, 60);
      
      // Agreement content
      let yPosition = 70;
      pdf.setFontSize(12);
      pdf.text(`We Hydrogen RO, Authorized for Service by RO Care India, undertake to maintain your ${formData.productName} Unit as detailed below:`, 20, yPosition);
      
      yPosition += 15;
      pdf.setFontSize(11);
      pdf.text('SERVICES COVERED BY THE AGREEMENT ARE AS FOLLOWS:', 20, yPosition);
      
      yPosition += 10;
      pdf.setFontSize(10);
      const services = [
        'Breakdown Support: If any breakdown or problem happens with the RO during this 1-year period, the company will provide service without extra charges.',
        'Filters / RO Membrane / Consumables / Electricals / Motor: Company will clean, repair, or replace filters and parts needed for smooth working.',
        'Safe RO output: Water quality TDS between 50 to 150, as per WHO guidelines or as per customer preference.',
        'Clean cosmetics and smooth working of the machine.',
        'Quick service: Any breakdown will be resolved within 24 hours.',
        'Full Care of RO: The company takes responsibility for complete maintenance and support for 1 year, including Pre Sediment Filtration (with terms & conditions).'
      ];
      
      services.forEach(service => {
        const lines = pdf.splitTextToSize(service, 170);
        lines.forEach((line: string) => {
          pdf.text(line, 20, yPosition);
          yPosition += 5;
        });
        yPosition += 3;
      });
      
      // Terms and Conditions
      yPosition += 10;
      pdf.setFontSize(11);
      pdf.text('⚖️ TERMS AND CONDITIONS', 20, yPosition);
      
      yPosition += 10;
      pdf.setFontSize(9);
      const terms = [
        'No Early Termination: You cannot cancel this agreement before expiry. It also cannot be transferred to another person if you sell/gift the machine.',
        'Extra Charges: If service is outside municipal limits, extra charges for travel/stay will apply.',
        'Disputes: Any legal disputes will be handled only in Bangalore courts.',
        'Renewal: After expiry, renewal requires a new agreement.',
        'Customer\'s Duty: The customer must make the RO available for servicing when the company\'s authorized representative visits.',
        'If the customer fails to give the machine for servicing, it will still be treated as service given, and no refund will be made.',
        'Agreement Modification: Cannot be changed unless written and signed by both parties.',
        'Not Covered: Display and lights of the RO are not covered under this AMC.'
      ];
      
      terms.forEach(term => {
        const lines = pdf.splitTextToSize(term, 170);
        lines.forEach((line: string) => {
          pdf.text(line, 20, yPosition);
          yPosition += 4;
        });
        yPosition += 2;
      });

      // Summary Section
      yPosition += 10;
      pdf.setFontSize(11);
      pdf.text('🔍 Summary in Simple Words', 20, yPosition);
      
      yPosition += 10;
      pdf.setFontSize(9);
      const summary = [
        `You (the customer) paid ₹${formData.agreementAmount} for 1-year full AMC service of your ${formData.productName}.`,
        'All repairs, filters, and breakdown services are included, with a guarantee of 24-hour resolution.',
        'The service covers water quality maintenance (50–150 TDS) and overall machine health.',
        'Extra travel charges apply if your location is outside the municipal area.',
        'You can\'t cancel/transfer this AMC until it expires.',
        'Legal disputes go to Bangalore court.',
        'The AMC does not cover display and lights of the RO.'
      ];
      
      summary.forEach(item => {
        const lines = pdf.splitTextToSize(item, 170);
        lines.forEach((line: string) => {
          pdf.text(line, 20, yPosition);
          yPosition += 4;
        });
        yPosition += 2;
      });
      
      // Agreement Details
      yPosition += 10;
      pdf.setFontSize(11);
      pdf.text('AGREEMENT DETAILS', 20, yPosition);
      
      yPosition += 10;
      pdf.setFontSize(10);
      const details = [
        `Product Name: ${formData.productName}`,
        `Agreement Period From: ${formData.agreementPeriodFrom}`,
        `Agreement Period To: ${formData.agreementPeriodTo}`,
        `Agreement Amount: ₹${formData.agreementAmount} (All Taxes Inclusive)`,
        `Date of Agreement: ${formData.dateOfAgreement}`,
        `Customer Name: ${formData.customerName}, ${formData.customerPhone}`,
        `Customer Address: ${formData.customerAddress}`
      ];
      
      details.forEach(detail => {
        pdf.text(detail, 20, yPosition);
        yPosition += 6;
      });
      
      // Signatures
      yPosition += 20;
      pdf.setFontSize(10);
      pdf.text('Customer Signature', 20, yPosition);
      pdf.text('Authorized Signatory', 120, yPosition);
      
      yPosition += 20;
      pdf.line(20, yPosition, 80, yPosition);
      pdf.line(120, yPosition, 180, yPosition);
      
      yPosition += 10;
      pdf.setFontSize(8);
      pdf.text('Date: _______________', 20, yPosition);
      pdf.text('Date: _______________', 120, yPosition);
      
      const fileName = `AMC_Agreement_${formData.customerName.replace(/\s+/g, '_')}_${formData.dateOfAgreement}.pdf`;
      pdf.save(fileName);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header - Same as normal pages */}
      <div className="sticky top-0 z-50 pt-8 px-4 bg-background/95 backdrop-blur-md border-b border-border/50">
        <header className="w-full max-w-7xl mx-auto py-3 px-6 md:px-8 flex items-center justify-between">
          <div className="p-3">
            <Logo />
          </div>
          
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setShowPreview(!showPreview)}
              variant="outline"
              className="flex items-center gap-2 bg-card/80 backdrop-blur-sm border border-border/50"
            >
              <Eye className="w-4 h-4" />
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </Button>
            <Button
              onClick={() => navigate('/')}
              variant="outline"
              className="flex items-center gap-2 bg-card/80 backdrop-blur-sm border border-border/50"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </div>
        </header>
      </div>

      <main className="flex-1 py-12">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h1 className="text-3xl font-light text-foreground mb-3">
              AMC Agreement
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Generate professional maintenance contracts
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Form Section */}
          <div>
            <Card className="border-0 shadow-none bg-transparent">
              <CardHeader className="pb-6">
                <CardTitle className="text-xl font-medium">
                  Customer Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="customerName" className="text-sm text-muted-foreground mb-2 block">Customer Name *</Label>
                    <Input
                      id="customerName"
                      value={formData.customerName}
                      onChange={(e) => handleInputChange('customerName', e.target.value)}
                      placeholder="Enter customer name"
                      className="border-0 border-b border-border rounded-none px-0 py-2 focus:border-primary"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customerPhone" className="text-sm text-muted-foreground mb-2 block">Phone Number *</Label>
                    <Input
                      id="customerPhone"
                      value={formData.customerPhone}
                      onChange={(e) => handleInputChange('customerPhone', e.target.value)}
                      placeholder="Enter phone number"
                      className="border-0 border-b border-border rounded-none px-0 py-2 focus:border-primary"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customerAddress" className="text-sm text-muted-foreground mb-2 block">Address *</Label>
                    <Textarea
                      id="customerAddress"
                      value={formData.customerAddress}
                      onChange={(e) => handleInputChange('customerAddress', e.target.value)}
                      placeholder="Enter complete address"
                      rows={2}
                      className="border-0 border-b border-border rounded-none px-0 py-2 focus:border-primary resize-none"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="productName" className="text-sm text-muted-foreground mb-2 block">Product</Label>
                    <Select value={formData.productName} onValueChange={(value) => handleInputChange('productName', value)}>
                      <SelectTrigger className="border-0 border-b border-border rounded-none px-0 py-2 focus:border-primary">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Kent RO">Kent RO</SelectItem>
                        <SelectItem value="Aquaguard RO">Aquaguard RO</SelectItem>
                        <SelectItem value="Pureit RO">Pureit RO</SelectItem>
                        <SelectItem value="Livpure RO">Livpure RO</SelectItem>
                        <SelectItem value="Blue Star RO">Blue Star RO</SelectItem>
                        <SelectItem value="Whirlpool RO">Whirlpool RO</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="agreementAmount" className="text-sm text-muted-foreground mb-2 block">Amount (₹)</Label>
                    <Input
                      id="agreementAmount"
                      value={formData.agreementAmount}
                      onChange={(e) => handleInputChange('agreementAmount', e.target.value)}
                      placeholder="14000"
                      className="border-0 border-b border-border rounded-none px-0 py-2 focus:border-primary"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="agreementPeriodFrom" className="text-sm text-muted-foreground mb-2 block">Start Date *</Label>
                      <Input
                        id="agreementPeriodFrom"
                        type="date"
                        value={formData.agreementPeriodFrom}
                        onChange={(e) => handleStartDateChange(e.target.value)}
                        className="border-0 border-b border-border rounded-none px-0 py-2 focus:border-primary"
                      />
                    </div>
                    <div>
                      <Label htmlFor="agreementPeriodTo" className="text-sm text-muted-foreground mb-2 block">End Date</Label>
                      <Input
                        id="agreementPeriodTo"
                        type="date"
                        value={formData.agreementPeriodTo}
                        onChange={(e) => handleInputChange('agreementPeriodTo', e.target.value)}
                        readOnly
                        className="border-0 border-b border-border rounded-none px-0 py-2 focus:border-primary"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="additionalNotes" className="text-sm text-muted-foreground mb-2 block">Notes</Label>
                    <Textarea
                      id="additionalNotes"
                      value={formData.additionalNotes}
                      onChange={(e) => handleInputChange('additionalNotes', e.target.value)}
                      placeholder="Additional terms or conditions"
                      rows={2}
                      className="border-0 border-b border-border rounded-none px-0 py-2 focus:border-primary resize-none"
                    />
                  </div>
                </div>

                <Button 
                  onClick={generatePDF} 
                  disabled={isGenerating || !formData.customerName || !formData.customerPhone || !formData.customerAddress}
                  className="w-full mt-8 bg-foreground text-background hover:bg-foreground/90 rounded-none"
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Generate PDF
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Preview Section */}
          <div>
            <Card className="border-0 shadow-none bg-transparent h-fit">
              <CardHeader className="pb-6">
                <CardTitle className="text-xl font-medium">
                  Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                {showPreview ? (
                  <div className="border border-border rounded-lg overflow-hidden">
                    {/* Preview Header */}
                    <div className="bg-foreground text-background p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 bg-background/20 rounded flex items-center justify-center">
                          <Droplets className="w-4 h-4" />
                        </div>
                        <div>
                          <h2 className="text-lg font-medium">Hydrogen RO</h2>
                          <p className="text-sm text-background/70">Water Purification Solutions</p>
                        </div>
                      </div>
                      <h3 className="text-sm font-medium text-background/90">AMC AGREEMENT</h3>
                    </div>

                    {/* Preview Content */}
                    <div className="bg-background">
                      <div className="max-h-96 overflow-y-auto">
                        <div className="p-6 text-sm" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', lineHeight: '1.6' }}>
                          {/* Company Info */}
                          <div className="border-l-4 border-foreground pl-4 mb-6">
                            <p className="text-muted-foreground text-sm mb-2">Authorized for Service by RO Care India</p>
                            <p className="text-muted-foreground text-sm mb-1">Ground Floor, 13, 4th Main Road, Next To Jain Temple, Seshadripuram, Kumara Park West</p>
                            <p className="text-muted-foreground text-sm mb-3">Bengaluru, Bengaluru Urban, Karnataka, 560020</p>
                            <div className="flex gap-6 text-sm">
                              <span className="text-foreground">📞 9886944288 & 8884944288</span>
                              <span className="text-foreground">✉️ mail@hydrogenro.com</span>
                            </div>
                          </div>

                          {/* Agreement Content */}
                          <div className="space-y-6">
                            <p className="text-sm leading-relaxed">
                              We <strong>Hydrogen RO</strong>, Authorized for Service by RO Care India, undertake to maintain your <strong>{formData.productName || 'Kent RO'}</strong> Unit as detailed below:
                            </p>
                            
                            <div className="border-l-2 border-muted-foreground pl-4">
                              <h3 className="font-medium text-foreground text-sm mb-3">SERVICES COVERED BY THE AGREEMENT ARE AS FOLLOWS:</h3>
                              <ul className="list-disc pl-4 space-y-2 text-sm text-muted-foreground">
                                <li className="leading-relaxed">Breakdown Support: If any breakdown or problem happens with the RO during this 1-year period, the company will provide service without extra charges.</li>
                                <li className="leading-relaxed">Filters / RO Membrane / Consumables / Electricals / Motor: Company will clean, repair, or replace filters and parts needed for smooth working.</li>
                                <li className="leading-relaxed">Safe RO output: Water quality TDS between 50 to 150, as per WHO guidelines or as per customer preference.</li>
                                <li className="leading-relaxed">Clean cosmetics and smooth working of the machine.</li>
                                <li className="leading-relaxed">Quick service: Any breakdown will be resolved within 24 hours.</li>
                                <li className="leading-relaxed">Full Care of RO: The company takes responsibility for complete maintenance and support for 1 year, including Pre Sediment Filtration (with terms & conditions).</li>
                              </ul>
                            </div>

                            {/* Terms and Conditions Preview */}
                            <div className="border-l-2 border-red-300 pl-4">
                              <h3 className="font-medium text-foreground text-sm mb-3">⚖️ TERMS AND CONDITIONS</h3>
                              <ul className="list-disc pl-4 space-y-2 text-sm text-muted-foreground">
                                <li className="leading-relaxed">No Early Termination: You cannot cancel this agreement before expiry. It also cannot be transferred to another person if you sell/gift the machine.</li>
                                <li className="leading-relaxed">Extra Charges: If service is outside municipal limits, extra charges for travel/stay will apply.</li>
                                <li className="leading-relaxed">Disputes: Any legal disputes will be handled only in Bangalore courts.</li>
                                <li className="leading-relaxed">Renewal: After expiry, renewal requires a new agreement.</li>
                                <li className="leading-relaxed">Customer's Duty: The customer must make the RO available for servicing when the company's authorized representative visits.</li>
                                <li className="leading-relaxed">If the customer fails to give the machine for servicing, it will still be treated as service given, and no refund will be made.</li>
                                <li className="leading-relaxed">Agreement Modification: Cannot be changed unless written and signed by both parties.</li>
                                <li className="leading-relaxed">Not Covered: Display and lights of the RO are not covered under this AMC.</li>
                              </ul>
                            </div>

                            {/* Summary Preview */}
                            <div className="border-l-2 border-green-300 pl-4">
                              <h3 className="font-medium text-foreground text-sm mb-3">🔍 Summary in Simple Words</h3>
                              <div className="text-sm text-muted-foreground space-y-2">
                                <p className="leading-relaxed">You (the customer) paid ₹{formData.agreementAmount || '14000'} for 1-year full AMC service of your {formData.productName || 'Kent RO'}.</p>
                                <p className="leading-relaxed">All repairs, filters, and breakdown services are included, with a guarantee of 24-hour resolution.</p>
                                <p className="leading-relaxed">The service covers water quality maintenance (50–150 TDS) and overall machine health.</p>
                                <p className="leading-relaxed">Extra travel charges apply if your location is outside the municipal area.</p>
                                <p className="leading-relaxed">You can't cancel/transfer this AMC until it expires.</p>
                                <p className="leading-relaxed">Legal disputes go to Bangalore court.</p>
                                <p className="leading-relaxed">The AMC does not cover display and lights of the RO.</p>
                              </div>
                            </div>

                            {/* Agreement Details */}
                            <div className="border border-border p-4">
                              <h3 className="font-medium text-foreground text-sm mb-4">AGREEMENT DETAILS</h3>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="space-y-3">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Product:</span>
                                    <span className="text-foreground font-medium">{formData.productName || 'Kent RO'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">From:</span>
                                    <span className="text-foreground font-medium">{formData.agreementPeriodFrom || 'Not set'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">To:</span>
                                    <span className="text-foreground font-medium">{formData.agreementPeriodTo || 'Not set'}</span>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Amount:</span>
                                    <span className="text-foreground font-bold">₹{formData.agreementAmount || '14000'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Date:</span>
                                    <span className="text-foreground">{formData.dateOfAgreement || 'Not set'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Customer:</span>
                                    <span className="text-foreground text-right max-w-24 truncate">{formData.customerName || 'Not provided'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Signatures Preview */}
                            <div className="border-t border-border pt-6">
                              <div className="grid grid-cols-2 gap-8 text-sm">
                                <div className="text-center">
                                  <div className="border-t border-foreground pt-4">
                                    <p className="font-medium text-foreground mb-3">Customer Signature</p>
                                    <div className="mt-4 h-12 border border-border"></div>
                                  </div>
                                </div>
                                <div className="text-center">
                                  <div className="border-t border-foreground pt-4">
                                    <p className="font-medium text-foreground mb-1">Authorized Signatory</p>
                                    <div className="mt-4 h-12 border border-border"></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border border-dashed border-border rounded-lg p-12 text-center">
                    <div className="w-12 h-12 bg-muted rounded flex items-center justify-center mx-auto mb-4">
                      <Eye className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Click "Show Preview" to see the agreement
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Fill in the form for a complete preview
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* AMC Document Template - Hidden for PDF generation */}
        <div id="amc-document" className="hidden">
          <div className="bg-white p-8 text-black" style={{ 
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', 
            fontSize: '14px', 
            lineHeight: '1.6',
            width: '210mm',
            minHeight: '297mm',
            margin: '0 auto',
            fontWeight: '400'
          }}>
            {/* Header with Hydrogen RO Branding */}
            <div className="text-center mb-8 border-b-2 border-blue-600 pb-6">
              {/* Logo Section */}
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                  <Droplets className="w-8 h-8 text-white" />
                </div>
                <div className="text-left">
                  <h1 className="text-3xl font-bold text-blue-600 mb-0">Hydrogen RO</h1>
                  <p className="text-sm text-gray-600 mt-0">Water Purification Solutions</p>
                </div>
              </div>
              
              <h2 className="text-2xl font-bold text-gray-800 mb-4">AMC AGREEMENT</h2>
              
              <div className="bg-blue-50 p-4 rounded-lg text-sm">
                <p className="text-blue-700">Authorized for Service by RO Care India</p>
                <p className="text-gray-700">Ground Floor, 13, 4th Main Road, Next To Jain Temple, Seshadripuram, Kumara Park West</p>
                <p className="text-gray-700">Bengaluru, Bengaluru Urban, Karnataka, 560020</p>
                <div className="flex justify-center gap-6 mt-2 text-xs">
                  <span className="text-blue-600">📞 9886944288 & 8884944288</span>
                  <span className="text-blue-600">✉️ mail@hydrogenro.com</span>
                </div>
                <div className="flex justify-center gap-6 mt-1 text-xs">
                  <span className="text-gray-600">🌐 hydrogenro.com</span>
                  <span className="text-gray-600">🏢 GST: 29LIJPS5140P1Z6</span>
                </div>
              </div>
            </div>

            {/* Agreement Details */}
            <div className="mb-6">
              <div className="bg-gradient-to-r from-blue-50 to-green-50 p-4 rounded-lg mb-4">
                <p className="mb-4 text-sm">
                  We <strong className="text-blue-600">Hydrogen RO</strong>, Authorized for Service by RO Care India, undertake to maintain your <strong className="text-green-600">{formData.productName}</strong> Unit as detailed below:
                </p>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg mb-4 border-l-4 border-blue-500">
                <h3 className="font-bold mb-3 text-blue-800 text-sm">SERVICES COVERED BY THE AGREEMENT ARE AS FOLLOWS:</h3>
                <ul className="list-disc pl-6 space-y-2 text-xs">
                  <li>Breakdown Support: If any breakdown or problem happens with the RO during this 1-year period, the company will provide service without extra charges.</li>
                  <li>Filters / RO Membrane / Consumables / Electricals / Motor: Company will clean, repair, or replace filters and parts needed for smooth working.</li>
                  <li>Safe RO output: Water quality TDS between 50 to 150, as per WHO guidelines or as per customer preference.</li>
                  <li>Clean cosmetics and smooth working of the machine.</li>
                  <li>Quick service: Any breakdown will be resolved within 24 hours.</li>
                  <li>Full Care of RO: The company takes responsibility for complete maintenance and support for 1 year, including Pre Sediment Filtration (with terms & conditions).</li>
                </ul>
              </div>
            </div>

            {/* Terms and Conditions */}
            <div className="mb-6">
              <div className="bg-gray-50 p-4 rounded-lg border-l-4 border-gray-400">
                <h3 className="font-bold mb-3 text-center text-gray-800 text-sm">⚖️ TERMS AND CONDITIONS</h3>
                <ul className="list-disc pl-6 space-y-2 text-xs text-gray-700">
                  <li>No Early Termination: You cannot cancel this agreement before expiry. It also cannot be transferred to another person if you sell/gift the machine.</li>
                  <li>Extra Charges: If service is outside municipal limits, extra charges for travel/stay will apply.</li>
                  <li>Disputes: Any legal disputes will be handled only in Bangalore courts.</li>
                  <li>Renewal: After expiry, renewal requires a new agreement.</li>
                  <li>Customer's Duty: The customer must make the RO available for servicing when the company's authorized representative visits.</li>
                  <li>If the customer fails to give the machine for servicing, it will still be treated as service given, and no refund will be made.</li>
                  <li>Agreement Modification: Cannot be changed unless written and signed by both parties.</li>
                  <li>Not Covered: Display and lights of the RO are not covered under this AMC.</li>
                </ul>
              </div>
            </div>

            {/* Summary Section */}
            <div className="mb-6">
              <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border-l-4 border-green-500">
                <h3 className="font-bold mb-3 text-center text-green-800 text-sm">🔍 Summary in Simple Words</h3>
                <div className="text-xs text-gray-700 space-y-2">
                  <p>You (the customer) paid ₹{formData.agreementAmount} for 1-year full AMC service of your {formData.productName}.</p>
                  <p>All repairs, filters, and breakdown services are included, with a guarantee of 24-hour resolution.</p>
                  <p>The service covers water quality maintenance (50–150 TDS) and overall machine health.</p>
                  <p>Extra travel charges apply if your location is outside the municipal area.</p>
                  <p>You can't cancel/transfer this AMC until it expires.</p>
                  <p>Legal disputes go to Bangalore court.</p>
                  <p>The AMC does not cover display and lights of the RO.</p>
                </div>
              </div>
            </div>

            {/* Agreement Details Table */}
            <div className="mb-6">
              <div className="bg-gradient-to-r from-blue-50 to-green-50 p-4 rounded-lg">
                <h3 className="font-bold mb-3 text-center text-gray-800 text-sm">AGREEMENT DETAILS</h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Product Name:</span>
                      <span className="text-blue-600">{formData.productName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Agreement Period From:</span>
                      <span className="text-green-600">{formData.agreementPeriodFrom}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Agreement Period To:</span>
                      <span className="text-green-600">{formData.agreementPeriodTo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Agreement Amount:</span>
                      <span className="text-blue-600 font-bold">₹{formData.agreementAmount}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Date of Agreement:</span>
                      <span className="text-gray-600">{formData.dateOfAgreement}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Customer Name:</span>
                      <span className="text-gray-600">{formData.customerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Phone:</span>
                      <span className="text-gray-600">{formData.customerPhone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Address:</span>
                      <span className="text-gray-600 text-right max-w-32">{formData.customerAddress}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Notes */}
            {formData.additionalNotes && (
              <div className="mb-6">
                <h3 className="font-bold mb-2">Additional Terms:</h3>
                <p className="text-xs">{formData.additionalNotes}</p>
              </div>
            )}

            {/* Signatures */}
            <div className="mt-12">
              <div className="bg-gradient-to-r from-blue-50 to-green-50 p-6 rounded-lg">
                <div className="grid grid-cols-2 gap-8">
                  <div className="text-center">
                    <div className="border-t-2 border-blue-600 pt-4">
                      <p className="font-bold text-blue-800 text-sm">Customer Signature</p>
                      <div className="mt-8 h-16 border border-gray-300 rounded"></div>
                      <p className="text-xs mt-2 text-gray-600">Date: _______________</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="border-t-2 border-green-600 pt-4">
                      <p className="font-bold text-green-800 text-sm">Authorized Signatory</p>
                      <div className="mt-4 h-16 border border-gray-300 rounded"></div>
                      <p className="text-xs mt-2 text-gray-600">Date: _______________</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center mt-8 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <Droplets className="w-4 h-4 text-blue-600 mr-2" />
                <span className="font-semibold text-blue-600">Hydrogen RO</span>
              </div>
              <p className="text-xs text-gray-600 mb-1">This is a computer generated document and does not require a physical signature.</p>
              <p className="text-xs text-gray-500">Generated on: {new Date().toLocaleDateString('en-IN')} | Professional RO Water Purifier Services in Bengaluru</p>
            </div>
          </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AMC;
