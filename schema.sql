--
-- PostgreSQL database dump
--

\restrict D7NUovo1xMTzc7nLETKxTMBxkPnV3bofSBtek1ytHJk2QZhXRFtTaesj118JM1t

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: backfill_technician_payments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.backfill_technician_payments() RETURNS TABLE(created_count integer, skipped_count integer, error_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    job_record RECORD;
    created_count INTEGER := 0;
    skipped_count INTEGER := 0;
    error_count INTEGER := 0;
BEGIN
    -- Loop through all completed jobs that have assigned technicians (removed > 0 check)
    FOR job_record IN 
        SELECT 
            j.id as job_id,
            j.assigned_technician_id,
            j.payment_amount,
            j.actual_cost,
            j.status
        FROM jobs j
        WHERE j.status = 'COMPLETED'
          AND j.assigned_technician_id IS NOT NULL
    LOOP
        BEGIN
            -- Check if payment record already exists
            IF NOT EXISTS (
                SELECT 1 FROM technician_payments 
                WHERE job_id = job_record.job_id
            ) THEN
                -- Create payment record (even if amount is 0)
                INSERT INTO technician_payments (
                    technician_id,
                    job_id,
                    bill_amount,
                    commission_percentage,
                    commission_amount,
                    payment_status
                ) VALUES (
                    job_record.assigned_technician_id,
                    job_record.job_id,
                    COALESCE(job_record.payment_amount, job_record.actual_cost, 0),
                    10.00,
                    COALESCE(job_record.payment_amount, job_record.actual_cost, 0) * 0.10,
                    'PENDING'
                );
                created_count := created_count + 1;
            ELSE
                skipped_count := skipped_count + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
            -- Log error but continue processing
            RAISE WARNING 'Error creating payment for job %: %', job_record.job_id, SQLERRM;
        END;
    END LOOP;
    
    RETURN QUERY SELECT created_count, skipped_count, error_count;
END;
$$;


--
-- Name: cancel_other_assignment_requests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_other_assignment_requests() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only proceed if the new status is 'ACCEPTED'
    IF NEW.status = 'ACCEPTED' AND OLD.status != 'ACCEPTED' THEN
        -- Cancel all other pending requests for the same job
        UPDATE job_assignment_requests 
        SET 
            status = 'CANCELLED',
            updated_at = NOW()
        WHERE 
            job_id = NEW.job_id 
            AND technician_id != NEW.technician_id 
            AND status = 'PENDING';
            
        -- Update the job to assign it to the accepting technician
        UPDATE jobs 
        SET 
            assigned_technician_id = NEW.technician_id,
            assigned_date = NOW(),
            status = 'ASSIGNED',
            updated_at = NOW()
        WHERE id = NEW.job_id;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: create_technician_payment_on_job_completion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_technician_payment_on_job_completion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    -- Only create payment if job status changed to COMPLETED
    -- and has assigned technician (removed the > 0 check to allow zero amounts)
    IF NEW.status = 'COMPLETED' 
       AND OLD.status != 'COMPLETED'
       AND NEW.assigned_technician_id IS NOT NULL THEN
        
        -- Check if payment record already exists
        IF NOT EXISTS (
            SELECT 1 FROM technician_payments 
            WHERE job_id = NEW.id
        ) THEN
            INSERT INTO technician_payments (
                technician_id,
                job_id,
                bill_amount,
                commission_percentage,
                commission_amount,
                payment_status
            ) VALUES (
                NEW.assigned_technician_id,
                NEW.id,
                COALESCE(NEW.payment_amount, NEW.actual_cost, 0),
                10.00,
                COALESCE(NEW.payment_amount, NEW.actual_cost, 0) * 0.10,
                'PENDING'
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: generate_customer_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_customer_id() RETURNS text
    LANGUAGE plpgsql
    AS $_$
DECLARE
    next_id INTEGER;
    customer_id TEXT;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(customers.customer_id FROM 2) AS INTEGER)), 0) + 1
    INTO next_id
    FROM customers
    WHERE customers.customer_id ~ '^C[0-9]+$';
    
    customer_id := 'C' || LPAD(next_id::TEXT, 4, '0');
    
    RETURN customer_id;
END;
$_$;


