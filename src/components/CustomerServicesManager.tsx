import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Wrench } from 'lucide-react';
import { toast } from 'sonner';

interface CustomerService {
  id: string;
  serviceType: string;
  brand: string;
  model: string;
  installationDate?: string;
  warrantyExpiry?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE_DUE';
  notes?: string;
}

interface CustomerServicesManagerProps {
  customerId: string;
  customerName: string;
  services: CustomerService[];
  onServicesUpdate: (services: CustomerService[]) => void;
}

const CustomerServicesManager: React.FC<CustomerServicesManagerProps> = ({
  customerId,
  customerName,
  services,
  onServicesUpdate
}) => {
  const [addServiceDialogOpen, setAddServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<CustomerService | null>(null);
  const [serviceFormData, setServiceFormData] = useState({
    serviceType: '',
    brand: '',
    model: '',
    installationDate: '',
    warrantyExpiry: '',
    status: 'ACTIVE' as const,
    notes: ''
  });

  const serviceTypes = [
    { value: 'RO', label: 'RO (Reverse Osmosis)' },
    { value: 'SOFTENER', label: 'Water Softener' }
  ];

  const getServiceTypeLabel = (type: string) => {
    return serviceTypes.find(s => s.value === type)?.label || type;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'ACTIVE': { color: 'bg-green-100 text-green-800', label: 'Active' },
      'INACTIVE': { color: 'bg-gray-100 text-gray-800', label: 'Inactive' },
      'MAINTENANCE_DUE': { color: 'bg-yellow-100 text-yellow-800', label: 'Maintenance Due' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['ACTIVE'];

    return (
      <Badge className={`${config.color} border-0`}>
        {config.label}
      </Badge>
    );
  };

  const handleAddService = () => {
    setServiceFormData({
      serviceType: '',
      brand: '',
      model: '',
      installationDate: '',
      warrantyExpiry: '',
      status: 'ACTIVE',
      notes: ''
    });
    setEditingService(null);
    setAddServiceDialogOpen(true);
  };

  const handleEditService = (service: CustomerService) => {
    setServiceFormData({
      serviceType: service.serviceType,
      brand: service.brand,
      model: service.model,
      installationDate: service.installationDate || '',
      warrantyExpiry: service.warrantyExpiry || '',
      status: service.status,
      notes: service.notes || ''
    });
    setEditingService(service);
    setAddServiceDialogOpen(true);
  };

  const handleSaveService = () => {
    if (!serviceFormData.serviceType || !serviceFormData.brand || !serviceFormData.model) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newService: CustomerService = {
      id: editingService?.id || `service_${Date.now()}`,
      serviceType: serviceFormData.serviceType,
      brand: serviceFormData.brand,
      model: serviceFormData.model,
      installationDate: serviceFormData.installationDate || undefined,
      warrantyExpiry: serviceFormData.warrantyExpiry || undefined,
      status: serviceFormData.status,
      notes: serviceFormData.notes || undefined
    };

    if (editingService) {
      // Update existing service
      const updatedServices = services.map(s => 
        s.id === editingService.id ? newService : s
      );
      onServicesUpdate(updatedServices);
      toast.success('Service updated successfully!');
    } else {
      // Add new service
      onServicesUpdate([...services, newService]);
      toast.success('Service added successfully!');
    }

    setAddServiceDialogOpen(false);
    setEditingService(null);
  };

  const handleDeleteService = (serviceId: string) => {
    const updatedServices = services.filter(s => s.id !== serviceId);
    onServicesUpdate(updatedServices);
    toast.success('Service removed successfully!');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Customer Services</h3>
        <Button 
          onClick={handleAddService}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Service
        </Button>
      </div>

      {services.length === 0 ? (
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-6 text-center">
            <Wrench className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No services added yet</p>
            <p className="text-sm text-gray-500">Click "Add Service" to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((service) => (
            <Card key={service.id} className="bg-white border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{getServiceTypeLabel(service.serviceType)}</CardTitle>
                    <p className="text-sm text-gray-600">{service.brand} - {service.model}</p>
                  </div>
                  {getStatusBadge(service.status)}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {service.installationDate && (
                  <p className="text-xs text-gray-500 mb-1">
                    Installed: {new Date(service.installationDate).toLocaleDateString()}
                  </p>
                )}
                {service.warrantyExpiry && (
                  <p className="text-xs text-gray-500 mb-2">
                    Warranty: {new Date(service.warrantyExpiry).toLocaleDateString()}
                  </p>
                )}
                {service.notes && (
                  <p className="text-xs text-gray-600 mb-3">{service.notes}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditService(service)}
                    className="flex-1"
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteService(service.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Service Dialog */}
      <Dialog open={addServiceDialogOpen} onOpenChange={setAddServiceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingService ? 'Edit Service' : 'Add New Service'}
            </DialogTitle>
            <DialogDescription>
              {editingService ? 'Update service information' : 'Add a new service for this customer'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Service Type */}
            <div className="space-y-2">
              <Label htmlFor="service_type">Service Type *</Label>
              <Select 
                value={serviceFormData.serviceType} 
                onValueChange={(value) => setServiceFormData(prev => ({ ...prev, serviceType: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  {serviceTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Brand */}
            <div className="space-y-2">
              <Label htmlFor="brand">Brand *</Label>
              <Input
                id="brand"
                value={serviceFormData.brand}
                onChange={(e) => setServiceFormData(prev => ({ ...prev, brand: e.target.value }))}
                placeholder="Enter brand name"
              />
            </div>

            {/* Model */}
            <div className="space-y-2">
              <Label htmlFor="model">Model *</Label>
              <Input
                id="model"
                value={serviceFormData.model}
                onChange={(e) => setServiceFormData(prev => ({ ...prev, model: e.target.value }))}
                placeholder="Enter model name"
              />
            </div>

            {/* Installation Date */}
            <div className="space-y-2">
              <Label htmlFor="installation_date">Installation Date</Label>
              <DatePicker
                value={serviceFormData.installationDate || undefined}
                onChange={(v) => v && setServiceFormData(prev => ({ ...prev, installationDate: v }))}
                placeholder="Pick date"
              />
            </div>

            {/* Warranty Expiry */}
            <div className="space-y-2">
              <Label htmlFor="warranty_expiry">Warranty Expiry</Label>
              <DatePicker
                value={serviceFormData.warrantyExpiry || undefined}
                onChange={(v) => v && setServiceFormData(prev => ({ ...prev, warrantyExpiry: v }))}
                placeholder="Pick date"
              />
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select 
                value={serviceFormData.status} 
                onValueChange={(value) => setServiceFormData(prev => ({ ...prev, status: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="MAINTENANCE_DUE">Maintenance Due</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Additional Info</Label>
              <Input
                id="notes"
                value={serviceFormData.notes}
                onChange={(e) => setServiceFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Enter any additional notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setAddServiceDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveService}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editingService ? 'Update Service' : 'Add Service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerServicesManager;
