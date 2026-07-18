import { getInitials } from "../../utils/formatters";

export function Avatar({ src, name, size = "md" }) {
  return src ? (
    <img className={`avatar avatar--${size}`} src={src} alt={name} />
  ) : (
    <span className={`avatar avatar--${size} avatar--fallback`}>{getInitials(name)}</span>
  );
}