--
-- Name: get_all_banner_messages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_banner_messages() RETURNS TABLE(id uuid, title character varying, content text, message_type character varying, priority character varying, sender_id uuid, sender_name character varying, recipient_type character varying, recipient_technician_id uuid, recipient_technician_ids uuid[], status character varying, show_as_banner boolean, banner_duration integer, show_in_dashboard boolean, has_action boolean, action_text character varying, action_url text, action_data jsonb, sent_at timestamp with time zone, delivered_at timestamp with time zone, read_at timestamp with time zone, expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, recipient_display_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT 
        m.id,
        m.title,
        m.content,
        m.message_type,
        m.priority,
        m.sender_id,
        m.sender_name,
        m.recipient_type,
        m.recipient_technician_id,
        m.recipient_technician_ids,
        m.status,
        m.show_as_banner,
        m.banner_duration,
        m.show_in_dashboard,
        m.has_action,
        m.action_text,
        m.action_url,
        m.action_data,
        m.sent_at,
        m.delivered_at,
        m.read_at,
        m.expires_at,
        m.created_at,
        m.updated_at,
        CASE 
            WHEN m.recipient_type = 'ALL' THEN 'All Technicians'
            WHEN m.recipient_type = 'TECHNICIAN' THEN t.full_name
            ELSE 'Multiple Technicians'
        END as recipient_display_name
    FROM public.messages m
    LEFT JOIN public.technicians t ON m.recipient_technician_id = t.id
    WHERE m.show_as_banner = true 
        AND m.status IN ('SENT', 'DELIVERED')
        AND (m.expires_at IS NULL OR m.expires_at > NOW())
    ORDER BY m.priority DESC, m.sent_at DESC;
$$;


--
-- Name: get_banner_messages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_banner_messages() RETURNS TABLE(id uuid, title character varying, content text, message_type character varying, priority character varying, sender_id uuid, sender_name character varying, recipient_type character varying, recipient_technician_id uuid, recipient_technician_ids uuid[], status character varying, show_as_banner boolean, banner_duration integer, show_in_dashboard boolean, has_action boolean, action_text character varying, action_url text, action_data jsonb, sent_at timestamp with time zone, delivered_at timestamp with time zone, read_at timestamp with time zone, expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, recipient_display_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT 
        m.id,
        m.title,
        m.content,
        m.message_type,
        m.priority,
        m.sender_id,
        m.sender_name,
        m.recipient_type,
        m.recipient_technician_id,
        m.recipient_technician_ids,
        m.status,
        m.show_as_banner,
        m.banner_duration,
        m.show_in_dashboard,
        m.has_action,
        m.action_text,
        m.action_url,
        m.action_data,
        m.sent_at,
        m.delivered_at,
        m.read_at,
        m.expires_at,
        m.created_at,
        m.updated_at,
        CASE 
            WHEN m.recipient_type = 'ALL' THEN 'All Technicians'
            WHEN m.recipient_type = 'TECHNICIAN' THEN t.full_name
            ELSE 'Multiple Technicians'
        END as recipient_display_name
    FROM public.messages m
    LEFT JOIN public.technicians t ON m.recipient_technician_id = t.id
    WHERE m.show_as_banner = true 
        AND m.status IN ('SENT', 'DELIVERED')
        AND (m.expires_at IS NULL OR m.expires_at > NOW())
    ORDER BY m.priority DESC, m.sent_at DESC;
$$;


--
-- Name: get_next_invoice_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_invoice_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $_$
DECLARE
    current_year INTEGER;
    current_month INTEGER;
    year_month_prefix VARCHAR(10);
    last_number VARCHAR(50);
    last_prefix VARCHAR(10);
    next_num INTEGER := 1;
    result VARCHAR(50);
BEGIN
    -- Get current year and month
    current_year := EXTRACT(YEAR FROM CURRENT_DATE);
    current_month := EXTRACT(MONTH FROM CURRENT_DATE);
    year_month_prefix := 'INV-' || current_year || '-' || LPAD(current_month::TEXT, 2, '0');
    
    -- Get the last invoice number for this month/year
    SELECT invoice_number INTO last_number
    FROM tax_invoices
    WHERE invoice_number LIKE year_month_prefix || '-%'
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- If no invoice exists for this month/year, start from 001
    IF last_number IS NOT NULL THEN
        -- Extract the sequence number (last 3 digits after the last dash)
        -- Pattern: INV-YYYY-MM-XXX, extract XXX
        next_num := CAST(SUBSTRING(last_number FROM '([0-9]{3})$') AS INTEGER) + 1;
    END IF;
    
    -- Format as INV-YYYY-MM-XXX
    result := year_month_prefix || '-' || LPAD(next_num::TEXT, 3, '0');
    
    RETURN result;
END;
$_$;


--
-- Name: get_technician_banner_messages(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_technician_banner_messages(technician_id_param uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, title character varying, content text, message_type character varying, priority character varying, sender_id uuid, sender_name character varying, recipient_type character varying, recipient_technician_id uuid, recipient_technician_ids uuid[], status character varying, show_as_banner boolean, banner_duration integer, show_in_dashboard boolean, has_action boolean, action_text character varying, action_url text, action_data jsonb, sent_at timestamp with time zone, delivered_at timestamp with time zone, read_at timestamp with time zone, expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, recipient_display_name text)
    LANGUAGE sql STABLE
    AS $$
    SELECT 
        m.id,
        m.title,
        m.content,
        m.message_type,
        m.priority,
        m.sender_id,
        m.sender_name,
        m.recipient_type,
        m.recipient_technician_id,
        m.recipient_technician_ids,
        m.status,
        m.show_as_banner,
        m.banner_duration,
        m.show_in_dashboard,
        m.has_action,
        m.action_text,
        m.action_url,
        m.action_data,
        m.sent_at,
        m.delivered_at,
        m.read_at,
        m.expires_at,
        m.created_at,
        m.updated_at,
        CASE 
            WHEN m.recipient_type = 'ALL' THEN 'All Technicians'
            WHEN m.recipient_type = 'TECHNICIAN' THEN t.full_name
            ELSE 'Multiple Technicians'
        END as recipient_display_name
    FROM public.messages m
    LEFT JOIN public.technicians t ON m.recipient_technician_id = t.id
    WHERE m.show_as_banner = true 
        AND m.status IN ('SENT', 'DELIVERED')
        AND (m.expires_at IS NULL OR m.expires_at > NOW())
        AND (
            technician_id_param IS NULL 
            OR m.recipient_type = 'ALL'
            OR m.recipient_technician_id = technician_id_param
            OR (m.recipient_technician_ids IS NOT NULL AND technician_id_param = ANY(m.recipient_technician_ids))
        )
    ORDER BY m.priority DESC, m.sent_at DESC;
$$;


--
-- Name: mark_message_delivered(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_message_delivered() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- If message is being marked as read and hasn't been delivered yet
    IF NEW.status = 'READ' AND (OLD.status IS NULL OR OLD.status != 'DELIVERED') THEN
        NEW.delivered_at = NOW();
        NEW.status = 'DELIVERED';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: remove_follow_ups_on_completion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_follow_ups_on_completion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- If job status changed to COMPLETED, mark all pending follow-ups as completed
    IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
        UPDATE follow_ups
        SET completed = TRUE,
            completed_at = NOW()
        WHERE job_id = NEW.id 
        AND completed = FALSE;
        
        -- Also update job status if it was FOLLOW_UP
        IF OLD.status = 'FOLLOW_UP' THEN
            -- Keep FOLLOW_UP status but update follow-up tracking
            NEW.follow_up_date = NULL;
            NEW.follow_up_time = NULL;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: set_customer_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_customer_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only set if not provided
    IF NEW.customer_id IS NULL THEN
        NEW.customer_id := generate_customer_id();
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: update_call_history_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_call_history_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_follow_ups_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_follow_ups_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_inventory_bundles_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_inventory_bundles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_inventory_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_inventory_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_job_assignment_requests_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_job_assignment_requests_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_job_completion_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_job_completion_fields() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- If status changed to COMPLETED, set completion fields
    IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
        NEW.completed_at = NOW();
        NEW.end_time = NOW();
    END IF;
    
    -- If status changed to DENIED, set denial fields
    IF NEW.status = 'DENIED' AND OLD.status != 'DENIED' THEN
        NEW.denied_at = NOW();
    END IF;
    
    -- If status changed to FOLLOW_UP, set follow-up fields
    IF NEW.status = 'FOLLOW_UP' AND OLD.status != 'FOLLOW_UP' THEN
        NEW.follow_up_scheduled_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: update_technician_inventory_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_technician_inventory_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_user_push_tokens_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_push_tokens_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_todos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_todos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    email character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    phone character varying(15),
    role character varying(50) DEFAULT 'ADMIN'::character varying,
    is_active boolean DEFAULT true,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT admin_users_role_check CHECK (((role)::text = ANY ((ARRAY['SUPER_ADMIN'::character varying, 'ADMIN'::character varying, 'MANAGER'::character varying])::text[])))
);


--
-- Name: amc_contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.amc_contracts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    customer_id uuid NOT NULL,
    job_id uuid,
    start_date date NOT NULL,
    end_date date NOT NULL,
    years integer NOT NULL,
    includes_prefilter boolean DEFAULT false,
    additional_info text,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    renewed_from_amc_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    service_period_months integer,
    CONSTRAINT amc_contracts_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'EXPIRED'::character varying, 'CANCELLED'::character varying, 'RENEWED'::character varying])::text[])))
);


--
-- Name: COLUMN amc_contracts.service_period_months; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.amc_contracts.service_period_months IS 'Months between auto-created AMC service jobs. NULL = use app default, 0 = no auto, 4/6/custom = months.';


--
-- Name: business_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_expenses (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    amount numeric(10,2) NOT NULL,
    description text NOT NULL,
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    category character varying(50),
    receipt_url text,
    notes text,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: call_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_history (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    customer_id uuid NOT NULL,
    contact_type character varying(20) NOT NULL,
    contact_method character varying(50),
    phone_number character varying(15),
    message_sent text,
    status character varying(20) DEFAULT 'COMPLETED'::character varying,
    notes text,
    contacted_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT call_history_contact_type_check CHECK (((contact_type)::text = ANY ((ARRAY['CALL'::character varying, 'WHATSAPP'::character varying, 'SMS'::character varying, 'EMAIL'::character varying])::text[]))),
    CONSTRAINT call_history_status_check CHECK (((status)::text = ANY ((ARRAY['COMPLETED'::character varying, 'FAILED'::character varying, 'NO_ANSWER'::character varying, 'BUSY'::character varying])::text[])))
);


--
-- Name: common_qr_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.common_qr_codes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    qr_code_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    full_name character varying(255) NOT NULL,
    phone character varying(15) NOT NULL,
    alternate_phone character varying(15),
    email character varying(255) NOT NULL,
    address jsonb NOT NULL,
    location jsonb NOT NULL,
    service_type character varying(20) NOT NULL,
    brand character varying(100) NOT NULL,
    model character varying(100) NOT NULL,
    installation_date date,
    warranty_expiry date,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    customer_since timestamp with time zone DEFAULT now(),
    last_service_date timestamp with time zone,
    notes text,
    preferred_time_slot character varying(20),
    preferred_language character varying(20) DEFAULT 'ENGLISH'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    customer_id character varying(10) NOT NULL,
    visible_address character varying(100),
    custom_time character varying(10),
    has_prefilter boolean,
    raw_water_tds integer,
    photos jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT customers_preferred_language_check CHECK (((preferred_language)::text = ANY ((ARRAY['ENGLISH'::character varying, 'HINDI'::character varying, 'KANNADA'::character varying, 'TAMIL'::character varying, 'TELUGU'::character varying])::text[]))),
    CONSTRAINT customers_preferred_time_slot_check CHECK (((preferred_time_slot)::text = ANY ((ARRAY['MORNING'::character varying, 'AFTERNOON'::character varying, 'EVENING'::character varying, 'CUSTOM'::character varying])::text[]))),
    CONSTRAINT customers_service_type_check CHECK (((service_type)::text = ANY (ARRAY['RO'::text, 'SOFTENER'::text, 'RO_SOFTENER'::text]))),
    CONSTRAINT customers_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying, 'BLOCKED'::character varying])::text[])))
);


--
-- Name: COLUMN customers.visible_address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.visible_address IS 'Location identifier for quick address recognition (e.g., Home, Office, Shop, Main Branch) - max 100 characters';


--
-- Name: COLUMN customers.custom_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.custom_time IS 'Exact time in HH:MM format when preferred_time_slot is CUSTOM';


--
-- Name: COLUMN customers.has_prefilter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.has_prefilter IS 'Indicates whether the customer has a prefilter installed. NULL means not set/unknown, true means yes, false means no.';


--
-- Name: COLUMN customers.raw_water_tds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.raw_water_tds IS 'Raw water TDS in ppm (before RO purification). Captured at job completion for RO customers (prefilter step). Default 0 for existing records.';


--
-- Name: COLUMN customers.photos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.photos IS 'Array of photo URLs attached to the customer (e.g. profile/reference photos), not tied to any job.';


