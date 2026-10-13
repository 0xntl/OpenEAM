// The one way to draw a model icon in React (D-22): give it the Iconify id
// stored on the row and a pixel size. Without an id, or while the icon is
// loading, or if the id names something this instance cannot serve (a
// brand Simple Icons has since dropped, the endpoint unreachable), it shows
// Lucide's box instead, so a list never has a hole in it and a bad id is
// visible rather than invisible.
import { Icon } from '@iconify/react';
import { Box } from 'lucide-react';
import { iconScale } from '@/lib/icons';
import { cn } from '@/lib/utils';

export function ModelIcon({
  id,
  label,
  size = 16,
  className,
}: {
  id?: string | null;
  // Spoken name for assistive tech; without one the icon is decorative.
  label?: string;
  size?: number;
  className?: string;
}) {
  const fallback = (
    <Box
      aria-hidden
      className="shrink-0 text-muted-foreground"
      style={{ width: size, height: size }}
    />
  );
  const px = id ? Math.round(size * iconScale(id)) : size;
  const content = id ? <Icon icon={id} width={px} height={px} fallback={fallback} /> : fallback;
  const boxClassName = cn('inline-flex shrink-0 items-center justify-center', className);
  const boxStyle = { width: size, height: size };

  return label ? (
    <span role="img" aria-label={label} className={boxClassName} style={boxStyle}>
      {content}
    </span>
  ) : (
    <span aria-hidden className={boxClassName} style={boxStyle}>
      {content}
    </span>
  );
}
