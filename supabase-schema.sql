-- RO Business CRM Database Schema for Supabase
-- This file contains the SQL schema for creating tables in Supabase

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create customers table
CREATE TABLE customers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id VARCHAR(10) NOT NULL UNIQUE, -- Format: C0001, C0002, etc.
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(15) NOT NULL UNIQUE,
    alternate_phone VARCHAR(15),
    email VARCHAR(255) NOT NULL,
    
    -- Address information (stored as JSONB for flexibility)
    address JSONB NOT NULL,
    
    -- Location data (Google Maps integration)
    location JSONB NOT NULL,
    
    -- Service information
    service_type VARCHAR(20) NOT NULL CHECK (service_type IN ('RO', 'SOFTENER', 'AC', 'RO_AC', 'SOFTENER_AC', 'RO_SOFTENER', 'ALL_SERVICES', 'APPLIANCE')),
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    installation_date DATE,
    warranty_expiry DATE,
    
    -- Customer status
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED')),
    customer_since TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_service_date TIMESTAMP WITH TIME ZONE,
    
    -- Additional info
    notes TEXT,
    preferred_time_slot VARCHAR(20) CHECK (preferred_time_slot IN ('MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM')),
    custom_time VARCHAR(10), -- Exact time in HH:MM format when preferred_time_slot is CUSTOM
    preferred_language VARCHAR(20) DEFAULT 'ENGLISH' CHECK (preferred_language IN ('ENGLISH', 'HINDI', 'KANNADA', 'TAMIL', 'TELUGU')),
    
    -- Service cost information
    service_cost DECIMAL(10,2) DEFAULT 0,
    cost_agreed BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create technicians table
CREATE TABLE technicians (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(15) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL,
    employee_id VARCHAR(50) NOT NULL UNIQUE,
    
    -- Skills & Certifications (stored as JSONB)
    skills JSONB NOT NULL,
    
    -- Service Areas (stored as JSONB)
    service_areas JSONB NOT NULL,
    
    -- Current Status
    status VARCHAR(20) DEFAULT 'OFFLINE' CHECK (status IN ('AVAILABLE', 'BUSY', 'OFFLINE', 'ON_BREAK')),
    current_location JSONB,
    
    -- Work Schedule (stored as JSONB)
    work_schedule JSONB NOT NULL,
    
    -- Performance Metrics (stored as JSONB)
    performance JSONB DEFAULT '{"totalJobs": 0, "completedJobs": 0, "averageRating": 0, "onTimePercentage": 0, "customerSatisfaction": 0}',
    
    -- Vehicle/Equipment (stored as JSONB)
    vehicle JSONB,
    
    -- Financial (stored as JSONB)
    salary JSONB NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create jobs table
CREATE TABLE jobs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_number VARCHAR(50) NOT NULL UNIQUE,
    
    -- Customer Info
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    
    -- Service Details
    service_type VARCHAR(20) NOT NULL CHECK (service_type IN ('RO', 'SOFTENER', 'AC', 'APPLIANCE')),
    service_sub_type VARCHAR(50) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    
    -- Assignment
    assigned_technician_id UUID REFERENCES technicians(id) ON DELETE SET NULL,
    assigned_date TIMESTAMP WITH TIME ZONE,
    assigned_by UUID, -- Admin user ID
    
    -- Scheduling
    scheduled_date DATE NOT NULL,
    scheduled_time_slot VARCHAR(20) NOT NULL CHECK (scheduled_time_slot IN ('MORNING', 'AFTERNOON', 'EVENING')),
    estimated_duration INTEGER DEFAULT 120, -- in minutes
    
    -- Location
    service_address JSONB NOT NULL,
    service_location JSONB NOT NULL,
    
    -- Status & Progress
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED')),
    priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    
    -- Job Details
    description TEXT NOT NULL,
    requirements JSONB DEFAULT '[]',
    estimated_cost DECIMAL(10,2) DEFAULT 0,
    actual_cost DECIMAL(10,2),
    
    -- Tracking
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    actual_duration INTEGER, -- in minutes
    
    -- Customer Interaction
    customer_feedback JSONB,
    
    -- Financial
    payment_status VARCHAR(20) DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'PARTIAL', 'REFUNDED')),
    payment_method VARCHAR(20) CHECK (payment_method IN ('CASH', 'CARD', 'UPI', 'BANK_TRANSFER')),
    payment_amount DECIMAL(10,2),
    
    -- Documents
    before_photos JSONB DEFAULT '[]',
    after_photos JSONB DEFAULT '[]',
    invoice_url TEXT,
    warranty_url TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create service areas table (for pincode management)
CREATE TABLE service_areas (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    pincode VARCHAR(6) NOT NULL UNIQUE,
    area_name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create parts inventory table
CREATE TABLE parts_inventory (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('RO_FILTER', 'SOFTENER_SALT', 'AC_GAS', 'GENERAL')),
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100),
    sku VARCHAR(100) NOT NULL UNIQUE,
    price DECIMAL(10,2) NOT NULL,
    stock INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 5,
    supplier VARCHAR(255),
    warranty_months INTEGER DEFAULT 12,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create notifications table
CREATE TABLE notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL, -- Can be customer_id or technician_id
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('CUSTOMER', 'TECHNICIAN', 'ADMIN')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'BOOKING_CONFIRMED', 'JOB_ASSIGNED', etc.
    is_read BOOLEAN DEFAULT false,
    data JSONB, -- Additional data for the notification
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create admin users table (for admin dashboard access)
CREATE TABLE admin_users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(15),
    role VARCHAR(50) DEFAULT 'ADMIN' CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create function to generate customer ID