--
-- Name: follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_ups (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    job_id uuid NOT NULL,
    parent_follow_up_id uuid,
    follow_up_date date NOT NULL,
    follow_up_time character varying(10),
    reason text NOT NULL,
    notes text,
    scheduled_by uuid,
    scheduled_at timestamp with time zone DEFAULT now(),
    completed boolean DEFAULT false,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE follow_ups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.follow_ups IS 'Stores nested follow-ups for jobs';


--
-- Name: COLUMN follow_ups.parent_follow_up_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.follow_ups.parent_follow_up_id IS 'Reference to parent follow-up for nested follow-ups';


--
-- Name: COLUMN follow_ups.reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.follow_ups.reason IS 'Reason for the follow-up (e.g., need new RO, not picking, not confirmed)';


--
-- Name: COLUMN follow_ups.completed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.follow_ups.completed IS 'Whether this follow-up was completed (task done elsewhere)';


--
-- Name: inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    product_name character varying(255) NOT NULL,
    code character varying(100),
    price numeric(10,2) DEFAULT 0 NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT inventory_quantity_check CHECK ((quantity >= 0))
);


--
-- Name: inventory_bundle_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_bundle_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    bundle_id uuid NOT NULL,
    inventory_id uuid NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT inventory_bundle_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: inventory_bundles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_bundles (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: job_assignment_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_assignment_requests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    job_id uuid NOT NULL,
    technician_id uuid NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now(),
    responded_at timestamp with time zone,
    response_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT job_assignment_requests_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACCEPTED'::character varying, 'REJECTED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: job_parts_used; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_parts_used (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    job_id uuid NOT NULL,
    technician_id uuid NOT NULL,
    inventory_id uuid NOT NULL,
    quantity_used integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    price_at_time_of_use numeric(10,2),
    CONSTRAINT job_parts_used_quantity_used_check CHECK ((quantity_used > 0))
);


--
-- Name: COLUMN job_parts_used.price_at_time_of_use; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.job_parts_used.price_at_time_of_use IS 'Price of the inventory item at the time it was used (for historical accuracy in analytics). Stored when part is added to job.';


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    job_number character varying(50) NOT NULL,
    customer_id uuid NOT NULL,
    service_type character varying(20) NOT NULL,
    service_sub_type character varying(50) NOT NULL,
    brand character varying(100) NOT NULL,
    model character varying(100) NOT NULL,
    assigned_technician_id uuid,
    assigned_date timestamp with time zone,
    assigned_by uuid,
    scheduled_date date NOT NULL,
    scheduled_time_slot character varying(20) NOT NULL,
    estimated_duration integer DEFAULT 120,
    service_address jsonb NOT NULL,
    service_location jsonb NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    priority character varying(20) DEFAULT 'MEDIUM'::character varying,
    description text NOT NULL,
    requirements jsonb DEFAULT '[]'::jsonb,
    estimated_cost numeric(10,2) DEFAULT 0,
    actual_cost numeric(10,2),
    start_time timestamp with time zone,
    end_time timestamp with time zone,
    actual_duration integer,
    customer_feedback jsonb,
    payment_status character varying(20) DEFAULT 'PENDING'::character varying,
    payment_method character varying(20),
    payment_amount numeric(10,2),
    before_photos jsonb DEFAULT '[]'::jsonb,
    after_photos jsonb DEFAULT '[]'::jsonb,
    invoice_url text,
    warranty_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    images jsonb DEFAULT '[]'::jsonb,
    follow_up_date date,
    follow_up_time character varying(10),
    follow_up_notes text,
    follow_up_scheduled_by uuid,
    follow_up_scheduled_at timestamp with time zone,
    denial_reason text,
    denied_at timestamp with time zone,
    completion_notes text,
    completed_by uuid,
    denied_by character varying(255),
    team_members jsonb DEFAULT '[]'::jsonb,
    lead_cost numeric(10,2) DEFAULT 0,
    parts_cost_total numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT jobs_payment_method_check CHECK (((payment_method IS NULL) OR ((payment_method)::text = ANY (ARRAY['CASH'::text, 'CARD'::text, 'UPI'::text, 'BANK_TRANSFER'::text, 'PARTIAL'::text])))),
    CONSTRAINT jobs_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['PENDING'::character varying, 'PAID'::character varying, 'PARTIAL'::character varying, 'REFUNDED'::character varying])::text[]))),
    CONSTRAINT jobs_priority_check CHECK (((priority)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'URGENT'::character varying])::text[]))),
    CONSTRAINT jobs_scheduled_time_slot_check CHECK (((scheduled_time_slot)::text = ANY ((ARRAY['MORNING'::character varying, 'AFTERNOON'::character varying, 'EVENING'::character varying, 'FIRST_HALF'::character varying, 'SECOND_HALF'::character varying])::text[]))),
    CONSTRAINT jobs_service_type_check CHECK (((service_type)::text = ANY ((ARRAY['RO'::character varying, 'SOFTENER'::character varying, 'AC'::character varying, 'APPLIANCE'::character varying])::text[]))),
    CONSTRAINT jobs_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ASSIGNED'::character varying, 'EN_ROUTE'::character varying, 'IN_PROGRESS'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying, 'RESCHEDULED'::character varying, 'FOLLOW_UP'::character varying, 'DENIED'::character varying])::text[])))
);


--
-- Name: COLUMN jobs.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.status IS 'Job status: PENDING, ASSIGNED, EN_ROUTE (technician going to location), IN_PROGRESS (at location working), COMPLETED, CANCELLED, RESCHEDULED, FOLLOW_UP, DENIED';


--
-- Name: COLUMN jobs.payment_method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.payment_method IS 'CASH, ONLINE (UPI/CARD/BANK_TRANSFER), or PARTIAL (split cash+online; see requirements.partial_cash_amount, partial_online_amount)';


--
-- Name: COLUMN jobs.completed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.completed_at IS 'When the job was marked as completed';


--
-- Name: COLUMN jobs.images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.images IS 'Array of image URLs uploaded by customer during booking';


--
-- Name: COLUMN jobs.follow_up_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.follow_up_date IS 'Scheduled follow-up date';


--
-- Name: COLUMN jobs.follow_up_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.follow_up_time IS 'Scheduled follow-up time (HH:MM format)';


--
-- Name: COLUMN jobs.follow_up_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.follow_up_notes IS 'Notes for the follow-up appointment';


--
-- Name: COLUMN jobs.follow_up_scheduled_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.follow_up_scheduled_by IS 'User ID who scheduled the follow-up';


--
-- Name: COLUMN jobs.follow_up_scheduled_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.follow_up_scheduled_at IS 'When the follow-up was scheduled';


--
-- Name: COLUMN jobs.denial_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.denial_reason IS 'Reason for job denial';


--
-- Name: COLUMN jobs.denied_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.denied_at IS 'When the job was denied';


--
-- Name: COLUMN jobs.completion_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.completion_notes IS 'Notes about job completion';


--
-- Name: COLUMN jobs.completed_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.completed_by IS 'User ID who marked job as completed';


--
-- Name: COLUMN jobs.team_members; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.team_members IS 'Array of technician IDs who are teammates for this job. Primary assigned technician is in assigned_technician_id.';


--
-- Name: COLUMN jobs.parts_cost_total; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.parts_cost_total IS 'Total cost of parts used on this job (denormalized from job_parts_used for fast analytics).';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    user_type character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    type character varying(50) NOT NULL,
    is_read boolean DEFAULT false,
    data jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notifications_user_type_check CHECK (((user_type)::text = ANY ((ARRAY['CUSTOMER'::character varying, 'TECHNICIAN'::character varying, 'ADMIN'::character varying])::text[])))
);


--
-- Name: other_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.other_expenses (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    amount numeric(10,2) NOT NULL,
    description text NOT NULL,
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    category character varying(50),
    receipt_url text,
    notes text,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: parts_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parts_inventory (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    category character varying(50) NOT NULL,
    brand character varying(100) NOT NULL,
    model character varying(100),
    sku character varying(100) NOT NULL,
    price numeric(10,2) NOT NULL,
    stock integer DEFAULT 0,
    min_stock integer DEFAULT 5,
    supplier character varying(255),
    warranty_months integer DEFAULT 12,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT parts_inventory_category_check CHECK (((category)::text = ANY ((ARRAY['RO_FILTER'::character varying, 'SOFTENER_SALT'::character varying, 'AC_GAS'::character varying, 'GENERAL'::character varying])::text[])))
);


--
-- Name: product_qr_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_qr_codes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    qr_code_url text NOT NULL,
    product_name character varying(255),
    product_description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    product_image_url text,
    product_mrp character varying(50)
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    entity_type character varying(20) DEFAULT 'general'::character varying NOT NULL,
    entity_id uuid,
    title text NOT NULL,
    notes text,
    reminder_at date NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    interval_type character varying(10),
    interval_value integer,
    CONSTRAINT reminders_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['customer'::character varying, 'job'::character varying, 'general'::character varying])::text[]))),
    CONSTRAINT reminders_interval_type_check CHECK (((interval_type IS NULL) OR ((interval_type)::text = ANY ((ARRAY['days'::character varying, 'months'::character varying])::text[]))))
);


