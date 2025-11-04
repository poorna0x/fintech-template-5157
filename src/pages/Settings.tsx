import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Settings as SettingsIcon, 
  Users, 
  Wrench, 
  Plus, 
  Edit, 
  Trash2, 
  ArrowLeft,
  Save,
  RefreshCw,
  Shield,
  Bell,
  Database
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/supabase';
import { Technician } from '@/types';

const Settings = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  
  // No authentication required for now

  // Technician management states
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [addTechnicianDialogOpen, setAddTechnicianDialogOpen] = useState(false);
  const [editTechnicianDialogOpen, setEditTechnicianDialogOpen] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [technicianFormData, setTechnicianFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    employeeId: '',
    password: ''
  });

  // System settings states
  const [systemSettings, setSystemSettings] = useState({
    companyName: 'RO Service',
    companyEmail: 'info@roservice.com',
    companyPhone: '+1234567890',
    notificationEnabled: true,
    autoAssignJobs: false,
    workingHours: {
      start: '09:00',
      end: '18:00'
    }
  });

  // Load data on component mount
  useEffect(() => {
    loadTechnicians();
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
      password: ''
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
      password: '' // Don't show existing password for security
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
        const { error } = await db.technicians.create(technicianData);
        if (error) throw error;
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

  const handleSaveSystemSettings = () => {
    // In a real app, you'd save this to a database
    localStorage.setItem('systemSettings', JSON.stringify(systemSettings));
    toast.success('Settings saved successfully');
  };

  // No authentication check - allow access to all

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <SettingsIcon className="w-8 h-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Settings</h1>
                <p className="text-sm text-gray-600">Manage system configuration</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/admin')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Admin
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="technicians" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="technicians" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Technicians
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              System
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notifications
            </TabsTrigger>
          </TabsList>

          {/* Technicians Tab */}
          <TabsContent value="technicians" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Technician Management
                    </CardTitle>
                    <CardDescription>
                      Manage technician accounts and permissions
                    </CardDescription>
                  </div>
                  <Button onClick={handleAddTechnician} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Technician
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {technicians.map((technician) => (
                    <Card key={technician.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-gray-900">{technician.fullName}</h3>
                            <p className="text-sm text-gray-600">{technician.employeeId}</p>
                          </div>
                          <Badge 
                            variant={technician.account_status === 'ACTIVE' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {technician.account_status}
                          </Badge>
                        </div>
                        
                        <div className="space-y-2 text-sm text-gray-600 mb-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Email:</span>
                            <span>{technician.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Phone:</span>
                            <span>{technician.phone}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Status:</span>
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
                            className="flex-1"
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Technician</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {technician.fullName}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteTechnician(technician.id)}
                                  className="bg-red-600 hover:bg-red-700"
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
          </TabsContent>

          {/* System Tab */}
          <TabsContent value="system" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  System Configuration
                </CardTitle>
                <CardDescription>
                  Configure system-wide settings and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Company Information</h3>
                    <div>
                      <Label htmlFor="companyName">Company Name</Label>
                      <Input
                        id="companyName"
                        value={systemSettings.companyName}
                        onChange={(e) => setSystemSettings(prev => ({ ...prev, companyName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="companyEmail">Company Email</Label>
                      <Input
                        id="companyEmail"
                        type="email"
                        value={systemSettings.companyEmail}
                        onChange={(e) => setSystemSettings(prev => ({ ...prev, companyEmail: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="companyPhone">Company Phone</Label>
                      <Input
                        id="companyPhone"
                        value={systemSettings.companyPhone}
                        onChange={(e) => setSystemSettings(prev => ({ ...prev, companyPhone: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Work Settings</h3>
                    <div>
                      <Label htmlFor="workingHoursStart">Working Hours Start</Label>
                      <Input
                        id="workingHoursStart"
                        type="time"
                        value={systemSettings.workingHours.start}
                        onChange={(e) => setSystemSettings(prev => ({ 
                          ...prev, 
                          workingHours: { ...prev.workingHours, start: e.target.value }
                        }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="workingHoursEnd">Working Hours End</Label>
                      <Input
                        id="workingHoursEnd"
                        type="time"
                        value={systemSettings.workingHours.end}
                        onChange={(e) => setSystemSettings(prev => ({ 
                          ...prev, 
                          workingHours: { ...prev.workingHours, end: e.target.value }
                        }))}
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="autoAssignJobs"
                        checked={systemSettings.autoAssignJobs}
                        onChange={(e) => setSystemSettings(prev => ({ ...prev, autoAssignJobs: e.target.checked }))}
                        className="rounded"
                      />
                      <Label htmlFor="autoAssignJobs">Auto-assign jobs to available technicians</Label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveSystemSettings} className="bg-blue-600 hover:bg-blue-700">
                    <Save className="w-4 h-4 mr-2" />
                    Save Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notification Settings
                </CardTitle>
                <CardDescription>
                  Configure notification preferences and delivery methods
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="notificationEnabled"
                    checked={systemSettings.notificationEnabled}
                    onChange={(e) => setSystemSettings(prev => ({ ...prev, notificationEnabled: e.target.checked }))}
                    className="rounded"
                  />
                  <Label htmlFor="notificationEnabled">Enable notifications</Label>
                </div>
                <p className="text-sm text-gray-600">
                  Notifications will be sent for job assignments, status updates, and important system events.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add/Edit Technician Dialog */}
      <Dialog open={addTechnicianDialogOpen || editTechnicianDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddTechnicianDialogOpen(false);
          setEditTechnicianDialogOpen(false);
          setSelectedTechnician(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    type="password"
                    value={technicianFormData.password}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={editTechnicianDialogOpen ? "Enter new password (optional)" : "Enter password"}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setAddTechnicianDialogOpen(false);
                setEditTechnicianDialogOpen(false);
                setSelectedTechnician(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTechnician}
              disabled={!technicianFormData.fullName || !technicianFormData.phone || !technicianFormData.email || !technicianFormData.employeeId || (!editTechnicianDialogOpen && !technicianFormData.password)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editTechnicianDialogOpen ? 'Update Technician' : 'Create Technician'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;