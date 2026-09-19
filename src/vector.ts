export interface Position {
  x: number;
  y: number;
  z: number;
}

export function formatPosition(position: Position): string {
  return `(${formatCoordinate(position.x)}, ${formatCoordinate(position.y)}, ${formatCoordinate(position.z)})`;
}

function formatCoordinate(value: number): string {
  const quadrupled = value * 4;
  if (Number.isInteger(quadrupled) && Math.abs(quadrupled % 2) === 1) {
    const tenths = Math.trunc(value * 10);
    const rounded = tenths % 2 === 0 ? tenths : tenths + (value > 0 ? 1 : -1);
    return (rounded / 10).toFixed(1);
  }
  return value.toFixed(1);
}