--
-- Name: TABLE reminders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reminders IS 'Reminders for today/tomorrow; app loads with single query. No cron.';


--
-- Name: COLUMN reminders.entity_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reminders.entity_type IS 'customer | job | general';


--
-- Name: COLUMN reminders.entity_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reminders.entity_id IS 'customer_id or job_id when entity_type is customer or job';


--
-- Name: COLUMN reminders.reminder_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reminders.reminder_at IS 'Date to show reminder (app shows today + tomorrow)';


--
-- Name: COLUMN reminders.completed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reminders.completed_at IS 'When user marked done; null = still active';


--
-- Name: COLUMN reminders.interval_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reminders.interval_type IS 'null = one-time, ''days'' or ''months'' = repeat';


--
-- Name: COLUMN reminders.interval_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reminders.interval_value IS 'Repeat every N days or N months (used when interval_type is set)';


--
-- Name: service_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_areas (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    pincode character varying(6) NOT NULL,
    area_name character varying(255) NOT NULL,
    city character varying(100) NOT NULL,
    state character varying(100) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tax_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_invoices (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    invoice_number character varying(50) NOT NULL,
    invoice_date date NOT NULL,
    invoice_type character varying(3) NOT NULL,
    customer_id uuid,
    customer_name character varying(255) NOT NULL,
    customer_address jsonb NOT NULL,
    customer_phone character varying(15),
    customer_email character varying(255),
    customer_gstin character varying(15),
    company_info jsonb NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    place_of_supply character varying(100),
    place_of_supply_code character varying(10),
    is_intra_state boolean DEFAULT false,
    reverse_charge boolean DEFAULT false,
    e_way_bill_no character varying(50),
    transport_mode character varying(50),
    vehicle_no character varying(50),
    subtotal numeric(10,2) DEFAULT 0 NOT NULL,
    total_discount numeric(10,2) DEFAULT 0 NOT NULL,
    service_charge numeric(10,2) DEFAULT 0 NOT NULL,
    total_tax numeric(10,2) DEFAULT 0 NOT NULL,
    cgst numeric(10,2) DEFAULT 0 NOT NULL,
    sgst numeric(10,2) DEFAULT 0 NOT NULL,
    igst numeric(10,2) DEFAULT 0 NOT NULL,
    round_off numeric(10,2) DEFAULT 0 NOT NULL,
    total_amount numeric(10,2) DEFAULT 0 NOT NULL,
    gst_breakup jsonb,
    invoice_details jsonb,
    bank_details jsonb,
    notes jsonb DEFAULT '[]'::jsonb,
    terms text,
    validity_note text,
    job_id uuid,
    service_type character varying(20),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tax_invoices_invoice_type_check CHECK (((invoice_type)::text = ANY ((ARRAY['B2B'::character varying, 'B2C'::character varying])::text[])))
);


--
-- Name: technician_advances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technician_advances (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    technician_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    description text,
    advance_date date DEFAULT CURRENT_DATE NOT NULL,
    payment_method character varying(20),
    payment_reference text,
    notes text,
    paid_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT technician_advances_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['CASH'::character varying, 'BANK_TRANSFER'::character varying, 'UPI'::character varying, 'CHEQUE'::character varying])::text[])))
);


--
-- Name: technician_common_qr; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technician_common_qr (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    qr_code_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: technician_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technician_expenses (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    technician_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    description text NOT NULL,
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    category character varying(50),
    receipt_url text,
    notes text,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: technician_extra_commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technician_extra_commissions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    technician_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    description text NOT NULL,
    commission_date date DEFAULT CURRENT_DATE NOT NULL,
    payment_method character varying(20) DEFAULT 'CASH'::character varying,
    payment_reference text,
    notes text,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT technician_extra_commissions_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['CASH'::character varying, 'BANK_TRANSFER'::character varying, 'UPI'::character varying, 'CHEQUE'::character varying])::text[])))
);


--
-- Name: technician_holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technician_holidays (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    technician_id uuid NOT NULL,
    holiday_date date NOT NULL,
    is_manual boolean DEFAULT false,
    reason text,
    notes text,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: technician_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technician_inventory (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    technician_id uuid NOT NULL,
    inventory_id uuid NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT technician_inventory_quantity_check CHECK ((quantity >= 0))
);


--
-- Name: technician_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technician_payments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    technician_id uuid NOT NULL,
    job_id uuid NOT NULL,
    bill_amount numeric(10,2) NOT NULL,
    commission_percentage numeric(5,2) DEFAULT 10.00,
    commission_amount numeric(10,2) NOT NULL,
    payment_status character varying(20) DEFAULT 'PENDING'::character varying,
    payment_date timestamp with time zone,
    payment_method character varying(20),
    payment_reference text,
    notes text,
    paid_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT technician_payments_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['CASH'::character varying, 'BANK_TRANSFER'::character varying, 'UPI'::character varying, 'CHEQUE'::character varying])::text[]))),
    CONSTRAINT technician_payments_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['PENDING'::character varying, 'PAID'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: technicians; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technicians (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    full_name character varying(255) NOT NULL,
    phone character varying(15) NOT NULL,
    email character varying(255) NOT NULL,
    employee_id character varying(50) NOT NULL,
    skills jsonb NOT NULL,
    service_areas jsonb NOT NULL,
    status character varying(20) DEFAULT 'OFFLINE'::character varying,
    current_location jsonb,
    work_schedule jsonb NOT NULL,
    performance jsonb DEFAULT '{"totalJobs": 0, "averageRating": 0, "completedJobs": 0, "onTimePercentage": 0, "customerSatisfaction": 0}'::jsonb,
    vehicle jsonb,
    salary jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    password character varying(255),
    account_status character varying(20) DEFAULT 'ACTIVE'::character varying,
    push_subscription jsonb,
    qr_code text,
    photo text,
    visible_qr_codes jsonb DEFAULT '[]'::jsonb,
    common_qr_code_ids jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT check_account_status CHECK (((account_status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying, 'SUSPENDED'::character varying])::text[]))),
    CONSTRAINT technicians_account_status_check CHECK (((account_status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying, 'SUSPENDED'::character varying])::text[]))),
    CONSTRAINT technicians_status_check CHECK (((status)::text = ANY ((ARRAY['AVAILABLE'::character varying, 'BUSY'::character varying, 'OFFLINE'::character varying, 'ON_BREAK'::character varying])::text[])))
);


--
-- Name: COLUMN technicians.push_subscription; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.technicians.push_subscription IS 'Web Push subscription for PWA notifications (endpoint, keys)';


--
-- Name: COLUMN technicians.visible_qr_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.technicians.visible_qr_codes IS 'Array of QR code IDs visible to this technician. Empty array = none, ["all"] = all, or specific IDs like ["common_123", "technician_456"]';


--
-- Name: COLUMN technicians.common_qr_code_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.technicians.common_qr_code_ids IS 'Array of Common QR ids (technician_common_qr) shown to this technician below payment QR';


--
-- Name: admin_todos admin_todos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_todos
    ADD CONSTRAINT admin_todos_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_email_key UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: amc_contracts amc_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.amc_contracts
    ADD CONSTRAINT amc_contracts_pkey PRIMARY KEY (id);


--
-- Name: business_expenses business_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_expenses
    ADD CONSTRAINT business_expenses_pkey PRIMARY KEY (id);


--
-- Name: call_history call_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_history
    ADD CONSTRAINT call_history_pkey PRIMARY KEY (id);


--
-- Name: common_qr_codes common_qr_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.common_qr_codes
    ADD CONSTRAINT common_qr_codes_pkey PRIMARY KEY (id);


--
-- Name: customers customers_customer_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_customer_id_unique UNIQUE (customer_id);


--
-- Name: customers customers_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_phone_key UNIQUE (phone);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: follow_ups follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_pkey PRIMARY KEY (id);


--
-- Name: inventory_bundle_items inventory_bundle_items_bundle_id_inventory_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_bundle_items
    ADD CONSTRAINT inventory_bundle_items_bundle_id_inventory_id_key UNIQUE (bundle_id, inventory_id);


--
-- Name: inventory_bundle_items inventory_bundle_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_bundle_items
    ADD CONSTRAINT inventory_bundle_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_bundles inventory_bundles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_bundles
    ADD CONSTRAINT inventory_bundles_pkey PRIMARY KEY (id);


--
-- Name: inventory inventory_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_code_key UNIQUE (code);


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);


--
-- Name: job_assignment_requests job_assignment_requests_job_id_technician_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_assignment_requests
    ADD CONSTRAINT job_assignment_requests_job_id_technician_id_key UNIQUE (job_id, technician_id);


--
-- Name: job_assignment_requests job_assignment_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_assignment_requests
    ADD CONSTRAINT job_assignment_requests_pkey PRIMARY KEY (id);


