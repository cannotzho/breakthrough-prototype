/** Info Nuggets (v1.4 §3.9) — abstract world knowledge. */
import type { InfoNugget } from '../engine';

export const NUGGETS: Record<string, InfoNugget> = {
  warehouse_activity: {
    id: 'warehouse_activity',
    name: 'Warehouse Activity',
    description: 'Something moved through the riverside warehouse after hours — and the informant knows it.',
  },
  personal_troubles: {
    id: 'personal_troubles',
    name: 'Personal Troubles',
    description: 'The informant’s hesitation is personal, not professional.',
  },
  witnessed_incident: {
    id: 'witnessed_incident',
    name: 'The Witnessed Incident',
    description: 'The informant saw the incident happen — and is afraid to say so.',
  },
  fcp_fan_letters: {
    id: 'fcp_fan_letters',
    name: 'The Unsent Letters',
    description: 'The fan club president wrote to the idol daily. None of the letters were ever sent.',
  },
  fcp_idol_schedule: {
    id: 'fcp_idol_schedule',
    name: 'The Annotated Schedule',
    description: 'Someone tracked the idol’s movements far too precisely for an ordinary fan.',
  },
  fcp_passcode_knowledge: {
    id: 'fcp_passcode_knowledge',
    name: 'Backstage Passcode',
    description: 'The president knew the backstage door code the night of the incident.',
  },
  fcp_physical_traces: {
    id: 'fcp_physical_traces',
    name: 'Physical Traces',
    description: 'Physical evidence places a fan-club jacket backstage.',
  },
  fcp_witness_statements: {
    id: 'fcp_witness_statements',
    name: 'Witness Statements',
    description: 'Multiple witnesses put the fan club president at the scene.',
  },
};
