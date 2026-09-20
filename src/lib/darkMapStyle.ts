/** Soft slate night map — grey, not void black. Classic `styles` (no cloud map ID). */
export const DARK_DISPATCH_BG = '#3d4248';

export const DARK_DISPATCH_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: DARK_DISPATCH_BG }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d0d3d6' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#32363c' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#4a5058' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#eceef0' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#3f4840' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#555c64' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#32363c' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#6a717a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#32363c' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f2f3f4' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#5e656e' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#e4e6e8' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#5a6169' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#c8ccd0' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#4a525a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#b0b6bc' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ visibility: 'off' }] },
];