--
-- Name: job_parts_used job_parts_used_job_id_inventory_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_parts_used
    ADD CONSTRAINT job_parts_used_job_id_inventory_id_key UNIQUE (job_id, inventory_id);


--
-- Name: job_parts_used job_parts_used_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_parts_used
    ADD CONSTRAINT job_parts_used_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_job_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_job_number_key UNIQUE (job_number);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: other_expenses other_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.other_expenses
    ADD CONSTRAINT other_expenses_pkey PRIMARY KEY (id);


--
-- Name: parts_inventory parts_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parts_inventory
    ADD CONSTRAINT parts_inventory_pkey PRIMARY KEY (id);


--
-- Name: parts_inventory parts_inventory_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parts_inventory
    ADD CONSTRAINT parts_inventory_sku_key UNIQUE (sku);


--
-- Name: product_qr_codes product_qr_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_qr_codes
    ADD CONSTRAINT product_qr_codes_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: service_areas service_areas_pincode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_areas
    ADD CONSTRAINT service_areas_pincode_key UNIQUE (pincode);


--
-- Name: service_areas service_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_areas
    ADD CONSTRAINT service_areas_pkey PRIMARY KEY (id);


--
-- Name: tax_invoices tax_invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoices
    ADD CONSTRAINT tax_invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: tax_invoices tax_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoices
    ADD CONSTRAINT tax_invoices_pkey PRIMARY KEY (id);


--
-- Name: technician_advances technician_advances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_advances
    ADD CONSTRAINT technician_advances_pkey PRIMARY KEY (id);


--
-- Name: technician_common_qr technician_common_qr_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_common_qr
    ADD CONSTRAINT technician_common_qr_pkey PRIMARY KEY (id);


--
-- Name: technician_expenses technician_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_expenses
    ADD CONSTRAINT technician_expenses_pkey PRIMARY KEY (id);


--
-- Name: technician_extra_commissions technician_extra_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_extra_commissions
    ADD CONSTRAINT technician_extra_commissions_pkey PRIMARY KEY (id);


--
-- Name: technician_holidays technician_holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_holidays
    ADD CONSTRAINT technician_holidays_pkey PRIMARY KEY (id);


--
-- Name: technician_holidays technician_holidays_technician_id_holiday_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_holidays
    ADD CONSTRAINT technician_holidays_technician_id_holiday_date_key UNIQUE (technician_id, holiday_date);


--
-- Name: technician_inventory technician_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_inventory
    ADD CONSTRAINT technician_inventory_pkey PRIMARY KEY (id);


--
-- Name: technician_inventory technician_inventory_technician_id_inventory_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_inventory
    ADD CONSTRAINT technician_inventory_technician_id_inventory_id_key UNIQUE (technician_id, inventory_id);


--
-- Name: technician_payments technician_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_payments
    ADD CONSTRAINT technician_payments_pkey PRIMARY KEY (id);


--
-- Name: technicians technicians_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT technicians_employee_id_key UNIQUE (employee_id);


--
-- Name: technicians technicians_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT technicians_phone_key UNIQUE (phone);


--
-- Name: technicians technicians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT technicians_pkey PRIMARY KEY (id);


--
-- Name: idx_admin_todos_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_todos_created_at ON public.admin_todos USING btree (created_at DESC);


--
-- Name: idx_amc_contracts_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_amc_contracts_customer_id ON public.amc_contracts USING btree (customer_id);


--
-- Name: idx_amc_contracts_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_amc_contracts_end_date ON public.amc_contracts USING btree (end_date);


--
-- Name: idx_amc_contracts_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_amc_contracts_job_id ON public.amc_contracts USING btree (job_id);


--
-- Name: idx_amc_contracts_start_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_amc_contracts_start_date ON public.amc_contracts USING btree (start_date);


--
-- Name: idx_amc_contracts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_amc_contracts_status ON public.amc_contracts USING btree (status);


--
-- Name: idx_business_expenses_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_expenses_category ON public.business_expenses USING btree (category);


--
-- Name: idx_business_expenses_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_expenses_date ON public.business_expenses USING btree (expense_date);


--
-- Name: idx_call_history_contacted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_history_contacted_at ON public.call_history USING btree (contacted_at DESC);


--
-- Name: idx_call_history_customer_contacted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_history_customer_contacted ON public.call_history USING btree (customer_id, contacted_at DESC);


--
-- Name: idx_call_history_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_history_customer_id ON public.call_history USING btree (customer_id);


--
-- Name: idx_common_qr_codes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_common_qr_codes_created_at ON public.common_qr_codes USING btree (created_at);


--
-- Name: idx_customers_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_customer_id ON public.customers USING btree (customer_id);


--
-- Name: idx_customers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_email ON public.customers USING btree (email);


--
-- Name: idx_customers_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);


--
-- Name: idx_customers_service_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_service_type ON public.customers USING btree (service_type);


--
-- Name: idx_customers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_status ON public.customers USING btree (status);


--
-- Name: idx_customers_visible_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_visible_address ON public.customers USING btree (visible_address) WHERE (visible_address IS NOT NULL);


--
-- Name: idx_follow_ups_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_completed ON public.follow_ups USING btree (completed);


--
-- Name: idx_follow_ups_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_date ON public.follow_ups USING btree (follow_up_date);


--
-- Name: idx_follow_ups_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_job_id ON public.follow_ups USING btree (job_id);


--
-- Name: idx_follow_ups_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_parent_id ON public.follow_ups USING btree (parent_follow_up_id);


--
-- Name: idx_inventory_bundle_items_bundle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_bundle_items_bundle_id ON public.inventory_bundle_items USING btree (bundle_id);


--
-- Name: idx_inventory_bundle_items_inventory_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_bundle_items_inventory_id ON public.inventory_bundle_items USING btree (inventory_id);


--
-- Name: idx_inventory_bundles_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_bundles_name ON public.inventory_bundles USING btree (name);


--
-- Name: idx_inventory_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_code ON public.inventory USING btree (code);


--
-- Name: idx_inventory_product_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_product_name ON public.inventory USING btree (product_name);


--
-- Name: idx_job_assignment_requests_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_assignment_requests_job_id ON public.job_assignment_requests USING btree (job_id);


--
-- Name: idx_job_assignment_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_assignment_requests_status ON public.job_assignment_requests USING btree (status);


--
-- Name: idx_job_assignment_requests_technician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_assignment_requests_technician_id ON public.job_assignment_requests USING btree (technician_id);


--
-- Name: idx_job_parts_used_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_parts_used_created_at ON public.job_parts_used USING btree (created_at DESC);


--
-- Name: idx_job_parts_used_inventory_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_parts_used_inventory_id ON public.job_parts_used USING btree (inventory_id);


--
-- Name: idx_job_parts_used_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_parts_used_job_id ON public.job_parts_used USING btree (job_id);


--
-- Name: idx_job_parts_used_technician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_parts_used_technician_id ON public.job_parts_used USING btree (technician_id);


--
-- Name: idx_jobs_completed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_completed_at ON public.jobs USING btree (completed_at) WHERE ((status)::text = 'COMPLETED'::text);


--
-- Name: idx_jobs_completed_end_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_completed_end_time ON public.jobs USING btree (end_time) WHERE ((status)::text = 'COMPLETED'::text);


--
-- Name: idx_jobs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_created_at ON public.jobs USING btree (created_at);


--
-- Name: idx_jobs_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_customer_id ON public.jobs USING btree (customer_id);


--
-- Name: idx_jobs_denied_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_denied_at ON public.jobs USING btree (denied_at) WHERE ((status)::text = 'DENIED'::text);


--
-- Name: idx_jobs_follow_up_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_follow_up_date ON public.jobs USING btree (follow_up_date);


--
-- Name: idx_jobs_job_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_job_number ON public.jobs USING btree (job_number);


--
-- Name: idx_jobs_lead_cost; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_lead_cost ON public.jobs USING btree (lead_cost);


--
-- Name: idx_jobs_scheduled_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_scheduled_date ON public.jobs USING btree (scheduled_date);


--
-- Name: idx_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_status ON public.jobs USING btree (status);


--
-- Name: idx_jobs_status_denied; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_status_denied ON public.jobs USING btree (status) WHERE ((status)::text = 'DENIED'::text);


--
-- Name: idx_jobs_status_follow_up; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_status_follow_up ON public.jobs USING btree (status) WHERE ((status)::text = 'FOLLOW_UP'::text);


--
-- Name: idx_jobs_team_members; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_team_members ON public.jobs USING gin (team_members);


--
-- Name: idx_jobs_technician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_technician_id ON public.jobs USING btree (assigned_technician_id);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_notifications_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_type ON public.notifications USING btree (user_type);


--
-- Name: idx_other_expenses_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_other_expenses_category ON public.other_expenses USING btree (category);


