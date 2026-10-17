import { SelectGroup, SelectItem, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { COMING_SOON_CATEGORIES, COSMETICS_CATEGORIES } from "@/lib/categories";

// The category options for the early-access form and the lead-capture
// dialog: cosmetics first, then the categories marked "Coming soon".
const LeadCategoryOptions = () => (
  <>
    <SelectGroup>
      <SelectLabel>Cosmetics</SelectLabel>
      {COSMETICS_CATEGORIES.map((c) => (
        <SelectItem key={c} value={c}>
          {c}
        </SelectItem>
      ))}
    </SelectGroup>
    <SelectSeparator />
    <SelectGroup>
      <SelectLabel>Coming soon</SelectLabel>
      {COMING_SOON_CATEGORIES.map((c) => (
        <SelectItem key={c} value={c}>
          {c}
        </SelectItem>
      ))}
    </SelectGroup>
    <SelectSeparator />
    <SelectItem value="Other">Other</SelectItem>
  </>
);

export default LeadCategoryOptions;
