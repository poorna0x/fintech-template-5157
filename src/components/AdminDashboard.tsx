import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Users, 
  Wrench, 
  Calendar, 
  MapPin, 
  Phone, 
  Mail, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2
} from 'lucide-react';
import { db } from '@/lib/supabase';
import { Customer, Job, Technician } from '@/types';
import { toast } from 'sonner';
import { openInGoogleMaps, extractCoordinates, formatAddressForDisplay } from '@/lib/maps';

const AdminDashboard = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTab, setSelectedTab] = useState('overview');

  // Load data on component mount
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load customers, jobs, and technicians in parallel
      const [customersResult, jobsResult, techniciansResult] = await Promise.all([
        db.customers.getAll(),
        db.jobs.getAll(),
        db.technicians.getAll()
      ]);

      if (customersResult.data) setCustomers(customersResult.data);
      if (jobsResult.data) setJobs(jobsResult.data);
      if (techniciansResult.data) setTechnicians(techniciansResult.data);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignTechnician = async (jobId: string, technicianId: string) => {
    try {
      const { error } = await db.jobs.update(jobId, {
        assignedTechnicianId: technicianId,
        status: 'ASSIGNED',
        assignedDate: new Date().toISOString(),
        assignedBy: 'admin' // In real app, this would be the actual admin user ID
      });

      if (error) {
        throw new Error(error.message);
      }

      toast.success('Technician assigned successfully');
      loadDashboardData(); // Reload data
    } catch (error) {
      console.error('Error assigning technician:', error);
      toast.error('Failed to assign technician');
    }
  };

  const handleUpdateJobStatus = async (jobId: string, status: string) => {
    try {
      const { error } = await db.jobs.update(jobId, {
        status: status as any,
        ...(status === 'COMPLETED' && { completedAt: new Date().toISOString() })
      });

      if (error) {
        throw new Error(error.message);
      }

      toast.success('Job status updated successfully');
      loadDashboardData(); // Reload data
    } catch (error) {
      console.error('Error updating job status:', error);
      toast.error('Failed to update job status');
    }
  };

  const handleAddressClick = (job: Job) => {
    console.log('Job location data:', job.location);
    const location = extractCoordinates(job.location);
    console.log('Extracted coordinates:', location);
    
    if (location) {
      const address = formatAddressForDisplay(job.customer?.address || '');
      console.log('Opening Google Maps with:', { location, address });
      openInGoogleMaps(location, address);
    } else {
      console.error('No location data found for job:', job.id);
      toast.error('Location data not available');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      PENDING: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      ASSIGNED: { color: 'bg-blue-100 text-blue-800', icon: Calendar },
      IN_PROGRESS: { color: 'bg-orange-100 text-orange-800', icon: Wrench },
      COMPLETED: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      CANCELLED: { color: 'bg-red-100 text-red-800', icon: AlertCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.PENDING;
    const Icon = config.icon;

    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig = {
      LOW: 'bg-gray-100 text-gray-800',
      MEDIUM: 'bg-blue-100 text-blue-800',
      HIGH: 'bg-orange-100 text-orange-800',
      URGENT: 'bg-red-100 text-red-800',
    };

    return (
      <Badge className={priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.MEDIUM}>
        {priority}
      </Badge>
    );
  };

  // Filter data based on search term
  const filteredCustomers = customers.filter(customer =>
    customer.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm) ||
    customer.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredJobs = jobs.filter(job =>
    job.jobNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.customer?.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.customer?.phone.includes(searchTerm)
  );

  const pendingJobs = jobs.filter(job => job.status === 'PENDING');
  const assignedJobs = jobs.filter(job => job.status === 'ASSIGNED');
  const inProgressJobs = jobs.filter(job => job.status === 'IN_PROGRESS');
  const completedJobs = jobs.filter(job => job.status === 'COMPLETED');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage customers, jobs, and technicians</p>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search customers, jobs, or technicians..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{customers.length}</div>
              <p className="text-xs text-muted-foreground">
                {customers.filter(c => c.status === 'ACTIVE').length} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Jobs</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingJobs.length}</div>
              <p className="text-xs text-muted-foreground">
                {assignedJobs.length} assigned
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{inProgressJobs.length}</div>
              <p className="text-xs text-muted-foreground">
                {completedJobs.length} completed today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Technicians</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{technicians.length}</div>
              <p className="text-xs text-muted-foreground">
                {technicians.filter(t => t.status === 'AVAILABLE').length} available
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="technicians">Technicians</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Jobs */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Jobs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {jobs.slice(0, 5).map((job) => (
                      <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{job.jobNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            {job.customer?.fullName} - {job.serviceType}
                          </p>
                        </div>
                        {getStatusBadge(job.status)}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Available Technicians */}
              <Card>
                <CardHeader>
                  <CardTitle>Available Technicians</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {technicians.filter(t => t.status === 'AVAILABLE').slice(0, 5).map((technician) => (
                      <div key={technician.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{technician.fullName}</p>
                          <p className="text-sm text-muted-foreground">
                            {technician.skills.serviceTypes.join(', ')}
                          </p>
                        </div>
                        <Badge className="bg-green-100 text-green-800">Available</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Jobs Tab */}
          <TabsContent value="jobs" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All Jobs</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Technician</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredJobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-medium">{job.jobNumber}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{job.customer?.fullName}</p>
                            <p className="text-sm text-muted-foreground">{job.customer?.phone}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{job.serviceType}</p>
                            <p className="text-sm text-muted-foreground">{job.serviceSubType}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => handleAddressClick(job)}
                            className="p-0 h-auto text-left justify-start"
                          >
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              <span className="text-xs max-w-32 truncate">
                                {formatAddressForDisplay(job.customer?.address || '')}
                              </span>
                            </div>
                          </Button>
                        </TableCell>
                        <TableCell>{getStatusBadge(job.status)}</TableCell>
                        <TableCell>{getPriorityBadge(job.priority)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{new Date(job.scheduledDate).toLocaleDateString()}</p>
                            <p className="text-xs text-muted-foreground">{job.scheduledTimeSlot}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {job.assignedTechnician ? (
                            <p className="text-sm">{job.assignedTechnician.fullName}</p>
                          ) : (
                            <Select onValueChange={(value) => handleAssignTechnician(job.id, value)}>
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Assign" />
                              </SelectTrigger>
                              <SelectContent>
                                {technicians.filter(t => t.status === 'AVAILABLE').map((tech) => (
                                  <SelectItem key={tech.id} value={tech.id}>
                                    {tech.fullName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline">
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Select onValueChange={(value) => handleUpdateJobStatus(job.id, value)}>
                              <SelectTrigger className="w-32">
                                <SelectValue placeholder="Status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PENDING">Pending</SelectItem>
                                <SelectItem value="ASSIGNED">Assigned</SelectItem>
                                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                                <SelectItem value="COMPLETED">Completed</SelectItem>
                                <SelectItem value="CANCELLED">Cancelled</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All Customers</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Service Type</TableHead>
                      <TableHead>Brand/Model</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">{customer.fullName}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{customer.phone}</p>
                            <p className="text-sm text-muted-foreground">{customer.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{customer.serviceType}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{customer.brand}</p>
                            <p className="text-xs text-muted-foreground">{customer.model}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => {
                              const location = extractCoordinates(customer.location);
                              if (location) {
                                const address = formatAddressForDisplay(customer.address);
                                openInGoogleMaps(location, address);
                              } else {
                                toast.error('Location data not available');
                              }
                            }}
                            className="p-0 h-auto text-left justify-start"
                          >
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              <span className="text-xs max-w-32 truncate">
                                {formatAddressForDisplay(customer.address)}
                              </span>
                            </div>
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge className={customer.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                            {customer.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline">
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Edit className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Technicians Tab */}
          <TabsContent value="technicians" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All Technicians</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Skills</TableHead>
                      <TableHead>Service Areas</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Performance</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {technicians.map((technician) => (
                      <TableRow key={technician.id}>
                        <TableCell className="font-medium">{technician.fullName}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{technician.phone}</p>
                            <p className="text-sm text-muted-foreground">{technician.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {technician.skills.serviceTypes.map((skill) => (
                              <Badge key={skill} variant="outline" className="text-xs">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{technician.serviceAreas.pincodes.length} pincodes</p>
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            technician.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                            technician.status === 'BUSY' ? 'bg-orange-100 text-orange-800' :
                            'bg-gray-100 text-gray-800'
                          }>
                            {technician.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">Rating: {technician.performance.averageRating}/5</p>
                            <p className="text-xs text-muted-foreground">
                              {technician.performance.completedJobs} jobs
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline">
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Edit className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