--
-- Name: idx_other_expenses_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_other_expenses_date ON public.other_expenses USING btree (expense_date);


--
-- Name: idx_product_qr_codes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_qr_codes_created_at ON public.product_qr_codes USING btree (created_at);


--
-- Name: idx_reminders_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminders_completed ON public.reminders USING btree (completed_at) WHERE (completed_at IS NULL);


--
-- Name: idx_reminders_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminders_entity ON public.reminders USING btree (entity_type, entity_id);


--
-- Name: idx_reminders_reminder_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminders_reminder_at ON public.reminders USING btree (reminder_at);


--
-- Name: idx_service_areas_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_areas_city ON public.service_areas USING btree (city);


--
-- Name: idx_service_areas_pincode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_areas_pincode ON public.service_areas USING btree (pincode);


--
-- Name: idx_tax_invoices_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_customer_id ON public.tax_invoices USING btree (customer_id);


--
-- Name: idx_tax_invoices_invoice_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_invoice_date ON public.tax_invoices USING btree (invoice_date);


--
-- Name: idx_tax_invoices_invoice_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_invoice_number ON public.tax_invoices USING btree (invoice_number);


--
-- Name: idx_tax_invoices_invoice_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_invoice_type ON public.tax_invoices USING btree (invoice_type);


--
-- Name: idx_technician_advances_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_advances_date ON public.technician_advances USING btree (advance_date);


--
-- Name: idx_technician_advances_technician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_advances_technician_id ON public.technician_advances USING btree (technician_id);


--
-- Name: idx_technician_expenses_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_expenses_date ON public.technician_expenses USING btree (expense_date);


--
-- Name: idx_technician_expenses_technician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_expenses_technician_id ON public.technician_expenses USING btree (technician_id);


--
-- Name: idx_technician_extra_commissions_commission_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_extra_commissions_commission_date ON public.technician_extra_commissions USING btree (commission_date);


--
-- Name: idx_technician_extra_commissions_technician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_extra_commissions_technician_id ON public.technician_extra_commissions USING btree (technician_id);


--
-- Name: idx_technician_holidays_holiday_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_holidays_holiday_date ON public.technician_holidays USING btree (holiday_date);


--
-- Name: idx_technician_holidays_technician_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_holidays_technician_date ON public.technician_holidays USING btree (technician_id, holiday_date);


--
-- Name: idx_technician_holidays_technician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_holidays_technician_id ON public.technician_holidays USING btree (technician_id);


--
-- Name: idx_technician_inventory_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_inventory_created_at ON public.technician_inventory USING btree (created_at DESC);


--
-- Name: idx_technician_inventory_inventory_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_inventory_inventory_id ON public.technician_inventory USING btree (inventory_id);


--
-- Name: idx_technician_inventory_technician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_inventory_technician_id ON public.technician_inventory USING btree (technician_id);


--
-- Name: idx_technician_payments_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_payments_job_id ON public.technician_payments USING btree (job_id);


--
-- Name: idx_technician_payments_payment_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_payments_payment_date ON public.technician_payments USING btree (payment_date);


--
-- Name: idx_technician_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_payments_status ON public.technician_payments USING btree (payment_status);


--
-- Name: idx_technician_payments_technician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technician_payments_technician_id ON public.technician_payments USING btree (technician_id);


--
-- Name: idx_technicians_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technicians_email ON public.technicians USING btree (email);


--
-- Name: idx_technicians_email_password; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technicians_email_password ON public.technicians USING btree (email, password);


--
-- Name: idx_technicians_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technicians_employee_id ON public.technicians USING btree (employee_id);


--
-- Name: idx_technicians_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technicians_phone ON public.technicians USING btree (phone);


--
-- Name: idx_technicians_photo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technicians_photo ON public.technicians USING btree (photo) WHERE (photo IS NOT NULL);


--
-- Name: idx_technicians_push_subscription; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technicians_push_subscription ON public.technicians USING gin (push_subscription) WHERE (push_subscription IS NOT NULL);


--
-- Name: idx_technicians_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technicians_status ON public.technicians USING btree (status);


--
-- Name: job_assignment_requests trigger_cancel_other_requests; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_cancel_other_requests AFTER UPDATE ON public.job_assignment_requests FOR EACH ROW EXECUTE FUNCTION public.cancel_other_assignment_requests();


--
-- Name: jobs trigger_create_technician_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_create_technician_payment AFTER UPDATE OF status ON public.jobs FOR EACH ROW WHEN ((((new.status)::text = 'COMPLETED'::text) AND ((old.status)::text <> 'COMPLETED'::text))) EXECUTE FUNCTION public.create_technician_payment_on_job_completion();


--
-- Name: jobs trigger_remove_follow_ups_on_completion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_remove_follow_ups_on_completion AFTER UPDATE ON public.jobs FOR EACH ROW WHEN ((((new.status)::text = 'COMPLETED'::text) AND ((old.status)::text <> 'COMPLETED'::text))) EXECUTE FUNCTION public.remove_follow_ups_on_completion();


--
-- Name: customers trigger_set_customer_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_set_customer_id BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_customer_id();


--
-- Name: follow_ups trigger_update_follow_ups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_follow_ups_updated_at BEFORE UPDATE ON public.follow_ups FOR EACH ROW EXECUTE FUNCTION public.update_follow_ups_updated_at();


--
-- Name: job_assignment_requests trigger_update_job_assignment_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_job_assignment_requests_updated_at BEFORE UPDATE ON public.job_assignment_requests FOR EACH ROW EXECUTE FUNCTION public.update_job_assignment_requests_updated_at();


--
-- Name: jobs trigger_update_job_completion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_job_completion BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_job_completion_fields();


--
-- Name: admin_users update_admin_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: amc_contracts update_amc_contracts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_amc_contracts_updated_at BEFORE UPDATE ON public.amc_contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: business_expenses update_business_expenses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_business_expenses_updated_at BEFORE UPDATE ON public.business_expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: call_history update_call_history_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_call_history_updated_at BEFORE UPDATE ON public.call_history FOR EACH ROW EXECUTE FUNCTION public.update_call_history_updated_at();


--
-- Name: customers update_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: inventory_bundles update_inventory_bundles_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_inventory_bundles_updated_at_trigger BEFORE UPDATE ON public.inventory_bundles FOR EACH ROW EXECUTE FUNCTION public.update_inventory_bundles_updated_at();


--
-- Name: inventory update_inventory_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_inventory_updated_at_trigger BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_inventory_updated_at();


--
-- Name: jobs update_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: other_expenses update_other_expenses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_other_expenses_updated_at BEFORE UPDATE ON public.other_expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: parts_inventory update_parts_inventory_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_parts_inventory_updated_at BEFORE UPDATE ON public.parts_inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: technician_advances update_technician_advances_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_technician_advances_updated_at BEFORE UPDATE ON public.technician_advances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: technician_expenses update_technician_expenses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_technician_expenses_updated_at BEFORE UPDATE ON public.technician_expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: technician_extra_commissions update_technician_extra_commissions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_technician_extra_commissions_updated_at BEFORE UPDATE ON public.technician_extra_commissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: technician_holidays update_technician_holidays_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_technician_holidays_updated_at BEFORE UPDATE ON public.technician_holidays FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: technician_inventory update_technician_inventory_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_technician_inventory_updated_at_trigger BEFORE UPDATE ON public.technician_inventory FOR EACH ROW EXECUTE FUNCTION public.update_technician_inventory_updated_at();


--
-- Name: technician_payments update_technician_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_technician_payments_updated_at BEFORE UPDATE ON public.technician_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: technicians update_technicians_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_technicians_updated_at BEFORE UPDATE ON public.technicians FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: amc_contracts amc_contracts_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.amc_contracts
    ADD CONSTRAINT amc_contracts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: amc_contracts amc_contracts_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.amc_contracts
    ADD CONSTRAINT amc_contracts_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;


--
-- Name: amc_contracts amc_contracts_renewed_from_amc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.amc_contracts
    ADD CONSTRAINT amc_contracts_renewed_from_amc_id_fkey FOREIGN KEY (renewed_from_amc_id) REFERENCES public.amc_contracts(id);


--
-- Name: call_history call_history_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_history
    ADD CONSTRAINT call_history_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: follow_ups follow_ups_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: follow_ups follow_ups_parent_follow_up_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_parent_follow_up_id_fkey FOREIGN KEY (parent_follow_up_id) REFERENCES public.follow_ups(id) ON DELETE CASCADE;


--
-- Name: inventory_bundle_items inventory_bundle_items_bundle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_bundle_items
    ADD CONSTRAINT inventory_bundle_items_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES public.inventory_bundles(id) ON DELETE CASCADE;


--
-- Name: inventory_bundle_items inventory_bundle_items_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_bundle_items
    ADD CONSTRAINT inventory_bundle_items_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory(id) ON DELETE CASCADE;


