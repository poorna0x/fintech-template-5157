/** Shared AMC agreement terms text (used by generator + technician reference PDF). */
export function generateAmcTerms(
  includesPreFilter: boolean,
  periodKind: '4' | '6' | 'custom' | 'no_auto',
  periodCustomMonths: number
): string {
  const servicePeriodMonths =
    periodKind === 'no_auto'
      ? 0
      : periodKind === '4'
        ? 4
        : periodKind === '6'
          ? 6
          : Math.max(1, periodCustomMonths);

  let scheduledMaintenanceLine = '';
  let routineFromLastVisitLine = '';
  if (servicePeriodMonths === 0) {
    scheduledMaintenanceLine =
      'Scheduled maintenance: Routine visits are planned together with you when it suits—there is no fixed automatic visit calendar tied to this agreement.';
  } else if (servicePeriodMonths === 1) {
    scheduledMaintenanceLine =
      'Scheduled maintenance: We usually aim for a routine service visit about once a month or so (we may nudge the date a little to line up with you and keep your purifier happy).';
    routineFromLastVisitLine =
      'Routine service timing: Each routine visit is planned about once a month from your last completed service visit (not from the agreement start date alone); we may adjust slightly to suit your schedule.';
  } else if (servicePeriodMonths === 12) {
    scheduledMaintenanceLine =
      'Scheduled maintenance: We usually aim for a routine service visit about once a year—roughly every twelve months or so—with a bit of flexibility so we can coordinate with you.';
    routineFromLastVisitLine =
      'Routine service timing: Each routine visit is planned about every twelve months from your last completed service visit (not from the agreement start date alone); we may adjust slightly to suit your schedule.';
  } else {
    scheduledMaintenanceLine = `Scheduled maintenance: We usually aim for a routine service visit about every ${servicePeriodMonths} months or so (timings may shift slightly so we can work with your schedule and keep things running smoothly).`;
    routineFromLastVisitLine = `Routine service timing: Each routine visit is planned about every ${servicePeriodMonths} months from your last completed service visit (not from the agreement start date alone); we may adjust slightly to suit your schedule.`;
  }

  const servicesCovered = `SERVICES COVERED BY THE AGREEMENT

Breakdown Support: If any breakdown or problem happens with the RO during the AMC period, the company will provide service without extra charges.

Filters / RO Membrane / Consumables / Electricals / Motor: Company will clean, repair, or replace filters and parts needed for smooth working.

Safe RO output: Water quality TDS between 50 to 150, as per WHO guidelines or as per customer preference.

Clean cosmetics and smooth working of the machine.

Quick service: Any breakdown will be resolved within 24 hours on weekdays and within 48 hours on weekends.

Full Care of RO: The company takes responsibility for complete maintenance and support during the AMC period.`;

  const servicesCoveredWithPreFilter = `${servicesCovered}

Includes pre-sediment filtration maintenance and servicing.`;

  const termsAndConditions = `⚖️ TERMS AND CONDITIONS

No Early Termination: You cannot cancel this agreement before expiry. It also cannot be transferred to another person if you sell/gift the machine.

Extra Charges: If service is outside municipal limits, extra charges for travel/stay will apply.

Disputes: Any legal disputes will be handled only in Bangalore courts.

Parts Availability: Replacement of parts is subject to market availability. If specific spare parts are unavailable or discontinued, equivalent alternatives may be used.

Service Timelines: Service timelines are approximate and may vary due to workload, weather, traffic, festivals, emergencies, or operational reasons.

Limitation of Liability: The company shall not be held liable for failure or delay in providing services due to business closure, financial difficulties, natural calamities, supplier issues, government restrictions, strikes, pandemics, acts beyond reasonable control, or discontinuation of operations.

${scheduledMaintenanceLine}
${routineFromLastVisitLine ? `\n\n${routineFromLastVisitLine}` : ''}

Renewal: After expiry, renewal requires a new agreement.

Customer's Duty: The customer must make the RO available for servicing when the company's authorized representative visits.

If the customer fails to give the machine for servicing, it will still be treated as service given, and no refund will be made.

Agreement Modification: Cannot be changed unless written and signed by both parties.`;

  const notCoveredStructural =
    'Exclusions: This agreement does not cover the purifier display or indicator lights, the dispenser tap, the outer housing or cabinet, the storage tank, or the pre-sediment filter housing.';

  const notCoveredWithPreFilter = includesPreFilter
    ? notCoveredStructural
    : `${notCoveredStructural} Pre-sediment filtration is excluded unless it is expressly listed under Services covered above.`;

  const finalServicesCovered = includesPreFilter ? servicesCoveredWithPreFilter : servicesCovered;

  return `${finalServicesCovered}

${termsAndConditions}

${notCoveredWithPreFilter}`;
}
