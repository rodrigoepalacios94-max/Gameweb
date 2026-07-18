import { Search } from "lucide-react";

export function SearchInput({ value, onChange, placeholder = "Buscar" }) {
  return (
    <label className="search-input">
      <Search size={18} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}
