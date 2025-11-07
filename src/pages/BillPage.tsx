import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, User, FileText, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import BillGenerator from '@/components/BillGenerator';
import { Customer, Bill } from '@/types';
import { generateBillPDF } from '@/lib/pdf-generator';

export default function BillPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isGeneratingBill, setIsGeneratingBill] = useState(false);
  const [loading, setLoading] = useState(true);

  // Mock customers for demo - in real app, fetch from your data source
  useEffect(() => {
    // Simulate loading
    setLoading(true);
    setTimeout(() => {
      setCustomers([
        {
          id: '1',
          customerId: 'C0001',
          fullName: 'John Doe',
          phone: '+91 98765 43210',
          email: 'john.doe@example.com',
          address: {
            street: '123 Main Street',
            area: 'Whitefield',
            city: 'Bangalore',
            state: 'Karnataka',
            pincode: '560066'
          },
          location: {
            latitude: 12.9716,
            longitude: 77.5946,
            formattedAddress: '123 Main Street, Whitefield, Bangalore, Karnataka 560066'
          },
          serviceType: 'RO',
          brand: 'Kent',
          model: 'Grand Plus',
          status: 'ACTIVE',
          customerSince: '2024-01-01',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        },
        {
          id: '2',
          customerId: 'C0002',
          fullName: 'Jane Smith',
          phone: '+91 98765 43211',
          email: 'jane.smith@example.com',
          address: {
            street: '456 Park Avenue',
            area: 'Koramangala',
            city: 'Bangalore',
            state: 'Karnataka',
            pincode: '560034'
          },
          location: {
            latitude: 12.9352,
            longitude: 77.6245,
            formattedAddress: '456 Park Avenue, Koramangala, Bangalore, Karnataka 560034'
          },
          serviceType: 'RO',
          brand: 'Aquaguard',
          model: 'Geneus',
          status: 'ACTIVE',
          customerSince: '2024-01-15',
          createdAt: '2024-01-15T00:00:00Z',
          updatedAt: '2024-01-15T00:00:00Z'
        }
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  const filteredCustomers = customers.filter(customer =>
    customer.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm) ||
    customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.customerId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsGeneratingBill(true);
  };

  const handleBackToList = () => {
    setSelectedCustomer(null);
    setIsGeneratingBill(false);
  };

  const handleSaveBill = (bill: Bill) => {
    // Just show success message since we're not storing bills
    toast.success('Bill generated successfully!');
    handleBackToList();
  };

  const handlePrintBill = (bill: Bill) => {
           const pdfData = {
             billNumber: bill.billNumber,
             billDate: bill.billDate,
             company: bill.company,
             customer: bill.customer,
             items: bill.items,
             subtotal: bill.subtotal,
             serviceCharge: bill.serviceCharge || 0,
             totalAmount: bill.totalAmount,
             paymentStatus: bill.paymentStatus,
             paymentMethod: bill.paymentMethod,
             notes: bill.notes,
             terms: bill.terms,
             hideGstInHeader: (bill as any).hideGstInHeader || false
           };
    
    generateBillPDF(pdfData);
  };

  if (isGeneratingBill && selectedCustomer) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  onClick={handleBackToList}
                  className="mr-4"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Customer List
                </Button>
                <h1 className="text-xl font-semibold text-gray-900">
                  Generate Bill for {selectedCustomer.fullName}
                </h1>
              </div>
            </div>
          </div>
        </div>
        <BillGenerator
          customer={selectedCustomer}
          onPrint={handlePrintBill}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Button
                variant="ghost"
                onClick={() => navigate('/admin')}
                className="mr-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Admin
              </Button>
              <h1 className="text-xl font-semibold text-gray-900">Bill Generation</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search customers by name, phone, email, or customer ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCustomers.map((customer) => (
              <Card key={customer.id} className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{customer.fullName}</CardTitle>
                    <Badge variant="outline">{customer.customerId}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {customer.phone && (
                      <div className="flex items-center text-sm text-gray-600">
                        <User className="w-4 h-4 mr-2" />
                        {customer.phone}
                      </div>
                    )}
                    {customer.email && (
                      <div className="text-sm text-gray-600">
                        {customer.email}
                      </div>
                    )}
                    {(customer.address.area || customer.address.city) && (
                      <div className="text-sm text-gray-600">
                        {customer.address.area}, {customer.address.city}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-4">
                      <Badge variant={customer.status === 'ACTIVE' ? 'default' : 'secondary'}>
                        {customer.status}
                      </Badge>
                      <Button
                        onClick={() => handleCustomerSelect(customer)}
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Generate Bill
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && filteredCustomers.length === 0 && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No customers found</h3>
            <p className="text-gray-500">
              {searchTerm ? 'Try adjusting your search terms.' : 'No customers available for billing.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
