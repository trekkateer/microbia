import { species } from '../../data';

export function createSpeciesIcon(speciesId?: string): SVGSVGElement {
  const definition = speciesId ? species[speciesId] : undefined;
  const shape = definition?.visual.shape;
  const ns = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(ns, 'svg');
  icon.classList.add('species-icon'); icon.setAttribute('viewBox', '0 0 28 28');
  icon.setAttribute('aria-hidden', 'true'); icon.dataset.shape = shape ?? 'unknown';
  const title = document.createElementNS(ns, 'title'); title.textContent = definition?.scientificName ?? 'Unknown species'; icon.append(title);
  const stroke = '#' + (definition?.visual.membrane ?? 0xdbe6d4).toString(16).padStart(6, '0');
  const fill = '#' + (definition?.visual.body ?? 0x72877b).toString(16).padStart(6, '0');
  const draw = (tag: string, attributes: Record<string, string>) => {
    const element = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    icon.append(element); return element;
  };
  const body = { fill, 'fill-opacity': '0.65', stroke, 'stroke-width': '1.3' };
  if (shape === 'amoeboid') draw('path', { d: 'M5 13C0 8 8 3 12 6S20 2 23 8S21 14 24 19S15 26 12 22S1 23 5 17Z', ...body });
  else if (shape === 'slipper') {
    draw('path', { d: 'M6 7C13 0 24 5 23 12S18 25 10 23S0 14 6 7Z', ...body });
    draw('path', { d: 'M7 5L5 2M13 3V0M20 5L23 2M24 11L27 10M23 18L26 20M16 24L17 27M8 24L6 27M3 17L0 18M3 10L0 9', fill: 'none', stroke, 'stroke-width': '1' });
  } else if (shape === 'barrel') {
    draw('path', { d: 'M7 6Q14 3 20 7L22 18Q15 25 7 21Q3 14 7 6Z', ...body });
    draw('path', { d: 'M5 10Q14 13 22 10M5 17Q14 20 22 16M20 10L27 12L21 15', stroke, fill: 'none', 'stroke-width': '1.2' });
  } else if (shape === 'flagellate') {
    draw('path', { d: 'M5 23Q0 9 18 4Q28 14 5 23Z', ...body });
    draw('path', { d: 'M18 4Q20 0 24 3T27 1', stroke, fill: 'none', 'stroke-width': '1' });
    draw('circle', { cx: '17', cy: '8', r: '1.6', fill: '#ed8e69' });
  } else if (shape === 'diatom') {
    draw('path', { d: 'M2 14Q14 1 26 14Q14 27 2 14Z', ...body });
    draw('path', { d: 'M3 14H25M9 9V19M14 7V21M19 9V19', stroke, fill: 'none', 'stroke-width': '0.9' });
  } else draw('circle', { cx: '14', cy: '14', r: '10', ...body });
  if (shape !== 'diatom') draw('ellipse', { cx: '12', cy: '14', rx: '3', ry: '2.4', fill: stroke, 'fill-opacity': '0.9' });
  return icon;
}