--
-- Name: job_assignment_requests job_assignment_requests_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_assignment_requests
    ADD CONSTRAINT job_assignment_requests_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: job_assignment_requests job_assignment_requests_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_assignment_requests
    ADD CONSTRAINT job_assignment_requests_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians(id) ON DELETE CASCADE;


--
-- Name: job_parts_used job_parts_used_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_parts_used
    ADD CONSTRAINT job_parts_used_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory(id) ON DELETE CASCADE;


--
-- Name: job_parts_used job_parts_used_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_parts_used
    ADD CONSTRAINT job_parts_used_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: job_parts_used job_parts_used_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_parts_used
    ADD CONSTRAINT job_parts_used_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians(id) ON DELETE CASCADE;


--
-- Name: jobs jobs_assigned_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_assigned_technician_id_fkey FOREIGN KEY (assigned_technician_id) REFERENCES public.technicians(id) ON DELETE SET NULL;


--
-- Name: jobs jobs_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: tax_invoices tax_invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoices
    ADD CONSTRAINT tax_invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: tax_invoices tax_invoices_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoices
    ADD CONSTRAINT tax_invoices_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;


--
-- Name: technician_advances technician_advances_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_advances
    ADD CONSTRAINT technician_advances_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians(id) ON DELETE CASCADE;


--
-- Name: technician_expenses technician_expenses_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_expenses
    ADD CONSTRAINT technician_expenses_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians(id) ON DELETE CASCADE;


--
-- Name: technician_extra_commissions technician_extra_commissions_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_extra_commissions
    ADD CONSTRAINT technician_extra_commissions_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians(id) ON DELETE CASCADE;


--
-- Name: technician_holidays technician_holidays_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_holidays
    ADD CONSTRAINT technician_holidays_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians(id) ON DELETE CASCADE;


--
-- Name: technician_inventory technician_inventory_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_inventory
    ADD CONSTRAINT technician_inventory_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory(id) ON DELETE CASCADE;


--
-- Name: technician_inventory technician_inventory_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_inventory
    ADD CONSTRAINT technician_inventory_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians(id) ON DELETE CASCADE;


--
-- Name: technician_payments technician_payments_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_payments
    ADD CONSTRAINT technician_payments_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: technician_payments technician_payments_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_payments
    ADD CONSTRAINT technician_payments_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians(id) ON DELETE CASCADE;


--
-- Name: technician_advances Allow all operations on technician_advances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all operations on technician_advances" ON public.technician_advances USING (true) WITH CHECK (true);


--
-- Name: technician_expenses Allow all operations on technician_expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all operations on technician_expenses" ON public.technician_expenses USING (true) WITH CHECK (true);


--
-- Name: common_qr_codes Allow all users to delete common_qr_codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to delete common_qr_codes" ON public.common_qr_codes FOR DELETE USING (true);


--
-- Name: inventory Allow all users to delete inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to delete inventory" ON public.inventory FOR DELETE USING (true);


--
-- Name: inventory_bundle_items Allow all users to delete inventory_bundle_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to delete inventory_bundle_items" ON public.inventory_bundle_items FOR DELETE USING (true);


--
-- Name: inventory_bundles Allow all users to delete inventory_bundles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to delete inventory_bundles" ON public.inventory_bundles FOR DELETE USING (true);


--
-- Name: job_parts_used Allow all users to delete job_parts_used; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to delete job_parts_used" ON public.job_parts_used FOR DELETE USING (true);


--
-- Name: product_qr_codes Allow all users to delete product_qr_codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to delete product_qr_codes" ON public.product_qr_codes FOR DELETE USING (true);


--
-- Name: technician_common_qr Allow all users to delete technician_common_qr; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to delete technician_common_qr" ON public.technician_common_qr FOR DELETE USING (true);


--
-- Name: technician_inventory Allow all users to delete technician_inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to delete technician_inventory" ON public.technician_inventory FOR DELETE USING (true);


--
-- Name: common_qr_codes Allow all users to insert common_qr_codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to insert common_qr_codes" ON public.common_qr_codes FOR INSERT WITH CHECK (true);


--
-- Name: inventory Allow all users to insert inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to insert inventory" ON public.inventory FOR INSERT WITH CHECK (true);


--
-- Name: inventory_bundle_items Allow all users to insert inventory_bundle_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to insert inventory_bundle_items" ON public.inventory_bundle_items FOR INSERT WITH CHECK (true);


--
-- Name: inventory_bundles Allow all users to insert inventory_bundles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to insert inventory_bundles" ON public.inventory_bundles FOR INSERT WITH CHECK (true);


--
-- Name: job_parts_used Allow all users to insert job_parts_used; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to insert job_parts_used" ON public.job_parts_used FOR INSERT WITH CHECK (true);


--
-- Name: product_qr_codes Allow all users to insert product_qr_codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to insert product_qr_codes" ON public.product_qr_codes FOR INSERT WITH CHECK (true);


--
-- Name: tax_invoices Allow all users to insert tax invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to insert tax invoices" ON public.tax_invoices FOR INSERT WITH CHECK (true);


--
-- Name: technician_common_qr Allow all users to insert technician_common_qr; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to insert technician_common_qr" ON public.technician_common_qr FOR INSERT WITH CHECK (true);


--
-- Name: technician_inventory Allow all users to insert technician_inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to insert technician_inventory" ON public.technician_inventory FOR INSERT WITH CHECK (true);


--
-- Name: amc_contracts Allow all users to read amc_contracts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to read amc_contracts" ON public.amc_contracts FOR SELECT USING (true);


--
-- Name: common_qr_codes Allow all users to read common_qr_codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to read common_qr_codes" ON public.common_qr_codes FOR SELECT USING (true);


--
-- Name: inventory Allow all users to read inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to read inventory" ON public.inventory FOR SELECT USING (true);


--
-- Name: inventory_bundle_items Allow all users to read inventory_bundle_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to read inventory_bundle_items" ON public.inventory_bundle_items FOR SELECT USING (true);


--
-- Name: inventory_bundles Allow all users to read inventory_bundles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to read inventory_bundles" ON public.inventory_bundles FOR SELECT USING (true);


--
-- Name: job_parts_used Allow all users to read job_parts_used; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to read job_parts_used" ON public.job_parts_used FOR SELECT USING (true);


--
-- Name: product_qr_codes Allow all users to read product_qr_codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to read product_qr_codes" ON public.product_qr_codes FOR SELECT USING (true);


--
-- Name: tax_invoices Allow all users to read tax invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to read tax invoices" ON public.tax_invoices FOR SELECT USING (true);


--
-- Name: technician_common_qr Allow all users to read technician_common_qr; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to read technician_common_qr" ON public.technician_common_qr FOR SELECT USING (true);


--
-- Name: technician_inventory Allow all users to read technician_inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to read technician_inventory" ON public.technician_inventory FOR SELECT USING (true);


--
-- Name: amc_contracts Allow all users to update amc_contracts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to update amc_contracts" ON public.amc_contracts FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: common_qr_codes Allow all users to update common_qr_codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to update common_qr_codes" ON public.common_qr_codes FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: inventory Allow all users to update inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to update inventory" ON public.inventory FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: inventory_bundle_items Allow all users to update inventory_bundle_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to update inventory_bundle_items" ON public.inventory_bundle_items FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: inventory_bundles Allow all users to update inventory_bundles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to update inventory_bundles" ON public.inventory_bundles FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: job_parts_used Allow all users to update job_parts_used; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to update job_parts_used" ON public.job_parts_used FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: product_qr_codes Allow all users to update product_qr_codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to update product_qr_codes" ON public.product_qr_codes FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: tax_invoices Allow all users to update tax invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to update tax invoices" ON public.tax_invoices FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: technician_common_qr Allow all users to update technician_common_qr; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to update technician_common_qr" ON public.technician_common_qr FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: technician_inventory Allow all users to update technician_inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to update technician_inventory" ON public.technician_inventory FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: reminders Allow anon delete reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anon delete reminders" ON public.reminders FOR DELETE TO anon USING (true);


--
-- Name: reminders Allow anon insert reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anon insert reminders" ON public.reminders FOR INSERT TO anon WITH CHECK (true);


--
-- Name: reminders Allow anon read reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anon read reminders" ON public.reminders FOR SELECT TO anon USING (true);


--
-- Name: reminders Allow anon update reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anon update reminders" ON public.reminders FOR UPDATE TO anon USING (true) WITH CHECK (true);


--
-- Name: customers Allow anonymous to insert customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous to insert customers" ON public.customers FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: reminders Allow authenticated delete reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated delete reminders" ON public.reminders FOR DELETE TO authenticated USING (true);


