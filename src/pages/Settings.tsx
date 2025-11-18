import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { 
  Settings as SettingsIcon, 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { db, supabase } from '@/lib/supabase';
import { Technician } from '@/types';
import ImageUpload from '@/components/ImageUpload';
import { QrCode } from 'lucide-react';
import { CommonQrCode, invalidateQrCodesCache } from '@/lib/qrCodeManager';

const Settings = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  
  // Note: Currently allows unauthenticated access, but RLS policies need to be updated
  // Run supabase-qr-codes-rls-fix.sql to allow unauthenticated access

  // Technician management states
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [addTechnicianDialogOpen, setAddTechnicianDialogOpen] = useState(false);
  const [editTechnicianDialogOpen, setEditTechnicianDialogOpen] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  
  // Common QR Code management states
  const [commonQrCodes, setCommonQrCodes] = useState<CommonQrCode[]>([]);
  const [addQrCodeDialogOpen, setAddQrCodeDialogOpen] = useState(false);
  const [editQrCodeDialogOpen, setEditQrCodeDialogOpen] = useState(false);
  const [selectedQrCode, setSelectedQrCode] = useState<CommonQrCode | null>(null);
  const [qrCodeFormData, setQrCodeFormData] = useState({
    name: '',
    qrCodeUrl: ''
  });
  const [technicianFormData, setTechnicianFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    employeeId: '',
    password: '',
    qrCode: '' // QR code image URL
  });


  // Load data on component mount
  useEffect(() => {
    loadTechnicians();
    loadCommonQrCodes();
  }, []);

  // Transform technician data from database format to frontend format
  const transformTechnicianData = (tech: any) => ({
    id: tech.id,
    fullName: tech.full_name,
    phone: tech.phone,
    email: tech.email,
    employeeId: tech.employee_id,
    account_status: tech.account_status || 'ACTIVE',
    skills: tech.skills,
    serviceAreas: tech.service_areas,
    status: tech.status,
    currentLocation: tech.current_location,
    workSchedule: tech.work_schedule,
    performance: tech.performance,
    vehicle: tech.vehicle,
    salary: tech.salary,
    qrCode: tech.qr_code || tech.qrCode || '',
    createdAt: tech.created_at,
    updatedAt: tech.updated_at
  });

  const loadTechnicians = async () => {
    try {
      const { data, error } = await db.technicians.getAll();
      if (error) throw error;
      
      if (data) {
        const transformedTechnicians = data.map(transformTechnicianData);
        setTechnicians(transformedTechnicians);
      }
    } catch (error) {
      console.error('Error loading technicians:', error);
      toast.error('Failed to load technicians');
    }
  };

  // Generate employee ID
  const generateEmployeeId = (): string => {
    const prefix = 'TECH';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
  };

  // Technician management functions
  const handleAddTechnician = () => {
    setTechnicianFormData({
      fullName: '',
      phone: '',
      email: '',
      employeeId: generateEmployeeId(),
      password: '',
      qrCode: ''
    });
    setAddTechnicianDialogOpen(true);
  };

  const handleEditTechnician = (technician: Technician) => {
    setSelectedTechnician(technician);
    setTechnicianFormData({
      fullName: technician.fullName,
      phone: technician.phone,
      email: technician.email,
      employeeId: technician.employeeId,
      password: '', // Don't show existing password for security
      qrCode: (technician as any).qrCode || ''
    });
    setEditTechnicianDialogOpen(true);
  };

  // Helper function to hash password using serverless function
  const hashPassword = async (password: string): Promise<string> => {
    const apiUrl = import.meta.env.DEV
      ? 'http://localhost:8888/.netlify/functions/hash-technician-password'
      : '/.netlify/functions/hash-technician-password';

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Password hashing API error:', response.status, errorText);
        throw new Error('Failed to hash password. Please try again.');
      }

      const result = await response.json();
      return result.hashedPassword;
    } catch (error) {
      console.error('Password hashing error:', error);
      throw new Error('Password hashing service unavailable. Please ensure the development server is running.');
    }
  };

  const handleSaveTechnician = async () => {
    try {
      // Hash password if provided (for new technicians or password updates)
      let hashedPassword: string | undefined = undefined;
      if (technicianFormData.password && technicianFormData.password.trim() !== '') {
        hashedPassword = await hashPassword(technicianFormData.password);
      }

      const technicianData: any = {
        full_name: technicianFormData.fullName,
        phone: technicianFormData.phone,
        email: technicianFormData.email,
        employee_id: technicianFormData.employeeId,
        qr_code: technicianFormData.qrCode || null,
        account_status: 'ACTIVE',
        skills: {
          serviceTypes: ['RO', 'SOFTENER', 'AC', 'APPLIANCE'],
          certifications: [],
          experience: 0,
          rating: 0
        },
        service_areas: {
          pincodes: [],
          cities: ['Bangalore'],
          maxDistance: 10
        },
        work_schedule: {
          workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
          startTime: '09:00',
          endTime: '18:00',
          breakTime: {
            start: '13:00',
            end: '14:00'
          }
        },
        status: 'OFFLINE',
        performance: {
          totalJobs: 0,
          completedJobs: 0,
          averageRating: 0,
          onTimePercentage: 0,
          customerSatisfaction: 0
        },
        salary: {
          baseSalary: 0,
          commissionPerJob: 0,
          commissionPercentage: 0
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Add hashed password if provided
      if (hashedPassword) {
        technicianData.password = hashedPassword;
      }

      if (editTechnicianDialogOpen && selectedTechnician) {
        // Update existing technician - only update password if provided
        const updateData = { ...technicianData };
        if (!hashedPassword) {
          delete updateData.password; // Don't update password if not provided
        }
        const { error } = await db.technicians.update(selectedTechnician.id, updateData);
        if (error) throw error;
        toast.success('Technician updated successfully');
      } else {
        // Create new technician - password is required
        if (!hashedPassword) {
          toast.error('Password is required when creating a new technician');
          return;
        }
        
        // Check for duplicate employee_id or phone before creating
        const { data: existingTechnicians } = await db.technicians.getAll();
        if (existingTechnicians) {
          const duplicateEmployeeId = existingTechnicians.find(
            (t: any) => t.employee_id === technicianData.employee_id
          );
          const duplicatePhone = existingTechnicians.find(
            (t: any) => t.phone === technicianData.phone
          );
          const duplicateEmail = existingTechnicians.find(
            (t: any) => t.email.toLowerCase() === technicianData.email.toLowerCase()
          );
          
          if (duplicateEmployeeId) {
            toast.error(`Employee ID "${technicianData.employee_id}" already exists. Please use a different ID.`);
            return;
          }
          if (duplicatePhone) {
            toast.error(`Phone number "${technicianData.phone}" already exists. Please use a different phone number.`);
            return;
          }
          if (duplicateEmail) {
            toast.error(`Email "${technicianData.email}" already exists. Please use a different email address.`);
            return;
          }
        }
        
        const { error } = await db.technicians.create(technicianData);
        if (error) {
          // Handle 409 conflict errors with better messages
          if (error.code === '23505') { // PostgreSQL unique violation
            if (error.message.includes('employee_id')) {
              toast.error(`Employee ID "${technicianData.employee_id}" already exists. Please use a different ID.`);
            } else if (error.message.includes('phone')) {
              toast.error(`Phone number "${technicianData.phone}" already exists. Please use a different phone number.`);
            } else if (error.message.includes('email')) {
              toast.error(`Email "${technicianData.email}" already exists. Please use a different email address.`);
            } else {
              toast.error('A technician with this information already exists. Please check employee ID, phone, or email.');
            }
            return;
          }
          throw error;
        }
        toast.success('Technician created successfully');
      }

      // Refresh technicians list
      await loadTechnicians();

      // Close dialogs
      setAddTechnicianDialogOpen(false);
      setEditTechnicianDialogOpen(false);
      setSelectedTechnician(null);
    } catch (error) {
      console.error('Error saving technician:', error);
      toast.error('Failed to save technician');
    }
  };

  const handleDeleteTechnician = async (technicianId: string) => {
    try {
      const { error } = await db.technicians.delete(technicianId);
      if (error) throw error;
      
      await loadTechnicians();
      toast.success('Technician deleted successfully');
    } catch (error) {
      console.error('Error deleting technician:', error);
      toast.error('Failed to delete technician');
    }
  };

  // Common QR Code management functions
  const loadCommonQrCodes = async () => {
    try {
      console.log('Loading common QR codes...');
      const { data, error } = await db.commonQrCodes.getAll();
      if (error) {
        console.error('Error fetching QR codes:', error);
        throw error;
      }
      
      console.log('QR codes fetched:', data);
      
      if (data) {
        const transformed = data.map((qr: any) => ({
          id: qr.id,
          name: qr.name,
          qrCodeUrl: qr.qr_code_url,
          createdAt: qr.created_at,
          updatedAt: qr.updated_at
        }));
        console.log('Transformed QR codes:', transformed);
        setCommonQrCodes(transformed);
      } else {
        console.log('No QR codes found in database');
        setCommonQrCodes([]);
      }
    } catch (error) {
      console.error('Error loading common QR codes:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to load QR codes: ${errorMessage}`);
    }
  };

  const handleAddQrCode = () => {
    setQrCodeFormData({ name: '', qrCodeUrl: '' });
    setAddQrCodeDialogOpen(true);
  };

  const handleEditQrCode = (qrCode: CommonQrCode) => {
    setSelectedQrCode(qrCode);
    setQrCodeFormData({
      name: qrCode.name,
      qrCodeUrl: qrCode.qrCodeUrl
    });
    setEditQrCodeDialogOpen(true);
  };

  const handleSaveQrCode = async () => {
    try {
      // Validate form data
      if (!qrCodeFormData.name || !qrCodeFormData.name.trim()) {
        toast.error('Please provide a QR code name');
        return;
      }

      if (!qrCodeFormData.qrCodeUrl || !qrCodeFormData.qrCodeUrl.trim()) {
        toast.error('Please upload a QR code image');
        return;
      }

      // Validate URL format
      if (!qrCodeFormData.qrCodeUrl.startsWith('http')) {
        toast.error('Invalid QR code URL. Please upload the image again.');
        return;
      }

      console.log('Saving QR code:', { 
        name: qrCodeFormData.name, 
        qrCodeUrl: qrCodeFormData.qrCodeUrl,
        urlLength: qrCodeFormData.qrCodeUrl.length 
      });

      // Check authentication
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('Current session:', sessionData?.session ? 'Authenticated' : 'Not authenticated');

      if (editQrCodeDialogOpen && selectedQrCode) {
        console.log('Updating QR code with ID:', selectedQrCode.id);
        const { data, error } = await db.commonQrCodes.update(selectedQrCode.id, {
          name: qrCodeFormData.name.trim(),
          qr_code_url: qrCodeFormData.qrCodeUrl.trim()
        });
        if (error) {
          console.error('Error updating QR code:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
          toast.error(`Failed to update QR code: ${error.message || JSON.stringify(error)}`);
          return;
        }
        console.log('QR code updated successfully:', data);
        toast.success('QR code updated successfully');
        // Invalidate cache so AdminDashboard will reload
        invalidateQrCodesCache();
      } else {
        console.log('Creating new QR code...');
        const { data, error } = await db.commonQrCodes.create({
          name: qrCodeFormData.name.trim(),
          qr_code_url: qrCodeFormData.qrCodeUrl.trim()
        });
        if (error) {
          console.error('Error creating QR code:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
          toast.error(`Failed to create QR code: ${error.message || JSON.stringify(error)}`);
          return;
        }
        console.log('QR code created successfully:', data);
        toast.success('QR code created successfully');
        // Invalidate cache so AdminDashboard will reload
        invalidateQrCodesCache();
      }

      // Reload QR codes after successful save
      console.log('Reloading QR codes...');
      await loadCommonQrCodes();
      
      // Close dialogs and reset form
      setAddQrCodeDialogOpen(false);
      setEditQrCodeDialogOpen(false);
      setSelectedQrCode(null);
      setQrCodeFormData({ name: '', qrCodeUrl: '' });
    } catch (error) {
      console.error('Error saving QR code:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Full error:', error);
      toast.error(`Failed to save QR code: ${errorMessage}`);
    }
  };

  const handleDeleteQrCode = async (qrCodeId: string) => {
    try {
      const { error } = await db.commonQrCodes.delete(qrCodeId);
      if (error) throw error;
      
      await loadCommonQrCodes();
      toast.success('QR code deleted successfully');
      // Invalidate cache so AdminDashboard will reload
      invalidateQrCodesCache();
    } catch (error) {
      console.error('Error deleting QR code:', error);
      toast.error('Failed to delete QR code');
    }
  };


  // No authentication check - allow access to all

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 sm:py-0 sm:h-16">
            <div className="flex items-center">
              <SettingsIcon className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 mr-2 sm:mr-3 shrink-0" />
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900">Settings</h1>
                <p className="text-xs sm:text-sm text-gray-600">Manage technician accounts</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/admin')}
                className="w-full sm:w-auto"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Admin
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="space-y-4 sm:space-y-6">
          {/* Common QR Codes Management */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <QrCode className="w-5 h-5" />
                    Common Payment QR Codes
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Manage QR codes available to all technicians for payment scanning
                  </CardDescription>
                </div>
                <Button 
                  onClick={handleAddQrCode} 
                  className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add QR Code
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {commonQrCodes.map((qrCode) => (
                  <Card key={qrCode.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3 gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{qrCode.name}</h3>
                        </div>
                      </div>
                      
                      {qrCode.qrCodeUrl && (
                        <div className="mb-4 flex justify-center">
                          <img 
                            src={qrCode.qrCodeUrl} 
                            alt={qrCode.name} 
                            className="w-32 h-32 object-contain border border-gray-200 rounded"
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditQrCode(qrCode)}
                          className="flex-1 text-xs sm:text-sm"
                        >
                          <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-red-600 hover:text-red-700 px-2 sm:px-3"
                            >
                              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="mx-4 sm:mx-0">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete QR Code</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{qrCode.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                              <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteQrCode(qrCode.id)}
                                className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {commonQrCodes.length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    No QR codes added yet. Click "Add QR Code" to create one.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Technician Management */}
            <Card>
              <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                      <Users className="w-5 h-5" />
                      Technician Management
                    </CardTitle>
                  <CardDescription className="text-sm mt-1">
                      Manage technician accounts and permissions
                    </CardDescription>
                  </div>
                <Button 
                  onClick={handleAddTechnician} 
                  className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                  size="sm"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Technician
                  </Button>
                </div>
              </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {technicians.map((technician) => (
                    <Card key={technician.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3 gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{technician.fullName}</h3>
                          <p className="text-xs sm:text-sm text-gray-600 truncate">{technician.employeeId}</p>
                          </div>
                          <Badge 
                            variant={technician.account_status === 'ACTIVE' ? 'default' : 'secondary'}
                          className="text-xs shrink-0"
                          >
                            {technician.account_status}
                          </Badge>
                        </div>
                        
                      <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-gray-600 mb-4">
                        <div className="flex items-start gap-2">
                          <span className="font-medium shrink-0">Email:</span>
                          <span className="truncate">{technician.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                          <span className="font-medium shrink-0">Phone:</span>
                          <span className="truncate">{technician.phone}</span>
                          </div>
                          <div className="flex items-center gap-2">
                          <span className="font-medium shrink-0">Status:</span>
                            <Badge variant="outline" className="text-xs">
                              {technician.status}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditTechnician(technician)}
                          className="flex-1 text-xs sm:text-sm"
                          >
                          <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                            Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-red-600 hover:text-red-700 px-2 sm:px-3"
                            >
                              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                              </Button>
                            </AlertDialogTrigger>
                          <AlertDialogContent className="mx-4 sm:mx-0">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Technician</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {technician.fullName}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                              <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteTechnician(technician.id)}
                                className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
                </div>
      </div>

      {/* Add/Edit Technician Dialog */}
      <Dialog open={addTechnicianDialogOpen || editTechnicianDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddTechnicianDialogOpen(false);
          setEditTechnicianDialogOpen(false);
          setSelectedTechnician(null);
        }
      }}>
        <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTechnicianDialogOpen ? 'Edit Technician' : 'Add New Technician'}
            </DialogTitle>
            <DialogDescription>
              {editTechnicianDialogOpen 
                ? 'Update technician information and credentials'
                : 'Create a new technician account with login credentials'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fullName">Full Name *</Label>
                  <Input
                    id="fullName"
                    value={technicianFormData.fullName}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="Enter full name"
                  />
                </div>
                <div>
                  <Label htmlFor="employeeId">Employee ID *</Label>
                  <Input
                    id="employeeId"
                    value={technicianFormData.employeeId}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, employeeId: e.target.value }))}
                    placeholder="Auto-generated"
                    className="bg-gray-50"
                    readOnly={!editTechnicianDialogOpen}
                  />
                  {!editTechnicianDialogOpen && (
                    <p className="text-xs text-gray-500 mt-1">Employee ID is auto-generated</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    value={technicianFormData.phone}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Enter phone number"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={technicianFormData.email}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Enter email address"
                  />
                </div>
                <div>
                  <Label htmlFor="password">
                    Password {editTechnicianDialogOpen ? '(leave blank to keep current)' : '*'}
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={technicianFormData.password}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={editTechnicianDialogOpen ? "Enter new password (optional)" : "Enter password"}
                  />
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Payment QR Code</h3>
              <div>
                <Label>Upload Payment QR Code (Optional)</Label>
                <p className="text-sm text-gray-500 mb-2">Upload QR code for payment scanning</p>
                <ImageUpload
                  onImagesChange={(images) => setTechnicianFormData(prev => ({ ...prev, qrCode: images[0] || '' }))}
                  maxImages={1}
                  folder="technician-qr-codes"
                  title=""
                  description=""
                  maxWidth={800}
                  quality={0.8}
                  aggressiveCompression={false}
                  useSecondaryAccount={false}
                />
                {technicianFormData.qrCode && (
                  <div className="mt-2">
                    <img 
                      src={technicianFormData.qrCode} 
                      alt="QR Code" 
                      className="w-32 h-32 object-contain border border-gray-200 rounded"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setAddTechnicianDialogOpen(false);
                setEditTechnicianDialogOpen(false);
                setSelectedTechnician(null);
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTechnician}
              disabled={!technicianFormData.fullName || !technicianFormData.phone || !technicianFormData.email || !technicianFormData.employeeId || (!editTechnicianDialogOpen && !technicianFormData.password)}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            >
              {editTechnicianDialogOpen ? 'Update Technician' : 'Create Technician'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Common QR Code Dialog */}
      <Dialog open={addQrCodeDialogOpen || editQrCodeDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddQrCodeDialogOpen(false);
          setEditQrCodeDialogOpen(false);
          setSelectedQrCode(null);
          setQrCodeFormData({ name: '', qrCodeUrl: '' });
        }
      }}>
        <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editQrCodeDialogOpen ? 'Edit QR Code' : 'Add New QR Code'}
            </DialogTitle>
            <DialogDescription>
              {editQrCodeDialogOpen 
                ? 'Update QR code information'
                : 'Create a new common QR code for payment scanning'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Debug info - remove in production */}
            {import.meta.env.DEV && (
              <div className="p-2 bg-gray-100 rounded text-xs">
                <p><strong>Debug Info:</strong></p>
                <p>Name: {qrCodeFormData.name || '(empty)'}</p>
                <p>URL: {qrCodeFormData.qrCodeUrl ? `${qrCodeFormData.qrCodeUrl.substring(0, 50)}...` : '(empty)'}</p>
                <p>Button disabled: {(!qrCodeFormData.name || !qrCodeFormData.qrCodeUrl) ? 'YES' : 'NO'}</p>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <Label htmlFor="qrCodeName">QR Code Name *</Label>
                <Input
                  id="qrCodeName"
                  value={qrCodeFormData.name}
                  onChange={(e) => {
                    console.log('Name changed:', e.target.value);
                    setQrCodeFormData(prev => ({ ...prev, name: e.target.value }));
                  }}
                  placeholder="e.g., Company UPI QR, Main Account QR"
                />
              </div>
              
              <div>
                <Label>Upload QR Code Image *</Label>
                <p className="text-sm text-gray-500 mb-2">Upload QR code image for payment scanning</p>
                <ImageUpload
                  onImagesChange={(images) => {
                    console.log('ImageUpload callback called with images:', images);
                    const url = images[0] || '';
                    console.log('Setting QR code URL:', url);
                    setQrCodeFormData(prev => {
                      const updated = { ...prev, qrCodeUrl: url };
                      console.log('Updated qrCodeFormData:', updated);
                      return updated;
                    });
                  }}
                  maxImages={1}
                  folder="common-qr-codes"
                  title=""
                  description=""
                  maxWidth={800}
                  quality={0.8}
                  aggressiveCompression={false}
                  useSecondaryAccount={false}
                />
                {qrCodeFormData.qrCodeUrl && (
                  <div className="mt-2">
                    <img 
                      src={qrCodeFormData.qrCodeUrl} 
                      alt="QR Code" 
                      className="w-32 h-32 object-contain border border-gray-200 rounded"
                    />
                    <p className="text-xs text-gray-500 mt-1">URL: {qrCodeFormData.qrCodeUrl.substring(0, 50)}...</p>
                  </div>
                )}
                {!qrCodeFormData.qrCodeUrl && (
                  <p className="text-xs text-red-500 mt-1">No QR code uploaded yet</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setAddQrCodeDialogOpen(false);
                setEditQrCodeDialogOpen(false);
                setSelectedQrCode(null);
                setQrCodeFormData({ name: '', qrCodeUrl: '' });
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                console.log('Create/Update QR Code button clicked');
                console.log('Current form data:', qrCodeFormData);
                console.log('Form validation:', {
                  hasName: !!qrCodeFormData.name,
                  hasUrl: !!qrCodeFormData.qrCodeUrl,
                  nameValue: qrCodeFormData.name,
                  urlValue: qrCodeFormData.qrCodeUrl
                });
                handleSaveQrCode();
              }}
              disabled={!qrCodeFormData.name || !qrCodeFormData.qrCodeUrl}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            >
              {editQrCodeDialogOpen ? 'Update QR Code' : 'Create QR Code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;