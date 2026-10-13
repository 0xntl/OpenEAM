// Shared viewpoint filter bar (time, level of detail, architecture domain,
// organization unit) used by both the table and diagram landscape views, so
// the two stay in lockstep instead of drifting apart as separate copies.
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ArchitectureDomain, ArchitectureLevel, OrganizationUnit } from '@/lib/entities';
import { SELECT_EMPTY_VALUE } from '@/lib/utils';

export interface LandscapeFilterValues {
  asOf: string;
  architectureLevel: ArchitectureLevel | '';
  architectureDomainId: string;
  organizationUnitId: string;
}

export const EMPTY_LANDSCAPE_FILTERS: LandscapeFilterValues = {
  asOf: '',
  architectureLevel: '',
  architectureDomainId: '',
  organizationUnitId: '',
};

interface LandscapeFiltersProps {
  value: LandscapeFilterValues;
  onChange: (value: LandscapeFilterValues) => void;
  architectureDomains: ArchitectureDomain[];
  organizationUnits: OrganizationUnit[];
  // The diagram view doesn't query architecture building blocks at all, so
  // filtering by architecture level would silently do nothing there.
  hideArchitectureLevel?: boolean;
}

export function LandscapeFilters({
  value,
  onChange,
  architectureDomains,
  organizationUnits,
  hideArchitectureLevel,
}: LandscapeFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <label
        htmlFor="landscape-as-of"
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
      >
        As of
        <Input
          id="landscape-as-of"
          type="date"
          className="w-36"
          value={value.asOf}
          onChange={(e) => onChange({ ...value, asOf: e.target.value })}
        />
      </label>
      {!hideArchitectureLevel && (
        <label
          htmlFor="landscape-level"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          Level
          <Select
            value={value.architectureLevel || SELECT_EMPTY_VALUE}
            onValueChange={(v) =>
              onChange({
                ...value,
                architectureLevel: v === SELECT_EMPTY_VALUE ? '' : (v as ArchitectureLevel),
              })
            }
          >
            <SelectTrigger id="landscape-level" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY_VALUE}>All</SelectItem>
              <SelectItem value="STRATEGIC">Strategic</SelectItem>
              <SelectItem value="SEGMENT">Segment</SelectItem>
              <SelectItem value="CAPABILITY">Capability</SelectItem>
            </SelectContent>
          </Select>
        </label>
      )}
      <label
        htmlFor="landscape-domain"
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
      >
        Domain
        <Select
          value={value.architectureDomainId || SELECT_EMPTY_VALUE}
          onValueChange={(v) =>
            onChange({ ...value, architectureDomainId: v === SELECT_EMPTY_VALUE ? '' : v })
          }
        >
          <SelectTrigger id="landscape-domain" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_EMPTY_VALUE}>All</SelectItem>
            {architectureDomains.map((domain) => (
              <SelectItem key={domain.id} value={domain.id}>
                {domain.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label
        htmlFor="landscape-org-unit"
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
      >
        Organization unit
        <Select
          value={value.organizationUnitId || SELECT_EMPTY_VALUE}
          onValueChange={(v) =>
            onChange({ ...value, organizationUnitId: v === SELECT_EMPTY_VALUE ? '' : v })
          }
        >
          <SelectTrigger id="landscape-org-unit" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_EMPTY_VALUE}>All</SelectItem>
            {organizationUnits.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>
                {unit.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    </div>
  );
}