--
-- Name: reminders Allow authenticated insert reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated insert reminders" ON public.reminders FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: reminders Allow authenticated read reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated read reminders" ON public.reminders FOR SELECT TO authenticated USING (true);


--
-- Name: reminders Allow authenticated update reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated update reminders" ON public.reminders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: amc_contracts Allow all to delete amc_contracts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all to delete amc_contracts" ON public.amc_contracts FOR DELETE USING (true);


--
-- Name: customers Allow authenticated users to delete customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to delete customers" ON public.customers FOR DELETE USING (true);


--
-- Name: tax_invoices Allow authenticated users to delete tax invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to delete tax invoices" ON public.tax_invoices FOR DELETE TO authenticated USING (true);


--
-- Name: technician_extra_commissions Allow authenticated users to delete technician_extra_commission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to delete technician_extra_commission" ON public.technician_extra_commissions FOR DELETE USING (true);


--
-- Name: technician_holidays Allow authenticated users to delete technician_holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to delete technician_holidays" ON public.technician_holidays FOR DELETE USING (true);


--
-- Name: amc_contracts Allow all to insert amc_contracts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all to insert amc_contracts" ON public.amc_contracts FOR INSERT WITH CHECK (true);


--
-- Name: call_history Allow authenticated users to insert call history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to insert call history" ON public.call_history FOR INSERT WITH CHECK ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: technician_extra_commissions Allow authenticated users to insert technician_extra_commission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to insert technician_extra_commission" ON public.technician_extra_commissions FOR INSERT WITH CHECK (true);


--
-- Name: technician_holidays Allow authenticated users to insert technician_holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to insert technician_holidays" ON public.technician_holidays FOR INSERT WITH CHECK (true);


--
-- Name: call_history Allow authenticated users to read call history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to read call history" ON public.call_history FOR SELECT USING ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: parts_inventory Allow authenticated users to read parts inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to read parts inventory" ON public.parts_inventory FOR SELECT USING ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: service_areas Allow authenticated users to read service areas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to read service areas" ON public.service_areas FOR SELECT USING ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: technician_extra_commissions Allow authenticated users to read technician_extra_commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to read technician_extra_commissions" ON public.technician_extra_commissions FOR SELECT USING (true);


--
-- Name: technician_holidays Allow authenticated users to read technician_holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to read technician_holidays" ON public.technician_holidays FOR SELECT USING (true);


--
-- Name: call_history Allow authenticated users to update call history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to update call history" ON public.call_history FOR UPDATE USING ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: parts_inventory Allow authenticated users to update parts inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to update parts inventory" ON public.parts_inventory FOR UPDATE USING ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: technician_extra_commissions Allow authenticated users to update technician_extra_commission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to update technician_extra_commission" ON public.technician_extra_commissions FOR UPDATE USING (true);


--
-- Name: technician_holidays Allow authenticated users to update technician_holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to update technician_holidays" ON public.technician_holidays FOR UPDATE USING (true);


--
-- Name: business_expenses Allow public delete access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public delete access" ON public.business_expenses FOR DELETE USING (true);


--
-- Name: other_expenses Allow public delete access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public delete access" ON public.other_expenses FOR DELETE USING (true);


--
-- Name: business_expenses Allow public insert access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert access" ON public.business_expenses FOR INSERT WITH CHECK (true);


--
-- Name: other_expenses Allow public insert access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert access" ON public.other_expenses FOR INSERT WITH CHECK (true);


--
-- Name: business_expenses Allow public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access" ON public.business_expenses FOR SELECT USING (true);


--
-- Name: other_expenses Allow public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access" ON public.other_expenses FOR SELECT USING (true);


--
-- Name: business_expenses Allow public update access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public update access" ON public.business_expenses FOR UPDATE USING (true);


--
-- Name: other_expenses Allow public update access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public update access" ON public.other_expenses FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: job_assignment_requests Authenticated users can create job assignment requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create job assignment requests" ON public.job_assignment_requests FOR INSERT WITH CHECK ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: job_assignment_requests Authenticated users can delete job assignment requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete job assignment requests" ON public.job_assignment_requests FOR DELETE USING ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: job_assignment_requests Authenticated users can update job assignment requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update job assignment requests" ON public.job_assignment_requests FOR UPDATE USING ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: job_assignment_requests Authenticated users can view job assignment requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view job assignment requests" ON public.job_assignment_requests FOR SELECT USING ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: admin_todos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_todos ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

--
-- Name: jobs allow_all_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_jobs ON public.jobs USING (true) WITH CHECK (true);


--
-- Name: technicians allow_all_technicians; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_technicians ON public.technicians USING (true) WITH CHECK (true);


--
-- Name: amc_contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.amc_contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: business_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: call_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;

--
-- Name: common_qr_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.common_qr_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: customers customers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_select ON public.customers FOR SELECT USING (true);


--
-- Name: customers customers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_update ON public.customers FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: follow_ups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_ups follow_ups_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY follow_ups_delete ON public.follow_ups FOR DELETE USING (((( SELECT auth.role() AS role) = 'authenticated'::text) OR (( SELECT auth.role() AS role) = 'anon'::text) OR (( SELECT auth.uid() AS uid) IS NOT NULL) OR (scheduled_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.jobs
  WHERE ((jobs.id = follow_ups.job_id) AND ((jobs.assigned_technician_id = ( SELECT auth.uid() AS uid)) OR (jobs.assigned_by = ( SELECT auth.uid() AS uid))))))));


--
-- Name: follow_ups follow_ups_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY follow_ups_insert ON public.follow_ups FOR INSERT WITH CHECK (((( SELECT auth.role() AS role) = 'authenticated'::text) OR (( SELECT auth.role() AS role) = 'anon'::text) OR (( SELECT auth.uid() AS uid) IS NOT NULL)));


--
-- Name: follow_ups follow_ups_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY follow_ups_select ON public.follow_ups FOR SELECT USING (((( SELECT auth.role() AS role) = 'authenticated'::text) OR (( SELECT auth.role() AS role) = 'anon'::text) OR (( SELECT auth.uid() AS uid) IS NOT NULL)));


--
-- Name: follow_ups follow_ups_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY follow_ups_update ON public.follow_ups FOR UPDATE USING (((( SELECT auth.role() AS role) = 'authenticated'::text) OR (( SELECT auth.role() AS role) = 'anon'::text) OR (( SELECT auth.uid() AS uid) IS NOT NULL) OR (scheduled_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.jobs
  WHERE ((jobs.id = follow_ups.job_id) AND ((jobs.assigned_technician_id = ( SELECT auth.uid() AS uid)) OR (jobs.assigned_by = ( SELECT auth.uid() AS uid))))))));


--
-- Name: inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_bundle_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_bundle_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_bundles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_bundles ENABLE ROW LEVEL SECURITY;

--
-- Name: job_assignment_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_assignment_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: job_parts_used; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_parts_used ENABLE ROW LEVEL SECURITY;

--
-- Name: jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: other_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.other_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: parts_inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parts_inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: product_qr_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_qr_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: service_areas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: technician_advances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.technician_advances ENABLE ROW LEVEL SECURITY;

--
-- Name: technician_common_qr; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.technician_common_qr ENABLE ROW LEVEL SECURITY;

--
-- Name: technician_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.technician_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: technician_extra_commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.technician_extra_commissions ENABLE ROW LEVEL SECURITY;

--
-- Name: technician_holidays; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.technician_holidays ENABLE ROW LEVEL SECURITY;

--
-- Name: technician_inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.technician_inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: technician_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.technician_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: technician_payments technician_payments_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY technician_payments_delete_policy ON public.technician_payments FOR DELETE USING (true);


--
-- Name: technician_payments technician_payments_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY technician_payments_insert_policy ON public.technician_payments FOR INSERT WITH CHECK (true);


--
-- Name: technician_payments technician_payments_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY technician_payments_select_policy ON public.technician_payments FOR SELECT USING (true);


--
-- Name: technician_payments technician_payments_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY technician_payments_update_policy ON public.technician_payments FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: technicians; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_todos todos_delete_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY todos_delete_anon ON public.admin_todos FOR DELETE TO authenticated, anon USING (true);


--
-- Name: admin_todos todos_insert_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY todos_insert_anon ON public.admin_todos FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: admin_todos todos_select_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY todos_select_anon ON public.admin_todos FOR SELECT TO authenticated, anon USING (true);


--
-- Optional migration: customer tier (premium / worst) — run in Supabase SQL if column missing
--
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_tier character varying(20);
COMMENT ON COLUMN public.customers.customer_tier IS 'PREMIUM = gold name highlight; WORST = red name (bad/problem customer). NULL = normal.';

--
-- PostgreSQL database dump complete
--

\unrestrict D7NUovo1xMTzc7nLETKxTMBxkPnV3bofSBtek1ytHJk2QZhXRFtTaesj118JM1t

