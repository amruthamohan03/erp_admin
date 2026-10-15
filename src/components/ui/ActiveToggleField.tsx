import Toggle from '@/components/ui/Toggle';

// The Active switch in a master's create / edit form. Saved as the row's
// `display` flag ('Y' / 'N'), the same one the list's Status column flips.
export default function ActiveToggleField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (active: boolean) => void;
}) {
  return (
    <div>
      <Toggle checked={checked} onChange={onChange} label="Active" />
      <p className="mt-1 text-xs text-muted-foreground">
        A disabled record stays in this list but is hidden from every dropdown.
      </p>
    </div>
  );
}
