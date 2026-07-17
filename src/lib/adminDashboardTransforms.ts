import { normalizeCustomerAddress } from '@/lib/customer-address';
import { mapCustomerGstFields } from '@/lib/customerGst';
import type { Customer } from '@/types';

export function transformTechnicianData(tech: any) {
  return {
    id: tech.id,
    fullName: tech.full_name,
    phone: tech.phone,
    email: tech.email,
    employeeId: tech.employee_id,
    status: tech.status || 'AVAILABLE',
    account_status: tech.account_status || 'ACTIVE',
    push_notifications_enabled: tech.push_notifications_enabled !== false,
    skills: tech.skills,
    serviceAreas: tech.service_areas,
    currentLocation: tech.current_location,
    workSchedule: tech.work_schedule,
    performance: tech.performance,
    vehicle: tech.vehicle,
    salary: tech.salary,
    qrCode: tech.qr_code || tech.qrCode || '',
    photo: typeof tech.photo === 'string' && tech.photo.trim() ? tech.photo.trim() : undefined,
    createdAt: tech.created_at,
    updatedAt: tech.updated_at,
  };
}

export function transformCustomerData(customer: any): Customer {
  return {
    id: customer.id,
    customerId: customer.customer_id,
    fullName: customer.full_name,
    phone: customer.phone,
    alternatePhone: customer.alternate_phone,
    email: customer.email,
    address: (() => {
      const normalized = normalizeCustomerAddress(customer.address, {
        visible_address: customer.visible_address || customer.address?.visible_address,
        formattedAddress: customer.location?.formatted_address || customer.location?.formattedAddress,
      });
      return {
        ...normalized,
        visible_address:
          normalized.visible_address ||
          customer.visible_address ||
          customer.address?.visible_address ||
          '',
      };
    })(),
    location: {
      latitude: customer.location?.latitude || 0,
      longitude: customer.location?.longitude || 0,
      formattedAddress: customer.location?.formatted_address || customer.location?.formattedAddress || '',
      googlePlaceId: customer.location?.google_place_id,
      googleLocation: customer.location?.googleLocation || customer.location?.google_location || null,
    } as any,
    alternateAddress: customer.alternate_address ?? undefined,
    alternate_address: customer.alternate_address ?? undefined,
    alternateLocation: customer.alternate_location
      ? {
          latitude: customer.alternate_location?.latitude || 0,
          longitude: customer.alternate_location?.longitude || 0,
          formattedAddress:
            customer.alternate_location?.formatted_address ||
            customer.alternate_location?.formattedAddress ||
            '',
          googlePlaceId: customer.alternate_location?.google_place_id,
          googleLocation:
            customer.alternate_location?.googleLocation ||
            customer.alternate_location?.google_location ||
            null,
        }
      : undefined,
    alternate_location: customer.alternate_location ?? undefined,
    alternateVisibleAddress: customer.alternate_visible_address ?? undefined,
    alternate_visible_address: customer.alternate_visible_address ?? undefined,
    alternateBrand: customer.alternate_brand ?? undefined,
    alternate_brand: customer.alternate_brand ?? undefined,
    alternateModel: customer.alternate_model ?? undefined,
    alternate_model: customer.alternate_model ?? undefined,
    alternateServiceType: customer.alternate_service_type ?? undefined,
    alternate_service_type: customer.alternate_service_type ?? undefined,
    serviceType: customer.service_type,
    brand: customer.brand,
    model: customer.model,
    installationDate: customer.installation_date,
    warrantyExpiry: customer.warranty_expiry,
    status: customer.status,
    customerSince: customer.customer_since,
    lastServiceDate: customer.last_service_date,
    notes: customer.notes,
    preferredTimeSlot: customer.preferred_time_slot,
    customTime: (customer as any).custom_time || null,
    preferredLanguage: customer.preferred_language,
    serviceCost: customer.service_cost,
    costAgreed: customer.cost_agreed,
    has_prefilter: customer.has_prefilter ?? null,
    has_google_review: customer.has_google_review ?? null,
    customer_tier: (customer as any).customer_tier ?? null,
    raw_water_tds: (customer as any).raw_water_tds ?? 0,
    ...mapCustomerGstFields(customer),
    createdAt: customer.created_at,
    updatedAt: customer.updated_at,
  };
}
