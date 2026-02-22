// All England Dance 2025-26 season — known event templates
// Qualifiers are entered manually (dynamic map on the AED site, can't be scraped).
// Regional Finals & National Final dates + venues sourced from:
//   https://all-england-dance.org.uk/competitions/finals/

export const AED_EVENT_TYPES = [
  { value: 'qualifier', label: 'AED Qualifier', icon: '🎪' },
  { value: 'regional-final', label: 'AED Regional Final', icon: '🏅' },
  { value: 'national-final', label: 'AED National Final', icon: '🏆' },
]

export const AED_REGIONAL_FINALS = [
  {
    name: 'AED East Regional Final',
    region: 'east',
    venue: 'Gordon Craig Theatre, Stevenage',
    startDate: '2026-05-23',
    endDate: '2026-05-31',
  },
  {
    name: 'AED Home Counties Regional Final',
    region: 'home-counties',
    venue: 'Berkhamsted School, Berkhamsted',
    startDate: '2026-05-23',
    endDate: '2026-05-31',
  },
  {
    name: 'AED Midlands Regional Final',
    region: 'midlands',
    venue: 'Warwick School, Warwick',
    startDate: '2026-05-23',
    endDate: '2026-05-29',
  },
  {
    name: 'AED North Regional Final',
    region: 'north',
    venue: 'Middleton Arena, Manchester',
    startDate: '2026-05-23',
    endDate: '2026-05-29',
  },
  {
    name: 'AED South Regional Final',
    region: 'south',
    venue: 'Fareham Live, Fareham',
    startDate: '2026-05-23',
    endDate: '2026-05-31',
  },
  {
    name: 'AED South East Regional Final',
    region: 'south-east',
    venue: 'The Hawth, Crawley',
    startDate: '2026-05-23',
    endDate: '2026-05-31',
  },
  {
    name: 'AED West Regional Final',
    region: 'west',
    venue: 'Bacon Theatre, Cheltenham',
    startDate: '2026-05-23',
    endDate: '2026-05-31',
  },
]

export const AED_NATIONAL_FINAL = {
  name: 'AED National Final',
  region: 'national',
  venue: 'Winter Garden & Congress Theatre, Eastbourne',
  startDate: '2026-07-25',
  endDate: '2026-08-02',
}

// All AED templates in one flat list for quick-pick UI
export const AED_TEMPLATES = [
  ...AED_REGIONAL_FINALS.map((f) => ({
    ...f,
    eventType: 'regional-final',
    competitionOrg: 'aed',
  })),
  {
    ...AED_NATIONAL_FINAL,
    eventType: 'national-final',
    competitionOrg: 'aed',
  },
]

// Generic event type options (non-AED)
export const EVENT_TYPES = [
  { value: 'show', label: 'Show / Performance', icon: '🎭' },
  { value: 'exam', label: 'Exam', icon: '🎓' },
  { value: 'qualifier', label: 'AED Qualifier', icon: '🎪' },
  { value: 'regional-final', label: 'AED Regional Final', icon: '🏅' },
  { value: 'national-final', label: 'AED National Final', icon: '🏆' },
  { value: 'festival', label: 'Festival', icon: '🎉' },
]

export function getEventTypeIcon(eventType) {
  switch (eventType) {
    case 'qualifier': return '🎪'
    case 'regional-final': return '🏅'
    case 'national-final': return '🏆'
    case 'exam': return '🎓'
    case 'festival': return '🎉'
    case 'show':
    default: return '🎭'
  }
}

export function getEventTypeLabel(eventType) {
  const found = EVENT_TYPES.find((t) => t.value === eventType)
  return found?.label || 'Event'
}