CREATE OR REPLACE FUNCTION generate_customer_id()
RETURNS TEXT AS $$
DECLARE
    next_id INTEGER;
    customer_id TEXT;
BEGIN
    -- Get the next sequential number
    SELECT COALESCE(MAX(CAST(SUBSTRING(customers.customer_id FROM 2) AS INTEGER)), 0) + 1
    INTO next_id
    FROM customers
    WHERE customers.customer_id ~ '^C[0-9]+$';
    
    -- Format as C0001, C0002, etc.
    customer_id := 'C' || LPAD(next_id::TEXT, 4, '0');
    
    RETURN customer_id;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for better performance
CREATE INDEX idx_customers_customer_id ON customers(customer_id);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_service_type ON customers(service_type);
CREATE INDEX idx_customers_status ON customers(status);

CREATE INDEX idx_technicians_phone ON technicians(phone);
CREATE INDEX idx_technicians_employee_id ON technicians(employee_id);
CREATE INDEX idx_technicians_status ON technicians(status);

CREATE INDEX idx_jobs_customer_id ON jobs(customer_id);
CREATE INDEX idx_jobs_technician_id ON jobs(assigned_technician_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_scheduled_date ON jobs(scheduled_date);
CREATE INDEX idx_jobs_job_number ON jobs(job_number);

CREATE INDEX idx_service_areas_pincode ON service_areas(pincode);
CREATE INDEX idx_service_areas_city ON service_areas(city);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_user_type ON notifications(user_type);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_technicians_updated_at BEFORE UPDATE ON technicians FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_parts_inventory_updated_at BEFORE UPDATE ON parts_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample service areas (Bengaluru pincodes)
INSERT INTO service_areas (pincode, area_name, city, state) VALUES
('560001', 'Bangalore GPO', 'Bangalore', 'Karnataka'),
('560002', 'Bangalore Fort', 'Bangalore', 'Karnataka'),
('560003', 'Bangalore Cantonment', 'Bangalore', 'Karnataka'),
('560004', 'Bangalore City', 'Bangalore', 'Karnataka'),
('560005', 'Bangalore Civil Station', 'Bangalore', 'Karnataka'),
('560006', 'Bangalore High Court', 'Bangalore', 'Karnataka'),
('560007', 'Bangalore Palace', 'Bangalore', 'Karnataka'),
('560008', 'Bangalore University', 'Bangalore', 'Karnataka'),
('560009', 'Bangalore Airport', 'Bangalore', 'Karnataka'),
('560010', 'Bangalore Railway Station', 'Bangalore', 'Karnataka'),
('560011', 'Bangalore Bus Stand', 'Bangalore', 'Karnataka'),
('560012', 'Bangalore Market', 'Bangalore', 'Karnataka'),
('560013', 'Bangalore Hospital', 'Bangalore', 'Karnataka'),
('560014', 'Bangalore School', 'Bangalore', 'Karnataka'),
('560015', 'Bangalore College', 'Bangalore', 'Karnataka'),
('560016', 'Bangalore IT Park', 'Bangalore', 'Karnataka'),
('560017', 'Bangalore Tech Park', 'Bangalore', 'Karnataka'),
('560018', 'Bangalore Industrial Area', 'Bangalore', 'Karnataka'),
('560019', 'Bangalore Residential', 'Bangalore', 'Karnataka'),
('560020', 'Bangalore Suburb', 'Bangalore', 'Karnataka');

-- Insert sample parts inventory
INSERT INTO parts_inventory (name, category, brand, model, sku, price, stock, min_stock, supplier) VALUES
('RO Membrane Filter', 'RO_FILTER', 'Generic', 'Standard', 'RO-MEM-001', 1200.00, 50, 10, 'Water Tech Supplies'),
('Carbon Filter', 'RO_FILTER', 'Generic', 'Standard', 'RO-CAR-001', 800.00, 30, 5, 'Water Tech Supplies'),
('Sediment Filter', 'RO_FILTER', 'Generic', 'Standard', 'RO-SED-001', 400.00, 40, 8, 'Water Tech Supplies'),
('UV Filter', 'RO_FILTER', 'Generic', 'Standard', 'RO-UV-001', 1500.00, 20, 5, 'Water Tech Supplies'),
('Water Softener Salt', 'SOFTENER_SALT', 'Generic', 'Standard', 'WS-SALT-001', 200.00, 100, 20, 'Salt Suppliers'),
('AC Refrigerant Gas', 'AC_GAS', 'Generic', 'R22', 'AC-GAS-001', 2500.00, 10, 3, 'AC Parts Ltd'),
('AC Refrigerant Gas', 'AC_GAS', 'Generic', 'R410A', 'AC-GAS-002', 3000.00, 8, 3, 'AC Parts Ltd');

-- Insert sample admin user
INSERT INTO admin_users (email, full_name, phone, role) VALUES
('admin@roservice.com', 'System Administrator', '+91-9876543210', 'SUPER_ADMIN');

-- Create RLS (Row Level Security) policies
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (for booking form)
CREATE POLICY "Allow public to insert customers" ON customers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public to insert jobs" ON jobs FOR INSERT WITH CHECK (true);

-- Create policies for authenticated users (admin/technician access)
CREATE POLICY "Allow authenticated users to read customers" ON customers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to update customers" ON customers FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to read technicians" ON technicians FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to insert technicians" ON technicians FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to update technicians" ON technicians FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to delete technicians" ON technicians FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to read jobs" ON jobs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to insert jobs" ON jobs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to update jobs" ON jobs FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to delete jobs" ON jobs FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to read service areas" ON service_areas FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to read parts inventory" ON parts_inventory FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to update parts inventory" ON parts_inventory FOR UPDATE USING (auth.role() = 'authenticated');

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
